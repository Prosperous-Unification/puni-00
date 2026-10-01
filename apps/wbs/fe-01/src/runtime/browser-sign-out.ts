import type { logout as logoutBrowser } from '@/lib/api';

import type { SessionExit } from './session-runtime';

type ServerReply = Awaited<ReturnType<typeof logoutBrowser>>;

export type BrowserSignOutState =
  | { readonly kind: 'pending' }
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'fatal' }
  | { readonly kind: 'overtaken' }
  | { readonly kind: 'fault'; readonly error: Error }
  | {
      readonly kind: 'failure';
      readonly reason: 'refused' | 'transport' | 'contract' | 'timeout' | 'cancelled';
    };

interface SignOutDependencies {
  readonly logout: (token: string, signal: AbortSignal) => Promise<ServerReply>;
  readonly publish: (state: BrowserSignOutState) => void;
  readonly budgetMs: number;
}

/** Coordinates one browser logout without letting a stale attempt publish. */
export function createBrowserSignOut({ logout, publish, budgetMs }: SignOutDependencies) {
  if (!Number.isSafeInteger(budgetMs) || budgetMs <= 0)
    throw new Error('browser logout requires a finite positive budget');
  let revision = 0;
  let disposed = false;
  let active: { revision: number; abort: AbortController; clear: () => void } | null = null;

  const invalidate = () => {
    revision++;
    active?.clear();
    active?.abort.abort();
    active = null;
  };

  return {
    /** Re-arms after React Strict Mode's effect cleanup/setup cycle. */
    resume: () => {
      disposed = false;
    },
    /** A new credential, even for the same user, supersedes an old acknowledgment. */
    // Proof: replacing invalidate with a no-op left the old request un-aborted;
    // the stale-acknowledgment test failed before the newer session was protected.
    acceptSession: invalidate,
    /** Unmount cancels observation; a cancelled request has an unknown server outcome. */
    dispose: () => {
      disposed = true;
      invalidate();
    },
    /** Withdraws the owner and dispatches the server request in the gesture turn. */
    start: (token: string, exit: () => Promise<SessionExit>): void => {
      if (disposed) return;
      if (active?.revision === revision) return;
      const abort = new AbortController();
      let clear: () => void = () => undefined;
      const attempt = {
        revision,
        abort,
        clear: () => {
          clear();
        },
      };
      active = attempt;
      let local: Promise<SessionExit>;
      try {
        // Proof: deferring exit until after the HTTP reply left the live
        // project callable while server logout was pending.
        local = exit();
      } catch (cause) {
        local = Promise.reject(
          cause instanceof Error ? cause : new Error('local sign-out failed', { cause }),
        );
      }
      let remote: Promise<ServerReply>;
      try {
        // Proof: awaiting local disposal before dispatch let a held socket
        // postpone durable revocation beyond the sign-out gesture.
        remote = logout(token, abort.signal);
      } catch (cause) {
        remote = Promise.reject(
          cause instanceof Error ? cause : new Error('server sign-out failed', { cause }),
        );
      }
      let timeoutId: ReturnType<typeof setTimeout>;
      const timeout = new Promise<'timeout'>((resolve) => {
        timeoutId = setTimeout(() => {
          abort.abort();
          resolve('timeout');
        }, budgetMs);
      });
      clear = () => {
        clearTimeout(timeoutId);
      };
      publish({ kind: 'pending' });
      void Promise.allSettled([local, Promise.race([remote, timeout])]).then(
        ([retirement, server]) => {
          clear();
          // Proof: a delayed 204 from an old same-user credential must not
          // sign out the newer session or publish after unmount.
          if (disposed || active !== attempt || attempt.revision !== revision) return;
          active = null;
          if (retirement.status === 'rejected') {
            // Proof: the watched exit rejection was previously rendered as a
            // retryable local failure, masking an unexpected lifetime fault.
            publish({
              kind: 'fault',
              error:
                retirement.reason instanceof Error
                  ? retirement.reason
                  : new Error('unexpected local sign-out failure', { cause: retirement.reason }),
            });
            return;
          }
          // Proof: disabling this check let a server 204 publish signed-out
          // after a fatal local retirement; the focused outcome test failed.
          if (retirement.value === 'fatal' || retirement.value === 'overtaken') {
            publish({ kind: retirement.value });
            return;
          }
          if (server.status === 'rejected') {
            publish({
              kind: 'fault',
              error:
                server.reason instanceof Error
                  ? server.reason
                  : new Error('unexpected logout adapter failure', { cause: server.reason }),
            });
            return;
          }
          if (server.value === 'timeout') {
            publish({ kind: 'failure', reason: 'timeout' });
            return;
          }
          const reply = server.value;
          // Proof: treating a 401 refusal as acknowledgment made the mounted
          // onboarding logout test draw sign-in instead of its visible failure.
          if (reply.kind === 'success') {
            publish({ kind: 'signed-out' });
            return;
          }
          if (reply.kind === 'refusal') {
            publish({ kind: 'failure', reason: 'refused' });
            return;
          }
          publish({
            kind: 'failure',
            reason:
              reply.failure.code === 'cancelled'
                ? 'cancelled'
                : reply.failure.code === 'transport'
                  ? 'transport'
                  : 'contract',
          });
        },
      );
    },
  };
}
