"""
History Store — Persistent interview session storage.
Saves interview rounds to a JSON file for the dashboard history section.
"""

import json
import logging
import time
from pathlib import Path
from typing import Optional

import config

logger = logging.getLogger("vettly.history")


class HistoryStore:
    """Simple JSON file-based interview history persistence."""

    def __init__(self):
        self._file = config.CONTEXT_STORE_DIR / "history.json"
        self._sessions: list[dict] = []
        self.load()

    def load(self) -> None:
        """Load history from disk."""
        if self._file.exists():
            try:
                with open(self._file, "r", encoding="utf-8") as f:
                    self._sessions = json.load(f)
                logger.info(f"📚 History loaded: {len(self._sessions)} sessions")
            except Exception as e:
                logger.warning(f"Failed to load history: {e}")
                self._sessions = []

    def save(self) -> None:
        """Persist history to disk."""
        try:
            with open(self._file, "w", encoding="utf-8") as f:
                json.dump(self._sessions, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Failed to save history: {e}")

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

    def sync_with_cloud(self) -> int:
        """Sync missing sessions from cloud backend (Render) into local history.json."""
        try:
            import urllib.request
            req = urllib.request.Request(
                "https://acemate-backend.onrender.com/api/history",
                headers={"User-Agent": "Acemate-Local-Sync/1.0"}
            )
            with urllib.request.urlopen(req, timeout=3.5) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    cloud_sessions = data.get("sessions", [])
                    local_ids = {str(s.get("id")) for s in self._sessions}
                    added = 0
                    for cs in cloud_sessions:
                        cid = str(cs.get("id"))
                        if cid not in local_ids and cs.get("entries"):
                            self._sessions.append(cs)
                            local_ids.add(cid)
                            added += 1
                        elif cid in local_ids:
                            for idx, ls in enumerate(self._sessions):
                                if str(ls.get("id")) == cid:
                                    if len(cs.get("entries", [])) > len(ls.get("entries", [])):
                                        self._sessions[idx] = cs
                    if added > 0:
                        self.save()
                        logger.info(f"🔄 Auto-synced {added} new sessions from cloud backend into local history.json")
                    return added
        except Exception:
            pass
        return 0

    def get_all(self) -> list[dict]:
        """Get all sessions, reloaded from disk for guaranteed freshness."""
        self.load()
        # Periodic background check with cloud (every 30s max)
        now = time.time()
        if now - getattr(self, "_last_cloud_sync", 0) > 30:
            self._last_cloud_sync = now
            import threading
            threading.Thread(target=self.sync_with_cloud, daemon=True).start()
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

    def __init__(self):
        self._file = config.CONTEXT_STORE_DIR / "about_me.json"
        self._data: dict = {}
        self.load()

    def load(self) -> None:
        """Load about-me data from disk."""
        if self._file.exists():
            try:
                with open(self._file, "r", encoding="utf-8") as f:
                    self._data = json.load(f)
                logger.info("👤 About-me data loaded")
            except Exception as e:
                logger.warning(f"Failed to load about-me: {e}")
                self._data = {}

    def save(self) -> None:
        """Persist about-me data to disk."""
        try:
            with open(self._file, "w", encoding="utf-8") as f:
                json.dump(self._data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Failed to save about me data: {e}")

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

    def __init__(self):
        self._file = config.CONTEXT_STORE_DIR / "chat_history.json"
        self._history: list[dict] = []
        self.load()

    def load(self) -> None:
        if self._file.exists():
            try:
                with open(self._file, "r", encoding="utf-8") as f:
                    self._history = json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load chat history: {e}")
                self._history = []

    def save(self) -> None:
        try:
            with open(self._file, "w", encoding="utf-8") as f:
                json.dump(self._history, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Failed to save chat history: {e}")

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
        if self._file.exists():
            try:
                self._file.unlink()
            except Exception as e:
                logger.error(f"Failed to delete chat history file: {e}")
        logger.info("🗑️ Chat history cleared")


class RecycleBinStore:
    """
    Persistent Recycle Bin store for soft-deleted interview sessions and chat messages.
    Items remain safely stored here and are never automatically wiped.
    """

    def __init__(self):
        self._file = config.CONTEXT_STORE_DIR / "recycle_bin.json"
        self._data = {"sessions": [], "chats": []}
        self.load()

    def load(self) -> None:
        if self._file.exists():
            try:
                with open(self._file, "r", encoding="utf-8") as f:
                    self._data = json.load(f)
                    if not isinstance(self._data, dict):
                        self._data = {"sessions": [], "chats": []}
                    if "sessions" not in self._data: self._data["sessions"] = []
                    if "chats" not in self._data: self._data["chats"] = []
            except Exception as e:
                logger.warning(f"Failed to load recycle bin: {e}")
                self._data = {"sessions": [], "chats": []}
        else:
            self._data = {"sessions": [], "chats": []}

    def save(self) -> None:
        try:
            with open(self._file, "w", encoding="utf-8") as f:
                json.dump(self._data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Failed to save recycle bin: {e}")

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


recycle_bin_store = RecycleBinStore()

