/**
 * A sign-in method WBS offers as a direct button. The id is ours; the
 * connection is the identity provider's connection name sent as the
 * `/authorize` `connection` parameter (Auth0 tenant defaults).
 */
export interface AuthMethod {
  readonly id: AuthMethodId;
  readonly connection: string;
  /** The sign-in button's words. */
  readonly label: string;
  /** The account menu's words for linking this method to a signed-in account. */
  readonly addLabel: string;
}

export type AuthMethodId = 'google' | 'github' | 'email' | 'apple';

/**
 * The closed method catalogue in display order. `email` is Auth0's
 * passwordless email one-time code: Auth0 does not support magic links in
 * Universal Login. Enabling a method is configuration (`AUTH_METHODS`), so the
 * `apple` entry ships before its connection exists.
 */
export const AUTH_METHODS: readonly AuthMethod[] = [
  {
    id: 'google',
    connection: 'google-oauth2',
    label: 'Continue with Google',
    addLabel: 'Add Google',
  },
  { id: 'github', connection: 'github', label: 'Continue with GitHub', addLabel: 'Add GitHub' },
  {
    id: 'email',
    connection: 'email',
    label: 'Continue with an email code',
    addLabel: 'Add an email code sign-in',
  },
  { id: 'apple', connection: 'apple', label: 'Continue with Apple', addLabel: 'Add Apple' },
];

/** Narrows an untrusted string to a catalogue id without consulting the prototype chain. */
export function isAuthMethodId(value: string): value is AuthMethodId {
  return AUTH_METHODS.some(({ id }) => id === value);
}

/**
 * The method an identity-provider subject was minted by, read from Auth0's
 * `{connection}|{id}` subject shape; `null` for a subject of no catalogue
 * connection (an enterprise or database identity).
 */
export function authMethodOfSubject(subject: string): AuthMethodId | null {
  return AUTH_METHODS.find(({ connection }) => subject.startsWith(`${connection}|`))?.id ?? null;
}

/** The catalogue entry for a known id. */
export function authMethod(id: AuthMethodId): AuthMethod {
  const found = AUTH_METHODS.find((method) => method.id === id);
  // The id type is the catalogue's own key set, so this is unreachable unless the two drift.
  if (found === undefined) throw new Error(`auth method ${id} is not in the catalogue`);
  return found;
}

/**
 * Parses the required `AUTH_METHODS` setting: a comma list of catalogue ids, or
 * the literal `none` for the provider's own chooser only. Returns the enabled
 * ids in catalogue order.
 *
 * @throws when the value is missing, empty, names an unknown id, repeats an id
 *   or mixes `none` with ids: no method set is ever defaulted.
 */
export function parseAuthMethods(value: string | undefined): readonly AuthMethodId[] {
  if (value === undefined || value.trim() === '')
    throw new Error('AUTH_METHODS is required in AUTH_MODE=oidc (a comma list of methods or none)');
  if (value.trim() === 'none') return [];
  const named = value.split(',').map((part) => part.trim());
  const enabled = new Set<AuthMethodId>();
  for (const name of named) {
    if (!isAuthMethodId(name))
      throw new Error(
        `AUTH_METHODS names ${JSON.stringify(name)}, which is not one of ${AUTH_METHODS.map(({ id }) => id).join(', ')} or none`,
      );
    if (enabled.has(name)) throw new Error(`AUTH_METHODS names ${name} twice`);
    enabled.add(name);
  }
  return AUTH_METHODS.map(({ id }) => id).filter((id) => enabled.has(id));
}
