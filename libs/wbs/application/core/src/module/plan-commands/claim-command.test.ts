import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../../compose';
import type { CredentialPair } from '../../ports/claim-store';
import { CREATOR_ADMISSION } from '../../ports/edit-admission';
import { LEGACY_ACCESS } from '../../ports/organization-access';
import type { Scope } from '../../ports/unit-of-work';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { testClock } from '../../testing/clock-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { workItemRow } from '../../testing/work-item-fixture';
import { createPlanCommandRunner } from './composition';
import type { AppliedCommand } from './plan-commands.feature';

const F = 'account-f';
const G = 'account-g';

/** The fleet's machine credential, linked to account F. */
const FLEET: CredentialPair = { issuer: 'https://idp.test', subject: 'claire-m2m@clients' };

/**
 * Who each person is bound to (`person.account_id`) and the person the fleet
 * credential is pinned to (`external_identity.person_id`), written through the
 * memory source's real directory before the batch runs.
 */
interface Identities {
  readonly bound: ReadonlyMap<string, string>;
  readonly pinned: string | null;
}

const BOUND: Identities = {
  bound: new Map([
    ['claire', F],
    ['claire-worker', F],
    ['claire-worker-2', F],
    ['codex-fleet', F],
    ['stranger', G],
  ]),
  pinned: null,
};

/**
 * A project with its starting steps Dev and QA; root `080` with leaves `080.25`
 * and `080.26`, and a free leaf `090`, all unrestricted so both accounts write.
 */
async function seeded(identities: Identities = BOUND) {
  const fixture = openMemorySourceFixture();
  const { source } = fixture;
  const broadcast = recordingBroadcaster();
  const options = {
    admission: CREATOR_ADMISSION,
    clock: testClock,
    broadcast,
    scheduler: fastScheduler,
  };
  const graph = servicesOver(source.stores, options);
  for (const id of [F, G]) {
    await source.stores.users.create(
      { id, username: id, passwordHash: 'x', createdAt: 1 },
      { at: 1, by: id },
    );
  }
  const created = await graph.projects.create('Claims', F);
  const projectId = created.project.id;
  // The project's starting steps, Dev then QA, stand for the spec's Impl and Review.
  // The memory source keeps a project's steps apart from the step table its progress reads.
  for (const step of created.steps) {
    await source.stores.steps.add(
      { id: step.id, projectId, name: step.name, allowancePercent: 0, estimateUnit: 'workdays' },
      { at: 1, by: F },
    );
  }
  const steps = (await source.stores.projects.stepsOf(projectId)).map(({ id }) => id);
  const rows = [
    workItemRow({ id: '080', projectId, parentId: null, position: 1 }),
    workItemRow({ id: '080.25', projectId, parentId: '080', position: 1 }),
    workItemRow({ id: '080.26', projectId, parentId: '080', position: 2 }),
    workItemRow({ id: '090', projectId, parentId: null, position: 2 }),
  ];
  for (const row of rows) await source.stores.workItems.insert(row, [], { at: 1, by: F });
  for (const [id, name] of [
    ['claire', 'claire'],
    ['claire-worker', 'claire-worker'],
    ['claire-worker-2', 'claire-worker-2'],
    ['codex-fleet', 'codex-fleet'],
    ['stranger', 'stranger'],
    ['nobody', 'nobody'],
  ]) {
    await source.stores.directory.addPerson({ id, name, kind: 'agent' }, [], { at: 1, by: F });
  }
  for (const [personId, accountId] of identities.bound) {
    const bound = await source.stores.directory.patchPerson(
      personId,
      { accountId },
      { at: 1, by: F },
    );
    if (!bound.ok) throw new Error(`binding ${personId} was refused: ${bound.reason}`);
  }
  if (identities.pinned !== null)
    fixture.pinCredential(FLEET.issuer, FLEET.subject, identities.pinned);
  const runner = createPlanCommandRunner({
    uow: source.uow,
    announcements: broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements) =>
      servicesOver(scope.stores, { ...options, broadcast: announcements }),
  });
  const claims = () => source.stores.claims.listByProject(projectId);
  const progress = () => source.stores.progress.listByProject(projectId);
  const revision = async (id: string) =>
    (await source.stores.workItems.listByProject(projectId)).find((row) => row.id === id)?.revision;
  const entries = async (actor: string) =>
    (await source.stores.journal.entriesFor(projectId, actor)).length;
  return { source, fixture, graph, runner, projectId, steps, claims, progress, revision, entries };
}

