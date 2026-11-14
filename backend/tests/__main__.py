"""Runs every test file in this folder, one after another: python -m tests (from backend/)."""
import subprocess
import sys
from pathlib import Path

here = Path(__file__).parent
files = sorted(here.glob("test_*.py"))
failed = [f.name for f in files if subprocess.run([sys.executable, str(f)], cwd=here.parent).returncode]
print(f"{len(files) - len(failed)} of {len(files)} test files passed" + (f"; failed: {', '.join(failed)}" if failed else ""))
sys.exit(1 if failed else 0)
