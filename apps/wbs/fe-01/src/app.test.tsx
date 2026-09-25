import type * as Router from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DiBag } from 'di-bag';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Api from '@/lib/api';
import { ThemeProvider } from '@/lib/theme';
import { fakeDirectoryApi } from '@/modules/directory/fake-directory-api';
import { browserStorage } from '@/modules/preferences/browser-storage.repository';
import { projectServicesOver } from '@/modules/project/composition';
import { type ApplicationServices, installApplicationRuntime } from '@/runtime/application-runtime';
import { ApplicationServicesProvider } from '@/runtime/application-services-context';
import { createLifetimeSlot, type LifetimeSlot } from '@/runtime/lifetime-slot';
import { installProjectRuntime } from '@/runtime/project-runtime';
import {
  createSessionOwner,
  installSessionRuntime,
  type SessionOwner,
} from '@/runtime/session-runtime';
import { fakeProjectApi } from '@/testing/fake-project-api';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

const me = vi.hoisted(() => vi.fn<() => ReturnType<typeof Api.me>>());
const login = vi.hoisted(() =>
  vi.fn<(username: string, password: string) => ReturnType<typeof Api.login>>(),
);

/**
 * Every router the signed-in region builds, by identity: `AppRouter` builds one
 * in a lazy state initializer, so a region that kept its router built exactly
 * one, and a region rebuilt for another user built a second.
 */
const routers = vi.hoisted((): unknown[] => []);

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof Router>();
  const recordRouter: typeof actual.createRouter = (options) => {
    const router = actual.createRouter(options);
    routers.push(router);
    return router;
  };
  return { ...actual, createRouter: recordRouter };
});

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  me,
  login,
}));

const { App, SignedInApp } = await import('./app');

/**
 * A slot `live` over the production installer, its liveness predicate wired
 * exactly as `acquireApplicationRuntime` wires the real one, rebuilt fresh every
 * test and retired in `afterEach` **after** React cleanup.
 *
 * `<App/>`'s own tree includes `ThemeProvider`, which reads
 * `useApplicationServicesState()` (see `lib/theme.ts`), and the theme-control
 * block below persists a choice across an unmount and a fresh mount — which
 * needs a real, live store behind it.
 */
let servicesSlot: LifetimeSlot<ApplicationServices>;

const renderApp = () =>
  render(
    <ApplicationServicesProvider slot={servicesSlot}>
      <App />
    </ApplicationServicesProvider>,
  );

const muteConsoleError = () =>
  // React writes a caught error to `console.error` whatever a boundary does.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

let logged: ReturnType<typeof muteConsoleError>;

beforeEach(async () => {
  me.mockResolvedValue({
    kind: 'refusal',
    representation: 'json',
    status: 401,
    body: { error: 'invalid_token' },
    headers: new Headers(),
  });
  logged = muteConsoleError();
  window.history.replaceState({}, '', '/');
  servicesSlot = createLifetimeSlot<ApplicationServices>(50);
  await servicesSlot.replace(() =>
    installApplicationRuntime({
      openStore: browserStorage,
      isLive: () => servicesSlot.snapshot().status === 'live',
    }),
  );
});

afterEach(async () => {
  // React cleanup first, so nothing renders against a slot already retiring.
  cleanup();
  await servicesSlot.retire();
  logged.mockRestore();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('the app root', () => {
  itDom('shows the sign-in link when there is no browser session', async () => {
    renderApp();

    // The boundary is transparent when nothing throws: the app it wraps is
    // what renders, and this is what says so.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'WBS tool v2' })).toBeDefined();
    });
    expect(document.querySelector('[data-app-fault]')).toBeNull();
  });

  itDom('shows sign-in quietly when the server reports no browser session', async () => {
    me.mockResolvedValue({
      kind: 'success',
      representation: 'json',
      status: 200,
      body: { user: null },
      headers: new Headers(),
    });

    renderApp();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'WBS tool v2' })).toBeDefined();
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(logged).not.toHaveBeenCalled();
  });

  itDom('offers sign-in when the session check fails', async () => {
    me.mockRejectedValue(new Error('network down'));

    renderApp();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Continue with SSO' })).toBeDefined();
    });
    expect(document.querySelector('[data-app-fault]')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Could not check your session');
  });
});

