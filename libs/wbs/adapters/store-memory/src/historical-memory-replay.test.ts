import { servicesOver } from '@wbs/core/compose';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { clockOf } from '@wbs/core/ports/clock';
import { LEGACY_EDIT_ADMISSION } from '@wbs/core/ports/edit-admission';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { localCommandAccess } from '@wbs/core/testing/organization-access-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect, test } from 'bun:test';

import type { MemorySourceFixture } from './source';
import { memoryLateWriteControl, openMemoryFixtureWithFault } from './testing/faults';
import {
  decodeLegacyMemoryHistory,
  type LegacyMemoryPhase,
  openLegacyMemoryHistory,
  prepareLegacyMemoryHistory,
  readLegacyMemoryHistory,
} from './testing/legacy-memory-history';
import { workPackageRow } from './work-package-fixture';

function makeRunner(source: MemorySourceFixture['source']) {
  const broadcast = recordingBroadcaster(),
    clock = clockOf({ now: () => 1000, newId: () => crypto.randomUUID() });
  const compose = (
    stores: Parameters<typeof servicesOver>[0],
    announcements: Parameters<typeof servicesOver>[1]['broadcast'] = broadcast,
  ) =>
    servicesOver(stores, {
      dependencyContext: createLocalDependencyContext(stores),
      admission: LEGACY_EDIT_ADMISSION,
      clock,
      broadcast: announcements,
      scheduler: fastScheduler,
    });
  return createPlanCommandRunner({
    commandAccess: localCommandAccess,
    uow: source.uow,
    announcements: broadcast,
    publicServices: compose(source.stores),
    batchServices: (scope, announcements) => compose(scope.stores, announcements),
  });
}

async function createOtherHistory(
  prepared: Awaited<ReturnType<typeof prepareLegacyMemoryHistory>>,
) {
  const { source, workPackageId, author } = prepared;
  const original = await source.stores.workPackages.findById(workPackageId);
  if (original === null) throw new Error('Current archive package is absent');
  const otherId = 'history-other-package',
    stamp = { at: 1, by: author };
  const created = await source.stores.workPackages.createWithSteps(
    workPackageRow({ id: otherId, projectId: original.projectId, abbreviation: 'OTHER' }),
    stamp,
    { kind: 'legacy' },
  );
  if (typeof created === 'string')
    throw new Error('Other actual history package refused: ' + created);
  await source.stores.workItems.insert(
    workItemRow({ id: 'other-history-leaf', workPackageId: otherId }),
    [],
    stamp,
  );
  expect(
    await makeRunner(source).run(otherId, author, [
      {
        kind: 'patchWorkItem',
        workItemId: 'other-history-leaf',
        patch: { notes: 'Independent current record' },
      },
    ]),
  ).toMatchObject({ ok: true });
  return {
    workPackageId: otherId,
    entries: await source.stores.journal.entriesFor({
      workPackageId: otherId,
      userId: author,
      personId: null,
    }),
    events: await prepared.fixture.journalHistoryFor(otherId),
    rows: await source.stores.workItems.listByWorkPackage(otherId),
  };
}

async function expectRejection(pending: Promise<unknown>, message: string) {
  const observed = await pending.then(
    () => ({ ok: true as const }),
    (cause: unknown) => ({ ok: false as const, cause }),
  );
  expect(observed.ok).toBe(false);
  if (observed.ok) throw new Error('Expected historical fixture rejection');
  expect(observed.cause).toBeInstanceOf(Error);
  if (!(observed.cause instanceof Error)) throw observed.cause;
  expect(observed.cause.message).toContain(message);
}

for (const collision of ['entry', 'event', 'none'] as const)
  test(
    'historical restore checks existing cross-package ' +
      collision +
      ' identities and preserves unrelated history',
    async () => {
      const prepared = await prepareLegacyMemoryHistory('rename', 'after-move');
      try {
        const { fixture, source, checkpoint, author } = prepared;
        const other = await createOtherHistory(prepared);
        if (collision === 'entry') {
          const target = checkpoint.entries.at(0),
            existing = other.entries.at(0);
          if (target === undefined || existing === undefined)
            throw new Error('Actual journal collision rows absent');
          target.id = existing.id;
        } else if (collision === 'event') {
          const target = checkpoint.events.at(0),
            existing = other.events.at(0);
          if (target === undefined || existing === undefined)
            throw new Error('Actual history collision rows absent');
          target.id = existing.id;
        }
        const before = fixture.stepCatalogueEvidence().snapshot;
        if (collision === 'none') await fixture.restoreCommandHistory(checkpoint);
        else {
          await expectRejection(
            fixture.restoreCommandHistory(checkpoint),
            collision === 'entry' ? 'entry identity or sequence' : 'event identity',
          );
          expect(fixture.stepCatalogueEvidence().snapshot).toEqual(before);
        }
        expect(
          await source.stores.journal.entriesFor({
            workPackageId: other.workPackageId,
            userId: author,
            personId: null,
          }),
        ).toEqual(other.entries);
        expect(await fixture.journalHistoryFor(other.workPackageId)).toEqual(other.events);
        expect(await source.stores.workItems.listByWorkPackage(other.workPackageId)).toEqual(
          other.rows,
        );
      } finally {
        await prepared.close();
      }
    },
  );

