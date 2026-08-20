import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type DocumentData,
  type QuerySnapshot,
} from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import { db } from './firebase';
import { formatTime } from './HomePage';
import { useI18n } from './i18n';
import type { Copy } from './i18n';
import type { ChunkData, HintData, HintLevel, NoteData, QuestionData, SessionData } from './types';

interface SessionPageProps {
  sessionId: string;
  user: User | null;
  authReady: boolean;
  onSignIn: () => Promise<void>;
}

type SessionTab = 'live' | 'tutorial';
type FeedbackValue = 'helpful' | 'too-basic' | 'confusing' | 'just-tell-me' | 'let-me-try';

function readCollection<T>(snapshot: QuerySnapshot<DocumentData>): T[] {
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as T);
}

export function SessionPage({ sessionId, user, authReady, onSignIn }: SessionPageProps) {
  const { copy, language } = useI18n();
  const [session, setSession] = useState<SessionData | null | undefined>(undefined);
  const [chunks, setChunks] = useState<ChunkData[]>([]);
  const [hints, setHints] = useState<HintData[]>([]);
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [error, setError] = useState<'permission' | 'missing' | 'network' | null>(null);
  const [tab, setTab] = useState<SessionTab>('live');
  const [toast, setToast] = useState<string | null>(null);
  const sessionLoaded = session !== undefined && session !== null;

  useEffect(() => {
    setSession(undefined);
    setError(null);

    return onSnapshot(
      doc(db, 'sessions', sessionId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setSession(null);
          setError('missing');
          return;
        }
        setSession({ id: snapshot.id, ...snapshot.data() } as SessionData);
      },
      (snapshotError) => {
        setSession(null);
        setError(snapshotError.code === 'permission-denied' ? 'permission' : 'network');
      },
    );
  }, [sessionId]);

  useEffect(() => {
    if (!sessionLoaded) return;
    const reportError = () => setError('network');
    const unsubscribers = [
      onSnapshot(
        query(collection(db, 'sessions', sessionId, 'chunks'), orderBy('seq'), limitToLast(400)),
        (snapshot) => setChunks(readCollection<ChunkData>(snapshot)),
        reportError,
      ),
      onSnapshot(
        query(collection(db, 'sessions', sessionId, 'hints'), orderBy('atSeq')),
        (snapshot) => setHints(readCollection<HintData>(snapshot)),
        reportError,
      ),
      onSnapshot(
        query(collection(db, 'sessions', sessionId, 'notes'), orderBy('atSeq')),
        (snapshot) => setNotes(readCollection<NoteData>(snapshot)),
        reportError,
      ),
      onSnapshot(
        query(collection(db, 'sessions', sessionId, 'questions'), orderBy('atSeq')),
        (snapshot) => setQuestions(readCollection<QuestionData>(snapshot)),
        reportError,
      ),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [sessionId, sessionLoaded]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1000);
  }

  async function sendFeedback(value: FeedbackValue) {
    await addDoc(collection(db, 'sessions', sessionId, 'inbound'), {
      kind: 'feedback',
      value,
      ts: serverTimestamp(),
      by: user?.email ?? null,
    });
    showToast(copy.session.feedbackSent);
  }

  if (session === undefined || !authReady) {
    return <CenteredState title={copy.session.connectingTitle} detail={copy.session.connectingDetail} loading />;
  }

  if (!session) {
    if (error === 'permission') {
      return (
        <CenteredState
          title={copy.session.permissionTitle}
          detail={user ? copy.session.wrongOwner : copy.session.signInDetail}
          action={user ? undefined : { label: copy.app.signIn, onClick: onSignIn }}
        />
      );
    }
    return (
      <CenteredState
        title={error === 'missing' ? copy.session.missingTitle : copy.session.unavailableTitle}
        detail={error === 'missing' ? copy.session.missingDetail : copy.session.unavailableDetail}
      />
    );
  }

  const observation = getObservationCopy(session, copy);

  return (
    <main className="session-page">
      <section className="session-hero">
        <a className="back-link" href="#/">
          ← {copy.session.allSessions}
        </a>
        <div className="session-title-row">
          <div>
            <div className="session-meta-line">
              <span>{copy.state[session.state]}</span>
              <span>{copy.session.outputCount(session.lastSeq ?? 0)}</span>
              <time>{formatTime(session.updatedAt?.toDate(), language)}</time>
              <span className="mono-label">{session.id}</span>
            </div>
            <h1 title={session.goal || copy.home.unnamedGoal}>{session.goal || copy.home.unnamedGoal}</h1>
          </div>
        </div>
        <div className="observation-bar">
          <strong>{observation.label}</strong>
          {observation.detail ? <p>{observation.detail}</p> : null}
        </div>
      </section>

      <div className="session-tabs" role="tablist" aria-label={copy.session.tabList}>
        <button className={tab === 'live' ? 'is-active' : ''} type="button" role="tab" aria-selected={tab === 'live'} onClick={() => setTab('live')}>
          {copy.session.liveTab}
        </button>
        <button
          className={tab === 'tutorial' ? 'is-active' : ''}
          type="button"
          role="tab"
          aria-selected={tab === 'tutorial'}
          onClick={() => setTab('tutorial')}
          disabled={!session.tutorial}
        >
          {copy.session.tutorialTab} {session.tutorial ? <span className="tab-ready">{copy.session.ready}</span> : null}
        </button>
      </div>

      {error === 'network' ? <div className="notice notice-error session-notice">{copy.session.reconnecting}</div> : null}

      {tab === 'live' ? (
        <div className="live-grid">
          <TerminalStream chunks={chunks} active={session.state === 'active'} />
          <aside className="sensei-rail">
            <QuestionsPanel questions={questions} sessionId={sessionId} user={user} onSent={() => showToast(copy.session.answerSent)} />
            <HintsPanel hints={hints} />
            <NotesPanel notes={notes} />
            <ProfileCard profile={session.profile} />
          </aside>
        </div>
      ) : (
        <TutorialPanel markdown={session.tutorial ?? ''} onCopied={() => showToast(copy.session.markdownCopied)} />
      )}

      <FeedbackBar onFeedback={sendFeedback} />
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </main>
  );
}

