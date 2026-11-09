"""
Vettly — Main FastAPI Server
WebSocket-based real-time interview assistant.
"""

import asyncio
import json
import os
import logging
import sys
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

# Prevent Windows cp1252 UnicodeEncodeError on console prints/logs
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

import config
import allowance
import docstore
import users
from users import PerUser
from stt.deepgram_client import DeepgramSTTClient
from ai.context_engine import ContextEngine
from ai.filler_generator import FillerGenerator
from ai.answer_generator import AnswerGenerator
from ai.humanizer import Humanizer
from ai.qa_generator import QAGenerator
from ai.answer_validator import AnswerValidator
from context.resume_parser import ResumeParser
from context.github_scraper import GitHubScraper
from context.qa_cache import QACache
from context.question_matcher import QuestionMatcher

# ─── Logging ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(name)-20s │ %(levelname)-7s │ %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("vettly")


# ─── Global State ─────────────────────────────────────────────
# Stores that hold someone's data are PerUser: each request sees only the signed-in user's own copy
context_engine = PerUser(ContextEngine)
filler_gen = FillerGenerator()
answer_gen = AnswerGenerator()
humanizer = Humanizer()
resume_parser = ResumeParser()
github_scraper = GitHubScraper()
qa_generator = QAGenerator()
answer_validator = AnswerValidator()
qa_cache = PerUser(QACache)
question_matcher = QuestionMatcher(qa_cache)


def is_text_hinglish(text: str) -> bool:
    """Helper to detect Hinglish/Hindi in Roman script or Devanagari.
    Optimized for STT (Deepgram) transcriptions where Hindi words get
    phonetically transcribed into English-looking text."""
    text_lower = text.lower()
    # Check for Devanagari range
    if any(ord(char) >= 0x0900 and ord(char) <= 0x097F for char in text):
        return True
    
    # Common Hinglish/Hindi Roman words — expanded for STT phonetic transcription
    hinglish_words = {
        # Core Hindi words
        "kya", "hai", "kaise", "apna", "batao", "toh", "haan", "sahi", "achha", "maine",
        "humne", "hoga", "raha", "rahi", "isme", "isko", "kiya", "diya", "liya",
        "karna", "baat", "chahiye", "sakte", "rha", "rhi", "hoon", "hota", "hoti",
        "jaise", "bhi", "aur", "kab", "tab", "jab", "ko", "ne", "unse", "apne",
        "mera", "meri", "karo", "karke", "kya-kya", "accha",
        "aaj", "kal", "parso", "yaar", "chal", "chalo", "chalega", "badhiya",
        "aap", "aapka", "aapki", "aapne", "chahiye", "chaiye", "krna", "krte",
        "ho", "hu", "hain", "hun", "thi", "tha",
        # STT-transcribed phonetic Hindi (Deepgram often outputs these)
        "mujhe", "tumne", "kitne", "kitna", "kahan", "kaun", "kaisa",
        "samjhao", "samjha", "samajh", "dekho", "dekh", "dikhao",
        "pehle", "baad", "uske", "iske", "usne", "inhone", "unhone",
        "kuch", "sab", "sabko", "sabse", "bahut", "zyada", "thoda",
        "wala", "wali", "wale", "nahi", "nhi", "nahin", "mat",
        "abhi", "yaha", "waha", "idhar", "udhar", "kahi",
        "btao", "bta", "btaiye", "bataiye", "bataye", "batayen",
        "hum", "tum", "wo", "ye", "yeh", "woh", "inhe", "unhe",
        "kr", "krke", "krna", "krega", "krunga", "karenge", "karunga",
        "bol", "bolo", "bola", "bolna", "bolte", "bolen",
        "laga", "lagta", "lagti", "lage", "lagega",
        "mil", "mila", "milta", "milega", "milna",
        "chala", "chali", "chalte", "chalega", "chalna",
        "pata", "pta", "patha", "maloom",
        "theek", "thik", "shukriya", "dhanyavaad",
        "matlab", "yaani", "lekin", "magar", "isliye", "kyunki", "kyuki",
        "agar", "phir", "fir", "warna", "taki",
        "paisa", "paise", "rupaye", "rupee",
        "kaam", "kaise", "kaisa",
    }

    import re
    # Strip punctuation to get exact words
    words = [re.sub(r'[^\w\s]', '', w) for w in text_lower.split()]
    words = [w for w in words if w]
    if len(words) < 2:
        return False
    
    # Direct exact match with length check
    matched = []
    for w in words:
        for hw in hinglish_words:
            if len(hw) >= 3 and hw == w:
                matched.append(w)
    
    hinglish_ratio = len(matched) / len(words) if words else 0
    # Relaxed threshold: 2+ hinglish words AND > 15% ratio
    if len(matched) >= 2 and hinglish_ratio > 0.15:
        return True
    return False

def auto_detect_context_mode(question: str, current_mode: str, is_locked: bool = False) -> str:
    """Auto-detect context mode based on keywords in the question.
    Skips detection if user has manually locked the context mode."""
    if is_locked:
        return current_mode
    q_lower = question.lower()
    # any candidate: questions about past roles lean on experience, questions about things they built on projects
    if any(kw in q_lower for kw in ["your last job", "previous role", "internship", "at your company", "your manager", "work experience"]):
        return "experience"
    elif any(kw in q_lower for kw in ["your project", "you built", "you made", "final-year project", "capstone"]):
        return "projects"
    return current_mode

def profile_context() -> str:
    """The candidate's onboarding answers as a short context block, so Prep and Copilot work with no resume at all."""
    prof = profile_store.get()
    rows = [(k, (prof.get(k) or "").strip()) for k in ("name", "field", "role", "level")]
    rows = [f"{k.title()}: {v}" for k, v in rows if v]
    if len(prof.get("roles") or []) > 1:   # several target roles: say so, so questions spread across them
        rows = [r if not r.startswith("Role: ") else f"Target roles (prepare for any of these): {'; '.join(prof['roles'])}" for r in rows]
    return ("=== CANDIDATE PROFILE ===\n" + "\n".join(rows) + "\n(No resume uploaded: keep examples general and true to this field and level, never invent employers or projects.)") if rows else ""


def candidate_context(mode: str = "all") -> str:
    """Everything the AI may know about the candidate: their profile, then resume, notes, GitHub and the rest."""
    base = context_engine.get_full_context(mode)
    prof = profile_context()
    if not prof:
        return base
    return prof + ("\n\n" + base if context_engine.has_context() else "")


def has_any_context() -> bool:
    """A resume, notes or a JD, or at least the field and role from onboarding."""
    prof = profile_store.get()
    return context_engine.has_context() or bool(prof.get("field") or prof.get("role"))


def who() -> str:
    """The candidate's own name and role for prompts, from their profile (set at onboarding)."""
    prof = profile_store.get()
    name = prof.get("name") or "the candidate in YOUR BACKGROUND"
    return f"{name}, {prof['role']}" if prof.get("role") else name


# New stores for dashboard features
from stores import HistoryStore, AboutMeStore, ChatHistoryStore, RecycleBinStore, ProfileStore
profile_store = PerUser(ProfileStore)
history_store = PerUser(HistoryStore)
about_me_store = PerUser(AboutMeStore)
chat_store = PerUser(ChatHistoryStore)
recycle_bin_store = PerUser(RecycleBinStore)

# Track active interview sessions
active_sessions: dict[str, dict] = {}


# ─── App Lifecycle ────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup
    errors = config.validate_config()
    if errors:
        for err in errors:
            logger.warning(f"⚠️  {err}")
        logger.warning("Some features may not work without valid API keys.")
    else:
        logger.info("✅ All API keys validated")

    provider_name = config.get_active_llm_provider().upper()
    studio_url = f"http://{config.HOST}:{config.PORT}"
    if users.auth_enabled():
        logger.info(f"🔐 Sign-in on (Clerk), data in {'Postgres' if config.DATABASE_URL else 'local files'}")
    else:
        logger.info(f"📦 Q&A cache: {qa_cache.count} prepared answers (single-user local mode)")
    logger.info(f"🚀 Vettly Studio ready at: {studio_url} (Engine: {provider_name})")
    print(
        f"\n  ┌──────────────────────────────────────────────────────────────┐\n"
        f"  │  ❖ VETTLY — AI CAREER ARCHITECT & PREP STUDIO                │\n"
        f"  ├──────────────────────────────────────────────────────────────┤\n"
        f"  │  🌐 Studio Dashboard : {studio_url:<38}│\n"
        f"  │  🔌 Health Telemetry : {studio_url + '/api/health':<38}│\n"
        f"  │  🧠 Active AI Engine : {provider_name:<38}│\n"
        f"  └──────────────────────────────────────────────────────────────┘\n",
        flush=True,
    )

    yield

    # Shutdown
    logger.info("👋 Vettly server shutting down")