for (const kind of ['rename', 'progress'] as const) {
  test(
    'genuine Memory ' + kind + ' history refuses laundering after current prior undo and redo',
    async () => {
      const fixture = await openLegacyMemoryHistory(kind, 'after-move');
      try {
        const { source, workPackageId, author } = fixture;
        const broadcast = recordingBroadcaster(),
          clock = clockOf({ now: () => 1000, newId: () => crypto.randomUUID() });
        const compose = (
          stores: Parameters<typeof servicesOver>[0],
          announcements: Parameters<typeof servicesOver>[1]['broadcast'] = broadcast,
        ) =>
          servicesOver(stores, {
            dependencyContext: createLocalDependencyContext(stores),
            admission: LEGACY_EDIT_ADMISSION,
            clock,
            broadcast: announcements,
            scheduler: fastScheduler,
          });
        const runner = createPlanCommandRunner({
          commandAccess: localCommandAccess,
          uow: source.uow,
          announcements: broadcast,
          publicServices: compose(source.stores),
          batchServices: (scope, announcements) => compose(scope.stores, announcements),
        });
        const recorded = await fixture.fixture.journalHistoryFor(workPackageId);
        expect(recorded).toEqual(fixture.checkpoint.events);
        expect(
          await source.stores.journal.entriesFor({ workPackageId, userId: author, personId: null }),
        ).toEqual(fixture.checkpoint.entries);
        expect(await runner.undo(workPackageId, author)).toMatchObject({ ok: true });
        const changed = fixture.selected.metadata.steps.find(
          (step) => step.code === (kind === 'rename' ? 'dev' : 'qa'),
        );
        if (changed === undefined) throw new Error('Genuine changed step is missing');
        expect(
          await source.stores.progress.set(
            { workItemId: 'destination', stepId: changed.id, state: 'in_progress', statedAt: 456 },
            { at: 2, by: author },
          ),
        ).toBe('written');
        expect(await runner.undo(workPackageId, author)).toMatchObject({ ok: true });
        expect(await runner.redo(workPackageId, author)).toMatchObject({ ok: true });
        const before = await fixture.snapshot(),
          publicationCount = broadcast.published.length;
        // Proof: bypassing the actual progress snapshot admitted stale replay in both genuine cases (memory-history-fault-snapshot-v1).
        expect(await runner.redo(workPackageId, author)).toMatchObject({
          ok: false,
          reason: 'stale_undo',
          detail: 'progress on a guarded work item changed since this command.',
        });
        expect(await fixture.snapshot()).toEqual(before);
        expect(broadcast.published).toHaveLength(publicationCount);
        expect(await fixture.fixture.journalHistoryFor(workPackageId)).toEqual(recorded);
      } finally {
        await fixture.close();
      }
    },
  );
}

