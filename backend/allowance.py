"""
Allowance — who pays for AI calls on the hosted site.

Each signed-in user gets FREE_DAILY_AI calls a day on the server's keys, inside a hard server-wide cap
(GLOBAL_DAILY_AI). A user who saves their own provider key uses it instead, with no limit. Saved keys are
encrypted with KEY_ENCRYPTION_SECRET; without that secret, own keys simply can't be saved.
Running Vettly on your own machine (no sign-in) skips all of this.
"""

import base64
import contextvars
import hashlib
import os
from datetime import datetime, timezone

import docstore
import users

FREE_DAILY_AI = int(os.getenv("FREE_DAILY_AI", "25"))
GLOBAL_DAILY_AI = int(os.getenv("GLOBAL_DAILY_AI", "2000"))
PROVIDERS = {"anthropic": "ANTHROPIC_API_KEY", "gemini": "GEMINI_API_KEY", "openai": "OPENAI_API_KEY", "groq": "GROQ_API_KEY"}
AI_PATHS = ("/api/chat", "/api/mentor", "/prepare/single", "/prepare/refine", "/api/prep/")
NOT_AI = ("/api/chat/history", "/api/chat/sync")

# the key set for this request: None = the server's own keys
own_keys: contextvars.ContextVar = contextvars.ContextVar("vettly_own_keys", default=None)


class LimitReached(Exception):
    pass


def is_ai(path: str, method: str) -> bool:
    # the field categories and daily concepts are cached reads: they spend a call only when they generate
    return method == "POST" and path.startswith(AI_PATHS) and not path.startswith(NOT_AI)


def _fernet():
    secret = os.getenv("KEY_ENCRYPTION_SECRET", "")
    if not secret:
        return None
    from cryptography.fernet import Fernet
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest()))


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _count(user: str) -> int:
    doc = docstore.load(user, "usage", {})
    return doc.get("n", 0) if doc.get("day") == _today() else 0


def status() -> dict:
    uid = users.user_id()
    saved = docstore.load(uid, "ai_key", {})
    used = _count(uid)
    return {"provider": saved.get("provider"), "has_key": bool(saved.get("key")), "own_keys_enabled": _fernet() is not None,
            "free_limit": FREE_DAILY_AI, "free_left": max(0, FREE_DAILY_AI - used)}


def save_key(provider: str, key: str) -> dict:
    f = _fernet()
    if f is None:
        raise ValueError("Own keys aren't switched on for this site yet")
    if provider not in PROVIDERS or not (20 <= len(key.strip()) <= 300):
        raise ValueError("Pick a provider and paste a full API key")
    docstore.save(users.user_id(), "ai_key", {"provider": provider, "key": f.encrypt(key.strip().encode()).decode()})
    return status()


def remove_key() -> dict:
    docstore.save(users.user_id(), "ai_key", {})
    return status()


def begin_ai_call() -> None:
    """Before an AI request: use the user's own key, or spend one of today's free calls (raises when none are left)."""
    if not users.auth_enabled():
        return
    uid = users.user_id()
    saved = docstore.load(uid, "ai_key", {})
    f = _fernet()
    if saved.get("key") and f is not None:
        try:
            key = f.decrypt(saved["key"].encode()).decode()
            own_keys.set({name: (key if p == saved["provider"] else "") for p, name in PROVIDERS.items()})
            return
        except Exception:
            pass   # an unreadable key (secret rotated): fall back to the free allowance
    used, total = _count(uid), _count("_global")
    if used >= FREE_DAILY_AI:
        raise LimitReached(f"You've used today's {FREE_DAILY_AI} free AI answers. Add your own API key in Settings to keep going, or come back tomorrow.")
    if total >= GLOBAL_DAILY_AI:
        raise LimitReached("Vettly has reached today's free AI limit for everyone. Add your own API key in Settings to keep going.")
    # ponytail: read-then-write counters can undercount under heavy concurrency; fine as a cost guard
    docstore.save(uid, "usage", {"day": _today(), "n": used + 1})
    docstore.save("_global", "usage", {"day": _today(), "n": total + 1})
