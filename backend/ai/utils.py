import asyncio
import json
import logging
from typing import AsyncIterator, Optional

import httpx
import config

logger = logging.getLogger("vettly.ai.utils")


async def call_groq_with_retry(client, func, *args, max_retries=7, initial_delay=2.0, **kwargs):
    """
    Call a Groq API function with retries and exponential backoff on RateLimitError (429).
    """
    import groq
    delay = initial_delay
    for attempt in range(1, max_retries + 1):
        try:
            return await func(*args, **kwargs)
        except groq.RateLimitError as e:
            if attempt == max_retries:
                logger.error(f"Groq Rate Limit exceeded after {max_retries} attempts.")
                raise e
            wait_time = delay * (2 ** (attempt - 1))
            logger.warning(f"Groq Rate Limit (429) hit. Retrying in {wait_time:.1f}s (attempt {attempt}/{max_retries})...")
            await asyncio.sleep(wait_time)
        except Exception as e:
            err_str = str(e).lower()
            if "429" in err_str or "rate limit" in err_str:
                if attempt == max_retries:
                    logger.error(f"Groq Rate Limit exceeded after {max_retries} attempts.")
                    raise e
                wait_time = delay * (2 ** (attempt - 1))
                logger.warning(f"Groq Rate Limit (429) detected in error. Retrying in {wait_time:.1f}s (attempt {attempt}/{max_retries})...")
                await asyncio.sleep(wait_time)
            else:
                raise e


async def call_openai_with_retry(client, func, *args, max_retries=7, initial_delay=2.0, **kwargs):
    """
    Call an OpenAI API function with retries and exponential backoff on RateLimitError (429).
    """
    import openai
    delay = initial_delay
    for attempt in range(1, max_retries + 1):
        try:
            return await func(*args, **kwargs)
        except openai.RateLimitError as e:
            if attempt == max_retries:
                logger.error(f"OpenAI Rate Limit exceeded after {max_retries} attempts.")
                raise e
            wait_time = delay * (2 ** (attempt - 1))
            logger.warning(f"OpenAI Rate Limit (429) hit. Retrying in {wait_time:.1f}s (attempt {attempt}/{max_retries})...")
            await asyncio.sleep(wait_time)
        except Exception as e:
            err_str = str(e).lower()
            if "429" in err_str or "rate limit" in err_str:
                if attempt == max_retries:
                    logger.error(f"OpenAI Rate Limit exceeded after {max_retries} attempts.")
                    raise e
                wait_time = delay * (2 ** (attempt - 1))
                logger.warning(f"OpenAI Rate Limit (429) detected in error. Retrying in {wait_time:.1f}s (attempt {attempt}/{max_retries})...")
                await asyncio.sleep(wait_time)
            else:
                raise e


async def call_claude_messages(
    system_prompt: str,
    user_prompt: str,
    history: Optional[list[dict]] = None,
    max_tokens: int = 1000,
    temperature: float = 0.7,
) -> str:
    """
    Call Anthropic Claude Messages API (/v1/messages) with automatic retry on 429/529.
    """
    api_key = getattr(config, "ANTHROPIC_API_KEY", "")
    model = getattr(config, "ANTHROPIC_MODEL", "claude-3-5-sonnet-latest")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY is not set.")

    messages = []
    if history:
        for msg in history[-10:]:
            role = "user" if msg.get("role") == "user" else "assistant"
            content = (msg.get("content") or "").strip()
            if content:
                # Claude requires alternating user/assistant roles
                if messages and messages[-1]["role"] == role:
                    messages[-1]["content"] += f"\n\n{content}"
                else:
                    messages.append({"role": role, "content": content})

    if user_prompt.strip():
        if messages and messages[-1]["role"] == "user":
            messages[-1]["content"] += f"\n\n{user_prompt.strip()}"
        else:
            messages.append({"role": "user", "content": user_prompt.strip()})

    if not messages:
        messages.append({"role": "user", "content": "Hello"})

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "system": system_prompt,
        "messages": messages,
    }

    delay = 2.0
    async with httpx.AsyncClient(timeout=60.0) as client:
        for attempt in range(1, 5):
            resp = await client.post("https://api.anthropic.com/v1/messages", headers=headers, json=payload)
            if resp.status_code in (429, 529) and attempt < 4:
                wait_time = delay * (2 ** (attempt - 1))
                logger.warning(f"Claude API rate limit/overload ({resp.status_code}). Retrying in {wait_time:.1f}s...")
                await asyncio.sleep(wait_time)
                continue
            resp.raise_for_status()
            data = resp.json()
            blocks = data.get("content", [])
            text_parts = [b.get("text", "") for b in blocks if b.get("type") == "text"]
            return "\n".join(text_parts).strip()

    return ""


