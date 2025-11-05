# Omni Teacher Platform Design

## Vision
Create a kid-friendly web teacher that uses large language and vision-language models to deliver adaptive learning experiences through text, voice, and images. The system must understand student inputs (text, speech-to-text, or uploaded pictures), generate customized learning programs, monitor progress, and handle small talk while keeping parents/guardians engaged with transparent reporting.

## High-Level Architecture
```mermaid
diagram TD
    subgraph Frontend
        WebApp[Next.js Web App]
        ChatUI[Chat & Lesson UI]
        Catalog[Program Catalog]
        Recorder[Voice Recorder]
    end

    subgraph Backend
        API[FastAPI REST & WebSocket API]
        Auth[Auth Service]
        Progress[Progress Tracking]
        QuizGen[Quiz & Program Generator]
        MediaSvc[Media Pipeline]
        Orchestrator[LLM Orchestrator]
    end

    subgraph Workers
        QuizWorker[Async Quiz Worker]
        TTSWorker[TTS/Voice Worker]
        VisionWorker[VLM Worker]
    end

    subgraph External
        Omni[gpt-4o (LLM/VLM)]
        STT[Speech-to-Text API]
        TTS[Text-to-Speech Engine]
    end

    subgraph Persistence
        Postgres[(PostgreSQL)]
        Redis[(Redis Cache)]
        Minio[(Object Storage)]
    end

    WebApp -->|HTTPS| API
    ChatUI <-->|WebSocket| API
    API --> Auth
    API --> Progress
    API --> QuizGen
    API --> MediaSvc
    Orchestrator --> Omni
    MediaSvc --> VisionWorker
    QuizGen --> QuizWorker
    TTSWorker --> TTS
    Recorder --> API
    API --> TTSWorker
    API --> Postgres
    API --> Redis
    MediaSvc --> Minio
    VisionWorker --> Omni
```

### Component Responsibilities
- **Next.js Web App**: Responsive UI optimized for children. Supports chat, curriculum catalog, and progress dashboards. Leverages Markdown/LaTeX/Mermaid renderers, voice playback, and recording controls.
- **FastAPI Backend**: Unified entry point for REST (program management, progress) and WebSockets (chat, streaming responses). Implements RBAC for students/parents/admins.
- **LLM Orchestrator**: Manages prompt engineering, context construction, tool usage, and response post-processing. Routes requests to gpt-4o for multimodal understanding.
- **Quiz & Program Generator Service**: Uses orchestrator to produce diagnostic quizzes, evaluate responses, derive proficiency levels, and assemble personalized curriculum trees referencing content blocks.
- **Progress Tracking Service**: Persists lessons, chapters, quiz results, completion reflections, and badges in PostgreSQL. Updates caches and publishes events.
- **Media Pipeline**: Handles student-uploaded images, camera captures, and generated audio. Uses MinIO/S3 for storage, virus scanning, and transformation.
- **Async Workers**: Execute long-running jobs (quiz evaluation, TTS synthesis, image analysis) from Redis-backed queues.
- **External Integrations**: gpt-4o (LLM/VLM), STT (e.g., Whisper API), TTS (e.g., ElevenLabs or Azure Cognitive Services).

## Data Model Sketch
| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | Accounts for students, guardians, teachers | `id`, `role`, `profile`, `preferences` |
| `learning_programs` | Templates generated per learner-requested topic | `id`, `title`, `subject`, `age_range`, `description`, `thumbnail_url` |
| `program_versions` | Versioned program structures generated per learner | `id`, `program_id`, `student_id`, `skill_profile`, `generated_at`, `structure_json` |
| `lessons` | Content nodes in generated program | `id`, `program_version_id`, `chapter`, `order`, `content_markdown`, `resources` |
| `lesson_attempts` | Student attempts with feedback | `id`, `lesson_id`, `student_id`, `status`, `score`, `answers_json`, `reflection_positive`, `reflection_negative`, `created_at` |
| `quizzes` | Diagnostic and formative assessments | `id`, `program_version_id`, `type`, `items_json`, `target_skill` |
| `quiz_attempts` | Captured answers | `id`, `quiz_id`, `student_id`, `attempt_number`, `responses_json`, `score`, `analysis_json` |
| `chat_sessions` | Each interaction thread | `id`, `student_id`, `program_version_id`, `context` |
| `messages` | Individual chat messages | `id`, `session_id`, `sender`, `content_type`, `content_payload`, `render_formats`, `audio_url`, `image_url`, `metadata` |
| `badges` | Gamified achievements | `id`, `student_id`, `type`, `awarded_at`, `description` |

