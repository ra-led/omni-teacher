'use client';

import React from 'react';

import { MarkdownRenderer } from '../components/MarkdownRenderer';

const DEFAULT_SERVER_API_BASE = 'http://backend:8000';

const isAbsoluteUrl = (value: string) => /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value);

const normalizeHttpBase = (rawBase: string, origin: string) => {
  if (isAbsoluteUrl(rawBase)) {
    return rawBase;
  }
  return new URL(rawBase.startsWith('/') ? rawBase : `/${rawBase}`, origin).toString();
};

const normalizeWebsocketBase = (rawBase: string, origin: string) => {
  if (/^wss?:\/\//i.test(rawBase)) {
    return rawBase;
  }
  if (/^https?:\/\//i.test(rawBase)) {
    const converted = new URL(rawBase);
    converted.protocol = converted.protocol === 'https:' ? 'wss:' : 'ws:';
    return converted.toString();
  }
  const originUrl = new URL(origin);
  originUrl.protocol = originUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return new URL(rawBase.startsWith('/') ? rawBase : `/${rawBase}`, originUrl.toString()).toString();
};

const resolveApiBase = () => {
  if (typeof window === 'undefined') {
    return (
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      process.env.API_BASE_URL ??
      DEFAULT_SERVER_API_BASE
    );
  }
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return normalizeHttpBase(process.env.NEXT_PUBLIC_API_BASE_URL, window.location.origin);
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
    return normalizeWebsocketBase(process.env.NEXT_PUBLIC_WS_BASE_URL, window.location.origin);
  }
  const { protocol, hostname } = window.location;
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  const port = process.env.NEXT_PUBLIC_WS_PORT ?? process.env.NEXT_PUBLIC_API_PORT ?? '8000';
  return `${wsProtocol}//${hostname}:${port}`;
};

const API_BASE = resolveApiBase();
const WS_BASE = resolveWebsocketBase();
const AUTH_TOKEN_STORAGE_KEY = 'omni_teacher_auth_token';

