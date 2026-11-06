"""
Every-field check: Prep works from the onboarding profile alone (no resume), and Brain Bento's "Fresh today" is written
only when asked: a peek never spends an AI answer, the six are cached for the day, and tech fields can ask too.
Run from backend/:  python tests/test_fields.py
"""

import base64
import json
import os
import tempfile
import time

DB = os.path.join(tempfile.mkdtemp(), "vettly-fields.db")
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


class _Jwks:
    def get_signing_key_from_jwt(self, token):
        return type("Key", (), {"key": KEY.public_key()})()


users._jwks = _Jwks()


def auth(sub):
    now = int(time.time())
    tok = jwt.encode({"sub": sub, "iss": "https://test.clerk.accounts.dev", "iat": now, "exp": now + 600}, KEY, algorithm="RS256")
    return {"authorization": f"Bearer {tok}"}


calls = {"n": 0}
LESSON = {"title": "Shift handover drills", "hook": "h", "body": "b", "analogy": "a", "q": "q?", "a": "a.", "follow": ["f1", "f2"],
          "keys": ["handover"], "diagram": {"type": "flow", "nodes": ["One", "Two", "Three"]}}


async def fake_ai(*a, **k):
    calls["n"] += 1
    return json.dumps({"lessons": [dict(LESSON, id=f"l{i}") for i in range(6)]})


seen = {}


async def fake_question(**k):
    seen["context"] = k["context"]
    return {"question": "How do you prioritise patients at the start of a shift?", "answer": "draft", "category": k["category"], "keywords": []}


async def fake_validated(**k):
    return {"answer": "I check the handover notes, see the sickest first, then plan the round."}


saved = (ai_utils.generate_multi_provider_completion, main.qa_generator.generate_single_question, main.answer_validator.generate_validated_answer)
ai_utils.generate_multi_provider_completion = fake_ai
main.qa_generator.generate_single_question = fake_question
main.answer_validator.generate_validated_answer = fake_validated
client = TestClient(main.app)
N, T, E = auth("user_nurse"), auth("user_tech"), auth("user_empty")

# 1. no profile and no resume: Prep asks for the field and role first, in plain words
r = client.post("/prepare/single", json={"category": "CLINICAL_SKILLS"}, headers=E)
assert r.status_code == 400 and "field and role" in r.json()["error"], r.text

# 2. a nurse with only her onboarding answers can practise, and the AI sees her profile
client.post("/api/profile", json={"name": "Asha Rao", "field": "Healthcare", "role": "Staff nurse, ICU", "level": "Student or fresher"}, headers=N)
r = client.post("/prepare/single", json={"category": "CLINICAL_SKILLS"}, headers=N)
assert r.status_code == 200, r.text
assert "CANDIDATE PROFILE" in seen["context"] and "Staff nurse, ICU" in seen["context"] and "No resume" in seen["context"], seen["context"][:300]

# 3. opening Brain Bento peeks: nothing written, nothing spent
before = calls["n"]
assert client.get("/api/bento/field?peek=1", headers=N).json()["lessons"] is None
assert calls["n"] == before, "a peek spent an AI answer"

# 4. asking writes six "Fresh today" lessons, cached for the day; the next peek gets them free
r = client.get("/api/bento/field", headers=N).json()
assert len(r["lessons"]) == 6 and all(l["track"] == "fresh" for l in r["lessons"]), r
n = calls["n"]
again = client.get("/api/bento/field?peek=1", headers=N).json()
assert [l["id"] for l in again["lessons"]] == [l["id"] for l in r["lessons"]] and calls["n"] == n, "the cached six were not reused"

# 5. tech fields can ask for fresh ones too; someone with no profile gets none
client.post("/api/profile", json={"name": "Dev", "field": "Technology", "role": "Backend engineer", "level": "Early career"}, headers=T)
assert len(client.get("/api/bento/field", headers=T).json()["lessons"]) == 6
assert client.get("/api/bento/field", headers=E).json()["lessons"] is None

# 6. one user's fresh six are not another's
assert client.get("/api/bento/field?peek=1", headers=E).json()["lessons"] is None

# 7. several target roles: kept as a clean list (no blanks, no repeats, at most four), joined for every prompt
r = client.post("/api/profile", json={"name": "Asha Rao", "field": "Healthcare", "level": "Early career", "role": "ignored",
                                        "roles": ["Staff nurse, ICU", "  Pharmacist ", "pharmacist", "", 7, "Medical officer", "Clinical research associate", "Fifth role"]}, headers=N).json()
assert r["roles"] == ["Staff nurse, ICU", "Pharmacist", "Medical officer", "Clinical research associate"], r["roles"]
assert r["role"] == "Staff nurse, ICU · Pharmacist · Medical officer · Clinical research associate", r["role"]
client.post("/prepare/single", json={"category": "CLINICAL_SKILLS"}, headers=N)
assert "Target roles (prepare for any of these): Staff nurse, ICU; Pharmacist; Medical officer; Clinical research associate" in seen["context"], seen["context"][:400]
# an older client that sends one role still gets a one-item list
r = client.post("/api/profile", json={"role": "Staff nurse, ward"}, headers=N).json()
assert r["roles"] == ["Staff nurse, ward"] and r["role"] == "Staff nurse, ward", r

ai_utils.generate_multi_provider_completion, main.qa_generator.generate_single_question, main.answer_validator.generate_validated_answer = saved
print("fields check passed")
