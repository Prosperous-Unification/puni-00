import type { JournalEntry, NewJournalEntry, PlanEvent, PlanEventStore } from '@wbs/core';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import type { CaseFixture, SeededPlan } from '../source-declaration';
import { type OpenCase, storeCase } from './store-case';

interface HistoryRecord {
  readonly entry: NewJournalEntry;
  readonly event: PlanEvent;
}

function historyRecord(
  journalId: string,
  eventId: string,
  projectId: string,
  userId: string,
  workItemId: string | null,
  kind: string,
  createdAt: number,
): HistoryRecord {
  return {
    entry: {
      id: journalId,
      projectId,
      userId,
      personId: null,
      kind,
      payload: { label: `History ${eventId}`, forward: { type: kind, workItemId } },
      inverse: { type: `undo_${kind}`, workItemId },
      preconditions: { expected: { [journalId]: createdAt }, from: {} },
      createdAt,
    },
    event: {
      id: eventId,
      projectId,
      userId,
      kind,
      label: `History ${eventId}`,
      workItemId,
      stepId: null,
      before: { type: `undo_${kind}`, workItemId },
      after: { type: kind, workItemId },
      createdAt,
    },
  };
}

function recordsFor(seed: SeededPlan): readonly HistoryRecord[] {
  return [
    historyRecord(
      'journal-a-99',
      'history-a-99',
      seed.projectIds[0],
      seed.ownerIds[0],
      seed.workItemIds[0][0],
      'estimate',
      99,
    ),
    // z, a, m is deliberately neither the required z, m, a order nor its
    // reverse. Proof: removing the memory tie-break returned z, a, m; removing
    // SQLite's ID order returned m, a, z. Both failed on complete event objects.
    historyRecord(
      'journal-a-100-z',
      'history-a-100-z',
      seed.projectIds[0],
      seed.ownerIds[0],
      seed.workItemIds[0][0],
      'clear_estimate',
      100,
    ),
    historyRecord(
      'journal-a-100-a',
      'history-a-100-a',
      seed.projectIds[0],
      seed.ownerIds[0],
      seed.workItemIds[0][1],
      'rename',
      100,
    ),
    historyRecord(
      'journal-a-100-m',
      'history-a-100-m',
      seed.projectIds[0],
      seed.ownerIds[0],
      seed.workItemIds[0][0],
      'actual',
      100,
    ),
    historyRecord(
      'journal-a-101-wide',
      'history-a-101-wide',
      seed.projectIds[0],
      seed.ownerIds[0],
      null,
      'freeze',
      101,
    ),
    historyRecord(
      'journal-b-99',
      'history-b-99',
      seed.projectIds[1],
      seed.ownerIds[1],
      seed.workItemIds[1][0],
      'actual',
      99,
    ),
    historyRecord(
      'journal-b-100',
      'history-b-100',
      seed.projectIds[1],
      seed.ownerIds[1],
      seed.workItemIds[1][1],
      'rename',
      100,
    ),
    historyRecord(
      'journal-b-101-wide',
      'history-b-101-wide',
      seed.projectIds[1],
      seed.ownerIds[1],
      null,
      'freeze',
      101,
    ),
  ];
}

