"""Persistence and revisit-candidate retrieval using the project's TiDB connection."""

from __future__ import annotations

import json
import math
import re
from datetime import datetime
from typing import Any

from app.database import get_connection
from app.models.journal_entry import JournalEntry


MIN_REVISIT_AGE_DAYS = 14
REVISIT_RESURFACE_DAYS = 30
MAX_REVISIT_CANDIDATES = 100

# These terms are too broad to establish that two entries describe the same life thread.
GENERIC_TERMS = {
    "about", "again", "course", "day", "feel", "feeling", "first", "finished",
    "general", "graduated", "growth", "journal", "learn", "life", "log", "new",
    "school", "started", "today", "worked", "work",
}


class DatabaseService:
    def save_entry(self, entry: JournalEntry, analysis: dict[str, Any]) -> int:
        """Persist an entry plus its events and future revisit cues."""
        payload = entry.to_db_dict()
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """INSERT INTO journal_entries
                       (user_id, transcript, entry_type, core_topic, emotion, summary, analysis_json,
                        key_takeaways, reflection_question, reflection_quote,
                        temporal_references, embedding, video_filename)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (
                        payload["user_id"], payload["transcript"], payload["entry_type"],
                        payload["core_topic"], analysis.get("emotion", "neutral"), payload["summary"],
                        json.dumps(analysis, ensure_ascii=False),
                        json.dumps(analysis.get("key_takeaways", [])), None,
                        analysis.get("reflection_quote"), analysis.get("temporal_references"),
                        payload["embedding"], payload["video_filename"],
                    ),
                )
                entry_id = cursor.lastrowid

                for event in analysis.get("important_events", []):
                    if not isinstance(event, dict) or not event.get("title"):
                        continue
                    cursor.execute(
                        """INSERT INTO important_events
                           (entry_id, user_id, title, scheduled_for, original_time_reference,
                            reminder_reason, status)
                           VALUES (%s, %s, %s, %s, %s, %s, 'pending')""",
                        (
                            entry_id, payload["user_id"], str(event["title"])[:200],
                            self._parse_datetime(event.get("scheduled_for")),
                            event.get("original_time_reference"), event.get("reminder_reason"),
                        ),
                    )

                for cue in analysis.get("future_revisit_cues", []):
                    self._insert_cue(cursor, entry_id, payload["user_id"], payload["core_topic"], cue)

                growth = analysis.get("growth_signal", {})
                if isinstance(growth, dict) and growth.get("type") and not analysis.get("future_revisit_cues"):
                    self._insert_cue(
                        cursor, entry_id, payload["user_id"], growth.get("topic") or payload["core_topic"],
                        {
                            "trigger": growth.get("type"),
                            "trigger_concepts": [growth.get("topic")] if growth.get("topic") else [],
                            "reason": growth.get("future_revisit_reason"),
                            "baseline_questions": growth.get("baseline_questions", []),
                        },
                    )
            connection.commit()
            return entry_id
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def find_revisit_candidate(
        self,
        *,
        user_id: str,
        current_entry_id: int,
        current_embedding: list[float],
        current_analysis: dict[str, Any],
        current_transcript: str,
    ) -> dict[str, Any] | None:
        """Return one strong user-scoped revisit candidate, or None.

        Candidate retrieval is deterministic. Gemini receives only the best candidate
        for verification, rather than the user's complete journal history.
        """
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """SELECT cue.id AS cue_id, cue.source_entry_id, cue.topic AS cue_topic,
                              cue.trigger_text, cue.trigger_concepts, cue.reason,
                              cue.baseline_questions, cue.shown_count,
                              source.transcript AS source_transcript, source.summary AS source_summary,
                              source.core_topic AS source_topic, source.entry_type AS source_entry_type,
                              source.created_at AS source_created_at, source.embedding AS source_embedding
                       FROM revisit_cues AS cue
                       JOIN journal_entries AS source ON source.id = cue.source_entry_id
                       WHERE cue.user_id = %s
                         AND cue.status = 'active'
                         AND cue.shown_count < 3
                         AND cue.source_entry_id <> %s
                         AND source.created_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL %s DAY)
                         AND (cue.last_suggested_at IS NULL
                              OR cue.last_suggested_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL %s DAY))
                       ORDER BY source.created_at DESC
                       LIMIT %s""",
                    (user_id, current_entry_id, MIN_REVISIT_AGE_DAYS, REVISIT_RESURFACE_DAYS, MAX_REVISIT_CANDIDATES),
                )
                candidates = cursor.fetchall()
        finally:
            connection.close()

        current_terms = self._analysis_terms(current_analysis, current_transcript)
        best: dict[str, Any] | None = None
        for candidate in candidates:
            candidate_terms = self._candidate_terms(candidate)
            entity_score = self._term_overlap(current_terms, candidate_terms)
            topic_score = self._token_overlap(
                str(current_analysis.get("core_topic") or ""),
                str(candidate.get("cue_topic") or candidate.get("source_topic") or ""),
            )
            similarity = self._cosine_similarity(current_embedding, self._json_list(candidate.get("source_embedding")))
            milestone_score = self._milestone_score(current_analysis, candidate)
            score = (0.45 * similarity) + (0.35 * entity_score) + (0.10 * topic_score) + (0.10 * milestone_score)

            # A semantic match alone can confuse unrelated topics with a shared word.
            has_specific_connection = entity_score > 0 or topic_score >= 0.5
            if not has_specific_connection or score < 0.60:
                continue
            candidate["retrieval_score"] = round(score, 3)
            candidate["entity_score"] = round(entity_score, 3)
            candidate["similarity_score"] = round(similarity, 3)
            if best is None or candidate["retrieval_score"] > best["retrieval_score"]:
                best = candidate
        return best

    def mark_revisit_suggested(self, cue_id: int) -> None:
        """Record a suggestion so one old entry is not repeatedly surfaced."""
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """UPDATE revisit_cues
                       SET last_suggested_at = UTC_TIMESTAMP(), shown_count = shown_count + 1
                       WHERE id = %s""",
                    (cue_id,),
                )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def mark_revisit_dismissed(self, cue_id: int, user_id: str) -> bool:
        """Suppress a cue after the user dismisses it."""
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """UPDATE revisit_cues
                       SET last_dismissed_at = UTC_TIMESTAMP(), last_suggested_at = UTC_TIMESTAMP()
                       WHERE id = %s AND user_id = %s""",
                    (cue_id, user_id),
                )
                updated = cursor.rowcount > 0
            connection.commit()
            return updated
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    @staticmethod
    def _insert_cue(cursor, entry_id: int, user_id: str, topic: str, cue: dict[str, Any]) -> None:
        if not isinstance(cue, dict) or not cue.get("trigger"):
            return
        cursor.execute(
            """INSERT INTO revisit_cues
               (source_entry_id, user_id, topic, trigger_text, trigger_concepts,
                reason, baseline_questions, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, 'active')""",
            (
                entry_id, user_id, str(topic)[:200], str(cue["trigger"])[:500],
                json.dumps(cue.get("trigger_concepts", [])), cue.get("reason"),
                json.dumps(cue.get("baseline_questions", [])),
            ),
        )

    @staticmethod
    def _parse_datetime(value: object) -> datetime | None:
        if not isinstance(value, str) or not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            return None

    @staticmethod
    def _json_list(value: object) -> list[Any]:
        if isinstance(value, list):
            return value
        if not isinstance(value, str):
            return []
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except (TypeError, ValueError):
            return []

    def _analysis_terms(self, analysis: dict[str, Any], transcript: str) -> set[str]:
        values: list[str] = [str(analysis.get("core_topic") or ""), transcript]
        growth = analysis.get("growth_signal")
        if isinstance(growth, dict):
            values.append(str(growth.get("topic") or ""))
        for cue in analysis.get("future_revisit_cues", []):
            if isinstance(cue, dict):
                values.extend(str(item) for item in cue.get("trigger_concepts", []) if isinstance(item, str))
        return self._meaningful_terms(values)

    def _candidate_terms(self, candidate: dict[str, Any]) -> set[str]:
        values = [str(candidate.get("cue_topic") or ""), str(candidate.get("source_topic") or "")]
        values.extend(str(item) for item in self._json_list(candidate.get("trigger_concepts")) if isinstance(item, str))
        return self._meaningful_terms(values)

    @staticmethod
    def _meaningful_terms(values: list[str]) -> set[str]:
        terms: set[str] = set()
        for value in values:
            terms.update(re.findall(r"[a-zA-Z][a-zA-Z0-9+#.-]{2,}", value.lower()))
        return {term for term in terms if term not in GENERIC_TERMS}

    @staticmethod
    def _term_overlap(current_terms: set[str], candidate_terms: set[str]) -> float:
        if not current_terms or not candidate_terms:
            return 0.0
        return len(current_terms & candidate_terms) / len(candidate_terms)

    def _token_overlap(self, first: str, second: str) -> float:
        first_terms = self._meaningful_terms([first])
        second_terms = self._meaningful_terms([second])
        if not first_terms or not second_terms:
            return 0.0
        return len(first_terms & second_terms) / len(first_terms | second_terms)

    @staticmethod
    def _cosine_similarity(first: list[float], second: list[Any]) -> float:
        if not first or len(first) != len(second):
            return 0.0
        try:
            numerator = sum(float(a) * float(b) for a, b in zip(first, second))
            first_magnitude = math.sqrt(sum(float(a) ** 2 for a in first))
            second_magnitude = math.sqrt(sum(float(b) ** 2 for b in second))
        except (TypeError, ValueError):
            return 0.0
        if not first_magnitude or not second_magnitude:
            return 0.0
        return max(0.0, numerator / (first_magnitude * second_magnitude))

    @staticmethod
    def _milestone_score(current_analysis: dict[str, Any], candidate: dict[str, Any]) -> float:
        current_type = str(current_analysis.get("entry_type") or "")
        old_trigger = str(candidate.get("trigger_text") or "").lower()
        if current_type == "achievement" and any(word in old_trigger for word in ("start", "education", "career", "job", "skill", "aspiration")):
            return 1.0
        current_growth = current_analysis.get("growth_signal")
        if isinstance(current_growth, dict) and current_growth.get("type"):
            return 0.5
        return 0.0
