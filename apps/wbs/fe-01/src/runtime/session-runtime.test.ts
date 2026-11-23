import { DiBag } from 'di-bag';
import { describe, expect, it, vi } from 'vitest';

import type { DirectoryApi } from '@/lib/wbs-api';
import { fakeDirectoryApi } from '@/modules/directory/fake-directory-api';
import { workPackageServicesOver } from '@/modules/work-package/composition';
import {
  CatalogWithdrawnError,
  type WorkPackageRuntime,
  type WorkPackageSource,
} from '@/modules/work-package/contract';
import { fakeWorkPackageApi } from '@/testing/fake-work-package-api';
import { NO_SAVED_PLANS } from '@/testing/no-saved-plans';
import { recordCalls } from '@/testing/record-calls';
import { createRefusingAddressApi } from '@/testing/refusing-address-api';
import { SILENT_STREAM } from '@/testing/silent-stream';

import { credentialOf } from './credential';
import { PartialAcquisitionError, type RetirableRuntime } from './lifetime-slot';
import {
  createSessionOwner,
  installSessionRuntime,
  type SessionExit,
  sessionFor,
} from './session-runtime';
import {
  installWorkPackageRuntime,
  type WorkPackageRuntimeDependencies,
} from './work-package-runtime';

/** A work package source over a fresh fake client, with no socket. */
const workPackageSource = (): WorkPackageSource => ({
  services: workPackageServicesOver(
    fakeWorkPackageApi(),
    NO_SAVED_PLANS,
    createRefusingAddressApi(),
  ),
  subscribe: undefined,
});

/** The real work package installer, recording every close and what order things happened in. */
function recordedWorkPackages(
  events: string[],
  closeWith: () => Promise<void> = () => Promise.resolve(),
) {
  return (dependencies: WorkPackageRuntimeDependencies): RetirableRuntime<WorkPackageRuntime> => {
    const installed = installWorkPackageRuntime(dependencies);
    events.push(`work package ${dependencies.workPackageId} opened`);
    return {
      services: installed.services,
      close: async (options) => {
        events.push(`work package ${dependencies.workPackageId} closed`);
        await closeWith();
        await installed.close(options);
      },
    };
  };
}

/** A client per credential, remembering which credentials asked for one. */
function clientsByCredential() {
  const asked: string[] = [];
  return {
    asked,
    clientFor: (credential: string): DirectoryApi => {
      asked.push(credential);
      return fakeDirectoryApi();
    },
  };
}

