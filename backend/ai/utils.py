import asyncio
import logging
from typing import Optional

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


async def generate_multi_provider_completion(
    system_prompt: str,
    user_prompt: str,
    history: Optional[list[dict]] = None,
    max_tokens: int = 1000,
    temperature: float = 0.7,
    json_mode: bool = False,
) -> str:
    """
    Unified Multi-Provider LLM router for Vettly.
    Tries configured providers in priority order:
      1. Anthropic Claude (ANTHROPIC_API_KEY)
      2. Google Gemini (GEMINI_API_KEY)
      3. OpenAI (OPENAI_API_KEY)
      4. Groq (GROQ_API_KEY)
    """
    # 1. Try Anthropic Claude
    if getattr(config, "ANTHROPIC_API_KEY", "") and not config.ANTHROPIC_API_KEY.startswith("your_"):
        try:
            return await call_claude_messages(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                history=history,
                max_tokens=max_tokens,
                temperature=temperature,
            )
        except Exception as e:
            logger.warning(f"Claude API error ({e}); checking fallback providers...")

    # 2. Try Google Gemini
    if getattr(config, "GEMINI_API_KEY", "") and not config.GEMINI_API_KEY.startswith("your_"):
        try:
            import google.generativeai as genai
            genai.configure(api_key=config.GEMINI_API_KEY)
            gemini_model_name = getattr(config, "GEMINI_MODEL", "gemini-2.5-flash")
            model = genai.GenerativeModel(gemini_model_name)

            gen_kwargs = {
                "temperature": temperature,
                "max_output_tokens": max_tokens,
            }
            if json_mode:
                gen_kwargs["response_mime_type"] = "application/json"

            full_prompt = f"{system_prompt}\n\n"
            if history:
                for msg in history[-10:]:
                    r = "USER" if msg.get("role") == "user" else "ASSISTANT"
                    full_prompt += f"{r}: {msg.get('content', '')}\n"
            full_prompt += f"\nUSER:\n{user_prompt}"

            response = await model.generate_content_async(
                contents=[full_prompt],
                generation_config=genai.types.GenerationConfig(**gen_kwargs),
            )
            return response.text.strip()
        except Exception as e:
            logger.warning(f"Gemini API error ({e}); checking fallback providers...")

    # 3. Try OpenAI
    if getattr(config, "OPENAI_API_KEY", "") and not config.OPENAI_API_KEY.startswith("your_"):
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=config.OPENAI_API_KEY)
            messages = [{"role": "system", "content": system_prompt}]
            if history:
                for msg in history[-10:]:
                    messages.append({
                        "role": msg.get("role", "user"),
                        "content": msg.get("content", ""),
                    })
            messages.append({"role": "user", "content": user_prompt})
            res = await call_openai_with_retry(
                client,
                client.chat.completions.create,
                model=getattr(config, "OPENAI_MODEL", "gpt-4o-mini"),
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            return res.choices[0].message.content.strip()
        except Exception as e:
            logger.warning(f"OpenAI API error ({e}); checking fallback providers...")

    # 4. Try Groq
    if getattr(config, "GROQ_API_KEY", "") and not config.GROQ_API_KEY.startswith("your_"):
        from groq import AsyncGroq
        client = AsyncGroq(api_key=config.GROQ_API_KEY)
        # Keep system + user prompt within Groq's free-tier token budget
        safe_sys = system_prompt[:14000] if len(system_prompt) > 14000 else system_prompt
        safe_usr = user_prompt[:14000] if len(user_prompt) > 14000 else user_prompt
        messages = [{"role": "system", "content": safe_sys}]
        if history:
            for msg in history[-8:]:
                messages.append({
                    "role": msg.get("role", "user"),
                    "content": msg.get("content", ""),
                })
        messages.append({"role": "user", "content": safe_usr})
        res = await call_groq_with_retry(
            client,
            client.chat.completions.create,
            model=getattr(config, "GROQ_MODEL", "llama-3.3-70b-versatile"),
            messages=messages,
            max_tokens=min(max_tokens, 4000),
            temperature=temperature,
        )
        return res.choices[0].message.content.strip()

    raise RuntimeError(
        "No valid LLM API key configured in backend/.env. "
        "Please add ANTHROPIC_API_KEY (Claude), GEMINI_API_KEY, or GROQ_API_KEY."
    )
