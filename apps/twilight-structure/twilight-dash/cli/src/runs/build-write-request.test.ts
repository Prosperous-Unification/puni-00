import { rejects } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import { buildWriteRequest } from './build-write-request';
import { organizationId } from './record-codecs';
import { readRuntimeRequest } from './runtime-codecs';
import { FixtureClock } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';
import { createWriteFixture } from './testing/write-fixture';
import { ownerId } from './value-codecs';

for (const fault of ['input', 'guard'] as const)
  test('write builder rejects malformed ' + fault + ' before history IO', async () => {
    const clock = new FixtureClock();
    const stores = createMemoryStores({
      organizationId: organizationId('organization'),
      capacity: 1,
      leaseMilliseconds: 100,
      clock,
    });
    try {
      const setup = await createWriteFixture({ ...stores, clock });
      const request = readRuntimeRequest(setup.canonicalRequest).operation;
      if ('kind' in request || request.action.kind !== 'write') throw Error('fixture write absent');
      let reads = 0;
      const runs = {
        ...stores.runs,
        async readExecutionHistory(
          ...parameters: Parameters<typeof stores.runs.readExecutionHistory>
        ) {
          reads++;
          return await stores.runs.readExecutionHistory(...parameters);
        },
      };
      const input = {
        commandId: request.commandId,
        commands: request.action.commands,
        stateEvidence: setup.stateEvidence,
      };
      await rejects(
        buildWriteRequest(
          runs,
          stores.artifacts,
          fault === 'guard' ? { ...setup.guard, expectedScopeRevision: -1 } : setup.guard,
          fault === 'input' ? Object.assign({ ...input }, { unexpected: true }) : input,
        ),
      );
      expect(reads).toBe(0);
      expect((await buildWriteRequest(runs, stores.artifacts, setup.guard, input)).kind).toBe(
        'built',
      );
      expect(reads).toBe(1);
    } finally {
      await stores.close();
    }
  });

for (const fault of [
  'owner',
  'work',
  'step',
  'release_person',
  'release_steps',
  'release_position',
  'already_staged',
  'state_claim',
] as const)
  test('write builder refuses actual ' + fault + ' association without publication', async () => {
    const clock = new FixtureClock();
    const stores = createMemoryStores({
      organizationId: organizationId('organization'),
      capacity: 2,
      leaseMilliseconds: 100,
      clock,
    });
    try {
      const setup = await createWriteFixture({ ...stores, clock });
      const operation = readRuntimeRequest(setup.canonicalRequest).operation;
      if ('kind' in operation || operation.action.kind !== 'write')
        throw Error('fixture write absent');
      const commands = [...structuredClone(operation.action.commands)];
      const first = commands[0];
      const release = commands[1];
      if (first.kind !== 'setProgress' || release.kind !== 'releaseWorkItem')
        throw Error('actual fixture batch differs');
      let guard = setup.guard;
      let evidence = setup.stateEvidence;
      if (fault === 'owner')
        guard = { ...guard, ownership: { ...guard.ownership, ownerId: ownerId('foreign') } };
      if (fault === 'work') commands[0] = { ...first, workItemId: 'other' };
      if (fault === 'step') commands[0] = { ...first, stepId: 'other' };
      if (fault === 'release_person') commands[1] = { ...release, personId: 'other' };
      if (fault === 'release_steps') commands[1] = { ...release, steps: ['other'] };
      if (fault === 'release_position') commands.reverse();
      if (fault === 'already_staged') {
        expect((await stores.runs.stageWrite(setup.guard, setup.command)).kind).toBe('applied');
        guard = await setup.currentGuard();
      }
      if (fault === 'state_claim') {
        const retained = await stores.artifacts.retainArtifact(
          new TextEncoder().encode(
            JSON.stringify({
              ...setup.state,
              claims: setup.state.claims.map((entry) => ({
                ...entry,
                claim: { ...entry.claim, accountId: 'other' },
              })),
            }),
          ),
          'application/json',
        );
        if (retained.kind !== 'retained') throw Error('actual state retention refused');
        evidence = retained.reference;
      }
      const before = {
        run: await stores.runs.readRun(setup.run.runId),
        scope: await stores.runs.readRuntimeScope(setup.scope),
      };
      const building = buildWriteRequest(stores.runs, stores.artifacts, guard, {
        commandId: operation.commandId,
        commands,
        stateEvidence: evidence,
      });
      if (fault === 'state_claim')
        await rejects(building, /write state claim authority or target differs/);
      else
        expect(await building).toEqual({
          kind: 'refused',
          reason: fault === 'already_staged' ? 'state_conflict' : 'authority_conflict',
        });
      expect({
        run: await stores.runs.readRun(setup.run.runId),
        scope: await stores.runs.readRuntimeScope(setup.scope),
      }).toEqual(before);
    } finally {
      await stores.close();
    }
  });
