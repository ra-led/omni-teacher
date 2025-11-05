# Omni Teacher

A conceptual platform for a kid-friendly AI teacher that combines large language and vision-language models to deliver adaptive, multimodal learning experiences. The system emphasizes persistent progress tracking, dynamic lesson planning, and playful conversation while supporting text, image, and voice interactions.

## Highlights
- **Adaptive learning programs**: Generates topic-specific curricula after diagnosing student proficiency via AI-generated quizzes.
- **Persistent progress**: Stores lessons, quiz results, reflections, and badges in PostgreSQL with Redis caching.
- **Multimodal chat**: Supports Markdown, LaTeX, Mermaid diagrams, photo uploads, and voice (STT/TTS) within a single chat stream.
- **Omni model integration**: All student inputs are routed through `gpt-4o` for text+vision reasoning, small-talk handling, and guardrails.
- **Docker-first deployment**: `docker-compose` spins up frontend, backend, async workers, and data stores with durable volumes.

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
- Flesh out data models and migrations.
- Implement the LLM orchestrator with prompt templates and tool calls.
- Build the chat UI with Markdown/LaTeX/Mermaid rendering and TTS playback.
- Add comprehensive automated tests and CI workflows.