function expectedEvents(
  seed: SeededPlan,
): readonly [
  PlanEvent,
  PlanEvent,
  PlanEvent,
  PlanEvent,
  PlanEvent,
  PlanEvent,
  PlanEvent,
  PlanEvent,
] {
  return [
    {
      id: 'history-a-101-wide',
      projectId: seed.projectIds[0],
      userId: seed.ownerIds[0],
      kind: 'freeze',
      label: 'History history-a-101-wide',
      workItemId: null,
      stepId: null,
      before: { type: 'undo_freeze', workItemId: null },
      after: { type: 'freeze', workItemId: null },
      createdAt: 101,
    },
    {
      id: 'history-a-100-z',
      projectId: seed.projectIds[0],
      userId: seed.ownerIds[0],
      kind: 'clear_estimate',
      label: 'History history-a-100-z',
      workItemId: seed.workItemIds[0][0],
      stepId: null,
      before: { type: 'undo_clear_estimate', workItemId: seed.workItemIds[0][0] },
      after: { type: 'clear_estimate', workItemId: seed.workItemIds[0][0] },
      createdAt: 100,
    },
    {
      id: 'history-a-100-m',
      projectId: seed.projectIds[0],
      userId: seed.ownerIds[0],
      kind: 'actual',
      label: 'History history-a-100-m',
      workItemId: seed.workItemIds[0][0],
      stepId: null,
      before: { type: 'undo_actual', workItemId: seed.workItemIds[0][0] },
      after: { type: 'actual', workItemId: seed.workItemIds[0][0] },
      createdAt: 100,
    },
    {
      id: 'history-a-100-a',
      projectId: seed.projectIds[0],
      userId: seed.ownerIds[0],
      kind: 'rename',
      label: 'History history-a-100-a',
      workItemId: seed.workItemIds[0][1],
      stepId: null,
      before: { type: 'undo_rename', workItemId: seed.workItemIds[0][1] },
      after: { type: 'rename', workItemId: seed.workItemIds[0][1] },
      createdAt: 100,
    },
    {
      id: 'history-a-99',
      projectId: seed.projectIds[0],
      userId: seed.ownerIds[0],
      kind: 'estimate',
      label: 'History history-a-99',
      workItemId: seed.workItemIds[0][0],
      stepId: null,
      before: { type: 'undo_estimate', workItemId: seed.workItemIds[0][0] },
      after: { type: 'estimate', workItemId: seed.workItemIds[0][0] },
      createdAt: 99,
    },
    {
      id: 'history-b-101-wide',
      projectId: seed.projectIds[1],
      userId: seed.ownerIds[1],
      kind: 'freeze',
      label: 'History history-b-101-wide',
      workItemId: null,
      stepId: null,
      before: { type: 'undo_freeze', workItemId: null },
      after: { type: 'freeze', workItemId: null },
      createdAt: 101,
    },
    {
      id: 'history-b-100',
      projectId: seed.projectIds[1],
      userId: seed.ownerIds[1],
      kind: 'rename',
      label: 'History history-b-100',
      workItemId: seed.workItemIds[1][1],
      stepId: null,
      before: { type: 'undo_rename', workItemId: seed.workItemIds[1][1] },
      after: { type: 'rename', workItemId: seed.workItemIds[1][1] },
      createdAt: 100,
    },
    {
      id: 'history-b-99',
      projectId: seed.projectIds[1],
      userId: seed.ownerIds[1],
      kind: 'actual',
      label: 'History history-b-99',
      workItemId: seed.workItemIds[1][0],
      stepId: null,
      before: { type: 'undo_actual', workItemId: seed.workItemIds[1][0] },
      after: { type: 'actual', workItemId: seed.workItemIds[1][0] },
      createdAt: 99,
    },
  ];
}

function expectedJournals(seed: SeededPlan): readonly [JournalEntry[], JournalEntry[]] {
  const a = (
    id: string,
    seq: number,
    kind: string,
    workItemId: string | null,
    createdAt: number,
  ): JournalEntry => ({
    id: `journal-a-${id}`,
    projectId: seed.projectIds[0],
    userId: seed.ownerIds[0],
    personId: null,
    seq,
    kind,
    payload: { label: `History history-a-${id}`, forward: { type: kind, workItemId } },
    inverse: { type: `undo_${kind}`, workItemId },
    preconditions: { expected: { [`journal-a-${id}`]: createdAt }, from: {} },
    undone: false,
    createdAt,
  });
  const b = (
    id: string,
    seq: number,
    kind: string,
    workItemId: string | null,
    createdAt: number,
  ): JournalEntry => ({
    id: `journal-b-${id}`,
    projectId: seed.projectIds[1],
    userId: seed.ownerIds[1],
    personId: null,
    seq,
    kind,
    payload: { label: `History history-b-${id}`, forward: { type: kind, workItemId } },
    inverse: { type: `undo_${kind}`, workItemId },
    preconditions: { expected: { [`journal-b-${id}`]: createdAt }, from: {} },
    undone: false,
    createdAt,
  });
  return [
    [
      a('99', 1, 'estimate', seed.workItemIds[0][0], 99),
      a('100-z', 2, 'clear_estimate', seed.workItemIds[0][0], 100),
      a('100-a', 3, 'rename', seed.workItemIds[0][1], 100),
      a('100-m', 4, 'actual', seed.workItemIds[0][0], 100),
      a('101-wide', 5, 'freeze', null, 101),
    ],
    [
      b('99', 1, 'actual', seed.workItemIds[1][0], 99),
      b('100', 2, 'rename', seed.workItemIds[1][1], 100),
      b('101-wide', 3, 'freeze', null, 101),
    ],
  ];
}

