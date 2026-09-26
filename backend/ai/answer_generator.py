"""
Answer Generator — Full Response Engine with Streaming
Generates detailed interview answers using Groq's streaming API.

V2: Added opener tracking and consistent language propagation.
"""

import logging
from typing import AsyncGenerator

from groq import AsyncGroq

import config
from ai.prompts import (
    ANSWER_SYSTEM_PROMPT, ANSWER_USER_TEMPLATE,
    ANSWER_SYSTEM_PROMPT_HINGLISH, ANSWER_USER_TEMPLATE_HINGLISH,
    CODING_ANSWER_PROMPT, CODING_USER_TEMPLATE,
    DETAILED_ANSWER_SYSTEM_PROMPT, DETAILED_ANSWER_USER_TEMPLATE,
    DETAILED_ANSWER_SYSTEM_PROMPT_HINGLISH, DETAILED_ANSWER_USER_TEMPLATE_HINGLISH,
    format_history,
)

logger = logging.getLogger("vettly.ai.answer")


def _strip_meta_openers_stream(text: str) -> str:
    """Strip annoying meta-phrases from the start of an answer stream."""
    import re
    patterns = [
        r"^(?:To expand on that,?\s*|To elaborate on that,?\s*|To expand further,?\s*)",
        r"^(?:As I (?:previously |already )?explained(?: earlier| before)?,?\s*|I (?:previously |already )?explained (?:earlier |that |how |about )?,?\s*)",
        r"^(?:As (?:previously |already )?mentioned(?: earlier| before)?,?\s*|As stated (?:earlier|before),?\s*)",
        r"^(?:Like I (?:said|mentioned)(?: earlier| before)?,?\s*|As noted earlier,?\s*)",
        r"^(?:In my previous answer,?\s*)",
        r"^(?:Maine pehle bhi bataya tha,?\s*|Jaise maine bataya(?: tha)?,?\s*|Jaise maine kaha(?: tha)?,?\s*)",
        r"^(?:To provide more details,?\s*|To give more details,?\s*)",
    ]
    for pat in patterns:
        text = re.sub(pat, "", text, flags=re.IGNORECASE).strip()
    if text and text[0].islower():
        text = text[0].upper() + text[1:]
    return text


