"""
Allowance — who pays for AI calls on the hosted site.

Each signed-in user gets FREE_DAILY_AI calls a day on the server's keys, inside a hard server-wide cap
(GLOBAL_DAILY_AI). A user who saves their own keys (one per provider: Gemini, Groq, Claude, OpenAI) uses those
instead, with no limit; the router tries them in that order. A user can also add one OpenAI-compatible provider of
their own (OpenRouter, Together, DeepSeek, Mistral…): base URL + model + key, tried first or last as they choose. Saved keys are
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
# the user's own OpenAI-compatible provider for this request: {"key", "base_url", "model", "label", "first"} or None
own_custom: contextvars.ContextVar = contextvars.ContextVar("vettly_own_custom", default=None)


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


ORDER = ("gemini", "groq", "anthropic", "openai")   # the router's order: free tiers first


def _doc(uid: str) -> dict:
    """The whole "ai_keys" document: one entry per standard provider, plus "custom"; older single-key docs migrate."""
    doc = docstore.load(uid, "ai_keys", None)
    if doc is None:
        old = docstore.load(uid, "ai_key", {})
        doc = {old["provider"]: {"key": old["key"], "last4": ""}} if old.get("key") and old.get("provider") in PROVIDERS else {}
    return {p: v for p, v in doc.items() if (p in PROVIDERS or p == "custom") and isinstance(v, dict) and v.get("key")}


def _saved(uid: str) -> dict:
    """The user's keys for the four standard providers ({provider: {"key": encrypted, "last4": "…"}})."""
    return {p: v for p, v in _doc(uid).items() if p in PROVIDERS}


def status() -> dict:
    uid = users.user_id()
    doc = _doc(uid)
    saved = {p: v for p, v in doc.items() if p in PROVIDERS}
    used = _count(uid)
    keys = {p: {"saved": p in saved, "last4": saved.get(p, {}).get("last4", "")} for p in ORDER}
    c = doc.get("custom")
    keys["custom"] = {"saved": bool(c), "last4": (c or {}).get("last4", ""), "base_url": (c or {}).get("base_url", ""),
                      "model": (c or {}).get("model", ""), "label": (c or {}).get("label", ""), "first": bool((c or {}).get("first"))}
    first = next((p for p in ORDER if p in saved), None)
    return {"keys": keys, "order": list(ORDER), "provider": first, "has_key": bool(saved) or bool(c),
            "own_keys_enabled": _fernet() is not None, "free_limit": FREE_DAILY_AI, "free_left": max(0, FREE_DAILY_AI - used)}


def _clean(provider: str, key: str) -> str:
    key = (key or "").strip()
    if provider not in PROVIDERS:
        raise ValueError("Pick Gemini, Groq, Claude or OpenAI")
    if not (20 <= len(key) <= 300) or any(c.isspace() for c in key):
        raise ValueError("That doesn't look like a full API key. Copy the whole key and paste it again")
    return key


def save_key(provider: str, key: str) -> dict:
    f = _fernet()
    if f is None:
        raise ValueError("Own keys aren't switched on for this site yet")
    key = _clean(provider, key)
    uid = users.user_id()
    doc = _doc(uid)
    doc[provider] = {"key": f.encrypt(key.encode()).decode(), "last4": key[-4:]}
    docstore.save(uid, "ai_keys", doc)
    return status()


def remove_key(provider: str = "") -> dict:
    uid = users.user_id()
    doc = _doc(uid)
    if provider:
        doc.pop(provider, None)
    else:
        doc = {}
    docstore.save(uid, "ai_keys", doc)
    docstore.save(uid, "ai_key", {})   # the old single-key doc never comes back
    return status()


def decrypted_keys(uid: str) -> dict:
    """{ENV_NAME: plain key} for every key the user saved and the server can still read."""
    f = _fernet()
    if f is None:
        return {}
    out = {}
    for p, v in _saved(uid).items():
        try:
            out[PROVIDERS[p]] = f.decrypt(v["key"].encode()).decode()
        except Exception:
            pass   # unreadable (secret rotated): treat as not saved
    return out


