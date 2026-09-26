"""
Deepgram Real-Time Speech-to-Text Client
Uses Deepgram Nova-2 for ultra-low latency streaming transcription.
"""

import asyncio
import json
import logging
from typing import Callable, Optional

import websockets

import config

logger = logging.getLogger("vettly.stt")

# Deepgram WebSocket streaming URL
DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen"


class DeepgramSTTClient:
    """
    Real-time speech-to-text using Deepgram's WebSocket streaming API.
    
    Connects to Deepgram, streams audio chunks, and receives
    transcription results with speaker detection.
    """

    def __init__(self):
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._on_transcript: Optional[Callable] = None
        self._receive_task: Optional[asyncio.Task] = None
        self._keepalive_task: Optional[asyncio.Task] = None
        self._running = False

    async def start(self, on_transcript: Callable):
        """
        Start the Deepgram streaming connection.
        
        Args:
            on_transcript: Async callback function(transcript: str, is_final: bool, speaker: str, detected_language: str)
        """
        self._on_transcript = on_transcript
        self._running = True

        # Build query parameters for optimal real-time performance
        params = {
            "model": "nova-3",                 # Nova-3 has FAR better multilingual/Hinglish support
            "smart_format": "true",
            "interim_results": "true",       # Get partial results as they come
            "utterance_end_ms": "2500",       # Detect end of utterance after 2.5s silence
            "vad_events": "true",             # Voice Activity Detection events
            "encoding": "linear16",
            "sample_rate": str(config.SAMPLE_RATE),
            "channels": str(config.CHANNELS),
            "endpointing": "300",             # Faster endpointing for responsiveness (300ms)
            "punctuate": "true",
            "language": "multi",               # Auto-detect language — outputs Roman script for Hinglish
        }

        query_string = "&".join(f"{k}={v}" for k, v in params.items())
        url = f"{DEEPGRAM_WS_URL}?{query_string}"

        headers = {
            "Authorization": f"Token {config.DEEPGRAM_API_KEY}",
        }

        try:
            self._ws = await websockets.connect(
                url,
                additional_headers=headers,
                ping_interval=20,
                ping_timeout=10,
            )
            logger.info("🎙️ Deepgram STT connected")

            # Start receiving transcripts in background
            self._receive_task = asyncio.create_task(self._receive_loop())
            # Start keepalive to prevent disconnection
            self._keepalive_task = asyncio.create_task(self._keepalive_loop())

        except Exception as e:
            logger.error(f"Failed to connect to Deepgram: {e}")
            self._running = False
            raise

    async def send_audio(self, audio_bytes: bytes):
        """Send an audio chunk to Deepgram for transcription."""
        if self._ws and self._running:
            try:
                await self._ws.send(audio_bytes)
            except Exception as e:
                logger.error(f"Failed to send audio: {e}")

    async def stop(self):
        """Stop the Deepgram connection gracefully."""
        self._running = False

        if self._ws:
            try:
                # Send close signal to Deepgram
                await self._ws.send(json.dumps({"type": "CloseStream"}))
                await self._ws.close()
            except Exception:
                pass
            self._ws = None

        # Cancel background tasks
        for task in [self._receive_task, self._keepalive_task]:
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        logger.info("🎙️ Deepgram STT disconnected")

    async def _receive_loop(self):
        """Background loop to receive and process Deepgram responses."""
        try:
            while self._running and self._ws:
                try:
                    message = await asyncio.wait_for(self._ws.recv(), timeout=30)
                    data = json.loads(message)
                    await self._process_response(data)
                except asyncio.TimeoutError:
                    continue
                except websockets.ConnectionClosed:
                    logger.warning("Deepgram connection closed")
                    break
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"STT receive error: {e}")

    async def _process_response(self, data: dict):
        """Process a single Deepgram response message."""
        msg_type = data.get("type", "")

        if msg_type == "Results":
            # Extract transcript from the response
            channel = data.get("channel", {})
            alternatives = channel.get("alternatives", [])

            if not alternatives:
                return

            transcript = alternatives[0].get("transcript", "").strip()
            confidence = alternatives[0].get("confidence", 0)
            is_final = data.get("is_final", False)

            if not transcript:
                return

            # Detect language (Hindi/English/Hinglish)
            detected_lang = ""
            if "detected_language" in channel:
                detected_lang = channel["detected_language"]
            # Also check alternatives-level language detection
            if not detected_lang and "languages" in alternatives[0]:
                langs = alternatives[0]["languages"]
                if langs:
                    detected_lang = langs[0] if isinstance(langs[0], str) else ""
            # Check metadata-level detection
            if not detected_lang:
                metadata = data.get("metadata", {})
                if "detected_language" in metadata:
                    detected_lang = metadata["detected_language"]

            # Determine speaker — for now, treat all incoming audio as interviewer
            speaker = data.get("_speaker", "interviewer")

            # Only pass through transcripts with reasonable confidence
            if confidence > 0.4 and self._on_transcript:
                await self._on_transcript(transcript, is_final, speaker, detected_lang)

                if is_final:
                    lang_tag = f" [{detected_lang}]" if detected_lang else ""
                    logger.info(
                        f"📝 [{speaker}]{lang_tag}: {transcript[:80]}"
                        f"{'...' if len(transcript) > 80 else ''}"
                    )

        elif msg_type == "UtteranceEnd":
            # Silence detected — interviewer finished speaking
            logger.debug("🔇 Utterance ended (silence detected)")

        elif msg_type == "SpeechStarted":
            logger.debug("🔊 Speech started")

        elif msg_type == "Error":
            error_msg = data.get("message", "Unknown error")
            logger.error(f"Deepgram error: {error_msg}")

    async def _keepalive_loop(self):
        """Send periodic keepalive messages to prevent timeout."""
        try:
            while self._running and self._ws:
                await asyncio.sleep(10)
                if self._ws:
                    try:
                        await self._ws.send(json.dumps({"type": "KeepAlive"}))
                    except Exception:
                        break
        except asyncio.CancelledError:
            pass
