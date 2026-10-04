"""Coordinates retrieval and verification of relevant past journal entries."""

from __future__ import annotations

from typing import Any

from app.services.db_service import DatabaseService
from app.services.gemini_service import GeminiService


class RevisitService:
    """Find one safe, meaningful revisit suggestion for a completed journal entry."""

    def __init__(self, db_service: DatabaseService, gemini_service: GeminiService) -> None:
        self.db_service = db_service
        self.gemini_service = gemini_service

    def find_suggestion(
        self,
        *,
        user_id: str,
        entry_id: int,
        transcript: str,
        analysis: dict[str, Any],
        embedding: list[float],
    ) -> dict[str, Any] | None:
        """Retrieve, verify, and record one revisit suggestion, if appropriate."""
        candidate = self.db_service.find_revisit_candidate(
            user_id=user_id,
            current_entry_id=entry_id,
            current_embedding=embedding,
            current_analysis=analysis,
            current_transcript=transcript,
        )
        if not candidate:
            return None

        verification = self.gemini_service.verify_revisit(analysis, candidate)
        if not verification.get("should_suggest_revisit"):
            return None

        self.db_service.mark_revisit_suggested(candidate["cue_id"])
        source_created_at = candidate.get("source_created_at")
        return {
            "cue_id": candidate["cue_id"],
            "source_entry_id": candidate["source_entry_id"],
            "source_created_at": source_created_at.isoformat()
            if hasattr(source_created_at, "isoformat") else str(source_created_at),
            "source_summary": candidate.get("source_summary") or "",
            "suggestion": verification["suggestion"],
        }