def begin_ai_call():
    """Before an AI request: use the user's own key, or spend one of today's free calls (raises when none are left).
    Returns the free calls left today when the answer runs on Vettly's shared keys, else None (the page reminds the
    user now and then that the shared keys are free only for a while)."""
    if not users.auth_enabled():
        return None
    uid = users.user_id()
    mine, custom = decrypted_keys(uid), decrypted_custom(uid)
    if mine or custom:   # their own keys only (never the server's): Gemini, Groq, Claude, OpenAI, and their own provider
        own_keys.set({name: mine.get(name, "") for name in PROVIDERS.values()})
        own_custom.set(custom)
        return None
    used, total = _count(uid), _count("_global")
    if used >= FREE_DAILY_AI:
        raise LimitReached(f"You've used today's {FREE_DAILY_AI} free AI answers. Add a free Gemini or Groq key in Settings → Key Ring to keep going, or come back tomorrow.")
    if total >= GLOBAL_DAILY_AI:
        raise LimitReached("Vettly has reached today's free AI limit for everyone. Add a free Gemini or Groq key in Settings → Key Ring to keep going.")
    # ponytail: read-then-write counters can undercount under heavy concurrency; fine as a cost guard
    docstore.save(uid, "usage", {"day": _today(), "n": used + 1})
    docstore.save("_global", "usage", {"day": _today(), "n": total + 1})
    return FREE_DAILY_AI - used - 1


# A key check that spends nothing: each provider's "list models" call needs a valid key and uses no tokens
_CHECKS = {
    "gemini": ("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", lambda k: {"x-goog-api-key": k}),
    "groq": ("https://api.groq.com/openai/v1/models", lambda k: {"Authorization": f"Bearer {k}"}),
    "anthropic": ("https://api.anthropic.com/v1/models?limit=1", lambda k: {"x-api-key": k, "anthropic-version": "2023-06-01"}),
    "openai": ("https://api.openai.com/v1/models", lambda k: {"Authorization": f"Bearer {k}"}),
}


async def test_key(provider: str, key: str = "") -> dict:
    """Is this key (or the saved one) accepted by its provider? Returns {"ok": bool, "message": str}."""
    import httpx
    if provider == "custom":
        return await test_custom()
    if provider not in _CHECKS:
        raise ValueError("Pick Gemini, Groq, Claude or OpenAI")
    key = _clean(provider, key) if key else decrypted_keys(users.user_id()).get(PROVIDERS[provider], "")
    if not key:
        raise ValueError("No key saved for this provider yet")
    url, headers = _CHECKS[provider]
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            r = await client.get(url, headers=headers(key))
    except httpx.HTTPError:
        return {"ok": False, "message": "Couldn't reach the provider just now. Try again in a moment."}
    if r.status_code == 200:
        return {"ok": True, "message": "Key works"}
    # Google answers a wrong key with 400 API_KEY_INVALID, the others with 401/403
    if r.status_code in (401, 403) or (provider == "gemini" and r.status_code == 400 and "API_KEY" in r.text):
        return {"ok": False, "message": "The provider rejected this key. Copy it again from their site, or create a new one."}
    if r.status_code == 429:
        return {"ok": True, "message": "Key works, but it's rate-limited right now"}
    return {"ok": False, "message": f"The provider answered {r.status_code}. Try again in a moment."}


# ── The user's own OpenAI-compatible provider ──────────────────────────────
# The server calls a URL the user typed, so it must never reach anything private: https only, no credentials or odd
# characters in the URL, a host that resolves to public addresses only (checked again before every call, against DNS
# tricks), and no redirects followed.
import ipaddress  # noqa: E402
import re  # noqa: E402
import socket  # noqa: E402
from urllib.parse import urlsplit  # noqa: E402

_MODEL = re.compile(r"[A-Za-z0-9._:/@+\-]{1,120}")


