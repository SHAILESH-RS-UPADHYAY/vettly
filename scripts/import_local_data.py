"""
Copy your local Vettly data (backend/context_store/*.json) into your account on the hosted site.

1. Sign up on the hosted site with your email, so Clerk knows who you are.
2. Pull the hosted settings (needs DATABASE_URL and CLERK_SECRET_KEY):
       vercel env pull backend/.env.hosted
3. From the repo root:
       python scripts/import_local_data.py --email you@example.com
Nothing in your account is replaced unless you pass --force. Your local files are only read.
"""

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))   # docstore and its settings live in backend/
KINDS = ["context", "about_me", "chat_history", "qa_cache", "history", "recycle_bin", "assignment_code", "profile"]


def main() -> None:
    ap = argparse.ArgumentParser(description="Copy local Vettly data into a hosted account")
    ap.add_argument("--email", required=True, help="the email you signed up with")
    ap.add_argument("--env", default=str(BACKEND / ".env.hosted"), help="file with DATABASE_URL and CLERK_SECRET_KEY (default: backend/.env.hosted)")
    ap.add_argument("--force", action="store_true", help="replace documents the account already has")
    args = ap.parse_args()

    # read the local documents first, straight from disk
    store = BACKEND / "context_store"
    docs = {k: json.loads((store / f"{k}.json").read_text(encoding="utf-8")) for k in KINDS if (store / f"{k}.json").exists()}
    if not docs:
        sys.exit(f"No local data found in {store}")

    from dotenv import dotenv_values
    env = dotenv_values(args.env)
    db = env.get("DATABASE_URL") or env.get("POSTGRES_URL")
    secret = env.get("CLERK_SECRET_KEY")
    if not db or not secret:
        sys.exit(f"{args.env} needs DATABASE_URL and CLERK_SECRET_KEY (run: vercel env pull backend/.env.hosted)")
    os.environ["DATABASE_URL"] = db

    query = urllib.parse.urlencode({"email_address": args.email})
    # a browser-like name: Clerk's CDN rejects Python's default "Python-urllib" agent with a 403
    request = urllib.request.Request(f"https://api.clerk.com/v1/users?{query}", headers={
        "Authorization": f"Bearer {secret}", "User-Agent": "vettly-import/1.0", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            found = json.load(response)
    except urllib.error.HTTPError as e:
        why = {401: "CLERK_SECRET_KEY is wrong or from another Clerk app", 403: "Clerk refused the request"}.get(e.code, "Clerk returned an error")
        sys.exit(f"{why} (HTTP {e.code}): {e.read().decode(errors='replace')[:300]}")
    if not found:
        sys.exit(f"No account with {args.email} yet. Sign up on the site first, then run this again.")
    user = found[0]["id"]

    import docstore   # imported now, so it connects to the hosted database rather than the local files
    for kind, data in docs.items():
        if not args.force and docstore.load(user, kind, None) is not None:
            print(f"  kept   {kind} (your account already has one; --force replaces it)")
            continue
        docstore.save(user, kind, data)
        print(f"  copied {kind}")
    print(f"Done: your local data is now in the account for {args.email}")


if __name__ == "__main__":
    main()