test('write builder snapshots caller cuts and nested approved batch before its first history await', async () => {
  const clock = new FixtureClock();
  const stores = createMemoryStores({
    organizationId: organizationId('organization'),
    capacity: 2,
    leaseMilliseconds: 100,
    clock,
  });
  try {
    const setup = await createWriteFixture({ ...stores, clock });
    const wire = readRuntimeRequest(setup.canonicalRequest).operation;
    if ('kind' in wire || wire.action.kind !== 'write') throw Error('fixture write absent');
    const entered = Promise.withResolvers<undefined>();
    const released = Promise.withResolvers<undefined>();
    const guard = { ...setup.guard };
    const input = {
      commandId: wire.commandId,
      commands: structuredClone(wire.action.commands),
      stateEvidence: setup.stateEvidence,
    };
    const runs = {
      ...stores.runs,
      async readExecutionHistory(
        ...parameters: Parameters<typeof stores.runs.readExecutionHistory>
      ) {
        entered.resolve(undefined);
        await released.promise;
        return await stores.runs.readExecutionHistory(...parameters);
      },
    };
    const building = buildWriteRequest(runs, stores.artifacts, guard, input);
    await entered.promise;
    guard.expectedRevision = 0;
    input.commandId = 'mutated';
    Object.assign(input.commands[0] as object, { workItemId: 'other' });
    released.resolve(undefined);
    const reply = await building;
    expect(reply.kind).toBe('built');
    if (reply.kind !== 'built') throw Error('captured request refused');
    expect(reply.request.canonicalRequest).toBe(setup.canonicalRequest);
  } finally {
    await stores.close();
  }
});
for (const cut of ['run', 'attempt', 'scope'] as const)
  test(
    'write builder preserves independently submitted stale ' + cut + ' cut without mutation',
    async () => {
      const clock = new FixtureClock();
      const stores = createMemoryStores({
        organizationId: organizationId('organization'),
        capacity: 2,
        leaseMilliseconds: 100,
        clock,
      });
      try {
        const setup = await createWriteFixture({ ...stores, clock });
        const wire = readRuntimeRequest(setup.canonicalRequest).operation;
        if ('kind' in wire || wire.action.kind !== 'write') throw Error('fixture write absent');
        const before = await stores.runs.readRun(setup.run.runId);
        const guard = {
          ...setup.guard,
          ...(cut === 'run'
            ? { expectedRevision: 0 }
            : cut === 'attempt'
              ? { expectedAttemptRevision: 0 }
              : { expectedScopeRevision: 0 }),
        };
        expect(
          await buildWriteRequest(stores.runs, stores.artifacts, guard, {
            commandId: wire.commandId,
            commands: wire.action.commands,
            stateEvidence: setup.stateEvidence,
          }),
        ).toEqual({ kind: 'refused', reason: 'revision_conflict' });
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
      } finally {
        await stores.close();
      }
    },
  );
test('write builder uses actual fresh state basis and exact approved batch without mutation', async () => {
  const clock = new FixtureClock();
  const stores = createMemoryStores({
    organizationId: organizationId('organization'),
    capacity: 2,
    leaseMilliseconds: 100,
    clock,
  });
  try {
    const setup = await createWriteFixture({ ...stores, clock });
    const wire = readRuntimeRequest(setup.canonicalRequest).operation;
    if ('kind' in wire || wire.action.kind !== 'write') throw Error('fixture write absent');
    const before = await stores.runs.readRun(setup.run.runId);
    const built = await buildWriteRequest(stores.runs, stores.artifacts, setup.guard, {
      commandId: wire.commandId,
      commands: wire.action.commands,
      stateEvidence: setup.stateEvidence,
    });
    expect(built.kind).toBe('built');
    if (built.kind !== 'built') throw Error('request refused');
    expect(built.request.canonicalRequest).toBe(setup.canonicalRequest);
    expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
  } finally {
    await stores.close();
  }
});