async function appendRecords(fixture: CaseFixture<PlanEventStore>): Promise<void> {
  for (const record of recordsFor(fixture.seed)) {
    await fixture.journalAppender.append(
      structuredClone(record.entry),
      structuredClone(record.event),
    );
  }
}

async function readJournals(
  fixture: CaseFixture<PlanEventStore>,
): Promise<readonly [JournalEntry[], JournalEntry[]]> {
  const { readers, seed } = fixture;
  return await Promise.all([
    readers.journal.entriesFor({
      projectId: seed.projectIds[0],
      userId: seed.ownerIds[0],
      personId: null,
    }),
    readers.journal.entriesFor({
      projectId: seed.projectIds[1],
      userId: seed.ownerIds[1],
      personId: null,
    }),
  ]);
}

/** One plan event of project A recorded through the journal, its `after` as given. */
function batchRecord(
  seed: SeededPlan,
  id: string,
  kind: string,
  createdAt: number,
  after: unknown,
): HistoryRecord {
  return {
    entry: {
      id: `journal-${id}`,
      projectId: seed.projectIds[0],
      userId: seed.ownerIds[0],
      personId: null,
      kind,
      payload: { label: id, forward: after },
      inverse: { do: 'noop' },
      preconditions: { expected: {}, from: {} },
      createdAt,
    },
    event: {
      id,
      projectId: seed.projectIds[0],
      userId: seed.ownerIds[0],
      kind,
      label: id,
      workItemId: null,
      stepId: null,
      before: { do: 'noop' },
      after,
      createdAt,
    },
  };
}

/**
 * Claim and release events, a nested claim-bearing batch, a batch holding
 * none, a batch whose text merely mentions `add_claims` and a
 * release-bearing batch, oldest first.
 */
function batchRecords(seed: SeededPlan): readonly HistoryRecord[] {
  return [
    batchRecord(seed, 'e-claim', 'claim', 10, { do: 'add_claims' }),
    batchRecord(seed, 'e-nested', 'batch', 20, {
      do: 'batch',
      steps: [
        { do: 'batch', steps: [{ do: 'add_claims' }, { do: 'assign' }] },
        { do: 'set_estimate' },
      ],
    }),
    batchRecord(seed, 'e-other', 'batch', 30, {
      do: 'batch',
      steps: [{ do: 'set_estimate' }, { do: 'rename' }],
    }),
    batchRecord(seed, 'e-text', 'batch', 40, {
      do: 'batch',
      steps: [{ do: 'rename', name: '{"do":"add_claims"}' }, { do: 'set_estimate' }],
    }),
    batchRecord(seed, 'e-release', 'release', 50, { do: 'remove_claims' }),
    batchRecord(seed, 'e-released', 'batch', 60, {
      do: 'batch',
      steps: [{ do: 'set_estimate' }, { do: 'remove_claims' }],
    }),
  ];
}

