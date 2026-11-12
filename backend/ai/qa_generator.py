"""
Q&A Generator — Pre-Interview Question & Answer Preparation
Generates high-probability interview questions from candidate context,
then creates validated humanized answers for each.
"""

import asyncio
import json
import logging
from typing import Optional

from groq import AsyncGroq

import config
from ai.prompts import (
    QA_GENERATOR_PROMPT,
    QA_GENERATOR_USER_TEMPLATE,
)

logger = logging.getLogger("vettly.ai.qa_generator")


# What each level means, for single questions and MCQs alike
DIFFICULTY_RULES = {
    "easy": "DIFFICULTY: EASY. A warm-up a fresher answers comfortably: one clear idea, a definition or a simple example. No tricks.",
    "medium": "DIFFICULTY: MEDIUM. The standard level a real interviewer asks for this role: applying the idea, not just naming it.",
    "hard": "DIFFICULTY: HARD. A demanding question: depth, trade-offs, edge cases or a multi-step scenario that separates strong candidates.",
}


class QAGenerator:
    """
    Generates interview questions tailored to the candidate's resume,
    projects, and background. Questions are categorized by type and
    difficulty for maximum interview coverage.
    """

    def __init__(self):
        self._provider = config.get_active_llm_provider()

    async def generate_questions(
        self,
        context: str,
        count: int = 60,
        job_role: Optional[str] = None,
        company: Optional[str] = None,
    ) -> list[dict]:
        """
        Generate interview questions from candidate context.

        Args:
            context: Full candidate context (resume + GitHub + custom).
            count: Target number of questions (50-80 range).
            job_role: Optional target job role for more specific questions.
            company: Optional company name for company-specific prep.

        Returns:
            List of question dicts with category, question, difficulty, keywords.
        """
        job_context = ""
        if job_role:
            job_context += f"TARGET JOB ROLE: {job_role}\n"
        if company:
            job_context += f"TARGET COMPANY: {company}\n"
        if job_context:
            job_context = f"Generate questions specifically for this role:\n{job_context}"

        user_prompt = QA_GENERATOR_USER_TEMPLATE.format(
            context=context[:80000],
            job_context=job_context,
            count=count,
        )

        try:
            # Generate in batches to avoid token limits
            all_questions = []

            # Distribute count: Behavioral (40%), Technical (30%), Projects (20%), HR (10%)
            c1 = max(1, int(count * 0.40))
            c2 = max(1, int(count * 0.30))
            c3 = max(1, int(count * 0.20))
            c4 = max(1, count - (c1 + c2 + c3))
            if c4 < 1:
                c4 = 1

            # Batch 1: Behavioral + Situational
            batch1 = await self._generate_batch(
                context[:80000],
                job_context,
                c1,
                "Focus on BEHAVIORAL and SITUATIONAL questions only.",
                language,
            )
            all_questions.extend(batch1)

            # Batch 2: Technical + System Design
            batch2 = await self._generate_batch(
                context[:80000],
                job_context,
                c2,
                "Focus on TECHNICAL and SYSTEM_DESIGN questions only.",
                language,
            )
            all_questions.extend(batch2)

            # Batch 3: Project Deep Dive
            batch3 = await self._generate_batch(
                context[:80000],
                job_context,
                c3,
                "Focus on PROJECT_DEEP_DIVE questions only. Ask about specific projects mentioned.",
                language,
            )
            all_questions.extend(batch3)

            # Batch 4: HR / Culture Fit
            batch4 = await self._generate_batch(
                context[:80000],
                job_context,
                c4,
                "Focus on HR_CULTURE_FIT questions only. Salary expectations, career goals, why this company, work-life balance, cultural alignment.",
                language,
            )
            all_questions.extend(batch4)

            # Deduplicate
            seen = set()
            unique = []
            for q in all_questions:
                q_text = q.get("question", "").strip().lower()
                if q_text and q_text not in seen:
                    seen.add(q_text)
                    unique.append(q)

            logger.info(f"📝 Generated {len(unique)} unique questions")
            return unique

        except Exception as e:
            logger.error(f"Question generation failed: {e}")
            return []

    async def _generate_batch(
        self,
        context: str,
        job_context: str,
        count: int,
        focus: str,
        language: str = "ENGLISH",
    ) -> list[dict]:
        """Generate a batch of questions with a specific focus."""
        lang_instruction = "Use simple, confident ENGLISH." if language == "ENGLISH" else "Use simplest English mixed with casual Hinglish."
        user_prompt = QA_GENERATOR_USER_TEMPLATE.format(
            context=context,
            job_context=f"{job_context}\n{focus}\n\nLANGUAGE ENFORCEMENT: {lang_instruction}",
            count=count,
        )

        try:
            from ai.utils import generate_multi_provider_completion
            content = await generate_multi_provider_completion(
                system_prompt=QA_GENERATOR_PROMPT,
                user_prompt=user_prompt,
                max_tokens=4000,
                temperature=0.8,
                json_mode=True,
            )

            # Extract JSON array from response — handle multiple wrapper formats
            # Strip markdown code blocks
            if "```json" in content:
                content = content.split("```json", 1)[1]
                content = content.split("```", 1)[0].strip()
            elif "```" in content:
                content = content.split("```", 1)[1]
                content = content.split("```", 1)[0].strip()

            # Find the JSON array brackets
            start = content.find("[")
            end = content.rfind("]")
            if start != -1 and end != -1 and end > start:
                content = content[start:end + 1]

            questions = json.loads(content)

            if isinstance(questions, list):
                logger.info(f"  → Batch generated {len(questions)} questions ({focus[:40]}...)")
                return questions
            return []

        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse question batch: {e}")
            logger.debug(f"Raw content (first 500 chars): {content[:500]}")
            return []
        except Exception as e:
            logger.error(f"Batch generation error: {e}")
            return []

    async def generate_single_question(
        self,
        context: str,
        category: str,
        job_role: Optional[str] = None,
        company: Optional[str] = None,
        language: str = "ENGLISH",
        existing_questions: Optional[list[str]] = None,
        difficulty: str = "medium",
        subject: Optional[str] = None,
    ) -> Optional[dict]:
        """
        Generate exactly ONE question + answer for a specific category.
        
        Args:
            context: Full candidate context.
            category: One of BEHAVIORAL, TECHNICAL, PROJECT_DEEP_DIVE, etc.
            job_role: Target job role.
            company: Target company name.
            language: ENGLISH or HINGLISH.
            existing_questions: List of already-generated question texts.
        
        Returns:
            Single question dict or None if generation fails.
        """
        job_context = ""
        if job_role:
            job_context += f"TARGET JOB ROLE: {job_role}\n"
        if company:
            job_context += f"TARGET COMPANY: {company}\n"

        # Build the avoid-duplicates block
        avoid_block = ""
        if existing_questions:
            avoid_list = "\n".join(f"- {q}" for q in existing_questions[-15:])  # Last 15 to keep prompt short
            avoid_block = f"\n\nDO NOT repeat these already-generated questions:\n{avoid_list}\n"

        # Category-specific focus instructions
        category_focus = {
            "BEHAVIORAL": "Generate a BEHAVIORAL question — teamwork, conflict, leadership, failure, strengths, weaknesses, 'tell me about yourself', motivation.",
            "TECHNICAL": "Generate a TECHNICAL question based on technologies in the candidate's resume. Ask about specific tech concepts, architecture decisions, or debugging scenarios.",
            "PROJECT_DEEP_DIVE": "Generate a PROJECT_DEEP_DIVE question about a SPECIFIC project from the candidate's resume. Use the actual project name. Ask about architecture, challenges, tech choices, or tradeoffs.",
            "DSA_CODING": "Generate a DSA/CODING question — data structures, algorithms, or a coding problem appropriate for the candidate's skill level. Include a problem that requires writing code.",
            "SYSTEM_DESIGN": "Generate a SYSTEM_DESIGN question — design a system, scale a service, choose databases, design APIs. Match the candidate's experience level.",
            "SITUATIONAL": "Generate a SITUATIONAL question — 'What would you do if...' scenarios relevant to software engineering or the candidate's background.",
            "HR_CULTURE_FIT": "Generate an HR/CULTURE FIT question — salary expectations, career goals, why this company, work-life balance, management style preference, remote work.",
            "ASSIGNMENT": "Generate a question specifically about the company's ASSIGNMENT/ASSESSMENT details provided in the context. Ask about implementation decisions, code logic, or approach.",
            "GENERAL": "Generate a realistic GENERAL interview question relevant to the candidate's domain, fundamental concepts, or general problem solving.",
        }

        # any field's own category (e.g. CLINICAL_SCENARIOS for a nurse) gets a focus written from its name
        focus = category_focus.get(category) or (
            f'Generate a question in the "{category.replace("_", " ").title()}" area, written for the candidate\'s '
            "own field, target role and level as shown in the context. Use that field's real language, not software terms."
        )

        focus += "\n" + DIFFICULTY_RULES.get(difficulty, DIFFICULTY_RULES["medium"])
        if subject:
            focus += (f'\nSUBJECT: the question MUST test "{subject}", the way an interviewer for the role the candidate '
                      "is aiming at would ask it. Stay on that subject even if it is outside their main field.")

        if language == "HINGLISH":
            lang_rules = """- LANGUAGE: Generate both the QUESTION and the ANSWER in authentic, casual Hinglish (Hindi written in English alphabet mixed with English technical terms).
- Make it sound like a smart professional from Delhi talking to a peer."""
        else:
            lang_rules = """- LANGUAGE: Generate the QUESTION in professional English. The ANSWER MUST be in pure, simple, and confident English ONLY. DO NOT use any Hinglish or Hindi words."""

        single_prompt = f"""You are an expert interview coach. Generate EXACTLY 1 high-probability interview question and a personalized first-person answer.

{focus}
{avoid_block}

ANSWER RULES:
- First person ("I", "my").
- FOR CONCEPT QUESTIONS ("what is X?", "how does Y work?", "difference between A and B"): Explain the concept directly and simply in 1-2 clear sentences (Google-snippet clarity). Do NOT force a project reference into the answer unless specifically asked.
- FOR EXPERIENCE / PROJECT QUESTIONS: Use actual project details from candidate context.
- Sound confident, conversational, and direct.
{lang_rules}
- Be truthful — only reference things in the candidate's context.
- Keep answers concise, 2-4 sentences max.

OUTPUT: Return ONLY a single JSON object (NOT an array):
{{"category": "{category}", "question": "...", "answer": "...", "difficulty": "{difficulty}", "keywords": ["...", "..."]}}"""

        user_prompt = f"""CANDIDATE CONTEXT:
{context[:80000]}

{job_context}

Generate exactly 1 {category} question with answer. Return ONLY a single JSON object."""

        try:
            from ai.utils import generate_multi_provider_completion
            content = await generate_multi_provider_completion(
                system_prompt=single_prompt,
                user_prompt=user_prompt,
                max_tokens=2000,
                temperature=0.85,
                json_mode=True,
            )

            # Strip markdown wrappers
            if "```json" in content:
                content = content.split("```json", 1)[1]
                content = content.split("```", 1)[0].strip()
            elif "```" in content:
                content = content.split("```", 1)[1]
                content = content.split("```", 1)[0].strip()

            # If the model returned an array, take the first item
            content = content.strip()
            if content.startswith("["):
                items = json.loads(content)
                if items:
                    result = items[0]
                else:
                    return None
            else:
                # Find JSON object
                start = content.find("{")
                end = content.rfind("}")
                if start != -1 and end != -1 and end > start:
                    content = content[start:end + 1]
                result = json.loads(content)

            if isinstance(result, dict) and result.get("question"):
                logger.info(f"✅ Single question generated [{category}]: {result['question'][:70]}...")
                return result
            return None

        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse single question: {e}")
            return None
        except Exception as e:
            logger.error(f"Single question generation error: {e}")
            return None

