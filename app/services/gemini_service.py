import json
import os
import random
import re
from flask.cli import load_dotenv

load_dotenv()


class GeminiService:
    def __init__(self):
        self.use_mock = os.getenv("USE_MOCK_GEMINI", "true").lower() == "true"
        self.api_key = os.getenv("JAYS_GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY")

        if not self.use_mock and self.api_key:
            from google import genai
            self.client = genai.Client(api_key=self.api_key)
        else:
            self.use_mock = True

    def analyze_transcript(self, transcript: str) -> dict:
        """Classifies entry, extracts emotion, takeaways, follow-up questions, and summary."""
        if self.use_mock:
            return self._mock_analysis(transcript)

        from google.genai import types

        prompt = f"""
You are an intelligent reflective journaling assistant. Analyze this spoken journal entry:
"{transcript}"

Output ONLY a JSON object matching this schema:
{{
    "entry_type": "struggle" | "achievement" | "general",
    "core_topic": "concise topic label (e.g., React Hooks, Interview Prep, Time Management)",
    "emotion": "detected primary emotion (e.g., frustrated, determined, proud, anxious)",
    "summary": "concise 1-2 sentence overview",
    "key_takeaways": [
        "core points or lessons to remember from this rant"
    ],
    "follow_up_questions": [
        "Thought-provoking question 1 to check progress later",
        "Thought-provoking question 2 to explore root cause",
        "Thought-provoking question 3 regarding immediate action items",
        "Thought-provoking question 4 regarding mindset or perspective"
    ],
    "reflection_quote": "supportive, grounded 1-sentence closing thought",
    "temporal_references": "any relative timeline mentions or null"
}}

IMPORTANT: The "follow_up_questions" array MUST contain exactly 4 distinct questions.
"""
        try:
            response = self.client.models.generate_content(
                model="gemini-3.8-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                ),
            )

            raw_text = response.text or ""
            "Removes JSON fences and takes the object inside"
            cleaned_text = re.sub(r"^```(?:json)?\s*", "", raw_text.strip(), flags=re.MULTILINE)
            "Removes trailing fences if there."
            cleaned_text = re.sub(r"\s*```$", "", cleaned_text.strip(), flags=re.MULTILINE)

            "Gets the objects inside JSON if theres fences, or returns clean text if not."
            match = re.search(r"\{.*\}", cleaned_text, re.DOTALL)
            return json.loads(match.group(0)) if match else json.loads(cleaned_text)
        except Exception as e:
            print(f"[GeminiService] Live parsing error: {e}. Falling back to mock.")
            return self._mock_analysis(transcript)

    """
    Embedding 004 takes the "text" after doing the math on the trained neural network,
    it calculates the positions.
    Output is a 768-dimensional vector representation of the text.
    """
    def generate_embedding(self, text: str) -> list[float]:
        """Generates 768-dimensional vector embedding for TiDB."""
        if self.use_mock:
            "make text deterministic for mock embedding. converts the text into numerical value."
            random.seed(hash(text))
            return [round(random.uniform(-0.1, 0.1), 6) for _ in range(768)]
        
        "Uses google 004 embedding model to generate a vector represnetation of the text."
        try:
            response = self.client.models.embed_content(
                model="text-embedding-004",
                contents=text
            )
            "This returns list of embeds. We only take the first one."
            return response.embeddings[0].values
        except Exception as e:
            print(f"[GeminiService] Embedding error: {e}. Falling back to mock vector.")
            random.seed(hash(text))
            return [round(random.uniform(-0.1, 0.1), 6) for _ in range(768)]


    """
    Method is used to make a JSON for us to see the structure.
    """
    def _mock_analysis(self, transcript: str) -> dict:
        text_lower = (transcript or "").lower()
        if any(w in text_lower for w in ["stuck", "error", "hard", "bug", "struggle", "failed"]):
            entry_type = "struggle"
            emotion = "frustrated"
        elif any(w in text_lower for w in ["fixed", "solved", "working", "built", "success"]):
            entry_type = "achievement"
            emotion = "proud"
        else:
            entry_type = "general"
            emotion = "neutral"

        return {
            "entry_type": entry_type,
            "core_topic": "voice journal log",
            "emotion": emotion,
            "summary": transcript if transcript else "Hands-free entry log",
            "key_takeaways": ["User completed a vocal entry check-in."],
            "follow_up_questions": [
                "What was the specific obstacle or highlight from this session?",
                "What is the single most important action item to tackle next?",
                "What resources or strategies could unblock you if you get stuck?",
                "How does this experience help you improve long term?"
            ],
            "reflection_quote": "Consistent reflection turns struggles into milestones.",
            "temporal_references": None
        }