# Free tiers first: Gemini and Groq cost the user nothing, Claude and OpenAI need paid credits
PROVIDER_ORDER = ("gemini", "groq", "claude", "openai")
PROVIDER_KEYS = {"gemini": "GEMINI_API_KEY", "groq": "GROQ_API_KEY", "claude": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY"}
PROVIDER_LABELS = {"gemini": "Gemini", "groq": "Groq", "claude": "Claude", "openai": "OpenAI"}


def _usable(attr: str) -> bool:
    key = getattr(config, attr, "") or ""
    return bool(key) and not key.startswith("your_")


async def _via_claude(system_prompt, user_prompt, history, max_tokens, temperature, json_mode):
    return await call_claude_messages(
        system_prompt=system_prompt, user_prompt=user_prompt, history=history,
        max_tokens=max_tokens, temperature=temperature,
    )


async def _via_gemini(system_prompt, user_prompt, history, max_tokens, temperature, json_mode):
    """GEMINI_MODEL, then GEMINI_FAST_MODEL, then other free-tier models: a busy one (503) just moves on."""
    primary_gemini = getattr(config, "GEMINI_MODEL", "gemini-3.6-flash")
    fast_gemini = getattr(config, "GEMINI_FAST_MODEL", "gemini-3.1-flash-lite")
    candidate_models = []
    for m in [primary_gemini, fast_gemini, "gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-flash-lite-latest"]:
        if m and m not in candidate_models:
            candidate_models.append(m)

    full_user_prompt = ""
    if history:
        for msg in history[-10:]:
            r = "USER" if msg.get("role") == "user" else "ASSISTANT"
            full_user_prompt += f"{r}: {msg.get('content', '')}\n"
        full_user_prompt += "\n"
    full_user_prompt += user_prompt

    # Gemini 3.x thinking models share maxOutputTokens between reasoning and output tokens
    gen_config = {"temperature": temperature, "maxOutputTokens": max(max_tokens * 4, 4096)}
    if json_mode:
        gen_config["responseMimeType"] = "application/json"
    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": full_user_prompt}]}],
        "generationConfig": gen_config,
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        for gm_name in candidate_models:
            clean_model = gm_name.replace("models/", "")
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent"
            try:
                # the key travels in a header, never in the URL, so it can't end up in logs
                resp = await client.post(url, json=payload, headers={"x-goog-api-key": config.GEMINI_API_KEY})
                if resp.status_code == 200:
                    candidates = resp.json().get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        text_chunks = [p.get("text", "") for p in parts if not p.get("thought") and p.get("text")]
                        if not text_chunks and parts:
                            text_chunks = [p.get("text", "") for p in parts if p.get("text")]
                        out = "\n".join(text_chunks).strip()
                        if out:
                            return out
                logger.warning(f"Gemini model '{clean_model}' returned HTTP {resp.status_code}: {resp.text[:200]}; trying next model...")
            except Exception as e:
                logger.warning(f"Gemini model '{clean_model}' error ({type(e).__name__}); trying next model...")
    return None


async def _via_openai(system_prompt, user_prompt, history, max_tokens, temperature, json_mode):
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=config.OPENAI_API_KEY)
    messages = [{"role": "system", "content": system_prompt}]
    for msg in (history or [])[-10:]:
        messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
    messages.append({"role": "user", "content": user_prompt})
    res = await call_openai_with_retry(
        client, client.chat.completions.create, model=getattr(config, "OPENAI_MODEL", "gpt-4o-mini"),
        messages=messages, max_tokens=max_tokens, temperature=temperature,
    )
    return res.choices[0].message.content.strip()


async def _via_groq(system_prompt, user_prompt, history, max_tokens, temperature, json_mode):
    from groq import AsyncGroq
    client = AsyncGroq(api_key=config.GROQ_API_KEY)
    # keep system + user prompt within Groq's free-tier token budget
    messages = [{"role": "system", "content": system_prompt[:14000]}]
    for msg in (history or [])[-8:]:
        messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
    messages.append({"role": "user", "content": user_prompt[:14000]})
    res = await call_groq_with_retry(
        client, client.chat.completions.create, model=getattr(config, "GROQ_MODEL", "llama-3.3-70b-versatile"),
        messages=messages, max_tokens=min(max_tokens, 4000), temperature=temperature,
    )
    return res.choices[0].message.content.strip()


