import os

class STTService:
    @staticmethod
    def transcribe_audio_file(audio_file_stream) -> str:
        """
        Transcribes an uploaded audio/video blob.
        Swap out with ElevenLabs or Whisper when ready.
        """
        # If testing without burning credits, return a mock string
        if os.getenv("USE_MOCK_STT", "false").lower() == "true":
            return "I finally built the full binary search algorithm and got it working."

        # Real transcription implementation goes here
        # e.g., ElevenLabs Scribe or native Gemini file API
        return "Live transcribed transcript from audio"