/** The id a batch's first applied command minted, for a `createWorkItem`. */
function mintedIdOf(
  answer: Awaited<ReturnType<ReturnType<typeof createPlanCommandRunner>['run']>>,
) {
  if (!answer.ok) throw new Error(`the batch was refused: ${answer.reason}`);
  const minted = answer.results[0]?.id;
  if (minted === undefined) throw new Error('the batch minted no id');
  return minted;
}

/** The claims one applied `claimWorkItem` answered with. */
function claimIdsOf(applied: AppliedCommand | undefined): string[] {
  if (applied?.kind !== 'claimWorkItem') throw new Error('not a claim result');
  return applied.claimIds;
}

describe('claimWorkItem in a batch', () => {
  it('claims every step that is not done, states the unstated one, one journal entry', async () => {
    const { source, runner, projectId, steps, claims, progress, revision, entries } =
      await seeded();
    const [impl, review] = steps;
    try {
      expect(steps).toHaveLength(2);
      // QA carries an estimate: a leaf whose only worked step is done reads done,
      // and a claim on it is refused item_done (the table's own fold).
      await runner.run(projectId, F, [
        {
          kind: 'setEstimate',
          workItemId: '080.25',
          stepId: review,
          days: { optimistic: 1, realistic: 2, pessimistic: 3 },
        },
        { kind: 'setProgress', workItemId: '080.25', stepId: impl, state: 'done' },
      ]);
      const before = await entries(F);
      const revisionBefore = await revision('080.25');
      const answer = await runner.run(projectId, F, [
        { kind: 'claimWorkItem', workItemId: '080.25', personId: 'claire-worker', runId: 'run-1' },
      ]);
      expect(answer).toMatchObject({ ok: true, results: [{ index: 0, alreadyHeld: false }] });
      expect(
        (await claims()).map(({ stepId, personId, runId }) => [stepId, personId, runId]),
      ).toEqual([[review, 'claire-worker', 'run-1']]);
      expect(await entries(F)).toBe(before + 1);
      // The memory source keeps no work-item revisions; SQLite's is asserted in its race test.
      expect(await revision('080.25')).toBe(revisionBefore);
      const stated = await progress();
      expect(stated.find((each) => each.stepId === impl)?.state).toBe('done');
      expect(stated.find((each) => each.stepId === review)?.state).toBe('in_progress');
      expect(await source.stores.directory.assignmentsFor('080.25')).toEqual([]);
    } finally {
      await source.close();
    }
  });

  it('answers alreadyHeld to the holder repeating it and adds no entry', async () => {
    const { source, runner, projectId, claims, entries } = await seeded();
    try {
      const claim = {
        kind: 'claimWorkItem' as const,
        workItemId: '090',
        personId: 'claire',
        runId: 'r',
      };
      await runner.run(projectId, F, [claim]);
      const held = await claims();
      const before = await entries(F);
      expect(await runner.run(projectId, F, [claim])).toMatchObject({
        ok: true,
        results: [{ alreadyHeld: true, claimIds: held.map(({ id }) => id) }],
      });
      expect(await entries(F)).toBe(before);
      expect(await claims()).toEqual(held);
    } finally {
      await source.close();
    }
  });

  it('undo removes exactly the claims and the progress it stated; redo puts them back', async () => {
    const { source, runner, projectId, steps, claims, progress } = await seeded();
    const [impl] = steps;
    try {
      await runner.run(projectId, F, [
        { kind: 'setProgress', workItemId: '090', stepId: impl, state: 'in_progress' },
      ]);
      const statedBefore = await progress();
      await runner.run(projectId, F, [
        { kind: 'claimWorkItem', workItemId: '090', personId: 'claire' },
      ]);
      const held = await claims();
      expect(held).toHaveLength(2);
      expect(await progress()).toHaveLength(2);
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await claims()).toEqual([]);
      expect(await progress()).toEqual(statedBefore);
      expect(await runner.redo(projectId, F)).toMatchObject({ ok: true });
      expect(await claims()).toEqual(held);
    } finally {
      await source.close();
    }
  });

  it('refuses a claim on a leaf whose only worked step is done: it reads done', async () => {
    const { source, runner, projectId, steps, claims } = await seeded();
    const [impl] = steps;
    try {
      await runner.run(projectId, F, [
        { kind: 'setProgress', workItemId: '090', stepId: impl, state: 'done' },
      ]);
      expect(
        await runner.run(projectId, F, [
          { kind: 'claimWorkItem', workItemId: '090', personId: 'claire' },
        ]),
      ).toMatchObject({ ok: false, reason: 'item_done' });
      expect(await claims()).toEqual([]);
    } finally {
      await source.close();
    }
  });

  it('refuses a redo of a claim once another holder took the step', async () => {
    const { source, runner, projectId, steps, claims } = await seeded();
    const [impl] = steps;
    try {
      await runner.run(projectId, F, [
        { kind: 'claimWorkItem', workItemId: '090', personId: 'claire', steps: [impl] },
      ]);
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      await runner.run(projectId, G, [
        { kind: 'claimWorkItem', workItemId: '090', personId: 'stranger', steps: [impl] },
      ]);
      const held = await claims();
      expect(await runner.redo(projectId, F)).toMatchObject({ ok: false });
      expect(await claims()).toEqual(held);
    } finally {
      await source.close();
    }
  });

  it('shows the batch the progress its claim stated', async () => {
    const { source, runner, projectId } = await seeded();
    try {
      expect(
        await runner.run(projectId, F, [
          { kind: 'claimWorkItem', workItemId: '090', personId: 'claire' },
          { kind: 'setStatus', workItemId: '090', status: 'ready' },
        ]),
      ).toMatchObject({ ok: false, at: 1, reason: 'readiness_after_progress' });
    } finally {
      await source.close();
    }
  });

  it('lets two agents hold two steps of one leaf', async () => {
    const { source, runner, projectId, steps, claims } = await seeded();
    const [impl, review] = steps;
    try {
      await runner.run(projectId, F, [
        { kind: 'claimWorkItem', workItemId: '090', personId: 'claire-worker', steps: [impl] },
      ]);
      expect(
        await runner.run(projectId, F, [
          {
            kind: 'claimWorkItem',
            workItemId: '090',
            personId: 'claire-worker-2',
            steps: [review],
          },
        ]),
      ).toMatchObject({ ok: true });
      expect((await claims()).map(({ personId }) => personId).sort()).toEqual([
        'claire-worker',
        'claire-worker-2',
      ]);
    } finally {
      await source.close();
    }
  });

  it('refuses a step another holder has, naming the holder, and writes nothing', async () => {
    const { source, runner, projectId, steps, claims } = await seeded();
    const [plan] = steps;
    try {
      await runner.run(projectId, F, [
        {
          kind: 'claimWorkItem',
          workItemId: '090',
          personId: 'claire-worker',
          steps: [plan],
          runId: 'r1',
        },
      ]);
      const held = await claims();
      expect(
        await runner.run(projectId, G, [
          { kind: 'claimWorkItem', workItemId: '090', personId: 'stranger', steps: [plan] },
        ]),
      ).toEqual({
        ok: false,
        at: 0,
        kind: 'claimWorkItem',
        reason: 'already_claimed',
        detail: {
          holders: [
            { claimId: held[0]?.id, personId: 'claire-worker', name: 'claire-worker', runId: 'r1' },
          ],
        },
      });
      expect(await claims()).toEqual(held);
    } finally {
      await source.close();
    }
  });

  it('refuses a leaf reading blocked_by_proxy with that status', async () => {
    const { source, runner, projectId, claims } = await seeded();
    try {
      await runner.run(projectId, F, [
        { kind: 'setStatus', workItemId: '080.26', status: 'blocked' },
        { kind: 'addDependency', workItemId: '090', predecessorId: '080.26' },
      ]);
      expect(
        await runner.run(projectId, F, [
          { kind: 'claimWorkItem', workItemId: '090', personId: 'claire' },
        ]),
      ).toEqual({
        ok: false,
        at: 0,
        kind: 'claimWorkItem',
        reason: 'not_startable',
        detail: { status: 'blocked_by_proxy' },
      });
      expect(await claims()).toEqual([]);
    } finally {
      await source.close();
    }
  });

  // Proof: with decideClaim's bound-account check replaced by `false`, this case
  // failed through the command path; watched 2026-10-19.
  it('refuses a person nobody bound to a non-admin caller', async () => {
    const { source, runner, projectId } = await seeded();
    try {
      expect(
        await runner.run(projectId, F, [
          { kind: 'claimWorkItem', workItemId: '090', personId: 'nobody' },
        ]),
      ).toMatchObject({ ok: false, reason: 'person_not_bound' });
    } finally {
      await source.close();
    }
  });

  // Proof: with decideClaim's pin check replaced by `false`, this case failed
  // through the command path; watched 2026-10-19.
  it('refuses a pinned credential claiming as another agent', async () => {
    const { source, runner, projectId } = await seeded({ bound: BOUND.bound, pinned: 'claire' });
    try {
      const claimAs = (personId: string, credential: CredentialPair | null) =>
        runner.runWithin(
          projectId,
          F,
          [{ kind: 'claimWorkItem', workItemId: '090', personId }],
          LEGACY_ACCESS,
          credential,
        );
      expect(await claimAs('codex-fleet', FLEET)).toMatchObject({
        ok: false,
        reason: 'credential_not_for_person',
      });
      // The account's own session carries no pair, so nothing pins it.
      expect(await claimAs('codex-fleet', null)).toMatchObject({ ok: true });
    } finally {
      await source.close();
    }
  });

  // An organization-owned person binds only to a member (S3-2), and the claim
  // then reads that binding through the source's real directory.
  it('claims as an owned person bound to a member of its organization', async () => {
    const { source, fixture, runner, projectId } = await seeded();
    try {
      await source.stores.directory.addPerson({ id: 'owned', name: 'owned', kind: 'agent' }, [], {
        at: 1,
        by: F,
      });
      fixture.ownPersonInOrganization('owned', 'org-a', [F]);
      expect(
        await source.stores.directory.patchPerson('owned', { accountId: G }, { at: 2, by: F }),
      ).toEqual({ ok: false, reason: 'unknown_account' });
      expect(
        await runner.run(projectId, F, [
          { kind: 'claimWorkItem', workItemId: '090', personId: 'owned' },
        ]),
      ).toMatchObject({ ok: false, reason: 'person_not_bound' });
      expect(
        (await source.stores.directory.patchPerson('owned', { accountId: F }, { at: 2, by: F })).ok,
      ).toBe(true);
      expect(
        await runner.run(projectId, F, [
          { kind: 'claimWorkItem', workItemId: '090', personId: 'owned' },
        ]),
      ).toMatchObject({ ok: true });
    } finally {
      await source.close();
    }
  });

  it('chains a subagent’s leaf claim to the superagent’s subtree, and refuses a stranger', async () => {
    const { source, runner, projectId, claims } = await seeded();
    try {
      const subtree = await runner.run(projectId, F, [
        { kind: 'claimWorkItem', workItemId: '080', personId: 'claire' },
      ]);
      if (!subtree.ok) throw new Error('the subtree claim was refused');
      const [parentClaim] = claimIdsOf(subtree.results[0]);
      expect(
        await runner.run(projectId, F, [
          {
            kind: 'claimWorkItem',
            workItemId: '080.25',
            personId: 'claire-worker',
            runId: 'agent:main:subagent:7f',
            parentClaim,
          },
        ]),
      ).toMatchObject({ ok: true });
      const chain = await claims();
      expect(chain.find(({ workItemId }) => workItemId === '080.25')?.parentClaimId).toBe(
        parentClaim,
      );
      expect(
        await runner.run(projectId, G, [
          { kind: 'claimWorkItem', workItemId: '080.26', personId: 'stranger' },
        ]),
      ).toMatchObject({
        ok: false,
        reason: 'inside_subtree_claim',
        detail: { holder: { claimId: parentClaim, personId: 'claire', name: 'claire' } },
      });
    } finally {
      await source.close();
    }
  });
});

