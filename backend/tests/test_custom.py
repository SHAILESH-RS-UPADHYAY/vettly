"""
Custom provider check: a user's own OpenAI-compatible provider (OpenRouter and friends). Unsafe URLs are refused
(http, IP addresses, credentials, private or unresolvable hosts), the key is never sent back, the router tries it
first or last as asked, removing it leaves the other keys alone, and nobody else sees it.
Run from backend/:  python tests/test_custom.py   (no network: DNS answers and the provider are stubbed)
"""

import asyncio
import base64
import os
import tempfile
import time

DB = os.path.join(tempfile.mkdtemp(), "vettly-custom.db")
os.environ["DATABASE_URL"] = "sqlite:///" + DB
os.environ["CLERK_PUBLISHABLE_KEY"] = "pk_test_" + base64.b64encode(b"test.clerk.accounts.dev$").decode()
os.environ.pop("VERCEL", None)
os.environ["KEY_ENCRYPTION_SECRET"] = "test-secret"

import jwt  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import sys  # noqa: E402
from pathlib import Path  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))   # the backend modules sit one folder up
import allowance  # noqa: E402
import users  # noqa: E402
import main  # noqa: E402
from ai import utils as ai_utils  # noqa: E402

KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class _Jwks:
    def get_signing_key_from_jwt(self, token):
        return type("Key", (), {"key": KEY.public_key()})()


users._jwks = _Jwks()


def auth(sub):
    now = int(time.time())
    tok = jwt.encode({"sub": sub, "iss": "https://test.clerk.accounts.dev", "iat": now, "exp": now + 600}, KEY, algorithm="RS256")
    return {"authorization": f"Bearer {tok}"}


# DNS stub: one public provider, one that points inside the network
ADDRS = {"openrouter.ai": "104.18.2.115", "sneaky.example.com": "10.0.0.5", "metadata.example.com": "169.254.169.254"}


async def fake_getaddrinfo(self, host, port, **kw):
    if host not in ADDRS:
        raise OSError("no such host")
    return [(2, 1, 6, "", (ADDRS[host], port))]


asyncio.AbstractEventLoop.getaddrinfo = fake_getaddrinfo
for cls in {type(asyncio.new_event_loop())}:
    cls.getaddrinfo = fake_getaddrinfo

client = TestClient(main.app)
A, B = auth("user_a"), auth("user_b")
GOOD = {"provider": "custom", "base_url": "https://openrouter.ai/api/v1/", "model": "openrouter/auto", "key": "sk-or-v1-abcdefghijklmnop1234", "label": "OpenRouter", "first": True}


def save(body, who=A):
    return client.post("/api/ai-key", json=body, headers=who)


# 1. unsafe or broken base URLs are refused before anything is stored
for url, why in [("http://openrouter.ai/api/v1", "https"), ("https://10.0.0.5/v1", "IP"), ("https://user:pw@openrouter.ai/api/v1", "https"),
                 ("https://sneaky.example.com/v1", "public"), ("https://metadata.example.com/v1", "public"), ("https://nowhere.invalid/v1", "public"),
                 ("https://openrouter.ai/api/v1?x=1", "https")]:
    r = save({**GOOD, "base_url": url})
    assert r.status_code == 400, (url, r.text)
r = save({**GOOD, "model": "bad model name"})
assert r.status_code == 400 and "model" in r.json()["error"], r.text
r = save({**GOOD, "key": "short"})
assert r.status_code == 400, r.text

# 2. a good provider saves; the key never comes back, the rest does
r = save(GOOD)
assert r.status_code == 200, r.text
c = r.json()["keys"]["custom"]
assert c == {"saved": True, "last4": "1234", "base_url": "https://openrouter.ai/api/v1", "model": "openrouter/auto", "label": "OpenRouter", "first": True}, c
assert "sk-or-v1" not in r.text
assert r.json()["has_key"] is True

# 3. changing only the model keeps the saved key
r = save({**GOOD, "key": "", "model": "deepseek/deepseek-chat", "first": False})
assert r.json()["keys"]["custom"]["model"] == "deepseek/deepseek-chat" and r.json()["keys"]["custom"]["last4"] == "1234", r.json()

# 4. the router: their provider is tried last here (first=False), and first when asked
calls = []


async def fake(name):
    async def run(*a, **k):
        calls.append(name)
        if name == "custom":
            return "custom answer"
        raise RuntimeError("busy")
    return run


saved_callers = dict(ai_utils._CALLERS)
for n in saved_callers:
    ai_utils._CALLERS[n] = asyncio.run(fake(n))
allowance.own_keys.set({"GEMINI_API_KEY": "AIza-test-key-0000000000", "GROQ_API_KEY": "", "ANTHROPIC_API_KEY": "", "OPENAI_API_KEY": ""})
allowance.own_custom.set({"key": "k", "base_url": "https://openrouter.ai/api/v1", "model": "m", "label": "OpenRouter", "first": False})
assert asyncio.run(ai_utils.generate_multi_provider_completion("sys", "hi")) == "custom answer" and calls == ["gemini", "custom"], calls
calls.clear()
allowance.own_custom.set({"key": "k", "base_url": "https://openrouter.ai/api/v1", "model": "m", "label": "OpenRouter", "first": True})
assert asyncio.run(ai_utils.generate_multi_provider_completion("sys", "hi")) == "custom answer" and calls == ["custom"], calls
ai_utils._CALLERS.update(saved_callers)
allowance.own_keys.set(None)
allowance.own_custom.set(None)

# 5. a signed-in request with only a custom provider uses it (no free allowance spent) and never the server's keys
users.begin_request()
st = client.get("/api/ai-key", headers=A).json()
assert st["keys"]["custom"]["saved"] and st["free_left"] == st["free_limit"], st

# 6. B sees nothing of A's provider; removing A's custom provider leaves A's Gemini key alone
assert client.get("/api/ai-key", headers=B).json()["keys"]["custom"]["saved"] is False
assert client.post("/api/ai-key", json={"provider": "gemini", "key": "AIzaSyTestKeyForVettly1234567890"}, headers=A).status_code == 200
r = client.delete("/api/ai-key?provider=custom", headers=A).json()
assert r["keys"]["custom"]["saved"] is False and r["keys"]["gemini"]["saved"] is True, r
# …and saving another standard key no longer wipes a custom provider
save(GOOD)
client.post("/api/ai-key", json={"provider": "groq", "key": "gsk_TestKeyForVettly1234567890ab"}, headers=A)
assert client.get("/api/ai-key", headers=A).json()["keys"]["custom"]["saved"] is True

# 7. the export never includes the provider or its key
assert "sk-or-v1" not in client.get("/api/me/export", headers=A).text

print("custom provider check passed")
