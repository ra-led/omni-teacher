'use client';

import React from 'react';

import { MarkdownRenderer } from './components/MarkdownRenderer';

const DEFAULT_BROWSER_API_BASE = 'http://localhost:8000';
const DEFAULT_SERVER_API_BASE = 'http://backend:8000';
const DEFAULT_BROWSER_WS_BASE = 'ws://localhost:8000';

const resolveApiBase = () => {
  if (typeof window === 'undefined') {
    return (
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      process.env.API_BASE_URL ??
      DEFAULT_SERVER_API_BASE
    );
  }
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_BROWSER_API_BASE;
};

const resolveWebsocketBase = () => {
  if (typeof window === 'undefined') {
    return (
      process.env.NEXT_PUBLIC_WS_BASE_URL ??
      process.env.WS_BASE_URL ??
      DEFAULT_BROWSER_WS_BASE
    );
  }
  return process.env.NEXT_PUBLIC_WS_BASE_URL ?? DEFAULT_BROWSER_WS_BASE;
};

const API_BASE = resolveApiBase();
const WS_BASE = resolveWebsocketBase();

interface StudentResponse {
  id: string;
  display_name: string;
  age?: number | null;
  grade?: string | null;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface ProgramCatalogEntry {
  id: string;
  title: string;
  summary?: string | null;
  status: string;
  skill_profile?: string | null;
  created_at: string;
  updated_at: string;
}

interface LessonAttemptResponse {
  id: string;
  status: string;
  reflection_positive?: string | null;
  reflection_negative?: string | null;
  answers: Record<string, unknown>;
  created_at: string;
}

interface LessonResponse {
  id: string;
  chapter?: string | null;
  order_index: number;
  title: string;
  content_markdown: string;
  resources?: Array<Record<string, unknown>> | null;
  attempts?: LessonAttemptResponse[];
}

interface LearningProgramResponse {
  id: string;
  student_id: string;
  title: string;
  summary?: string | null;
  topic_prompt: string;
  status: string;
  skill_profile?: string | null;
  context?: Record<string, unknown> | null;
  lessons: LessonResponse[];
  created_at: string;
  updated_at: string;
}

interface ProgressSnapshot {
  student: StudentResponse;
  completed_lessons: number;
  in_progress_lessons: number;
  total_programs: number;
  badges: string[];
}

interface ChatMessageOut {
  id: string;
  sender: 'student' | 'assistant';
  content_type: string;
  text?: string | null;
  audio_url?: string | null;
  image_url?: string | null;
  render_formats: string[];
  annotations?: Record<string, unknown> | null;
  created_at: string;
}

interface ChatSessionSnapshot {
  id: string;
  student_id: string;
  program_id?: string | null;
  title: string;
  tts_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface ChatSocketHistoryEvent {
  type: 'history';
  messages: ChatMessageOut[];
}

interface ChatSocketMessageEvent {
  type: 'student_message' | 'assistant_message';
  message: ChatMessageOut;
}

interface ChatSocketErrorEvent {
  type: 'error';
  detail: unknown;
}

type ChatSocketEvent =
  | ChatSocketHistoryEvent
  | ChatSocketMessageEvent
  | ChatSocketErrorEvent;

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const url = new URL(path, API_BASE);
  const response = await fetch(url.toString(), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function HomePage() {
  const [student, setStudent] = React.useState<StudentResponse | null>(null);
  const [catalog, setCatalog] = React.useState<ProgramCatalogEntry[]>([]);
  const [selectedProgram, setSelectedProgram] = React.useState<LearningProgramResponse | null>(null);
  const [progress, setProgress] = React.useState<ProgressSnapshot | null>(null);
  const [chatSession, setChatSession] = React.useState<ChatSessionSnapshot | null>(null);
  const [messages, setMessages] = React.useState<ChatMessageOut[]>([]);
  const [websocket, setWebsocket] = React.useState<WebSocket | null>(null);
  const [isConnectingChat, setIsConnectingChat] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [studentForm, setStudentForm] = React.useState({
    display_name: '',
    age: '' as string | number,
    grade: '',
  });

  const [topicForm, setTopicForm] = React.useState({
    topic: '',
    learning_goal: '',
    traits: '',
  });

  const [chatInput, setChatInput] = React.useState({
    text: '',
    image_url: '',
    generate_voice: false,
  });

  React.useEffect(() => {
    return () => {
      websocket?.close();
    };
  }, [websocket]);

  const refreshCatalog = React.useCallback(async (studentId: string) => {
    const result = await apiRequest<ProgramCatalogEntry[]>(`/api/students/${studentId}/catalog`);
    setCatalog(result);
  }, []);

  const refreshProgress = React.useCallback(async (studentId: string) => {
    const result = await apiRequest<ProgressSnapshot>(`/api/students/${studentId}/progress`);
    setProgress(result);
  }, []);

  const handleRegisterStudent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setError(null);
      const payload = {
        display_name: studentForm.display_name.trim(),
        age: studentForm.age ? Number(studentForm.age) : undefined,
        grade: studentForm.grade || undefined,
        preferences: {},
      };
      const created = await apiRequest<StudentResponse>('/api/students', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setStudent(created);
      setSelectedProgram(null);
      setChatSession(null);
      setMessages([]);
      await refreshCatalog(created.id);
      await refreshProgress(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to register student');
    }
  };

  const handleAddTopic = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!student) return;
    try {
      setError(null);
      const payload = {
        topic: topicForm.topic.trim(),
        learning_goal: topicForm.learning_goal.trim() || undefined,
        student_traits: topicForm.traits
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      };
      const program = await apiRequest<LearningProgramResponse>(
        `/api/students/${student.id}/topics`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      setSelectedProgram(program);
      await refreshCatalog(student.id);
      setTopicForm({ topic: '', learning_goal: '', traits: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add topic');
    }
  };

  const handleSelectProgram = async (programId: string) => {
    try {
      setError(null);
      const program = await apiRequest<LearningProgramResponse>(`/api/programs/${programId}`);
      setSelectedProgram(program);
      if (student) {
        await refreshProgress(student.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load program');
    }
  };

  const handleCompleteLesson = async (
    lessonId: string,
    status: 'completed' | 'in_progress' | 'needs_help' | 'skipped',
  ) => {
    if (!student) return;
    try {
      setError(null);
      await apiRequest(`/api/lessons/${lessonId}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          student_id: student.id,
          status,
          answers: {},
        }),
      });
      if (selectedProgram) {
        await handleSelectProgram(selectedProgram.id);
      }
      await refreshProgress(student.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to record lesson');
    }
  };

  const handleStartChat = async (ttsEnabled: boolean) => {
    if (!student) return;
    try {
      setError(null);
      setIsConnectingChat(true);
      const session = await apiRequest<ChatSessionSnapshot>('/api/chat/sessions', {
        method: 'POST',
        body: JSON.stringify({
          student_id: student.id,
          program_id: selectedProgram?.id,
          tts_enabled: ttsEnabled,
          title: selectedProgram ? `${selectedProgram.title} Tutoring` : 'Omni Teacher Chat',
        }),
      });
      setChatSession(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start chat');
    } finally {
      setIsConnectingChat(false);
    }
  };

  React.useEffect(() => {
    if (!chatSession || !student) {
      setMessages([]);
      setWebsocket((prev) => {
        prev?.close();
        return null;
      });
      return;
    }

    const url = new URL(`${WS_BASE}/ws/chat/${chatSession.id}`);
    url.searchParams.set('student_id', student.id);
    if (selectedProgram) {
      url.searchParams.set('program_id', selectedProgram.id);
    }
    url.searchParams.set('tts', String(chatSession.tts_enabled));

    const socket = new WebSocket(url);
    setWebsocket(socket);

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data) as ChatSocketEvent;
      if (data.type === 'history') {
        setMessages(data.messages);
      } else if (data.type === 'student_message' || data.type === 'assistant_message') {
        setMessages((prev) => [...prev, data.message]);
      } else if (data.type === 'error') {
        setError('Chat error: unable to process message');
      }
    };

    socket.onerror = () => {
      setError('Chat connection failed');
    };

    socket.onclose = () => {
      setWebsocket(null);
    };

    return () => {
      socket.close();
    };
  }, [chatSession, student, selectedProgram]);

  const handleSendChat = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      setError('Chat is not connected yet');
      return;
    }
    if (!chatInput.text && !chatInput.image_url) {
      setError('Please provide a message or an image URL');
      return;
    }
    const payload = {
      content_type: chatInput.image_url ? 'image' : 'text',
      text: chatInput.image_url ? undefined : chatInput.text,
      image_url: chatInput.image_url || undefined,
      generate_voice: chatInput.generate_voice,
    };
    websocket.send(JSON.stringify(payload));
    setChatInput({ text: '', image_url: '', generate_voice: false });
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '0.5rem', color: '#1d4ed8' }}>Omni Teacher Studio</h1>
        <p style={{ color: '#475569', fontSize: '1.1rem' }}>
          Generate personalised learning adventures, track progress, and chat with an Omni-powered tutor.
        </p>
      </header>

      {error && (
        <div className="badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      <section className="form-section">
        <h2>Create or Load a Learner Profile</h2>
        <form className="form-grid two" onSubmit={handleRegisterStudent}>
          <label>
            Learner name
            <input
              required
              value={studentForm.display_name}
              onChange={(event) =>
                setStudentForm((prev) => ({ ...prev, display_name: event.target.value }))
              }
              placeholder="Avery, Jordan, ..."
            />
          </label>
          <label>
            Age
            <input
              type="number"
              min={5}
              max={16}
              value={studentForm.age}
              onChange={(event) =>
                setStudentForm((prev) => ({ ...prev, age: event.target.value }))
              }
              placeholder="10"
            />
          </label>
          <label>
            Grade
            <input
              value={studentForm.grade}
              onChange={(event) =>
                setStudentForm((prev) => ({ ...prev, grade: event.target.value }))
              }
              placeholder="4th"
            />
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start' }}>
            <button type="submit" className="primary-button">
              Save learner
            </button>
          </div>
        </form>
        {student && (
          <p style={{ marginTop: '1rem', color: '#1e293b' }}>
            Active learner <strong>{student.display_name}</strong> (ID: {student.id})
          </p>
        )}
      </section>

      {student && (
        <section className="form-section">
          <h2>Generate a New Learning Program</h2>
          <form className="form-grid" onSubmit={handleAddTopic}>
            <label>
              Topic idea from learner
              <input
                required
                value={topicForm.topic}
                onChange={(event) => setTopicForm((prev) => ({ ...prev, topic: event.target.value }))}
                placeholder="Ancient Egypt, Fractions, Space robots..."
              />
            </label>
            <label>
              Learning goal (optional)
              <input
                value={topicForm.learning_goal}
                onChange={(event) =>
                  setTopicForm((prev) => ({ ...prev, learning_goal: event.target.value }))
                }
                placeholder="Feel confident explaining pyramids"
              />
            </label>
            <label>
              Learner traits (comma separated)
              <input
                value={topicForm.traits}
                onChange={(event) => setTopicForm((prev) => ({ ...prev, traits: event.target.value }))}
                placeholder="visual, loves drawing, curious"
              />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <button type="submit" className="primary-button">
                Generate diagnostic quiz
              </button>
            </div>
          </form>
        </section>
      )}

      {student && (
        <section className="form-section">
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Learning Adventures Library</h2>
            <button className="secondary-button" onClick={() => refreshCatalog(student.id)}>
              Refresh catalog
            </button>
          </header>
          <div className="catalog-grid">
            {catalog.map((entry) => (
              <article key={entry.id} className="catalog-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>{entry.title}</h3>
                  <span className="badge">{entry.status}</span>
                </div>
                {entry.summary && <p style={{ margin: 0 }}>{entry.summary}</p>}
                {entry.skill_profile && (
                  <p style={{ color: '#4c1d95', margin: 0 }}>Focus: {entry.skill_profile}</p>
                )}
                <small style={{ color: '#64748b' }}>Updated {formatDate(entry.updated_at)}</small>
                <button className="secondary-button" onClick={() => handleSelectProgram(entry.id)}>
                  Open adventure
                </button>
              </article>
            ))}
            {catalog.length === 0 && <p>No programs yet. Add a topic to get started!</p>}
          </div>
        </section>
      )}

      {selectedProgram && (
        <section className="form-section" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <header style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h2>{selectedProgram.title}</h2>
            <div className="progress-pills">
              <span className="progress-pill">Status: {selectedProgram.status}</span>
              {selectedProgram.skill_profile && (
                <span className="progress-pill">Skill focus: {selectedProgram.skill_profile}</span>
              )}
            </div>
            {selectedProgram.summary && <p>{selectedProgram.summary}</p>}
          </header>

          <div style={{ display: 'grid', gap: '1rem' }}>
            {selectedProgram.lessons.map((lesson) => (
              <article key={lesson.id} className="lesson-card">
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.5rem 0' }}>{lesson.title}</h3>
                    {lesson.chapter && <small style={{ color: '#6366f1' }}>Chapter: {lesson.chapter}</small>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="secondary-button" onClick={() => handleCompleteLesson(lesson.id, 'completed')}>
                      Mark complete
                    </button>
                    <button className="secondary-button" onClick={() => handleCompleteLesson(lesson.id, 'needs_help')}>
                      Needs help
                    </button>
                  </div>
                </header>
                <MarkdownRenderer content={lesson.content_markdown} />
                {lesson.attempts && lesson.attempts.length > 0 && (
                  <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(99,102,241,0.15)', paddingTop: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.75rem 0' }}>Lesson reflections</h4>
                    {lesson.attempts.map((attempt) => (
                      <div key={attempt.id} style={{ marginBottom: '0.75rem', background: 'rgba(79, 70, 229, 0.08)', padding: '0.75rem', borderRadius: '0.75rem' }}>
                        <strong>{attempt.status}</strong> · {formatDate(attempt.created_at)}
                        {attempt.reflection_positive && <p>👍 {attempt.reflection_positive}</p>}
                        {attempt.reflection_negative && <p>✨ Next: {attempt.reflection_negative}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {student && progress && (
        <section className="form-section">
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Progress snapshot</h2>
            <button className="secondary-button" onClick={() => refreshProgress(student.id)}>
              Refresh progress
            </button>
          </header>
          <div className="progress-pills">
            <span className="progress-pill">Completed lessons: {progress.completed_lessons}</span>
            <span className="progress-pill">In progress: {progress.in_progress_lessons}</span>
            <span className="progress-pill">Programs: {progress.total_programs}</span>
          </div>
          {progress.badges.length > 0 && (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {progress.badges.map((badge) => (
                <span key={badge} className="badge">
                  {badge}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {student && (
        <section className="chat-container">
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0 }}>Tutor chat</h2>
              <p style={{ margin: 0, color: '#475569' }}>
                Talk with Omni Teacher, share images, and request playful voice responses.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                className="secondary-button"
                onClick={() => handleStartChat(false)}
                disabled={isConnectingChat}
              >
                Text chat
              </button>
              <button
                className="primary-button"
                onClick={() => handleStartChat(true)}
                disabled={isConnectingChat}
              >
                Chat with voice
              </button>
            </div>
          </header>

          <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {messages.map((message) => (
              <article key={message.id} className={`chat-message ${message.sender}`}>
                <header style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{message.sender === 'assistant' ? 'Omni Teacher' : student.display_name}</strong>
                  <small>{formatDate(message.created_at)}</small>
                </header>
                {message.text && <MarkdownRenderer content={message.text} />}
                {message.image_url && (
                  <img
                    src={message.image_url}
                    alt="Shared by learner"
                    style={{ maxWidth: '100%', borderRadius: '0.75rem' }}
                  />
                )}
                {message.audio_url && (
                  <audio controls src={message.audio_url} />
                )}
              </article>
            ))}
            {messages.length === 0 && <p>No messages yet. Start a chat above!</p>}
          </div>

          <form className="chat-input" onSubmit={handleSendChat} style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <textarea
                placeholder="Ask a question, share how the lesson felt..."
                value={chatInput.text}
                onChange={(event) => setChatInput((prev) => ({ ...prev, text: event.target.value }))}
              />
              <input
                type="url"
                placeholder="Optional image URL"
                value={chatInput.image_url}
                onChange={(event) => setChatInput((prev) => ({ ...prev, image_url: event.target.value }))}
              />
              <div className="chat-controls">
                <label>
                  <input
                    type="checkbox"
                    checked={chatInput.generate_voice}
                    onChange={(event) =>
                      setChatInput((prev) => ({ ...prev, generate_voice: event.target.checked }))
                    }
                  />
                  Request playful voice reply
                </label>
              </div>
            </div>
            <button type="submit" className="primary-button" disabled={!chatSession}>
              Send message
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
