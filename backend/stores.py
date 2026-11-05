"""
History Store — Persistent interview session storage.
Saves interview rounds to a JSON file for the dashboard history section.
"""

import logging
import time
from typing import Optional

import docstore
import users

logger = logging.getLogger("vettly.history")


class HistoryStore:
    """Interview rounds, one document per user."""

    def __init__(self, user: Optional[str] = None):
        self._user = user or users.user_id()
        self._sessions: list[dict] = []
        self.load()

    def load(self) -> None:
        self._sessions = docstore.load(self._user, "history", [])

    def save(self) -> None:
        docstore.save(self._user, "history", self._sessions)

    def add_session(self, session: dict) -> dict:
        """Add a new interview session (delegates to upsert_session for deduplication)."""
        return self.upsert_session(session)

    def upsert_session(self, session: dict) -> dict:
        """Add or update an existing interview session by ID or content deduplication."""
        session_id = session.get("id")
        entries = session.get("entries", [])
        entry = {
            "id": session_id if session_id is not None else int(time.time() * 1000),
            "timestamp": session.get("timestamp", ""),
            "entries": entries,
            "round_count": len(entries),
        }

        # 1. Check if already in history by ID
        if session_id is not None:
            for idx, s in enumerate(self._sessions):
                if str(s.get("id")) == str(session_id):
                    self._sessions[idx] = entry
                    self.save()
                    logger.info(f"📦 Session {session_id} updated: {entry['round_count']} entries")
                    return entry

        # 2. Content-based deduplication:
        # If an existing recent session contains identical questions/answers, update it rather than creating a duplicate
        if entries:
            def _entry_key(e):
                q = (e.get("question") or "").strip().lower()
                a = (e.get("answer") or "").strip()[:80]
                return (q, a)

            incoming_keys = [_entry_key(e) for e in entries]
            for idx in range(len(self._sessions) - 1, max(-1, len(self._sessions) - 6), -1):
                s = self._sessions[idx]
                s_keys = [_entry_key(e) for e in s.get("entries", [])]
                if incoming_keys == s_keys:
                    logger.info(f"🛡️ Deduplicated session matching content of existing session {s.get('id')}")
                    s["entries"] = entries
                    s["round_count"] = len(entries)
                    if session.get("timestamp"):
                        s["timestamp"] = session.get("timestamp")
                    self.save()
                    return s

        # Otherwise add as new
        self._sessions.append(entry)
        self.save()
        logger.info(f"📦 Session {entry['id']} created: {entry['round_count']} entries")
        return entry

    def get_all(self) -> list[dict]:
        """Get all sessions, reloaded for freshness."""
        self.load()
        return self._sessions

    def get_session(self, session_id) -> Optional[dict]:
        """Get a specific session by ID."""
        for s in self._sessions:
            if str(s.get("id")) == str(session_id):
                return s
        return None

    def delete_session(self, session_id) -> bool:
        """Delete a session by ID (supports int or str)."""
        before = len(self._sessions)
        self._sessions = [s for s in self._sessions if str(s.get("id")) != str(session_id)]
        if len(self._sessions) < before:
            self.save()
            logger.info(f"🗑️ Session {session_id} deleted")
            return True
        return False

    def clear(self) -> None:
        """Clear all history."""
        self._sessions = []
        self.save()
        logger.info("🗑️ All history cleared")

    @property
    def count(self) -> int:
        return len(self._sessions)
"""
About Me Store — Personal intro and facts storage.
Stores "tell me about yourself" answer and custom facts for the AI.
"""


