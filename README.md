# Omni Teacher

A conceptual platform for a kid-friendly AI teacher that combines large language and vision-language models to deliver adaptive, multimodal learning experiences. The system emphasizes persistent progress tracking, dynamic lesson planning, and playful conversation while supporting text, image, and voice interactions.

## Highlights
- **Adaptive learning programs**: Students add topics on demand and instantly receive Omni-generated diagnostic quizzes plus personalised curricula.
- **Persistent progress**: Lesson attempts, quiz submissions, reflections, and badges live in PostgreSQL with Redis/MinIO backing async work.
- **Multimodal chat**: Markdown, LaTeX, Mermaid diagrams, photo prompts, and TTS playback are all served through a realtime WebSocket tutor.
- **Omni model integration**: Every student turn (text, image, or voice) is normalised and routed through `gpt-4o` for understanding, planning, and safety.
- **Docker-first deployment**: `docker-compose` orchestrates the frontend, FastAPI backend, Celery worker, and data stores with persistent volumes.

## Backend API Overview

| Endpoint | Purpose |
| --- | --- |
| `POST /api/students` | Create a learner profile with age/grade preferences. |
| `POST /api/students/{student_id}/topics` | Kick off quiz + curriculum generation for a learner-requested topic. |
| `POST /api/programs/{program_id}/diagnostic/submit` | Submit quiz answers and receive the personalised learning plan. |
| `GET /api/programs/{program_id}` | Retrieve quiz, lessons, and skill profile for a generated program. |
| `POST /api/lessons/{lesson_id}/complete` | Record lesson answers and auto-generated positive/next-step reflections. |
| `GET /api/students/{student_id}/progress` | Aggregate completed vs. in-progress lessons for dashboards. |
| `POST /api/chat/sessions` / `GET /api/chat/sessions/{id}` | Manage persisted chat threads for the tutor. |
| `WS /ws/chat/{session_id}` | Realtime tutoring with Markdown/LaTeX/Mermaid text plus optional TTS audio URLs. |

## Repository Layout
```
backend/      # FastAPI + Celery scaffolding
frontend/     # Next.js child-friendly learning interface
studio/       # Internal content authoring UI (Vite)
docs/         # Architecture and design references
docker-compose.yml
```

Read the detailed architecture in [docs/system-design.md](docs/system-design.md).

## Running Locally
1. Install Docker and Docker Compose v2.
2. Populate any required secrets in a `.env` file (see `docker-compose.yml` for environment variables).
3. Start the stack:
   ```bash
   docker compose up --build
   ```
4. Access services:
   - Frontend: http://localhost:3000
   - Backend API docs: http://localhost:8000/docs
   - Studio (content tools): http://localhost:4173
   - MinIO console: http://localhost:9001

## Next Steps
- Harden persistence with migrations, row-level security, and Guardian/Teacher roles.
- Expand assessment variety (projects, open-ended rubrics) and parent-facing reporting.
- Add automated evaluation for uploaded drawings/photos inside the lesson flow.
- Layer on CI pipelines for unit tests, seed data, and synthetic conversation regression.
