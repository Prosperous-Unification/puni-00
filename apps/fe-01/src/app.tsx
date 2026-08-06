import { useEffect, useState } from 'react';

import { AuthForm } from '@/components/auth/auth-form';
import { PresencePanel } from '@/components/presence/presence-panel';
import { Button } from '@/components/ui/button';
import { ProjectPage } from '@/components/wbs/project-page';
import { loadSession, me as fetchMe, saveSession, type Session } from '@/lib/api';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);

  // A token in localStorage is a claim, not a session. It is checked against
  // /api/auth/me before the app renders as signed in, so an expired or
  // revoked token shows the login form instead of a UI that fails on every
  // request.
  useEffect(() => {
    const stored = loadSession();
    if (stored === null) {
      setChecked(true);
      return;
    }
    // `.catch` is not optional here: a rejected fetch — the site gate refusing
    // the request, a dropped connection — would otherwise leave `checked` false
    // forever and the app stuck on "Loading…", with no way to reach the form
    // that could fix it. A failed check means "not signed in", never "wait".
    void fetchMe(stored.token)
      .then((user) => {
        if (user === null) saveSession(null);
        else setSession({ token: stored.token, user });
      })
      .catch(() => {
        saveSession(null);
      })
      .finally(() => {
        setChecked(true);
      });
  }, []);

  if (!checked) return <main style={{ padding: 32 }}>Loading…</main>;

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif' }}>
      <h1>WBS tool v2</h1>
      {session === null ? (
        <AuthForm onSignedIn={setSession} />
      ) : (
        <>
          <p>
            Signed in as <strong>{session.user.username}</strong>{' '}
            <Button
              onClick={() => {
                saveSession(null);
                setSession(null);
              }}
            >
              Log out
            </Button>
          </p>
          <ProjectPage token={session.token} />
          <PresencePanel token={session.token} me={session.user.username} />
        </>
      )}
    </main>
  );
}