class AboutMeStore:
    """Persists personal intro data for interview context."""

    def __init__(self, user: Optional[str] = None):
        self._user = user or users.user_id()
        self._data: dict = {}
        self.load()

    def load(self) -> None:
        self._data = docstore.load(self._user, "about_me", {})

    def save(self) -> None:
        docstore.save(self._user, "about_me", self._data)

    def set_data(self, data: dict) -> None:
        """Set about-me data. Expected keys: intro, facts, tell_me_about_yourself"""
        self._data = data
        self.save()
        logger.info(f"👤 About-me data updated: {list(data.keys())}")

    def get_data(self) -> dict:
        """Get about-me data."""
        return self._data

    def get_intro_context(self) -> str:
        """Format about-me data as context for AI prompts."""
        if not self._data:
            return ""

        parts = []
        if self._data.get("tell_me_about_yourself"):
            parts.append(f"TELL ME ABOUT YOURSELF (preferred answer):\n{self._data['tell_me_about_yourself']}")
        if self._data.get("intro"):
            parts.append(f"PERSONAL INTRO: {self._data['intro']}")
        if self._data.get("facts"):
            facts = self._data["facts"]
            if isinstance(facts, list):
                facts_text = "\n".join(f"  - {f}" for f in facts)
                parts.append(f"PERSONAL FACTS:\n{facts_text}")
            elif isinstance(facts, str):
                parts.append(f"PERSONAL FACTS: {facts}")
        if self._data.get("hobbies"):
            parts.append(f"HOBBIES/INTERESTS: {self._data['hobbies']}")
        if self._data.get("strengths"):
            parts.append(f"KEY STRENGTHS: {self._data['strengths']}")
        if self._data.get("weaknesses"):
            parts.append(f"WEAKNESSES (honest): {self._data['weaknesses']}")

        return "\n\n".join(parts)

# ─── Chat History Store ──────────────────────────────────────