# ─── FastAPI App ──────────────────────────────────────────────
app = FastAPI(
    title="Vettly",
    description="AI-Powered Career Architect & Technical Prep Studio",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS: the web app is served from the same origin, so cross-site callers are only allowed from ALLOWED_ORIGINS.
# Sign-in travels as a bearer token, never a cookie, so no credentials are ever shared cross-site.
_origins = [o.strip().rstrip("/") for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins or ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["authorization", "content-type"],
)
# Text goes out compressed (about 70% smaller on a phone). Live-streamed answers (text/event-stream) are left alone,
# so they still arrive word by word.
from starlette.middleware.gzip import GZipMiddleware  # noqa: E402
app.add_middleware(GZipMiddleware, minimum_size=1024)

# ─── Who is asking ───────────────────────────────────────────
@app.middleware("http")
async def who_is_asking(request: Request, call_next):
    """Each request starts with nobody signed in; anything that reads or writes data needs a verified session."""
    users.begin_request()
    allowance.own_keys.set(None)
    allowance.own_custom.set(None)
    shared_left = None   # free answers left today, when this answer runs on Vettly's shared keys
    if request.method != "OPTIONS" and users.is_protected(request.url.path):
        try:
            users.authenticate(request.headers.get("authorization", ""))
            if allowance.is_ai(request.url.path, request.method):
                shared_left = allowance.begin_ai_call()
        except users.AuthError as e:
            return JSONResponse(status_code=e.status, content={"detail": str(e)})
        except allowance.LimitReached as e:
            return JSONResponse(status_code=429, content={"detail": str(e)})
    response = await call_next(request)
    if shared_left is not None:   # the page counts these and now and then suggests the user's own free key
        response.headers["X-Vettly-Free-Left"] = str(shared_left)
    # browser hardening: no MIME sniffing, no framing by other sites, no full URLs leaked to other origins
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if users.is_protected(request.url.path):
        response.headers.setdefault("Cache-Control", "no-store")   # personal data never sits in shared caches
    return response


# ─── Static Files (Web Dashboard) ────────────────────────────
web_dir = Path(__file__).resolve().parent.parent / "web"

# ─── REST Endpoints ──────────────────────────────────────────

@app.get("/api/health")
async def root():
    """Health check."""
    return {
        "status": "running",
        "name": "Vettly",
        "version": "1.0.0",
        "provider": config.get_active_llm_provider(),
        "context_loaded": users.has_user() and context_engine.has_context(),
    }


@app.get("/api/config")
async def client_config():
    """What the web app needs before anyone signs in: whether sign-in is on, and Clerk's public key."""
    if not users.auth_enabled():
        return {"auth": "unconfigured" if config.ON_VERCEL else "none"}
    return {
        "auth": "clerk",
        "clerk_publishable_key": config.CLERK_PUBLISHABLE_KEY,
        "clerk_frontend_api": users.frontend_api(),
    }


@app.get("/api/profile")
async def get_profile():
    """The user's name, field, target role and level (empty until onboarding)."""
    return profile_store.get()


@app.post("/api/profile")
async def save_profile(request: Request):
    """Save onboarding answers; prompts, prep categories and daily concepts follow them."""
    return profile_store.update(await request.json())


@app.post("/api/prefs")
async def save_prefs(request: Request):
    """Per-account preferences, such as hidden optional tabs."""
    return {"prefs": profile_store.set_prefs(await request.json())}


TECH_FIELDS = ("", "technology", "software", "it", "engineering")


@app.get("/prepare/categories")
async def prep_categories():
    """Prep Studio's category tiles for this user's field: None keeps the curated tech set, otherwise eight
    AI-written categories for their field and role, cached in the profile until either changes."""
    prof = profile_store.get()
    field, role = (prof.get("field") or "").strip(), (prof.get("role") or "").strip()
    if field.lower() in TECH_FIELDS:
        return {"categories": None}
    key = f"{field}|{role}".lower()
    cached = prof.get("categories")
    if cached and prof.get("categories_for") == key:
        return {"categories": cached}
    from ai.utils import generate_multi_provider_completion
    import re
    try:
        allowance.begin_ai_call()
        raw = await generate_multi_provider_completion(
            system_prompt=(
                "You design interview practice categories. Return ONLY a JSON object: "
                '{"categories": [{"id": "UPPER_SNAKE_ID", "label": "Two or three words"}]} with exactly 8 categories '
                "that real interviewers use for this field and role. The first must be GENERAL (label: All-in-One) "
                "and include BEHAVIORAL and HR_CULTURE_FIT. Use the field's own words."
            ),
            user_prompt=f"Field: {field}\nTarget role: {role or 'any role in this field'}\nLevel: {prof.get('level') or 'any'}",
            max_tokens=600, temperature=0.4, json_mode=True,
        )
    except Exception as e:   # no AI key yet, or the provider is down: keep the standard tiles
        logger.warning(f"Field categories unavailable: {e}")
        return {"categories": None}
    try:
        items = json.loads(raw[raw.find("{"): raw.rfind("}") + 1])["categories"]
        cats = []
        for c in items:
            cid = re.sub(r"[^A-Z0-9_]", "_", str(c.get("id", "")).upper())[:40].strip("_")
            if re.fullmatch(r"[A-Z][A-Z0-9_]{1,39}", cid) and cid not in [x["id"] for x in cats]:
                cats.append({"id": cid, "label": str(c.get("label", cid.title()))[:32]})
        cats = cats[:9]
    except Exception:
        return {"categories": None}
    profile_store.get().update({"categories": cats, "categories_for": key})
    docstore.save(users.user_id(), "profile", profile_store.get())
    return {"categories": cats}


@app.get("/api/bento/field")
async def bento_for_field(peek: bool = False):
    """Brain Bento's "Fresh today": six concepts written for the user's own field and role, cached for the day. The
    built-in packs (web/bento-fields.js) need no AI; these are extra. `peek` returns today's six only if they were
    already written, so opening Brain Bento never spends an answer: the user asks for them with a button."""
    prof = profile_store.get()
    field, role = (prof.get("field") or "").strip(), (prof.get("role") or "").strip()
    if not field and not role:
        return {"lessons": None}
    today = datetime.now().strftime("%Y-%m-%d")
    uid = users.user_id()
    cached = docstore.load(uid, "bento_field", {})
    if cached.get("day") == today and cached.get("for") == f"{field}|{role}" and cached.get("lessons"):
        return {"lessons": cached["lessons"], "field": field or role}
    if peek:
        return {"lessons": None}
    from ai.utils import generate_multi_provider_completion
    try:
        allowance.begin_ai_call()
        raw = await generate_multi_provider_completion(
            system_prompt=(
                "You write bite-sized daily lessons that help a job candidate sound sharp in interviews. Return ONLY JSON: "
                '{"lessons": [{"id": "kebab-id", "title": "...", "hook": "one short line", "body": "2-3 plain sentences", '
                '"analogy": "one everyday comparison", "q": "an interview question on it", "a": "a strong 2-3 sentence answer", '
                '"follow": ["follow-up question", "follow-up question"], "keys": ["keyword", "keyword"], '
                '"diagram": {"type": "flow", "nodes": ["3 to 5 short steps"]}}]} with exactly 6 lessons. '
                "Use the field's real concepts, standards and situations, at the given level. Simple words."
            ),
            user_prompt=f"Field: {field or 'not given'}\nTarget role: {role or 'any role in this field'}\nLevel: {prof.get('level') or 'any'}\nDate: {today}",
            max_tokens=3500, temperature=0.7, json_mode=True,
        )
        items = json.loads(raw[raw.find("{"): raw.rfind("}") + 1])["lessons"]
    except allowance.LimitReached as e:
        return {"lessons": None, "error": str(e)}
    except Exception as e:
        logger.warning(f"Field concepts unavailable: {e}")
        return {"lessons": None, "error": "Couldn't write fresh ones just now. Today's box still has plenty."}
    lessons = []
    for i, l in enumerate(items[:6]):
        if not isinstance(l, dict) or not l.get("title") or not l.get("body"):
            continue
        nodes = [str(n)[:40] for n in (l.get("diagram") or {}).get("nodes", [])][:5]
        lessons.append({
            "id": f"f{i}-" + "".join(ch for ch in str(l.get("id", "")).lower() if ch.isalnum() or ch == "-")[:40],
            "track": "fresh", "keys": [str(k).lower()[:30] for k in l.get("keys", [])][:6],
            "diagram": {"type": "flow", "nodes": nodes} if len(nodes) >= 3 else None,
            "en": {k: (l.get(k) if k == "follow" else str(l.get(k, ""))[:900]) for k in ("title", "hook", "body", "analogy", "q", "a", "follow")},
        })
    if not lessons:
        return {"lessons": None}
    docstore.save(uid, "bento_field", {"day": today, "for": f"{field}|{role}", "lessons": lessons})
    return {"lessons": lessons, "field": field or role}


@app.get("/api/ai-key")
async def ai_key_status():
    """Today's free AI answers left, and whether the user has saved their own provider key."""
    return allowance.status()


@app.post("/api/ai-key")
async def ai_key_save(request: Request):
    data = await request.json()
    try:
        if data.get("provider") == "custom":   # the user's own OpenAI-compatible provider
            return await allowance.save_custom(data)
        return allowance.save_key(str(data.get("provider", "")), str(data.get("key", "")))
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


@app.delete("/api/ai-key")
async def ai_key_remove(provider: str = ""):
    """Remove one provider's key (?provider=gemini), or every saved key."""
    return allowance.remove_key(provider)


@app.post("/api/ai-key/test")
async def ai_key_test(request: Request):
    """Check a key with the provider without spending tokens: the pasted one, or the saved one."""
    data = await request.json()
    try:
        return await allowance.test_key(str(data.get("provider", "")), str(data.get("key", "") or ""))
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


@app.get("/api/me/export")
async def export_my_data():
    """Everything this user saved, as one JSON file. Secrets (saved AI keys) and usage counters stay out."""
    from fastapi.responses import Response
    docs = {k: v for k, v in docstore.export_user(users.user_id()).items() if k not in ("ai_keys", "ai_key", "usage")}
    body = json.dumps({"exported_at": datetime.now().isoformat(timespec="seconds"), "documents": docs}, ensure_ascii=False, indent=2)
    return Response(body, media_type="application/json", headers={"Content-Disposition": 'attachment; filename="vettly-export.json"'})


@app.delete("/api/me")
async def delete_my_data():
    """Delete everything this user saved in Vettly (the sign-in account itself lives in Clerk)."""
    try:
        docstore.delete_user(users.user_id())
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    return {"status": "deleted"}


@app.get("/status")
async def get_status():
    """Get server status and active sessions."""
    return {
        "active_sessions": len(active_sessions),
        "context_loaded": context_engine.has_context(),
        "resume_loaded": context_engine.has_resume(),
        "github_loaded": context_engine.has_github(),
        "config": {
            "provider": config.get_active_llm_provider(),
            "model": config.GROQ_MODEL,
            "language": config.DEFAULT_LANGUAGE,
            "hinglish_mode": config.HINGLISH_MODE,
        },
    }


@app.post("/upload/resume")
async def upload_resume(file: UploadFile = File(...)):
    """Upload and parse a resume (PDF or DOCX)."""
    try:
        content = await file.read()
        filename = Path(file.filename or "resume").name   # a bare name: "../" can never climb out of uploads/
        if len(content) > 10 * 1024 * 1024:
            return JSONResponse(status_code=413, content={"error": "That file is over 10 MB"})

        if users.auth_enabled():
            # hosted: parse a temporary copy and keep only the text, never the file
            import os
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=Path(filename).suffix, delete=False) as tmp:
                tmp.write(content)
            try:
                parsed = resume_parser.parse(Path(tmp.name))
            finally:
                os.unlink(tmp.name)
        else:
            save_path = config.UPLOADS_DIR / filename
            save_path.write_bytes(content)
            parsed = resume_parser.parse(save_path)
        parsed["file_name"] = filename
        context_engine.set_resume(parsed)

        logger.info(f"📄 Resume uploaded and parsed: {filename}")
        return {
            "status": "success",
            "filename": filename,
            "parsed_sections": list(parsed.keys()),
            "preview": parsed.get("summary", "")[:200],
        }
    except Exception as e:
        logger.error(f"Resume upload failed: {e}")
        return JSONResponse(status_code=400, content={"error": str(e)})


@app.post("/upload/context")
async def upload_custom_context(
    title: str = Form(...),
    content: str = Form(...),
):
    """Add custom context (skills, stories, project details)."""
    context_engine.add_custom_context(title, content)
    logger.info(f"📝 Custom context added: {title}")
    return {"status": "success", "title": title}


from pydantic import BaseModel, Field
from typing import Optional

class GenerateQuestionsRequest(BaseModel):
    job_role: Optional[str] = None
    company: Optional[str] = None
    count: int = 100

class EvaluateAnswerRequest(BaseModel):
    question: str
    user_answer: str

@app.post("/api/prep/generate_questions")
async def api_generate_questions(req: GenerateQuestionsRequest):
    """Generate interview questions for prep."""
    context = context_engine.build_system_context()
    questions = await qa_generator.generate_questions(
        context=context,
        count=req.count,
        job_role=req.job_role,
        company=req.company
    )
    return {"status": "success", "questions": questions}

@app.post("/api/prep/evaluate_answer")
async def api_evaluate_answer(req: EvaluateAnswerRequest):
    """Evaluate a user's practice answer."""
    context = context_engine.build_system_context()
    # Simple direct Groq call for review
    prompt = f"""
You are an expert interview coach reviewing a candidate's practice answer.
Context about candidate: {context[:2000]}

Question: {req.question}
Candidate's Answer: {req.user_answer}

Provide constructive feedback on their answer. Point out strengths, weaknesses, and provide a polished, ideal version of the answer. Keep it concise.
"""
    try:
        from ai.utils import generate_multi_provider_completion
        feedback = await generate_multi_provider_completion(
            system_prompt="You are an expert interview coach.", user_prompt=prompt, max_tokens=800, temperature=0.7,
        )
        return {"status": "success", "feedback": feedback}
    except Exception as e:
        logger.error(f"Failed to evaluate answer: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/github/repos/{username}")
async def get_github_repos(username: str):
    """Fetch all public repositories for a given GitHub username."""
    try:
        repos = await github_scraper.fetch_user_repos(username)
        return {"status": "success", "username": username, "repos": repos}
    except Exception as e:
        logger.error(f"Failed to fetch repos for {username}: {e}")
        return JSONResponse(status_code=400, content={"error": str(e)})

@app.post("/github/import")
async def import_github(
    username: str = Form(...),
    repos: str = Form(default=""),  # comma-separated repo names, empty = all
):
    """Import GitHub profile and repo details."""
    try:
        repo_list = [r.strip() for r in repos.split(",") if r.strip()] if repos else None
        profile_data = await github_scraper.scrape_profile(username, repo_list)
        context_engine.set_github(profile_data)

        logger.info(f"🐙 GitHub profile imported: {username}")
        return {
            "status": "success",
            "username": username,
            "repos_imported": len(profile_data.get("repos", [])),
        }
    except Exception as e:
        logger.error(f"GitHub import failed: {e}")
        return JSONResponse(status_code=400, content={"error": str(e)})


@app.get("/context")
async def get_context():
    """Get the current loaded context summary."""
    return {
        "resume": context_engine.get_resume_summary(),
        "resume_file": context_engine._resume.get("file_name"),
        "github": context_engine._github,
        "custom": context_engine.get_custom_contexts(),
        "full_context_length": len(candidate_context()),
    }


