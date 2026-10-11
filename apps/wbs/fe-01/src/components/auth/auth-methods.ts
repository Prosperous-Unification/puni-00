import { type AuthMethodId, listAuthMethods } from '@wbs/contracts';
import { useEffect, useState } from 'react';

import { browserClient } from '@/lib/http';

const methods = browserClient([listAuthMethods]);

/**
 * The sign-in buttons this deployment offers. `failed` carries no list: the
 * card then offers the provider's own chooser alone, so a broken read never
 * guesses a method.
 */
export type AuthMethodsState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly methods: readonly AuthMethodId[] }
  | { readonly kind: 'failed' };

/**
 * Reads the enabled methods through the shape-derived client, whose reply
 * validation is what keeps an id outside the catalogue from becoming a button.
 */
export async function readAuthMethods(signal: AbortSignal): Promise<AuthMethodsState> {
  const reply = await methods.getApiAuthMethods({ signal });
  if (reply.kind !== 'success') return { kind: 'failed' };
  return { kind: 'ready', methods: reply.body.methods.map(({ id }) => id) };
}

/** Reads the enabled methods once per mount; an unmounted card ignores the answer. */
export function useAuthMethods(): AuthMethodsState {
  const [state, setState] = useState<AuthMethodsState>({ kind: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    void readAuthMethods(controller.signal).then((next) => {
      if (!controller.signal.aborted) setState(next);
    });
    return () => {
      controller.abort();
    };
  }, []);
  return state;
}
