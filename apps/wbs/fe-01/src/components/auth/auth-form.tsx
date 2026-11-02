import {
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@ui/saas-01';
import { authMethod } from '@wbs/contracts';
import { type SubmitEvent, useEffect, useRef, useState } from 'react';

import { login, resetSession, type Session } from '@/lib/api';
import { failureMessage, unreachable } from '@/lib/http';
import { cn } from '@/lib/utils';

import { type AuthMethodsState, useAuthMethods } from './auth-methods';

const BROWSER_RECOVERY_MESSAGE =
  'The previous browser session could not be verified. Reset this browser session, then sign in again.';

/** Every declared login refusal has user-facing words; transport failures are separate. */
function refusalMessage(
  refusal: Extract<Awaited<ReturnType<typeof login>>, { kind: 'refusal' }>['body'],
): string {
  switch (refusal.error) {
    case 'invalid_credentials':
      return 'Username or password is incorrect.';
    case 'unauthenticated':
      return BROWSER_RECOVERY_MESSAGE;
    case 'not_found':
      return 'Password sign-in is not available on this server. Continue with SSO.';
    case 'invalid_origin':
      return 'This sign-in request was refused. Reload this page and try again.';
    case 'invalid_client':
    case 'invalid_body':
    case 'invalid_json':
    case 'invalid_query':
      return 'Password sign-in could not start. Reload and try again.';
    default:
      return unreachable(refusal);
  }
}

export interface AuthFormProps {
  /** The enabled sign-in buttons; see {@link useAuthMethods}. */
  methods: AuthMethodsState;
  onSignedIn: (session: Session) => void;
}

/** The query parameter the OIDC callback sends a refused sign-in back with. */
const AUTH_ERROR_PARAM = 'auth_error';

/**
 * What the card says about a refused SSO sign-in, in this app's own words.
 *
 * The keys are the public `auth_error` values emitted by the callback in
 * `apps/wbs/be-01/src/controller/auth-oidc-endpoints.ts`. That boundary collapses
 * every unpublished provider code to `provider_error`, and nothing else reaches
 * a reader: the provider's own
 * `error_description` is deliberately never sent, so this app chooses the words
 * on its own origin and there is no string here it did not write.
 *
 * `access_denied` does not say "you cancelled". An authorization server sends it
 * both when a person cancels and when a policy refuses them, and the two are
 * indistinguishable from here — so the message names the refusal and then offers
 * the second reading, which is the case where the reader most needs the hint.
 *
 * Only `temporarily_unavailable` and `provider_error` mention the password form,
 * because they are the only two a password can actually route around. Telling a
 * reader to give up on `consent_required` would be advice to abandon a step they
 * can finish in one click.
 */
const SSO_ERROR_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  browser_session_unverified: BROWSER_RECOVERY_MESSAGE,
  access_denied:
    'SSO sign-in was refused. If you did not cancel it, your account may not have access to this app.',
  account_selection_required:
    'SSO needs you to choose an account. Try again and pick the one you use here.',
  consent_required:
    'SSO needs your permission before this app can sign you in. Try again and accept the request.',
  interaction_required:
    'SSO needs a step it could not complete on its own. Try again and follow the prompts.',
  login_required: 'SSO needs you to sign in again. Try again to continue.',
  temporarily_unavailable:
    'SSO is temporarily unavailable. Try again in a few minutes, or sign in with a password.',
  provider_error: 'SSO sign-in did not complete. Try again, or sign in with a password.',
  // The reader just proved this address at a provider, so admitting that an
  // account holds it discloses nothing; no provider or method is named.
  account_exists:
    'An account already uses this email address with a different sign-in method. Sign in the way you did before, then add this method under Account.',
  // The provider sent no groups claim, so no session could work: an
  // identity-provider setup fault, not something the reader can retry away.
  groups_claim_missing:
    'SSO signed you in, but your identity provider sent no access groups for this app. Ask your administrator to set up access for your account.',
});

