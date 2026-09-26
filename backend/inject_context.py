"""
Acemate Context Injector — CLEAN VERSION
Only injects experience data. All other context is managed via the dashboard UI.
"""
import json
import sys
from pathlib import Path

backend_dir = Path(__file__).parent
sys.path.append(str(backend_dir))

from ai.context_engine import ContextEngine


def inject_context():
    ce = ContextEngine()
    ce.load_context()

    # Experience is already preserved in context.json from the wipe.
    # This script is now a no-op placeholder.
    # All new data (resume, GitHub, projects, JD) should be added via the dashboard.

    existing = ce.get_structured_context()
    exp = existing.get("experience", [])
    print(f"Current experience entries: {len(exp)}")
    for e in exp:
        print(f"  - {e.get('company', '?')} | {e.get('role', '?')}")
    print("Done. Use the dashboard to add new context.")


if __name__ == "__main__":
    inject_context()
