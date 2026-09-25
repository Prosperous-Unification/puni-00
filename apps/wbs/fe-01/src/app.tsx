import { type ReactNode, useEffect, useState, useSyncExternalStore } from 'react';

import { AppRouter } from '@/app-router';
import { AuthForm } from '@/components/auth/auth-form';
import { AccountMenu } from '@/components/chrome/account-menu';
import { AppFaultBoundary } from '@/components/chrome/app-fault';
import { LifetimeFault } from '@/components/chrome/lifetime-fault';
import { PresencePanel } from '@/components/presence/presence-panel';
import { HintLayer } from '@/components/wbs/hint';
import { me as fetchMe, type Session } from '@/lib/api';
import { failureMessage, unreachable } from '@/lib/http';
import { ThemeProvider, useThemeChoice } from '@/lib/theme';
import type { ProjectApi } from '@/lib/wbs-api';
import type { ProjectOwner } from '@/runtime/project-runtime';
import { createSessionOwner, sessionFor, type SessionOwner } from '@/runtime/session-runtime';

/**
 * The document's whole app, inside the boundary that catches what it throws.
 *
 * The split is what makes the boundary outermost: everything with state, an
 * effect or a child is in {@link AppContent}, and this component has none of
 * the three, so there is nothing above the boundary left to throw. Wrapping
 * only the signed-in branch would have left the session check — the effect that
 * runs before anything is on screen — outside it.
 *
 * See {@link AppFaultBoundary} for why the fallback offers a reload and not a
 * retry.
 */
export function App() {
  return (
    <AppFaultBoundary>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </AppFaultBoundary>
  );
}

/**
 * The account menu, wired to the live theme rather than to a prop.
 *
 * `account` is a React element passed through the router's frozen match
 * context, so a `theme` prop baked into it would keep the value it was built
 * with until the next navigation — choosing Dark would repaint the page while
 * the control kept reporting `System`. The theme is read back through
 * {@link useThemeChoice} instead, so the control follows the stored choice
 * live and after a reload. `username` and `onSignOut` are safe as props: they
 * change only at sign-in and sign-out, which remounts this element.
 */
function ThemedAccountMenu({
  username,
  onSignOut,
}: {
  username: string;
  onSignOut: () => void;
}): React.JSX.Element {
  const { choice, chooseTheme } = useThemeChoice();
  return (
    <AccountMenu
      username={username}
      theme={choice}
      onChooseTheme={chooseTheme}
      onSignOut={onSignOut}
    />
  );
}

function AppContent() {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [sessionError, setSessionError] = useState('');

  // Session refusal and unavailable verification are distinct rendered states.
  useEffect(() => {
    void fetchMe()
      .then((reply) => {
        switch (reply.kind) {
          case 'success':
            if (reply.body.user !== null) setSession({ token: '', user: reply.body.user });
            return;
          case 'failure':
            setSessionError(failureMessage(reply.failure));
            return;
          case 'refusal':
            switch (reply.body.error) {
              case 'invalid_token':
                return;
              case 'invalid_body':
              case 'invalid_query':
              case 'invalid_params':
                setSessionError('Could not check your session. Reload and try again.');
                return;
              default:
                return unreachable(reply.body);
            }
          default:
            return unreachable(reply);
        }
      })
      .catch(() => {
        setSessionError('Could not check your session. Reload and try again.');
      })
      .finally(() => {
        setChecked(true);
      });
  }, []);

  if (!checked)
    return (
      <main className="bg-background text-muted-foreground min-h-full p-8 font-sans">Loading…</main>
    );

  if (session === null)
    return (
      // The page's own type and colour, which used to be `fontFamily:
      // 'sans-serif'` inline — the browser's generic sans, whatever that was on
      // the machine. `font-sans` is the named stack `styles.css` declares, and
      // the two colour tokens are what a dark set would re-point.
      <main className="bg-background text-foreground min-h-full p-8 font-sans">
        {/*
         * The tracer for the Tailwind integration, and still the assertion
         * `e2e/tailwind.spec.ts` reads the computed letter-spacing off. The
         * explicit size and weight beside it are not decoration: the scoped
         * reset in `styles.css` takes an `h1`'s user-agent font-size and weight
         * away, the way every reset does, so a heading now says how big it is.
         *
         * The signed-out page keeps its own layout: it is a form on an empty
         * page, it fits any window, and giving it the signed-in page's
         * viewport-height flex would buy nothing and cost a second thing to
         * keep in step.
         */}
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">WBS tool v2</h1>
        {sessionError !== '' && <p role="alert">{sessionError}</p>}
        <AuthForm onSignedIn={setSession} />
      </main>
    );

  return (
    <SignedInApp
      session={session}
      onSignedOut={() => {
        setSession(null);
      }}
    />
  );
}

