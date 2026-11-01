"""
Users — who is asking, and their own copy of every store.

Local runs (no Clerk key): one user, "local", whose data stays in context_store/*.json as before.
Hosted runs: every API request carries a Clerk session token. The middleware in main.py verifies it and
records the user for that request; the store objects in main.py are PerUser stand-ins that resolve to the
requesting user's own instance, loaded from the doc store for that request only.
"""

import base64
import contextvars

import config
from docstore import LOCAL_USER

_user: contextvars.ContextVar = contextvars.ContextVar("vettly_user", default=None)
_stores: contextvars.ContextVar = contextvars.ContextVar("vettly_stores", default=None)

# Paths that read or write someone's data; everything else (the web app, health, config) is public
PROTECTED = ("/api/", "/context", "/upload", "/github", "/prepare", "/status")
PUBLIC = ("/api/health", "/api/config")


class AuthError(Exception):
    def __init__(self, message: str, status: int = 401):
        super().__init__(message)
        self.status = status


def auth_enabled() -> bool:
    return bool(config.CLERK_PUBLISHABLE_KEY)


def is_protected(path: str) -> bool:
    return path.startswith(PROTECTED) and not path.startswith(PUBLIC)


def frontend_api() -> str:
    """Clerk's Frontend API host, which is encoded in the publishable key (pk_live_<base64 host$>)."""
    encoded = config.CLERK_PUBLISHABLE_KEY.split("_", 2)[-1]
    return base64.b64decode(encoded + "=" * (-len(encoded) % 4)).decode().rstrip("$")


def begin_request() -> None:
    """Called once per request: nobody is signed in yet, and no store has been loaded."""
    _user.set(None)
    _stores.set({})


_jwks = None


def authenticate(header: str) -> str:
    """Verify the request's Clerk session token and remember whose request this is."""
    if not auth_enabled():
        if config.ON_VERCEL:   # a public deployment without sign-in would be one profile shared by everyone
            raise AuthError("Sign-in isn't set up on this deployment yet", 503)
        _user.set(LOCAL_USER)
        return LOCAL_USER

    token = header[7:].strip() if header[:7].lower() == "bearer " else ""
    if not token:
        raise AuthError("Sign in to continue")

    import jwt   # PyJWT, only needed once sign-in is configured
    global _jwks
    host = frontend_api()
    if _jwks is None:
        _jwks = jwt.PyJWKClient(f"https://{host}/.well-known/jwks.json", cache_keys=True, lifespan=3600)
    try:
        key = _jwks.get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token, key, algorithms=["RS256"], issuer=f"https://{host}",
            options={"require": ["exp", "iat", "sub"]}, leeway=10,
        )
    except jwt.PyJWTError:
        raise AuthError("Your session has ended. Sign in again")
    if config.CLERK_AUTHORIZED_PARTIES and claims.get("azp") not in config.CLERK_AUTHORIZED_PARTIES:
        raise AuthError("This sign-in came from a site Vettly doesn't trust")
    _user.set(claims["sub"])
    return claims["sub"]


def user_id() -> str:
    uid = _user.get()
    if uid:
        return uid
    if not auth_enabled():
        return LOCAL_USER
    raise PermissionError("No signed-in user for this request")


def has_user() -> bool:
    return bool(_user.get()) or not auth_enabled()


class PerUser:
    """Stands in for one store: every attribute resolves to the current user's own instance."""

    def __init__(self, factory):
        object.__setattr__(self, "_factory", factory)

    def _target(self):
        cache = _stores.get()
        if cache is None:   # outside a request (startup, scripts)
            cache = {}
            _stores.set(cache)
        key = (id(self), user_id())
        if key not in cache:
            cache[key] = self._factory()
        return cache[key]

    def __getattr__(self, name):
        return getattr(self._target(), name)

    def __setattr__(self, name, value):
        setattr(self._target(), name, value)
