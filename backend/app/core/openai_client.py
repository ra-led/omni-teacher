"""Utility helpers for interacting with OpenAI's Omni models."""

from __future__ import annotations

import json
from typing import Any, Iterable

from openai import OpenAI

from .config import settings


class OmniClient:
    """Wrapper around the OpenAI SDK tailored for the Omni Teacher workflows."""

    def __init__(self) -> None:
        self._client = OpenAI(api_key=settings.openai_api_key)
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

        response = self._client.chat.completions.create(
            model=self._model,
            response_format={"type": "json_object"},
            temperature=0.7,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        payload = response.choices[0].message.content
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
            " content_markdown, and optional resources (array of {type, label, url})."
        ).format(
            topic=topic,
            profile=json.dumps(student_profile),
            quiz=json.dumps(quiz),
            answers=json.dumps(answers),
        )

        response = self._client.chat.completions.create(
            model=self._model,
            response_format={"type": "json_object"},
            temperature=0.4,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        payload = response.choices[0].message.content
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
        response = self._client.chat.completions.create(
            model=self._model,
            response_format={"type": "json_object"},
            temperature=0.6,
            messages=[
                {
                    "role": "system",
                    "content": "You are Omni Teacher, offering concise feedback to young learners.",
                },
                {"role": "user", "content": user_prompt},
            ],
        )
        payload = response.choices[0].message.content
        if not payload:
            raise RuntimeError("Omni model did not return reflection content")
        return json.loads(payload)

    def chat_reply(self, messages: Iterable[dict[str, Any]]) -> str:
        """Generate a conversational reply for the chat interface."""

        conversation = list(messages)
        response = self._client.chat.completions.create(
            model=self._model,
            temperature=0.8,
            messages=conversation,
        )
        return response.choices[0].message.content or ""

    def synthesize_speech(self, text: str) -> bytes:
        """Convert assistant text into an audio payload."""

        speech = self._client.audio.speech.create(
            model="gpt-4o-mini-tts",
            voice=self._voice,
            input=text,
            format="mp3",
        )
        return b"".join(speech.iter_bytes())


omni_client = OmniClient()
