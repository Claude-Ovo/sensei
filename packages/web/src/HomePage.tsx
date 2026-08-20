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
import { useI18n } from './i18n';
import type { Language } from './language';
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
  const { copy } = useI18n();
  const [publicSessions, setPublicSessions] = useState<SessionData[]>([]);
  const [ownedSessions, setOwnedSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'public' | 'private' | null>(null);
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
        setError('public');
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
      () => setError('private'),
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
        <h1 id="home-title">{copy.home.title}</h1>
        <p className="intro-copy">{copy.home.intro}</p>
      </section>

      <form className="session-join" onSubmit={openSession}>
        <label htmlFor="session-id">{copy.home.sessionLabel}</label>
        <div className="join-controls">
          <input
            id="session-id"
            value={sessionId}
            onChange={(event) => setSessionId(event.target.value)}
            placeholder={copy.home.sessionPlaceholder}
            autoComplete="off"
          />
          <button className="button button-primary" type="submit" disabled={!sessionId.trim()}>
            {copy.home.openSession}
          </button>
        </div>
      </form>

      <section className="session-section" aria-labelledby="sessions-title">
        <div className="section-heading">
          <h2 id="sessions-title">{copy.home.recentSessions}</h2>
          <span className="session-count">{copy.home.sessionCount(sessions.length)}</span>
        </div>

        {error ? <div className="notice notice-error">{error === 'public' ? copy.home.publicLoadError : copy.home.privateLoadError}</div> : null}
        {loading || !authReady ? <SessionListSkeleton /> : null}
        {!loading && authReady && sessions.length === 0 ? (
          <div className="empty-state">
            <h3>{copy.home.noSessions}</h3>
            <p>{copy.home.noSessionsDetail}</p>
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
  const { copy, language } = useI18n();

  return (
    <a className="session-card" href={`#/s/${encodeURIComponent(session.id)}`}>
      <div className="session-card-main">
        <div className="session-card-topline">
          <StateBadge state={session.state} />
          {session.status ? <span className="status-label">{copy.status[session.status]}</span> : null}
          <span className="session-output-count">{copy.home.outputCount(session.lastSeq ?? 0)}</span>
          <time>{formatTime(session.updatedAt?.toDate(), language)}</time>
        </div>
        <h3>{session.goal || copy.home.unnamedGoal}</h3>
        <p className="session-id">{session.id}</p>
      </div>
      <span className="card-arrow" aria-hidden="true">
        →
      </span>
    </a>
  );
}

export function StateBadge({ state }: { state: SessionState }) {
  const { copy } = useI18n();
  return <span className={`state-badge state-${state}`}>{copy.state[state]}</span>;
}

export function formatTime(date: Date | undefined, language: Language): string {
  if (!date) return language === 'zh' ? '刚刚' : 'Just now';
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function SessionListSkeleton() {
  const { copy } = useI18n();

  return (
    <div className="session-list" aria-label={copy.home.loadingSessions}>
      {[0, 1, 2].map((item) => (
        <div className="session-card skeleton-card" key={item}>
          <span className="skeleton-line skeleton-short" />
          <span className="skeleton-line" />
        </div>
      ))}
    </div>
  );
}