interface StudentResponse {
  id: string;
  display_name: string;
  age?: number | null;
  grade?: string | null;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface AccountResponse {
  id: string;
  email: string;
  created_at: string;
}

interface AuthSessionResponse {
  token: string;
  account: AccountResponse;
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
  lesson_id?: string | null;
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

async function apiRequest<T>(path: string, init?: RequestInit, authToken?: string | null): Promise<T> {
  const url = new URL(path, API_BASE);
  const response = await fetch(url.toString(), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { 'X-Account-Token': authToken } : {}),
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

function normalizeChatMessages(messages: ChatMessageOut[]): ChatMessageOut[] {
  const byId = new Map<string, ChatMessageOut>();
  for (const message of messages) {
    if (!byId.has(message.id)) {
      byId.set(message.id, message);
    }
  }

  const sorted = Array.from(byId.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const deduped: ChatMessageOut[] = [];
  for (const message of sorted) {
    if (message.sender !== 'student') {
      deduped.push(message);
      continue;
    }

    const duplicateIndex = deduped.findIndex((candidate) => {
      const sameContent =
        candidate.sender === 'student' &&
        (candidate.text ?? '') === (message.text ?? '') &&
        (candidate.image_url ?? '') === (message.image_url ?? '');
      const closeInTime =
        Math.abs(new Date(candidate.created_at).getTime() - new Date(message.created_at).getTime()) < 10_000;
      return sameContent && closeInTime;
    });

    if (duplicateIndex === -1) {
      deduped.push(message);
      continue;
    }

    if (deduped[duplicateIndex].id.startsWith('optimistic-') && !message.id.startsWith('optimistic-')) {
      deduped[duplicateIndex] = message;
    }
  }

  return deduped;
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

type AppMode = 'learners' | 'programs' | 'lesson' | 'progress';

export default function HomePage() {
  const [authToken, setAuthToken] = React.useState<string | null>(null);
  const [account, setAccount] = React.useState<AccountResponse | null>(null);
  const [authMode, setAuthMode] = React.useState<'signin' | 'signup'>('signin');
  const [authForm, setAuthForm] = React.useState({ email: '', password: '' });
  const [isAuthReady, setIsAuthReady] = React.useState(false);
  const [isAuthenticating, setIsAuthenticating] = React.useState(false);
  const [student, setStudent] = React.useState<StudentResponse | null>(null);
  const [students, setStudents] = React.useState<StudentResponse[]>([]);
  const [catalog, setCatalog] = React.useState<ProgramCatalogEntry[]>([]);
  const [selectedProgram, setSelectedProgram] = React.useState<LearningProgramResponse | null>(null);
  const [progress, setProgress] = React.useState<ProgressSnapshot | null>(null);
  const [lessonChatSession, setLessonChatSession] = React.useState<ChatSessionSnapshot | null>(null);
  const [lessonChatLessonId, setLessonChatLessonId] = React.useState<string | null>(null);
  const [lessonChatMessages, setLessonChatMessages] = React.useState<ChatMessageOut[]>([]);
  const [lessonChatSocket, setLessonChatSocket] = React.useState<WebSocket | null>(null);
  const [lessonChatInput, setLessonChatInput] = React.useState({
    text: '',
    image_url: '',
    generate_voice: false,
  });
  const [isTeacherTyping, setIsTeacherTyping] = React.useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = React.useState(false);
  const [isTranscribingVoice, setIsTranscribingVoice] = React.useState(false);
  const [isConnectingLessonChat, setIsConnectingLessonChat] = React.useState(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = React.useState(false);
  const [isSubmittingDiagnostic, setIsSubmittingDiagnostic] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [quizResponses, setQuizResponses] = React.useState<Record<string, string | string[]>>({});
  const [activeLessonId, setActiveLessonId] = React.useState<string | null>(null);
  const [showLessonChatModal, setShowLessonChatModal] = React.useState(false);
  const lessonIntroMessageRef = React.useRef<string | null>(null);
  const [showStudentModal, setShowStudentModal] = React.useState(false);
  const [activeMode, setActiveMode] = React.useState<AppMode>('learners');

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const recordedChunksRef = React.useRef<Blob[]>([]);
  const lessonChatThreadRef = React.useRef<HTMLDivElement | null>(null);

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
  const [showTopicModal, setShowTopicModal] = React.useState(false);

  const diagnosticNotes = formatDiagnosticNotes(selectedProgram?.context?.diagnostic_notes);

  const selectedLesson = React.useMemo(() => {
    if (!selectedProgram) return null;
    return selectedProgram.lessons.find((lesson) => lesson.id === activeLessonId) ?? null;
  }, [selectedProgram, activeLessonId]);
  const selectedLessonId = selectedLesson?.id ?? null;
  const nextLesson = React.useMemo(() => {
    if (!selectedProgram || !selectedLesson) return null;
    const sorted = [...selectedProgram.lessons].sort((a, b) => a.order_index - b.order_index);
    const currentIndex = sorted.findIndex((lesson) => lesson.id === selectedLesson.id);
    if (currentIndex < 0) return null;
    return sorted.slice(currentIndex + 1).find((lesson) => lesson.unlocked) ?? null;
  }, [selectedProgram, selectedLesson]);
  const hasTeacherMessage = React.useMemo(
    () => lessonChatMessages.some((message) => message.sender === 'assistant'),
    [lessonChatMessages],
  );

  const modeLabel: Record<AppMode, string> = {
    learners: 'Learners',
    programs: 'Programs',
    lesson: 'Lesson',
    progress: 'Progress',
  };

  const clearAuth = React.useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
    setAuthToken(null);
    setAccount(null);
    setStudents([]);
    setStudent(null);
    setCatalog([]);
    setSelectedProgram(null);
    setProgress(null);
    setActiveMode('learners');
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const stored = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (stored) {
      setAuthToken(stored);
    }
    setIsAuthReady(true);
  }, []);

  React.useEffect(() => {
    if (!authToken) {
      setAccount(null);
      return;
    }

    let active = true;
    (async () => {
      try {
        const current = await apiRequest<AccountResponse>('/api/auth/me', undefined, authToken);
        if (!active) return;
        setAccount(current);
      } catch (err) {
        console.error(err);
        if (!active) return;
        clearAuth();
      }
    })();
    return () => {
      active = false;
    };
  }, [authToken, clearAuth]);

  const authedApiRequest = React.useCallback(
    <T,>(path: string, init?: RequestInit) => {
      if (!authToken) {
        throw new Error('Please sign in to continue');
      }
      return apiRequest<T>(path, init, authToken);
    },
    [authToken],
  );

  const handleAuthenticate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setError(null);
      setNotice(null);
      setIsAuthenticating(true);
      const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const response = await apiRequest<AuthSessionResponse>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          email: authForm.email.trim(),
          password: authForm.password,
        }),
      });
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.token);
      }
      setAuthToken(response.token);
      setAccount(response.account);
      setAuthForm({ email: response.account.email, password: '' });
      setNotice(authMode === 'signup' ? 'Account created successfully.' : 'Signed in successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (authToken) {
        await apiRequest('/api/auth/logout', { method: 'POST' }, authToken);
      }
    } catch (err) {
      console.error(err);
    } finally {
      clearAuth();
      setNotice('You have been signed out.');
    }
  };

  const stopMediaStream = React.useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const transcribeVoiceNote = React.useCallback(async (blob: Blob) => {
    setIsTranscribingVoice(true);
    try {
      const formData = new FormData();
      formData.append('file', blob, 'lesson-voice.webm');
      const response = await fetch(new URL('/api/transcribe', API_BASE).toString(), {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || 'Transcription request failed');
      }
      const data = (await response.json()) as { text?: string };
      const transcript = data.text ?? '';
      if (transcript) {
        setLessonChatInput((prev) => ({
          ...prev,
          text: prev.text ? `${prev.text}\n${transcript}` : transcript,
        }));
      } else {
        setNotice('No speech detected. Try recording again.');
      }
    } catch (err) {
      console.error(err);
      setError('Unable to transcribe voice note right now. Please try again.');
    } finally {
      setIsTranscribingVoice(false);
    }
  }, []);

  const handleToggleVoiceRecording = async () => {
    if (isRecordingVoice) {
      mediaRecorderRef.current?.stop();
      setIsRecordingVoice(false);
      return;
    }

    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Voice recording is not supported in this browser.');
      return;
    }

    try {
      setError(null);
      recordedChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        recordedChunksRef.current = [];
        stopMediaStream();
        setIsRecordingVoice(false);
        if (blob.size > 0) {
          void transcribeVoiceNote(blob);
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecordingVoice(true);
    } catch (err) {
      console.error(err);
      setError('Unable to access microphone. Please allow access or try again.');
      stopMediaStream();
      setIsRecordingVoice(false);
    }
  };

  React.useEffect(() => {
    if (!selectedLessonId || (lessonChatLessonId && lessonChatLessonId !== selectedLessonId)) {
      setLessonChatSession(null);
      setLessonChatLessonId(null);
      setLessonChatMessages([]);
      setLessonChatSocket((prev) => {
        prev?.close();
        return null;
      });
    }
  }, [selectedLessonId, lessonChatLessonId]);

  React.useEffect(() => {
    return () => {
      lessonChatSocket?.close();
    };
  }, [lessonChatSocket]);

  React.useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      stopMediaStream();
    };
  }, [stopMediaStream]);

  React.useEffect(() => {
    if (!selectedProgram) {
      setActiveLessonId(null);
      setNotice(null);
      return;
    }

    setNotice(null);

    setActiveLessonId((previous) => {
      if (previous && selectedProgram.lessons.some((lesson) => lesson.id === previous)) {
        return previous;
      }
      const firstUnlocked = selectedProgram.lessons.find((lesson) => lesson.unlocked);
      return firstUnlocked?.id ?? selectedProgram.lessons[0]?.id ?? null;
    });
  }, [selectedProgram?.id]);

  const refreshStudents = React.useCallback(async () => {
    const result = await authedApiRequest<StudentResponse[]>('/api/students');
    setStudents(result);
  }, [authedApiRequest]);

  const refreshCatalog = React.useCallback(async (studentId: string) => {
    const result = await authedApiRequest<ProgramCatalogEntry[]>(`/api/students/${studentId}/catalog`);
    setCatalog(result);
  }, [authedApiRequest]);

  const refreshProgress = React.useCallback(async (studentId: string) => {
    const result = await authedApiRequest<ProgressSnapshot>(`/api/students/${studentId}/progress`);
    setProgress(result);
  }, [authedApiRequest]);

  React.useEffect(() => {
    if (!account || !authToken) {
      return;
    }
    void refreshStudents();
  }, [account, authToken, refreshStudents]);

  const handleSelectStudent = async (learner: StudentResponse) => {
    setStudent(learner);
    setSelectedProgram(null);
    setActiveLessonId(null);
    setLessonChatSession(null);
    setLessonChatLessonId(null);
    setLessonChatMessages([]);
    setLessonChatSocket((prev) => {
      prev?.close();
      return null;
    });
    setError(null);
    setNotice(null);
    await refreshCatalog(learner.id);
    await refreshProgress(learner.id);
    setActiveMode('programs');
  };

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
      const created = await authedApiRequest<StudentResponse>('/api/students', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await refreshStudents();
      setStudentForm({ display_name: '', age: '', grade: '' });
      setShowStudentModal(false);
      await handleSelectStudent(created);
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
      setIsGeneratingQuiz(true);
      const payload = {
        topic: topicForm.topic.trim(),
        learning_goal: topicForm.learning_goal.trim() || undefined,
        student_traits: topicForm.traits
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      };
      const program = await authedApiRequest<LearningProgramResponse>(
        `/api/students/${student.id}/topics`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      setSelectedProgram(program);
      setActiveMode('programs');
      await refreshCatalog(student.id);
      setTopicForm({ topic: '', learning_goal: '', traits: '' });
      setShowTopicModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add topic');
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const handleSelectProgram = async (programId: string) => {
    try {
      setError(null);
      const program = await authedApiRequest<LearningProgramResponse>(`/api/programs/${programId}`);
      setSelectedProgram(program);
      setActiveMode(program.lessons.length > 0 && program.status === 'ready' ? 'lesson' : 'programs');
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
      setIsSubmittingDiagnostic(true);
      const payload = {
        answers: quizResponses,
      };
      const result = await authedApiRequest<{ program: LearningProgramResponse }>(
        `/api/programs/${selectedProgram.id}/diagnostic/submit`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      setSelectedProgram(result.program);
      setActiveMode(result.program.lessons.length > 0 ? 'lesson' : 'programs');
      await refreshCatalog(student.id);
      await refreshProgress(student.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit diagnostic quiz');
    } finally {
      setIsSubmittingDiagnostic(false);
    }
  };

  const handleLaunchLessonChat = async (lesson: LessonResponse, ttsEnabled: boolean) => {
    if (!student) return;
    try {
      setError(null);
      setIsConnectingLessonChat(true);
      setLessonChatMessages([]);
      lessonIntroMessageRef.current = `Please start the lesson about "${lesson.title}" now and guide me through the activities.`;
      setLessonChatSocket((prev) => {
        prev?.close();
        return null;
      });
      const session = await authedApiRequest<ChatSessionSnapshot>('/api/chat/sessions', {
        method: 'POST',
        body: JSON.stringify({
          student_id: student.id,
          program_id: selectedProgram?.id,
          lesson_id: lesson.id,
          title: `${lesson.title} Interactive Lesson`,
          tts_enabled: ttsEnabled,
        }),
      });
      setLessonChatSession(session);
      setLessonChatLessonId(lesson.id);
      setLessonChatInput({ text: '', image_url: '', generate_voice: ttsEnabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start lesson chat');
    } finally {
      setIsConnectingLessonChat(false);
    }
  };

  const handleStartLessonChat = (lesson: LessonResponse, ttsEnabled: boolean) => {
    setActiveMode('lesson');
    setShowLessonChatModal(true);
    void handleLaunchLessonChat(lesson, ttsEnabled);
  };

  React.useEffect(() => {
    if (!lessonChatSession || !student || !lessonChatLessonId || !authToken) {
      setLessonChatMessages([]);
      setIsTeacherTyping(false);
      lessonIntroMessageRef.current = null;
      setLessonChatSocket((prev) => {
        prev?.close();
        return null;
      });
      return;
    }

    const url = new URL(`/ws/chat/${lessonChatSession.id}`, WS_BASE);
    url.searchParams.set('account_token', authToken);
    url.searchParams.set('student_id', student.id);
    if (selectedProgram) {
      url.searchParams.set('program_id', selectedProgram.id);
    }
    url.searchParams.set('lesson_id', lessonChatLessonId);
    url.searchParams.set('tts', String(lessonChatSession.tts_enabled));

    const socket = new WebSocket(url);
    setLessonChatSocket(socket);

    socket.onopen = () => {
      setIsTeacherTyping(true);
      const introMessage = lessonIntroMessageRef.current;
      if (introMessage) {
        socket.send(
          JSON.stringify({
            content_type: 'text',
            text: introMessage,
          }),
        );
      }
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data) as ChatSocketEvent;
      if (data.type === 'history') {
        setLessonChatMessages(normalizeChatMessages(data.messages));
        setIsTeacherTyping(false);
      } else if (data.type === 'student_message' || data.type === 'assistant_message') {
        setLessonChatMessages((prev) => {
          if (data.type === 'student_message' && data.message.text === lessonIntroMessageRef.current) {
            return prev;
          }

          const withoutMatchingOptimistic =
            data.type === 'student_message'
              ? prev.filter(
                  (message) =>
                    !(
                      message.sender === 'student' &&
                      message.id.startsWith('optimistic-') &&
                      message.text === data.message.text &&
                      (message.image_url ?? '') === (data.message.image_url ?? '')
                    ),
                )
              : prev;

          if (withoutMatchingOptimistic.some((message) => message.id === data.message.id)) {
            return withoutMatchingOptimistic;
          }

          return normalizeChatMessages([...withoutMatchingOptimistic, data.message]);
        });
        if (data.type === 'assistant_message') {
          setIsTeacherTyping(false);
        }
        if (data.type === 'assistant_message' && selectedProgram) {
          handleSelectProgram(selectedProgram.id);
        }
      }
    };

    socket.onerror = () => {
      setError('Lesson chat connection failed');
      setIsTeacherTyping(false);
    };

    socket.onclose = () => {
      setLessonChatSocket(null);
      setIsTeacherTyping(false);
    };

    return () => {
      socket.close();
    };
  }, [
    lessonChatSession?.id,
    authToken,
    student?.id,
    selectedProgram?.id,
    lessonChatLessonId,
    selectedLessonId,
  ]);

  const handleSendLessonChat = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!lessonChatSocket || lessonChatSocket.readyState !== WebSocket.OPEN) {
      setError('Interactive lesson chat is not connected yet');
      return;
    }
    const trimmed = lessonChatInput.text.trim();
    if (!trimmed && !lessonChatInput.image_url) {
      setError('Share a response or image before sending to the tutor');
      return;
    }
    const payload = {
      content_type: lessonChatInput.image_url ? 'image' : 'text',
      text: lessonChatInput.image_url ? undefined : trimmed,
      image_url: lessonChatInput.image_url || undefined,
      generate_voice: lessonChatInput.generate_voice || lessonChatSession?.tts_enabled || false,
    };
    const optimisticMessage: ChatMessageOut = {
      id: `optimistic-${crypto.randomUUID()}`,
      sender: 'student',
      content_type: payload.content_type,
      text: payload.text,
      image_url: payload.image_url,
      render_formats: [],
      created_at: new Date().toISOString(),
    };
    setLessonChatMessages((prev) => [...prev, optimisticMessage]);
    setIsTeacherTyping(true);
    lessonChatSocket.send(
      JSON.stringify(payload),
    );
    setLessonChatInput({ text: '', image_url: '', generate_voice: lessonChatSession?.tts_enabled ?? false });
  };

  React.useEffect(() => {
    if (!lessonChatThreadRef.current) {
      return;
    }
    lessonChatThreadRef.current.scrollTop = lessonChatThreadRef.current.scrollHeight;
  }, [lessonChatMessages, isTeacherTyping]);

  const isLessonChatActiveForSelectedLesson =
    activeMode === 'lesson' && Boolean(selectedLesson && lessonChatLessonId === selectedLesson.id);

  if (!isAuthReady) {
    return (
      <div className="auth-shell">
        <section className="auth-card">
          <h1>Omni Teacher</h1>
          <p>Loading account session...</p>
        </section>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="auth-shell">
        <section className="auth-card">
          <h1>Omni Teacher</h1>
          <p className="auth-subtitle">Sign in or create an account to access your learners.</p>

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

          <form className="form-grid" onSubmit={handleAuthenticate}>
            <label>
              Email
              <input
                name="auth-email"
                type="email"
                required
                value={authForm.email}
                onChange={(event) => setAuthForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                name="auth-password"
                type="password"
                required
                minLength={6}
                value={authForm.password}
                onChange={(event) => setAuthForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="At least 6 characters"
              />
            </label>
            <button type="submit" className="primary-button" disabled={isAuthenticating}>
              {isAuthenticating ? 'Please wait...' : authMode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setAuthMode((prev) => (prev === 'signin' ? 'signup' : 'signin'));
              setError(null);
              setNotice(null);
            }}
          >
            {authMode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className={`app-shell${isLessonChatActiveForSelectedLesson ? ' app-shell--lesson-workspace' : ''}`}>
      <header className="app-shell-header">
        <button
          type="button"
          className="app-shell-logo"
          onClick={() => setActiveMode(student ? 'programs' : 'learners')}
        >
          Omni Teacher
        </button>
        <div className="mode-tabs" role="tablist" aria-label="App modes">
          {(['learners', 'programs', 'lesson', 'progress'] as AppMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              className={`mode-tab${activeMode === mode ? ' mode-tab--active' : ''}`}
              aria-selected={activeMode === mode}
              disabled={!student && mode !== 'learners'}
              onClick={() => setActiveMode(mode)}
            >
              {modeLabel[mode]}
            </button>
          ))}
        </div>
        <div className="header-account">
          <span>{account.email}</span>
          <button type="button" className="secondary-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
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


      {!student && activeMode !== 'learners' && (
        <section className="form-section">
          <p style={{ margin: 0, color: '#334155' }}>Select a learner first to open this mode.</p>
          <div style={{ marginTop: '0.75rem' }}>
            <button type="button" className="primary-button" onClick={() => setActiveMode('learners')}>
              Go to Learners
            </button>
          </div>
        </section>
      )}

      {activeMode === 'learners' && (
        <section className="form-section">
          <h2>Learner Profiles</h2>
        <div className="student-grid">
          {students.map((learner) => (
            <button
              key={learner.id}
              type="button"
              className={`student-card${student?.id === learner.id ? ' student-card--active' : ''}`}
              onClick={() => handleSelectStudent(learner)}
            >
              <div className="student-card-header">
                <strong>{learner.display_name}</strong>
                {learner.grade && <span className="badge">{learner.grade}</span>}
              </div>
              <div className="student-card-meta">
                {learner.age ? <span>Age {learner.age}</span> : <span>Age not set</span>}
                <small>{learner.id}</small>
              </div>
            </button>
          ))}
          <button
            type="button"
            className="student-card student-card--new"
            onClick={() => {
              setStudentForm({ display_name: '', age: '', grade: '' });
              setShowStudentModal(true);
            }}
          >
            <span className="student-card-plus">＋</span>
            <strong>New learner</strong>
            <span>Create a new profile</span>
          </button>
        </div>
        {student && (
          <p style={{ marginTop: '1rem', color: '#1e293b' }}>
            Active learner <strong>{student.display_name}</strong> (ID: {student.id})
          </p>
        )}
        </section>
      )}
      {showStudentModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3 style={{ marginTop: 0 }}>Create a new learner</h3>
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
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                <button type="submit" className="primary-button">
                  Save learner
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowStudentModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showTopicModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3 style={{ marginTop: 0 }}>Create a new learning adventure</h3>
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
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                <button type="submit" className="primary-button" disabled={isGeneratingQuiz}>
                  {isGeneratingQuiz ? 'Generating diagnostic quiz...' : 'Generate diagnostic quiz'}
                  {isGeneratingQuiz && <span className="button-spinner" aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowTopicModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {student && activeMode === 'programs' && (
        <section className="form-section">
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Learning Adventures Library</h2>
            <button className="secondary-button" onClick={() => refreshCatalog(student.id)}>
              Refresh catalog
            </button>
          </header>
          <div className="catalog-grid">
            <button
              type="button"
              className="catalog-card catalog-card--new"
              onClick={() => {
                setTopicForm({ topic: '', learning_goal: '', traits: '' });
                setShowTopicModal(true);
              }}
            >
              <span className="student-card-plus">＋</span>
              <strong>New topic</strong>
              <span>Create a learning adventure</span>
            </button>
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

      {selectedProgram && (activeMode === 'programs' || activeMode === 'lesson') && (
        <section
          className={`form-section program-pane${isLessonChatActiveForSelectedLesson ? ' form-section--lesson-workspace' : ''}`}
        >
          {activeMode === 'programs' && (
            <header style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h2>{selectedProgram.title}</h2>
              {selectedProgram.summary && <p>{selectedProgram.summary}</p>}
              {diagnosticNotes && (
                <div className="badge" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#1d4ed8' }}>
                  {diagnosticNotes}
                </div>
              )}
            </header>
          )}

          {activeMode === 'programs' && selectedProgram.status === 'awaiting_diagnostic' && selectedProgram.quiz && (
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
              <button type="submit" className="primary-button" disabled={isSubmittingDiagnostic}>
                {isSubmittingDiagnostic ? 'Submitting answers...' : 'Submit answers'}
                {isSubmittingDiagnostic && <span className="button-spinner" aria-hidden="true" />}
              </button>
            </form>
          )}


          {activeMode === 'programs' && selectedProgram.status === 'ready' && selectedProgram.lessons.length > 0 && (
            <section className="lesson-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <p style={{ margin: 0, color: '#334155' }}>Program is ready. Open lesson delivery to continue.</p>
              <button type="button" className="primary-button" onClick={() => setActiveMode('lesson')}>
                Open lesson mode
              </button>
            </section>
          )}

          {activeMode === 'lesson' && selectedProgram.lessons.length > 0 && (
            <div className={`lesson-layout${isLessonChatActiveForSelectedLesson ? ' lesson-layout--workspace' : ''}`}>
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
                  <div className={`lesson-detail-content${isLessonChatActiveForSelectedLesson ? ' lesson-detail-content--workspace' : ''}`}>
                    {!selectedLesson.unlocked ? (
                      <div className="lesson-locked-banner">
                        Complete the previous lesson to unlock this adventure.
                      </div>
                    ) : (
                      <>
                        <section className="lesson-section lesson-section--compact">
                        {lessonChatLessonId !== selectedLesson.id && (
                          <div className="lesson-header-actions" style={{ justifyContent: 'flex-start' }}>
                            <button
                              type="button"
                              className="primary-button"
                              onClick={() => handleStartLessonChat(selectedLesson, false)}
                              disabled={isConnectingLessonChat}
                            >
                              {isConnectingLessonChat ? 'Preparing guided chat…' : 'Start guided lesson chat'}
                            </button>
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => handleStartLessonChat(selectedLesson, true)}
                              disabled={isConnectingLessonChat}
                            >
                              {isConnectingLessonChat ? 'Preparing voice tutor…' : 'Start with playful voice'}
                            </button>
                          </div>
                        )}
                        {lessonChatLessonId === selectedLesson.id && (
                            <div className={`lesson-chat-workspace${isLessonChatActiveForSelectedLesson ? ' lesson-chat-workspace--fullscreen' : ''}`}>
                              <div className="chat-thread" ref={lessonChatThreadRef}>
                                {lessonChatMessages.map((message) => (
                                  <article key={message.id} className={`chat-message ${message.sender}`}>
                                    <header style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <strong>
                                        {message.sender === 'assistant' ? 'Omni Teacher' : student?.display_name ?? 'You'}
                                      </strong>
                                      <small>{formatDate(message.created_at)}</small>
                                    </header>
                                    {message.text && <MarkdownRenderer content={message.text} />}
                                    {message.image_url && (
                                      <img
                                        src={message.image_url}
                                        alt="Shared during lesson"
                                        style={{ maxWidth: '100%', borderRadius: '0.75rem' }}
                                      />
                                    )}
                                    {message.audio_url && <audio controls src={message.audio_url} />}
                                  </article>
                                ))}
                                {lessonChatMessages.length === 0 && !isTeacherTyping && (
                                  <p style={{ margin: 0 }}>
                                    Waiting for Omni Teacher to introduce the lesson.
                                  </p>
                                )}
                                {isTeacherTyping && (
                                  <div className="chat-typing">
                                    <span className="typing-dot" />
                                    <span className="typing-dot" />
                                    <span className="typing-dot" />
                                    <span>
                                      {hasTeacherMessage
                                        ? 'Omni Teacher is typing…'
                                        : 'Waiting for Omni Teacher to introduce the lesson.'}
                                    </span>
                                  </div>
                                )}
                                {selectedLesson.latest_attempt?.stars &&
                                  selectedLesson.progress_state === 'completed' &&
                                  nextLesson && (
                                    <article className="chat-message assistant">
                                      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <strong>Omni Teacher</strong>
                                        <small>{formatDate(selectedLesson.latest_attempt.created_at)}</small>
                                      </header>
                                      <p>Lesson complete! Ready to keep going?</p>
                                      <button
                                        type="button"
                                        className="primary-button"
                                        onClick={() => setActiveLessonId(nextLesson.id)}
                                      >
                                        Next lesson
                                      </button>
                                    </article>
                                  )}
                              </div>
                              <form className="chat-input" onSubmit={handleSendLessonChat}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                  <textarea
                                    placeholder="Respond to Omni Teacher here…"
                                    value={lessonChatInput.text}
                                    onChange={(event) =>
                                      setLessonChatInput((prev) => ({ ...prev, text: event.target.value }))
                                    }
                                  />
                                  <input
                                    type="url"
                                    placeholder="Optional image URL for the tutor"
                                    value={lessonChatInput.image_url}
                                    onChange={(event) =>
                                      setLessonChatInput((prev) => ({ ...prev, image_url: event.target.value }))
                                    }
                                  />
                                  <div className="chat-controls">
                                    <button
                                      type="button"
                                      className="secondary-button"
                                      onClick={handleToggleVoiceRecording}
                                      disabled={isTranscribingVoice}
                                    >
                                      {isRecordingVoice ? 'Stop recording' : '🎤 Record voice to text'}
                                    </button>
                                    {isTranscribingVoice && <span className="badge">Transcribing…</span>}
                                    <label>
                                      <input
                                        type="checkbox"
                                        checked={lessonChatInput.generate_voice}
                                        onChange={(event) =>
                                          setLessonChatInput((prev) => ({
                                            ...prev,
                                            generate_voice: event.target.checked,
                                          }))
                                        }
                                      />
                                      Request playful voice reply
                                    </label>
                                  </div>
                                </div>
                                <button type="submit" className="primary-button">
                                  Send response
                                </button>
                              </form>
                            </div>
                          )}
                        </section>
                        {!isLessonChatActiveForSelectedLesson && (
                          <details className="lesson-details-toggle" open>
                            <summary>📘 Lesson details</summary>
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
                          </details>
                        )}
                      </>
                    )}
                    {!isLessonChatActiveForSelectedLesson && selectedLesson.latest_attempt && (
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
          {showLessonChatModal && selectedLesson && selectedLesson.unlocked && (
            <div className="modal-overlay" role="dialog" aria-modal="true">
              <div className="modal-card">
                <h4>Keep chatting to finish</h4>
                <p style={{ margin: '0.5rem 0 1rem', color: '#4338ca' }}>
                  Omni Teacher will present activities and award 1–3 stars directly in the interactive chat
                  when the lesson wraps up. Answer their prompts and keep the conversation going until
                  they celebrate your mastery.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setShowLessonChatModal(false)}
                  >
                    Got it
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {student && progress && activeMode === 'progress' && (
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

    </div>
  );
}
