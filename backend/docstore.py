"""
Doc Store — where each user's documents live.

Every store in Vettly keeps one JSON document per user (context, about_me, chat_history, qa_cache, ...).
- DATABASE_URL set (Postgres, e.g. Neon on Vercel): one row per (user, document) in the user_docs table.
- DATABASE_URL=sqlite:///path: the same table in SQLite (tests and offline runs).
- Neither: JSON files in context_store/, exactly where the single-user app always kept them.
"""

import json
import logging
import re
import threading
from datetime import datetime, timezone

import config

logger = logging.getLogger("vettly.docstore")

LOCAL_USER = "local"
_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")

_TABLE = (
    "CREATE TABLE IF NOT EXISTS user_docs ("
    "user_id TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, "
    "PRIMARY KEY (user_id, kind))"
)
_UPSERT = (
    "INSERT INTO user_docs (user_id, kind, data, updated_at) VALUES ({p}, {p}, {p}, {p}) "
    "ON CONFLICT (user_id, kind) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
)


class _Sql:
    """One shared connection, reopened once if the database dropped it (serverless idles it out)."""

    def __init__(self, url: str):
        if url.startswith("sqlite:///"):
            import sqlite3
            path = url[len("sqlite:///"):]
            self._connect = lambda: sqlite3.connect(path, check_same_thread=False, isolation_level=None)
            self._p = "?"
        else:
            import psycopg  # only needed when the app runs against Postgres
            self._connect = lambda: psycopg.connect(url, autocommit=True)
            self._p = "%s"
        self._conn = None
        self._lock = threading.Lock()

    def run(self, sql: str, args: tuple = (), fetch: bool = False):
        statement = sql.format(p=self._p)
        with self._lock:
            for attempt in (1, 2):
                try:
                    if self._conn is None:
                        self._conn = self._connect()
                        self._conn.execute(_TABLE)
                    cur = self._conn.execute(statement, args)
                    return cur.fetchone() if fetch else None
                except Exception:
                    self._conn = None
                    if attempt == 2:
                        raise


_sql = _Sql(config.DATABASE_URL) if config.DATABASE_URL else None


def _check(user: str, kind: str) -> None:
    if not _SAFE_ID.match(user) or not _SAFE_ID.match(kind):
        raise ValueError("Invalid user or document name")


def _file(user: str, kind: str):
    # The local user keeps the original files; anyone else gets a folder of their own
    folder = config.CONTEXT_STORE_DIR if user == LOCAL_USER else config.CONTEXT_STORE_DIR / "users" / user
    return folder / f"{kind}.json"


def load(user: str, kind: str, default):
    """The user's document, or `default` when they have none yet."""
    _check(user, kind)
    if _sql:
        row = _sql.run("SELECT data FROM user_docs WHERE user_id = {p} AND kind = {p}", (user, kind), fetch=True)
        return json.loads(row[0]) if row else default
    path = _file(user, kind)
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning(f"Could not read {path.name}: {e}")
        return default


def save(user: str, kind: str, data) -> None:
    """Replace the user's document. Raises if it could not be written, so callers never lose data silently."""
    _check(user, kind)
    if _sql:
        _sql.run(_UPSERT, (user, kind, json.dumps(data, ensure_ascii=False), datetime.now(timezone.utc).isoformat()))
        return
    path = _file(user, kind)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def delete_user(user: str) -> None:
    """Remove every document the user has (the "delete my data" button)."""
    _check(user, "all")
    if _sql:
        _sql.run("DELETE FROM user_docs WHERE user_id = {p}", (user,))
        return
    if user == LOCAL_USER:
        raise ValueError("The local profile is your own files; delete them by hand if you mean it")
    folder = config.CONTEXT_STORE_DIR / "users" / user
    for path in folder.glob("*.json"):
        path.unlink()
