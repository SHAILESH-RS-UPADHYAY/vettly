"""
Accounts check: two signed-in users never see each other's data, and bad tokens are turned away.
Run from backend/:  python test_accounts.py
Uses a throwaway SQLite database and a locally generated signing key; no network, no real Clerk.
"""

import base64
import os
import tempfile
import time

DB = os.path.join(tempfile.mkdtemp(), "vettly-test.db")
os.environ["DATABASE_URL"] = "sqlite:///" + DB
os.environ["CLERK_PUBLISHABLE_KEY"] = "pk_test_" + base64.b64encode(b"test.clerk.accounts.dev$").decode()
os.environ.pop("VERCEL", None)
os.environ["FREE_DAILY_AI"] = "2"
os.environ["KEY_ENCRYPTION_SECRET"] = "test-secret"

import jwt  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import users  # noqa: E402
import main  # noqa: E402

KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class _Jwks:   # stands in for Clerk's key endpoint
    def get_signing_key_from_jwt(self, token):
        return type("Key", (), {"key": KEY.public_key()})()


users._jwks = _Jwks()


def token(sub, iss="https://test.clerk.accounts.dev", exp_in=60, key=KEY):
    now = int(time.time())
    return jwt.encode({"sub": sub, "iss": iss, "iat": now, "exp": now + exp_in}, key, algorithm="RS256")


def as_user(sub):
    return {"Authorization": f"Bearer {token(sub)}"}


with TestClient(main.app) as client:
    # public: the app shell and its config need no sign-in
    assert client.get("/api/config").json()["auth"] == "clerk"
    assert client.get("/api/config").json()["clerk_frontend_api"] == "test.clerk.accounts.dev"
    assert client.get("/api/health").status_code == 200

    # data needs a valid session
    assert client.get("/context").status_code == 401
    assert client.get("/context", headers={"Authorization": "Bearer nonsense"}).status_code == 401
    assert client.get("/context", headers={"Authorization": f"Bearer {token('user_a', exp_in=-120)}"}).status_code == 401
    assert client.get("/context", headers={"Authorization": f"Bearer {token('user_a', iss='https://evil.example')}"}).status_code == 401
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    assert client.get("/context", headers={"Authorization": f"Bearer {token('user_a', key=other_key)}"}).status_code == 401

    # each user only ever sees their own documents
    a, b = as_user("user_a"), as_user("user_b")
    assert client.post("/api/about-me", json={"intro": "A's intro"}, headers=a).status_code == 200
    assert client.post("/context/assignment", json={"company": "A Corp", "title": "Nurse", "details": "Ward duty"}, headers=a).status_code == 200
    assert client.get("/api/about-me", headers=a).json()["data"]["intro"] == "A's intro"
    assert client.get("/api/about-me", headers=b).json()["data"] == {}
    assert client.get("/context/assignment", headers=b).json().get("company") in (None, "")
    assert client.get("/prepare/questions", headers=b).json()["entries"] == []

    # delete my data clears A and leaves B alone
    assert client.post("/api/about-me", json={"intro": "B's intro"}, headers=b).status_code == 200
    assert client.delete("/api/me", headers=a).json()["status"] == "deleted"
    assert client.get("/api/about-me", headers=a).json()["data"] == {}
    assert client.get("/api/about-me", headers=b).json()["data"]["intro"] == "B's intro"

print("accounts check passed")

# profiles: each user's own, and a tech field keeps the curated categories
with TestClient(main.app) as client:
    a, b = as_user("user_a"), as_user("user_b")
    assert client.post("/api/profile", json={"name": "Asha", "field": "Technology", "role": "Nurse"}, headers=a).json()["onboarded"] is True
    assert client.get("/api/profile", headers=b).json() == {}
    assert client.get("/prepare/categories", headers=a).json()["categories"] is None
print("profile check passed")

# allowance: two free AI calls a day, then 429 until the user saves their own key
with TestClient(main.app) as client:
    c = as_user("user_c")
    for _ in range(2):
        assert client.post("/api/chat", json={"message": "hi"}, headers=c).status_code != 429
    assert client.post("/api/chat", json={"message": "hi"}, headers=c).status_code == 429
    assert client.get("/api/ai-key", headers=c).json()["free_left"] == 0
    assert client.post("/api/ai-key", json={"provider": "groq", "key": "gsk_" + "x" * 40}, headers=c).json()["has_key"] is True
    assert client.post("/api/chat", json={"message": "hi"}, headers=c).status_code != 429
    import docstore
    assert "gsk_" not in str(docstore.load("user_c", "ai_key", {}))   # stored encrypted
    assert client.get("/api/ai-key", headers=as_user("user_d")).json()["free_left"] == 2
print("allowance check passed")
