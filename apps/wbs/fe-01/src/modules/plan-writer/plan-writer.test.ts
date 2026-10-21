import { describe, expect, it } from 'vitest';

import { failureText } from '@/components/wbs/plan-refusal';
import type { PlanRefresh, RefreshResource } from '@/lib/plan-refresh';
import { type WbsProblem, WbsRequestError } from '@/lib/wbs-api';

import { createBusy } from './busy-store';
import type { PlanWriteRefusal, PlanWriterHost } from './contract';
import { createPlanWriter } from './plan-writer.feature';

/**
 * A feed owner the writer may compare identities with and must never call.
 *
 * Every member throws, and that is the assertion rather than a convenience: the
 * writer reads the owner for its identity alone, and every reread it asks for
 * goes through the host's own callback. A writer that reached for a member here
 * would fail loudly instead of quietly acquiring a second way to read the plan.
 */
function fakeFeedOwner(): PlanRefresh {
  const refuse = (member: string): never => {
    throw new Error(`the plan writer called ${member} on the feed owner`);
  };
  return {
    initialize: () => refuse('initialize'),
    invalidate: () => refuse('invalidate'),
    getSnapshot: () => refuse('getSnapshot'),
    subscribe: () => refuse('subscribe'),
    dispose: () => refuse('dispose'),
  };
}

/** A host that records everything the writer asked it for, in order. */
function recordingHost(): {
  host: PlanWriterHost;
  rereads: (readonly RefreshResource[])[];
  refusals: PlanWriteRefusal[];
  busyChanges: boolean[];
} {
  const rereads: (readonly RefreshResource[])[] = [];
  const refusals: PlanWriteRefusal[] = [];
  const busyChanges: boolean[] = [];
  const owner = fakeFeedOwner();
  return {
    rereads,
    refusals,
    busyChanges,
    host: {
      readRefreshOwner: () => owner,
      rereadResources: (resources) => {
        rereads.push(resources);
        return Promise.resolve(true);
      },
      busy: {
        raise: () => busyChanges.push(true),
        lower: () => busyChanges.push(false),
      },
      commandsIssued: { publish: () => undefined },
      refusals: { publish: (refusal) => refusals.push(refusal) },
    },
  };
}

describe('the plan writer', () => {
  it('rereads the completed prefix of a gesture a later request refuses', async () => {
    const recorded = recordingHost();
    const writer = createPlanWriter(recorded.host);

    const outcome = await writer.run(async (write) => {
      await write.perform(['directory'], () => Promise.resolve('tag minted'));
      await write.perform(['tree'], () => Promise.reject(new Error('forbidden')));
    });

    expect(outcome).toBe('refused');
    expect(recorded.rereads).toEqual([['directory']]);
    expect(recorded.refusals).toEqual([
      { sentence: 'That change could not be completed: this plan is not yours to change.' },
    ]);
    expect(recorded.busyChanges).toEqual([true, false]);
  });

  it('refuses a completed gesture whose feed owner was replaced under it', async () => {
    // Proof: this is the case no existing suite held — see the twenty-ninth entry of
    // docs/findings/checks-that-cannot-fail-puni-00.md.
    const rereads: (readonly RefreshResource[])[] = [];
    let owner = fakeFeedOwner();
    const writer = createPlanWriter({
      readRefreshOwner: () => owner,
      rereadResources: (resources) => {
        rereads.push(resources);
        return Promise.resolve(true);
      },
      busy: { raise: () => undefined, lower: () => undefined },
      commandsIssued: { publish: () => undefined },
      refusals: { publish: () => undefined },
    });

    const outcome = await writer.run(async (write) => {
      await write.perform(['tree'], () => {
        // The covering read that renewed the feed owner landed while this request was in flight.
        owner = fakeFeedOwner();
        return Promise.resolve('renamed');
      });
    });

    expect(outcome).toBe('refused');
    expect(rereads).toEqual([]);
  });

  it('says a command was issued before it sends anything', async () => {
    const recorded = recordingHost();
    const said: string[] = [];
    const writer = createPlanWriter({
      ...recorded.host,
      commandsIssued: { publish: () => said.push('command issued') },
    });

    await writer.run(async (write) => {
      await write.perform(['tree'], () => {
        said.push('request sent');
        return Promise.resolve('renamed');
      });
    });

    expect(said).toEqual(['command issued', 'request sent']);
  });

  it('refuses, rereads nothing and still lowers busy when its reader left before the answer', async () => {
    const recorded = recordingHost();
    const busy = createBusy();
    let owner: PlanRefresh | null = fakeFeedOwner();
    const writer = createPlanWriter({ ...recorded.host, readRefreshOwner: () => owner, busy });

    const outcome = await writer.run(async (write) => {
      await write.perform(['tree'], () => {
        // The reader's runtime was withdrawn while the request was in flight:
        // from then on it answers no refresh owner at all.
        owner = null;
        return Promise.resolve('renamed');
      });
    });

    expect(outcome).toBe('refused');
    expect(recorded.rereads).toEqual([]);
    expect(busy.snapshot()).toBe(false);
  });

  it('refuses a gesture whose reader left during its covering read', async () => {
    const recorded = recordingHost();
    let owner: PlanRefresh | null = fakeFeedOwner();
    const writer = createPlanWriter({
      ...recorded.host,
      readRefreshOwner: () => owner,
      rereadResources: (resources) => {
        recorded.rereads.push(resources);
        // Withdrawn while its covering read was reading.
        owner = null;
        return Promise.resolve(true);
      },
    });

    const outcome = await writer.run(async (write) => {
      await write.perform(['tree'], () => Promise.resolve('renamed'));
    });

    expect(outcome).toBe('refused');
    expect(recorded.rereads).toEqual([['tree']]);
  });

  it('reports a landed write whose covering reread failed', async () => {
    const recorded = recordingHost();
    const writer = createPlanWriter({
      ...recorded.host,
      rereadResources: () => Promise.resolve(false),
    });

    const outcome = await writer.run(async (write) => {
      await write.perform(['tree'], () => Promise.resolve('renamed'));
    });

    expect(outcome).toBe('landed-unread');
  });
});

