import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { HomePage } from './HomePage';
import { useI18n } from './i18n';
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
  const { copy, language, toggleLanguage } = useI18n();

  return (
    <header className="site-header">
      <a className="wordmark" href="#/" aria-label={copy.app.homeLabel}>
        <span className="wordmark-mark" aria-hidden="true">
          S
        </span>
        <span>
          <strong>Sensei</strong>
          <small>{copy.app.subtitle}</small>
        </span>
      </a>
      <div className="header-actions">
        {user?.email ? <span className="account-label">{user.email}</span> : null}
        <button
          className="language-toggle"
          type="button"
          onClick={toggleLanguage}
          aria-label={copy.app.languageToggle}
          title={copy.app.languageToggle}
        >
          <span className={language === 'en' ? 'is-active' : ''}>EN</span>
          <span aria-hidden="true">/</span>
          <span className={language === 'zh' ? 'is-active' : ''}>中</span>
        </button>
        <button className="button button-quiet" type="button" onClick={onToggleAuth} disabled={authBusy}>
          {authBusy ? copy.app.wait : user ? copy.app.signOut : copy.app.signIn}
        </button>
      </div>
    </header>
  );
}