@app.delete("/context")
async def clear_context():
    """Clear all loaded context."""
    context_engine.clear()
    return {"status": "success", "message": "All context cleared"}


@app.post("/context/structured")
async def add_structured_context(request: Request):
    """Add structured context from the multi-tab dashboard."""
    try:
        data = await request.json()
        if not data:
            return JSONResponse(status_code=400, content={"error": "No data provided"})
        context_engine.set_structured_context(data)
        return {"status": "success", "categories": list(data.keys())}
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


@app.get("/context/structured")
async def get_structured_context():
    """Get previously saved structured context."""
    return context_engine.get_structured_context()


@app.get("/context/resume-extract")
async def get_resume_extract():
    """Get parsed resume data in structured format for auto-fill."""
    extract = context_engine.get_resume_extract()
    if not extract:
        return JSONResponse(status_code=404, content={"error": "No resume uploaded"})
    return extract


@app.get("/context/job-description")
async def get_job_description():
    """Get the currently saved job description."""
    jd_content = ""
    for item in context_engine._custom:
        if item.get("title") == "TARGET_JOB_DESCRIPTION":
            jd_content = item.get("content", "")
            break
            
    if not jd_content:
        return {}
        
    title = ""
    company = ""
    desc = ""
    
    lines = jd_content.split("\n")
    for i, line in enumerate(lines):
        if line.startswith("Job Title: "):
            title = line.replace("Job Title: ", "").strip()
        elif line.startswith("Company: "):
            company = line.replace("Company: ", "").strip()
        elif line.startswith("Job Description:"):
            desc = "\n".join(lines[i+1:]).strip()
            break
            
    return {
        "title": title,
        "company": company,
        "description": desc
    }


@app.post("/context/job-description")
async def add_job_description(
    title: str = Form(default=""),
    company: str = Form(default=""),
    description: str = Form(...),
):
    """Add job description context for targeted answers."""
    jd_content = ""
    if title:
        jd_content += f"Job Title: {title}\n"
    if company:
        jd_content += f"Company: {company}\n"
    jd_content += f"\nJob Description:\n{description}"

    context_engine.add_custom_context("TARGET_JOB_DESCRIPTION", jd_content)
    
    # Sync into assignment context so answers are prioritized and grounded
    existing_assignment = context_engine.get_assignment() or {}
    updated_assignment = {
        **existing_assignment,
        "title": title or existing_assignment.get("title", "the target role"),
        "company": company or existing_assignment.get("company", "Soft System Solution"),
        "description": description,
    }
    context_engine.set_assignment(updated_assignment)
    logger.info(f"📋 Job description added & assignment synchronized: {title} at {company}")

    return {
        "status": "success",
        "message": f"Job description saved: {title or 'Untitled'} at {company or 'Unknown'}",
    }


@app.post("/context/notes")
async def add_interview_notes(
    notes: str = Form(...),
):
    """Add personal interview notes/tips."""
    context_engine.add_custom_context("INTERVIEW_NOTES", notes)
    logger.info("📝 Interview notes added")
    return {"status": "success", "message": "Interview notes saved"}


# ─── Q&A Preparation Endpoints ────────────────────────────────

@app.post("/prepare")
async def prepare_qa(
    job_role: str = Form(default=""),
    company: str = Form(default=""),
    count: int = Form(default=60),
):
    """Generate pre-interview Q&A pairs from loaded context."""
    if not has_any_context():
        return JSONResponse(
            status_code=400,
            content={"error": "Tell Vettly your field and role first (Settings → Edit profile), or add a resume in Agent Toolbelt."},
        )

    if qa_cache.status.get("running"):
        return JSONResponse(
            status_code=409,
            content={"error": "Preparation already in progress.", "status": qa_cache.status},
        )

    # Run preparation in background
    asyncio.create_task(
        _run_preparation(job_role or None, company or None, count)
    )

    return {
        "status": "started",
        "message": f"Generating ~{count} Q&A pairs. This takes 3-5 minutes.",
        "check_progress": "GET /prepare/status",
    }


async def _run_preparation(
    job_role: str = None, company: str = None, count: int = 60
):
    """Background task: generate questions → validate answers → cache."""
    from datetime import datetime

    qa_cache.set_generation_status(
        running=True, total=0, completed=0, failed=0,
        started_at=datetime.now().isoformat(), finished_at=None,
    )

    try:
        full_context = candidate_context()

        # Step 1: Generate questions
        logger.info("📝 Step 1/2: Generating interview questions...")
        questions = await qa_generator.generate_questions(
            context=full_context,
            count=count,
            job_role=job_role,
            company=company,
        )

        if not questions:
            logger.error("❌ No questions generated")
            qa_cache.set_generation_status(running=False, finished_at=datetime.now().isoformat())
            return

        qa_cache.set_generation_status(total=len(questions))
        logger.info(f"📝 Generated {len(questions)} questions. Now generating validated answers...")

        # Step 2: Generate and validate answers for each question
        logger.info("🔄 Step 2/2: Generating & validating answers (iterative humanization loop)...")

        for i, q in enumerate(questions):
            question_text = q.get("question", "")
            if not question_text:
                continue

            try:
                logger.info(f"  [{i+1}/{len(questions)}] {question_text[:70]}...")

                # Generate + validate through humanization loop (use quick_mode to prevent rate limits)
                result = await answer_validator.generate_validated_answer(
                    question=question_text,
                    context=full_context,
                    quick_mode=True,
                )

                if result["answer"]:
                    qa_cache.add_entry(
                        question=question_text,
                        answer=result["answer"],
                        category=q.get("category", "GENERAL"),
                        keywords=q.get("keywords", []),
                        difficulty=q.get("difficulty", "medium"),
                        score=result["score"],
                        iterations=result["iterations"],
                    )
                    qa_cache.set_generation_status(
                        completed=qa_cache.status["completed"] + 1
                    )
                else:
                    qa_cache.set_generation_status(
                        failed=qa_cache.status["failed"] + 1
                    )

                # Save every 5 questions (in case of crash)
                if (i + 1) % 5 == 0:
                    qa_cache.save()

                # Small delay to avoid rate limiting
                await asyncio.sleep(0.5)

            except Exception as e:
                logger.error(f"  ❌ Failed for Q{i+1}: {e}")
                qa_cache.set_generation_status(
                    failed=qa_cache.status["failed"] + 1
                )

        # Final save
        qa_cache.save()
        qa_cache.set_generation_status(
            running=False, finished_at=datetime.now().isoformat()
        )

        stats = qa_cache.get_stats()
        logger.info(
            f"✅ Preparation complete! {stats['total']} Q&A pairs cached "
            f"(avg score: {stats['avg_score']}/10)"
        )

    except Exception as e:
        logger.error(f"❌ Preparation failed: {e}")
        qa_cache.set_generation_status(
            running=False, finished_at=datetime.now().isoformat()
        )


@app.get("/prepare/status")
async def prepare_status():
    """Check Q&A preparation progress."""
    return qa_cache.status


@app.get("/prepare/questions")
async def get_prepared_questions():
    """Get all prepared Q&A pairs."""
    entries = qa_cache.get_all()
    stats = qa_cache.get_stats()
    return {
        "stats": stats,
        "entries": entries,
    }


@app.delete("/prepare")
async def clear_prepared():
    """Clear the Q&A cache."""
    qa_cache.clear()
    return {"status": "success", "message": "Q&A cache cleared"}


@app.post("/prepare/refine")
async def refine_answer(request: Request):
    """Refine a prepared Q&A answer based on user feedback (RL loop)."""
    try:
        data = await request.json()
        index = data.get("index")
        instruction = data.get("instruction", "")
        if index is None or not instruction:
            return JSONResponse(status_code=400, content={"error": "index and instruction required"})

        entries = qa_cache.get_all()
        if index < 0 or index >= len(entries):
            return JSONResponse(status_code=404, content={"error": "Invalid Q&A index"})

        entry = entries[index]
        full_context = candidate_context()

        from ai.prompts import REFINE_SYSTEM_PROMPT, REFINE_USER_TEMPLATE
        from ai.utils import generate_multi_provider_completion

        user_prompt = REFINE_USER_TEMPLATE.format(
            context=full_context[:15000],
            question=entry["question"],
            original_answer=entry["answer"],
            instruction=instruction,
        )

        new_answer = await generate_multi_provider_completion(
            system_prompt=REFINE_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            max_tokens=600,
            temperature=0.7,
        )
        qa_cache.update_entry(index, answer=new_answer)
        qa_cache.save()
        
        # Save to permanent context as well
        structured = context_engine.get_structured_context()
        if "qa_bank" not in structured:
            structured["qa_bank"] = []
        
        # Check if the question exists, if so update it, otherwise add it
        existing = next((q for q in structured["qa_bank"] if q["question"] == entry["question"]), None)
        if existing:
            existing["answer"] = new_answer
        else:
            structured["qa_bank"].append({"question": entry["question"], "answer": new_answer})
        
        context_engine.set_structured_context(structured)

        logger.info(f"✏️ Refined Q&A #{index}: {instruction[:50]}...")
        return {
            "status": "success",
            "index": index,
            "new_answer": new_answer,
        }
    except Exception as e:
        logger.error(f"Refinement failed: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/prepare/feedback")
async def prepare_feedback(request: Request):
    """Store accept/reject feedback for a prepared Q&A (RL data collection)."""
    try:
        data = await request.json()
        index = data.get("index")
        rating = data.get("rating")  # 'accept' or 'reject'
        if index is None or rating not in ("accept", "reject"):
            return JSONResponse(status_code=400, content={"error": "index and rating (accept/reject) required"})

        qa_cache.update_entry(index, user_rating=rating)
        qa_cache.save()

        logger.info(f"{'✅' if rating == 'accept' else '❌'} Q&A #{index} rated: {rating}")
        return {"status": "success", "index": index, "rating": rating}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


# ─── Single Question Generation (One-at-a-Time Prep) ──────────

