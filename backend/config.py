"""
Vettly Configuration Module
Loads settings from environment variables and provides multi-provider LLM defaults
(Anthropic Claude, Google Gemini, OpenAI, and Groq).
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from the backend directory
BACKEND_DIR = Path(__file__).parent
load_dotenv(BACKEND_DIR / ".env")


# ─── API Keys (Multi-Provider Support) ───────────────────────
# The four AI keys are looked up per request (see __getattr__ below): a user who saved their own key gets it here
_SERVER_KEYS = {n: os.getenv(n, "") for n in ("ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY", "OPENAI_API_KEY")}


def __getattr__(name):
    if name in _SERVER_KEYS:
        from allowance import own_keys
        mine = own_keys.get()
        return mine[name] if mine is not None else _SERVER_KEYS[name]
    raise AttributeError(name)


DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")

# ─── Server Settings ─────────────────────────────────────────
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8766"))

# ─── Audio Settings ──────────────────────────────────────────
SAMPLE_RATE = int(os.getenv("SAMPLE_RATE", "16000"))
CHANNELS = int(os.getenv("CHANNELS", "1"))
CHUNK_DURATION_MS = int(os.getenv("CHUNK_DURATION_MS", "30"))

# Computed: bytes per chunk for 16-bit audio
CHUNK_SIZE = int(SAMPLE_RATE * CHUNK_DURATION_MS / 1000) * 2  # 2 bytes per sample (16-bit)

# ─── LLM Settings ────────────────────────────────────────────
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-latest")
# Defaults that work on the Gemini free tier (Pro models have no free quota); set the env vars to use Pro on a paid key
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
GEMINI_FAST_MODEL = os.getenv("GEMINI_FAST_MODEL", "gemini-3.1-flash-lite")
# Mentor bot: a flash model by default; on a paid key, "gemini-pro-latest" tracks the newest Pro release
GEMINI_BOT_MODEL = os.getenv("GEMINI_BOT_MODEL", "gemini-3.6-flash")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

FILLER_MAX_TOKENS = int(os.getenv("FILLER_MAX_TOKENS", "100"))
ANSWER_MAX_TOKENS = int(os.getenv("ANSWER_MAX_TOKENS", "350"))
TEMPERATURE = float(os.getenv("TEMPERATURE", "0.7"))

# ─── Language Settings ───────────────────────────────────────
DEFAULT_LANGUAGE = os.getenv("DEFAULT_LANGUAGE", "en")
HINGLISH_MODE = os.getenv("HINGLISH_MODE", "auto")  # "auto", "always", "never"

# ─── Accounts & Storage (hosted, multi-user) ─────────────────
# Clerk sign-in. The Clerk integration on Vercel sets the NEXT_PUBLIC_ name; either works. Unset = single-user local mode.
CLERK_PUBLISHABLE_KEY = os.getenv("CLERK_PUBLISHABLE_KEY") or os.getenv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "")
CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "")   # only import_local_data.py needs it
# Optional: the origins allowed to request tokens (e.g. https://vettly.app), comma separated
CLERK_AUTHORIZED_PARTIES = [o.strip() for o in os.getenv("CLERK_AUTHORIZED_PARTIES", "").split(",") if o.strip()]
# Postgres from the Neon integration. Unset = JSON files in context_store/
DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL", "")
ON_VERCEL = bool(os.getenv("VERCEL"))

# ─── File Paths ──────────────────────────────────────────────
UPLOADS_DIR = BACKEND_DIR / "uploads"
CONTEXT_STORE_DIR = BACKEND_DIR / "context_store"
RECORDINGS_DIR = BACKEND_DIR / "recordings"

# Create directories if they don't exist (safe on read-only serverless filesystems)
for directory in [UPLOADS_DIR, CONTEXT_STORE_DIR, RECORDINGS_DIR]:
    try:
        directory.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass


def get_active_llm_provider() -> str:
    """Return the active LLM provider based on configured API keys."""
    for name, provider in (("ANTHROPIC_API_KEY", "claude"), ("GEMINI_API_KEY", "gemini"), ("OPENAI_API_KEY", "openai"), ("GROQ_API_KEY", "groq")):
        key = __getattr__(name)
        if key and not key.startswith("your_"):
            return provider
    return "unconfigured"


def validate_config():
    """Check that at least one LLM API key is configured."""
    errors = []
    if get_active_llm_provider() == "unconfigured":
        errors.append(
            "No LLM API key configured. Set ANTHROPIC_API_KEY (Claude), "
            "GEMINI_API_KEY (Google AI Studio), or GROQ_API_KEY in backend/.env"
        )
    return errors
