"""
Vision Analyzer — Screenshot Analysis for Coding Rounds
Uses Google Gemini (primary) for screenshot analysis during interviews.
Falls back to Groq vision models if Gemini is unavailable.
"""

import base64
import logging
import asyncio

import config
from ai.prompts import VISION_ANALYSIS_PROMPT, CODING_VISION_PROMPT

logger = logging.getLogger("vettly.ai.vision")


class VisionAnalyzer:
    """
    Analyzes screenshots from coding interviews and assessments.
    
    Primary: Google Gemini Flash (fast, free, excellent vision)
    Fallback: Groq vision models
    """

    def __init__(self):
        self._gemini_models = []
        
        # Try to initialize Gemini models based on priority
        if config.GEMINI_API_KEY:
            try:
                import google.generativeai as genai
                genai.configure(api_key=config.GEMINI_API_KEY)
                
                # Priority list of best models available to paid AI Studio users
                model_names = [
                    "gemini-3.5-flash",
                    "gemini-3.1-pro-preview",
                    "gemini-3.1-flash-lite"
                ]
                
                for name in model_names:
                    self._gemini_models.append(genai.GenerativeModel(name))
                    
                logger.info(f"📸 Vision: Gemini Initialized with fallback chain: {model_names}")
            except Exception as e:
                logger.warning(f"Gemini init failed: {e}")

    async def analyze_screenshot(self, image_base64: str) -> str:
        """
        Analyze a screenshot and extract useful information.
        
        Args:
            image_base64: Base64-encoded screenshot image (PNG/JPEG).
            
        Returns:
            Text analysis of the screenshot content.
        """
        # Clean base64 string (remove data:image/... prefix if present)
        clean_b64 = image_base64
        mime_type = "image/png"
        if "," in image_base64:
            header, clean_b64 = image_base64.split(",", 1)
            if "jpeg" in header or "jpg" in header:
                mime_type = "image/jpeg"

        # ═══ PRIMARY: Gemini Cascade ═══
        if self._gemini_models:
            import google.generativeai as genai
            
            try:
                image_bytes = base64.b64decode(clean_b64)
            except Exception as e:
                logger.error(f"Base64 decode failed: {e}")
                return "Error: Invalid image format received from frontend."
                
            image_part = {
                "mime_type": mime_type,
                "data": image_bytes,
            }

            for model in self._gemini_models:
                try:
                    # Add timeout so the fallback cascade doesn't get stuck if a model hangs
                    coro = model.generate_content_async(
                        [VISION_ANALYSIS_PROMPT, image_part],
                        generation_config=genai.GenerationConfig(
                            temperature=0.3,
                            max_output_tokens=2500,
                        ),
                    )
                    response = await asyncio.wait_for(coro, timeout=25.0)

                    analysis = response.text.strip()
                    logger.info(f"📸 Gemini vision analysis complete using {model.model_name} ({len(analysis)} chars)")
                    return analysis

                except Exception as e:
                    logger.warning(f"Vision failed with model {model.model_name}: {e}. Trying next model...")
                    continue

        logger.error("All vision models failed")
        return "Screenshot captured but analysis unavailable. Please describe what you see on screen."

    async def analyze_coding_problem(self, image_base64: str, context: str = "") -> str:
        """
        Specifically analyze a coding problem screenshot.
        """
        clean_b64 = image_base64
        mime_type = "image/png"
        if "," in image_base64:
            header, clean_b64 = image_base64.split(",", 1)
            if "jpeg" in header or "jpg" in header:
                mime_type = "image/jpeg"

        prompt = CODING_VISION_PROMPT
        if context:
            prompt += f"\n\nCandidate's tech stack context:\n{context[:1000]}"

        if self._gemini_models:
            import google.generativeai as genai
            
            try:
                image_bytes = base64.b64decode(clean_b64)
            except Exception as e:
                logger.error(f"Base64 decode failed in coding vision: {e}")
                return "Error: Invalid image format received."
                
            image_part = {"mime_type": mime_type, "data": image_bytes}

            for model in self._gemini_models:
                try:
                    coro = model.generate_content_async(
                        [prompt, image_part],
                        generation_config=genai.GenerationConfig(
                            temperature=0.4,
                            max_output_tokens=1500,
                        ),
                    )
                    response = await asyncio.wait_for(coro, timeout=15.0)
                    logger.info(f"📸 Coding vision analysis complete using {model.model_name}")
                    return response.text.strip()

                except Exception as e:
                    logger.warning(f"Coding vision failed with model {model.model_name}: {e}")
                    continue

        return "Could not analyze the coding problem. Please type the problem statement manually."
