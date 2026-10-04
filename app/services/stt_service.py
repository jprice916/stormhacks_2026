import os
from google import genai
from google.genai import types


class STTService:
    @staticmethod
    def transcribe_audio_file(audio_file_stream) -> str:
        """Fallback transcription: transcribes raw audio to plain text."""
        if os.getenv("USE_MOCK_STT", "true").lower() == "true":
            return "Built the full binary search algorithm and got it working."

        api_key = os.getenv("JAYS_GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY")
        client = genai.Client(api_key=api_key)
        audio_bytes = audio_file_stream.read()

        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=[
                types.Part.from_bytes(data=audio_bytes, mime_type="audio/webm"),
                "Transcribe the spoken words accurately and verbatim. Return only the transcription text without commentary or formatting.",
            ],
        )
        return response.text.strip()