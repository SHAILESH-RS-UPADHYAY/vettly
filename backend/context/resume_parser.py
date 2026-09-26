"""
Resume Parser — Extracts structured data from PDF and DOCX resumes.

V2: Improved section detection for LaTeX-generated PDFs, added fallback
    raw_text extraction, and key facts extraction.
"""

import re
import logging
from pathlib import Path

logger = logging.getLogger("vettly.context.resume")


class ResumeParser:
    """
    Parses PDF and DOCX resume files into structured data
    that can be used as context for AI answer generation.
    
    Extracts:
    - Full text content
    - Summary / objective
    - Skills
    - Experience entries
    - Projects
    - Education
    
    V2: Enhanced for LaTeX-generated PDFs where section headers may use
    non-standard formatting (ALL CAPS, colons, special chars).
    """

    # Common resume section headers — expanded for LaTeX format variations
    SECTION_HEADERS = {
        "summary": [
            "summary", "objective", "about", "profile", "about me",
            "professional summary", "career objective", "personal profile",
        ],
        "experience": [
            "experience", "work experience", "employment", "work history",
            "professional experience", "relevant experience", "internship",
            "internships", "work", "positions held",
        ],
        "skills": [
            "skills", "technical skills", "technologies", "tech stack",
            "competencies", "tools", "core competencies", "areas of expertise",
            "programming languages", "frameworks", "tools & technologies",
            "tools and technologies", "technical proficiency",
        ],
        "projects": [
            "projects", "personal projects", "key projects", "notable projects",
            "portfolio", "selected projects", "academic projects",
            "side projects", "open source",
        ],
        "education": [
            "education", "academic", "qualifications", "certifications",
            "educational background", "academic background", "degrees",
            "certification", "courses", "coursework",
        ],
        "achievements": [
            "achievements", "awards", "honors", "accomplishments",
            "recognition", "publications", "extracurricular",
            "activities", "volunteer", "leadership",
        ],
    }

    def parse(self, file_path: Path) -> dict:
        """
        Parse a resume file and return structured data.
        
        Args:
            file_path: Path to the PDF or DOCX file.
            
        Returns:
            Dict with sections: summary, skills, experience, projects, education, raw_text
        """
        file_path = Path(file_path)
        extension = file_path.suffix.lower()

        if extension == ".pdf":
            raw_text = self._parse_pdf(file_path)
        elif extension in (".docx", ".doc"):
            raw_text = self._parse_docx(file_path)
        elif extension == ".txt":
            raw_text = file_path.read_text(encoding="utf-8")
        else:
            raise ValueError(f"Unsupported file format: {extension}. Use PDF, DOCX, or TXT.")

        if not raw_text.strip():
            raise ValueError("Could not extract any text from the resume file.")

        # Structure the parsed content
        sections = self._extract_sections(raw_text)
        sections["raw_text"] = raw_text

        # Log what we found
        found_sections = [k for k, v in sections.items() if v and k != "raw_text"]
        logger.info(f"Resume parsed: {len(raw_text)} chars, sections found: {found_sections}")
        
        # If we didn't find good structure, log a warning
        critical_sections = ["experience", "skills", "projects"]
        found_critical = [s for s in critical_sections if sections.get(s)]
        if not found_critical:
            logger.warning(
                "⚠️ No structured sections detected (experience/skills/projects). "
                "The raw_text will be used as fallback in context engine. "
                "This usually happens with LaTeX-generated PDFs with non-standard headers."
            )

        return sections

    def _parse_pdf(self, file_path: Path) -> str:
        """Extract text from a PDF file."""
        try:
            from PyPDF2 import PdfReader

            reader = PdfReader(str(file_path))
            text_parts = []

            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    # Clean up LaTeX artifacts
                    page_text = self._clean_latex_artifacts(page_text)
                    text_parts.append(page_text)

            return "\n".join(text_parts)
        except ImportError:
            logger.error("PyPDF2 not installed. Run: pip install PyPDF2")
            raise
        except Exception as e:
            logger.error(f"PDF parsing error: {e}")
            raise ValueError(f"Failed to parse PDF: {e}")

    def _parse_docx(self, file_path: Path) -> str:
        """Extract text from a DOCX file."""
        try:
            from docx import Document

            doc = Document(str(file_path))
            text_parts = []

            for paragraph in doc.paragraphs:
                if paragraph.text.strip():
                    text_parts.append(paragraph.text)

            # Also extract from tables (common in resumes)
            for table in doc.tables:
                for row in table.rows:
                    row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                    if row_text:
                        text_parts.append(row_text)

            return "\n".join(text_parts)
        except ImportError:
            logger.error("python-docx not installed. Run: pip install python-docx")
            raise
        except Exception as e:
            logger.error(f"DOCX parsing error: {e}")
            raise ValueError(f"Failed to parse DOCX: {e}")

    def _clean_latex_artifacts(self, text: str) -> str:
        """Clean up common LaTeX PDF extraction artifacts."""
        # Remove bullet point characters that come through oddly
        text = re.sub(r"[•◦▪▸►]", "-", text)
        # Remove excessive whitespace (common in LaTeX PDFs)
        text = re.sub(r" {3,}", "  ", text)
        # Fix line breaks that split words
        text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
        return text

    def _extract_sections(self, text: str) -> dict:
        """
        Extract structured sections from resume text.
        Uses heuristic matching of common section headers.
        Enhanced for LaTeX PDFs where headers may be ALL CAPS, 
        followed by horizontal rules, or use special formatting.
        """
        sections = {}
        lines = text.split("\n")

        current_section = "summary"
        current_content = []

        for i, line in enumerate(lines):
            stripped = line.strip()
            if not stripped:
                continue

            # Check if this line is a section header
            detected_section = self._detect_section(stripped)
            if detected_section:
                # Save previous section
                if current_content:
                    content = "\n".join(current_content).strip()
                    if content:
                        # If section already exists, append
                        if detected_section in sections and sections[current_section]:
                            sections[current_section] += "\n" + content
                        else:
                            sections[current_section] = content
                current_section = detected_section
                current_content = []
            else:
                current_content.append(stripped)

        # Save the last section
        if current_content:
            content = "\n".join(current_content).strip()
            if content:
                sections[current_section] = content

        # Extract skills as a list if possible
        if "skills" in sections and isinstance(sections["skills"], str):
            sections["skills"] = self._parse_skills(sections["skills"])

        return sections

    def _detect_section(self, line: str) -> str:
        """
        Detect if a line is a section header.
        Enhanced for LaTeX PDFs:
        - Handles ALL CAPS headers
        - Handles headers followed by ":" or "—"
        - Handles headers with special formatting chars
        - Short lines (< 4 words) that match known headers
        """
        clean = line.lower().strip().rstrip(":").rstrip("—").rstrip("-")

        # Remove common formatting artifacts (LaTeX horizontal rules, bullets, etc.)
        clean = re.sub(r"[─═▪•►■□●○━─\-_=]{2,}", "", clean).strip()
        
        # Skip empty or very long lines (headers are usually short)
        if not clean or len(clean.split()) > 5:
            return ""

        for section_name, headers in self.SECTION_HEADERS.items():
            for header in headers:
                # Exact match
                if clean == header:
                    return section_name
                # Starts with (e.g., "Experience:" or "Skills & Technologies")
                if clean.startswith(header):
                    return section_name
                # ALL CAPS match (common in LaTeX)
                if clean.upper() == header.upper() and line.isupper():
                    return section_name

        return ""

    def _parse_skills(self, skills_text: str) -> list[str]:
        """Parse skills section into a list."""
        # Split by common delimiters
        skills = re.split(r"[,;•·|]|\n", skills_text)
        # Clean and filter
        skills = [s.strip().strip("-").strip("•").strip() for s in skills]
        skills = [s for s in skills if s and len(s) > 1]

        return skills

    def get_key_facts(self, parsed_resume: dict) -> dict:
        """
        Extract key facts from a parsed resume for quick reference.
        
        Returns:
            Dict with: name, top_skills, project_names, companies, education_summary
        """
        facts = {}

        # Try to extract name from summary or raw_text (usually first line)
        raw = parsed_resume.get("raw_text", "")
        if raw:
            first_line = raw.strip().split("\n")[0].strip()
            # Heuristic: if first line is short and doesn't look like a section header
            if len(first_line.split()) <= 5 and not self._detect_section(first_line):
                facts["name"] = first_line

        # Extract top skills
        skills = parsed_resume.get("skills", [])
        if isinstance(skills, list):
            facts["top_skills"] = skills[:15]  # Top 15 skills
        elif isinstance(skills, str):
            facts["top_skills"] = [s.strip() for s in skills.split(",")][:15]

        # Extract project names (heuristic: lines that start with project-like names)
        projects = parsed_resume.get("projects", "")
        if projects:
            project_names = []
            for line in projects.split("\n"):
                line = line.strip()
                # Project names are usually short and may be bold/formatted
                if line and len(line.split()) <= 6 and not line.startswith("-"):
                    project_names.append(line)
            facts["project_names"] = project_names[:10]

        # Extract education summary
        education = parsed_resume.get("education", "")
        if education:
            facts["education_summary"] = education[:200]

        return facts