/** What the signed-in region is drawn from. */
export interface SignedInAppProps {
  /** The identity the gate let in: from the startup check, or from a password login. */
  session: Session;
  /**
   * Called once a log out has retired the session's project and then the
   * session, and only then: the signed-out state it renders is the last thing a
   * log out does, never the first.
   */
  onSignedOut: () => void;
  /** Injected in tests; the app lets it default to the real owner. */
  openOwner?: () => SessionOwner;
  /**
   * The project page's client, injected in tests so a route can be driven over
   * a project the test holds; the app passes none, and the page builds the real
   * one from the session's credential.
   */
  projectApi?: ProjectApi;
}

/**
 * Everything a signed-in reader sees, drawn from the runtime of the user it is
 * drawn for.
 *
 * **One session owner per mount**, keyed by the user id: the identity it is
 * handed is opened in an effect, never in render, and an identity for the user
 * already opened — the same account arriving with another credential — changes
 * nothing, so the router below keeps its instance, its address and whatever a
 * mounted route holds. Another user withdraws the previous runtime, and its
 * project with it, before anything else happens. The owner holds nothing until
 * it is asked to open, so Strict Mode's discarded initializer leaks nothing, and
 * the region going gives the session back.
 *
 * The router is drawn only while the owner publishes **this** user's runtime —
 * see {@link sessionFor} — and the sanitized fatal state when the runtime
 * could not be built or given back.
 *
 * **Log out is the owner's local exit** ({@link SessionOwner.exit}): the account
 * menu's `Log out` withdraws the session and its project at once, so the region
 * stops drawing them before anything is closed, sends no request, and hands the
 * signed-out state up through `onSignedOut` only when the project and then the
 * session have both let go. When either could not — a socket that refused or
 * never closed within the retirement budget — the owner is `fatal` and this draws
 * that instead; nothing retired is drawn again, and the page's Reload is the way
 * on.
 */