@app.post("/prepare/single")
async def prepare_single_question(request: Request):
    """Generate a single Q&A pair for a specific category. No rate limiting issues."""
    try:
        data = await request.json()
        category = data.get("category", "TECHNICAL").upper()
        job_role = data.get("job_role", "")
        company = data.get("company", "")
        language = data.get("language", "ENGLISH").upper()

        import re
        # the curated tech categories, or a field's own (see /prepare/categories): short upper-case names
        if not re.fullmatch(r"[A-Z][A-Z0-9_]{1,39}", category):
            return JSONResponse(status_code=400, content={"error": "Invalid category name."})

        if not has_any_context():
            return JSONResponse(
                status_code=400,
                content={"error": "Tell Vettly your field and role first (Settings → Edit profile), or add a resume in Agent Toolbelt."},
            )

        full_context = candidate_context()

        # Get existing questions to avoid duplicates
        existing = [e["question"] for e in qa_cache.get_all()]

        logger.info(f"🎯 Generating single [{category}] question...")

        result = await qa_generator.generate_single_question(
            context=full_context,
            category=category,
            job_role=job_role or None,
            company=company or None,
            language=language,
            existing_questions=existing,
        )

        if not result:
            return JSONResponse(
                status_code=500,
                content={"error": "Failed to generate question. Try again."},
            )

        # Now generate a validated answer through the humanization loop
        logger.info(f"🔄 Generating validated answer for: {result['question'][:60]}...")
        validated = await answer_validator.generate_validated_answer(
            question=result["question"],
            context=full_context,
            quick_mode=True,
            language=language.lower(),
        )

        answer = validated["answer"] or result.get("answer", "")

        # Add to cache
        qa_cache.add_entry(
            question=result["question"],
            answer=answer,
            category=result.get("category", category),
            keywords=result.get("keywords", []),
            difficulty=result.get("difficulty", "medium"),
            score=validated.get("score", 7.0),
            iterations=validated.get("iterations", 0),
        )
        qa_cache.save()

        entry_index = len(qa_cache.get_all()) - 1

        logger.info(f"✅ Single Q&A generated [{category}] — total now: {len(qa_cache.get_all())}")
        return {
            "status": "success",
            "index": entry_index,
            "entry": {
                "question": result["question"],
                "answer": answer,
                "category": result.get("category", category),
                "keywords": result.get("keywords", []),
                "difficulty": result.get("difficulty", "medium"),
                "score": validated.get("score", 7.0),
            },
        }

    except Exception as e:
        logger.error(f"Single question generation failed: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


# ─── Assignment / Assessment Context ──────────────────────────

@app.post("/context/assignment")
async def save_assignment(request: Request):
    """Save company assignment/assessment context (HIGHEST PRIORITY)."""
    try:
        data = await request.json()
        if not data or not data.get("details", "").strip():
            return JSONResponse(status_code=400, content={"error": "Assignment details are required."})

        context_engine.set_assignment({
            "company": data.get("company", "").strip(),
            "title": data.get("title", "").strip(),
            "details": data.get("details", "").strip(),
            "key_points": data.get("key_points", "").strip(),
        })

        logger.info(f"📋 Assignment saved: {data.get('title', 'Untitled')} @ {data.get('company', 'N/A')}")
        return {
            "status": "success",
            "message": f"Assignment saved: {data.get('title', 'Untitled')} at {data.get('company', 'Unknown')}",
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/context/assignment")
async def get_assignment():
    """Get saved assignment/assessment data."""
    return context_engine.get_assignment()


# ─── Chat Endpoint (Direct AI Interaction) ────────────────────

class ChatRequest(BaseModel):
    message: str = Field(..., max_length=8000)
    history: list[dict] = []  # [{role: "user"/"assistant", content: "..."}]
    chat_id: Optional[str] = None   # the register chapter this message belongs to
    think_ms: Optional[int] = Field(None, ge=0, le=1000 * 60 * 60)   # the practice stopwatch, if it was running

@app.post("/api/chat")
async def api_chat(req: ChatRequest):
    """Direct chat with AI model using candidate context."""
    try:
        import time
        from ai.utils import generate_multi_provider_completion

        full_context = candidate_context()

        # the chapter on screen is the one written in, even if another device opened a different one
        if req.chat_id and req.chat_id != chat_store.chapters()["open"]:
            chat_store.open_chapter(req.chat_id)
        started = time.monotonic()
        chat_store.add_message("user", req.message, think_ms=req.think_ms)

        # Include about-me data in context
        about_me_ctx = about_me_store.get_intro_context()
        if about_me_ctx:
            full_context += f"\n\n=== PERSONAL INFO ===\n{about_me_ctx}"

        # Enhanced learning detection — broader trigger categories
        user_msg = req.message.strip()
        lower_msg = user_msg.lower()

        learning_triggers = [
            # Direct instruction triggers
            "remember", "always", "never", "rule", "instruction", "preference",
            "should answer", "should not", "don't mention", "stop saying",
            # Language/style triggers
            "answer in hinglish", "answer in english", "speak in", "use hinglish",
            "more casual", "more formal", "shorter answers", "longer answers",
            # Correction triggers
            "that's wrong", "correct this", "actually it's", "the right answer is",
            "change the way", "improve how", "fix the",
            # Project/fact triggers
            "my project", "i actually", "i worked on", "the tech stack is",
            "i used", "we built", "my role was",
        ]

        if any(trigger in lower_msg for trigger in learning_triggers):
            timestamp_key = f"CHAT_LEARNED_{int(time.time())}"
            context_engine.add_custom_context(
                timestamp_key,
                f"User Instruction from Chat: {user_msg}"
            )
            logger.info(f"💾 Saved chat preference [{timestamp_key}]: '{user_msg[:60]}...'")

        system_prompt = f"""You are Vettly — operating as {who()}, in an interview readiness and mock practice session.

CANDIDATE BACKGROUND:
{full_context[:80000]}

═══ CANDIDATE PERSONA & ANSWER RULES ═══
1. PERSONA: You are {who()} (first person: "I", "my"). Speak directly as the candidate in an interview. You are NOT a third-party coach or tutor.
2. CONCISENESS (1-3 SENTENCES / 20-50 WORDS MAX): Deliver the direct spoken interview answer immediately in the first 3 words. Ultra-concise, spoken, and to-the-point.
3. FOR CONCEPT QUESTIONS (e.g., "what is RAG?", "what is Sigmoid?", "how does async work in FastAPI?"):
   - Give an immediate, simple, plain English explanation (Google-snippet clarity, so simple anyone grasps it in 2 seconds).
   - Do NOT deflect or force project links into the answer unless specifically asked.
4. FOR EXPERIENCE / RESUME QUESTIONS (e.g., "tell me about your last job", "what did you achieve?"):
   - Speak with concrete architecture, real numbers, and technologies from your background (e.g., FastAPI, 45% p95 latency reduction from 1.2s to 660ms, Redis telemetry).
5. FORMATTING CRITICAL: Do NOT output raw asterisks (*) or (**) for bullets or bolding. Use clean plain text, bullet dots (•), or numbered lists (1., 2., 3.) without asterisks.
6. CRITICAL: The candidate's GitHub repositories and entire codebases HAVE ALREADY BEEN EXTRACTED and provided to you in the CANDIDATE BACKGROUND section above. If the user asks about their GitHub repos or codebase, DO NOT claim you cannot access external links. Instead, confidently read the provided context and list the repos/code you see.

═══ USER TRAINING & CORRECTIONS ═══
If the user specifies an instruction, preference, correction, or rule about how you should answer, behave, or speak (e.g., "remember to say X", "don't mention Y", "make answers shorter", "focus on Z"):
1. Acknowledge it clearly: "Got it, I've updated my studio behavior. [explain what was saved]."
2. Confirm that it has been saved to your permanent context.
3. Explain that Vettly will now follow this rule in all future practice and prep sessions."""

        reply_text = await generate_multi_provider_completion(
            system_prompt=system_prompt,
            user_prompt=req.message,
            history=req.history,
            max_tokens=1000,
            temperature=0.7,
        )

        # Update backend store with assistant reply
        chat_store.add_message("assistant", reply_text, ms=int((time.monotonic() - started) * 1000))

        return {"response": reply_text}
    except Exception as e:
        logger.error(f"Chat error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/chat/history")
async def get_chat_history():
    """Retrieve persistent chat history."""
    return {"history": chat_store.get_history()}

@app.post("/api/chat/sync")
async def sync_chat_history(request: Request):
    """Sync chat history from client (optional)."""
    try:
        data = await request.json()
        history = data.get("history", [])
        chat_store.set_history(history)
        return {"status": "success"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.delete("/api/chat/history")
async def clear_chat_history():
    """Clear persistent chat history and archive in Recycle Bin."""
    current_chats = chat_store.get_history()
    if current_chats:
        recycle_bin_store.trash_chats(current_chats)
    chat_store.clear()
    return {"status": "success", "message": "Chat history moved to Recycle Bin"}


# ─── The register: chapters of the Live Copilot ───────────────

@app.get("/api/chats")
async def list_chapters():
    """Every chapter (newest first) without messages, and which one is open."""
    return {**chat_store.chapters(), "stats": chat_store.stats()}


@app.post("/api/chats")
async def new_chapter(request: Request):
    """Begin a new chapter (an untouched open one is reused)."""
    data = await request.json() if request.headers.get("content-length", "0") != "0" else {}
    return {"chapter": chat_store.create(str(data.get("title", "") or "")), **chat_store.chapters()}


@app.get("/api/chats/{cid}")
async def read_chapter(cid: str):
    """One chapter with its notes, without opening it: the page prefetches chapters so opening one is instant."""
    ch = chat_store.full(cid)
    return ch if ch else JSONResponse(status_code=404, content={"error": "That chapter isn't in your register"})


@app.post("/api/chats/{cid}/open")
async def open_chapter(cid: str):
    ch = chat_store.open_chapter(cid)
    return ch if ch else JSONResponse(status_code=404, content={"error": "That chapter isn't in your register"})


@app.patch("/api/chats/{cid}")
async def update_chapter(cid: str, request: Request):
    """Rename, archive / unarchive, or record time spent (elapsed_ms only ever grows)."""
    meta = chat_store.update(cid, await request.json())
    return meta if meta else JSONResponse(status_code=404, content={"error": "That chapter isn't in your register"})


@app.delete("/api/chats/{cid}")
async def delete_chapter(cid: str):
    """Tear a chapter out: it waits in The Attic until restored or deleted for good."""
    ch = chat_store.remove(cid)
    if not ch:
        return JSONResponse(status_code=404, content={"error": "That chapter isn't in your register"})
    recycle_bin_store.trash_chapter(ch)
    return chat_store.chapters()


# ─── Chat Expand (Detailed Technical Breakdown) ───────────────

class ChatExpandRequest(BaseModel):
    question: str
    short_answer: Optional[str] = ""

@app.post("/api/chat/expand")
async def api_chat_expand(req: ChatExpandRequest):
    """
    Generate an in-depth expanded technical walkthrough for a practice question.
    """
    try:
        from ai.utils import generate_multi_provider_completion

        question = req.question.strip()
        if not question:
            return JSONResponse(status_code=400, content={"error": "Question is required"})

        full_context = candidate_context()
        about_me_ctx = about_me_store.get_intro_context()
        if about_me_ctx:
            full_context += f"\n\n=== PERSONAL INFO ===\n{about_me_ctx}"

        system_prompt = f"""You are {who()}, in an interview practice session.
You delivered a concise spoken answer, and now you are providing a deeper technical walkthrough with a practical real-life example.

═══ 5TH-GRADE SIMPLICITY & BELIEVABLE LOGIC RULE (MOST IMPORTANT RULE) ═══
- Use VERY SIMPLE, EVERYDAY WORDS that even a 10-year-old child can understand immediately.
- NO heavy corporate buzzwords, NO fake academic jargon, NO robotic AI vocabulary.
- Speak in simple, clear, believable human sentences that sound completely natural when spoken out loud.
- Every answer must follow simple common-sense logic: Problem -> What I actually did -> Why it helped.

Provide a clear, spoken, simple technical expansion with a concrete real-world example (approx 80-140 words).
Structure:
1. Core Architecture & Mechanism in simple, direct words (first 2-3 sentences).
2. Real-life Practical Example from development or production workflows showing why and how it's used.

CRITICAL: Start directly with the core technical concept or mechanism in the first 3 words. Do NOT start with 'To expand on that', 'I explained', 'As I explained', or 'As mentioned'.
Formatting: Use clean plain text, bullet dots (•), or numbered points. Do NOT output raw asterisks (*) or (**) for bolding or bullets.

CANDIDATE CONTEXT:
{full_context[:80000]}"""

        user_prompt = f"""QUESTION: "{question}"
INITIAL SPOKEN ANSWER: "{req.short_answer}"

Provide the clean spoken technical expansion with a real-life example."""

        reply_text = await generate_multi_provider_completion(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            max_tokens=650,
            temperature=0.7,
        )

        # Clean any stray asterisks
        reply_text = reply_text.replace('*', '')

        return {"status": "success", "detailed_answer": reply_text}
    except Exception as e:
        logger.error(f"Chat expand error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


# ─── Mentor Bot (Gemini Pro, streamed; sees Prep Studio + Copilot chat) ───

class MentorRequest(BaseModel):
    message: str
    history: list[dict] = []  # Mentor's own conversation [{role, content}]
    focus: Optional[dict] = None  # Copilot answer pinned via "Ask Doubt": {question, answer, detail}
    language: str = "english"  # "english" | "hinglish" — the language pill on the Mentor panel

@app.post("/api/mentor")
async def api_mentor(req: MentorRequest):
    """Deep-dive tutor: '@N' points at Prep Studio question N; a pinned Copilot answer rides along as focus."""
    import re
    from ai.utils import stream_gemini_chat

    message = req.message.strip()
    if not message:
        return JSONResponse(status_code=400, content={"error": "Message is required"})

    entries = qa_cache.get_all()
    background = candidate_context()
    about_me_ctx = about_me_store.get_intro_context()
    if about_me_ctx:
        background += f"\n\n=== PERSONAL INFO ===\n{about_me_ctx}"

    bank = "\n\n".join(
        f"Q{i}. [{e.get('category', 'GENERAL')}] {e['question']}\nModel answer: {e['answer']}"
        for i, e in enumerate(entries, 1)
    )
    copilot_chat = "\n\n".join(
        f"{'INTERVIEWER' if m.get('role') == 'user' else 'COPILOT'}: {m.get('content', '')}"
        for m in chat_store.get_history()
    )[-150000:]  # newest ~150K chars; Gemini's window takes far more, this just bounds latency

    reply_language = (
        "natural Hinglish (Hindi in Roman script mixed with English technical terms, the way Indian engineers talk)"
        if req.language.lower() == "hinglish" else "clear, simple English"
    )

    # Long context first, instructions last: Gemini follows rules that sit after the material far more reliably
    system_prompt = f"""You are Mentor — {who()}'s personal interview coach inside Vettly, their interview-prep studio.
Your job: help him deeply understand the questions and answers he is preparing, so he can explain them confidently in his own words.

Below is his background, every Prep Studio question (numbered Q1, Q2, … — "@3" or "@Q3" means Q3), and the full Live Copilot chat, where he plays the interviewer and the copilot answers as him.

═══ CANDIDATE BACKGROUND ═══
{background}

═══ PREP STUDIO QUESTION BANK ═══
{bank or "(no questions generated yet)"}

═══ LIVE COPILOT CHAT (he asked as the interviewer; COPILOT answered as him) ═══
{copilot_chat or "(empty)"}

═══ HOW TO REPLY ═══
- LANGUAGE: reply ONLY in {reply_language}. He chose it with a toggle — follow it even when his message or earlier replies are in another language.
- Open with the direct answer in one or two lines, then go only as deep as the question needs.
- Teach, don't lecture: explain the "why", use one simple analogy or concrete example — ideally from his own projects in the background.
- Clean Markdown: short paragraphs, **bold** key terms, bullet or numbered lists, `inline code`, fenced code blocks for code, a small table only when comparing options, ### headings only for long answers. No preamble, no filler.
- Whatever he points at (a Prep question or a pinned Copilot answer) is attached right above his message — ground your reply in it. If he points at nothing, he is continuing the current topic.
- When it helps in the interview, end with a short **Say it like this:** line he could speak, or 2-3 likely follow-up questions.
- If a model answer has a weak spot or a factual error, say so plainly and give the fix.
- Never invent experience, projects, or numbers that are not in his background."""

    # Attach exactly what the user points at right next to their message
    pointed = []
    for n in dict.fromkeys(int(x) for x in re.findall(r"@[Qq]?(\d+)", message)):
        if 1 <= n <= len(entries):
            e = entries[n - 1]
            pointed.append(f"[Q{n} · {e.get('category', 'GENERAL')}]\nQuestion: {e['question']}\nModel answer: {e['answer']}")
        else:
            pointed.append(f"[Q{n}] does not exist — Prep Studio has {len(entries)} questions.")
    if req.focus:
        f = req.focus
        pinned = f"[Pinned Copilot answer]\nInterviewer asked: {f.get('question', '')}\nCopilot answered: {f.get('answer', '')}"
        if f.get("detail"):
            pinned += f"\nExpanded detail: {f['detail']}"
        pointed.append(pinned)
    user_turn = f"{message}\n\n(Reply in {reply_language}.)"
    if pointed:
        user_turn = "The candidate is pointing at:\n\n" + "\n\n".join(pointed) + f"\n\n---\n{user_turn}"

    async def stream():
        from ai.utils import _usable, generate_multi_provider_completion
        sent = False
        if _usable("GEMINI_API_KEY") and not (allowance.own_custom.get() or {}).get("first"):   # their own provider first, when they asked
            try:
                async for chunk in stream_gemini_chat(system_prompt, req.history[-40:] + [{"role": "user", "content": user_turn}]):
                    sent = True
                    yield chunk
                if sent:
                    return
            except Exception as e:
                logger.warning(f"Mentor Gemini stream failed ({type(e).__name__}); falling back")
                if sent:
                    yield "\n\n*The answer was cut off. Send it again in a moment.*"
                    return
        try:   # no Gemini key, or Gemini failed before writing: Groq, Claude or OpenAI answers in one piece
            yield await generate_multi_provider_completion(system_prompt, user_turn, history=req.history[-20:], max_tokens=1500)
        except Exception as e:
            logger.error(f"Mentor error: {e}")
            yield f"\n\n*Mentor couldn't reach any AI provider ({e}).*"

    # "identity" tells the gzip layer to leave this alone, so the answer still arrives word by word
    return StreamingResponse(stream(), media_type="text/plain; charset=utf-8", headers={"Content-Encoding": "identity", "Cache-Control": "no-cache"})


# ─── Chat Analyze (Extract Preferences from Full History) ─────

class ChatAnalyzeRequest(BaseModel):
    history: list[dict] = []

@app.post("/api/chat/analyze")
async def analyze_chat_history(req: ChatAnalyzeRequest):
    """Analyze full chat history and extract actionable preferences/instructions for permanent storage."""
    try:
        if not req.history or len(req.history) < 2:
            return {"status": "success", "extracted": 0, "message": "Not enough history to analyze."}

        from ai.utils import generate_multi_provider_completion

        # Build conversation text
        convo_text = "\n".join(
            f"{'USER' if m.get('role') == 'user' else 'ASSISTANT'}: {m.get('content', '')}"
            for m in req.history[-30:]  # Last 30 messages
        )

        analysis_prompt = """You are an AI behavior analyst. Review this conversation between a user and their AI interview coach.

Extract ALL actionable instructions, preferences, corrections, and rules that the user has explicitly or implicitly communicated.

Categories to look for:
1. LANGUAGE PREFERENCES: How the AI should speak (Hinglish, English, casual, formal)
2. ANSWER STYLE: How long answers should be, what to include/exclude
3. PROJECT CORRECTIONS: Any factual corrections about the user's projects, tech stacks, or experience
4. BEHAVIORAL RULES: Things the AI should always/never do
5. INTERVIEW STRATEGIES: How to handle specific question types

OUTPUT: Return a JSON array of extracted instructions. Each item:
{"type": "LANGUAGE|STYLE|CORRECTION|RULE|STRATEGY", "instruction": "the specific instruction to remember"}

If no actionable instructions were found, return an empty array: []
Return ONLY the JSON array."""

        content = (await generate_multi_provider_completion(
            system_prompt=analysis_prompt, user_prompt=f"CONVERSATION:\n{convo_text}", max_tokens=2000, temperature=0.3,
        )).strip()

        # Parse JSON
        if "```json" in content:
            content = content.split("```json", 1)[1].split("```", 1)[0].strip()
        elif "```" in content:
            content = content.split("```", 1)[1].split("```", 1)[0].strip()

        start = content.find("[")
        end = content.rfind("]")
        if start != -1 and end != -1:
            content = content[start:end + 1]

        instructions = json.loads(content)

        if not isinstance(instructions, list):
            instructions = []

        # Save each extracted instruction as permanent context
        import time
        saved_count = 0
        for item in instructions:
            if isinstance(item, dict) and item.get("instruction"):
                key = f"CHAT_ANALYZED_{item.get('type', 'RULE')}_{int(time.time())}_{saved_count}"
                context_engine.add_custom_context(
                    key,
                    f"[{item.get('type', 'RULE')}] {item['instruction']}"
                )
                saved_count += 1

        logger.info(f"🧠 Chat analysis complete: {saved_count} preferences extracted and saved")
        return {
            "status": "success",
            "extracted": saved_count,
            "instructions": instructions,
            "message": f"Extracted and saved {saved_count} preferences from chat history.",
        }

    except json.JSONDecodeError:
        logger.warning("Chat analysis returned invalid JSON")
        return {"status": "success", "extracted": 0, "message": "No actionable preferences found."}
    except Exception as e:
        logger.error(f"Chat analysis failed: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


# ─── History Endpoints ────────────────────────────────────────

@app.get("/api/history")
async def get_history():
    """Get all saved interview sessions."""
    return {
        "status": "success",
        "sessions": history_store.get_all(),
        "count": history_store.count,
    }


@app.post("/api/history")
async def save_history(request: Request):
    """Save an interview session."""
    try:
        data = await request.json()
        entry = history_store.upsert_session(data)
        return {"status": "success", "session": entry}
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


@app.delete("/api/history/{session_id}")
async def delete_history(session_id: str):
    """Soft delete an interview session into the Recycle Bin."""
    target_session = history_store.get_session(session_id)
    if target_session:
        recycle_bin_store.trash_session(target_session)
        history_store.delete_session(session_id)
        return {"status": "success", "message": f"Session {session_id} moved to Recycle Bin"}
    return JSONResponse(status_code=404, content={"error": "Session not found"})


@app.delete("/api/history")
async def clear_history():
    """Soft delete all interview sessions into the Recycle Bin."""
    all_sessions = history_store.get_all()
    for s in all_sessions:
        recycle_bin_store.trash_session(s)
    history_store.clear()
    return {"status": "success", "message": f"Moved {len(all_sessions)} sessions to Recycle Bin"}


# ─── Recycle Bin Endpoints ─────────────────────────────────────

@app.get("/api/recycle-bin")
async def get_recycle_bin():
    """Get all items in the Recycle Bin (sessions and chats)."""
    return {
        "status": "success",
        "data": recycle_bin_store.get_all(),
    }


class RecycleActionRequest(BaseModel):
    item_type: str  # 'session' or 'chat'
    id: str


@app.post("/api/recycle-bin/restore")
async def restore_recycle_bin_item(req: RecycleActionRequest):
    """Restore an item from the recycle bin back to active store."""
    try:
        if req.item_type == "session":
            restored = recycle_bin_store.restore_session(req.id)
            if restored:
                history_store.upsert_session(restored)
                return {"status": "success", "message": "Session restored successfully", "session": restored}
            return JSONResponse(status_code=404, content={"error": "Session not found in Recycle Bin"})
        elif req.item_type == "chat":
            item = recycle_bin_store.take_chat_item(req.id)
            if item is None:
                return JSONResponse(status_code=404, content={"error": "Chat not found in The Attic"})
            if item.get("chapter"):   # a whole chapter goes back into the register, opened
                ch = chat_store.restore(item["chapter"])
                return {"status": "success", "message": "Chapter restored to your register", "chapter": ch}
            msgs = item.get("messages", [])   # an older batch of messages becomes a chapter of its own
            ch = chat_store.restore({"id": item.get("id", "ch_restored"), "title": "Restored conversation", "messages": msgs})
            return {"status": "success", "message": f"Restored {len(msgs)} messages as a chapter", "chapter": ch}
        return JSONResponse(status_code=400, content={"error": "Invalid item_type"})
    except Exception as e:
        logger.error(f"Recycle restore error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/recycle-bin/delete")
async def delete_recycle_bin_item(req: RecycleActionRequest):
    """Permanently delete an item from the recycle bin."""
    try:
        success = recycle_bin_store.delete_item(req.item_type, req.id)
        if success:
            return {"status": "success", "message": f"{req.item_type.capitalize()} permanently deleted"}
        return JSONResponse(status_code=404, content={"error": "Item not found in Recycle Bin"})
    except Exception as e:
        logger.error(f"Recycle delete error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/recycle-bin/empty")
async def empty_recycle_bin():
    """Permanently empty the entire Recycle Bin. ONLY called on explicit user action."""
    try:
        recycle_bin_store.empty_all()
        return {"status": "success", "message": "Recycle Bin completely emptied"}
    except Exception as e:
        logger.error(f"Recycle empty error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


def auto_save_active_session(session_id: str):
    """Auto-persist current active round entries to history store in real time."""
    sess = active_sessions.get(session_id)
    if sess and sess.get("round_entries"):
        history_store.upsert_session({
            "id": sess.get("history_session_id") or int(datetime.now().timestamp() * 1000),
            "timestamp": sess.get("start_time") or datetime.now().isoformat(),
            "entries": list(sess.get("round_entries", [])),
        })


# ─── About Me Endpoints ──────────────────────────────────────

@app.get("/api/about-me")
async def get_about_me():
    """Get saved about-me data."""
    return {
        "status": "success",
        "data": about_me_store.get_data(),
    }


@app.post("/api/about-me")
async def save_about_me(request: Request):
    """Save about-me data (intro, facts, tell-me-about-yourself)."""
    try:
        data = await request.json()
        about_me_store.set_data(data)

        # Also inject into context engine as custom context
        intro_ctx = about_me_store.get_intro_context()
        if intro_ctx:
            context_engine.add_custom_context("ABOUT_ME", intro_ctx)

        return {"status": "success", "message": "About-me data saved"}
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


# ─── WebSocket: Interview Session ─────────────────────────────

@app.websocket("/ws/interview")
async def interview_session(websocket: WebSocket):
    """
    Main interview WebSocket endpoint.
    
    Client sends:
        - Audio chunks (binary) from microphone/system audio
        - JSON control messages: {"type": "control", "action": "start|stop|reset"}
    
    Server sends:
        - {"type": "transcript", "speaker": "interviewer|user", "text": "..."}
        - {"type": "filler", "text": "..."}
        - {"type": "answer", "text": "...", "done": false}
        - {"type": "answer", "text": "...", "done": true}
        - {"type": "status", "message": "..."}
    """
    if users.auth_enabled():
        await websocket.close(code=1008)   # live audio runs in the desktop app, not on the hosted site
        return
    await websocket.accept()
    session_id = str(id(websocket))
    now_ts = datetime.now()
    active_sessions[session_id] = {
        "active": True,
        "history_session_id": int(now_ts.timestamp() * 1000),
        "start_time": now_ts.isoformat(),
        "transcript_history": [],
        "qa_session_buffer": [],  # Last 5 Q&A pairs for multi-turn coherence
        "mode": "answer",
        "muted": False,
        "language": "en",
        "language_locked": False,
        "vision_context": "",
        "last_answer_opener": "",
        "last_filler_opener": "",
        # ─── Multi-Question Round Tracking ───
        "round_number": 1,
        "round_question_index": 0,
        "round_entries": [],
    }

    logger.info(f"🔌 Client connected: {session_id} (history_id={active_sessions[session_id]['history_session_id']})")

    await websocket.send_json({
        "type": "connected",
        "session_id": session_id,
        "history_session_id": active_sessions[session_id]["history_session_id"],
        "round_number": 1,
    })

    # Initialize Deepgram STT client for this session
    stt_client = DeepgramSTTClient()
    stt_connected = False

    # Spacebar-only control: accumulate question text, answers trigger ONLY on spacebar
    pending_question = {"text": "", "detected_lang": "", "latest_interim": ""}

    async def trigger_answer(question_text: str):
        """Actually generate the answer after debounce period."""
        if not question_text.strip():
            return

        # ─── Round Question Tracking ───
        active_sessions[session_id]["round_question_index"] += 1
        q_index = active_sessions[session_id]["round_question_index"]
        round_num = active_sessions[session_id]["round_number"]

        logger.info(f"🎯 R{round_num}-Q{q_index}: {question_text[:100]}...")
        active_sessions[session_id]["transcript_history"].append({
            "speaker": "interviewer",
            "text": question_text,
        })
        # Enforce 20-turn rolling window for history
        history = active_sessions[session_id]["transcript_history"]
        if len(history) > 20:
            dropped = history[:-20]
            active_sessions[session_id]["transcript_history"] = history[-20:]
            asyncio.create_task(context_engine.summarize_dropped_turns(dropped))

        mode = active_sessions[session_id].get("mode", "answer")
        
        # --- AUTO DETECT CONTEXT MODE (respects manual lock) ---
        current_c_mode = active_sessions[session_id].get("context_mode", "all")
        is_locked = active_sessions[session_id].get("context_mode_locked", False)
        new_c_mode = auto_detect_context_mode(question_text, current_c_mode, is_locked)
        if new_c_mode != current_c_mode:
            logger.info(f"🧠 Auto-detected topic shift. Changing context mode: {current_c_mode} -> {new_c_mode}")
            active_sessions[session_id]["context_mode"] = new_c_mode

        # Auto-detect language PER QUESTION unless locked by UI toggle
        if not active_sessions[session_id].get("language_locked", False):
            is_hindi_dg = pending_question.get("detected_lang", "").startswith("hi")
            is_hinglish_text = is_text_hinglish(question_text)
            if is_hindi_dg or is_hinglish_text:
                lang = "hinglish"
            else:
                lang = "en"
            active_sessions[session_id]["language"] = lang
        else:
            lang = active_sessions[session_id].get("language", "en")

        prev_answer_opener = active_sessions[session_id].get("last_answer_opener", "")
        prev_filler_opener = active_sessions[session_id].get("last_filler_opener", "")

        # ═══ Notify client that a new question was detected ═══
        await websocket.send_json({
            "type": "multi_question_detected",
            "question": question_text,
            "question_index": q_index,
        })

        # ═══ CACHE-FIRST: Check pre-prepared Q&A ═══
        cached = await question_matcher.find_match(question_text)

        if cached:
            logger.info(f"⚡ CACHE HIT ({cached['confidence']:.0%}) — R{round_num}-Q{q_index}")
            humanizer.set_language(lang)
            humanized_cached = humanizer.humanize(cached["answer"], mode="answer")

            # Send complete answer directly (no filler — saves tokens)
            await websocket.send_json({
                "type": "answer_complete",
                "text": humanized_cached,
                "question": question_text,
                "question_index": q_index,
                "target": "answer_panel",
                "done": True,
                "cached": True,
                "mode": mode,
            })

            active_sessions[session_id]["last_answer_opener"] = humanized_cached[:30]
            active_sessions[session_id]["round_entries"].append({
                "question": question_text, "answer": humanized_cached, "index": q_index,
            })
            auto_save_active_session(session_id)
            # Track in session buffer for multi-turn coherence
            active_sessions[session_id].setdefault("qa_session_buffer", []).append({
                "question": question_text,
                "answer": humanized_cached,
            })
            if len(active_sessions[session_id]["qa_session_buffer"]) > 5:
                active_sessions[session_id]["qa_session_buffer"] = active_sessions[session_id]["qa_session_buffer"][-5:]
            
            qa_buffer = active_sessions[session_id]["qa_session_buffer"]
            session_buffer_text = ""
            if len(qa_buffer) > 1:
                buffer_lines = []
                for bq in qa_buffer[:-1]: # exclude the current one which is at the end
                    buffer_lines.append(f"Q: {bq['question']}")
                    buffer_lines.append(f"A: {bq['answer'][:200]}...")
                session_buffer_text = "\n".join(buffer_lines)

            # Background session summaries disabled — main overlay displays active 2-liner teleprompter
            pass
        else:
            logger.info(f"🧠 Generating fresh answer [R{round_num}-Q{q_index}, mode={mode}, lang={lang}]")
            c_mode = active_sessions[session_id].get("context_mode", "all")
            full_context = candidate_context(c_mode)
            vision_ctx = active_sessions[session_id].get("vision_context", "")
            if vision_ctx:
                full_context += f"\n\n=== SCREEN CONTENT (Screenshot Analysis) ===\n{vision_ctx}"
            conversation_history = active_sessions[session_id]["transcript_history"]

            # Build session buffer for multi-turn coherence
            qa_buffer = active_sessions[session_id].get("qa_session_buffer", [])
            session_buffer_text = ""
            if qa_buffer:
                buffer_lines = []
                for bq in qa_buffer[-5:]:
                    buffer_lines.append(f"Q: {bq['question']}")
                    buffer_lines.append(f"A: {bq['answer'][:200]}...")
                session_buffer_text = "\n".join(buffer_lines)

            # Generate answer directly (no filler — saves tokens + faster)
            await generate_full_answer(websocket, question_text, full_context, conversation_history, mode, lang, session_id, prev_answer_opener, session_buffer_text, q_index, "answer_panel")

    try:
        # Callback when Deepgram produces a transcript
        async def on_transcript(transcript: str, is_final: bool, speaker: str, detected_language: str = ""):
            """Called when STT produces a transcript segment."""
            if not transcript.strip():
                return

            # Check if muted
            if active_sessions[session_id].get("muted", False):
                return

            # Language is evaluated only at trigger_answer time on the FULL accumulated question.
            # Do NOT switch based on partial transcript chunks to avoid false positives.

            # Send transcript to client
            await websocket.send_json({
                "type": "transcript",
                "speaker": speaker,
                "text": transcript,
                "is_final": is_final,
            })

            # Track latest interim chunk so Spacebar has instant access to what was just spoken
            if speaker == "interviewer":
                pending_question["latest_interim"] = transcript

            # Only process final interviewer transcripts
            if is_final and speaker == "interviewer":
                # Accumulate the question text
                if pending_question["text"]:
                    pending_question["text"] += " " + transcript
                else:
                    pending_question["text"] = transcript

                # Track detected language
                if detected_language:
                    pending_question["detected_lang"] = detected_language

                # Update the displayed transcript with full accumulated question
                await websocket.send_json({
                    "type": "transcript",
                    "speaker": "interviewer",
                    "text": pending_question["text"],
                    "is_final": True,
                })

        # Try to start STT streaming (resilient — don't crash if it fails)
        try:
            await stt_client.start(on_transcript)
            stt_connected = True
            await websocket.send_json({
                "type": "status",
                "message": "STT connected — ready to listen",
            })
        except Exception as stt_err:
            logger.warning(f"⚠️ Deepgram STT failed to connect: {stt_err}")
            logger.warning("Session continues without STT — retrying in background...")
            await websocket.send_json({
                "type": "status",
                "message": "Connected (STT reconnecting...)",
            })

            # Retry STT in background
            async def retry_stt():
                nonlocal stt_connected
                for attempt in range(3):
                    await asyncio.sleep(5)
                    try:
                        await stt_client.start(on_transcript)
                        stt_connected = True
                        logger.info(f"✅ STT reconnected on attempt {attempt + 1}")
                        await websocket.send_json({
                            "type": "status",
                            "message": "STT connected — ready to listen",
                        })
                        return
                    except Exception as e:
                        logger.warning(f"STT retry {attempt + 1}/3 failed: {e}")

            asyncio.create_task(retry_stt())

        # Main message loop
        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.disconnect":
                break

            # Binary = audio data
            if "bytes" in message:
                audio_data = message["bytes"]
                if stt_connected:
                    await stt_client.send_audio(audio_data)

            # Text = control message
            elif "text" in message:
                try:
                    data = json.loads(message["text"])
                    # Spacebar trigger — answer immediately
                    if data.get("action") == "question_done":
                        client_q = data.get("question", "").strip()
                        pending_q = pending_question["text"].strip()
                        interim_q = pending_question.get("latest_interim", "").strip()

                        # Pick the most complete question text available
                        candidates = [client_q, pending_q, interim_q]
                        q_text = max(candidates, key=len) if any(candidates) else ""

                        if len(q_text) >= 8:
                            pending_question["text"] = ""
                            pending_question["latest_interim"] = ""
                            pending_question["detected_lang"] = ""
                            logger.info(f"⏩ Spacebar triggered — answering immediately: '{q_text[:60]}...'")
                            await trigger_answer(q_text)
                        else:
                            logger.warning(f"⏩ Spacebar pressed but question too short: '{q_text}'")
                        continue
                    await handle_control_message(websocket, session_id, data)
                except json.JSONDecodeError:
                    pass

    except WebSocketDisconnect:
        logger.info(f"🔌 Client disconnected: {session_id}")
    except Exception as e:
        logger.error(f"Session error: {e}")
    finally:
        await stt_client.stop()
        auto_save_active_session(session_id)
        active_sessions.pop(session_id, None)


async def generate_filler(
    websocket: WebSocket,
    question: str,
    context: str,
    history: list[dict],
    language: str = "en",
    session_id: str = "",
    previous_opener: str = "",
):
    """Generate and send an instant filler response (~0.5s)."""
    try:
        humanizer.set_language(language)
        filler = await filler_gen.generate(question, context, history, language, previous_opener)
        filler = humanizer.humanize(filler, mode="filler")

        await websocket.send_json({
            "type": "filler",
            "text": filler,
        })
        # Track this filler's opener for next time
        if session_id and session_id in active_sessions:
            active_sessions[session_id]["last_filler_opener"] = filler[:30]
        logger.info(f"⚡ Filler sent [{language}]: {filler[:60]}...")
    except Exception as e:
        logger.error(f"Filler generation failed: {e}")


async def generate_full_answer(
    websocket: WebSocket,
    question: str,
    context: str,
    history: list[dict],
    mode: str = "answer",
    language: str = "en",
    session_id: str = "",
    previous_opener: str = "",
    session_buffer: str = "",
    question_index: int = 1,
    target: str = "main",
):
    """Generate and stream a full detailed answer (~2-3s)."""
    try:
        humanizer.set_language(language)
        full_text = ""
        is_panel = (target == "answer_panel")

        async for chunk in answer_gen.generate_stream(question, context, history, mode, language, previous_opener, session_buffer):
            full_text += chunk
            msg = {"type": "answer", "text": chunk, "done": False, "mode": mode}
            if is_panel:
                msg["target"] = "answer_panel"
                msg["question_index"] = question_index
                if mode == "detailed":
                    msg["is_expand"] = True
            await websocket.send_json(msg)

        # ═══ SINGLE-PASS CODE HUMANIZATION (coding mode only) ═══
        if mode == "coding" and len(full_text.strip()) > 50:
            try:
                from ai.prompts import CODE_HUMANIZER_PROMPT
                from groq import AsyncGroq
                humanize_client = AsyncGroq(api_key=config.GROQ_API_KEY)
                
                await websocket.send_json({
                    "type": "status",
                    "message": "Humanizing code...",
                })
                
                humanize_response = await humanize_client.chat.completions.create(
                    model=config.GROQ_MODEL,
                    messages=[
                        {"role": "system", "content": CODE_HUMANIZER_PROMPT},
                        {"role": "user", "content": full_text},
                    ],
                    max_tokens=1500,
                    temperature=0.4,
                )
                humanized_code = humanize_response.choices[0].message.content.strip()
                if len(humanized_code) > 50:
                    full_text = humanized_code
                    logger.info("🔧 Code humanization pass complete")
            except Exception as e:
                logger.warning(f"Code humanization failed (using original): {e}")

        # Humanize the complete answer
        humanized = humanizer.humanize(full_text, mode="answer")

        # Send final complete answer
        complete_msg = {
            "type": "answer_complete",
            "text": humanized,
            "done": True,
            "mode": mode,
        }
        if is_panel:
            complete_msg["question"] = question
            complete_msg["question_index"] = question_index
            complete_msg["target"] = "answer_panel"
            if mode == "detailed":
                complete_msg["is_expand"] = True
        await websocket.send_json(complete_msg)

        # Track opener + session buffer
        if session_id and session_id in active_sessions:
            active_sessions[session_id]["last_answer_opener"] = humanized[:30]
            
            qa_buf = active_sessions[session_id].setdefault("qa_session_buffer", [])
            existing_qa = next((e for e in qa_buf if e.get("question") == question), None)
            if existing_qa:
                existing_qa["answer"] = humanized
            else:
                qa_buf.append({
                    "question": question,
                    "answer": humanized,
                })
            if len(active_sessions[session_id]["qa_session_buffer"]) > 5:
                active_sessions[session_id]["qa_session_buffer"] = active_sessions[session_id]["qa_session_buffer"][-5:]

            active_sessions[session_id]["transcript_history"].append({
                "speaker": "assistant",
                "text": humanized,
            })
            if len(active_sessions[session_id]["transcript_history"]) > 20:
                active_sessions[session_id]["transcript_history"] = active_sessions[session_id]["transcript_history"][-20:]

            # Update round entries
            round_ents = active_sessions[session_id]["round_entries"]
            existing_re = next((e for e in round_ents if e.get("index") == question_index), None)
            if existing_re:
                existing_re["answer"] = humanized
            else:
                round_ents.append({
                    "question": question, "answer": humanized, "index": question_index,
                })
            auto_save_active_session(session_id)

        # Background session summaries disabled — main overlay displays active 2-liner teleprompter
        logger.info(f"🧠 Answer sent R-Q{question_index} ({len(humanized)} chars) [target={target}, mode={mode}, lang={language}]")
    except Exception as e:
        logger.error(f"Answer generation failed: {e}")
        try:
            error_msg = f"[Error: {str(e)}]"
            complete_msg = {
                "type": "answer_complete",
                "text": error_msg,
                "done": True,
                "mode": mode,
            }
            if target == "answer_panel":
                complete_msg["question"] = question
                complete_msg["question_index"] = question_index
                complete_msg["target"] = "answer_panel"
            await websocket.send_json(complete_msg)
        except Exception:
            pass


async def generate_and_send_summary(
    websocket: WebSocket,
    question: str,
    answer: str,
    question_index: int,
    session_id: str = "",
    language: str = "en",
    session_buffer_text: str = "",
):
    """Generate an intelligent, comprehensive English summary of the entire session."""
    try:
        from ai.prompts import SUMMARY_SYSTEM_PROMPT_EN, SUMMARY_USER_TEMPLATE
        from groq import AsyncGroq
        client = AsyncGroq(api_key=config.GROQ_API_KEY)
        
        if session_buffer_text:
            text_to_summarize = session_buffer_text + f"\nQ: {question}\nA: {answer}"
        else:
            text_to_summarize = f"Q: {question}\nA: {answer}"

        user_msg = SUMMARY_USER_TEMPLATE.format(answer=text_to_summarize)
        system_prompt = SUMMARY_SYSTEM_PROMPT_EN

        # Non-streaming
        response = await client.chat.completions.create(
            model=config.GROQ_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.3,
            max_tokens=500,
        )
        summary = response.choices[0].message.content.strip()

        await websocket.send_json({
            "type": "answer_summary",
            "question": "Entire Session Summary",
            "summary": summary,
            "question_index": question_index,
        })
        logger.info(f"📝 Total Session Summary sent: {summary[:60]}...")
    except Exception as e:
        logger.error(f"Summary generation failed for Q{question_index}: {e}")


async def handle_control_message(websocket: WebSocket, session_id: str, data: dict):
    """Handle control messages from the client."""
    action = data.get("action", "")

    if action == "reset":
        active_sessions[session_id]["transcript_history"] = []
        active_sessions[session_id]["mode"] = "answer"
        await websocket.send_json({
            "type": "status",
            "message": "Conversation history reset",
        })
        logger.info(f"🔄 Session reset: {session_id}")

    elif action == "set_language":
        lang = data.get("language", "en")
        active_sessions[session_id]["language"] = lang
        active_sessions[session_id]["language_locked"] = True
        humanizer.set_language(lang)
        await websocket.send_json({
            "type": "status",
            "message": f"Language set to {lang}",
        })

    elif action == "set_mode":
        mode = data.get("mode", "answer")
        active_sessions[session_id]["mode"] = mode
        await websocket.send_json({
            "type": "status",
            "message": f"Mode set to {mode}",
        })
        logger.info(f"🔧 Mode changed to: {mode}")

    elif action == "mute":
        active_sessions[session_id]["muted"] = True
        await websocket.send_json({
            "type": "status",
            "message": "Listening paused",
        })
        logger.info(f"🔇 Muted: {session_id}")

    elif action == "unmute":
        active_sessions[session_id]["muted"] = False
        await websocket.send_json({
            "type": "status",
            "message": "Listening resumed",
        })
        logger.info(f"🔊 Unmuted: {session_id}")

    elif action == "set_context_mode":
        c_mode = data.get("mode", "all")
        active_sessions[session_id]["context_mode"] = c_mode
        active_sessions[session_id]["context_mode_locked"] = c_mode != "all"
        await websocket.send_json({
            "type": "status",
            "message": f"Context mode set to {c_mode}" + (" (locked)" if c_mode != "all" else ""),
        })
        logger.info(f"🎛️ Context mode changed to: {c_mode}")

    elif action == "expand_answer":
        q_index = data.get("question_index", 1)
        question = data.get("question", "")
        c_mode = active_sessions[session_id].get("context_mode", "all")
        full_context = candidate_context(c_mode)
        history = active_sessions[session_id]["transcript_history"]
        mode = "detailed"
        lang = active_sessions[session_id].get("language", "en")
        
        qa_buffer = active_sessions[session_id].get("qa_session_buffer", [])
        session_buffer_text = ""
        if qa_buffer:
            buffer_lines = []
            for bq in qa_buffer[-5:]:
                buffer_lines.append(f"Q: {bq['question']}")
                buffer_lines.append(f"A: {bq['answer'][:200]}...")
            session_buffer_text = "\n".join(buffer_lines)
            
        logger.info(f"🔍 Requested detailed answer for Q{q_index}: {question[:50]}")
        
        # Let answer_gen re-answer this question in detailed mode
        # Using a background task so it doesn't block the control loop
        asyncio.create_task(
            generate_full_answer(
                websocket, question, full_context, history, mode, lang,
                session_id, "", session_buffer_text, q_index, "answer_panel"
            )
        )

    elif action == "manual_question":
        question = data.get("question", "")
        
        # --- AUTO DETECT CONTEXT MODE ---
        c_mode = data.get("context_mode", active_sessions[session_id].get("context_mode", "all"))
        is_locked = active_sessions[session_id].get("context_mode_locked", False) or (c_mode != "all")
        new_c_mode = auto_detect_context_mode(question, c_mode, is_locked)
        if new_c_mode != c_mode:
            logger.info(f"🧠 Auto-detected topic shift in manual question. Changing context mode: {c_mode} -> {new_c_mode}")
            c_mode = new_c_mode
            
        active_sessions[session_id]["context_mode"] = c_mode
        active_sessions[session_id]["context_mode_locked"] = c_mode != "all"
        if question.strip():
            # Auto-detect language dynamically (manual text check only) unless locked
            if not active_sessions[session_id].get("language_locked", False):
                new_lang = "hinglish" if is_text_hinglish(question) else "en"
                old_lang = active_sessions[session_id].get("language", "en")
                if new_lang != old_lang:
                    active_sessions[session_id]["language"] = new_lang
                    logger.info(f"🗣️ Manual question dynamically switched language to: {new_lang}")
                    await websocket.send_json({
                        "type": "status",
                        "message": f"Language set to {new_lang.capitalize()}",
                    })

            # ═══ CODE-LINE EXPLAIN FEATURE ═══
            # Detect patterns like: "chat_service.py L23-L45", "chatservice l23-45", "main.py lines 10-30"
            # Also: "chat_service 23 45", "chatservice L23-45"
            import re as _re
            
            # Pattern 1: filename.py L23-L45 or filename L23-45
            code_ref_match = _re.search(
                r'(\w+(?:\.\w+)?\.py|chatservice|goldservice|chat_service|gold_service|main)\s*(?:L|lines?\s*|l)(\d+)\s*[-–to\s]+\s*(?:L|l)?(\d+)',
                question, _re.IGNORECASE
            )
            
            if code_ref_match:
                ref_file_raw = code_ref_match.group(1)
                ref_start = int(code_ref_match.group(2))
                ref_end = int(code_ref_match.group(3))
                
                # Normalize filename: "chatservice" → "chat_service.py"
                ref_file = ref_file_raw
                file_aliases = {
                    "chatservice": "chat_service.py",
                    "chat_service": "chat_service.py",
                    "goldservice": "gold_service.py",
                    "gold_service": "gold_service.py",
                    "main": "main.py",
                }
                if ref_file.lower() in file_aliases:
                    ref_file = file_aliases[ref_file.lower()]
                
                # Load assignment codebase
                code_store_path = Path(__file__).parent / "context_store" / "assignment_code.json"
                code_snippet = ""
                if code_store_path.exists():
                    try:
                        with open(code_store_path, "r", encoding="utf-8") as f:
                            code_data = json.load(f)
                        # Search for the file (partial match)
                        for fpath, content in code_data.get("files", {}).items():
                            if ref_file.lower().replace(".py", "") in fpath.lower().replace(".py", ""):
                                lines = content.split("\n")
                                # Clamp line range
                                start_idx = max(0, ref_start - 1)
                                end_idx = min(len(lines), ref_end)
                                selected_lines = lines[start_idx:end_idx]
                                numbered = [f"L{start_idx + i + 1}: {line}" for i, line in enumerate(selected_lines)]
                                code_snippet = f"\n=== CODE FROM {fpath} (Lines {ref_start}-{ref_end}) ===\n" + "\n".join(numbered)
                                logger.info(f"📝 Code ref: {fpath} L{ref_start}-L{ref_end} ({len(selected_lines)} lines)")
                                break
                    except Exception as e:
                        logger.error(f"Code ref load error: {e}")
                
                if code_snippet:
                    lang = active_sessions[session_id].get("language", "en")
                    if lang == "hi" or config.HINGLISH_MODE == "always":
                        question = (
                            f"Explain this code from the Simplify Money assignment LINE BY LINE in Hinglish "
                            f"(Hindi structure + English tech terms, Roman script). "
                            f"Har line ka logic samjhao simple aur concise tarike se:\n"
                            f"{code_snippet}\n\n"
                            f"User's original request: {question}"
                        )
                    else:
                        question = (
                            f"Explain this code from the Simplify Money assignment LINE BY LINE in simple, clear English. "
                            f"Explain the logic of each line concisely:\n"
                            f"{code_snippet}\n\n"
                            f"User's original request: {question}"
                        )
            else:
                # Pattern 2: Just "L34-45" or "explain l34-45" (relies on screenshot vision context)
                lines_only_match = _re.search(
                    r'(?:explain\s+)?(?:L|lines?\s*|l)(\d+)\s*[-–to\s]+\s*(?:L|l)?(\d+)',
                    question, _re.IGNORECASE
                )
                
                # Pattern 3: Natural language "explain each line" or "explain line by line"
                explain_each_line_match = _re.search(
                    r'(explain (each|every) line|explain line by line|line by line explain)',
                    question, _re.IGNORECASE
                )
                
                if lines_only_match:
                    ref_start = int(lines_only_match.group(1))
                    ref_end = int(lines_only_match.group(2))
                    lang = active_sessions[session_id].get("language", "en")
                    if lang == "hi" or config.HINGLISH_MODE == "always":
                        question = (
                            f"Explain lines {ref_start} to {ref_end} from the SCREENSHOT / SCREEN CONTENT LINE BY LINE in Hinglish "
                            f"(Hindi structure + English tech terms, Roman script). "
                            f"Har line ka logic samjhao simple aur concise tarike se.\n\n"
                            f"User's original request: {question}"
                        )
                    else:
                        question = (
                            f"Explain lines {ref_start} to {ref_end} from the SCREENSHOT / SCREEN CONTENT LINE BY LINE in simple, clear English. "
                            f"Explain the logic of each line concisely.\n\n"
                            f"User's original request: {question}"
                        )
                elif explain_each_line_match:
                    lang = active_sessions[session_id].get("language", "en")
                    if lang == "hi" or config.HINGLISH_MODE == "always":
                        question = (
                            f"Explain the code from the SCREENSHOT / SCREEN CONTENT LINE BY LINE in Hinglish "
                            f"(Hindi structure + English tech terms, Roman script). "
                            f"Har line ka logic samjhao simple aur concise tarike se.\n\n"
                            f"User's original request: {question}"
                        )
                    else:
                        question = (
                            f"Explain the code from the SCREENSHOT / SCREEN CONTENT LINE BY LINE in simple, clear English. "
                            f"Explain the logic of each line concisely.\n\n"
                            f"User's original request: {question}"
                        )

            # Track round index for manual questions too
            active_sessions[session_id]["round_question_index"] += 1
            q_index = active_sessions[session_id]["round_question_index"]

            logger.info(f"✍️ Manual Q{q_index}: {question[:80]}...")
            active_sessions[session_id]["transcript_history"].append({
                "speaker": "interviewer",
                "text": question,
            })
            mode = active_sessions[session_id].get("mode", "answer")
            lang = active_sessions[session_id].get("language", "en")
            prev_answer_opener = active_sessions[session_id].get("last_answer_opener", "")
            c_mode = active_sessions[session_id].get("context_mode", "all")
            full_context = candidate_context(c_mode)
            vision_ctx = active_sessions[session_id].get("vision_context", "")
            if vision_ctx:
                full_context += f"\n\n=== SCREEN CONTENT (Screenshot Analysis) ===\n{vision_ctx}"
            history = active_sessions[session_id]["transcript_history"]

            qa_buffer = active_sessions[session_id].get("qa_session_buffer", [])
            session_buffer_text = ""
            if qa_buffer:
                buffer_lines = []
                for bq in qa_buffer[-5:]:
                    buffer_lines.append(f"Q: {bq['question']}")
                    buffer_lines.append(f"A: {bq['answer'][:200]}...")
                session_buffer_text = "\n".join(buffer_lines)

            # Notify client
            await websocket.send_json({
                "type": "multi_question_detected",
                "question": question,
                "question_index": q_index,
            })

            # ═══ CACHE-FIRST: Check pre-prepared Q&A ═══
            cached = await question_matcher.find_match(question)

            if cached:
                logger.info(f"⚡ CACHE HIT ({cached['confidence']:.0%}) — Manual-Q{q_index}")
                humanizer.set_language(lang)
                humanized_cached = humanizer.humanize(cached["answer"], mode="answer")

                # Send complete answer directly (no filler — saves tokens)
                await websocket.send_json({
                    "type": "answer_complete",
                    "text": humanized_cached,
                    "question": question,
                    "question_index": q_index,
                    "target": "answer_panel",
                    "done": True,
                    "cached": True,
                    "mode": mode,
                })

                active_sessions[session_id]["last_answer_opener"] = humanized_cached[:30]
                active_sessions[session_id]["round_entries"].append({
                    "question": question, "answer": humanized_cached, "index": q_index,
                })
                auto_save_active_session(session_id)
                active_sessions[session_id].setdefault("qa_session_buffer", []).append({
                    "question": question,
                    "answer": humanized_cached,
                })
                if len(active_sessions[session_id]["qa_session_buffer"]) > 5:
                    active_sessions[session_id]["qa_session_buffer"] = active_sessions[session_id]["qa_session_buffer"][-5:]
            else:
                # Generate answer directly (no filler — saves tokens + faster)
                await generate_full_answer(websocket, question, full_context, history, mode, lang, session_id, prev_answer_opener, session_buffer_text, q_index, "answer_panel")

    elif action == "screenshot":
        # User sent a screenshot for vision analysis
        image_data = data.get("image", "")
        if image_data:
            logger.info("📸 Screenshot received — analyzing...")
            await websocket.send_json({
                "type": "status",
                "message": "Analyzing screenshot...",
            })
            try:
                from ai.vision_analyzer import VisionAnalyzer
                vision = VisionAnalyzer()
                analysis = await vision.analyze_screenshot(image_data)
                active_sessions[session_id]["vision_context"] = analysis
                await websocket.send_json({
                    "type": "vision_analysis",
                    "text": analysis,
                })
                logger.info(f"📸 Vision analysis complete: {analysis[:100]}...")

                # ═══ SCREENSHOT-TO-CHAT: Send extracted text to chat input for user review ═══
                # Instead of auto-triggering answer, let user review/edit the extracted text first.
                # User can then press Enter to trigger the answer with full context.
                if analysis and len(analysis.strip()) > 15:
                    # Auto-detect coding problem and switch mode
                    analysis_lower = analysis.lower()
                    coding_keywords = [
                        "coding problem", "leetcode", "hackerrank", "codesignal",
                        "codeforces", "codechef", "class solution", "def ",
                        "input:", "output:", "example 1", "example 2", "constraints:",
                        "given an array", "given a string", "given a linked list",
                        "time complexity", "space complexity",
                    ]
                    if any(kw in analysis_lower for kw in coding_keywords):
                        active_sessions[session_id]["mode"] = "coding"
                        logger.info("Auto-detected coding problem from screenshot — switching to coding mode")

                    # Send the extracted text to the chat input for review
                    await websocket.send_json({
                        "type": "screenshot_to_chat",
                        "text": analysis,
                    })
                    logger.info("📸 Screenshot text sent to chat for user review")
            except Exception as e:
                logger.error(f"Vision analysis failed: {e}")
                error_msg = f"Error analyzing screenshot: {str(e)}"
                await websocket.send_json({
                    "type": "vision_analysis",
                    "text": error_msg,
                })
                await websocket.send_json({
                    "type": "screenshot_to_chat",
                    "text": error_msg,
                })

    elif action == "archive_round":
        # Archive current round and reset for next
        client_data = data.get("round_data", {})
        client_entries = client_data.get("entries", [])
        server_entries = active_sessions[session_id].get("round_entries", [])
        entries = server_entries if server_entries else client_entries
            
        round_num = active_sessions[session_id].get("round_number", 1)
        # Always prefer active_sessions history_session_id to match auto_save and prevent duplicate sessions
        h_id = active_sessions[session_id].get("history_session_id") or client_data.get("id") or int(datetime.now().timestamp() * 1000)
        s_time = active_sessions[session_id].get("start_time") or client_data.get("timestamp") or datetime.now().isoformat()
        
        # New history ID for next round
        now_ts = datetime.now()
        new_h_id = int(now_ts.timestamp() * 1000)

        if entries:
            round_data = {
                "id": h_id,
                "round_id": f"r{round_num}",
                "round_number": round_num,
                "entries": entries,
                "timestamp": s_time,
            }
            # Save to disk (legacy)
            history_dir = Path("data/history")
            history_dir.mkdir(parents=True, exist_ok=True)
            filepath = history_dir / f"round_{round_num}_{session_id[:8]}.json"
            import json as json_lib
            try:
                filepath.write_text(json_lib.dumps(round_data, indent=2))
            except Exception as e:
                logger.warning(f"Failed to write legacy round file: {e}")

            # Save to history_store (feeds dashboard)
            history_store.upsert_session(round_data)

            await websocket.send_json({
                "type": "round_archived",
                "round_data": round_data,
                "new_history_session_id": new_h_id,
            })
            logger.info(f"📦 Round {round_num} archived ({len(entries)} entries) with id={h_id}")

        # Reset for next round with fresh history_session_id and start_time
        now_ts = datetime.now()
        active_sessions[session_id]["round_number"] += 1
        active_sessions[session_id]["round_question_index"] = 0
        active_sessions[session_id]["round_entries"] = []
        active_sessions[session_id]["language_locked"] = False
        active_sessions[session_id]["history_session_id"] = int(now_ts.timestamp() * 1000)
        active_sessions[session_id]["start_time"] = now_ts.isoformat()
        await websocket.send_json({
            "type": "status",
            "message": f"Round {round_num} archived. Ready for Round {round_num + 1}",
        })

    elif action == "ping":
        await websocket.send_json({"type": "pong"})




# ─── The app page, with link previews pointing at whichever domain served it ─────

@app.get("/", include_in_schema=False)
@app.get("/index.html", include_in_schema=False)
async def app_page(request: Request):
    """index.html with %SITE_URL% filled in, so Reddit, LinkedIn and X previews get absolute links on any domain."""
    from fastapi.responses import HTMLResponse
    import re
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "localhost").split(",")[0].strip()
    proto = (request.headers.get("x-forwarded-proto") or request.url.scheme).split(",")[0].strip()
    # only a plain host[:port] and http(s) ever reach the page: a forged header can't break out of the meta tags
    if not re.fullmatch(r"[A-Za-z0-9.-]{1,253}(:\d{1,5})?", host):
        host = "localhost"
    if proto not in ("http", "https"):
        proto = "https"
    html = (web_dir / "index.html").read_text(encoding="utf-8").replace("%SITE_URL%", f"{proto}://{host}")
    return HTMLResponse(html, headers={"Cache-Control": "no-cache"})


# ─── Static Files (Catch-All) ───────────────────────────────

if web_dir.exists():
    app.mount("/", StaticFiles(directory=str(web_dir), html=True), name="web")
    logger.info(f"📂 Serving web dashboard from {web_dir}")


# ─── Run Server ───────────────────────────────────────────────

if __name__ == "__main__":
    import os
    import threading
    import webbrowser
    import uvicorn

    studio_url = f"http://{config.HOST}:{config.PORT}"
    if os.getenv("AUTO_OPEN_BROWSER", "1") == "1":
        threading.Timer(1.5, lambda: webbrowser.open(studio_url)).start()

    uvicorn.run(
        "main:app",
        host=config.HOST,
        port=config.PORT,
        reload=os.getenv("RELOAD") == "1",   # opt-in: the reloader can leave a stale worker on the port
        log_level="info",
        ws_max_size=1024 * 1024 * 50,  # 50 MB to allow large 4K screenshots
    )