it('reports organization context change once without retrying the refused mutation', async () => {
  const recorded = recordingHost();
  const writer = createPlanWriter(recorded.host);
  let requests = 0;
  const outcome = await writer.run(async (write) => {
    await write.perform(['tree'], () => {
      requests += 1;
      return Promise.reject(
        new WbsRequestError({
          kind: 'refusal',
          operation: 'postApiProjectsByIdCommands',
          refusal: { error: 'organization_context_changed' },
        }),
      );
    });
  });
  expect(outcome).toBe('refused');
  expect(requests).toBe(1);
  expect(recorded.rereads).toEqual([]);
  expect(recorded.refusals).toEqual([
    { sentence: 'Your organization changed. Reload before making another change.' },
  ]);
});

it.each([
  'postApiProjectsByIdCommands',
  'postApiProjectsByIdUndo',
  'postApiProjectsByIdRedo',
  'deleteApiProjectsByIdStepsByStepId',
] as const)('reports disabled blockage admission from %s without retrying', async (operation) => {
  const recorded = recordingHost();
  const writer = createPlanWriter(recorded.host);
  let requests = 0;
  const outcome = await writer.run(async (write) => {
    await write.perform(['tree'], () => {
      requests += 1;
      return Promise.reject(
        new WbsRequestError({
          kind: 'refusal',
          operation,
          refusal: { error: 'step_blockage_inactive' },
        }),
      );
    });
  });
  expect(outcome).toBe('refused');
  expect(requests).toBe(1);
  expect(recorded.rereads).toEqual([]);
  expect(recorded.refusals).toEqual([
    { sentence: 'Step blockage changes are not enabled on this server.' },
  ]);
});

const sparseRefusals = [
  {
    kind: 'refusal',
    operation: 'deleteApiProjectsByIdStepsByStepId',
    refusal: {
      error: 'referenced_by_step_parallel',
      nodes: [{ workItemId: 'retained-row', stepId: 'retained-step' }],
    },
  },
  {
    kind: 'refusal',
    operation: 'postApiProjectsByIdCommands',
    refusal: {
      error: 'referenced_by_step_parallel',
      at: 0,
      kind: 'duplicateWorkItem',
      nodes: [{ workItemId: 'retained-row', stepId: 'retained-step' }],
    },
  },
] satisfies WbsProblem[];

it.each(sparseRefusals)(
  'reports retained step parallelism from $operation without retry or reread',
  async (problem) => {
    const recorded = recordingHost();
    const writer = createPlanWriter(recorded.host);
    let requests = 0;
    const outcome = await writer.run(async (write) => {
      await write.perform(['tree'], () => {
        requests += 1;
        return Promise.reject(new WbsRequestError(problem));
      });
    });
    expect(outcome).toBe('refused');
    expect(requests).toBe(1);
    expect(recorded.rereads).toEqual([]);
    expect(recorded.busyChanges).toEqual([true, false]);
    expect(recorded.refusals).toEqual([
      {
        sentence:
          'That change cannot be made while the affected steps have individual parallelism overrides.',
      },
    ]);
  },
);

it('rereads only a completed request before a sparse command refusal', async () => {
  const recorded = recordingHost();
  const writer = createPlanWriter(recorded.host);
  const outcome = await writer.run(async (write) => {
    await write.perform(['directory'], () => Promise.resolve('created tag'));
    await write.perform(['tree'], () =>
      Promise.reject(
        new WbsRequestError({
          kind: 'refusal',
          operation: 'postApiProjectsByIdCommands',
          refusal: {
            error: 'referenced_by_step_parallel',
            at: 1,
            kind: 'duplicateWorkItem',
            nodes: [{ workItemId: 'retained-row', stepId: 'retained-step' }],
          },
        }),
      ),
    );
  });
  expect(outcome).toBe('refused');
  expect(recorded.rereads).toEqual([['directory']]);
  expect(recorded.busyChanges).toEqual([true, false]);
  expect(recorded.refusals).toEqual([
    {
      sentence:
        'That change cannot be made while the affected steps have individual parallelism overrides.',
    },
  ]);
});

it('classifies project abbreviation refusals without throwing', () => {
  const problems = [
    { kind: 'refusal', operation: 'postApiProjects', refusal: { error: 'invalid_abbreviation' } },
    { kind: 'refusal', operation: 'postApiProjects', refusal: { error: 'abbreviation_taken' } },
    { kind: 'refusal', operation: 'postApiProjects', refusal: { error: 'abbreviation_exhausted' } },
    {
      kind: 'refusal',
      operation: 'patchApiProjectsById',
      refusal: { error: 'invalid_abbreviation' },
    },
    {
      kind: 'refusal',
      operation: 'patchApiProjectsById',
      refusal: { error: 'abbreviation_taken' },
    },
  ] as const;
  for (const problem of problems) {
    expect(failureText(new WbsRequestError(problem), 'unknown')).toBe(problem.refusal.error);
  }
});
