"""
Humanizer — Makes AI Output Sound Natural
Post-processes AI responses to add fillers, pauses, and natural speech patterns.

V2: Added Hinglish-specific casualization and improved filler system.
"""

import re
import random
import logging

logger = logging.getLogger("vettly.ai.humanizer")


class Humanizer:
    """
    Transforms polished AI text into natural-sounding speech.
    
    Adds:
    - Filler words (so, basically, you know, like)
    - Pause markers [pause] for natural breathing
    - Thinking sounds [hmm] before complex explanations
    - Self-corrections for authenticity
    - Hinglish code-switching when in Hinglish mode
    """

    # Common filler insertions
    FILLERS_EN = [
        "so basically",
        "you know",
        "like",
        "I mean",
        "actually",
        "kind of",
        "sort of",
    ]

    FILLERS_HINGLISH = [
        "toh basically",
        "matlab",
        "you know na",
        "actually",
        "like",
        "woh kya hai na",
        "basically",
        "dekho na",
        "aur phir",
    ]

    # Words that sound too formal / AI-like (English)
    FORMAL_TO_CASUAL_EN = {
        "utilize": "use",
        "implement": "build",
        "leverage": "use",
        "facilitate": "help with",
        "demonstrate": "show",
        "comprehensive": "full",
        "Additionally": "Also",
        "Furthermore": "And",
        "However": "But",
        "Therefore": "So",
        "Consequently": "So",
        "Nevertheless": "Still",
        "In conclusion": "So yeah",
        "To summarize": "So basically",
        "It is worth noting": "The thing is",
        "Certainly": "Yeah",
        "Absolutely": "Yeah definitely",
        "I'd be happy to": "So",
        "That's a great question": "Hmm",
        "In my experience": "From what I've seen",
    }

    # Hinglish-specific casualization — replace overly formal English with Hinglish equivalents
    FORMAL_TO_CASUAL_HINGLISH = {
        "I implemented": "Maine implement kiya",
        "I utilized": "Maine use kiya",
        "I developed": "Maine develop kiya",
        "I built": "Maine build kiya",
        "I designed": "Maine design kiya",
        "I created": "Maine create kiya",
        "we implemented": "humne implement kiya",
        "we utilized": "humne use kiya",
        "we developed": "humne develop kiya",
        "we built": "humne build kiya",
        "we designed": "humne design kiya",
        "we created": "humne create kiya",
        "which helped": "jisse help mili",
        "which improved": "jisse improve hua",
        "which reduced": "jisse reduce hua",
        "resulting in": "aur isse",
        "Additionally": "Aur phir",
        "Furthermore": "Aur",
        "However": "Lekin",
        "Therefore": "Toh isliye",
        "Consequently": "Toh",
        "In conclusion": "Toh basically",
        "To summarize": "Toh matlab",
        "Certainly": "Haan",
        "Absolutely": "Haan bilkul",
        "That's a great question": "Hmm acha",
        "In my experience": "Mera experience se",
        "I'd be happy to": "Toh",
        "It is worth noting": "Woh kya hai na",
    }

    # Sentences that SCREAM "AI-generated"
    AI_PATTERNS = [
        r"As an AI.*?[.]",
        r"I'm an AI.*?[.]",
        r"I am an AI.*?[.]",
        r"I'm a machine.*?[.]",
        r"I am a machine.*?[.]",
        r"As a machine.*?[.]",
        r"As a language model.*?[.]",
        r"I am a language model.*?[.]",
        r"I'm a language model.*?[.]",
        r"I'm designed to.*?generate.*?[.]",
        r"I am designed to.*?generate.*?[.]",
        r"I'm indeed a machine.*?[.]",
        r"I understand your concern.*?I'm.*?AI.*?[.]",
        r"I don't have personal.*?[.]",
        r"Based on my training.*?[.]",
        r"I hope this helps.*?[.]",
        r"Please let me know.*?[.]",
        r"Feel free to.*?[.]",
    ]

    def __init__(self):
        self._language = "en"

    def set_language(self, language: str):
        """Set the output language (en, hi, hinglish)."""
        self._language = language

    def humanize(self, text: str, mode: str = "answer") -> str:
        """
        Make AI text sound human.
        
        Args:
            text: The AI-generated text.
            mode: "filler" (light touch) or "answer" (full humanization).
            
        Returns:
            Humanized text with pause markers and natural speech patterns.
        """
        if not text:
            return text

        # Step 1: Remove obvious AI patterns
        text = self._remove_ai_patterns(text)

        # Step 1b: Strip annoying meta openers ("To expand on that", "I explained", etc.)
        text = self._strip_meta_openers(text)

        # Step 2: Add natural pauses (DISABLED per user request for directness)
        # if mode == "answer":
        #     text = self._add_pauses(text)

        # Step 4: Add filler words (DISABLED per user request for directness)
        # if mode == "answer":
        #     text = self._add_fillers(text, max_fillers=3)
        # else:
        #     text = self._add_fillers(text, max_fillers=1)

        # Step 5: Ensure contractions (English only — Hinglish doesn't use them the same way)
        if self._language not in ("hi", "hinglish"):
            text = self._ensure_contractions(text)

        # Step 7: Clean up
        text = self._clean_up(text)
        text = self._strip_meta_openers(text)

        return text

    def _strip_meta_openers(self, text: str) -> str:
        """Strip annoying meta-phrases like 'To expand on that', 'I explained', etc."""
        if not text:
            return text
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

    def _remove_ai_patterns(self, text: str) -> str:
        """Remove sentences that sound obviously AI-generated."""
        # Failsafe: strip <think> tags
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.IGNORECASE | re.DOTALL)
        
        for pattern in self.AI_PATTERNS:
            text = re.sub(pattern, "", text, flags=re.IGNORECASE)
        return text.strip()

    def _casualize(self, text: str) -> str:
        """Replace formal words with casual equivalents (language-aware)."""
        if self._language in ("hi", "hinglish"):
            mappings = self.FORMAL_TO_CASUAL_HINGLISH
        else:
            mappings = self.FORMAL_TO_CASUAL_EN

        for formal, casual in mappings.items():
            text = text.replace(formal, casual)
        return text

    def _add_pauses(self, text: str) -> str:
        """Insert [pause] markers at natural breathing points."""
        sentences = text.split(". ")
        if len(sentences) < 3:
            return text

        # Add pause after every 2-3 sentences
        result = []
        for i, sentence in enumerate(sentences):
            result.append(sentence)
            # Add pause at natural break points (not at the end)
            if i > 0 and i < len(sentences) - 1 and i % 2 == 1:
                if random.random() > 0.4:  # 60% chance of pause
                    result.append("[pause]")

        return ". ".join(result)

    def _add_fillers(self, text: str, max_fillers: int = 3) -> str:
        """Insert natural filler words at sentence boundaries (language-aware)."""
        fillers = self.FILLERS_HINGLISH if self._language in ("hi", "hinglish") else self.FILLERS_EN

        sentences = text.split(". ")
        if len(sentences) < 2:
            return text

        filler_count = 0
        result = []

        for i, sentence in enumerate(sentences):
            # Skip first sentence and don't over-fill
            if i > 0 and filler_count < max_fillers and random.random() > 0.6:
                filler = random.choice(fillers)
                # Only add if sentence doesn't already start with a filler-like word
                if not sentence.lower().startswith(("so ", "yeah ", "like ", "and ", "toh ", "matlab ", "haan ", "aur ")):
                    sentence = f"{filler}, {sentence.lstrip()}"
                    filler_count += 1

            result.append(sentence)

        return ". ".join(result)

    def _add_thinking_sounds(self, text: str) -> str:
        """Add [hmm] before complex or technical explanations."""
        # Add [hmm] before technical terms or complex explanations
        tech_triggers = [
            "architecture", "algorithm", "pipeline", "infrastructure",
            "microservice", "deployment", "scalab", "optimiz",
            "database", "API", "backend", "frontend", "system design",
        ]

        for trigger in tech_triggers:
            if trigger.lower() in text.lower():
                # Add [hmm] before the first occurrence of a technical explanation
                idx = text.lower().find(trigger.lower())
                # Find the start of the sentence containing this word
                sentence_start = text.rfind(". ", 0, idx)
                if sentence_start > 0:
                    # Insert [hmm] at the start of this sentence
                    text = text[:sentence_start + 2] + "[hmm] " + text[sentence_start + 2:]
                    break  # Only add one [hmm]

        return text

    def _ensure_contractions(self, text: str) -> str:
        """Convert formal forms to contractions."""
        # Split by code blocks to avoid replacing inside them
        parts = re.split(r'(```.*?```|`[^`]+`)', text, flags=re.DOTALL)
        
        contractions = {
            "do not": "don't",
            "does not": "doesn't",
            "did not": "didn't",
            "was not": "wasn't",
            "were not": "weren't",
            "is not": "isn't",
            "are not": "aren't",
            "have not": "haven't",
            "has not": "hasn't",
            "had not": "hadn't",
            "will not": "won't",
            "would not": "wouldn't",
            "could not": "couldn't",
            "should not": "shouldn't",
            "can not": "can't",
            "cannot": "can't",
            "I am": "I'm",
            "I have": "I've",
            "I will": "I'll",
            "I would": "I'd",
            "it is": "it's",
            "it has": "it's",
            "that is": "that's",
            "there is": "there's",
            "we are": "we're",
            "we have": "we've",
            "they are": "they're",
            "you are": "you're",
            "let us": "let's",
        }

        for i in range(0, len(parts), 2):
            part = parts[i]
            for formal, contraction in contractions.items():
                part = part.replace(formal, contraction)
                part = part.replace(formal.capitalize(), contraction.capitalize())
            parts[i] = part

        return "".join(parts)

    def _clean_up(self, text: str) -> str:
        """Final cleanup pass."""
        # Remove double periods
        text = text.replace("..", ".")
        # Remove empty pause markers
        text = text.replace("[pause] [pause]", "[pause]")
        # Ensure no trailing whitespace
        text = text.strip()

        return text
