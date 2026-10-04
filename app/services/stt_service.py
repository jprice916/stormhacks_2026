import os
from google import genai
from google.genai import types


class STTService:
    @staticmethod
    def transcribe_media_file(media_file_stream, *, mime_type: str = "audio/webm") -> str:
        """Transcribe confirmed media from memory without creating a local file."""
        if os.getenv("USE_MOCK_STT", "false").lower() == "true":
            return "Built the full binary search algorithm and got it working."

        api_key = os.getenv("JAYS_GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY")
        client = genai.Client(api_key=api_key)
        media_bytes = media_file_stream.read()
        if not media_bytes:
            raise ValueError("The confirmed recording was empty.")

        response = client.models.generate_content(
            model=os.getenv("GEMINI_STT_MODEL", "gemini-3.5-flash-lite"),
            contents=[
                types.Part.from_bytes(data=media_bytes, mime_type=mime_type),
                "Transcribe the spoken words accurately and verbatim. Return only the transcription text without commentary or formatting.",
            ],
        )
        return (response.text or "").strip()

    @staticmethod
    def transcribe_audio_file(audio_file_stream) -> str:
        """Backward-compatible alias for older callers."""
        return STTService.transcribe_media_file(audio_file_stream)
