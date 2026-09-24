import { describe, expect, it, vi } from 'vitest';

import { projectServicesOver } from '@/modules/project/composition';
import type {
  ProjectServices,
  ProjectSource,
  ProjectStreamHandlers,
} from '@/modules/project/contract';
import { fakeProjectApi } from '@/testing/fake-project-api';

import { createProjectOwner, installProjectRuntime } from './project-runtime';

/** A source over a fresh fake client, and what its feed and its stream went through. */
function recordedSource(options: { unsubscribe?: () => void } = {}) {
  const seen = { installs: 0, feedCloses: 0, opened: 0, closed: 0 };
  const composed = projectServicesOver(fakeProjectApi());
  const services: ProjectServices = {
    ...composed,
    planFeedFor: (reader) => {
      seen.installs += 1;
      const feed = composed.planFeedFor(reader);
      return {
        ...feed,
        close: () => {
          seen.feedCloses += 1;
          feed.close();
        },
      };
    },
  };
  const source: ProjectSource = {
    services,
    subscribe: () => {
      seen.opened += 1;
      return {
        seen: () => undefined,
        unsubscribe: () => {
          seen.closed += 1;
          options.unsubscribe?.();
        },
      };
    },
  };
  return { source, seen };
}

describe('the project runtime', () => {
  it('publishes the project’s feature and store surfaces, and nothing else', async () => {
    const runtime = installProjectRuntime({
      projectId: 'p1',
      ...recordedSource().source,
      isCurrent: () => true,
    });

    // Enumerated rather than trusted to the type: an object with one more member
    // still satisfies `ProjectRuntime`, and that member would reach the table.
    expect(Object.keys(runtime.services).sort()).toEqual([
      'busy',
      'commands',
      'commandsIssued',
      'isCurrent',
      'markers',
      'plan',
      'presence',
      'projectId',
      'refusals',
      'reread',
      'writer',
    ]);
    await runtime.close({ timeoutMs: 1_000 });
  });

  it('tells the project’s presence who its stream says is here, and whether it is up', async () => {
    let told: ProjectStreamHandlers | null = null;
    const { source } = recordedSource();
    const owner = createProjectOwner({ budgetMs: 1_000 });
    await owner.open('p1', {
      ...source,
      subscribe: (_projectId, handlers) => {
        told = handlers;
        return { seen: () => undefined, unsubscribe: () => undefined };
      },
    });
    const opened = owner.snapshot();
    if (opened.status !== 'live') throw new Error(`p1 was not published: ${opened.status}`);
    const stream = await vi.waitFor(() => {
      if (told === null) throw new Error('the stream was never opened');
      return told;
    });
    expect(opened.services.presence.snapshot()).toEqual({ users: [], connected: false });

    stream.onPresence(['kat', 'lee']);
    stream.onConnectionChange(true);

    expect(opened.services.presence.snapshot()).toEqual({ users: ['kat', 'lee'], connected: true });
  });

  it('gives back the feed a half-built runtime had already opened', async () => {
    const { source, seen } = recordedSource();
    const owner = createProjectOwner({ budgetMs: 1_000 });

    await owner.open('p1', {
      ...source,
      services: {
        ...source.services,
        planCommandsFor: () => {
          throw new Error('the commands could not be built');
        },
      },
    });

    expect(seen.installs).toBe(1);
    expect(seen.feedCloses).toBe(1);
    const state = owner.snapshot();
    expect(state.status === 'fatal' && !state.terminal).toBe(true);
  });

  it('withdraws the runtime the instant another project is opened, and disposes it after', async () => {
    const first = recordedSource();
    const owner = createProjectOwner({ budgetMs: 1_000 });
    await owner.open('p1', first.source);
    const opened = owner.snapshot();
    if (opened.status !== 'live') throw new Error(`p1 was not published: ${opened.status}`);
    const p1 = opened.services;

    const switching = owner.open('p2', recordedSource().source);

    expect(p1.isCurrent()).toBe(false);
    expect(first.seen.feedCloses).toBe(0);
    await switching;
    expect(first.seen.feedCloses).toBe(1);
    const state = owner.snapshot();
    expect(state.status === 'live' ? state.services.projectId : state.status).toBe('p2');
  });

  it('settles a request a newer one overtook, and builds nothing for it', async () => {
    const first = recordedSource();
    const second = recordedSource();
    const owner = createProjectOwner({ budgetMs: 1_000 });

    const overtaken = owner.open('p1', first.source);
    const winner = owner.open('p2', second.source);

    await expect(overtaken).resolves.toBeUndefined();
    await winner;
    expect(first.seen.installs).toBe(0);
    expect(second.seen.installs).toBe(1);
  });

  it('shows a retirement that fails as the fatal state, and refuses the next project', async () => {
    const stuck = recordedSource({
      unsubscribe: () => {
        throw new Error('the socket would not close');
      },
    });
    const next = recordedSource();
    const owner = createProjectOwner({ budgetMs: 1_000 });
    await owner.open('p1', stuck.source);
    await vi.waitFor(() => {
      expect(stuck.seen.opened).toBe(1);
    });

    await expect(owner.leave()).resolves.toBeUndefined();
    const left = owner.snapshot();
    expect(left.status === 'fatal' && left.terminal).toBe(true);

    await expect(owner.open('p2', next.source)).resolves.toBeUndefined();
    expect(owner.snapshot()).toBe(left);
    expect(next.seen.installs).toBe(0);
  });
});
