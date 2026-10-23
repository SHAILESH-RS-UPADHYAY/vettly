"""
Context Engine — Resume, GitHub, and Custom Context Manager
Stores and retrieves candidate context for AI answer generation.

V2: Added Rolling Summarizer for long-interview memory preservation.
"""

import json
import logging
from pathlib import Path
from typing import Optional

from groq import AsyncGroq

import config
from ai.prompts import CONTEXT_TEMPLATE

logger = logging.getLogger("vettly.ai.context")


# ─── Rolling Summary Prompt ─────────────────────────────────
ROLLING_SUMMARY_PROMPT = """You are a conversation memory manager. Summarize the following interview conversation turns into a dense, fact-preserving summary that an AI can use to maintain context.

RULES:
1. Preserve ALL specific details: project names, technologies, numbers, decisions mentioned.
2. Keep the summary in third person ("The candidate discussed...", "The interviewer asked about...").
3. Group related topics together.
4. Maximum 300 words — be concise but complete.
5. If there is an existing summary, MERGE the new turns into it without losing old information.

OUTPUT: Return ONLY the merged summary text, no explanations."""

# Optimized character budgets to keep total prompt processing under 500ms on Groq
RESUME_BUDGET = 20000       # Complete resume + skills + experience
CUSTOM_BUDGET = 35000       # Key prep data, company specifics, FAR Labs & stories
GITHUB_BUDGET = 12000       # Top 10 GitHub repos with concise overviews