## Key User Flows
### 1. Topic Selection & Diagnostic Quiz
1. Student selects **Add Topic** from the catalog and describes the subject they want to learn.
2. Backend generates an initial diagnostic quiz via `QuizGen` using gpt-4o tailored to the requested topic.
3. Student completes quiz (text/voice/image answers). STT converts voice to text; images analyzed via Vision worker and gpt-4o.
4. Quiz evaluation determines proficiency level and identifies gaps.
5. Program generator creates a personalized program structure (chapters, lessons, recommended modalities) for that topic.
6. Program stored in `program_versions` and surfaced in the catalog for the student.

### 2. Lesson Delivery & Reflection
1. Student enters lesson chat. Backend fetches relevant lesson content and history.
2. LLM orchestrator generates lesson instructions with Markdown/LaTeX/Mermaid diagrams.
3. UI renders message block with code-highlighting, math typesetting (KaTeX), and Mermaid diagrams.
4. Student responds using text, voice, or image. Input normalized and forwarded to orchestrator.
5. System records answers in `lesson_attempts`, including positive/negative reflections auto-generated by agent and editable by teacher.
6. Completion triggers progress update, awarding points/badges and optionally notifying guardians.

### 3. Always-Available Small Talk
- Chat sessions maintain global persona prompts to stay encouraging and child-friendly.
- When no academic intent detected (classifier via Omni), orchestrator switches to casual conversation while subtly nudging back to learning.
- Sentiment analysis monitors mood; triggers supportive responses.

### 4. Voice Interaction
- TTS worker converts LLM responses to audio files stored in MinIO, returning URLs.
- UI auto-plays voice for younger students when TTS mode enabled.
- For microphone inputs, Recorder component captures audio, uploads to backend for STT transcription and optional storage.

## Prompting Strategy
- **System Prompts** enforce teacher persona, safety policies, age-appropriate tone, and curriculum alignment.
- **Context Assembly** merges: student profile, skill history, current lesson objectives, previous chat exchanges, rubric.
- **Tools**: orchestrator exposes operations like `generate_quiz`, `evaluate_answers`, `summarize_progress`, `create_story_image` using function calling.
- **Guardrails**: Content moderation filter and verification steps before storing or speaking responses.

## Progress Analytics
- Daily/weekly dashboards showing completed lessons, streaks, strengths/weaknesses.
- Heatmaps for subject mastery. Downloadable reports for guardians.
- Recommendation engine uses embeddings to propose next topics.

## Accessibility & Child Safety
- COPPA/GDPR compliance with parental consent and data minimization.
- Friendly avatars, colorblind-safe palette, and adjustable font sizes.
- Optional content filtering via `Omni` classification with an opt-in human review queue for flagged interactions.

## Deployment & DevOps
- **Containerization**: Each service has dedicated Dockerfile. Multi-stage builds for optimized images.
- **docker-compose** orchestrates local/dev deployment with volumes for persistent Postgres/MinIO data.
- **Observability**: Structured logging, Prometheus metrics, Loki log aggregation, Grafana dashboards.
- **CI/CD**: GitHub Actions for lint/test, container builds, and integration tests with ephemeral environments.
- **Secrets**: Managed via `.env` files locally and secret managers in production.

## Future Enhancements
- Adaptive pacing adjustments using reinforcement learning signals.
- Collaborative classroom mode with multiple students in shared sessions.
- Parent mobile app with push notifications.
- Offline-first mobile support for low-connectivity regions.
