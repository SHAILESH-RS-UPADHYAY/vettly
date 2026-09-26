"""
Re-export QuestionMatcher from context.question_matcher for backwards compatibility.
"""

from context.question_matcher import QuestionMatcher, STOP_WORDS

__all__ = ["QuestionMatcher", "STOP_WORDS"]
