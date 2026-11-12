"""
Question Matcher — Fast Matching for Live Interview Questions
Compares incoming questions against the pre-generated Q&A cache
using direct intent matching, keyword overlap, and LLM semantic matching.
"""

import json
import logging
import re
from typing import Optional

import functools

from groq import AsyncGroq

import config
from ai.prompts import QUESTION_MATCHER_PROMPT
from context.qa_cache import QACache

logger = logging.getLogger("vettly.context.matcher")

# Common stop words to ignore during keyword extraction (crucial words like 'why' removed)
STOP_WORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "about", "into", "through", "during", "before", "after", "above",
    "below", "between", "out", "off", "over", "under", "again", "further",
    "then", "once", "here", "there", "when", "where", "how", "all",
    "each", "every", "both", "few", "more", "most", "other", "some", "such",
    "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very",
    "just", "don", "now", "and", "but", "or", "if", "while", "that",
    "which", "whom", "this", "these", "those", "am", "it", "its",
    "me", "my", "your", "you", "we", "they", "he", "she", "him", "her",
    "his", "our", "their", "please", "walk", "through",
}


class QuestionMatcher:
    """
    Matches live interview questions against pre-cached Q&A pairs.
    
    Three-stage matching:
    0. Fast direct & core intent match (< 1ms) — matches exact questions, aliases, and core interview intents
    1. Fast keyword overlap (< 10ms) — narrows candidates with dynamic min overlap
    2. LLM semantic check (< 0.5s) — confirms semantic equivalence with candidate
    """

    KEYWORD_MIN_OVERLAP = 2
    SEMANTIC_CONFIDENCE_THRESHOLD = 0.8

    @functools.cached_property
    def _client(self):
        # built on first use: a client costs ~100 ms of CPU, which the server's start should not pay
        return AsyncGroq(api_key=config.GROQ_API_KEY)

    def __init__(self, qa_cache: QACache):
        self._cache = qa_cache

    def extract_keywords(self, text: str) -> list[str]:
        """Extract meaningful keywords from a question."""
        text = re.sub(r'[^\w\s]', '', text.lower())
        words = text.split()
        keywords = [w for w in words if w not in STOP_WORDS and len(w) > 2]
        return keywords

    async def find_match(self, live_question: str) -> Optional[dict]:
        """
        Find the best matching cached Q&A for a live question.
        
        Returns:
            Dict with keys: question, answer, confidence, match_type, category, score
            None if no match found above threshold.
        """
        if self._cache.count == 0:
            return None

        clean_live = re.sub(r'[^\w\s]', '', live_question.lower()).strip()
        all_entries = self._cache.get_all()

        # ─── Stage 0A: Core Interview Intent Matching (< 1ms) ───
        
        # 1. Self Intro / About Me (English & Hinglish)
        is_intro = (
            clean_live in (
                "intro", "self intro", "introduction", "tell me about yourself",
                "tell us about yourself", "introduce yourself", "who are you",
                "give me an intro", "give an intro",
                "walk me through your resume", "walk me through your background"
            )
            or clean_live.startswith("intro")
            or "about yourself" in clean_live
            or "introduce yourself" in clean_live
            or "walk me through your resume" in clean_live
            or "walk me through your background" in clean_live
            or "give a brief intro" in clean_live
            or any(phrase in clean_live for phrase in (
                "apne baare me", "apne bare me", "apne baare mein", "apne bare mein",
                "apna intro", "apna introduction", "apne background", "apne baare", "apne bare",
                "kuch apne baare", "kch apne baare"
            ))
            or (
                ("batao" in clean_live or "bataiye" in clean_live or "boliye" in clean_live or "do" in clean_live)
                and ("apne" in clean_live or "intro" in clean_live or "background" in clean_live or "profile" in clean_live)
            )
        )
        if is_intro:
            for entry in all_entries:
                if entry["question"].strip().lower() == "intro":
                    logger.info(f"⚡ [Stage 0] Core Intent Match: Intro | live: \"{live_question}\"")
                    return {
                        "question": entry["question"],
                        "answer": entry["answer"],
                        "confidence": 1.0,
                        "match_type": "exact_intent",
                        "category": entry.get("category", "ABOUT_ME"),
                        "score": entry.get("score", 1.0),
                    }

        # 2. Why Soft System Solution (English & Hinglish)
        is_why_sss = (
            ("why" in clean_live and ("soft system" in clean_live or "soft systems" in clean_live or "sss" in clean_live))
            or clean_live in (
                "why soft system solution", "why soft systems solution", "why soft system",
                "why sss", "why this company", "why join soft system solution",
                "why work at soft system solution", "why do you want to join soft system solution"
            )
            or (
                ("soft system" in clean_live or "soft systems" in clean_live or "sss" in clean_live or "company" in clean_live)
                and ("kyu" in clean_live or "kyun" in clean_live or "join" in clean_live or "aana" in clean_live or "kaam" in clean_live)
            )
        )
        if is_why_sss:
            for entry in all_entries:
                if "why soft system" in entry["question"].lower():
                    logger.info(f"⚡ [Stage 0] Core Intent Match: Why Soft System | live: \"{live_question}\"")
                    return {
                        "question": entry["question"],
                        "answer": entry["answer"],
                        "confidence": 1.0,
                        "match_type": "exact_intent",
                        "category": entry.get("category", "HR_CULTURE_FIT"),
                        "score": entry.get("score", 1.0),
                    }

        # 3. Why should we hire you (English & Hinglish)
        is_why_hire = (
            ("hire" in clean_live and ("why" in clean_live or "should" in clean_live or "we" in clean_live or "fit" in clean_live))
            or clean_live in (
                "why should we hire you", "why should we hire u", "why hire you",
                "why hire u", "why should i hire you", "why you", "why choose you",
                "what makes you a good fit"
            )
            or (
                ("hire" in clean_live or "chune" in clean_live or "select" in clean_live or "le" in clean_live)
                and ("kyu" in clean_live or "kyun" in clean_live or "aapko" in clean_live or "apko" in clean_live or "hum" in clean_live)
            )
            or "hum aapko kyu hire" in clean_live
            or "aapko kyu hire" in clean_live
            or "aapko kyu chune" in clean_live
        )
        if is_why_hire:
            for entry in all_entries:
                if "why should we hire you" in entry["question"].lower():
                    logger.info(f"⚡ [Stage 0] Core Intent Match: Why Hire You | live: \"{live_question}\"")
                    return {
                        "question": entry["question"],
                        "answer": entry["answer"],
                        "confidence": 1.0,
                        "match_type": "exact_intent",
                        "category": entry.get("category", "HR_CULTURE_FIT"),
                        "score": entry.get("score", 1.0),
                    }

        # 4. Questions for us / Questions for interviewer (English & Hinglish)
        is_questions_for_us = (
            (("question" in clean_live or "questions" in clean_live or "ques" in clean_live or "que" in clean_live) and (
                "for us" in clean_live or "for me" in clean_live or "have for" in clean_live
                or "ask us" in clean_live or "ask me" in clean_live or "any question" in clean_live
                or "any ques" in clean_live or "do you have" in clean_live or "you have" in clean_live
            ))
            or clean_live in (
                "what questions do you have for us", "what questions do you have for me",
                "questions for us", "any questions for us", "do you have any questions for us",
                "do you have any questions for me", "do you have any questions", "any questions",
                "do u have any ques for me", "any ques for me", "any ques for us", "do you have any ques for me",
                "anything you want to ask", "anything you would like to ask"
            )
            or any(phrase in clean_live for phrase in (
                "mujhse kch poochna", "mujhse kuch poochna", "mujhse kuch puchna", "mujhse kch puchna",
                "mere se koi sawal", "mere se koi sawaal", "humse kuch poochna", "humse kch poochna",
                "koi sawal hai", "koi sawaal hai", "kuch poochna hai", "kch poochna hai",
                "kuch puchna hai", "kch puchna hai", "kuch poochna chahte ho", "kuch puchna chahte ho",
                "aapka koi sawal", "apka koi sawal", "aapka koi question", "apka koi question",
                "kuch sawal hai", "kch sawal hai", "koi query hai", "koi doubt hai"
            ))
            or (
                ("poochna" in clean_live or "puchna" in clean_live or "sawal" in clean_live or "sawaal" in clean_live)
                and ("mujhse" in clean_live or "mere se" in clean_live or "humse" in clean_live or "aapka" in clean_live or "apka" in clean_live or "koi" in clean_live or "kuch" in clean_live or "kch" in clean_live)
            )
        )
        if is_questions_for_us:
            for entry in all_entries:
                if "what questions do you have for us" in entry["question"].lower():
                    logger.info(f"⚡ [Stage 0] Core Intent Match: Questions for Us | live: \"{live_question}\"")
                    return {
                        "question": entry["question"],
                        "answer": entry["answer"],
                        "confidence": 1.0,
                        "match_type": "exact_intent",
                        "category": entry.get("category", "HR_CULTURE_FIT"),
                        "score": entry.get("score", 1.0),
                    }

        # ─── Stage 0B: Exact Title / Sub-Question Match (< 1ms) ───
        for entry in all_entries:
            q_clean = re.sub(r'[^\w\s]', '', entry["question"].lower()).strip()
            sub_qs = [re.sub(r'[^\w\s]', '', s.lower()).strip() for s in entry["question"].split("/")]
            if clean_live == q_clean or clean_live in sub_qs:
                logger.info(f"✅ Exact title cache hit! | live: \"{live_question}\"")
                return {
                    "question": entry["question"],
                    "answer": entry["answer"],
                    "confidence": 1.0,
                    "match_type": "exact",
                    "category": entry.get("category", ""),
                    "score": entry.get("score", 0),
                }

        # ─── Stage 1: Fast Keyword Overlap (< 10ms) ───
        live_keywords = self.extract_keywords(live_question)
        if not live_keywords:
            return None

        min_overlap = 1 if len(live_keywords) <= 2 else self.KEYWORD_MIN_OVERLAP
        keyword_matches = self._cache.find_by_keywords(
            live_keywords,
            min_overlap=min_overlap,
        )

        if not keyword_matches:
            logger.debug(f"No keyword matches for: {live_question[:60]}...")
            return None

        # ─── Stage 2: Instant Pure-Python Match (< 2ms, ZERO network latency) ───
        # Eliminates 1.5s - 3.5s delay caused by sequential Groq LLM calls.
        import difflib
        clean_live_lower = clean_live.lower()
        live_kw_set = set(live_keywords)
        best_candidate = None
        highest_score = 0.0

        for candidate in keyword_matches[:5]:
            cand_q = candidate["question"].lower()
            clean_cand = re.sub(r'[^\w\s]', '', cand_q).strip()
            
            # 1. String similarity ratio
            sim_ratio = difflib.SequenceMatcher(None, clean_live_lower, clean_cand).ratio()
            
            # 2. Keyword overlap ratio
            cand_kws = set(self.extract_keywords(cand_q))
            kw_overlap = len(live_kw_set & cand_kws) / max(len(cand_kws), 1)
            
            # Combined score (weighted average)
            score = 0.5 * sim_ratio + 0.5 * kw_overlap

            if score > highest_score:
                highest_score = score
                best_candidate = candidate

        # High confidence threshold for instant cached answer
        if highest_score >= 0.72 and best_candidate:
            logger.info(
                f"⚡ [Fast Match] Cache hit! score={highest_score:.0%} "
                f"| cached: \"{best_candidate['question'][:50]}...\" "
                f"| live: \"{live_question[:50]}...\""
            )
            return {
                "question": best_candidate["question"],
                "answer": best_candidate["answer"],
                "confidence": highest_score,
                "match_type": "fast_keyword_similarity",
                "category": best_candidate.get("category", ""),
                "score": best_candidate.get("score", 0),
            }

        return None

    async def _semantic_match(
        self, cached_question: str, live_question: str
    ) -> Optional[dict]:
        """Use LLM to check if two questions are semantically equivalent."""
        try:
            prompt = QUESTION_MATCHER_PROMPT.format(
                cached_question=cached_question,
                live_question=live_question,
            )

            response = await self._client.chat.completions.create(
                model=config.GROQ_MODEL,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=150,
                temperature=0.1,
            )

            content = response.choices[0].message.content.strip()

            # Parse JSON
            if "```" in content:
                start = content.find("{")
                end = content.rfind("}") + 1
                content = content[start:end]

            return json.loads(content)

        except Exception as e:
            logger.warning(f"Semantic matching error: {e}")
            return None