class ChatHistoryStore:
    """
    The Live Copilot's register: chapters, each its own conversation, with archive and time spent.
    The *open* chapter is what get_history / add_message / set_history / clear act on, so the chat routes
    work unchanged. One document per user ("chapters"); an older single "chat_history" becomes Chapter 1.
    """

    def __init__(self, user: Optional[str] = None):
        self._user = user or users.user_id()
        self.load()

    # ── storage ──
    @staticmethod
    def _now() -> str:
        from datetime import datetime, timezone
        return datetime.now(timezone.utc).isoformat(timespec="seconds")

    def _blank(self, messages: Optional[list] = None) -> dict:
        import time
        now = self._now()
        return {"id": f"ch_{int(time.time() * 1000)}", "title": "", "created": now, "updated": now,
                "archived": False, "elapsed_ms": 0, "messages": list(messages or [])}

    def load(self) -> None:
        doc = docstore.load(self._user, "chapters", None)
        fresh = not isinstance(doc, dict) or not isinstance(doc.get("items"), list)
        if fresh:
            old = docstore.load(self._user, "chat_history", [])
            first = self._blank(old if isinstance(old, list) else [])
            doc = {"open": first["id"], "items": [first]}
        self._doc = doc
        if fresh:   # saved at once: every request builds its own store, and they must all see this same first chapter
            self.save()
        if not self._find(doc.get("open")):
            self._doc["open"] = self._doc["items"][0]["id"] if self._doc["items"] else self._new()["id"]

    def save(self) -> None:
        docstore.save(self._user, "chapters", self._doc)

    def _find(self, cid) -> Optional[dict]:
        return next((c for c in self._doc["items"] if c["id"] == cid), None)

    def _new(self, messages: Optional[list] = None) -> dict:
        ch = self._blank(messages)
        while self._find(ch["id"]):   # two chapters in one millisecond
            ch["id"] += "x"
        self._doc["items"].append(ch)
        self._doc["open"] = ch["id"]
        return ch

    def _open(self) -> dict:
        return self._find(self._doc["open"]) or self._new()

    @staticmethod
    def meta(ch: dict, number: int) -> dict:
        msgs = ch.get("messages", [])
        first_q = next((m.get("content", "") for m in msgs if m.get("role") == "user"), "")
        return {"id": ch["id"], "number": number, "title": ch.get("title") or "", "auto_title": " ".join(first_q.split()[:7]),
                "created": ch.get("created"), "updated": ch.get("updated"), "archived": bool(ch.get("archived")),
                "elapsed_ms": int(ch.get("elapsed_ms") or 0), "count": len(msgs)}

    # ── the open chapter (what the chat routes use) ──
    def get_history(self) -> list[dict]:
        return self._open()["messages"]

    def add_message(self, role: str, content: str, **extra) -> None:
        ch = self._open()
        msg = {"role": role, "content": content, "ts": self._now()}
        msg.update({k: v for k, v in extra.items() if v is not None})
        ch["messages"].append(msg)
        ch["updated"] = msg["ts"]
        self.save()

    def set_history(self, history: list[dict]) -> None:
        ch = self._open()
        ch["messages"] = [m for m in history if isinstance(m, dict) and m.get("role") in ("user", "assistant")]
        ch["updated"] = self._now()
        self.save()

    def clear(self) -> None:
        self._open()["messages"] = []
        self.save()
        logger.info("🗑️ Chat chapter cleared")

    # ── chapters ──
    def chapters(self) -> dict:
        order = {c["id"]: i + 1 for i, c in enumerate(self._doc["items"])}   # numbered in the order they were begun
        items = sorted(self._doc["items"], key=lambda c: c.get("updated") or "", reverse=True)
        return {"open": self._doc["open"], "chapters": [self.meta(c, order[c["id"]]) for c in items]}

    def full(self, cid: str) -> Optional[dict]:
        ch = self._find(cid)
        if not ch:
            return None
        number = self._doc["items"].index(ch) + 1
        return {**self.meta(ch, number), "messages": ch["messages"]}

    def create(self, title: str = "") -> dict:
        # an untouched open chapter is reused instead of piling up empty pages
        cur = self._find(self._doc["open"])
        ch = cur if cur and not cur["messages"] and not cur.get("archived") else self._new()
        ch["title"] = title.strip()[:80]
        self._doc["open"] = ch["id"]
        self.save()
        return self.full(ch["id"])

    def open_chapter(self, cid: str) -> Optional[dict]:
        ch = self._find(cid)
        if not ch:
            return None
        if self._doc["open"] != cid:   # already open: nothing to write
            self._doc["open"] = cid
            self.save()
        return self.full(cid)

    def update(self, cid: str, data: dict) -> Optional[dict]:
        ch = self._find(cid)
        if not ch:
            return None
        if isinstance(data.get("title"), str):
            ch["title"] = data["title"].strip()[:80]
        if isinstance(data.get("archived"), bool):
            ch["archived"] = data["archived"]
        if isinstance(data.get("elapsed_ms"), (int, float)) and data["elapsed_ms"] >= 0:
            ch["elapsed_ms"] = max(int(ch.get("elapsed_ms") or 0), min(int(data["elapsed_ms"]), 1000 * 60 * 60 * 24 * 30))
        self.save()
        return self.meta(ch, self._doc["items"].index(ch) + 1)

    def remove(self, cid: str) -> Optional[dict]:
        ch = self._find(cid)
        if not ch:
            return None
        self._doc["items"].remove(ch)
        if self._doc["open"] == cid:
            live = sorted((c for c in self._doc["items"] if not c.get("archived")), key=lambda c: c.get("updated") or "", reverse=True)
            if live:
                self._doc["open"] = live[0]["id"]
            else:
                self._new()
        self.save()
        return ch

    def restore(self, ch: dict) -> dict:
        ch = dict(ch)
        if self._find(ch.get("id")):
            ch["id"] = f"{ch.get('id', 'ch')}r"
        ch.setdefault("messages", [])
        ch["archived"] = False
        # back in its own place, by the day it was begun, so the chapters keep their order (and their numerals)
        when = ch.get("created") or ""
        at = next((i for i, c in enumerate(self._doc["items"]) if when and (c.get("created") or "") > when), len(self._doc["items"]))
        self._doc["items"].insert(at, ch)
        self._doc["open"] = ch["id"]
        self.save()
        return self.full(ch["id"])

    def stats(self) -> dict:
        items = self._doc["items"]
        return {"chapters": len(items), "messages": sum(len([m for m in c["messages"] if m.get("role") == "user"]) for c in items),
                "elapsed_ms": sum(int(c.get("elapsed_ms") or 0) for c in items)}


