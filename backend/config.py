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
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
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
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-pro-preview")
GEMINI_FAST_MODEL = os.getenv("GEMINI_FAST_MODEL", "gemini-3.8-flash")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

FILLER_MAX_TOKENS = int(os.getenv("FILLER_MAX_TOKENS", "100"))
ANSWER_MAX_TOKENS = int(os.getenv("ANSWER_MAX_TOKENS", "350"))
TEMPERATURE = float(os.getenv("TEMPERATURE", "0.7"))

# ─── Language Settings ───────────────────────────────────────
DEFAULT_LANGUAGE = os.getenv("DEFAULT_LANGUAGE", "en")
HINGLISH_MODE = os.getenv("HINGLISH_MODE", "auto")  # "auto", "always", "never"

# ─── File Paths ──────────────────────────────────────────────
UPLOADS_DIR = BACKEND_DIR / "uploads"
CONTEXT_STORE_DIR = BACKEND_DIR / "context_store"
RECORDINGS_DIR = BACKEND_DIR / "recordings"

# Create directories if they don't exist
for directory in [UPLOADS_DIR, CONTEXT_STORE_DIR, RECORDINGS_DIR]:
    directory.mkdir(parents=True, exist_ok=True)


def get_active_llm_provider() -> str:
    """Return the active LLM provider based on configured API keys."""
    if ANTHROPIC_API_KEY and not ANTHROPIC_API_KEY.startswith("your_"):
        return "claude"
    if GEMINI_API_KEY and not GEMINI_API_KEY.startswith("your_"):
        return "gemini"
    if OPENAI_API_KEY and not OPENAI_API_KEY.startswith("your_"):
        return "openai"
    if GROQ_API_KEY and not GROQ_API_KEY.startswith("your_"):
        return "groq"
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
