'use client';

import React from 'react';

import { MarkdownRenderer } from './components/MarkdownRenderer';

const DEFAULT_SERVER_API_BASE = 'http://backend:8000';

const resolveApiBase = () => {
  if (typeof window === 'undefined') {
    return (
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      process.env.API_BASE_URL ??
      DEFAULT_SERVER_API_BASE
    );
  }
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  const { protocol, hostname } = window.location;
  const port = process.env.NEXT_PUBLIC_API_PORT ?? '8000';
  return `${protocol}//${hostname}:${port}`;
};

const resolveWebsocketBase = () => {
  if (typeof window === 'undefined') {
    return (
      process.env.NEXT_PUBLIC_WS_BASE_URL ??
      process.env.WS_BASE_URL ??
      resolveApiBase().replace('http', 'ws')
    );
  }
  if (process.env.NEXT_PUBLIC_WS_BASE_URL) {
    return process.env.NEXT_PUBLIC_WS_BASE_URL;
  }
  const { protocol, hostname } = window.location;
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  const port = process.env.NEXT_PUBLIC_WS_PORT ?? process.env.NEXT_PUBLIC_API_PORT ?? '8000';
  return `${wsProtocol}//${hostname}:${port}`;
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
  teacher_notes?: string | null;
  answers: Record<string, unknown>;
  score?: number | null;
  stars?: number | null;
  mastery_summary?: string | null;
  created_at: string;
}

interface LessonResource {
  type: string;
  label: string;
  url?: string | null;
}

interface LessonPlanStep {
  title: string;
  description: string;
  duration_minutes?: number | null;
}

interface LessonPracticePrompt {
  prompt: string;
  modality?: string | null;
}

interface LessonAssessment {
  prompt: string;
  success_criteria?: string[] | null;
  exemplar_answer?: string | null;
  extension_idea?: string | null;
  follow_up_questions?: string[] | null;
}

interface LessonCompletionResponse {
  lesson: LessonResponse;
  attempt: LessonAttemptResponse;
}

interface LessonResponse {
  id: string;
  chapter?: string | null;
  order_index: number;
  title: string;
  content_markdown: string;
  objectives: string[];
  method_plan: LessonPlanStep[];
  practice_prompts: LessonPracticePrompt[];
  assessment?: LessonAssessment | null;
  estimated_minutes?: number | null;
  resources?: LessonResource[] | null;
  attempts?: LessonAttemptResponse[];
  unlocked: boolean;
  progress_state: 'locked' | 'available' | 'completed';
  mastery_stars: number;
  latest_attempt?: LessonAttemptResponse | null;
}

interface ProgramContext extends Record<string, unknown> {
  diagnostic_notes?: string | string[];
  analysis?: Record<string, unknown>;
  chapters?: unknown;
}

interface LearningProgramResponse {
  id: string;
  student_id: string;
  title: string;
  summary?: string | null;
  topic_prompt: string;
  status: string;
  skill_profile?: string | null;
  context?: ProgramContext | null;
  quiz?: DiagnosticQuizResponse | null;
  lessons: LessonResponse[];
  created_at: string;
  updated_at: string;
  total_mastery_stars: number;
}

interface QuizQuestion {
  id: string;
  prompt: string;
  answer_type: 'free_form' | 'multiple_choice' | 'multi_select';
  choices?: string[] | null;
  hints?: string[] | null;
}

