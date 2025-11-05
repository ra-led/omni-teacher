"""FastAPI entrypoint sketch for the Omni Teacher backend.

This file illustrates the high-level API surfaces required for the
kid-friendly teacher application powered by LLM/VLM agents.
Implementation details (database models, orchestrator wiring, etc.)
would be filled in during development.
"""

from fastapi import FastAPI, WebSocket

app = FastAPI(title="Omni Teacher API", version="0.1.0")


@app.get("/health", tags=["meta"])
async def health_check() -> dict[str, str]:
    """Lightweight readiness probe used by docker-compose and k8s."""

    return {"status": "ok"}


@app.post("/programs/{topic_id}/diagnostic", tags=["programs"])
async def create_diagnostic_program(topic_id: str) -> dict[str, str]:
    """Stub endpoint: kick off quiz generation for the selected topic."""

    # In production, this would enqueue a task for the quiz generator
    # worker and immediately respond with a tracking identifier.
    return {"topic_id": topic_id, "status": "pending"}


@app.websocket("/ws/chat/{session_id}")
async def chat_socket(websocket: WebSocket, session_id: str) -> None:
    """Placeholder WebSocket handler for real-time lesson chats."""

    await websocket.accept()
    await websocket.send_json({
        "role": "assistant",
        "content": "Welcome to Omni Teacher! This is a placeholder chat pipeline.",
    })
    await websocket.close()
