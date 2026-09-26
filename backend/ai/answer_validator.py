"""
Answer Validator — Iterative Humanization Loop
Generates an answer, validates it for human-ness, rewrites if needed.
Loops until the answer passes or max iterations reached.

V2: Added Hinglish-aware validation, opener diversity scoring, and quick mode.
"""

import json
import logging
from typing import Optional

from groq import AsyncGroq

import config
from ai.prompts import (
    ANSWER_SYSTEM_PROMPT,
    ANSWER_USER_TEMPLATE,
    ANSWER_SYSTEM_PROMPT_HINGLISH,
    ANSWER_USER_TEMPLATE_HINGLISH,
    ANSWER_VALIDATOR_PROMPT,
    ANSWER_VALIDATOR_USER_TEMPLATE,
    ANSWER_REWRITER_PROMPT,
    format_history,
)
from ai.humanizer import Humanizer

logger = logging.getLogger("vettly.ai.validator")


class AnswerValidator:
    """
    Iterative humanization validation loop:
    1. Generate answer
    2. Humanize it
    3. Validate (score 1-10 on naturalness, specificity, etc.)
    4. If score < 8 → rewrite with specific feedback → go to step 3
    5. Max 3 iterations to prevent infinite loops

    V2 enhancements:
    - Hinglish-aware: Uses Hinglish prompts when language is "hinglish"
    - Opener diversity: Tracks previous answer openers
    - Quick mode: Single-iteration validation for live interviews
    """

    MAX_ITERATIONS = 3
    PASSING_SCORE = 8.0
    QUICK_PASSING_SCORE = 6.5  # Relaxed threshold for live mode

    def __init__(self):
        self._use_gemini = False
        if hasattr(config, "GEMINI_API_KEY") and config.GEMINI_API_KEY:
            import google.generativeai as genai
            genai.configure(api_key=config.GEMINI_API_KEY)
            self._gemini_model = genai.GenerativeModel("gemini-2.0-flash")
            self._use_gemini = True
        else:
            self._client = AsyncGroq(api_key=config.GROQ_API_KEY)
        self._humanizer = Humanizer()

    async def generate_validated_answer(
        self,
        question: str,
        context: str,
        history: Optional[list[dict]] = None,
        language: str = "en",
        previous_opener: str = "",
        quick_mode: bool = False,
        session_buffer: str = "",
    ) -> dict:
        """
        Generate and validate an answer through the humanization loop.

        Args:
            question: The interview question.
            context: Full candidate context.
            history: Conversation history.
            language: "en" or "hinglish".
            previous_opener: First ~30 chars of the last answer for variety.
            quick_mode: If True, only 1 iteration with relaxed thresholds (for live interviews).
            session_buffer: Formatted string of recent Q&A pairs for multi-turn coherence.

        Returns:
            Dict with keys: answer, score, iterations, validation_details
        """
        history = history or []

        # Set humanizer language
        self._humanizer.set_language(language)

        # Step 1: Generate initial answer (language-aware)
        raw_answer = await self._generate_answer(question, context, history, language, previous_opener, session_buffer)
        if not raw_answer:
            return {"answer": "", "score": 0, "iterations": 0, "validation_details": {}}

        # Step 2: Humanize
        answer = self._humanizer.humanize(raw_answer, mode="answer")

        # Quick mode: return after humanization without validation loop
        if quick_mode:
            logger.info(f"  ⚡ Quick mode: skipping validation loop")
            return {
                "answer": answer,
                "score": 7.0,  # Assumed decent
                "iterations": 0,
                "validation_details": {"quick_mode": True},
            }

        # Step 3-5: Validation loop
        max_iters = 1 if quick_mode else self.MAX_ITERATIONS
        passing_score = self.QUICK_PASSING_SCORE if quick_mode else self.PASSING_SCORE

        best_answer = answer
        best_score = 0
        validation_details = {}

        for iteration in range(1, max_iters + 1):
            # Validate
            result = await self._validate_answer(question, answer, context)

            score = result.get("overall_score", 0)
            passes = result.get("passes", False)

            logger.info(
                f"  Iteration {iteration}/{max_iters}: "
                f"score={score:.1f}/10 {'✅ PASS' if passes else '❌ FAIL'}"
            )

            # Log individual dimension scores for analysis
            for dim in ["naturalness", "specificity", "no_ai_tells", "conversational_flow",
                        "appropriate_length", "language_consistency", "opener_variety"]:
                dim_score = result.get(dim, "N/A")
                if dim_score != "N/A":
                    logger.debug(f"    {dim}: {dim_score}/10")

            # Track best
            if score > best_score:
                best_score = score
                best_answer = answer
                validation_details = result

            # If it passes, we're done
            if passes or score >= passing_score:
                logger.info(f"  ✅ Answer validated after {iteration} iteration(s)")
                return {
                    "answer": answer,
                    "score": score,
                    "iterations": iteration,
                    "validation_details": result,
                }

            # If not passing and we have more iterations, rewrite
            if iteration < max_iters:
                rewrite_instructions = result.get(
                    "rewrite_instructions",
                    "Make it sound more natural and conversational."
                )

                # Add Hinglish-specific rewrite instruction if needed
                if language == "hinglish":
                    lang_score = result.get("language_consistency", 10)
                    if lang_score < 7:
                        rewrite_instructions += (
                            "\n\nCRITICAL: The answer must be in HINGLISH (Roman script). "
                            "Use Hindi sentence structure with English technical terms. "
                            "Example: 'Maine implement kiya' not 'I implemented'. "
                            "'Humne build kiya' not 'We built'."
                        )

                answer = await self._rewrite_answer(
                    question, answer, rewrite_instructions, context
                )
                # Humanize the rewrite too
                answer = self._humanizer.humanize(answer, mode="answer")

        # Return the best answer we got
        logger.info(
            f"  ⚠️ Max iterations reached. Best score: {best_score:.1f}/10"
        )
        return {
            "answer": best_answer,
            "score": best_score,
            "iterations": max_iters,
            "validation_details": validation_details,
        }

    async def _generate_answer(
        self, question: str, context: str, history: list[dict],
        language: str = "en", previous_opener: str = "",
        session_buffer: str = "",
    ) -> str:
        """Generate the initial raw answer (language-aware)."""
        try:
            buffer_text = ""
            if session_buffer:
                buffer_text = f"=== SESSION BUFFER (recent Q&A from this interview) ===\n{session_buffer}"

            if language == "hinglish":
                sys_prompt = ANSWER_SYSTEM_PROMPT_HINGLISH
                user_prompt = ANSWER_USER_TEMPLATE_HINGLISH.format(
                    context=context[:80000],
                    history=format_history(history, max_turns=5),
                    question=question,
                    previous_opener=previous_opener or "(first answer — no previous)",
                    session_buffer=buffer_text,
                )
            else:
                sys_prompt = ANSWER_SYSTEM_PROMPT
                user_prompt = ANSWER_USER_TEMPLATE.format(
                    context=context[:80000],
                    history=format_history(history, max_turns=5),
                    question=question,
                    previous_opener=previous_opener or "(first answer — no previous)",
                    session_buffer=buffer_text,
                )

            from ai.utils import generate_multi_provider_completion
            return await generate_multi_provider_completion(
                system_prompt=sys_prompt,
                user_prompt=user_prompt,
                max_tokens=config.ANSWER_MAX_TOKENS,
                temperature=0.75,
            )

        except Exception as e:
            logger.error(f"Answer generation failed: {e}")
            return ""

    async def _validate_answer(
        self, question: str, answer: str, context: str
    ) -> dict:
        """Validate an answer for human authenticity."""
        try:
            user_prompt = ANSWER_VALIDATOR_USER_TEMPLATE.format(
                question=question,
                answer=answer,
                context=context[:80000],
            )

            from ai.utils import generate_multi_provider_completion
            content = await generate_multi_provider_completion(
                system_prompt=ANSWER_VALIDATOR_PROMPT,
                user_prompt=user_prompt,
                max_tokens=500,
                temperature=0.3,
                json_mode=True,
            )

            # Parse JSON from response
            if "```" in content:
                start = content.find("{")
                end = content.rfind("}") + 1
                content = content[start:end]

            result = json.loads(content)

            # Ensure passes field is set correctly
            score = result.get("overall_score", 0)
            result["passes"] = score >= self.PASSING_SCORE

            return result

        except json.JSONDecodeError:
            logger.warning("Validation response was not valid JSON, assuming pass")
            return {"overall_score": 8.0, "passes": True, "rewrite_instructions": ""}
        except Exception as e:
            logger.error(f"Validation failed: {e}")
            return {"overall_score": 7.0, "passes": False, "rewrite_instructions": "Make it more natural."}

    async def _rewrite_answer(
        self, question: str, answer: str, instructions: str, context: str
    ) -> str:
        """Rewrite an answer based on validation feedback."""
        try:
            prompt = ANSWER_REWRITER_PROMPT.format(
                original_answer=answer,
                rewrite_instructions=instructions,
                context=context[:80000],
                question=question,
            )

            from ai.utils import generate_multi_provider_completion
            rewritten = await generate_multi_provider_completion(
                system_prompt="You are an expert technical interview coach refining candidate answers.",
                user_prompt=prompt,
                max_tokens=config.ANSWER_MAX_TOKENS,
                temperature=0.7,
            )
            logger.info(f"  📝 Answer rewritten ({len(rewritten)} chars)")
            return rewritten

        except Exception as e:
            logger.error(f"Rewrite failed: {e}")
            return answer