describe('a claimed leaf that gains its first child', () => {
  it("hands a claimed leaf's claims to its first child and back on undo", async () => {
    const { source, graph, runner, projectId, steps, claims } = await seeded();
    const [impl] = steps;
    try {
      await runner.run(projectId, F, [
        { kind: 'claimWorkItem', workItemId: '090', personId: 'claire', steps: [impl] },
      ]);
      const held = await claims();
      expect(held.map(({ workItemId, stepId }) => [workItemId, stepId])).toEqual([['090', impl]]);
      const child = mintedIdOf(
        await runner.run(projectId, F, [
          { kind: 'createWorkItem', parentId: '090', afterId: null, name: 'Half' },
        ]),
      );
      expect(await claims()).toEqual(held.map((each) => ({ ...each, workItemId: child })));
      const startable = await graph.workItems.startableWithin(projectId, LEGACY_ACCESS, null);
      if (startable === null || 'kind' in startable) throw new Error('the read refused');
      expect(startable.claimed.map(({ workItemId, stepId }) => [workItemId, stepId])).toEqual([
        [child, impl],
      ]);
      expect(
        await runner.run(projectId, G, [
          { kind: 'claimWorkItem', workItemId: child, personId: 'stranger', steps: [impl] },
        ]),
      ).toMatchObject({
        ok: false,
        reason: 'already_claimed',
        detail: { holders: [{ claimId: held[0]?.id, personId: 'claire' }] },
      });

      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await claims()).toEqual(held);
      expect(await runner.redo(projectId, F)).toMatchObject({ ok: true });
      expect(await claims()).toEqual(held.map((each) => ({ ...each, workItemId: child })));
      expect(
        await runner.run(projectId, F, [
          { kind: 'releaseWorkItem', workItemId: child, personId: 'claire' },
        ]),
      ).toMatchObject({ ok: true });
      expect(await claims()).toEqual([]);
    } finally {
      await source.close();
    }
  });

  it('releases the handed-down claim on the child', async () => {
    const { source, runner, projectId, steps, claims } = await seeded();
    const [impl] = steps;
    try {
      await runner.run(projectId, F, [
        { kind: 'claimWorkItem', workItemId: '090', personId: 'claire', steps: [impl] },
      ]);
      const child = mintedIdOf(
        await runner.run(projectId, F, [
          { kind: 'createWorkItem', parentId: '090', afterId: null, name: 'Half' },
        ]),
      );
      expect(
        await runner.run(projectId, F, [
          { kind: 'releaseWorkItem', workItemId: child, personId: 'claire' },
        ]),
      ).toMatchObject({ ok: true });
      expect(await claims()).toEqual([]);
    } finally {
      await source.close();
    }
  });

  // The memory source keeps no revisions, so only the replay's own check stands
  // between this undo and a claim it never wrote.
  it("refuses an undo of a split once the child's claims changed", async () => {
    const { source, runner, projectId, steps, claims } = await seeded();
    const [impl, review] = steps;
    try {
      await runner.run(projectId, F, [
        { kind: 'claimWorkItem', workItemId: '090', personId: 'claire', steps: [impl] },
      ]);
      const child = mintedIdOf(
        await runner.run(projectId, F, [
          { kind: 'createWorkItem', parentId: '090', afterId: null, name: 'Half' },
        ]),
      );
      await runner.run(projectId, G, [
        { kind: 'claimWorkItem', workItemId: child, personId: 'stranger', steps: [review] },
      ]);
      const held = await claims();
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: false });
      expect(await claims()).toEqual(held);
    } finally {
      await source.close();
    }
  });
});

