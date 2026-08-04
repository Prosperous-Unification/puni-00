import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { login, register, saveSession, type Session } from '@/lib/api';

const MESSAGES: Record<string, string> = {
  taken: 'That username is already registered. Try logging in.',
  invalid: 'Username must be 3–32 characters and the password at least 8.',
  invalid_credentials: 'Wrong username or password.',
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
    <form
      onSubmit={(e) => {
        void submit(e);
      }}
      style={{ display: 'grid', gap: 12, maxWidth: 320 }}
    >
      <h2 style={{ margin: 0 }}>{mode === 'login' ? 'Log in' : 'Register'}</h2>
      <label style={{ display: 'grid', gap: 4 }}>
        Username
        <input
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
          }}
          autoComplete="username"
          required
        />
      </label>
      <label style={{ display: 'grid', gap: 4 }}>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
        />
      </label>
      <Button type="submit" disabled={busy}>
        {busy ? 'Working…' : mode === 'login' ? 'Log in' : 'Create account'}
      </Button>
      {error !== null && <p style={{ color: '#b00', margin: 0 }}>{error}</p>}
      <button
        type="button"
        onClick={() => {
          setMode(mode === 'login' ? 'register' : 'login');
          setError(null);
        }}
        style={{ background: 'none', border: 0, color: '#06c', cursor: 'pointer', padding: 0 }}
      >
        {mode === 'login' ? 'Need an account? Register' : 'Have an account? Log in'}
      </button>
    </form>
  );
}