/**
 * The gate, and the address it is asked for while it is shut.
 *
 * Both halves are here rather than in `app-router.test.tsx` because the claim
 * is about the **order** of the two: the router is mounted inside the branch
 * the gate already chose, so a signed-out visitor gets the form at every
 * address, and nothing rewrites the address on the way in.
 */
describe('a signed-in address asked for while signed out', () => {
  itDom('draws the sign-in form and no directory', async () => {
    window.history.replaceState({}, '', '/directory');

    renderApp();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Continue with SSO' })).toBeDefined();
    });
    // The whole of the negative below: with the router hoisted above the gate,
    // this heading is on screen for somebody with no session at all.
    expect(screen.queryByRole('heading', { name: 'Directory' })).toBeNull();
    expect(window.location.pathname).toBe('/directory');
  });

  /**
   * Proof: the router hoisted above the gate — `app.tsx`'s
   * `if (session === null)` branch made unreachable so `<AppRouter>` is
   * mounted whether or not there is a session, the token passed as
   * `session?.token ?? ''` — and **both** tests in this block were watched
   * failing on `Unable to find role="button" and name "Log in"`, the directory
   * drawn to a visitor holding no session at all. Restored. Watched
   * 2026-08-09.
   */
  itDom('honours the address it was opened at, once the account is in', async () => {
    window.history.replaceState({}, '', '/directory');
    me.mockResolvedValue({
      kind: 'success',
      representation: 'json',
      status: 200,
      body: { user: { id: 'u1', username: 'kat', scopes: ['read', 'write'] } },
      headers: new Headers(),
    });
    // The directory page reads on arrival; it is the page under the address
    // rather than the subject here, so its two reads answer empty.
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) => {
        const collection = path.split('/').at(-1) ?? 'unknown';
        return Promise.resolve(new Response(JSON.stringify({ [collection]: [] }), { status: 200 }));
      }),
    );

    renderApp();

    // The page that was asked for, not the project — and the address it was
    // asked at, unrewritten.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Directory' })).toBeDefined();
    });
    expect(screen.queryByRole('combobox', { name: 'Project' })).toBeNull();
    expect(window.location.pathname).toBe('/directory');
  });
});

/**
 * The theme control, exercised through the whole app rather than the hook and
 * menu in isolation.
 *
 * The seam `wbs-theme-indicator-lies` found lives where `useTheme`'s choice is
 * carried into the account menu: as a React element baked through the router's
 * frozen match context, a `theme` prop holds the value it was built with until
 * the next navigation — so choosing `Dark` repaints the page while the control
 * keeps reporting `System`. A harness that mounts `AccountMenu` beside
 * `useTheme` never sees that, which is why this drives the real `App`. The
 * first case is the live half, the second the reload half; both were watched
 * failing before the theme moved into `ThemeProvider`/`useThemeChoice`.
 */
