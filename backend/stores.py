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
    """Persists chat history between the user and the AI across sessions and devices."""

    def __init__(self, user: Optional[str] = None):
        self._user = user or users.user_id()
        self._history: list[dict] = []
        self.load()

    def load(self) -> None:
        self._history = docstore.load(self._user, "chat_history", [])

    def save(self) -> None:
        docstore.save(self._user, "chat_history", self._history)

    def get_history(self) -> list[dict]:
        return self._history

    def add_message(self, role: str, content: str) -> None:
        self._history.append({"role": role, "content": content})
        self.save()

    def set_history(self, history: list[dict]) -> None:
        self._history = history
        self.save()

    def clear(self) -> None:
        self._history = []
        self.save()
        logger.info("🗑️ Chat history cleared")


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

    def update(self, data: dict) -> dict:
        for key in self.FIELDS:
            if isinstance(data.get(key), str):
                self._data[key] = data[key].strip()[:120]
        self._data["onboarded"] = True
        docstore.save(self._user, "profile", self._data)
        return self._data
