import {
  type ClientReply,
  loginPassword,
  logoutOidcSession,
  readPasswordSession,
  registerPassword,
} from '@wbs/contracts';

import { browserClient } from './http';

/** The successful session is inferred from the shared login response declaration. */
export type Session = Extract<ClientReply<typeof loginPassword>, { kind: 'success' }>['body'];
export type SessionUser = Session['user'];

const sessions = browserClient([
  registerPassword,
  loginPassword,
  readPasswordSession,
  logoutOidcSession,
]);

/** Returns validated success, application refusal or transport/contract failure. */
export const register = (username: string, password: string) =>
  sessions.postApiAuthRegister({ body: { username, password } });

/**
 * The screen chooses words from the declared refusal, never an Error.message code.
 * Proof: bypassing this client with raw JSON left the malformed-response screen
 * error empty instead of its expected server-response message (auth-form.test.tsx).
 */
export const login = (username: string, password: string) =>
  sessions.postApiAuthLogin({ body: { username, password } });

/** A null user or invalid_token means signed out; boundary failures stay distinct. */
export const me = () => sessions.getApiAuthMe({});

/** Requests durable browser logout with the one credential the session supplied. */
export const logout = (token: string, signal: AbortSignal) =>
  sessions.postApiAuthLogout({
    signal,
    // Proof: dropping this explicit native header made the shape-derived
    // adapter test send a JSON-issued session without any identity proof.
    ...(token === '' ? {} : { headers: { authorization: `Bearer ${token}` } }),
  });

/** The access cookie authenticates the upgrade; the URL carries no credential. */
export function websocketUrl(): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/ws`;
}