describe('the theme control through the app', () => {
  const signedIn = () => {
    me.mockResolvedValue({
      kind: 'success',
      representation: 'json',
      status: 200,
      body: { user: { id: 'u1', username: 'kat', scopes: ['read', 'write'] } },
      headers: new Headers(),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) => {
        const collection = path.split('/').at(-1) ?? 'unknown';
        return Promise.resolve(new Response(JSON.stringify({ [collection]: [] }), { status: 200 }));
      }),
    );
  };

  const checkedOf = (name: string) =>
    screen.getByRole('menuitemradio', { name }).getAttribute('aria-checked');

  const open = () => fireEvent.click(screen.getByRole('button', { name: 'kat' }));

  itDom('reports the answer just chosen, and only that one, without a reload', async () => {
    signedIn();
    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'kat' })).toBeDefined();
    });
    open();

    for (const answer of ['System', 'Light', 'Dark']) {
      fireEvent.click(screen.getByRole('menuitemradio', { name: answer }));
      for (const offered of ['System', 'Light', 'Dark']) {
        expect(checkedOf(offered), `${offered} while ${answer} was chosen`).toBe(
          offered === answer ? 'true' : 'false',
        );
      }
    }
  });

  itDom('reports the answer that was chosen, and only that one, after a reload', async () => {
    signedIn();
    for (const answer of ['System', 'Light', 'Dark']) {
      const first = renderApp();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'kat' })).toBeDefined();
      });
      open();
      fireEvent.click(screen.getByRole('menuitemradio', { name: answer }));
      first.unmount();

      // A reload is a fresh mount: the control reads the stored answer, not a default.
      const second = renderApp();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'kat' })).toBeDefined();
      });
      open();
      for (const offered of ['System', 'Light', 'Dark']) {
        expect(checkedOf(offered), `${offered} after ${answer} was chosen and reloaded`).toBe(
          offered === answer ? 'true' : 'false',
        );
      }
      second.unmount();
    }
  });
});

/**
 * The signed-in user's session: keyed by the user id, built from whichever
 * credential the identity arrived with, and handed to the router as one runtime
 * that a same-user update does not replace.
 */
describe('the signed-in user’s session', () => {
  const SCOPES: ('read' | 'write')[] = ['read', 'write'];
  const KAT = { id: 'u1', username: 'kat', scopes: SCOPES };
  const LEE = { id: 'u2', username: 'lee', scopes: SCOPES };

  /** Answers every directory read empty, and keeps the credential each people read carried. */
  const directoryServer = () => {
    const credentials: (string | null)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string, init?: RequestInit) => {
        const collection = path.split('/').at(-1) ?? 'unknown';
        if (collection === 'people')
          credentials.push(new Headers(init?.headers).get('x-wbs-token'));
        return Promise.resolve(new Response(JSON.stringify({ [collection]: [] }), { status: 200 }));
      }),
    );
    return credentials;
  };

  const signedInAs = (session: Api.Session, openOwner?: () => SessionOwner) => (
    <ApplicationServicesProvider slot={servicesSlot}>
      <ThemeProvider>
        <SignedInApp session={session} onSignedOut={() => undefined} openOwner={openOwner} />
      </ThemeProvider>
    </ApplicationServicesProvider>
  );

  const directoryShowing = async () => {
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Directory' })).toBeDefined();
    });
  };

  itDom(
    'builds a restored session’s directory from the empty credential the cookie leaves',
    async () => {
      window.history.replaceState({}, '', '/directory');
      me.mockResolvedValue({
        kind: 'success',
        representation: 'json',
        status: 200,
        body: { user: KAT },
        headers: new Headers(),
      });
      const credentials = directoryServer();

      renderApp();

      await directoryShowing();
      await waitFor(() => {
        expect(credentials).toEqual(['']);
      });
    },
  );

  itDom(
    'builds a password session’s directory from the credential the login answered',
    async () => {
      window.history.replaceState({}, '', '/directory');
      login.mockResolvedValue({
        kind: 'success',
        representation: 'json',
        status: 200,
        body: { token: 'tok', user: KAT },
        headers: new Headers(),
      });
      const credentials = directoryServer();
      renderApp();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Sign in with password' })).toBeDefined();
      });

      fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'kat' } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
      fireEvent.click(screen.getByRole('button', { name: 'Sign in with password' }));

      await directoryShowing();
      await waitFor(() => {
        expect(credentials).toEqual(['tok']);
      });
    },
  );

  itDom(
    'keeps the router, the address and a draft for the same user, whatever credential arrives',
    async () => {
      window.history.replaceState({}, '', '/directory');
      const credentials = directoryServer();
      routers.length = 0;
      const view = render(signedInAs({ token: '', user: KAT }));
      await directoryShowing();
      expect(routers).toHaveLength(1);
      const router = routers[0];
      fireEvent.change(screen.getByLabelText('New tag'), { target: { value: 'legal' } });

      view.rerender(signedInAs({ token: 't', user: { ...KAT } }));
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByLabelText<HTMLInputElement>('New tag').value).toBe('legal');
      expect(window.location.pathname).toBe('/directory');
      expect(credentials).toEqual(['']);
      expect(routers).toEqual([router]);

      view.rerender(signedInAs({ token: '', user: LEE }));
      await waitFor(() => {
        expect(credentials).toEqual(['', '']);
      });
      await directoryShowing();
      expect(screen.getByLabelText<HTMLInputElement>('New tag').value).toBe('');
      expect(window.location.pathname).toBe('/directory');
      expect(routers).toHaveLength(2);
    },
  );

  itDom('shows the sanitized report when the session cannot be built', async () => {
    directoryServer();
    render(
      signedInAs({ token: '', user: KAT }, () =>
        createSessionOwner({
          install: () => {
            throw new Error('alice@example.com could not be built');
          },
        }),
      ),
    );

    const fault = await waitFor(() => {
      const shown = document.querySelector('[data-lifetime-fault]');
      if (shown === null) throw new Error('no fatal state yet');
      return shown;
    });
    expect(fault.textContent).not.toContain('alice@example.com');
    expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull();
  });

  itDom('gives the session back when the signed-in region goes', async () => {
    window.history.replaceState({}, '', '/directory');
    directoryServer();
    const owner = createSessionOwner({ clientFor: () => fakeDirectoryApi(), budgetMs: 1_000 });
    const view = render(signedInAs({ token: '', user: KAT }, () => owner));
    await directoryShowing();
    expect(owner.snapshot().status).toBe('live');

    view.unmount();

    await waitFor(() => {
      expect(owner.snapshot().status).toBe('empty');
    });
  });
});