export function SignedInApp({
  session,
  onSignedOut,
  openOwner = createSessionOwner,
  projectApi,
}: SignedInAppProps): React.JSX.Element {
  const [sessionOwner] = useState(openOwner);
  const sessionState = useSyncExternalStore(sessionOwner.subscribe, sessionOwner.snapshot);
  useEffect(() => {
    // Proof: on 2026-09-24, opening with an empty credential (g4) failed `builds a password
    // session’s directory from the credential the login answered`: expected [ '' ] to deeply
    // equal [ 'tok' ].
    void sessionOwner.open({ userId: session.user.id, credential: session.token });
  }, [sessionOwner, session]);
  useEffect(
    () => () => {
      // Proof: on 2026-09-24, an unmount cleanup that left nothing (g3) failed `gives the session
      // back when the signed-in region goes`: expected 'live' to be 'empty'.
      void sessionOwner.leave();
    },
    [sessionOwner],
  );
  // Proof: on 2026-09-24, never drawing the fault (g2) failed `shows the sanitized report when
  // the session cannot be built` with `Error: no fatal state yet`: no [data-lifetime-fault] drawn.
  if (sessionState.status === 'fatal') return <LifetimeFault fault={sessionState.fault} />;
  const services = sessionFor(sessionState, session.user.id);
  if (services === null)
    return (
      <main className="bg-background text-muted-foreground min-h-full p-8 font-sans">Loading…</main>
    );
  const signOut = (): void => {
    void sessionOwner.exit().then((exit) => {
      // Proof: on 2026-09-24, signing out whatever the exit settled (a2) failed `shows the fatal
      // state instead of signing out when the project will not let go`: expected
      // [ 'signed out' ] to not include 'signed out'.
      if (exit === 'signed-out') onSignedOut();
    });
  };

  return (
    /*
     * The signed-in page is exactly one window tall, and that is what makes the
     * table's frame the thing that scrolls: `h-full` fixes the outer height —
     * against `#root`, `body` and `html`, which `styles.css` gives the window's
     * height and which is `100vh` done in a way CSS `zoom` cannot lie about —
     * the header takes what it needs, and the frame takes the rest. A `min-h-`
     * of anything would grow with the table instead: the frame would be as tall
     * as its own content, nothing would ever scroll inside it, and the sticky
     * heading row would ride up the page. See `table-frame.ts`.
     *
     * Nothing here hides the overflow. A window too short for the frame's own
     * minimum leaves the page scrolling vertically, which is the honest fallback:
     * clipping it would put rows below the fold with no way to reach them.
     */
    <div className="bg-background text-foreground flex h-full flex-col font-sans">
      {/*
       * Every hint in this app, in one card. Mounted here rather than per page
       * because it is driven by an attribute and not by a prop: any control
       * anywhere under this element that carries `data-hint` is hinted, and
       * there is exactly one card and one listener for all of them. See
       * {@link HintLayer} for why that is what makes it stale-proof.
       */}
      <HintLayer />
      {/*
       * The router is mounted **here**, inside the branch the gate already
       * chose, and never around it. That is what makes a signed-out
       * `/directory` the sign-in form with the address left alone rather than a
       * redirect to a `/sign-in` nobody asks for by name, and it is why signing
       * in continues to the page that was asked for: nothing rewrote it.
       * ADR 0004 has the alternatives.
       */}
      <ProjectRetirementGate projects={services.projects}>
        <AppRouter
          session={services}
          token={session.token}
          projectApi={projectApi}
          presence={
            // The panel is presentational and the roster is the page's, because
            // it arrives on the table's own socket — one connection per browser
            // since 2026-09-02. What the session contributes is the username the
            // panel marks as "you".
            // Proof: renaming the shared login response username to displayName produced
            // TS2339 here and at AccountMenu below in the actual FE app typecheck.
            (roster) => <PresencePanel me={session.user.username} {...roster} />
          }
          // Proof: on 2026-09-24, handing the menu onSignedOut itself (a1) failed `signs out once
          // the project and then the session have let go, and sends nothing`: expected
          // [ 'signed out' ] to deeply equal [ 'project given back', …(2) ].
          account={<ThemedAccountMenu username={session.user.username} onSignOut={signOut} />}
        />
      </ProjectRetirementGate>
    </div>
  );
}

/**
 * The router of one live session, until the session's project could not be
 * given back — and from then on the sanitized fatal state in its place.
 *
 * A project page draws its own project's fatal state while it is mounted. This
 * is for the retirements nobody is left to draw: the project page going — a
 * route change, Strict Mode's cleanup — gives the project back from its own
 * effect cleanup, after the page is gone, and a socket that refuses or outruns
 * the budget there would otherwise leave the owner terminally `fatal` with
 * nothing on screen saying so. Only a **terminal** fault is drawn here: a
 * project whose construction failed holds nothing, and the page that asked for
 * it is still there to say so.
 */
function ProjectRetirementGate({
  projects,
  children,
}: {
  projects: ProjectOwner;
  children: ReactNode;
}): ReactNode {
  const projectState = useSyncExternalStore(projects.subscribe, projects.snapshot);
  // Proof: on 2026-09-24, never drawing a terminal project fault (p1) failed `draws the fatal
  // state in the region’s place when its project cannot be given back outside a log out` with
  // `Error: no fatal state yet`: the directory stayed on screen.
  if (projectState.status === 'fatal' && projectState.terminal)
    return <LifetimeFault fault={projectState.fault} />;
  return children;
}