/**
 * The message for the code in the address, or '' for an absent or unpublished one.
 *
 * `Object.hasOwn` rather than a bare lookup: `?auth_error=toString` would
 * otherwise resolve through the prototype and render a function's source.
 */
function ssoErrorMessage(): string {
  if (typeof window === 'undefined') return '';
  const code = new URLSearchParams(window.location.search).get(AUTH_ERROR_PARAM);
  if (code === null || !Object.hasOwn(SSO_ERROR_MESSAGES, code)) return '';
  return SSO_ERROR_MESSAGES[code];
}

/**
 * Drops the parameter once it has been read, so a reload does not repeat the
 * message at a reader who has since signed in some other way.
 *
 * The current history state is passed back rather than `null`: this card renders
 * outside the router today, but discarding whatever state is there would be a
 * silent trap for whoever mounts it under one.
 */
function clearAuthError(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(AUTH_ERROR_PARAM)) return;
  url.searchParams.delete(AUTH_ERROR_PARAM);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

/*
 * `text-foreground no-underline` because these are anchors: the scoped reset
 * leaves `<a>` its user-agent blue underline, which made four stacked sign-in
 * choices read as body links rather than as the buttons beside the form.
 */
const methodButton = buttonVariants({
  variant: 'outline',
  className: 'text-foreground h-11 w-full no-underline',
});

/**
 * Pending cookie changes replace navigation with a disabled kit control.
 * Proof: bypassing this branch exposed a live href to the pending navigation negative.
 */
function SignInLink({ label, href, disabled }: { label: string; href: string; disabled: boolean }) {
  if (disabled) {
    return (
      <Button type="button" variant="outline" className="h-11 w-full" disabled aria-disabled="true">
        {label}
      </Button>
    );
  }
  return (
    <a className={methodButton} href={href}>
      {label}
    </a>
  );
}

/**
 * One full-width outline link per enabled method, in catalogue order. Loading
 * holds one button row so the card does not jump; a failed read says so
 * quietly and leaves the chooser link below as the way in.
 */
function MethodButtons({ methods, disabled }: { methods: AuthMethodsState; disabled: boolean }) {
  switch (methods.kind) {
    case 'loading':
      return (
        <div
          aria-hidden="true"
          className="bg-muted h-11 w-full animate-pulse rounded-md"
          data-auth-methods="loading"
        />
      );
    case 'failed':
      return (
        <p className="text-muted-foreground text-center text-sm" role="status">
          Other sign-in options could not be loaded. Continue with SSO, or reload to try again.
        </p>
      );
    case 'ready':
      return methods.methods.map((id) => (
        <SignInLink
          key={id}
          label={authMethod(id).label}
          disabled={disabled}
          href={`/api/auth/login?method=${id}`}
        />
      ));
    default:
      return unreachable(methods);
  }
}

/** The signed-out card with the deployment's enabled sign-in methods read once. */
export function SignInCard({ onSignedIn }: Pick<AuthFormProps, 'onSignedIn'>) {
  return <AuthForm methods={useAuthMethods()} onSignedIn={onSignedIn} />;
}