for (const fault of [
  'missing-package',
  'missing-organization',
  'foreign-entry',
  'foreign-event',
  'unknown-entry-actor',
  'unknown-event-actor',
  'duplicate-entry',
  'duplicate-event',
  'duplicate-sequence',
  'zero-sequence',
  'fractional-sequence',
  'unsafe-sequence',
] as const) {
  test(
    'current historical journal restore refuses ' + fault + ' without changing any persisted state',
    async () => {
      const prepared = await prepareLegacyMemoryHistory('rename', 'after-move');
      try {
        const { fixture, checkpoint, workPackageId } = prepared;
        const first = checkpoint.entries.at(0),
          second = checkpoint.entries.at(1),
          event = checkpoint.events.at(0);
        if (first === undefined || second === undefined || event === undefined)
          throw new Error('Genuine checkpoint rows absent');
        let message: string;
        switch (fault) {
          case 'missing-package':
            checkpoint.workPackageId = 'absent-package';
            for (const entry of checkpoint.entries) entry.workPackageId = 'absent-package';
            for (const record of checkpoint.events) record.workPackageId = 'absent-package';
            message = 'target package or organization is absent';
            break;
          case 'missing-organization':
            fixture.removeWorkPackageOrganization(workPackageId);
            message = 'target package or organization is absent';
            break;
          case 'foreign-entry':
            first.workPackageId = 'foreign-package';
            message = 'current package/account';
            break;
          case 'foreign-event':
            event.workPackageId = 'foreign-package';
            message = 'current package/account';
            break;
          case 'unknown-entry-actor':
            first.userId = 'absent-account';
            message = 'current package/account';
            break;
          case 'unknown-event-actor':
            event.userId = 'absent-account';
            message = 'current package/account';
            break;
          case 'duplicate-entry':
            second.id = first.id;
            message = 'entry identity or sequence';
            break;
          case 'duplicate-event':
            checkpoint.events.push(structuredClone(event));
            message = 'event identity';
            break;
          case 'duplicate-sequence':
            second.seq = first.seq;
            message = 'entry identity or sequence';
            break;
          case 'zero-sequence':
            first.seq = 0;
            message = 'entry identity or sequence';
            break;
          case 'fractional-sequence':
            first.seq = 0.5;
            message = 'entry identity or sequence';
            break;
          case 'unsafe-sequence':
            first.seq = Number.MAX_SAFE_INTEGER + 1;
            message = 'entry identity or sequence';
            break;
        }
        const before = fixture.stepCatalogueEvidence().snapshot;
        await expectRejection(fixture.restoreCommandHistory(checkpoint), message);
        expect(fixture.stepCatalogueEvidence().snapshot).toEqual(before);
        expect(await fixture.journalHistoryFor(workPackageId)).toEqual([]);
      } finally {
        await prepared.close();
      }
    },
  );
}

for (const keepJournal of [true, false])
  test(
    'historical restore preserves existing current ' +
      (keepJournal ? 'journal and events' : 'history-only events'),
    async () => {
      const prepared = await prepareLegacyMemoryHistory('rename', 'after-move');
      try {
        const { fixture, source, workPackageId, author, checkpoint } = prepared;
        expect(
          await makeRunner(source).run(workPackageId, author, [
            {
              kind: 'patchWorkItem',
              workItemId: 'destination',
              patch: { notes: 'Current recorded prefix' },
            },
          ]),
        ).toMatchObject({ ok: true });
        if (!keepJournal) {
          const entries = await source.stores.journal.entriesFor({
            workPackageId,
            userId: author,
            personId: null,
          });
          const entry = entries.at(0);
          if (entry === undefined) throw new Error('Actual current journal entry missing');
          await source.stores.journal.discard(entry.id);
        }
        const before = fixture.stepCatalogueEvidence().snapshot;
        await expectRejection(
          fixture.restoreCommandHistory(checkpoint),
          'already has recorded history',
        );
        expect(fixture.stepCatalogueEvidence().snapshot).toEqual(before);
      } finally {
        await prepared.close();
      }
    },
  );

test('historical restore retains the complete caller checkpoint before queued admission', async () => {
  const prepared = await prepareLegacyMemoryHistory('rename', 'after-move');
  try {
    const { fixture, source, checkpoint, workPackageId, author } = prepared,
      original = structuredClone(checkpoint);
    let observed: Promise<PromiseSettledResult<void>[]> | undefined;
    await source.uow.run(() => {
      observed = Promise.allSettled([fixture.restoreCommandHistory(checkpoint)]);
      checkpoint.workPackageId = 'mutated-after-queue';
      checkpoint.entries.splice(0);
      checkpoint.events.splice(0);
      return Promise.resolve({ commit: false as const, value: undefined });
    });
    if (observed === undefined) throw new Error('Historical restore did not queue');
    expect(await observed).toEqual([{ status: 'fulfilled', value: undefined }]);
    expect(
      await source.stores.journal.entriesFor({ workPackageId, userId: author, personId: null }),
    ).toEqual(original.entries);
    expect(await fixture.journalHistoryFor(workPackageId)).toEqual(original.events);
  } finally {
    await prepared.close();
  }
});