async def _via_custom(system_prompt, user_prompt, history, max_tokens, temperature, json_mode):
    """The user's own OpenAI-compatible provider (OpenRouter, Together, DeepSeek, Mistral…), from Settings → Key Ring.
    Its host is checked again before every call, and redirects are never followed."""
    from allowance import own_custom, public_host
    c = own_custom.get()
    if not c or not await public_host(c["base_url"]):
        return None
    messages = [{"role": "system", "content": system_prompt}]
    for msg in (history or [])[-10:]:
        messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
    messages.append({"role": "user", "content": user_prompt})
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=False) as client:
        resp = await client.post(f"{c['base_url']}/chat/completions", headers={"Authorization": f"Bearer {c['key']}", "X-Title": "Vettly"},
                                 json={"model": c["model"], "messages": messages, "max_tokens": max_tokens, "temperature": temperature})
        resp.raise_for_status()
        return (resp.json()["choices"][0]["message"].get("content") or "").strip()


_CALLERS = {"gemini": _via_gemini, "groq": _via_groq, "claude": _via_claude, "openai": _via_openai, "custom": _via_custom}


async def generate_multi_provider_completion(
    system_prompt: str,
    user_prompt: str,
    history: Optional[list[dict]] = None,
    max_tokens: int = 1000,
    temperature: float = 0.7,
    json_mode: bool = False,
) -> str:
    """
    Unified multi-provider router for Vettly: Gemini → Groq → Claude → OpenAI (PROVIDER_ORDER).
    Providers without a key are skipped; a failing provider hands over to the next one.
    """
    from allowance import own_custom
    custom = own_custom.get()   # the user's own provider: first or last, as they chose
    order = list(PROVIDER_ORDER)
    if custom:
        order = ["custom", *order] if custom.get("first") else [*order, "custom"]
    attempted: list[str] = []   # providers that had a key, so a failure is not reported as a missing key
    for name in order:
        if name != "custom" and not _usable(PROVIDER_KEYS[name]):
            continue
        label = custom.get("label", "Your provider") if name == "custom" else PROVIDER_LABELS[name]
        attempted.append(label)
        try:
            out = await _CALLERS[name](system_prompt, user_prompt, history, max_tokens, temperature, json_mode)
            if out:
                return out
        except Exception as e:
            logger.warning(f"{label} failed ({type(e).__name__}: {str(e)[:160]}); trying the next provider...")

    if attempted:
        raise RuntimeError(
            f"The AI service is busy or over its quota right now ({', '.join(attempted)} tried). "
            "Try again in a minute, or add a key for another provider."
        )
    raise RuntimeError(
        "No AI key yet. Add a free Gemini or Groq key in Settings → Key Ring to get answers."
    )


async def stream_gemini_chat(system_prompt: str, history: list[dict]) -> AsyncIterator[str]:
    """
    Stream a multi-turn Gemini chat as text chunks (SSE streamGenerateContent).
    Uses GEMINI_BOT_MODEL (newest Pro) first; falls back to the other configured
    Gemini models only when a model rejects the request before streaming starts.
    """
    api_key = getattr(config, "GEMINI_API_KEY", "")
    if not api_key or api_key.startswith("your_"):
        raise ValueError("GEMINI_API_KEY is not set in backend/.env.")

    contents = []
    for msg in history:
        role = "user" if msg.get("role") == "user" else "model"
        text = (msg.get("content") or "").strip()
        if not text:
            continue
        # Gemini expects alternating user/model turns
        if contents and contents[-1]["role"] == role:
            contents[-1]["parts"][0]["text"] += f"\n\n{text}"
        else:
            contents.append({"role": role, "parts": [{"text": text}]})

    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": contents,
    }
    models = dict.fromkeys([config.GEMINI_BOT_MODEL, config.GEMINI_MODEL, config.GEMINI_FAST_MODEL])

    # Key goes in a header, not the URL: httpx logs request URLs at INFO level
    async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=15.0), headers={"x-goog-api-key": api_key}) as client:
        for model in models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent"
            async with client.stream("POST", url, params={"alt": "sse"}, json=payload) as resp:
                if resp.status_code != 200:
                    body = (await resp.aread()).decode(errors="ignore")[:200]
                    logger.warning(f"Gemini model '{model}' returned HTTP {resp.status_code}: {body}; trying next model...")
                    continue
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    for cand in json.loads(line[6:]).get("candidates", [])[:1]:
                        for part in cand.get("content", {}).get("parts", []):
                            if part.get("text") and not part.get("thought"):
                                yield part["text"]
                return

    raise RuntimeError("Every configured Gemini model rejected the request.")
