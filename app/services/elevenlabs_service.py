import os
from elevenlabs.client import ElevenLabs

# Minimal valid 1-frame silent MP3 byte sequence
SILENT_MP3_FRAME = (
    b"\xff\xfb\x90d\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
    b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
    b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
)


class ElevenLabsService:
    def __init__(self) -> None:
        self.use_mock = os.getenv("USE_MOCK_TTS", "false").lower() == "true"
        self.api_key = os.getenv("ELEVENLABS_API_KEY")
        self.default_voice_id = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
        self.client = None

        if not self.use_mock and self.api_key:
            self.client = ElevenLabs(api_key=self.api_key)

    def synthesize(self, text: str, voice_id: str | None = None) -> bytes:
        # Return mock audio immediately without hitting the network
        if self.use_mock:
            return SILENT_MP3_FRAME

        if not self.client:
            raise RuntimeError("ELEVENLABS_API_KEY is not configured and USE_MOCK_TTS is false.")

        audio_stream = self.client.text_to_speech.convert(
            voice_id=voice_id or self.default_voice_id,
            text=text,
            model_id="eleven_turbo_v2_5",
        )
        return b"".join(audio_stream)