for (const mode of ['closed', 'queued-before-close'] as const)
  test('historical restore refuses ' + mode + ' Source ownership', async () => {
    const prepared = await prepareLegacyMemoryHistory('rename', 'after-move');
    try {
      const { fixture, source, checkpoint } = prepared;
      if (mode === 'closed') {
        await source.close();
        await expectRejection(
          Promise.resolve().then(() => fixture.restoreCommandHistory(checkpoint)),
          'memory source is closed',
        );
      } else {
        let observed: Promise<PromiseSettledResult<void>[]> | undefined;
        await expectRejection(
          source.uow.run(async () => {
            observed = Promise.allSettled([fixture.restoreCommandHistory(checkpoint)]);
            await source.close();
            return { commit: false, value: undefined };
          }),
          'memory source is closed',
        );
        if (observed === undefined) throw new Error('Historical restore did not queue');
        const settled = await observed;
        expect(settled).toHaveLength(1);
        const only = settled.at(0);
        if (only === undefined) throw new Error('Queued historical outcome is absent');
        expect(only.status).toBe('rejected');
        if (only.status !== 'rejected')
          throw new Error('Closed queued history unexpectedly restored');
        const failure: unknown = only.reason;
        expect(failure).toBeInstanceOf(Error);
      }
    } finally {
      await prepared.close();
    }
  });

test('historical journal late failure rolls back entries, events and all unrelated state', async () => {
  const control = memoryLateWriteControl('journal-history-insert'),
    fixture = openMemoryFixtureWithFault(control);
  const prepared = await prepareLegacyMemoryHistory('rename', 'after-move', fixture);
  try {
    const before = fixture.stepCatalogueEvidence().snapshot;
    control.arm();
    await expectRejection(
      fixture.restoreCommandHistory(prepared.checkpoint),
      'injected memory fault at journal-history-insert',
    );
    expect(control.reached()).toBe(true);
    expect(control.observedJournalEventIds()).toEqual(
      prepared.checkpoint.events.map(({ id }) => id),
    );
    expect(fixture.stepCatalogueEvidence().snapshot).toEqual(before);
  } finally {
    await prepared.close();
  }
});

test('actual Memory history codec refuses unsupported schema', () => {
  const version = readLegacyMemoryHistory('rename');
  Reflect.set(version, 'schema', 'unsupported');
  expect(() => decodeLegacyMemoryHistory(version)).toThrow();
});

test('actual Memory history codec refuses unrecorded joined labels', () => {
  const joined = readLegacyMemoryHistory('rename'),
    row = joined.chronology.at(1)?.facts.rows.at(0);
  if (row === undefined) throw new Error('Genuine old work item absent');
  Reflect.set(row.typeIds, '0', 'unrecorded-type');
  expect(() => decodeLegacyMemoryHistory(joined)).toThrow();
});

test('actual Memory history opener refuses a missing checkpoint with its source context', async () => {
  // External-call fault: a typed caller cannot request this unrecorded phase.
  await expectRejection(
    openLegacyMemoryHistory('rename', 'unrecorded-phase' as LegacyMemoryPhase),
    'Genuine Memory checkpoint is missing',
  );
});

for (const kind of ['rename', 'progress'] as const)
  for (const boundary of ['runner', 'borrowed'] as const)
    test(
      'genuine final ' +
        kind +
        ' checkpoint refuses current ' +
        boundary +
        ' replay without rewriting facts/events',
      async () => {
        const prepared = await openLegacyMemoryHistory(kind, 'before-final-redo');
        try {
          const { source, fixture, workPackageId, author } = prepared,
            before = await prepared.snapshot();
          const broadcast = recordingBroadcaster();
          const outcome =
            boundary === 'runner'
              ? await makeRunner(source).redo(workPackageId, author)
              : await source.uow.run(async ({ stores }) => ({
                  commit: false,
                  value: await servicesOver(stores, {
                    dependencyContext: createLocalDependencyContext(stores),
                    admission: LEGACY_EDIT_ADMISSION,
                    clock: clockOf({ now: () => 1000, newId: () => crypto.randomUUID() }),
                    broadcast,
                    scheduler: fastScheduler,
                  }).workItems.redo(workPackageId, author),
                }));
          expect(outcome).toMatchObject({
            ok: false,
            reason: 'stale_undo',
            detail: 'progress on a guarded work item changed since this command.',
          });
          expect(await prepared.snapshot()).toEqual(before);
          expect(await fixture.journalHistoryFor(workPackageId)).toEqual(
            prepared.checkpoint.events,
          );
          if (boundary === 'borrowed')
            expect(
              await source.stores.journal.entriesFor({
                workPackageId,
                userId: author,
                personId: null,
              }),
            ).toEqual(prepared.checkpoint.entries);
        } finally {
          await prepared.close();
        }
      },
    );
