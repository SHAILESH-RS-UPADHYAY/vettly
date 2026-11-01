"""
Q&A Cache — Persistent Storage for Validated Interview Q&A Pairs
Stores pre-generated, humanization-validated Q&A pairs on disk.
Loaded at startup for instant retrieval during live interviews.
"""

import logging
from datetime import datetime
from typing import Optional

import docstore
import users

logger = logging.getLogger("vettly.context.qa_cache")

_GENERATION: dict[str, dict] = {}   # bulk generation progress, by user


class QACache:
    """
    Stores validated Q&A pairs as JSON on disk.
    Each entry: question, answer, category, keywords, score, validated_at.
    """

    def __init__(self, user: Optional[str] = None):
        self._user = user or users.user_id()
        self._entries: list[dict] = []
        # a bulk run outlives the request that started it, so its progress is kept per user, not per instance
        self._generation_status = _GENERATION.setdefault(self._user, {
            "running": False,
            "total": 0,
            "completed": 0,
            "failed": 0,
            "started_at": None,
            "finished_at": None,
        })
        self.load()

    def load(self) -> None:
        """Load this user's prepared Q&A pairs."""
        self._entries = docstore.load(self._user, "qa_cache", {}).get("entries", [])

    def save(self) -> None:
        """Persist this user's prepared Q&A pairs."""
        docstore.save(self._user, "qa_cache", {
            "entries": self._entries,
            "last_updated": datetime.now().isoformat(),
            "total_entries": len(self._entries),
        })

    def add_entry(
        self,
        question: str,
        answer: str,
        category: str = "GENERAL",
        keywords: list[str] = None,
        difficulty: str = "medium",
        score: float = 0.0,
        iterations: int = 0,
    ) -> None:
        """Add a validated Q&A pair to the cache."""
        entry = {
            "question": question,
            "answer": answer,
            "category": category,
            "keywords": keywords or [],
            "difficulty": difficulty,
            "score": score,
            "iterations": iterations,
            "validated_at": datetime.now().isoformat(),
        }

        # Replace if same question exists
        self._entries = [
            e for e in self._entries
            if e["question"].strip().lower() != question.strip().lower()
        ]
        self._entries.append(entry)

    def get_all(self) -> list[dict]:
        """Get all cached Q&A pairs."""
        return self._entries

    def get_by_category(self, category: str) -> list[dict]:
        """Get Q&A pairs filtered by category."""
        return [e for e in self._entries if e["category"] == category]

    def get_keywords_index(self) -> dict[str, list[int]]:
        """Build a keyword-to-entry-index map for fast lookup."""
        index = {}
        for i, entry in enumerate(self._entries):
            for kw in entry.get("keywords", []):
                kw_lower = kw.lower()
                if kw_lower not in index:
                    index[kw_lower] = []
                index[kw_lower].append(i)
        return index

    def find_by_keywords(self, keywords: list[str], min_overlap: int = 2) -> list[dict]:
        """Find entries that share keywords with the given list."""
        kw_index = self.get_keywords_index()
        scores = {}

        for kw in keywords:
            kw_lower = kw.lower()
            if kw_lower in kw_index:
                for idx in kw_index[kw_lower]:
                    scores[idx] = scores.get(idx, 0) + 1

        # Return entries with enough keyword overlap, sorted by overlap count
        matches = [
            (self._entries[idx], count)
            for idx, count in scores.items()
            if count >= min_overlap
        ]
        matches.sort(key=lambda x: x[1], reverse=True)

        return [m[0] for m in matches]

    def update_entry(self, index: int, **kwargs) -> None:
        """Update fields of a specific Q&A entry by index.
        
        Supports updating: answer, user_rating, score, etc.
        """
        if 0 <= index < len(self._entries):
            self._entries[index].update(kwargs)
            self._entries[index]["last_modified"] = datetime.now().isoformat()
            logger.info(f"📝 Updated Q&A #{index}: {list(kwargs.keys())}")
        else:
            logger.warning(f"Invalid Q&A index: {index}")

    def clear(self) -> None:
        """Clear all cached Q&A pairs."""
        self._entries = []
        self.save()
        logger.info("🗑️ Q&A cache cleared")

    @property
    def count(self) -> int:
        return len(self._entries)

    @property
    def status(self) -> dict:
        return {
            **self._generation_status,
            "cached_count": len(self._entries),
        }

    def set_generation_status(self, **kwargs) -> None:
        """Update the generation progress status."""
        self._generation_status.update(kwargs)

    def get_stats(self) -> dict:
        """Get statistics about the cached Q&A pairs."""
        if not self._entries:
            return {"total": 0}

        categories = {}
        total_score = 0
        for entry in self._entries:
            cat = entry.get("category", "UNKNOWN")
            categories[cat] = categories.get(cat, 0) + 1
            total_score += entry.get("score", 0)

        return {
            "total": len(self._entries),
            "avg_score": round(total_score / len(self._entries), 1) if self._entries else 0,
            "categories": categories,
        }
