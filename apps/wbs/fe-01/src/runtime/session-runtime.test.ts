import { describe, expect, it } from 'vitest';

import type { DirectoryApi } from '@/lib/wbs-api';
import { fakeDirectoryApi } from '@/modules/directory/fake-directory-api';
import { projectServicesOver } from '@/modules/project/composition';
import type { ProjectRuntime, ProjectSource } from '@/modules/project/contract';
import { fakeProjectApi } from '@/testing/fake-project-api';

import { PartialAcquisitionError, type RetirableRuntime } from './lifetime-slot';
import { installProjectRuntime, type ProjectRuntimeDependencies } from './project-runtime';
import { createSessionOwner, installSessionRuntime } from './session-runtime';

/** A project source over a fresh fake client, with no socket. */
const projectSource = (): ProjectSource => ({
  services: projectServicesOver(fakeProjectApi()),
  subscribe: undefined,
});

/** The real project installer, recording every close and what order things happened in. */
function recordedProjects(
  events: string[],
  closeWith: () => Promise<void> = () => Promise.resolve(),
) {
  return (dependencies: ProjectRuntimeDependencies): RetirableRuntime<ProjectRuntime> => {
    const installed = installProjectRuntime(dependencies);
    events.push(`project ${dependencies.projectId} opened`);
    return {
      services: installed.services,
      close: async (options) => {
        events.push(`project ${dependencies.projectId} closed`);
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
  it('publishes the session’s directory and its projects, and nothing else', async () => {
    const runtime = installSessionRuntime({
      userId: 'u1',
      directoryApi: fakeDirectoryApi(),
      isCurrent: () => true,
      installProject: installProjectRuntime,
      budgetMs: 1_000,
    });

    // Enumerated rather than trusted to the type: an object with one more member
    // still satisfies `SessionRuntime`, and that member would reach the router.
    expect(Object.keys(runtime.services).sort()).toEqual([
      'directory',
      'isCurrent',
      'projects',
      'userId',
    ]);
    await runtime.close({ timeoutMs: 1_000 });
  });

  it('keeps one runtime for one user whatever credential arrives, and replaces it for another', async () => {
    const clients = clientsByCredential();
    const owner = createSessionOwner({ clientFor: clients.clientFor, budgetMs: 1_000 });

    await owner.open({ userId: 'u1', credential: '' });
    const first = owner.snapshot();
    if (first.status !== 'live') throw new Error(`u1 was not published: ${first.status}`);
    await owner.open({ userId: 'u1', credential: 't' });

    expect(owner.snapshot()).toBe(first);
    expect(first.services.isCurrent()).toBe(true);
    expect(clients.asked).toEqual(['']);

    const switching = owner.open({ userId: 'u2', credential: '' });
    expect(first.services.isCurrent()).toBe(false);
    await switching;
    const second = owner.snapshot();
    expect(second.status === 'live' ? second.services.userId : second.status).toBe('u2');
    expect(clients.asked).toEqual(['', '']);
  });

  it('retires the session’s project before the session, and opens none once it is withdrawn', async () => {
    const events: string[] = [];
    const owner = createSessionOwner({
      clientFor: () => fakeDirectoryApi(),
      installProject: recordedProjects(events),
      budgetMs: 1_000,
    });
    await owner.open({ userId: 'u1', credential: '' });
    const opened = owner.snapshot();
    if (opened.status !== 'live') throw new Error(`u1 was not published: ${opened.status}`);
    const session = opened.services;
    await session.projects.open('p1', projectSource());
    const project = session.projects.snapshot();
    if (project.status !== 'live') throw new Error(`p1 was not published: ${project.status}`);

    const leaving = owner.leave();
    expect(project.services.isCurrent()).toBe(false);
    await leaving;

    expect(events).toEqual(['project p1 opened', 'project p1 closed']);
    expect(session.projects.snapshot().status).toBe('empty');
    expect(owner.snapshot().status).toBe('empty');

    await session.projects.open('p2', projectSource());
    expect(events).toEqual(['project p1 opened', 'project p1 closed']);
    expect(session.projects.snapshot().status).toBe('empty');
  });

  it('fails the session’s retirement when its project will not let go', async () => {
    const events: string[] = [];
    const owner = createSessionOwner({
      clientFor: () => fakeDirectoryApi(),
      installProject: recordedProjects(events, () =>
        Promise.reject(new Error('the socket would not close')),
      ),
      budgetMs: 1_000,
    });
    await owner.open({ userId: 'u1', credential: '' });
    const opened = owner.snapshot();
    if (opened.status !== 'live') throw new Error(`u1 was not published: ${opened.status}`);
    await opened.services.projects.open('p1', projectSource());

    await expect(owner.leave()).resolves.toBeUndefined();

    const left = owner.snapshot();
    expect(left.status === 'fatal' && left.terminal).toBe(true);
    await expect(owner.open({ userId: 'u2', credential: '' })).resolves.toBeUndefined();
    expect(owner.snapshot()).toBe(left);
  });

  it('settles a half-built session that cannot be released, and leaves the owner terminally fatal', async () => {
    const owner = createSessionOwner({
      clientFor: () => fakeDirectoryApi(),
      install: () => {
        throw new PartialAcquisitionError(new Error('the directory could not be built'), () =>
          Promise.reject(new Error('and what it took could not be given back')),
        );
      },
      budgetMs: 1_000,
    });

    await expect(owner.open({ userId: 'u1', credential: '' })).resolves.toBeUndefined();

    const state = owner.snapshot();
    expect(state.status === 'fatal' && state.terminal).toBe(true);
  });

  it('settles a request a newer one overtook, and builds nothing for it', async () => {
    const clients = clientsByCredential();
    const owner = createSessionOwner({ clientFor: clients.clientFor, budgetMs: 1_000 });

    const overtaken = owner.open({ userId: 'u1', credential: 'first' });
    const winner = owner.open({ userId: 'u2', credential: 'second' });

    await expect(overtaken).resolves.toBeUndefined();
    await winner;
    expect(clients.asked).toEqual(['second']);
  });

  it('settles a second leave only once the retirement it joined has run', async () => {
    const events: string[] = [];
    let letGo: () => void = () => undefined;
    const owner = createSessionOwner({
      clientFor: () => fakeDirectoryApi(),
      installProject: recordedProjects(
        events,
        () =>
          new Promise<void>((resolve) => {
            letGo = resolve;
          }),
      ),
      budgetMs: 1_000,
    });
    await owner.open({ userId: 'u1', credential: '' });
    const opened = owner.snapshot();
    if (opened.status !== 'live') throw new Error(`u1 was not published: ${opened.status}`);
    await opened.services.projects.open('p1', projectSource());

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
});
