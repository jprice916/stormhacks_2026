import os
from typing import Optional, Dict, Any
from app.models.journal_entry import JournalEntry

class DatabaseService:
    def __init__(self):
        # The DB teammate will fill in connection credentials here
        self.host = os.getenv("TIDB_HOST")
        self.user = os.getenv("TIDB_USER")
        self.password = os.getenv("TIDB_PASSWORD")
        self.database = os.getenv("TIDB_DATABASE", "test")
        self.port = int(os.getenv("TIDB_PORT", 4000))

    def save_entry(self, entry: JournalEntry) -> int:
        """
        TODO (DB Person):
        Execute INSERT INTO journal_entries with entry.to_db_dict()
        Return the inserted row ID.
        """
        payload = entry.to_db_dict()
        print(f"[DB STUB] Inserting entry for user: {payload['user_id']}")
        return 1  # Mock ID

    def find_matching_struggle(self, user_id: str, embedding: list[float]) -> Optional[Dict[str, Any]]:
        """
        TODO (DB Person):
        Run TiDB VEC_COSINE_DISTANCE(embedding, %s) WHERE entry_type = 'struggle'
        Return the closest matched row dict or None.
        """
        print(f"[DB STUB] Searching TiDB vector match for user: {user_id}")
        return {
            "id": 99,
            "transcript": "I spent 5 hours on recursion and I still do not understand it.",
            "summary": "Struggling with recursion",
            "video_filename": "struggle_day1.webm",
            "distance": 0.18
        }