def _clean_url(url: str) -> str:
    url = (url or "").strip().rstrip("/")
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
        raise ValueError("Use the provider's https base URL, like https://openrouter.ai/api/v1")
    if len(url) > 200 or not re.fullmatch(r"[A-Za-z0-9.-]+", parts.hostname) or any(c.isspace() for c in url):
        raise ValueError("That base URL doesn't look right. Copy it from the provider's docs")
    try:
        ipaddress.ip_address(parts.hostname)
        is_ip = True
    except ValueError:
        is_ip = False
    if is_ip:
        raise ValueError("Use the provider's domain name, not an IP address")
    return url


async def public_host(url: str) -> bool:
    """Does every address this URL's host resolves to belong to the public internet?"""
    import asyncio
    host = urlsplit(url).hostname or ""
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except OSError:
        return False
    addrs = {i[4][0] for i in infos}
    return bool(addrs) and all(ipaddress.ip_address(a.split("%")[0]).is_global for a in addrs)


async def save_custom(data: dict) -> dict:
    f = _fernet()
    if f is None:
        raise ValueError("Own keys aren't switched on for this site yet")
    url = _clean_url(str(data.get("base_url", "")))
    model = str(data.get("model", "")).strip()
    if not _MODEL.fullmatch(model):
        raise ValueError("Add the model name exactly as the provider lists it, like openrouter/auto")
    key = str(data.get("key", "") or "").strip()
    uid = users.user_id()
    doc = _doc(uid)
    old = doc.get("custom") or {}
    if not key and old.get("key"):   # changing the URL, model or order keeps the saved key
        enc, last4 = old["key"], old.get("last4", "")
    else:
        if not (8 <= len(key) <= 400) or any(c.isspace() for c in key):
            raise ValueError("That doesn't look like a full API key. Copy the whole key and paste it again")
        enc, last4 = f.encrypt(key.encode()).decode(), key[-4:]
    if not await public_host(url):
        raise ValueError("Vettly couldn't find that provider on the public internet. Check the base URL")
    label = re.sub(r"[^A-Za-z0-9 .&()-]", "", str(data.get("label", "") or ""))[:40].strip() or urlsplit(url).hostname
    doc["custom"] = {"key": enc, "last4": last4, "base_url": url, "model": model, "label": label, "first": bool(data.get("first", True))}
    docstore.save(uid, "ai_keys", doc)
    return status()


def decrypted_custom(uid: str):
    """The user's own provider with its key readable, or None."""
    f = _fernet()
    c = _doc(uid).get("custom")
    if f is None or not c:
        return None
    try:
        return {"key": f.decrypt(c["key"].encode()).decode(), "base_url": c["base_url"], "model": c["model"],
                "label": c.get("label") or "Your provider", "first": bool(c.get("first"))}
    except Exception:
        return None


async def test_custom() -> dict:
    """A one-token request to the user's own provider: the only check every OpenAI-compatible API answers the same way."""
    import httpx
    c = decrypted_custom(users.user_id())
    if not c:
        raise ValueError("Save your provider first")
    if not await public_host(c["base_url"]):
        return {"ok": False, "message": "That base URL doesn't reach a public server."}
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=False) as client:
            r = await client.post(f"{c['base_url']}/chat/completions", headers={"Authorization": f"Bearer {c['key']}", "X-Title": "Vettly"},
                                  json={"model": c["model"], "messages": [{"role": "user", "content": "Say OK"}], "max_tokens": 1})
    except httpx.HTTPError:
        return {"ok": False, "message": "Couldn't reach the provider just now. Check the base URL, or try again."}
    if r.status_code == 200:
        return {"ok": True, "message": f"{c['label']} answers with {c['model']}"}
    if r.status_code in (401, 403):
        return {"ok": False, "message": "The provider rejected this key. Copy it again from their site."}
    if r.status_code == 404:
        return {"ok": False, "message": "The provider doesn't know that model or URL. Check both."}
    if r.status_code == 429:
        return {"ok": True, "message": "Key works, but it's rate-limited right now"}
    return {"ok": False, "message": f"The provider answered {r.status_code}. Check the model name, or try again."}