/** Shared project-history filtering, ordering and strict-retention cases. */
export function planEventRegistrations(open: OpenCase<'planEvents'>): readonly CaseRegistration[] {
  return [
    storeCase('planEvents', 'planEvents.listFor:filters-order', open, async (fixture) => {
      const { port, seed } = fixture;
      await appendRecords(fixture);
      const [a101, a100z, a100m, a100a, a99, b101, b100, b99] = expectedEvents(seed);
      const journals = expectedJournals(seed);

      // Proof: suppressing all project-B appends or discarding every journal
      // row makes the adapter setup negatives phase-fail before filtered reads.
      expect({
        projectAEvents: await port.listFor(seed.projectIds[0], {}),
        projectBEvents: await port.listFor(seed.projectIds[1], {}),
        journals: await readJournals(fixture),
      }).toEqual({
        projectAEvents: [a101, a100z, a100m, a100a, a99],
        projectBEvents: [b101, b100, b99],
        journals,
      });
      expect(
        await port.listFor(seed.projectIds[0], { workItemId: seed.workItemIds[0][0] }),
      ).toEqual([a100z, a100m, a99]);
      // Proof: dropping the item predicate only for an empty kinds filter
      // leaked the complete a101 and a100a records in memory and SQLite.
      expect(
        await port.listFor(seed.projectIds[0], {
          workItemId: seed.workItemIds[0][0],
          kinds: [],
        }),
      ).toEqual([a100z, a100m, a99]);
      expect(await port.listFor(seed.projectIds[0], { kinds: ['estimate', 'freeze'] })).toEqual([
        a101,
        a99,
      ]);
      expect(
        await port.listFor(seed.projectIds[0], {
          workItemId: seed.workItemIds[0][0],
          kinds: ['estimate', 'freeze'],
        }),
      ).toEqual([a99]);
      expect(await port.listFor(seed.projectIds[0], { kinds: ['no-recorded-kind'] })).toEqual([]);
      expect(await port.listFor(seed.projectIds[0], { kinds: [] })).toEqual([
        a101,
        a100z,
        a100m,
        a100a,
        a99,
      ]);
      expect(await port.listFor(seed.projectIds[1], {})).toEqual([b101, b100, b99]);
    }),
    storeCase('planEvents', 'planEvents.listFor:batches-limit', open, async (fixture) => {
      const { port, seed, journalAppender } = fixture;
      for (const record of batchRecords(seed))
        await journalAppender.append(structuredClone(record.entry), structuredClone(record.event));
      const ids = async (filter: Parameters<PlanEventStore['listFor']>[1]) =>
        (await port.listFor(seed.projectIds[0], filter)).map(({ id }) => id);
      const claims = {
        kinds: ['claim', 'release'],
        batchesHolding: ['add_claims', 'remove_claims'],
      } as const;
      expect({
        kindsAlone: await ids({ kinds: ['claim', 'release'] }),
        withBatches: await ids(claims),
        limited: await ids({ ...claims, limit: 3 }),
        one: await ids({ limit: 1 }),
        tooMany: await ids({ ...claims, limit: 9 }),
        // `kinds` empty keeps every kind; the batch clause only widens a list.
        unfiltered: await ids({ batchesHolding: ['add_claims'] }),
      }).toEqual({
        kindsAlone: ['e-release', 'e-claim'],
        withBatches: ['e-released', 'e-release', 'e-nested', 'e-claim'],
        limited: ['e-released', 'e-release', 'e-nested'],
        one: ['e-released'],
        tooMany: ['e-released', 'e-release', 'e-nested', 'e-claim'],
        unfiltered: ['e-released', 'e-release', 'e-text', 'e-other', 'e-nested', 'e-claim'],
      });
      for (const limit of [0, -1, 1.5])
        expect({
          limit,
          refused: await ids({ limit }).then(
            () => false,
            () => true,
          ),
        }).toEqual({
          limit,
          refused: true,
        });
    }),
    storeCase('planEvents', 'planEvents.pruneOlderThan:strict-cutoff', open, async (fixture) => {
      const { port, seed } = fixture;
      await appendRecords(fixture);
      const [a101, a100z, a100m, a100a, a99, b101, b100, b99] = expectedEvents(seed);
      const journals = expectedJournals(seed);
      expect({
        projectAEvents: await port.listFor(seed.projectIds[0], {}),
        projectBEvents: await port.listFor(seed.projectIds[1], {}),
        journals: await readJournals(fixture),
      }).toEqual({
        projectAEvents: [a101, a100z, a100m, a100a, a99],
        projectBEvents: [b101, b100, b99],
        journals,
      });

      const deletedCount = await port.pruneOlderThan(100);
      expect({
        deletedCount,
        projectAEvents: await port.listFor(seed.projectIds[0], {}),
        projectBEvents: await port.listFor(seed.projectIds[1], {}),
        journals: await readJournals(fixture),
      }).toEqual({
        deletedCount: 2,
        projectAEvents: [a101, a100z, a100m, a100a],
        projectBEvents: [b101, b100],
        journals,
      });
    }),
  ];
}
