import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type QuerySnapshot,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import type { SessionData, SessionState } from './types';

interface HomePageProps {
  user: User | null;
  authReady: boolean;
}

function readSessions(snapshot: QuerySnapshot): SessionData[] {
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as SessionData);
}

function sortSessions(sessions: SessionData[]): SessionData[] {
  return [...sessions].sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0)).slice(0, 20);
}

export function HomePage({ user, authReady }: HomePageProps) {
  const [publicSessions, setPublicSessions] = useState<SessionData[]>([]);
  const [ownedSessions, setOwnedSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState('');

  useEffect(() => {
    const publicQuery = query(collection(db, 'sessions'), where('public', '==', true), orderBy('updatedAt', 'desc'), limit(20));
    return onSnapshot(
      publicQuery,
      (snapshot) => {
        setPublicSessions(readSessions(snapshot));
        setLoading(false);
      },
      () => {
        setError('公开会话暂时无法加载。请稍后重试，或直接输入 sessionId。');
        setLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    if (!user?.email) {
      setOwnedSessions([]);
      return;
    }

    const ownedQuery = query(collection(db, 'sessions'), where('ownerEmail', '==', user.email), orderBy('updatedAt', 'desc'), limit(20));
    return onSnapshot(
      ownedQuery,
      (snapshot) => setOwnedSessions(readSessions(snapshot)),
      () => setError('你的私有会话暂时无法加载，请刷新后重试。'),
    );
  }, [user?.email]);

  const sessions = useMemo(() => {
    const unique = new Map<string, SessionData>();
    for (const session of [...publicSessions, ...ownedSessions]) unique.set(session.id, session);
    return sortSessions([...unique.values()]);
  }, [ownedSessions, publicSessions]);

  function openSession(event: FormEvent) {
    event.preventDefault();
    const value = sessionId.trim();
    if (value) window.location.hash = `/s/${encodeURIComponent(value)}`;
  }

  return (
    <main className="home-page">
      <section className="home-intro" aria-labelledby="home-title">
        <p className="eyebrow">
          <span className="signal-dot" /> Live learning log
        </p>
        <h1 id="home-title">看见学习发生的每一步。</h1>
        <p className="intro-copy">终端输出、Sensei 的判断与你的反馈在这里汇成一条可回看的学习轨迹。</p>
      </section>

      <form className="session-join" onSubmit={openSession}>
        <label htmlFor="session-id">已有 sessionId</label>
        <div className="join-controls">
          <input
            id="session-id"
            value={sessionId}
            onChange={(event) => setSessionId(event.target.value)}
            placeholder="输入 sessionId"
            autoComplete="off"
          />
          <button className="button button-primary" type="submit" disabled={!sessionId.trim()}>
            打开会话
          </button>
        </div>
      </form>

      <section className="session-section" aria-labelledby="sessions-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">最近更新</p>
            <h2 id="sessions-title">学习会话</h2>
          </div>
          <span className="session-count">{sessions.length.toString().padStart(2, '0')}</span>
        </div>

        {error ? <div className="notice notice-error">{error}</div> : null}
        {loading || !authReady ? <SessionListSkeleton /> : null}
        {!loading && authReady && sessions.length === 0 ? (
          <div className="empty-state">
            <h3>还没有可见会话</h3>
            <p>运行 `sensei start` 创建会话，或登录查看与你邮箱关联的私有会话。</p>
          </div>
        ) : null}
        {sessions.length > 0 ? (
          <div className="session-list">
            {sessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function SessionCard({ session }: { session: SessionData }) {
  return (
    <a className="session-card" href={`#/s/${encodeURIComponent(session.id)}`}>
      <span className="session-track" aria-hidden="true">
        <span />
      </span>
      <div className="session-card-main">
        <div className="session-card-topline">
          <StateBadge state={session.state} />
          {session.status ? <span className="status-label">{session.status}</span> : null}
          <time>{formatTime(session.updatedAt?.toDate())}</time>
        </div>
        <h3>{session.goal || '未命名学习目标'}</h3>
        <p className="session-id">{session.id}</p>
      </div>
      <div className="session-seq">
        <small>LAST SEQ</small>
        <strong>{session.lastSeq ?? 0}</strong>
      </div>
      <span className="card-arrow" aria-hidden="true">
        →
      </span>
    </a>
  );
}

export function StateBadge({ state }: { state: SessionState }) {
  const label = state === 'active' ? '进行中' : state === 'compiled' ? '已编译' : '已结束';
  return <span className={`state-badge state-${state}`}>{label}</span>;
}

export function formatTime(date?: Date): string {
  if (!date) return '刚刚';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function SessionListSkeleton() {
  return (
    <div className="session-list" aria-label="正在加载会话">
      {[0, 1, 2].map((item) => (
        <div className="session-card skeleton-card" key={item}>
          <span className="skeleton-line skeleton-short" />
          <span className="skeleton-line" />
        </div>
      ))}
    </div>
  );
}