/** Offers the local password session beside the server-side Authorization Code flow. */
export function AuthForm({ methods, onSignedIn }: AuthFormProps) {
  const [error, setError] = useState('');
  // Bumped with every reply that sets `error`: it keys the sentence's node so
  // an identical second refusal is a new node the live region announces.
  const [replies, setReplies] = useState(0);
  const [busy, setBusy] = useState(false);
  const [passwordShown, setPasswordShown] = useState(false);
  /*
   * Read in an initializer and cleared in an effect, so the two halves cannot
   * fight: the read never mutates, and the effect never writes state, which is
   * what keeps StrictMode's second invocation a no-op instead of a message that
   * erases itself.
   */
  const [ssoError, setSsoError] = useState(ssoErrorMessage);
  const [canReset, setCanReset] = useState(() => ssoErrorMessage() === BROWSER_RECOVERY_MESSAGE);
  const [reset, setReset] = useState<
    { kind: 'idle' | 'pending' | 'success' } | { kind: 'failed'; message: string }
  >({ kind: 'idle' });
  // A ref also fences two events in one render, before disabled controls commit.
  // Proof: removing the reset guard made `reset prevents duplicate requests and
  // sign-in while pending` send two requests for two batched clicks (task-3 proof).
  const requestPending = useRef(false);

  const resetBrowser = async () => {
    if (requestPending.current) return;
    requestPending.current = true;
    setReset({ kind: 'pending' });
    try {
      const reply = await resetSession();
      // Proof: forcing success after refused/malformed/network replies made all
      // three `reset failure remains visible and retryable` cases lose their error.
      switch (reply.kind) {
        case 'success':
          setReset({ kind: 'success' });
          setCanReset(false);
          setError('');
          if (ssoError === BROWSER_RECOVERY_MESSAGE) setSsoError('');
          break;
        case 'refusal':
          setReset({
            kind: 'failed',
            message: 'Browser session reset was refused. Reload this page and try again.',
          });
          break;
        case 'failure':
          setReset({ kind: 'failed', message: failureMessage(reply.failure) });
          break;
        default:
          unreachable(reply);
      }
    } finally {
      requestPending.current = false;
    }
  };

  useEffect(() => {
    clearAuthError();
  }, []);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Proof: removing this fence made the pending reset test send a second
    // request when its password form was submitted directly.
    if (requestPending.current) return;
    requestPending.current = true;
    setReset({ kind: 'idle' });
    const values = new FormData(event.currentTarget);
    const username = values.get('username');
    const password = values.get('password');
    setBusy(true);
    // The last refusal stays until the reply replaces it: every branch below
    // sets `error` or signs in. Clearing it here shut the refusal row the
    // moment a retry was pressed and reopened it when the answer came, so the
    // form jumped twice per attempt (review of PR #466).
    try {
      const reply = await login(
        typeof username === 'string' ? username : '',
        typeof password === 'string' ? password : '',
      );
      switch (reply.kind) {
        case 'success':
          onSignedIn(reply.body);
          break;
        case 'refusal':
          setError(refusalMessage(reply.body));
          if (reply.body.error === 'unauthenticated') setCanReset(true);
          setReplies((count) => count + 1);
          break;
        case 'failure':
          setError(failureMessage(reply.failure));
          setReplies((count) => count + 1);
          break;
        default:
          unreachable(reply);
      }
    } catch {
      setError('Password sign-in could not start. Reload and try again.');
      setReplies((count) => count + 1);
    } finally {
      setBusy(false);
      requestPending.current = false;
    }
  };

  return (
    <Card data-sign-in-card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <Label>
            Username
            <Input className="h-11" name="username" autoComplete="username" required />
          </Label>
          {/*
           * The reveal sits outside the `Label` on purpose: `Label` documents
           * that every caller nests its control, and a `<button>` nested in a
           * `<label>` would take the caption's own clicks as well as its own.
           */}
          <div className="relative grid gap-1.5">
            <Label>
              Password
              <Input
                className="h-11 pr-16"
                name="password"
                type={passwordShown ? 'text' : 'password'}
                autoComplete="current-password"
                required
              />
            </Label>
            {/*
             * `type="button"` is load-bearing, not decoration: a bare `<button>`
             * inside a `<form>` submits it, so revealing the password would post
             * the half-typed credentials as a sign-in attempt.
             *
             * Proof: with this line deleted, `does not sign in when the password
             * is merely revealed` failed on `expected "spy" to not be called at
             * all, but actually been called 1 times`. Watched 2026-09-02.
             */}
            {/*
             * Styled through `buttonVariants` rather than by hand, because this
             * app's reset leaves `<button>` its platform box on purpose (see
             * `buttonVariants`' own note): a bare one here drew the grey chrome
             * box and the browser's focus outline over the field's right edge.
             * `ghost` brings `border-0 bg-transparent` and the ring the rest of
             * the chrome focuses with.
             */}
            <button
              className={buttonVariants({
                variant: 'ghost',
                className:
                  'text-muted-foreground hover:text-foreground absolute right-1 bottom-1 h-9 px-2.5 font-normal',
              })}
              type="button"
              aria-pressed={passwordShown}
              onClick={() => {
                setPasswordShown((shown) => !shown);
              }}
            >
              {passwordShown ? 'Hide' : 'Show'}
            </button>
          </div>
          {/*
           * The refusal's line opens only when there is something to say (UI
           * review F-052): it was a reserved `min-h-5` row between two form gaps,
           * so an ordinary visit had 52px of nothing between Password and its
           * button. The row animates from `0fr` to `1fr` rather than appearing,
           * so the button slides down instead of jumping; the live region itself
           * is always in the document, which is what makes a screen reader
           * announce text put into it. It shares a box with the button so the
           * form's gap is spent once when the line is shut.
           */}
          <div className="grid">
            <div
              data-refusal-row
              className={cn(
                'grid transition-[grid-template-rows] duration-150 ease-out motion-reduce:transition-none',
                error === '' ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
              )}
            >
              <p
                className="text-destructive min-h-0 overflow-hidden text-sm not-empty:pb-3"
                role="status"
                aria-live="polite"
              >
                {/*
                 * Keyed per reply (F-098): the same sentence twice is no change
                 * to a live region, so a retry with the same wrong password was
                 * silent. A new node is announced; the `<p>` and its row stay,
                 * so nothing moves. Absent while empty, for `not-empty:`.
                 *
                 * Proof, watched 2026-10-15 with `{error}` unkeyed: `announces
                 * an identical second refusal as a new line` failed on
                 * `expected Text{ …(1) } not to be Text{ …(1) }`.
                 */}
                {error !== '' && <span key={replies}>{error}</span>}
              </p>
            </div>
            <Button
              className="h-11 w-full"
              type="submit"
              // Proof: removing pending from disabled failed the password-button negative.
              disabled={busy || reset.kind === 'pending'}
            >
              Sign in with password
            </Button>
          </div>
        </form>
        {canReset && (
          <div className="grid gap-3">
            {ssoError === BROWSER_RECOVERY_MESSAGE && (
              <p className="text-destructive text-sm" role="status" aria-live="polite">
                {ssoError}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              disabled={busy || reset.kind === 'pending'}
              onClick={() => void resetBrowser()}
            >
              Reset browser session
            </Button>
            {reset.kind === 'pending' && (
              <p role="status" className="text-muted-foreground text-sm">
                Resetting browser session…
              </p>
            )}
            {reset.kind === 'failed' && (
              <p role="status" className="text-destructive text-sm">
                {reset.message}
              </p>
            )}
          </div>
        )}
        {reset.kind === 'success' && (
          <p role="status" className="text-muted-foreground text-sm">
            Browser session reset. Sign in again to continue.
          </p>
        )}
        <div className="grid gap-3">
          <div className="text-muted-foreground text-center text-sm">or</div>
          {/*
           * Conditional, not height-reserved. The password slot above opens its
           * row with a transition so its form does not jump as an error comes; this
           * one is shown once on arrival and never changes, so reserving a line
           * for it would leave a permanently empty message slot under the SSO
           * button on every ordinary visit.
           */}
          {ssoError === '' || ssoError === BROWSER_RECOVERY_MESSAGE ? null : (
            <p className="text-destructive text-sm" role="status" aria-live="polite">
              {ssoError}
            </p>
          )}
          <MethodButtons methods={methods} disabled={busy || reset.kind === 'pending'} />
          <SignInLink
            label="Continue with SSO"
            disabled={busy || reset.kind === 'pending'}
            href="/api/auth/login"
          />
        </div>
      </CardContent>
    </Card>
  );
}