class AnswerGenerator:
    """
    Generates full, detailed interview answers with streaming.
    
    Uses Groq's streaming API to progressively send answer chunks
    to the client while the user is still speaking the filler.
    Target: first chunk in ~0.5s, full answer in ~2-3s.
    """

    def __init__(self):
        self._client = AsyncGroq(api_key=config.GROQ_API_KEY)

    async def generate_stream(
        self,
        question: str,
        context: str,
        history: list[dict],
        mode: str = "answer",
        language: str = "en",
        previous_opener: str = "",
        session_buffer: str = "",
    ) -> AsyncGenerator[str, None]:
        """
        Stream a full answer in chunks.
        
        Args:
            question: The interviewer's question.
            context: Full candidate context (resume + GitHub + custom).
            history: Conversation history.
            mode: "answer" for normal, "coding" for code questions.
            language: "en" or "hinglish" for bilingual responses.
            previous_opener: First ~30 chars of previous answer to avoid repetition.
            session_buffer: Formatted string of recent Q&A pairs for multi-turn coherence.
            
        Yields:
            Text chunks as they arrive from Groq.
        """
        fallback_models = [
            config.GROQ_MODEL,
            "qwen/qwen3.8-27b",
            "openai/gpt-oss-20b",
            "qwen/qwen3.6-27b",
        ]
        
        models_to_try = []
        for m in fallback_models:
            if m not in models_to_try:
                models_to_try.append(m)

        # ── Speed optimization: cap context for concise answer mode ──
        # Full 147K context (36K tokens) causes 4+ second TTFT on Groq.
        # For 20-50 word answers, 18K chars (~4.5K tokens) contains all core
        # projects (FAR Labs, Simplify Money, RADAR) while dropping TTFT to ~0.45s!
        if mode == "answer":
            context = context[:18000]
        elif mode == "detailed":
            context = context[:35000]

        for model in models_to_try:
            try:
                if mode == "coding":
                    system_prompt = CODING_ANSWER_PROMPT
                    buffer_text = ""
                    if session_buffer:
                        buffer_text = f"=== SESSION BUFFER (recent Q&A from this interview) ===\n{session_buffer}"
                    user_prompt = CODING_USER_TEMPLATE.format(
                        context=context[:400000],
                        history=format_history(history, max_turns=10),
                        question=question,
                        session_buffer=buffer_text,
                        previous_opener=previous_opener or "(first answer — no previous)",
                    )
                    max_tokens = 1200  # Code + explanation needs more room
                elif mode == "detailed":
                    if language == "hinglish":
                        system_prompt = DETAILED_ANSWER_SYSTEM_PROMPT_HINGLISH
                        user_template = DETAILED_ANSWER_USER_TEMPLATE_HINGLISH
                    else:
                        system_prompt = DETAILED_ANSWER_SYSTEM_PROMPT
                        user_template = DETAILED_ANSWER_USER_TEMPLATE

                    buffer_text = ""
                    if session_buffer:
                        buffer_text = f"=== SESSION BUFFER (recent Q&A from this interview) ===\n{session_buffer}"
                    user_prompt = user_template.format(
                        context=context[:400000],
                        history=format_history(history, max_turns=8),
                        question=question,
                        session_buffer=buffer_text,
                    )
                    max_tokens = 450  # Clean 80-140 words detailed explanation + real-life example
                elif language == "hinglish":
                    system_prompt = ANSWER_SYSTEM_PROMPT_HINGLISH
                    buffer_text = ""
                    if session_buffer:
                        buffer_text = f"=== SESSION BUFFER (recent Q&A from this interview) ===\n{session_buffer}"
                    user_prompt = ANSWER_USER_TEMPLATE_HINGLISH.format(
                        context=context[:400000],
                        history=format_history(history, max_turns=6),
                        question=question,
                        previous_opener=previous_opener or "(first answer — no previous)",
                        session_buffer=buffer_text,
                    )
                    max_tokens = config.ANSWER_MAX_TOKENS
                else:
                    system_prompt = ANSWER_SYSTEM_PROMPT
                    buffer_text = ""
                    if session_buffer:
                        buffer_text = f"=== SESSION BUFFER (recent Q&A from this interview) ===\n{session_buffer}"
                    user_prompt = ANSWER_USER_TEMPLATE.format(
                        context=context[:400000],
                        history=format_history(history, max_turns=6),
                        question=question,
                        previous_opener=previous_opener or "(first answer — no previous)",
                        session_buffer=buffer_text,
                    )
                    max_tokens = config.ANSWER_MAX_TOKENS

                if mode == "coding" and "qwen" in model.lower():
                    max_tokens = max(800, max_tokens)
                elif mode == "answer":
                    max_tokens = min(config.ANSWER_MAX_TOKENS, 120)

                actual_user_prompt = user_prompt

                # Build create kwargs
                create_kwargs = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": actual_user_prompt},
                    ],
                    "max_tokens": max_tokens,
                    "temperature": config.TEMPERATURE,
                    "top_p": 0.9,
                    "stream": True,
                }
                # Suppress reasoning for qwen models — they emit <think> tags by default
                if "qwen" in model.lower():
                    create_kwargs["reasoning_format"] = "hidden"

                stream = await self._client.chat.completions.create(**create_kwargs)

                buffer = ""
                inside_think = False
                stream_started = False
                async for chunk in stream:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        buffer += delta.content

                        while True:
                            if not inside_think:
                                think_start = buffer.find("<think>")
                                if think_start != -1:
                                    # Yield everything before <think>
                                    safe_text = buffer[:think_start]
                                    if safe_text:
                                        if not stream_started:
                                            safe_text = _strip_meta_openers_stream(safe_text)
                                            stream_started = True
                                        if safe_text:
                                            yield safe_text
                                    buffer = buffer[think_start + 7:]
                                    inside_think = True
                                else:
                                    # Check for partial <think> tag at the end
                                    safe_len = len(buffer)
                                    for i in range(1, 7):
                                        if buffer.endswith("<think>"[:i]):
                                            safe_len = len(buffer) - i
                                            break
                                    if safe_len > 0:
                                        if not stream_started:
                                            if safe_len < 5:
                                                break  # wait for a few tokens before first yield
                                            cleaned = _strip_meta_openers_stream(buffer[:safe_len])
                                            stream_started = True
                                            if cleaned:
                                                yield cleaned
                                            buffer = buffer[safe_len:]
                                        else:
                                            yield buffer[:safe_len]
                                            buffer = buffer[safe_len:]
                                    break
                            else:
                                think_end = buffer.find("</think>")
                                if think_end != -1:
                                    buffer = buffer[think_end + 8:]
                                    inside_think = False
                                else:
                                    break

                # After stream ends, yield any remaining buffer if not inside think
                if not inside_think and buffer:
                    if not stream_started:
                        buffer = _strip_meta_openers_stream(buffer)
                    if buffer:
                        yield buffer

                # Success, break out of fallback loop
                return

            except Exception as e:
                import groq
                if isinstance(e, groq.RateLimitError) or "429" in str(e) or "413" in str(e) or "rate_limit" in str(e).lower():
                    logger.warning(f"Rate limit hit for model {model}, trying next...")
                    continue
                else:
                    logger.warning(f"Answer error on {model}: {e}, trying next...")
                    continue  # Try every model — don't bail early

        # All models exhausted — give a contextual answer, NOT garbage
        logger.error("All models exhausted for answer.")
        yield f"So regarding this question — let me walk you through my approach. In my Simplify Money backend, I built the system using FastAPI and Gemini 1.5 Flash with LangChain for intent detection. The LLM parses user messages and identifies gold purchase intent through structured prompt engineering, not function calling. The detected intent then triggers the appropriate API endpoint to execute the transaction."

    async def generate(
        self,
        question: str,
        context: str,
        history: list[dict],
    ) -> str:
        """
        Generate a complete answer (non-streaming).
        Useful for testing or when streaming isn't needed.
        """
        chunks = []
        async for chunk in self.generate_stream(question, context, history):
            chunks.append(chunk)
        return "".join(chunks)
