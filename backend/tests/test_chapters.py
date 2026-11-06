"""
Register check: chapters of the Live Copilot. Old history migrates to Chapter 1, new chapters open, messages land
in the chapter on screen with their timings, archive and time spent persist, a torn-out chapter waits in The Attic
and comes back whole, and nobody sees anyone else's register. Run from backend/:  python tests/test_chapters.py
"""

import base64
import os
import tempfile
import time

DB = os.path.join(tempfile.mkdtemp(), "vettly-chapters.db")
os.environ["DATABASE_URL"] = "sqlite:///" + DB
os.environ["CLERK_PUBLISHABLE_KEY"] = "pk_test_" + base64.b64encode(b"test.clerk.accounts.dev$").decode()
os.environ.pop("VERCEL", None)
os.environ["FREE_DAILY_AI"] = "50"

import jwt  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import sys  # noqa: E402
from pathlib import Path  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))   # the backend modules sit one folder up
import docstore  # noqa: E402
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


async def fake_ai(*a, **k):
    return "A short, honest answer."


main_router = ai_utils.generate_multi_provider_completion
ai_utils.generate_multi_provider_completion = fake_ai
client = TestClient(main.app)
A, B = auth("user_a"), auth("user_b")

# 1. an older single history becomes Chapter 1
docstore.save("user_a", "chat_history", [{"role": "user", "content": "Tell me about yourself"}, {"role": "assistant", "content": "Hi"}])
r = client.get("/api/chats", headers=A).json()
assert len(r["chapters"]) == 1 and r["chapters"][0]["count"] == 2 and r["chapters"][0]["auto_title"].startswith("Tell me"), r
first = r["open"]

# 2. a new chapter opens; messages land there with the stopwatch time and the answer time
r = client.post("/api/chats", json={}, headers=A).json()
second = r["chapter"]["id"]
assert r["open"] == second and second != first, r
chat = client.post("/api/chat", json={"message": "Why this role?", "chat_id": second, "think_ms": 84000}, headers=A)
assert chat.status_code == 200, chat.text
full = client.post(f"/api/chats/{second}/open", headers=A).json()
assert [m["role"] for m in full["messages"]] == ["user", "assistant"], full
assert full["messages"][0]["think_ms"] == 84000 and "ms" in full["messages"][1] and full["messages"][0]["ts"], full["messages"]

# 3. an untouched open chapter is reused rather than piling up blank pages
third = client.post("/api/chats", json={}, headers=A).json()["chapter"]["id"]
again = client.post("/api/chats", json={}, headers=A).json()["chapter"]["id"]
assert third == again, (third, again)

# 4. writing into a chapter that is not open (another device opened something else) still lands in the right place
client.post(f"/api/chats/{first}/open", headers=A)
client.post("/api/chat", json={"message": "Strengths?", "chat_id": second}, headers=A)
assert client.post(f"/api/chats/{second}/open", headers=A).json()["count"] == 4

# 5. rename, archive, time spent only grows
m = client.patch(f"/api/chats/{second}", json={"title": "HR round", "archived": True, "elapsed_ms": 125000}, headers=A).json()
assert m["title"] == "HR round" and m["archived"] and m["elapsed_ms"] == 125000, m
m = client.patch(f"/api/chats/{second}", json={"elapsed_ms": 1000}, headers=A).json()
assert m["elapsed_ms"] == 125000, "time spent went backwards"

# 6. tear a chapter out: it waits in The Attic, then comes back whole and opened
r = client.delete(f"/api/chats/{second}", headers=A).json()
assert second not in [c["id"] for c in r["chapters"]], r
bin_ = client.get("/api/recycle-bin", headers=A).json()["data"]["chats"]
assert bin_[0]["id"] == second and bin_[0]["count"] == 4 and bin_[0]["title"] == "HR round", bin_[0]
back = client.post("/api/recycle-bin/restore", json={"item_type": "chat", "id": second}, headers=A).json()
assert back["chapter"]["title"] == "HR round" and back["chapter"]["count"] == 4 and not back["chapter"]["archived"], back
assert client.get("/api/chats", headers=A).json()["open"] == back["chapter"]["id"]

# 7. the Daybook's numbers, and B's register is B's alone
st = client.get("/api/chats", headers=A).json()["stats"]
assert st["messages"] >= 3 and st["elapsed_ms"] >= 125000, st
rb = client.get("/api/chats", headers=B).json()
assert len(rb["chapters"]) == 1 and rb["chapters"][0]["count"] == 0, rb
assert client.post(f"/api/chats/{first}/open", headers=B).status_code == 404, "B opened A's chapter"

# 8. a brand-new account: the chapter it is shown is the chapter it can open (each request is a new store)
C = auth("user_c")
listed = client.get("/api/chats", headers=C).json()
assert client.post(f"/api/chats/{listed['open']}/open", headers=C).status_code == 200, "a new account could not open its first chapter"
assert client.get("/api/chats", headers=C).json()["open"] == listed["open"], "the first chapter changed between requests"

# 9. reading a chapter does not open it, and someone else's chapter is not found
open_before = client.get("/api/chats", headers=A).json()["open"]
other = next(c["id"] for c in client.get("/api/chats", headers=A).json()["chapters"] if c["id"] != open_before)
peek = client.get(f"/api/chats/{other}", headers=A)
assert peek.status_code == 200 and "messages" in peek.json(), peek.text
assert client.get("/api/chats", headers=A).json()["open"] == open_before, "a read opened the chapter"
assert client.get(f"/api/chats/{other}", headers=B).status_code == 404, "B read A's chapter"

# 10. the old chat routes still act on the open chapter
assert client.get("/api/chat/history", headers=A).json()["history"][0]["content"] == "Why this role?"

ai_utils.generate_multi_provider_completion = main_router
print("chapters check passed")