describe('releaseWorkItem in a batch', () => {
  it('releases a half-done leaf and leaves its progress as it was', async () => {
    const { source, runner, projectId, steps, claims, progress } = await seeded();
    const [impl, review] = steps;
    try {
      await runner.run(projectId, F, [
        { kind: 'claimWorkItem', workItemId: '090', personId: 'claire', steps: [impl, review] },
        { kind: 'setProgress', workItemId: '090', stepId: impl, state: 'done' },
      ]);
      const stated = await progress();
      expect(
        await runner.run(projectId, F, [
          { kind: 'releaseWorkItem', workItemId: '090', personId: 'claire' },
        ]),
      ).toMatchObject({ ok: true });
      expect(await claims()).toEqual([]);
      expect(await progress()).toEqual(stated);
    } finally {
      await source.close();
    }
  });

  it('cascades a subtree release in one entry, and undo restores all three', async () => {
    const { source, runner, projectId, claims, entries } = await seeded();
    try {
      const subtree = await runner.run(projectId, F, [
        { kind: 'claimWorkItem', workItemId: '080', personId: 'claire' },
      ]);
      if (!subtree.ok) throw new Error('the subtree claim was refused');
      const [parentClaim] = claimIdsOf(subtree.results[0]);
      await runner.run(projectId, F, [
        { kind: 'claimWorkItem', workItemId: '080.25', personId: 'claire-worker', parentClaim },
        { kind: 'claimWorkItem', workItemId: '080.26', personId: 'claire-worker-2', parentClaim },
      ]);
      const held = await claims();
      expect(new Set(held.map(({ workItemId }) => workItemId))).toEqual(
        new Set(['080', '080.25', '080.26']),
      );
      const before = await entries(F);
      expect(
        await runner.run(projectId, F, [
          { kind: 'releaseWorkItem', workItemId: '080', personId: 'claire' },
        ]),
      ).toMatchObject({ ok: true });
      expect(await claims()).toEqual([]);
      expect(await entries(F)).toBe(before + 1);
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await claims()).toEqual(held);
    } finally {
      await source.close();
    }
  });

  it('refuses releasing what the person does not hold', async () => {
    const { source, runner, projectId } = await seeded();
    try {
      expect(
        await runner.run(projectId, F, [
          { kind: 'releaseWorkItem', workItemId: '090', personId: 'claire' },
        ]),
      ).toMatchObject({ ok: false, reason: 'not_claimed_by' });
    } finally {
      await source.close();
    }
  });
});
