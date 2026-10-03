import os
import json
from flask.cli import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

class GeminiService:
    def __init__(self):
        self.client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    def analyze_transcript(self, transcript: str) -> dict:
        """Classifies the rant, identifies core topic, and outputs summary."""
        prompt = f"""
        Analyze this journal log:
        "{transcript}"

        Return ONLY a JSON object:
        {{
            "entry_type": "struggle" | "achievement" | "general",
            "core_topic": "short topic name (e.g., dynamic programming, job hunt, public speaking)",
            "summary": "1 sentence summary",
            "reflection_quote": "A supportive 1-sentence prompt for the user"
        }}
        """
        response = self.client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        return json.loads(response.text)

    def generate_embedding(self, text: str) -> list[float]:
        """Generates 768-dimensional vector embedding for TiDB."""
        response = self.client.models.embed_content(
            model="text-embedding-004",
            contents=text
        )
        return response.embeddings[0].values