class ContextEngine:
    """
    Manages all candidate context:
    - Parsed resume (skills, experience, projects)
    - GitHub profile and repo details
    - Custom context (additional stories, skills, prep notes)
    - Structured context (categorized projects, experience, skills, Q&A bank, stories)
    
    Persists context to disk so it survives server restarts.
    """

    def __init__(self):
        self._resume: dict = {}
        self._github: dict = {}
        self._custom: list[dict] = []
        self._structured: dict = {}  # Categorized context (projects, experience, skills, qa_bank, stories)
        self._assignment: dict = {}  # Company assignment/assessment (HIGHEST PRIORITY)
        self._rolling_summary: str = ""  # Persistent memory of summarized old conversation turns
        self._context_file = config.CONTEXT_STORE_DIR / "context.json"
        self._groq_client = AsyncGroq(api_key=config.GROQ_API_KEY or "unconfigured")
        self.load_context()

    def set_resume(self, parsed_resume: dict) -> None:
        """Set the parsed resume data."""
        self._resume = parsed_resume
        self._save()
        logger.info(f"Resume context updated — {len(str(parsed_resume))} chars, sections: {list(parsed_resume.keys())}")

    def set_github(self, github_data: dict) -> None:
        """Set GitHub profile and repos data."""
        self._github = github_data
        self._save()
        logger.info("GitHub context updated")

    def add_custom_context(self, title: str, content: str) -> None:
        """Add a custom context entry (story, skill detail, etc.)."""
        # Remove existing entry with same title
        self._custom = [c for c in self._custom if c["title"] != title]
        self._custom.append({"title": title, "content": content})
        self._save()
        logger.info(f"Custom context added: {title}")

    def set_structured_context(self, data: dict) -> None:
        """
        Set structured context from the multi-tab dashboard.
        
        Expected keys: projects, experience, skills, qa_bank, stories
        """
        self._structured = data
        self._save()
        logger.info(f"Structured context updated — categories: {list(data.keys())}")

    def get_structured_context(self) -> dict:
        """Get the structured context data."""
        return self._structured

    def set_assignment(self, data: dict) -> None:
        """
        Set the company assignment/assessment context.
        This gets HIGHEST PRIORITY in context injection.
        
        Expected keys: company, title, details, key_points
        """
        self._assignment = data
        self._save()
        logger.info(f"Assignment context updated — company: {data.get('company', 'N/A')}, title: {data.get('title', 'N/A')}")

    def get_assignment(self) -> dict:
        """Get the saved assignment data."""
        return self._assignment

    def get_full_context(self, context_mode: str = "all") -> str:
        """
        Get the complete context string for AI prompts.
        
        PRIORITY ORDER (most important first):
        1. Resume — candidate's actual experience (highest priority)
        2. Custom/Structured context — user-provided prep data
        3. GitHub — supplementary project details
        4. Rolling Summary — persistent memory from earlier in the interview
        
        Each section is smart-truncated to fit within its budget.
        """
        resume_text = self._format_resume()
        github_text = self._format_github()
        custom_text = self._format_custom()
        structured_text = self._format_structured(context_mode)
        assignment_text = self._format_assignment()

        if context_mode == "projects":
            resume_text = ""
        elif context_mode == "experience":
            github_text = ""
            custom_text = ""
        elif context_mode == "dsa":
            resume_text = ""
            github_text = ""
            # structured_text is preserved because _format_structured(context_mode) filters it to DSA skills & QA bank

        # Combine assignment (highest priority) + custom + structured
        all_custom = ""
        if assignment_text:
            all_custom = assignment_text
        if custom_text:
            all_custom = (all_custom + "\n\n" + custom_text) if all_custom else custom_text
        if structured_text:
            if all_custom:
                all_custom += "\n\n" + structured_text
            else:
                all_custom = structured_text

        # Inject rolling summary into custom context
        if self._rolling_summary:
            memory_block = f"\n\n=== INTERVIEW MEMORY (Earlier conversation summary) ===\n{self._rolling_summary}"
            if all_custom:
                all_custom += memory_block
            else:
                all_custom = memory_block.strip()

        # Smart truncation per section
        resume_truncated = resume_text[:RESUME_BUDGET] if resume_text else ""
        custom_truncated = all_custom[:CUSTOM_BUDGET + 500] if all_custom else ""  # Extra budget for memory
        github_truncated = github_text[:GITHUB_BUDGET] if github_text else ""

        # Log what's being fed to AI (for debugging)
        logger.debug(
            f"Context budget [mode={context_mode}]: "
            f"resume={len(resume_truncated)}/{RESUME_BUDGET}, "
            f"custom={len(custom_truncated)}/{CUSTOM_BUDGET}, "
            f"github={len(github_truncated)}/{GITHUB_BUDGET}, "
            f"rolling_summary={len(self._rolling_summary)} chars"
        )

        if resume_truncated:
            logger.debug(f"Resume preview: {resume_truncated[:200]}...")

        # Build interviewer profile text
        interviewer_text = ""
        if self._structured and "interviewer_profile" in self._structured:
            ip = self._structured["interviewer_profile"]
            interviewer_text = f"Name: {ip.get('name', 'Unknown')}\n"
            interviewer_text += f"Role: {ip.get('role', 'Unknown')}\n"
            interviewer_text += f"Philosophy: \"{ip.get('philosophy', '')}\"\n"
            if ip.get("certifications"):
                interviewer_text += f"Certifications: {', '.join(ip['certifications'])}\n"
            if ip.get("key_insights"):
                interviewer_text += "Key Insights:\n" + "\n".join(f"- {i}" for i in ip["key_insights"]) + "\n"
            if ip.get("response_strategy"):
                interviewer_text += "Response Strategy:\n"
                for k, v in ip["response_strategy"].items():
                    interviewer_text += f"- {k}: {v}\n"

        return CONTEXT_TEMPLATE.format(
            interviewer=interviewer_text or "(No interviewer profile loaded)",
            resume=resume_truncated or "(No resume uploaded)",
            github=github_truncated or "(No GitHub profile imported)",
            custom=custom_truncated or "(No additional context)",
        )

    def get_resume_text(self) -> str:
        """Get the full raw resume text (for debugging)."""
        return self._resume.get("raw_text", "")

    def get_resume_summary(self) -> Optional[str]:
        """Get a brief summary of the loaded resume."""
        if not self._resume:
            return None
        return self._resume.get("summary", "Resume loaded")

    def get_github_summary(self) -> Optional[str]:
        """Get a brief summary of imported GitHub data."""
        if not self._github:
            return None
        repos = self._github.get("repos", [])
        return f"{len(repos)} repos imported from @{self._github.get('username', 'unknown')}"

    def get_custom_contexts(self) -> list[dict]:
        """Get all custom context entries."""
        return [{"title": c["title"], "preview": c["content"][:100]} for c in self._custom]

    def get_resume_extract(self) -> dict:
        """
        Get parsed resume data in structured format for auto-fill.
        Returns dict with: name, skills, projects, experience, education, summary
        """
        if not self._resume:
            return {}

        return {
            "summary": self._resume.get("summary", ""),
            "skills": self._resume.get("skills", []),
            "experience": self._resume.get("experience", ""),
            "projects": self._resume.get("projects", ""),
            "education": self._resume.get("education", ""),
            "achievements": self._resume.get("achievements", ""),
            "raw_text": self._resume.get("raw_text", "")[:500],  # Preview only
        }

    def has_context(self) -> bool:
        """Check if any context is loaded."""
        return bool(self._resume or self._github or self._custom or self._structured or self._assignment)

    def has_resume(self) -> bool:
        return bool(self._resume)

    def has_github(self) -> bool:
        return bool(self._github)

    def clear(self) -> None:
        """Clear all context."""
        self._resume = {}
        self._github = {}
        self._custom = []
        self._structured = {}
        self._assignment = {}
        self._rolling_summary = ""
        self._save()
        logger.info("All context cleared")

    def load_context(self) -> None:
        """Load persisted context from disk."""
        if self._context_file.exists():
            try:
                with open(self._context_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self._resume = data.get("resume", {})
                    self._github = data.get("github", {})
                    self._custom = data.get("custom", [])
                    self._structured = data.get("structured", {})
                    self._assignment = data.get("assignment", {})
                    self._rolling_summary = data.get("rolling_summary", "")
                logger.info("Context loaded from disk")
            except Exception as e:
                logger.warning(f"Failed to load context: {e}")

    def _save(self) -> None:
        """Persist context to disk."""
        try:
            data = {
                "resume": self._resume,
                "github": self._github,
                "custom": self._custom,
                "structured": self._structured,
                "assignment": self._assignment,
                "rolling_summary": self._rolling_summary,
            }
            with open(self._context_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Failed to save context: {e}")

    def _format_resume(self) -> str:
        """Format resume dict into a readable string for prompts."""
        if not self._resume:
            return ""

        sections = []

        # Put raw_text first if structured sections are sparse
        structured_keys = [k for k in self._resume.keys() if k != "raw_text"]
        has_good_structure = any(
            self._resume.get(k) for k in ["experience", "skills", "projects"]
        )

        if has_good_structure:
            # Use structured format
            # Priority order: summary → experience → projects → skills → education → achievements
            priority_order = ["summary", "experience", "projects", "skills", "education", "achievements"]
            for key in priority_order:
                value = self._resume.get(key)
                if not value:
                    continue
                if isinstance(value, list):
                    items = "\n".join(f"  - {item}" for item in value)
                    sections.append(f"{key.upper()}:\n{items}")
                elif isinstance(value, str):
                    sections.append(f"{key.upper()}: {value}")
                elif isinstance(value, dict):
                    items = "\n".join(f"  - {k}: {v}" for k, v in value.items())
                    sections.append(f"{key.upper()}:\n{items}")

            # Add remaining keys
            for key, value in self._resume.items():
                if key in priority_order or key == "raw_text":
                    continue
                if isinstance(value, list):
                    items = "\n".join(f"  - {item}" for item in value)
                    sections.append(f"{key.upper()}:\n{items}")
                elif isinstance(value, str) and value.strip():
                    sections.append(f"{key.upper()}: {value}")
        else:
            # Fallback: use raw text directly (for LaTeX/complex PDFs)
            raw = self._resume.get("raw_text", "")
            if raw:
                sections.append(f"FULL RESUME TEXT:\n{raw}")
            else:
                # Last resort: dump everything
                for key, value in self._resume.items():
                    if isinstance(value, list):
                        items = "\n".join(f"  - {item}" for item in value)
                        sections.append(f"{key.upper()}:\n{items}")
                    elif isinstance(value, str) and value.strip():
                        sections.append(f"{key.upper()}: {value}")

        return "\n\n".join(sections)

    def _format_github(self) -> str:
        """Format GitHub data into a readable string for prompts."""
        if not self._github:
            return ""

        parts = [f"GitHub Profile: @{self._github.get('username', 'unknown')}"]

        if "bio" in self._github:
            parts.append(f"Bio: {self._github['bio']}")

        repos = self._github.get("repos", [])
        for repo in repos[:10]:  # Limit to top 10 repos
            name = repo.get("name", "unknown")
            desc = repo.get("description", "No description")
            lang = repo.get("language", "")
            stars = repo.get("stars", 0)
            readme = repo.get("readme_summary", "")

            parts.append(f"\nRepo: {name}")
            parts.append(f"  Description: {desc}")
            if lang:
                parts.append(f"  Language: {lang}")
            if stars:
                parts.append(f"  Stars: {stars}")
            if readme:
                parts.append(f"  Details: {readme[:600]}")

        return "\n".join(parts)

    def _format_custom(self) -> str:
        """Format custom contexts into a readable string."""
        if not self._custom:
            return ""

        parts = []
        for ctx in self._custom:
            parts.append(f"[{ctx['title']}]\n{ctx['content']}")

        return "\n\n".join(parts)

    def _format_assignment(self) -> str:
        """Format assignment/company context into a readable string."""
        if not self._assignment:
            return ""

        parts = ["=== TARGET COMPANY & ROLE (HIGHEST PRIORITY — tailor answers to this) ==="]
        a = self._assignment
        if a.get("company"):
            parts.append(f"Company: {a['company']}")
        if a.get("title") or a.get("role"):
            parts.append(f"Role: {a.get('title') or a.get('role')}")
        if a.get("location"):
            parts.append(f"Location: {a['location']}")
        if a.get("description"):
            parts.append(f"Job Description:\n{a['description']}")
        if a.get("requirements"):
            req = a["requirements"]
            if isinstance(req, list):
                parts.append("Requirements:\n" + "\n".join(f"- {r}" for r in req))
            else:
                parts.append(f"Requirements: {req}")
        if a.get("tech_stack"):
            ts = a["tech_stack"]
            if isinstance(ts, list):
                parts.append(f"Tech Stack: {', '.join(ts)}")
            else:
                parts.append(f"Tech Stack: {ts}")
        if a.get("notes"):
            parts.append(f"Notes: {a['notes']}")

        return "\n".join(parts)

    def _format_structured(self, context_mode: str = "all") -> str:
        """Format structured context into a readable string."""
        if not self._structured:
            return ""

        parts = []

        # Projects
        if context_mode in ("all", "projects"):
            projects = self._structured.get("projects", [])
            if projects:
                parts.append("=== PROJECTS ===")
                for p in projects:
                    parts.append(f"Project: {p.get('name', 'Untitled')}")
                    if p.get('role'):
                        parts.append(f"  Role: {p['role']}")
                    if p.get('tech_stack'):
                        parts.append(f"  Tech: {p['tech_stack']}")
                    if p.get('description'):
                        parts.append(f"  Description: {p['description']}")
                    if p.get('challenges'):
                        parts.append(f"  Challenges: {p['challenges']}")
                    if p.get('metrics'):
                        parts.append(f"  Metrics: {p['metrics']}")
                    parts.append("")

        # Experience
        if context_mode in ("all", "experience"):
            experience = self._structured.get("experience", [])
            if experience:
                parts.append("=== EXPERIENCE ===")
                for e in experience:
                    parts.append(f"Company: {e.get('company', '')} | Role: {e.get('role', '')}")
                    if e.get('duration'):
                        parts.append(f"  Duration: {e['duration']}")
                    if e.get('achievements'):
                        parts.append(f"  Key Achievements: {e['achievements']}")
                    parts.append("")

        # Skills
        if context_mode in ("all", "experience", "projects", "dsa"):
            skills = self._structured.get("skills", {})
            if skills:
                parts.append("=== SKILLS ===")
                for category, skill_list in skills.items():
                    parts.append(f"  {category}: {skill_list}")

        # Q&A Bank
        if context_mode in ("all", "projects", "experience", "dsa"):
            qa_bank = self._structured.get("qa_bank", [])
            if qa_bank:
                parts.append("\n=== PRE-PREPARED Q&A ===")
                for qa in qa_bank:
                    parts.append(f"Q: {qa.get('question', '')}")
                    parts.append(f"A: {qa.get('answer', '')}")
                    parts.append("")

        # Stories
        if context_mode in ("all", "experience", "projects"):
            stories = self._structured.get("stories", [])
            if stories:
                parts.append("=== BEHAVIORAL STORIES (STAR) ===")
                for s in stories:
                    parts.append(f"Story: {s.get('title', 'Untitled')}")
                    if s.get('situation'):
                        parts.append(f"  Situation: {s['situation']}")
                    if s.get('task'):
                        parts.append(f"  Task: {s['task']}")
                    if s.get('action'):
                        parts.append(f"  Action: {s['action']}")
                    if s.get('result'):
                        parts.append(f"  Result: {s['result']}")
                    parts.append("")

        return "\n".join(parts)

    # ─── Rolling Summarizer ─────────────────────────────────────

    async def summarize_dropped_turns(self, dropped_turns: list[dict]) -> None:
        """
        Summarize conversation turns that are being dropped from the sliding window.
        Merges them into the persistent rolling summary.
        
        Called from main.py whenever transcript_history exceeds 20 turns.
        
        Args:
            dropped_turns: List of {"speaker": "interviewer|candidate", "text": "..."}
        """
        if not dropped_turns:
            return

        # Format dropped turns into readable text
        turn_lines = []
        for turn in dropped_turns:
            speaker = "Interviewer" if turn.get("speaker") == "interviewer" else "Candidate"
            turn_lines.append(f"{speaker}: {turn.get('text', '')}")
        new_turns_text = "\n".join(turn_lines)

        # Build the summarization prompt
        user_prompt = ""
        if self._rolling_summary:
            user_prompt = f"EXISTING SUMMARY:\n{self._rolling_summary}\n\nNEW TURNS TO MERGE:\n{new_turns_text}\n\nMerge these new turns into the existing summary. Preserve all old details."
        else:
            user_prompt = f"CONVERSATION TURNS:\n{new_turns_text}\n\nSummarize these interview turns."

        try:
            response = await self._groq_client.chat.completions.create(
                model=config.GROQ_MODEL,
                messages=[
                    {"role": "system", "content": ROLLING_SUMMARY_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=400,
                temperature=0.3,  # Low temp for factual summarization
            )

            summary = response.choices[0].message.content.strip()
            if summary:
                self._rolling_summary = summary
                self._save()
                logger.info(f"🧠 Rolling summary updated ({len(summary)} chars, {len(dropped_turns)} turns absorbed)")
            else:
                logger.warning("Rolling summary generation returned empty")

        except Exception as e:
            logger.error(f"Rolling summary generation failed: {e}")
            # Fallback: just append raw text to avoid total loss
            fallback = "\n".join(f"- {t.get('speaker', '?')}: {t.get('text', '')[:100]}" for t in dropped_turns)
            if self._rolling_summary:
                self._rolling_summary += "\n" + fallback
            else:
                self._rolling_summary = fallback
            self._save()

    def get_rolling_summary(self) -> str:
        """Get the current rolling summary."""
        return self._rolling_summary

    def clear_rolling_summary(self) -> None:
        """Clear the rolling summary (e.g., when starting a new interview)."""
        self._rolling_summary = ""
        self._save()
        logger.info("Rolling summary cleared")
