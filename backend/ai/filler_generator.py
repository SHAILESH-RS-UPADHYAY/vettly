"""
Filler Generator — Instant Response Engine
Generates a quick 2-3 line filler response in ~0.5s using Groq's fast inference.

V2: Added opener tracking and Hinglish fallback messages.
"""

import logging
from groq import AsyncGroq

import config
from ai.prompts import (
    FILLER_SYSTEM_PROMPT, FILLER_USER_TEMPLATE,
    FILLER_SYSTEM_PROMPT_HINGLISH, FILLER_USER_TEMPLATE_HINGLISH,
    format_history, get_opener_instruction,
)

logger = logging.getLogger("vettly.ai.filler")

# Fallback uses question text so each response is unique even if API fails
def _fallback_en(question: str) -> str:
    truncated = question.strip()[:60]
    return f"So about {truncated} — the main thing I'd focus on is..."

def _fallback_hinglish(question: str) -> str:
    truncated = question.strip()[:60]
    return f"Haan toh {truncated} ke baare mein baat karein toh main point yeh hai..."


class FillerGenerator:
    """
    Generates instant filler responses to buy time while the full answer
    is being generated.
    
    Uses a minimal prompt and low max_tokens for maximum speed.
    Target: response in < 0.5 seconds.
    """

    def __init__(self):
        self._client = AsyncGroq(api_key=config.GROQ_API_KEY)

    async def generate(
        self,
        question: str,
        context: str,
        history: list[dict],
        language: str = "en",
        previous_opener: str = "",
    ) -> str:
        """
        Generate an instant filler response.
        
        Args:
            question: The interviewer's question.
            context: Full candidate context (resume + GitHub + custom).
            history: Conversation history as list of {"speaker": str, "text": str}.
            language: Language mode - "en" or "hinglish".
            previous_opener: First ~30 chars of previous filler/answer to avoid repetition.
            
        Returns:
            A 2-3 line natural filler response.
        """
        fallback_models = [
            config.GROQ_MODEL,
            "qwen/qwen3.8-27b",
            "qwen/qwen3.6-27b",
            "groq/compound-mini",
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
        ]
        
        models_to_try = []
        for m in fallback_models:
            if m not in models_to_try:
                models_to_try.append(m)

        # Select prompts based on language
        if language == "hinglish":
            sys_prompt = FILLER_SYSTEM_PROMPT_HINGLISH
            usr_template = FILLER_USER_TEMPLATE_HINGLISH
            fallback_fn = _fallback_hinglish
        else:
            sys_prompt = FILLER_SYSTEM_PROMPT
            usr_template = FILLER_USER_TEMPLATE
            fallback_fn = _fallback_en

        opener_instruction = get_opener_instruction(previous_opener)

        for model in models_to_try:
            try:
                user_prompt = usr_template.format(
                    context=context[:2000],
                    history=format_history(history, max_turns=3),
                    question=question,
                    previous_opener=previous_opener or "(first answer — no previous)",
                    opener_instruction=opener_instruction,
                )

                response = await self._client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": sys_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    max_tokens=config.FILLER_MAX_TOKENS,
                    temperature=0.8,
                    top_p=0.9,
                    stream=False,
                )

                filler = response.choices[0].message.content.strip()

                # Safety: truncate if somehow too long
                sentences = filler.split(". ")
                if len(sentences) > 3:
                    filler = ". ".join(sentences[:3]) + "..."

                logger.debug(f"Filler generated: {filler[:60]}...")
                return filler

            except Exception as e:
                logger.warning(f"Filler error on {model}: {e}")
                continue  # Try every model — don't bail early on non-rate-limit errors

        logger.error("All models exhausted for filler.")
        return fallback_fn(question)  # Dynamic fallback includes question text
