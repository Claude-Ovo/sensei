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
    showToast('反馈已发送');
  }

  if (session === undefined || !authReady) {
    return <CenteredState title="正在接入会话" detail="连接 Firestore 实时数据流…" loading />;
  }

  if (!session) {
    if (error === 'permission') {
      return (
        <CenteredState
          title="这个会话需要权限"
          detail={user ? '当前账号不是该会话的所有者。请切换账号，或让创建者将会话设为公开。' : '登录与会话关联的 Google 账号后即可查看。'}
          action={user ? undefined : { label: '使用 Google 登录', onClick: onSignIn }}
        />
      );
    }
    return (
      <CenteredState
        title={error === 'missing' ? '没有找到这个会话' : '暂时无法连接'}
        detail={error === 'missing' ? '检查 sessionId 是否完整，或返回会话列表重新选择。' : '网络或 Firestore 暂时不可用，请稍后刷新。'}
      />
    );
  }

  const observation = getObservationCopy(session);

  return (
    <main className="session-page">
      <section className="session-hero">
        <a className="back-link" href="#/">
          ← 所有会话
        </a>
        <div className="session-title-row">
          <div>
            <div className="session-meta-line">
              <span>{sessionStateCopy[session.state]}</span>
              <span>{session.lastSeq ?? 0} 条</span>
              <time>{formatTime(session.updatedAt?.toDate())}</time>
              <span className="mono-label">{session.id}</span>
            </div>
            <h1 title={session.goal || '未命名学习目标'}>{session.goal || '未命名学习目标'}</h1>
          </div>
        </div>
        <div className="observation-bar">
          <strong>{observation.label}</strong>
          {observation.detail ? <p>{observation.detail}</p> : null}
        </div>
      </section>

      <div className="session-tabs" role="tablist" aria-label="会话内容">
        <button className={tab === 'live' ? 'is-active' : ''} type="button" role="tab" aria-selected={tab === 'live'} onClick={() => setTab('live')}>
          实时现场
        </button>
        <button
          className={tab === 'tutorial' ? 'is-active' : ''}
          type="button"
          role="tab"
          aria-selected={tab === 'tutorial'}
          onClick={() => setTab('tutorial')}
          disabled={!session.tutorial}
        >
          编译教程 {session.tutorial ? <span className="tab-ready">已生成</span> : null}
        </button>
      </div>

      {error === 'network' ? <div className="notice notice-error session-notice">部分实时数据连接已中断，正在等待 Firestore 重连。</div> : null}

      {tab === 'live' ? (
        <div className="live-grid">
          <TerminalStream chunks={chunks} active={session.state === 'active'} />
          <aside className="sensei-rail">
            <QuestionsPanel questions={questions} sessionId={sessionId} user={user} onSent={() => showToast('回答已发送')} />
            <HintsPanel hints={hints} />
            <NotesPanel notes={notes} />
            <ProfileCard profile={session.profile} />
          </aside>
        </div>
      ) : (
        <TutorialPanel markdown={session.tutorial ?? ''} onCopied={() => showToast('Markdown 已复制')} />
      )}

      <FeedbackBar onFeedback={sendFeedback} />
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </main>
  );
}

const statusCopy: Record<NonNullable<SessionData['status']>, string> = {
  flowing: '进展顺畅',
  exploring: '正在探索',
  stuck: '可能卡住',
  idle: '暂时停顿',
  milestone: '到达里程碑',
  done: '学习完成',
};

const sessionStateCopy: Record<SessionData['state'], string> = {
  active: '进行中',
  ended: '已结束',
  compiled: '已编译',
};

function getObservationCopy(session: SessionData): { label: string; detail?: string } {
  if (session.state === 'compiled') return { label: '教程已生成' };
  if (session.state === 'ended') return { label: '会话已结束', detail: session.lastObservation };
  return {
    label: session.status ? `正在观察：${statusCopy[session.status]}` : '正在观察',
    detail: session.lastObservation,
  };
}

function TerminalStream({ chunks, active }: { chunks: ChunkData[]; active: boolean }) {
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
          <h2 id="terminal-title">终端流</h2>
          <span className="stream-state">
            <span className={`observation-signal ${active ? 'is-live' : ''}`} aria-hidden="true" />
            {active ? '实时' : '已结束'}
          </span>
        </div>
        <button className={`autoscroll-control ${autoScroll ? 'is-on' : ''}`} type="button" onClick={() => setAutoScroll(true)}>
          {autoScroll ? '跟随输出' : '继续跟随'}
        </button>
      </div>
      <div className="terminal-window" ref={scrollerRef} onScroll={detectScrollPause}>
        {chunks.length === 0 ? (
          <div className="terminal-empty">
            <span className={`terminal-cursor ${active ? 'is-active' : ''}`} />
            <p>{active ? '等待终端输出…' : '本次会话没有终端输出'}</p>
          </div>
        ) : (
          chunks.map((chunk) => <TerminalChunk key={chunk.id} chunk={chunk} />)
        )}
      </div>
    </section>
  );
}

