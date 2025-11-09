"""Utility helpers for interacting with OpenAI's Omni models."""

from __future__ import annotations

import json
from typing import Any, Iterable

import httpx

from .config import settings


class OmniAPIError(RuntimeError):
    """Raised when the Omni API cannot fulfill a request."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class OmniClient:
    """Wrapper around OpenAI's HTTP APIs tailored for Omni Teacher flows."""

    def __init__(self) -> None:
        if not settings.openai_api_key:
            msg = "OPENAI_API_KEY is required to use Omni integrations"
            raise RuntimeError(msg)

        base_url = settings.openai_api_base.rstrip("/")
        self._http = httpx.Client(
            base_url=base_url,
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(120.0, connect=30.0),
        )
        self._model = settings.omni_model
        self._voice = settings.tts_voice

    def generate_diagnostic_quiz(self, *, topic: str, student_profile: dict[str, Any]) -> dict[str, Any]:
        """Create a kid-friendly diagnostic quiz for the requested topic."""

        system_prompt = (
            "You are Omni Teacher, an encouraging AI educator who designs engaging "
            "diagnostic quizzes for children. Keep language friendly and age-appropriate."
        )
        user_prompt = (
            "Create a short diagnostic quiz for the topic below. Each question should help "
            "assess the learner's current understanding. Provide at least 4 questions, "
            "mixing formats (multiple choice, multi-select, short answer)."
            "Return JSON with keys: program_title, overview, instructions, questions."
            "Each question must include id, prompt, answer_type, choices (optional), and hints."
            f"\n\nTopic description: {topic}\n\nStudent profile: {json.dumps(student_profile)}"
        )

        payload = self._chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            response_format={"type": "json_object"},
        )
        if not payload:
            raise RuntimeError("Omni model did not return quiz content")
        return json.loads(payload)

    def evaluate_quiz_answers(
        self,
        *,
        topic: str,
        quiz: dict[str, Any],
        answers: dict[str, Any],
        student_profile: dict[str, Any],
    ) -> dict[str, Any]:
        """Analyse quiz answers and build a personalised learning plan."""

        system_prompt = (
            "You are Omni Teacher, an adaptive tutor. Evaluate the student's quiz answers, "
            "summarise strengths/gaps, and design a personalised learning program with chapters "
            "and lessons. Lessons must include markdown-friendly explanations and suggest "
            "activities for kids."
        )
        user_prompt = (
            "Topic: {topic}\nStudent profile: {profile}\n\n"
            "Quiz questions: {quiz}\n\nStudent answers: {answers}\n\n"
            "Respond as JSON with keys: skill_profile (string summary), program_overview (string),"
            " score (0-100), analysis (object with strengths and improvements), chapters (array)."
            "Each chapter must include title, focus, lessons array. Each lesson needs title,"
            " content_markdown, and optional resources (array of objects with type, label, and url)."
        ).format(
            topic=topic,
            profile=json.dumps(student_profile),
            quiz=json.dumps(quiz),
            answers=json.dumps(answers),
        )

        payload = self._chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.4,
            response_format={"type": "json_object"},
        )
        if not payload:
            raise RuntimeError("Omni model did not return evaluation content")
        return json.loads(payload)

    def summarise_lesson_attempt(
        self,
        *,
        lesson_title: str,
        lesson_content: str,
        answers: dict[str, Any],
    ) -> dict[str, str]:
        """Create positive and constructive reflections for a lesson attempt."""

        user_prompt = (
            "Lesson title: {title}\nLesson content: {content}\nLearner answers: {answers}\n\n"
            "Provide two short reflections: positive_feedback and next_focus."
        ).format(
            title=lesson_title,
            content=lesson_content,
            answers=json.dumps(answers),
        )
        payload = self._chat_completion(
            messages=[
                {
                    "role": "system",
                    "content": "You are Omni Teacher, offering concise feedback to young learners.",
                },
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.6,
            response_format={"type": "json_object"},
        )
        if not payload:
            raise RuntimeError("Omni model did not return reflection content")
        return json.loads(payload)

    def chat_reply(self, messages: Iterable[dict[str, Any]]) -> str:
        """Generate a conversational reply for the chat interface."""

        conversation = list(messages)
        payload = self._chat_completion(messages=conversation, temperature=0.8)
        return payload or ""

    def synthesize_speech(self, text: str) -> bytes:
        """Convert assistant text into an audio payload."""

        try:
            response = self._http.post(
                "/audio/speech",
                json={
                    "model": "gpt-4o-mini-tts",
                    "voice": self._voice,
                    "input": text,
                    "format": "mp3",
                },
                headers={"Accept": "audio/mpeg"},
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code if exc.response else None
            raise OmniAPIError("Unable to synthesise speech", status_code=status_code) from exc
        except httpx.HTTPError as exc:  # pragma: no cover - defensive network error
            raise OmniAPIError("Network error while synthesising speech") from exc
        return response.content

    def _chat_completion(self, *, messages: Iterable[dict[str, Any]], temperature: float, response_format: dict | None = None) -> str:
        payload: dict[str, Any] = {
            "model": self._model,
            "messages": list(messages),
            "temperature": temperature,
        }
        if response_format:
            payload["response_format"] = response_format
        try:
            response = self._http.post("/chat/completions", json=payload)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code if exc.response else None
            detail = exc.response.text if exc.response else ""
            message = "Omni API returned an error"
            if status_code:
                message = f"Omni API returned {status_code}"
            if detail:
                message = f"{message}: {detail}"
            raise OmniAPIError(message, status_code=status_code) from exc
        except httpx.HTTPError as exc:  # pragma: no cover - defensive network error
            raise OmniAPIError("Network error while calling Omni API") from exc
        data = response.json()
        choices = data.get("choices") or []
        if not choices:
            return ""
        message = choices[0].get("message", {})
        return message.get("content", "")

    def close(self) -> None:
        """Close the underlying HTTP client."""

        self._http.close()


_singleton: OmniClient | None = None


def get_omni_client() -> OmniClient:
    """Return a lazily-created :class:`OmniClient` instance."""

    global _singleton
    if _singleton is None:
        _singleton = OmniClient()
    return _singleton


__all__ = ["OmniClient", "OmniAPIError", "get_omni_client"]
