"""The server's key pool: the router walks Gemini 1, Groq 1, Gemini 2, Groq 2, Gemini 3, and a user's own keys skip it."""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.update(GEMINI_API_KEY="g1,g2,g3", GROQ_API_KEY="q1, q2", ANTHROPIC_API_KEY="", OPENAI_API_KEY="")
import config
config._SERVER_KEYS.update(GEMINI_API_KEY=["g1", "g2", "g3"], GROQ_API_KEY=["q1", "q2"], ANTHROPIC_API_KEY=[], OPENAI_API_KEY=[])
import allowance
from ai import utils

tried = []
async def busy(attr):
    tried.append(getattr(config, attr)); raise RuntimeError("429")
utils._CALLERS.update(gemini=lambda *a: busy("GEMINI_API_KEY"), groq=lambda *a: busy("GROQ_API_KEY"))

allowance.own_keys.set(None)
try: asyncio.run(utils.generate_multi_provider_completion("s", "u"))
except RuntimeError as e: msg = str(e)
assert tried == ["g1", "q1", "g2", "q2", "g3"], tried
assert "Gemini 3" in msg and config.GEMINI_API_KEY == "g1", msg   # the slot is put back afterwards

tried.clear()
allowance.own_keys.set({"GEMINI_API_KEY": "mine", "GROQ_API_KEY": "", "ANTHROPIC_API_KEY": "", "OPENAI_API_KEY": ""})
try: asyncio.run(utils.generate_multi_provider_completion("s", "u"))
except RuntimeError: pass
assert tried == ["mine"], tried
print("pool ok")

# Vercel may install from pyproject.toml or requirements.txt: the two lists must be the same
import tomllib  # noqa: E402
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
reqs = [l.strip() for l in open(os.path.join(root, "requirements.txt")) if l.strip() and not l.startswith("#")]
assert tomllib.load(open(os.path.join(root, "pyproject.toml"), "rb"))["project"]["dependencies"] == reqs, "pyproject.toml and requirements.txt differ"
print("deploy deps ok")
