import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EDGE_UNAUTHORIZED, login, register, saveSession, type Session } from '@/lib/api';

const MESSAGES: Record<string, string> = {
  taken: 'That username is already registered. Try logging in.',
  invalid: 'Username must be 3–32 characters and the password at least 8.',
  invalid_credentials: 'Wrong username or password.',
  // Not this app's login: the site itself is behind an HTTP Basic gate on dev,
  // and a browser that cached a wrong password there keeps resending it without
  // re-prompting. Naming the layer is the whole point of this message.
  [EDGE_UNAUTHORIZED]:
    'The site password was rejected — that is the browser’s own prompt, not this form. ' +
    'Reload and re-enter it. If no prompt appears, your browser cached a wrong one: ' +
    'open a private window, or clear the saved entry for this site.',
  unexpected_response: 'The server replied with something this app could not read.',
};

export function AuthForm({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await (mode === 'login'
        ? login(username, password)
        : register(username, password));
      saveSession(session);
      onSignedIn(session);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'unknown';
      setError(MESSAGES[code] ?? `Something went wrong (${code}).`);
    } finally {
      setBusy(false);
    }
  }

  return (
    // The labels still wrap their inputs rather than pointing at them with
    // `htmlFor`. That is the association `getByLabel('Username')` resolves in
    // every test and every spec, and a swap that moved to ids would have had to
    // rewrite the tests to keep them passing — which is the wrong way round.
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{mode === 'login' ? 'Log in' : 'Register'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            void submit(e);
          }}
          className="grid gap-4"
        >
          <Label>
            Username
            <Input
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
              }}
              autoComplete="username"
              required
            />
          </Label>
          <Label>
            Password
            <Input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </Label>
          <Button type="submit" disabled={busy}>
            {busy ? 'Working…' : mode === 'login' ? 'Log in' : 'Create account'}
          </Button>
          {/*
            The same paragraph with the same silence to a screen reader as
            before — `#b00` becomes `text-destructive` and nothing else. A
            `role="alert"` belongs here and is deliberately not added by this
            change: the aria contract is what the swaps are held to, and
            improving one while restyling it hides the improvement in a diff
            about colour.
          */}
          {error !== null && <p className="text-destructive text-sm">{error}</p>}
          <Button
            type="button"
            variant="link"
            className="h-auto justify-self-start p-0"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
          >
            {mode === 'login' ? 'Need an account? Register' : 'Have an account? Log in'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