describe('the session runtime', () => {
  it('publishes the session’s directory and its work packages, and nothing else', async () => {
    const runtime = installSessionRuntime({
      userId: 'u1',
      directoryApi: fakeDirectoryApi(),
      catalogRoutes: fakeWorkPackageApi(),
      workPackageSourceFor: workPackageSource,
      isCurrent: () => true,
      installWorkPackage: installWorkPackageRuntime,
      budgetMs: 1_000,
    });

    // Enumerated rather than trusted to the type: an object with one more member
    // still satisfies `SessionRuntime`, and that member would reach the router.
    expect(Object.keys(runtime.services).sort()).toEqual([
      'catalog',
      'directory',
      'isCurrent',
      'organization',
      'resourceScope',
      'userId',
      'workPackages',
    ]);
    await runtime.close({ timeoutMs: 1_000 });
  });

  it('lists the catalog and reads each work package through the one client cut from the credential', async () => {
    const credentials: string[] = [];
    const client = fakeWorkPackageApi();
    const listed = recordCalls(client, 'listWorkPackages');
    const trees = recordCalls(client, 'tree', (workPackageId) => workPackageId);
    const owner = createSessionOwner({
      streamDeps: SILENT_STREAM,
      clientFor: () => fakeDirectoryApi(),
      workPackageClientFor: (credential) => {
        credentials.push(credential);
        return client;
      },
      budgetMs: 1_000,
    });
    await owner.open({ userId: 'u1', credential: credentialOf('tok') });
    const opened = owner.snapshot();
    if (opened.status !== 'live') throw new Error(`u1 was not published: ${opened.status}`);

    await opened.services.catalog.list();
    await opened.services.workPackages.open('p1');
    await vi.waitFor(() => {
      expect(trees).toEqual(['p1']);
    });

    expect(credentials).toEqual(['tok']);
    expect(listed).toHaveLength(1);
    await owner.leave();
  });

  it('keeps the first credential’s work package client when the same user arrives with another', async () => {
    const credentials: string[] = [];
    const client = fakeWorkPackageApi();
    const trees = recordCalls(client, 'tree', (workPackageId) => workPackageId);
    const owner = createSessionOwner({
      streamDeps: SILENT_STREAM,
      clientFor: () => fakeDirectoryApi(),
      workPackageClientFor: (credential) => {
        credentials.push(credential);
        return client;
      },
      budgetMs: 1_000,
    });
    await owner.open({ userId: 'u1', credential: credentialOf('first') });
    await owner.open({ userId: 'u1', credential: credentialOf('second') });
    const opened = owner.snapshot();
    if (opened.status !== 'live') throw new Error(`u1 was not published: ${opened.status}`);

    await opened.services.catalog.list();
    await opened.services.workPackages.open('p1');
    await vi.waitFor(() => {
      expect(trees).toEqual(['p1']);
    });

    expect(credentials).toEqual(['first']);
    await owner.leave();
  });

  it('sends nothing for a catalog gesture asked of a withdrawn session', async () => {
    const client = fakeWorkPackageApi();
    const listed = recordCalls(client, 'listWorkPackages');
    const owner = createSessionOwner({
      streamDeps: SILENT_STREAM,
      clientFor: () => fakeDirectoryApi(),
      workPackageClientFor: () => client,
      budgetMs: 1_000,
    });
    await owner.open({ userId: 'u1', credential: credentialOf('') });
    const opened = owner.snapshot();
    if (opened.status !== 'live') throw new Error(`u1 was not published: ${opened.status}`);
    const leaving = owner.leave();

    await expect(opened.services.catalog.list()).rejects.toBeInstanceOf(CatalogWithdrawnError);
    await leaving;
    expect(listed).toEqual([]);
  });

  it('keeps one runtime for one user whatever credential arrives, and replaces it for another', async () => {
    const clients = clientsByCredential();
    const owner = createSessionOwner({
      streamDeps: SILENT_STREAM,
      workPackageClientFor: () => fakeWorkPackageApi(),
      clientFor: clients.clientFor,
      budgetMs: 1_000,
    });

    await owner.open({ userId: 'u1', credential: credentialOf('') });
    const first = owner.snapshot();
    if (first.status !== 'live') throw new Error(`u1 was not published: ${first.status}`);
    await owner.open({ userId: 'u1', credential: credentialOf('t') });

    expect(owner.snapshot()).toBe(first);
    expect(first.services.isCurrent()).toBe(true);
    expect(clients.asked).toEqual(['']);

    const switching = owner.open({ userId: 'u2', credential: credentialOf('') });
    expect(first.services.isCurrent()).toBe(false);
    await switching;
    const second = owner.snapshot();
    expect(second.status === 'live' ? second.services.userId : second.status).toBe('u2');
    expect(clients.asked).toEqual(['', '']);
  });

  it('retires the session’s work package before the session, and opens none once it is withdrawn', async () => {
    const events: string[] = [];
    const owner = createSessionOwner({
      streamDeps: SILENT_STREAM,
      workPackageClientFor: () => fakeWorkPackageApi(),
      clientFor: () => fakeDirectoryApi(),
      installWorkPackage: recordedWorkPackages(events),
      budgetMs: 1_000,
    });
    await owner.open({ userId: 'u1', credential: credentialOf('') });
    const opened = owner.snapshot();
    if (opened.status !== 'live') throw new Error(`u1 was not published: ${opened.status}`);
    const session = opened.services;
    await session.workPackages.open('p1');
    const workPackage = session.workPackages.snapshot();
    if (workPackage.status !== 'live')
      throw new Error(`p1 was not published: ${workPackage.status}`);

    const leaving = owner.leave();
    expect(workPackage.services.isCurrent()).toBe(false);
    await leaving;

    expect(events).toEqual(['work package p1 opened', 'work package p1 closed']);
    expect(session.workPackages.snapshot().status).toBe('empty');
    expect(owner.snapshot().status).toBe('empty');

    await session.workPackages.open('p2');
    expect(events).toEqual(['work package p1 opened', 'work package p1 closed']);
    expect(session.workPackages.snapshot().status).toBe('empty');
  });

  it('fails the session’s retirement when its work package will not let go', async () => {
    const events: string[] = [];
    const owner = createSessionOwner({
      streamDeps: SILENT_STREAM,
      workPackageClientFor: () => fakeWorkPackageApi(),
      clientFor: () => fakeDirectoryApi(),
      installWorkPackage: recordedWorkPackages(events, () =>
        Promise.reject(new Error('the socket would not close')),
      ),
      budgetMs: 1_000,
    });
    await owner.open({ userId: 'u1', credential: credentialOf('') });
    const opened = owner.snapshot();
    if (opened.status !== 'live') throw new Error(`u1 was not published: ${opened.status}`);
    await opened.services.workPackages.open('p1');

    await expect(owner.leave()).resolves.toBeUndefined();

    const left = owner.snapshot();
    expect(left.status === 'fatal' && left.terminal).toBe(true);
    await expect(
      owner.open({ userId: 'u2', credential: credentialOf('') }),
    ).resolves.toBeUndefined();
    expect(owner.snapshot()).toBe(left);
  });

  it('settles a half-built session that cannot be released, and leaves the owner terminally fatal', async () => {
    const owner = createSessionOwner({
      streamDeps: SILENT_STREAM,
      workPackageClientFor: () => fakeWorkPackageApi(),
      clientFor: () => fakeDirectoryApi(),
      install: () => {
        throw new PartialAcquisitionError(new Error('the directory could not be built'), () =>
          Promise.reject(new Error('and what it took could not be given back')),
        );
      },
      budgetMs: 1_000,
    });

    await expect(
      owner.open({ userId: 'u1', credential: credentialOf('') }),
    ).resolves.toBeUndefined();

    const state = owner.snapshot();
    expect(state.status === 'fatal' && state.terminal).toBe(true);
  });

  it('settles a request a newer one overtook, and builds nothing for it', async () => {
    const clients = clientsByCredential();
    const owner = createSessionOwner({
      streamDeps: SILENT_STREAM,
      workPackageClientFor: () => fakeWorkPackageApi(),
      clientFor: clients.clientFor,
      budgetMs: 1_000,
    });

    const overtaken = owner.open({ userId: 'u1', credential: credentialOf('first') });
    const winner = owner.open({ userId: 'u2', credential: credentialOf('second') });

    await expect(overtaken).resolves.toBeUndefined();
    await winner;
    expect(clients.asked).toEqual(['second']);
  });

  it('settles a second leave only once the retirement it joined has run', async () => {
    const events: string[] = [];
    let letGo: () => void = () => undefined;
    const owner = createSessionOwner({
      streamDeps: SILENT_STREAM,
      workPackageClientFor: () => fakeWorkPackageApi(),
      clientFor: () => fakeDirectoryApi(),
      installWorkPackage: recordedWorkPackages(
        events,
        () =>
          new Promise<void>((resolve) => {
            letGo = resolve;
          }),
      ),
      budgetMs: 1_000,
    });
    await owner.open({ userId: 'u1', credential: credentialOf('') });
    const opened = owner.snapshot();
    if (opened.status !== 'live') throw new Error(`u1 was not published: ${opened.status}`);
    await opened.services.workPackages.open('p1');

    const first = owner.leave();
    let secondSettled = false;
    const second = owner.leave().then(() => {
      secondSettled = true;
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(secondSettled).toBe(false);
    letGo();
    await Promise.all([first, second]);
    expect(owner.snapshot().status).toBe('empty');
  });

  it('hands a region drawn for one user nothing of another user’s session', async () => {
    const owner = createSessionOwner({
      streamDeps: SILENT_STREAM,
      workPackageClientFor: () => fakeWorkPackageApi(),
      clientFor: () => fakeDirectoryApi(),
      budgetMs: 1_000,
    });
    await owner.open({ userId: 'u1', credential: credentialOf('') });
    const state = owner.snapshot();
    if (state.status !== 'live') throw new Error(`u1 was not published: ${state.status}`);

    expect(sessionFor(state, 'u1')).toBe(state.services);
    expect(sessionFor(state, 'u2')).toBeNull();
    expect(sessionFor({ status: 'retiring' }, 'u1')).toBeNull();
  });
});

describe('log out', () => {
  it('settles signed out once the work package and then the session have let go, and sends nothing', async () => {
    const events: string[] = [];
    const client = fakeDirectoryApi();
    const owner = createSessionOwner({
      streamDeps: SILENT_STREAM,
      workPackageClientFor: () => fakeWorkPackageApi(),
      clientFor: () => client,
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
      installWorkPackage: (dependencies) => {
        const installed = installWorkPackageRuntime(dependencies);
        return {
          services: installed.services,
          close: async (options) => {
            await installed.close(options);
            events.push(`work package ${dependencies.workPackageId} given back`);
          },
        };
      },
      budgetMs: 1_000,
    });
    await owner.open({ userId: 'u1', credential: credentialOf('') });
    const opened = owner.snapshot();
    if (opened.status !== 'live') throw new Error(`u1 was not published: ${opened.status}`);
    await opened.services.workPackages.open('p1');
    const sent = client.log.length;

    await expect(owner.exit()).resolves.toBe('signed-out');

    expect(events).toEqual(['work package p1 given back', 'session given back']);
    expect(client.log.length).toBe(sent);
    expect(owner.snapshot().status).toBe('empty');
  });

  it('settles fatal at the budget when the work package’s socket never closes, and stays fatal once it does', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    try {
      let letGo: () => void = () => undefined;
      const socket = DiBag.createBuilder()
        .withServices({
          socket: DiBag.providerWithDisposal({
            provider: DiBag.createProvider((): string => 'open', {
              factoryReturnKind: 'sync-value',
            }),
            disposeService: () =>
              new Promise<void>((resolve) => {
                letGo = resolve;
              }),
          }),
        })
        .buildContainer();
      socket.resolve('socket');
      const owner = createSessionOwner({
        workPackageClientFor: () => fakeWorkPackageApi(),
        clientFor: () => fakeDirectoryApi(),
        // Proof: with `streamDeps` on none of this file's owners (2026-09-27, after saved
        // plans began subscribing on open) the node tier raised 7 unhandled
        // `ReferenceError`s from this file; with it on this owner alone, 6.
        streamDeps: SILENT_STREAM,
        installWorkPackage: (dependencies) => {
          const installed = installWorkPackageRuntime(dependencies);
          return {
            services: installed.services,
            close: async (options) => {
              await installed.close(options);
              await socket.close({ waitTimeoutMs: options.timeoutMs });
            },
          };
        },
        budgetMs: 1_000,
      });
      await owner.open({ userId: 'u1', credential: credentialOf('') });
      const opened = owner.snapshot();
      if (opened.status !== 'live') throw new Error(`u1 was not published: ${opened.status}`);
      await opened.services.workPackages.open('p1');

      let settled: SessionExit | null = null;
      void owner.exit().then((exit) => {
        settled = exit;
      });
      await vi.advanceTimersByTimeAsync(999);
      expect(settled).toBeNull();
      await vi.advanceTimersByTimeAsync(2);

      expect(settled).toBe('fatal');
      const left = owner.snapshot();
      expect(left.status === 'fatal' && left.terminal).toBe(true);
      letGo();
      await vi.advanceTimersByTimeAsync(0);
      expect(owner.snapshot()).toBe(left);
      await expect(owner.exit()).resolves.toBe('fatal');
      await owner.open({ userId: 'u2', credential: credentialOf('') });
      expect(owner.snapshot()).toBe(left);
    } finally {
      vi.useRealTimers();
    }
  });

  it('settles fatal after a sign-in that could not be built, and keeps the fatal state', async () => {
    const owner = createSessionOwner({
      streamDeps: SILENT_STREAM,
      workPackageClientFor: () => fakeWorkPackageApi(),
      clientFor: () => fakeDirectoryApi(),
      install: () => {
        throw new Error('the directory could not be built');
      },
      budgetMs: 1_000,
    });
    await owner.open({ userId: 'u1', credential: credentialOf('') });
    const refused = owner.snapshot();
    expect(refused.status === 'fatal' && !refused.terminal).toBe(true);

    await expect(owner.exit()).resolves.toBe('fatal');

    expect(owner.snapshot()).toBe(refused);
  });
});