interface DiagnosticQuizResponse {
  id: string;
  instructions?: string | null;
  questions: QuizQuestion[];
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
    let message: string | undefined;
    try {
      const data = await response.json();
      message = typeof data.detail === 'string' ? data.detail : JSON.stringify(data);
    } catch (error) {
      message = await response.text();
    }
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

function renderStars(count: number) {
  const clamped = Math.max(0, Math.min(3, count));
  return '⭐'.repeat(clamped) + '☆'.repeat(3 - clamped);
}

function formatDiagnosticNotes(notes: unknown): string | null {
  if (notes == null) {
    return null;
  }
  if (Array.isArray(notes)) {
    const flattened = notes.map((item) => String(item).trim()).filter(Boolean);
    return flattened.length > 0 ? flattened.join(' • ') : null;
  }
  const value = String(notes).trim();
  return value.length > 0 ? value : null;
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
  const [notice, setNotice] = React.useState<string | null>(null);
  const [quizResponses, setQuizResponses] = React.useState<Record<string, string | string[]>>({});
  const [activeLessonId, setActiveLessonId] = React.useState<string | null>(null);
  const [lessonResponses, setLessonResponses] = React.useState<Record<string, string>>({});
  const [lessonSubmitting, setLessonSubmitting] = React.useState<Record<string, boolean>>({});

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

  const diagnosticNotes = formatDiagnosticNotes(selectedProgram?.context?.diagnostic_notes);

  const [chatInput, setChatInput] = React.useState({
    text: '',
    image_url: '',
    generate_voice: false,
  });

  const selectedLesson = React.useMemo(() => {
    if (!selectedProgram) return null;
    return selectedProgram.lessons.find((lesson) => lesson.id === activeLessonId) ?? null;
  }, [selectedProgram, activeLessonId]);

  React.useEffect(() => {
    return () => {
      websocket?.close();
    };
  }, [websocket]);

  React.useEffect(() => {
    if (!selectedProgram) {
      setActiveLessonId(null);
      setLessonResponses({});
      setNotice(null);
      return;
    }

    setLessonResponses(() => {
      const next: Record<string, string> = {};
      selectedProgram.lessons.forEach((lesson) => {
        const latestAnswers = lesson.latest_attempt?.answers ?? {};
        const maybeResponse = (latestAnswers as Record<string, unknown>)['mastery_response'];
        next[lesson.id] = typeof maybeResponse === 'string' ? maybeResponse : '';
      });
      return next;
    });

    setNotice(null);

    setActiveLessonId((previous) => {
      if (previous && selectedProgram.lessons.some((lesson) => lesson.id === previous)) {
        return previous;
      }
      const firstUnlocked = selectedProgram.lessons.find((lesson) => lesson.unlocked);
      return firstUnlocked?.id ?? selectedProgram.lessons[0]?.id ?? null;
    });
  }, [selectedProgram?.id]);

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
      setNotice(null);
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
      setNotice(null);
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

  React.useEffect(() => {
    if (!selectedProgram?.quiz) {
      setQuizResponses({});
      return;
    }
    const initial: Record<string, string | string[]> = {};
    selectedProgram.quiz.questions.forEach((question) => {
      if (question.answer_type === 'multi_select') {
        initial[question.id] = [];
      } else {
        initial[question.id] = '';
      }
    });
    setQuizResponses(initial);
  }, [selectedProgram?.id, selectedProgram?.quiz?.id]);

  const handleQuizAnswerChange = (
    question: QuizQuestion,
    value: string,
    checked?: boolean,
  ) => {
    setQuizResponses((prev) => {
      const next = { ...prev };
      if (question.answer_type === 'multi_select') {
        const existing = Array.isArray(next[question.id]) ? [...(next[question.id] as string[])] : [];
        if (checked) {
          if (!existing.includes(value)) {
            existing.push(value);
          }
        } else {
          next[question.id] = existing.filter((item) => item !== value);
          return next;
        }
        next[question.id] = existing;
      } else {
        next[question.id] = value;
      }
      return next;
    });
  };

  const handleSubmitDiagnostic = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProgram || !student) return;
    try {
      setError(null);
      setNotice(null);
      const payload = {
        answers: quizResponses,
      };
      const result = await apiRequest<{ program: LearningProgramResponse }>(
        `/api/programs/${selectedProgram.id}/diagnostic/submit`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      setSelectedProgram(result.program);
      await refreshCatalog(student.id);
      await refreshProgress(student.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit diagnostic quiz');
    }
  };

  const handleLessonResponseChange = (lessonId: string, value: string) => {
    setLessonResponses((prev) => ({ ...prev, [lessonId]: value }));
  };

  const handleSubmitLessonMastery = async (
    lesson: LessonResponse,
    intent: 'completed' | 'needs_help',
  ) => {
    if (!student) return;
    const programId = selectedProgram?.id;
    const responseText = (lessonResponses[lesson.id] ?? '').trim();
    if (intent === 'completed' && responseText.length === 0) {
      setError('Share what you learned before submitting for stars!');
      return;
    }
    try {
      setError(null);
      setNotice(null);
      setLessonSubmitting((prev) => ({ ...prev, [lesson.id]: true }));
      const payload = {
        student_id: student.id,
        status: intent,
        answers: {
          mastery_response: responseText,
          assessment_prompt: lesson.assessment?.prompt,
        },
      };
      const result = await apiRequest<LessonCompletionResponse>(`/api/lessons/${lesson.id}/complete`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const awardedStars = typeof result.attempt.stars === 'number' ? result.attempt.stars : 0;
      const celebration =
        result.attempt.mastery_summary ??
        result.attempt.reflection_positive ??
        'Lesson reflection saved!';
      const prefix = awardedStars > 0 ? `🎉 ${renderStars(awardedStars)}` : '✅';
      setNotice(`${prefix} ${lesson.title}: ${celebration}`);
      if (programId) {
        await handleSelectProgram(programId);
      }
      await refreshProgress(student.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to record lesson');
    } finally {
      setLessonSubmitting((prev) => ({ ...prev, [lesson.id]: false }));
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

      {notice && (
        <div className="badge" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#166534' }}>
          {notice}
        </div>
      )}

      <section className="form-section">
        <h2>Create or Load a Learner Profile</h2>
        <form className="form-grid two" onSubmit={handleRegisterStudent}>
          <label>
            Learner name
            <input
              name="learner-name"
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
              name="learner-age"
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
              name="learner-grade"
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
                name="topic"
                required
                value={topicForm.topic}
                onChange={(event) => setTopicForm((prev) => ({ ...prev, topic: event.target.value }))}
                placeholder="Ancient Egypt, Fractions, Space robots..."
              />
            </label>
            <label>
              Learning goal (optional)
              <input
                name="learning-goal"
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
                name="learner-traits"
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
              {selectedProgram.total_mastery_stars > 0 && (
                <span className="progress-pill">Stars earned: {selectedProgram.total_mastery_stars}</span>
              )}
            </div>
            {selectedProgram.summary && <p>{selectedProgram.summary}</p>}
            {diagnosticNotes && (
              <div className="badge" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#1d4ed8' }}>
                {diagnosticNotes}
              </div>
            )}
          </header>

          {selectedProgram.status === 'awaiting_diagnostic' && selectedProgram.quiz && (
            <form
              onSubmit={handleSubmitDiagnostic}
              className="lesson-card"
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              <header>
                <h3 style={{ margin: '0 0 0.75rem 0' }}>Diagnostic quiz</h3>
                {selectedProgram.quiz.instructions && <p>{selectedProgram.quiz.instructions}</p>}
              </header>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {selectedProgram.quiz.questions.map((question) => (
                  <article key={question.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <strong>{question.prompt}</strong>
                      {question.hints && question.hints.length > 0 && (
                        <p style={{ margin: '0.25rem 0 0 0', color: '#475569' }}>
                          Hints: {question.hints.join(', ')}
                        </p>
                      )}
                    </div>
                    {question.answer_type === 'free_form' && (
                      <textarea
                        required
                        value={(quizResponses[question.id] as string) ?? ''}
                        onChange={(event) => handleQuizAnswerChange(question, event.target.value)}
                        placeholder="Type your answer"
                      />
                    )}
                    {question.answer_type === 'multiple_choice' && question.choices && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {question.choices.map((choice) => (
                          <label key={choice} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                              type="radio"
                              name={`quiz-${question.id}`}
                              value={choice}
                              checked={quizResponses[question.id] === choice}
                              onChange={(event) => handleQuizAnswerChange(question, event.target.value)}
                              required
                            />
                            <span>{choice}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {question.answer_type === 'multi_select' && question.choices && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {question.choices.map((choice) => {
                          const selectedValues = Array.isArray(quizResponses[question.id])
                            ? (quizResponses[question.id] as string[])
                            : [];
                          const checked = selectedValues.includes(choice);
                          return (
                            <label key={choice} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <input
                                type="checkbox"
                                value={choice}
                                checked={checked}
                                onChange={(event) =>
                                  handleQuizAnswerChange(question, event.target.value, event.target.checked)
                                }
                              />
                              <span>{choice}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {!question.choices && question.answer_type !== 'free_form' && (
                      <textarea
                        value={(quizResponses[question.id] as string) ?? ''}
                        onChange={(event) => handleQuizAnswerChange(question, event.target.value)}
                        placeholder="Type your answer"
                      />
                    )}
                  </article>
                ))}
              </div>
              <button type="submit" className="primary-button">
                Submit answers
              </button>
            </form>
          )}

          {selectedProgram.lessons.length === 0 ? (
            <p style={{ margin: 0 }}>Lessons are being prepared. Check back soon!</p>
          ) : (
            <div className="lesson-layout">
              <aside className="lesson-list">
                {selectedProgram.lessons.map((lesson) => {
                  const isActive = lesson.id === activeLessonId;
                  const isLocked = lesson.progress_state === 'locked';
                  const itemClass = [
                    'lesson-item',
                    isActive ? 'lesson-item--active' : '',
                    isLocked ? 'lesson-item--locked' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <button
                      key={lesson.id}
                      type="button"
                      className={itemClass}
                      onClick={() => {
                        if (!isLocked) {
                          setActiveLessonId(lesson.id);
                        }
                      }}
                      disabled={isLocked}
                    >
                      <div className="lesson-item-text">
                        <strong>Lesson {lesson.order_index}</strong>
                        <span>{lesson.title}</span>
                        {lesson.chapter && <small>Chapter: {lesson.chapter}</small>}
                      </div>
                      <div className="lesson-item-meta">
                        <span className="badge">{lesson.progress_state}</span>
                        <span className="star-meter">{renderStars(lesson.mastery_stars)}</span>
                      </div>
                    </button>
                  );
                })}
              </aside>
              <article className="lesson-detail">
                {selectedLesson ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <header className="lesson-detail-header">
                      <div>
                        <h3>{selectedLesson.title}</h3>
                        <div className="lesson-detail-meta">
                          <span className="badge">{selectedLesson.progress_state}</span>
                          <span className="badge">{renderStars(selectedLesson.mastery_stars)}</span>
                          {typeof selectedLesson.estimated_minutes === 'number' && (
                            <span className="badge">~{selectedLesson.estimated_minutes} min</span>
                          )}
                        </div>
                      </div>
                    </header>
                    {!selectedLesson.unlocked ? (
                      <div className="lesson-locked-banner">
                        Complete the previous lesson to unlock this adventure.
                      </div>
                    ) : (
                      <>
                        <section className="lesson-section">
                          <h4>Objectives</h4>
                          <ul>
                            {selectedLesson.objectives.map((objective) => (
                              <li key={objective}>{objective}</li>
                            ))}
                          </ul>
                        </section>
                        <section className="lesson-section">
                          <h4>Lesson story</h4>
                          <MarkdownRenderer content={selectedLesson.content_markdown} />
                        </section>
                        <section className="lesson-section">
                          <h4>Teaching plan</h4>
                          <ol className="lesson-plan">
                            {selectedLesson.method_plan.map((step, index) => (
                              <li key={`${step.title}-${index}`}>
                                <div>
                                  <strong>{step.title}</strong>
                                  {typeof step.duration_minutes === 'number' && (
                                    <small> · {step.duration_minutes} min</small>
                                  )}
                                </div>
                                <p>{step.description}</p>
                              </li>
                            ))}
                          </ol>
                        </section>
                        <section className="lesson-section">
                          <h4>Practice ideas</h4>
                          <ul className="practice-list">
                            {selectedLesson.practice_prompts.map((prompt) => (
                              <li key={prompt.prompt}>
                                <span>{prompt.prompt}</span>
                                {prompt.modality && <small> · {prompt.modality}</small>}
                              </li>
                            ))}
                          </ul>
                        </section>
                        {selectedLesson.resources && selectedLesson.resources.length > 0 && (
                          <section className="lesson-section">
                            <h4>Helpful resources</h4>
                            <ul className="resource-list">
                              {selectedLesson.resources.map((resource, index) => {
                                const label = resource.label || `Resource ${index + 1}`;
                                const url = resource.url ?? undefined;
                                return (
                                  <li key={`${label}-${index}`}>
                                    {url ? (
                                      <a href={url} target="_blank" rel="noreferrer">
                                        {label}
                                      </a>
                                    ) : (
                                      <span>{label}</span>
                                    )}
                                    {resource.type && <small> · {String(resource.type)}</small>}
                                  </li>
                                );
                              })}
                            </ul>
                          </section>
                        )}
                        {selectedLesson.assessment && (
                          <section className="lesson-section">
                            <h4>Mastery check prompt</h4>
                            <p>{selectedLesson.assessment.prompt}</p>
                            {selectedLesson.assessment.success_criteria && (
                              <ul>
                                {selectedLesson.assessment.success_criteria.map((criteria) => (
                                  <li key={criteria}>{criteria}</li>
                                ))}
                              </ul>
                            )}
                            {selectedLesson.assessment.extension_idea && (
                              <p style={{ color: '#4338ca' }}>
                                Try next: {selectedLesson.assessment.extension_idea}
                              </p>
                            )}
                          </section>
                        )}
                        <section className="lesson-section">
                          <h4>Show what you learned</h4>
                          <form
                            onSubmit={(event) => {
                              event.preventDefault();
                              handleSubmitLessonMastery(selectedLesson, 'completed');
                            }}
                            className="lesson-mastery-form"
                          >
                            <textarea
                              value={lessonResponses[selectedLesson.id] ?? ''}
                              onChange={(event) => handleLessonResponseChange(selectedLesson.id, event.target.value)}
                              placeholder="Tell Omni Teacher what you discovered!"
                              disabled={!selectedLesson.unlocked || lessonSubmitting[selectedLesson.id]}
                              required
                            />
                            <div className="lesson-actions">
                              <button
                                type="submit"
                                className="primary-button"
                                disabled={!selectedLesson.unlocked || lessonSubmitting[selectedLesson.id]}
                              >
                                {lessonSubmitting[selectedLesson.id] ? 'Checking…' : 'Submit for stars'}
                              </button>
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => handleSubmitLessonMastery(selectedLesson, 'needs_help')}
                                disabled={!selectedLesson.unlocked || lessonSubmitting[selectedLesson.id]}
                              >
                                Needs help
                              </button>
                            </div>
                          </form>
                        </section>
                      </>
                    )}
                    {selectedLesson.latest_attempt && (
                      <section className="lesson-section">
                        <h4>Latest mastery feedback</h4>
                        <div className="lesson-feedback">
                          <div>
                            <strong>{renderStars(selectedLesson.latest_attempt.stars ?? 0)}</strong>
                            <small> · {formatDate(selectedLesson.latest_attempt.created_at)}</small>
                          </div>
                          {selectedLesson.latest_attempt.mastery_summary && (
                            <p>{selectedLesson.latest_attempt.mastery_summary}</p>
                          )}
                          {selectedLesson.latest_attempt.reflection_positive && (
                            <p>👍 {selectedLesson.latest_attempt.reflection_positive}</p>
                          )}
                          {selectedLesson.latest_attempt.reflection_negative && (
                            <p>✨ Next: {selectedLesson.latest_attempt.reflection_negative}</p>
                          )}
                        </div>
                      </section>
                    )}
                  </div>
                ) : (
                  <p>Select an unlocked lesson to view the plan.</p>
                )}
              </article>
            </div>
          )}
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
                name="chat-message"
                placeholder="Ask a question, share how the lesson felt..."
                value={chatInput.text}
                onChange={(event) => setChatInput((prev) => ({ ...prev, text: event.target.value }))}
              />
              <input
                name="chat-image-url"
                type="url"
                placeholder="Optional image URL"
                value={chatInput.image_url}
                onChange={(event) => setChatInput((prev) => ({ ...prev, image_url: event.target.value }))}
              />
              <div className="chat-controls">
                <label>
                  <input
                    name="chat-voice"
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
