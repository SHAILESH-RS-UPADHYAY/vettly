"""
Transcript Buffer
Assembles partial transcripts into complete sentences/utterances.
"""

import time
import logging
from dataclasses import dataclass, field

logger = logging.getLogger("vettly.stt.buffer")


@dataclass
class TranscriptSegment:
    """A single transcript segment with metadata."""
    text: str
    speaker: str  # "user" or "interviewer"
    timestamp: float = field(default_factory=time.time)
    is_final: bool = False
    language: str = "en"


class TranscriptBuffer:
    """
    Buffers incoming partial transcripts and assembles them into
    complete utterances for processing.
    
    Handles the challenge of Deepgram sending partial results
    that get refined over time before becoming final.
    """

    def __init__(self, utterance_timeout: float = 2.0):
        """
        Args:
            utterance_timeout: Seconds of silence before considering
                               an utterance complete.
        """
        self._current_partial: str = ""
        self._current_speaker: str = ""
        self._final_segments: list[TranscriptSegment] = []
        self._utterance_timeout = utterance_timeout
        self._last_activity: float = time.time()
        self._conversation_log: list[TranscriptSegment] = []

    def add_partial(self, text: str, speaker: str) -> None:
        """Add a partial (interim) transcript result."""
        self._current_partial = text
        self._current_speaker = speaker
        self._last_activity = time.time()

    def add_final(self, text: str, speaker: str, language: str = "en") -> TranscriptSegment:
        """
        Add a final transcript result and return the complete segment.
        
        Returns:
            The finalized transcript segment.
        """
        segment = TranscriptSegment(
            text=text,
            speaker=speaker,
            is_final=True,
            language=language,
        )
        self._final_segments.append(segment)
        self._conversation_log.append(segment)
        self._current_partial = ""
        self._last_activity = time.time()

        return segment

    def get_current_partial(self) -> str:
        """Get the current partial transcript being assembled."""
        return self._current_partial

    def get_conversation_history(self, max_turns: int = 20) -> list[dict]:
        """
        Get the conversation history as a list of dicts.
        
        Args:
            max_turns: Maximum number of turns to return.
            
        Returns:
            List of {"speaker": str, "text": str} dicts.
        """
        recent = self._conversation_log[-max_turns:]
        return [
            {"speaker": seg.speaker, "text": seg.text}
            for seg in recent
        ]

    def get_last_interviewer_question(self) -> str:
        """Get the most recent interviewer utterance."""
        for seg in reversed(self._conversation_log):
            if seg.speaker == "interviewer" and seg.is_final:
                return seg.text
        return ""

    def is_idle(self) -> bool:
        """Check if no speech activity for the utterance timeout period."""
        return (time.time() - self._last_activity) > self._utterance_timeout

    def clear(self) -> None:
        """Clear all buffers and history."""
        self._current_partial = ""
        self._current_speaker = ""
        self._final_segments.clear()
        self._conversation_log.clear()

    @property
    def total_segments(self) -> int:
        return len(self._conversation_log)
