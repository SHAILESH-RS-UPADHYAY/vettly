"""
Keys check: one saved key per provider, never sent back in full, separate per user, and the router's
Gemini → Groq → Claude → OpenAI order with fallback. Run from backend/:  python tests/test_keys.py
Uses a throwaway SQLite database and a locally generated signing key; no network, no real Clerk.
"""

import asyncio
import base64
import os
import tempfile
import time

DB = os.path.join(tempfile.mkdtemp(), "vettly-keys.db")
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


client = TestClient(main.app)
A, B = auth("user_a"), auth("user_b")
GEMINI = "AIzaSy" + "g" * 33 + "WXYZ"
GROQ = "gsk_" + "q" * 48 + "1234"

# 1. both free keys saved side by side; only the last four characters ever come back
client.post("/api/ai-key", json={"provider": "gemini", "key": GEMINI}, headers=A)
r = client.post("/api/ai-key", json={"provider": "groq", "key": GROQ}, headers=A).json()
assert r["keys"]["gemini"] == {"saved": True, "last4": "WXYZ"}, r
assert r["keys"]["groq"] == {"saved": True, "last4": "1234"}, r
assert r["order"] == ["gemini", "groq", "anthropic", "openai"], r
for path in ("/api/ai-key",):
    body = client.get(path, headers=A).text
    assert GEMINI not in body and GROQ not in body and "q" * 20 not in body, "a full key leaked"

# 2. a bad paste is refused with a plain message
bad = client.post("/api/ai-key", json={"provider": "gemini", "key": "short"}, headers=A)
assert bad.status_code == 400 and "full API key" in bad.json()["error"], bad.text

# 3. user B sees none of A's keys
assert not any(v["saved"] for v in client.get("/api/ai-key", headers=B).json()["keys"].values())

# 4. removing one provider keeps the other
r = client.delete("/api/ai-key?provider=gemini", headers=A).json()
assert r["keys"]["gemini"]["saved"] is False and r["keys"]["groq"]["saved"] is True, r

# 5. during an AI call the user's own keys sit in their own slots
client.post("/api/ai-key", json={"provider": "gemini", "key": GEMINI}, headers=A)
users.begin_request()
users._user.set("user_a")
allowance.begin_ai_call()
mine = allowance.own_keys.get()
assert mine["GEMINI_API_KEY"] == GEMINI and mine["GROQ_API_KEY"] == GROQ and mine["ANTHROPIC_API_KEY"] == "", mine

# 6. the router: Gemini first, Groq takes over when Gemini fails, Claude/OpenAI skipped without keys
calls = []


async def failing_gemini(*a):
    calls.append("gemini")
    raise RuntimeError("503 busy")


async def working_groq(*a):
    calls.append("groq")
    return "answer from groq"


async def never(*a):
    calls.append("other")
    return "should not be called"


ai_utils._CALLERS.update({"gemini": failing_gemini, "groq": working_groq, "claude": never, "openai": never})
out = asyncio.run(ai_utils.generate_multi_provider_completion("sys", "hi"))
assert out == "answer from groq" and calls == ["gemini", "groq"], (out, calls)

print("keys check passed")

# 7. export: everything the user saved, minus keys and counters
client.post("/api/profile", json={"name": "Asha", "field": "Healthcare", "role": "Staff nurse"}, headers=A)
exp = client.get("/api/me/export", headers=A)
assert exp.status_code == 200 and "attachment" in exp.headers["content-disposition"], exp.headers
docs = exp.json()["documents"]
assert docs["profile"]["name"] == "Asha" and "ai_keys" not in docs and GEMINI not in exp.text, list(docs)
assert "profile" not in client.get("/api/me/export", headers=B).json()["documents"], "export leaked across users"
print("export check passed")
