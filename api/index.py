"""
Vercel Serverless Entrypoint for Vettly FastAPI Backend
"""
import sys
from pathlib import Path

# Add backend directory to sys.path so imports work identically on Vercel
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app  # noqa: E402, F401