class RecycleBinStore:
    """
    Persistent Recycle Bin store for soft-deleted interview sessions and chat messages.
    Items remain safely stored here and are never automatically wiped.
    """

    def __init__(self, user: Optional[str] = None):
        self._user = user or users.user_id()
        self._data = {"sessions": [], "chats": []}
        self.load()

    def load(self) -> None:
        data = docstore.load(self._user, "recycle_bin", {})
        self._data = data if isinstance(data, dict) else {}
        self._data.setdefault("sessions", [])
        self._data.setdefault("chats", [])

    def save(self) -> None:
        docstore.save(self._user, "recycle_bin", self._data)

    def get_all(self) -> dict:
        return self._data

    def trash_session(self, session_data: dict) -> dict:
        from datetime import datetime
        item = {
            "id": str(session_data.get("id", int(datetime.now().timestamp() * 1000))),
            "deleted_at": datetime.now().isoformat(),
            "data": session_data
        }
        self._data["sessions"] = [s for s in self._data["sessions"] if str(s.get("id")) != item["id"]]
        self._data["sessions"].insert(0, item)
        self.save()
        return item

    def trash_chats(self, chat_messages: list[dict]) -> dict:
        from datetime import datetime
        if not chat_messages:
            return {"count": 0}
        item = {
            "id": f"chat_batch_{int(datetime.now().timestamp() * 1000)}",
            "deleted_at": datetime.now().isoformat(),
            "messages": chat_messages,
            "count": len(chat_messages)
        }
        self._data["chats"].insert(0, item)
        self.save()
        return item

    def trash_chapter(self, chapter: dict) -> dict:
        from datetime import datetime
        item = {"id": chapter["id"], "deleted_at": datetime.now().isoformat(), "chapter": chapter,
                "title": chapter.get("title") or "", "messages": chapter.get("messages", []), "count": len(chapter.get("messages", []))}
        self._data["chats"] = [c for c in self._data["chats"] if str(c.get("id")) != item["id"]]
        self._data["chats"].insert(0, item)
        self.save()
        return item

    def take_chat_item(self, item_id: str) -> Optional[dict]:
        """Remove and return one trashed chat item (a whole chapter, or an older batch of messages)."""
        item = next((c for c in self._data["chats"] if str(c.get("id")) == str(item_id)), None)
        if item is not None:
            self._data["chats"] = [c for c in self._data["chats"] if c is not item]
            self.save()
        return item

    def restore_session(self, session_id: str) -> Optional[dict]:
        target = None
        for s in self._data["sessions"]:
            if str(s.get("id")) == str(session_id):
                target = s.get("data")
                break
        if target:
            self._data["sessions"] = [s for s in self._data["sessions"] if str(s.get("id")) != str(session_id)]
            self.save()
        return target

    def restore_chat_batch(self, batch_id: str) -> Optional[list[dict]]:
        target_messages = None
        for c in self._data["chats"]:
            if str(c.get("id")) == str(batch_id):
                target_messages = c.get("messages", [])
                break
        if target_messages is not None:
            self._data["chats"] = [c for c in self._data["chats"] if str(c.get("id")) != str(batch_id)]
            self.save()
        return target_messages

    def delete_item(self, item_type: str, item_id: str) -> bool:
        if item_type == "session":
            orig = len(self._data["sessions"])
            self._data["sessions"] = [s for s in self._data["sessions"] if str(s.get("id")) != str(item_id)]
            self.save()
            return len(self._data["sessions"]) < orig
        elif item_type == "chat":
            orig = len(self._data["chats"])
            self._data["chats"] = [c for c in self._data["chats"] if str(c.get("id")) != str(item_id)]
            self.save()
            return len(self._data["chats"]) < orig
        return False

    def empty_all(self) -> None:
        self._data = {"sessions": [], "chats": []}
        self.save()




class ProfileStore:
    """Who the user is: name, field, target role and level, set at onboarding and used in every prompt."""

    FIELDS = ("name", "field", "role", "level")

    def __init__(self, user: Optional[str] = None):
        self._user = user or users.user_id()
        self._data: dict = docstore.load(self._user, "profile", {})

    def get(self) -> dict:
        return self._data

    TABS = ("attic",)   # optional tabs a user may hide

    def set_prefs(self, data: dict) -> dict:
        """Small per-account preferences (which optional tabs are hidden); unknown keys are ignored."""
        prefs = dict(self._data.get("prefs") or {})
        if isinstance(data.get("hidden_tabs"), list):
            prefs["hidden_tabs"] = [t for t in data["hidden_tabs"] if t in self.TABS]
        self._data["prefs"] = prefs
        docstore.save(self._user, "profile", self._data)
        return prefs

    def update(self, data: dict) -> dict:
        for key in self.FIELDS:
            if isinstance(data.get(key), str):
                self._data[key] = data[key].strip()[:120]
        self._data["onboarded"] = True
        docstore.save(self._user, "profile", self._data)
        return self._data
