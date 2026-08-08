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

  if (!checked)
    return (
      <main className="bg-background text-muted-foreground min-h-screen p-8 font-sans">
        Loading…
      </main>
    );

  return (
    // The page's own type and colour, which used to be `fontFamily:
    // 'sans-serif'` inline — the browser's generic sans, whatever that was on
    // the machine. `font-sans` is the named stack `styles.css` declares, and
    // the two colour tokens are what a dark set would re-point.
    <main className="bg-background text-foreground min-h-screen p-8 font-sans">
      {/*
       * The tracer for the Tailwind integration, and still the assertion
       * `e2e/tailwind.spec.ts` reads the computed letter-spacing off. The
       * explicit size and weight beside it are not decoration: the scoped reset
       * in `styles.css` takes an `h1`'s user-agent font-size and weight away,
       * the way every reset does, so a heading now says how big it is.
       */}
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">WBS tool v2</h1>
      {session === null ? (
        <AuthForm onSignedIn={setSession} />
      ) : (
        <>
          <p className="text-muted-foreground mb-4 flex items-center gap-2 text-sm">
            <span>
              Signed in as{' '}
              <strong className="text-foreground font-medium">{session.user.username}</strong>
            </span>
            <Button
              variant="outline"
              size="sm"
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