function TerminalChunk({ chunk }: { chunk: ChunkData }) {
  if (chunk.kind === 'agent' || chunk.kind === 'user') {
    return (
      <div className={`terminal-bubble bubble-${chunk.kind}`}>
        <span>{chunk.kind === 'agent' ? 'Sensei' : '你'}</span>
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
        <h2 id="questions-title">Sensei 在问</h2>
        <span>{openQuestions.length}</span>
      </div>
      {openQuestions.map((question) => (
        <form key={question.id} className="question-form" onSubmit={(event) => submitAnswer(event, question.id)}>
          <p>{question.text}</p>
          {sentIds.has(question.id) ? (
            <div className="answer-sent">回答已进入终端</div>
          ) : (
            <div className="answer-controls">
              <input
                value={answers[question.id] ?? ''}
                onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                placeholder="输入你的回答"
                aria-label={`回答：${question.text}`}
              />
              <button type="submit" disabled={sendingId === question.id || !answers[question.id]?.trim()}>
                发送
              </button>
            </div>
          )}
        </form>
      ))}
    </section>
  );
}

function HintsPanel({ hints }: { hints: HintData[] }) {
  return (
    <section className="rail-card" aria-labelledby="hints-title">
      <div className="rail-card-title">
        <h2 id="hints-title">Sensei 提示</h2>
        <span>{hints.length}</span>
      </div>
      {hints.length === 0 ? <p className="rail-empty">暂时没有提示，继续探索。</p> : null}
      <div className="hint-list">
        {[...hints].reverse().slice(0, 8).map((hint) => (
          <article className={`hint hint-${hint.level}`} key={hint.id}>
            <div>
              <span>{hintLabels[hint.level]}</span>
              <small>第 {hint.atSeq} 条</small>
            </div>
            <p>{hint.text}</p>
            {hint.evidence ? <blockquote>{hint.evidence}</blockquote> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

const hintLabels: Record<HintLevel, string> = {
  nudge: '轻推一下',
  hint: '提示',
  explain: '解释',
  fix: '修复建议',
};

function NotesPanel({ notes }: { notes: NoteData[] }) {
  const milestones = notes.filter((note) => note.kind === 'milestone');
  const regularNotes = notes.filter((note) => note.kind === 'note');
  return (
    <section className="rail-card" aria-labelledby="notes-title">
      <div className="rail-card-title">
        <h2 id="notes-title">笔记与里程碑</h2>
        <span>{notes.length}</span>
      </div>
      {notes.length === 0 ? <p className="rail-empty">Sensei 还没有记下关键节点。</p> : null}
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
  return (
    <section className="rail-card profile-card" aria-labelledby="profile-title">
      <h2 id="profile-title">当前画像</h2>
      {!profile ? <p className="rail-empty">画像会随反馈逐步形成。</p> : null}
      {profile ? (
        <>
          <dl className="profile-grid">
            <div><dt>水平</dt><dd>{profile.level || '待判断'}</dd></div>
            <div><dt>详细度</dt><dd>{profile.verbosity || '适中'}</dd></div>
            <div><dt>风格</dt><dd>{profile.style || '自适应'}</dd></div>
          </dl>
          <TagGroup label="已掌握" values={profile.knownConcepts} />
          <TagGroup label="待加强" values={profile.weakSpots} weak />
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
  async function copyMarkdown() {
    await navigator.clipboard.writeText(markdown);
    onCopied();
  }
  return (
    <section className="tutorial-panel">
      <div className="tutorial-toolbar">
        <h2>学习教程</h2>
        <button className="button button-primary" type="button" onClick={copyMarkdown}>复制 Markdown</button>
      </div>
      <article className="markdown-body">
        <ReactMarkdown skipHtml>{markdown}</ReactMarkdown>
      </article>
    </section>
  );
}

function FeedbackBar({ onFeedback }: { onFeedback: (value: FeedbackValue) => Promise<void> }) {
  const [busy, setBusy] = useState<FeedbackValue | null>(null);
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
      <h2 id="feedback-title">这一步讲得怎样？</h2>
      <div className="feedback-actions">
        {feedbackOptions.map((option) => (
          <button key={option.value} type="button" disabled={busy !== null} onClick={() => send(option.value)}>
            {busy === option.value ? '发送中…' : option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

const feedbackOptions: { value: FeedbackValue; label: string }[] = [
  { value: 'helpful', label: '有帮助' },
  { value: 'too-basic', label: '太基础' },
  { value: 'confusing', label: '没看懂' },
  { value: 'just-tell-me', label: '直接告诉我' },
  { value: 'let-me-try', label: '让我自己试' },
];

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
  return (
    <main className="centered-state">
      <div className={`state-glyph ${loading ? 'is-loading' : ''}`} aria-hidden="true"><span /></div>
      <h1>{title}</h1>
      <p>{detail}</p>
      {action ? <button className="button button-primary" type="button" onClick={action.onClick}>{action.label}</button> : null}
      <a href="#/">返回会话列表</a>
    </main>
  );
}
