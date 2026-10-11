import {
  AUTH_METHODS,
  type AuthMethodId,
  type ClientReply,
  readPasswordSession,
  startAuth0Link,
} from '@wbs/contracts';
import { useEffect, useState } from 'react';

import { readAuthMethods } from '@/components/auth/auth-methods';
import { authorizationTarget } from '@/components/onboarding/auth0-link';
import { browserClient, failureMessage, unreachable } from '@/lib/http';

const account = browserClient([readPasswordSession, startAuth0Link]);

/**
 * The methods the account menu may offer to add. `failed` offers none: adding
 * a method is optional, and a menu that could not read either list still signs
 * out and switches palettes.
 */
export type AddableMethods =
  | { readonly kind: 'ready'; readonly methods: readonly AuthMethodId[] }
  | { readonly kind: 'failed' };

/** Enabled methods minus those the account's mappings already hold, in catalogue order. */
export async function readAddableMethods(signal: AbortSignal): Promise<AddableMethods> {
  const [enabled, me] = await Promise.all([
    readAuthMethods(signal),
    account.getApiAuthMe({ signal }),
  ]);
  if (enabled.kind !== 'ready' || me.kind !== 'success' || me.body.user === null)
    return { kind: 'failed' };
  const linked = new Set(me.body.user.linkedMethods ?? []);
  return {
    kind: 'ready',
    methods: AUTH_METHODS.map(({ id }) => id).filter(
      (id) => enabled.methods.includes(id) && !linked.has(id),
    ),
  };
}

/** Where a link start sends the browser, or the words it answers instead. */
export type MethodLinkStart =
  | { readonly kind: 'leave'; readonly url: string }
  | { readonly kind: 'message'; readonly text: string };

/**
 * Starts linking `method` to the signed-in account. Only a provider session
 * can start without a password; a password session is told where its own
 * password form is.
 *
 * @throws when be-01 answers a location that is not absolute https
 *   ({@link authorizationTarget}).
 */
export async function startMethodLink(method: AuthMethodId): Promise<MethodLinkStart> {
  const reply = await account.postApiAuthLinkAuth0({ body: { method } });
  switch (reply.kind) {
    case 'success':
      return { kind: 'leave', url: authorizationTarget(reply.body.location).href };
    case 'failure':
      return { kind: 'message', text: failureMessage(reply.failure) };
    case 'refusal':
      return { kind: 'message', text: refusalWords(reply) };
    default:
      return unreachable(reply);
  }
}

function refusalWords(
  reply: Extract<ClientReply<typeof startAuth0Link>, { kind: 'refusal' }>,
): string {
  const error = reply.body.error;
  switch (error) {
    case 'invalid_credentials':
      return reply.status === 429
        ? 'Too many attempts. Wait a few minutes and try again.'
        : 'Sign in with Google, GitHub or an email code to add another method, or link from onboarding with your password.';
    case 'onboarding_inactive':
      return 'Adding sign-in methods is not available yet.';
    case 'invalid_client':
    case 'invalid_origin':
    case 'invalid_body':
    case 'invalid_query':
    case 'invalid_params':
    case 'invalid_json':
      return 'Could not start adding that method. Reload and try again.';
    default:
      return unreachable(error);
  }
}

/**
 * The account menu's add-method props: reads once per mount, and on a taken
 * item either leaves for the provider or keeps the answer to show.
 */
export function useAddSignInMethod(
  navigate: (url: string) => void = (url) => {
    window.location.assign(url);
  },
) {
  const [addable, setAddable] = useState<AddableMethods>({ kind: 'failed' });
  const [addMessage, setAddMessage] = useState('');
  const [fault, setFault] = useState<Error | null>(null);
  if (fault !== null) throw fault;
  useEffect(() => {
    const controller = new AbortController();
    void readAddableMethods(controller.signal).then((next) => {
      if (!controller.signal.aborted) setAddable(next);
    });
    return () => {
      controller.abort();
    };
  }, []);
  return {
    addMethods: addable.kind === 'ready' ? addable.methods : [],
    addMessage,
    onAddMethod: (method: AuthMethodId) => {
      setAddMessage('');
      startMethodLink(method).then(
        (start) => {
          if (start.kind === 'leave') navigate(start.url);
          else setAddMessage(start.text);
        },
        (cause: unknown) => {
          setFault(new Error('Unexpected sign-in method link failure', { cause }));
        },
      );
    },
  };
}
