import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { HomePage } from './HomePage';
import { SessionPage } from './SessionPage';

function currentRoute(): string {
  return window.location.hash.slice(1) || '/';
}

export function App() {
  const [route, setRoute] = useState(currentRoute);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    const handleHashChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(
    () =>
      onAuthStateChanged(auth, (nextUser) => {
        setUser(nextUser);
        setAuthReady(true);
      }),
    [],
  );

  async function toggleAuth() {
    setAuthBusy(true);
    try {
      if (user) {
        await signOut(auth);
      } else {
        await signInWithPopup(auth, new GoogleAuthProvider());
      }
    } finally {
      setAuthBusy(false);
    }
  }

  const sessionMatch = route.match(/^\/s\/([^/]+)$/);

  return (
    <div className="app-shell">
      <Header user={user} authBusy={authBusy} onToggleAuth={toggleAuth} />
      {sessionMatch ? (
        <SessionPage sessionId={decodeURIComponent(sessionMatch[1])} user={user} authReady={authReady} onSignIn={toggleAuth} />
      ) : (
        <HomePage user={user} authReady={authReady} />
      )}
    </div>
  );
}

interface HeaderProps {
  user: User | null;
  authBusy: boolean;
  onToggleAuth: () => Promise<void>;
}

function Header({ user, authBusy, onToggleAuth }: HeaderProps) {
  return (
    <header className="site-header">
      <a className="wordmark" href="#/" aria-label="Sensei 首页">
        <span className="wordmark-mark" aria-hidden="true">
          S
        </span>
        <span>
          <strong>Sensei</strong>
          <small>学习现场</small>
        </span>
      </a>
      <div className="header-actions">
        {user?.email ? <span className="account-label">{user.email}</span> : null}
        <button className="button button-quiet" type="button" onClick={onToggleAuth} disabled={authBusy}>
          {authBusy ? '请稍候…' : user ? '退出登录' : '使用 Google 登录'}
        </button>
      </div>
    </header>
  );
}
