from dataclasses import dataclass, asdict
from typing import List, Optional

@dataclass
class JournalEntry:
    user_id: str
    transcript: str
    entry_type: str # 'struggle', 'achievement', or 'general'
    summary: str
    core_topic: str
    embedding: List[float] # 768-dim float vector from Gemini
    video_filename: Optional[str] = None
    id: Optional[int] = None
    created_at: Optional[object] = None

    def to_db_dict(self) -> dict:
        """Serializes entry into primitive types ready for SQL execution."""
        return {
            "user_id": self.user_id,
            "transcript": self.transcript,
            "entry_type": self.entry_type,
            "summary": self.summary,
            "core_topic": self.core_topic,
            "embedding": str(self.embedding),  # TiDB vector expects string: "[0.12, -0.04, ...]"
            "video_filename": self.video_filename,
            "created_at": self.created_at,
        }
