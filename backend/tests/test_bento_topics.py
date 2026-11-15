"""
Brain Bento's own topics: adding one plans a menu of eight lessons (one AI call, duplicates dropped), adding it again
spends nothing, writing fills every lesson in one more call and is kept, people never see each other's topics, six is
the most a person keeps, and removing one takes it away.
Run from backend/:  python tests/test_bento_topics.py
"""

import base64
import json
import os
import tempfile
import time

DB = os.path.join(tempfile.mkdtemp(), "vettly-bento.db")
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
import users  # noqa: E402
import main  # noqa: E402
from ai import utils as ai_utils  # noqa: E402

KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class FakeJwks:
    def get_signing_key_from_jwt(self, token):
        return type("K", (), {"key": KEY.public_key()})()


users._jwks = FakeJwks()


def auth(sub):
    now = int(time.time())
    token = jwt.encode({"sub": sub, "iat": now, "exp": now + 300, "iss": "https://test.clerk.accounts.dev"}, KEY, algorithm="RS256")
    return {"Authorization": f"Bearer {token}"}


calls = []


async def fake_ai(system_prompt="", user_prompt="", fast=False, **k):
    calls.append(("menu" if "plan bite-sized" in system_prompt else "write", fast))
    if "plan bite-sized" in system_prompt:
        lessons = [{"id": f"idea-{i}", "title": f"Idea {i}", "hook": f"Why idea {i} matters", "keys": ["llm", "tokens"]} for i in range(8)]
        lessons.insert(3, {"id": "idea-2", "title": "Idea 2 again", "hook": "a repeat"})   # a repeated id: dropped
        return json.dumps({"lessons": lessons})
    return json.dumps({"lessons": [{"n": i + 1, "body": f"Body {i + 1}.", "analogy": "Like a kitchen.", "q": "Why?", "a": "Because.",
                                    "follow": ["And then?"], "diagram": {"type": "flow", "nodes": ["a", "b", "c"]}} for i in range(8)]})


ai_utils.generate_multi_provider_completion = fake_ai
client = TestClient(main.app)
A, B = auth("user_a"), auth("user_b")

# a topic too short is refused before any AI call
r = client.post("/api/bento/topics", json={"name": " x "}, headers=A)
assert r.status_code == 400 and not calls, r.text

# adding plans eight lessons on the light model, the repeat dropped, every lesson waiting to be written
r = client.post("/api/bento/topics", json={"name": "  Large   language models "}, headers=A)
assert r.status_code == 200, r.text
topic = r.json()["topic"]
assert topic["name"] == "Large language models" and topic["slug"] == "large-language-models", topic
assert len(topic["lessons"]) == 8 and all(l["pending"] and l["track"] == "t:large-language-models" for l in topic["lessons"]), topic
assert topic["lessons"][0]["id"] == "large-language-models--idea-0" and calls == [("menu", True)], (topic["lessons"][0], calls)

# adding it again (any spacing or case) spends nothing
r = client.post("/api/bento/topics", json={"name": "large language MODELS"}, headers=A)
assert r.status_code == 200 and r.json()["topic"]["slug"] == "large-language-models" and len(calls) == 1, calls

# writing fills every lesson in one call on the light model; asking again spends nothing
r = client.post("/api/bento/topics/large-language-models/write", headers=A)
assert r.status_code == 200, r.text
written = r.json()["topic"]["lessons"]
assert all("pending" not in l and l["en"]["body"] and l["diagram"]["nodes"] == ["a", "b", "c"] for l in written), written[0]
assert written[4]["en"]["body"] == "Body 5." and calls[-1] == ("write", True), (written[4], calls)
r = client.post("/api/bento/topics/large-language-models/write", headers=A)
assert r.status_code == 200 and len(calls) == 2, calls

# the topic is kept for its owner only
assert [t["slug"] for t in client.get("/api/bento/topics", headers=A).json()["topics"]] == ["large-language-models"]
assert client.get("/api/bento/topics", headers=B).json()["topics"] == []
assert client.post("/api/bento/topics/large-language-models/write", headers=B).status_code == 404

# six is the most a person keeps
for name in ["Kubernetes", "SEO", "Docker", "Redis", "GraphQL"]:
    assert client.post("/api/bento/topics", json={"name": name}, headers=A).status_code == 200
r = client.post("/api/bento/topics", json={"name": "Rust"}, headers=A)
assert r.status_code == 400 and "6 topics" in r.json()["error"], r.text

# removing one takes it away, and makes room again
assert client.delete("/api/bento/topics/seo", headers=A).json() == {"ok": True}
slugs = [t["slug"] for t in client.get("/api/bento/topics", headers=A).json()["topics"]]
assert "seo" not in slugs and len(slugs) == 5, slugs
assert client.post("/api/bento/topics", json={"name": "Rust"}, headers=A).status_code == 200

print("bento topics check passed")