function getObservationCopy(session: SessionData, copy: Copy): { label: string; detail?: string } {
  if (session.state === 'compiled') return { label: copy.session.tutorialReady };
  if (session.state === 'ended') return { label: copy.session.sessionEnded, detail: session.lastObservation };
  return {
    label: session.status ? copy.session.observingStatus(copy.status[session.status]) : copy.session.observing,
    detail: session.lastObservation,
  };
}

function TerminalStream({ chunks, active }: { chunks: ChunkData[]; active: boolean }) {
  const { copy } = useI18n();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useLayoutEffect(() => {
    if (!autoScroll || !scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [autoScroll, chunks]);

  function detectScrollPause() {
    const element = scrollerRef.current;
    if (!element) return;
    setAutoScroll(element.scrollHeight - element.scrollTop - element.clientHeight < 48);
  }

  return (
    <section className="terminal-panel" aria-labelledby="terminal-title">
      <div className="panel-heading terminal-heading">
        <div className="terminal-title">
          <h2 id="terminal-title">{copy.session.terminalStream}</h2>
          <span className="stream-state">
            <span className={`observation-signal ${active ? 'is-live' : ''}`} aria-hidden="true" />
            {active ? copy.session.live : copy.state.ended}
          </span>
        </div>
        <button className={`autoscroll-control ${autoScroll ? 'is-on' : ''}`} type="button" onClick={() => setAutoScroll(true)}>
          {autoScroll ? copy.session.followOutput : copy.session.resumeFollowing}
        </button>
      </div>
      <div className="terminal-window" ref={scrollerRef} onScroll={detectScrollPause}>
        {chunks.length === 0 ? (
          <div className="terminal-empty">
            <span className={`terminal-cursor ${active ? 'is-active' : ''}`} />
            <p>{active ? copy.session.waitingOutput : copy.session.noOutput}</p>
          </div>
        ) : (
          chunks.map((chunk) => <TerminalChunk key={chunk.id} chunk={chunk} />)
        )}
      </div>
    </section>
  );
}

function TerminalChunk({ chunk }: { chunk: ChunkData }) {
  const { copy } = useI18n();

  if (chunk.kind === 'agent' || chunk.kind === 'user') {
    return (
      <div className={`terminal-bubble bubble-${chunk.kind}`}>
        <span>{chunk.kind === 'agent' ? 'Sensei' : copy.session.learner}</span>
        <pre>{chunk.text}</pre>
      </div>
    );
  }
  return (
    <pre className={`terminal-line line-${chunk.kind}`}>
      <span className="line-seq">{String(chunk.seq).padStart(4, '0')}</span>
      <span>{chunk.kind === 'in' ? `$ ${chunk.text}` : chunk.text}</span>
    </pre>
  );
}

function QuestionsPanel({ questions, sessionId, user, onSent }: { questions: QuestionData[]; sessionId: string; user: User | null; onSent: () => void }) {
  const { copy } = useI18n();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(() => new Set());
  const openQuestions = questions.filter((question) => question.answer == null);

  async function submitAnswer(event: FormEvent, questionId: string) {
    event.preventDefault();
    const text = answers[questionId]?.trim();
    if (!text) return;
    setSendingId(questionId);
    try {
      await addDoc(collection(db, 'sessions', sessionId, 'inbound'), {
        kind: 'reply',
        text,
        questionId,
        ts: serverTimestamp(),
        by: user?.email ?? null,
      });
      setSentIds((current) => new Set(current).add(questionId));
      setAnswers((current) => ({ ...current, [questionId]: '' }));
      onSent();
    } finally {
      setSendingId(null);
    }
  }

  if (openQuestions.length === 0) return null;
  return (
    <section className="rail-card question-card" aria-labelledby="questions-title">
      <div className="rail-card-title">
        <h2 id="questions-title">{copy.session.questionsTitle}</h2>
        <span>{openQuestions.length}</span>
      </div>
      {openQuestions.map((question) => (
        <form key={question.id} className="question-form" onSubmit={(event) => submitAnswer(event, question.id)}>
          <p>{question.text}</p>
          {sentIds.has(question.id) ? (
            <div className="answer-sent">{copy.session.answerReachedTerminal}</div>
          ) : (
            <div className="answer-controls">
              <input
                value={answers[question.id] ?? ''}
                onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                placeholder={copy.session.answerPlaceholder}
                aria-label={copy.session.answerLabel(question.text)}
              />
              <button type="submit" disabled={sendingId === question.id || !answers[question.id]?.trim()}>
                {copy.session.send}
              </button>
            </div>
          )}
        </form>
      ))}
    </section>
  );
}

function HintsPanel({ hints }: { hints: HintData[] }) {
  const { copy } = useI18n();
  const hintLabels: Record<HintLevel, string> = {
    nudge: copy.session.hintNudge,
    hint: copy.session.hintHint,
    explain: copy.session.hintExplain,
    fix: copy.session.hintFix,
  };

  return (
    <section className="rail-card" aria-labelledby="hints-title">
      <div className="rail-card-title">
        <h2 id="hints-title">{copy.session.hintsTitle}</h2>
        <span>{hints.length}</span>
      </div>
      {hints.length === 0 ? <p className="rail-empty">{copy.session.noHints}</p> : null}
      <div className="hint-list">
        {[...hints].reverse().slice(0, 8).map((hint) => (
          <article className={`hint hint-${hint.level}`} key={hint.id}>
            <div>
              <span>{hintLabels[hint.level]}</span>
              <small>{copy.session.entryNumber(hint.atSeq)}</small>
            </div>
            <p>{hint.text}</p>
            {hint.evidence ? <blockquote>{hint.evidence}</blockquote> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function NotesPanel({ notes }: { notes: NoteData[] }) {
  const { copy } = useI18n();
  const milestones = notes.filter((note) => note.kind === 'milestone');
  const regularNotes = notes.filter((note) => note.kind === 'note');
  return (
    <section className="rail-card" aria-labelledby="notes-title">
      <div className="rail-card-title">
        <h2 id="notes-title">{copy.session.notesTitle}</h2>
        <span>{notes.length}</span>
      </div>
      {notes.length === 0 ? <p className="rail-empty">{copy.session.noNotes}</p> : null}
      {milestones.map((note) => (
        <div className="milestone" key={note.id}>
          <CheckIcon />
          <p>{note.text}</p>
        </div>
      ))}
      {regularNotes.map((note) => (
        <div className="note" key={note.id}>
          <span />
          <p>{note.text}</p>
        </div>
      ))}
    </section>
  );
}

function ProfileCard({ profile }: { profile?: SessionData['profile'] }) {
  const { copy } = useI18n();

  return (
    <section className="rail-card profile-card" aria-labelledby="profile-title">
      <h2 id="profile-title">{copy.session.profileTitle}</h2>
      {!profile ? <p className="rail-empty">{copy.session.noProfile}</p> : null}
      {profile ? (
        <>
          <dl className="profile-grid">
            <div><dt>{copy.session.level}</dt><dd>{profile.level || copy.session.unknown}</dd></div>
            <div><dt>{copy.session.verbosity}</dt><dd>{profile.verbosity || copy.session.balanced}</dd></div>
            <div><dt>{copy.session.style}</dt><dd>{profile.style || copy.session.adaptive}</dd></div>
          </dl>
          <TagGroup label={copy.session.knownConcepts} values={profile.knownConcepts} />
          <TagGroup label={copy.session.weakSpots} values={profile.weakSpots} weak />
        </>
      ) : null}
    </section>
  );
}

function TagGroup({ label, values, weak = false }: { label: string; values?: string[]; weak?: boolean }) {
  if (!values?.length) return null;
  return (
    <div className="tag-group">
      <p>{label}</p>
      <div>{values.map((value) => <span className={weak ? 'tag-weak' : ''} key={value}>{value}</span>)}</div>
    </div>
  );
}

function TutorialPanel({ markdown, onCopied }: { markdown: string; onCopied: () => void }) {
  const { copy } = useI18n();

  async function copyMarkdown() {
    await navigator.clipboard.writeText(markdown);
    onCopied();
  }
  return (
    <section className="tutorial-panel">
      <div className="tutorial-toolbar">
        <h2>{copy.session.tutorialTitle}</h2>
        <button className="button button-primary" type="button" onClick={copyMarkdown}>{copy.session.copyMarkdown}</button>
      </div>
      <article className="markdown-body">
        <ReactMarkdown skipHtml>{markdown}</ReactMarkdown>
      </article>
    </section>
  );
}

function FeedbackBar({ onFeedback }: { onFeedback: (value: FeedbackValue) => Promise<void> }) {
  const { copy } = useI18n();
  const [busy, setBusy] = useState<FeedbackValue | null>(null);
  const feedbackOptions: { value: FeedbackValue; label: string }[] = [
    { value: 'helpful', label: copy.session.helpful },
    { value: 'too-basic', label: copy.session.tooBasic },
    { value: 'confusing', label: copy.session.confusing },
    { value: 'just-tell-me', label: copy.session.justTellMe },
    { value: 'let-me-try', label: copy.session.letMeTry },
  ];

  async function send(value: FeedbackValue) {
    setBusy(value);
    try {
      await onFeedback(value);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="feedback-bar" aria-labelledby="feedback-title">
      <h2 id="feedback-title">{copy.session.feedbackTitle}</h2>
      <div className="feedback-actions">
        {feedbackOptions.map((option) => (
          <button key={option.value} type="button" disabled={busy !== null} onClick={() => send(option.value)}>
            {busy === option.value ? copy.session.sending : option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m5 10.5 3 3 7-7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

interface CenteredStateProps {
  title: string;
  detail: string;
  loading?: boolean;
  action?: { label: string; onClick: () => Promise<void> };
}

function CenteredState({ title, detail, loading = false, action }: CenteredStateProps) {
  const { copy } = useI18n();

  return (
    <main className="centered-state">
      <div className={`state-glyph ${loading ? 'is-loading' : ''}`} aria-hidden="true"><span /></div>
      <h1>{title}</h1>
      <p>{detail}</p>
      {action ? <button className="button button-primary" type="button" onClick={action.onClick}>{action.label}</button> : null}
      <a href="#/">{copy.session.backToSessions}</a>
    </main>
  );
}