/**
 * Log out, through the account menu the reader clicks: a local exit that sends
 * nothing, retires the session's project and then the session, and hands the
 * signed-out state up only once both have let go — the fatal state otherwise.
 */
describe('log out', () => {
  const KAT = { id: 'u1', username: 'kat', scopes: ['read', 'write'] as ('read' | 'write')[] };

  /** Every request the page sends, by path. */
  const requestsSent = () => {
    const paths: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) => {
        paths.push(path);
        const collection = path.split('/').at(-1) ?? 'unknown';
        return Promise.resolve(new Response(JSON.stringify({ [collection]: [] }), { status: 200 }));
      }),
    );
    return paths;
  };

  /**
   * An owner over fake clients that records, in order, what was given back; the
   * project's close ends however `closeSocket` says.
   */
  const recordingOwner = (
    events: string[],
    closeSocket: (options: { timeoutMs: number }) => Promise<void> = () => Promise.resolve(),
    budgetMs = 1_000,
  ): SessionOwner =>
    createSessionOwner({
      clientFor: () => fakeDirectoryApi(),
      install: (dependencies) => {
        const installed = installSessionRuntime(dependencies);
        return {
          services: installed.services,
          close: async (options) => {
            await installed.close(options);
            events.push('session given back');
          },
        };
      },
      installProject: (dependencies) => {
        const installed = installProjectRuntime(dependencies);
        return {
          services: installed.services,
          close: async (options) => {
            await installed.close(options);
            await closeSocket(options);
            events.push('project given back');
          },
        };
      },
      budgetMs,
    });

  const regionOf = (owner: SessionOwner, onSignedOut: () => void) => (
    <ApplicationServicesProvider slot={servicesSlot}>
      <ThemeProvider>
        <SignedInApp
          session={{ token: '', user: KAT }}
          onSignedOut={onSignedOut}
          openOwner={() => owner}
        />
      </ThemeProvider>
    </ApplicationServicesProvider>
  );

  /** Draws the region at the directory, and opens a project through its session. */
  const signedInWithProject = async (owner: SessionOwner, onSignedOut: () => void) => {
    window.history.replaceState({}, '', '/directory');
    render(regionOf(owner, onSignedOut));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Directory' })).toBeDefined();
    });
    const opened = owner.snapshot();
    if (opened.status !== 'live') throw new Error(`u1 was not published: ${opened.status}`);
    await act(async () => {
      await opened.services.projects.open('p1', {
        services: projectServicesOver(fakeProjectApi()),
        subscribe: undefined,
      });
    });
    expect(opened.services.projects.snapshot().status).toBe('live');
    return opened.services;
  };

  const logOut = () => {
    fireEvent.click(screen.getByRole('button', { name: 'kat' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Log out' }));
  };

  const fatalShown = () =>
    waitFor(() => {
      const shown = document.querySelector('[data-lifetime-fault]');
      if (shown === null) throw new Error('no fatal state yet');
      return shown;
    });

  itDom(
    'signs out once the project and then the session have let go, and sends nothing',
    async () => {
      const paths = requestsSent();
      const events: string[] = [];
      await signedInWithProject(recordingOwner(events), () => events.push('signed out'));
      const sent = paths.length;

      logOut();

      await waitFor(() => {
        expect(events).toContain('signed out');
      });
      expect(events).toEqual(['project given back', 'session given back', 'signed out']);
      expect(paths.slice(sent)).toEqual([]);
    },
  );

  itDom(
    'shows the fatal state instead of signing out when the project will not let go',
    async () => {
      requestsSent();
      const events: string[] = [];
      const owner = recordingOwner(events, () =>
        Promise.reject(new Error('alice@example.com: the socket would not close')),
      );
      await signedInWithProject(owner, () => events.push('signed out'));

      logOut();

      const fault = await fatalShown();
      // A second log out joins the first and settles after it, with its outcome.
      await act(async () => {
        await expect(owner.exit()).resolves.toBe('fatal');
      });
      expect(events).not.toContain('signed out');
      expect(fault.textContent).not.toContain('alice@example.com');
      expect(screen.queryByRole('heading', { name: 'Directory' })).toBeNull();
    },
  );

  itDom('shows the fatal state at the budget when the project’s socket never closes', async () => {
    requestsSent();
    const events: string[] = [];
    const socket = DiBag.createBuilder()
      .register({
        socket: DiBag.withDisposal(
          DiBag.fromSyncFactory((): string => 'open'),
          () => new Promise<void>(() => undefined),
        ),
      })
      .build();
    socket.resolve('socket');
    const owner = recordingOwner(events, (options) => socket.close(options), 50);
    await signedInWithProject(owner, () => events.push('signed out'));

    logOut();

    await fatalShown();
    await act(async () => {
      await expect(owner.exit()).resolves.toBe('fatal');
    });
    expect(events).toEqual([]);
  });

  itDom(
    'draws the fatal state in the region’s place when its project cannot be given back outside a log out',
    async () => {
      requestsSent();
      const events: string[] = [];
      const owner = recordingOwner(events, () =>
        Promise.reject(new Error('the socket would not close')),
      );
      const session = await signedInWithProject(owner, () => events.push('signed out'));

      // What the project page's own cleanup does when its route goes.
      await act(async () => {
        await session.projects.leave();
      });

      await fatalShown();
      expect(screen.queryByRole('heading', { name: 'Directory' })).toBeNull();
      expect(owner.snapshot().status).toBe('live');
      expect(events).toEqual([]);
    },
  );

  itDom(
    'returns to the sign-in form through the app, and a reload restores the identity',
    async () => {
      window.history.replaceState({}, '', '/directory');
      me.mockResolvedValue({
        kind: 'success',
        representation: 'json',
        status: 200,
        body: { user: KAT },
        headers: new Headers(),
      });
      const paths = requestsSent();
      const first = renderApp();
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Directory' })).toBeDefined();
      });
      const sent = paths.length;

      logOut();

      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Continue with SSO' })).toBeDefined();
      });
      expect(paths.slice(sent)).toEqual([]);
      expect(window.location.pathname).toBe('/directory');

      // A reload is a fresh document: the cookie the log out left alone restores the identity.
      first.unmount();
      renderApp();
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Directory' })).toBeDefined();
      });
    },
  );
});
