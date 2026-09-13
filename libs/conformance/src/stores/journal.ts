import { JOURNAL_DEPTH, type JournalEntry, type NewJournalEntry, type PlanEvent } from '@wbs/core';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import type { SeededPlan } from '../source-declaration';
import { type OpenCase, storeCase } from './store-case';

function entry(id: string, projectId: string, userId: string, createdAt: number): NewJournalEntry {
  return {
    id,
    projectId,
    userId,
    kind: 'rename',
    payload: { label: `Rename ${id}`, forward: { type: 'rename', name: `After ${id}` } },
    inverse: { type: 'rename', name: `Before ${id}` },
    preconditions: { expected: { [id]: createdAt }, from: { [id]: createdAt - 1 } },
    createdAt,
  };
}

function event(id: string, projectId: string, userId: string, createdAt: number): PlanEvent {
  return {
    id: `event-${id}`,
    projectId,
    userId,
    kind: 'rename',
    label: `Rename ${id}`,
    workItemId: `${id}-work`,
    stepId: null,
    before: { type: 'rename', name: `Before ${id}` },
    after: { type: 'rename', name: `After ${id}` },
    createdAt,
  };
}

function stored(
  incoming: NewJournalEntry,
  seq: number,
  undone = false,
  preconditions: unknown = incoming.preconditions,
): JournalEntry {
  return { ...structuredClone(incoming), seq, undone, preconditions };
}

async function seedAtomicSentinels(
  port: { append(entry: NewJournalEntry, event: PlanEvent): Promise<void> },
  seed: SeededPlan,
) {
  const rows = [
    entry('atomic-sentinel-a', seed.projectIds[0], seed.ownerIds[0], 101),
    entry('atomic-sentinel-b', seed.projectIds[0], seed.ownerIds[1], 102),
    entry('atomic-other-project', seed.projectIds[1], seed.ownerIds[1], 103),
  ];
  for (const row of rows)
    await port.append(
      structuredClone(row),
      event(row.id, row.projectId, row.userId, row.createdAt),
    );
  return rows;
}

/** Shared append atomicity, account isolation, depth and history-retention cases. */
export function journalRegistrations(open: OpenCase<'journal'>): readonly CaseRegistration[] {
  return [
    storeCase(
      'journal',
      'journal.append:history-atomic',
      open,
      async ({ port, readers, seed, scenario }) => {
        const sentinels = await seedAtomicSentinels(port, seed);
        const beforeEntries = await Promise.all([
          readers.journal.entriesFor(seed.projectIds[0], seed.ownerIds[0]),
          readers.journal.entriesFor(seed.projectIds[0], seed.ownerIds[1]),
          readers.journal.entriesFor(seed.projectIds[1], seed.ownerIds[1]),
        ]);
        const beforeHistory = await Promise.all(
          seed.projectIds.map((projectId) => readers.planEvents.listFor(projectId, {})),
        );
        expect(beforeEntries).toEqual([
          [stored(sentinels[0], 1)],
          [stored(sentinels[1], 1)],
          [stored(sentinels[2], 1)],
        ]);
        expect(beforeHistory).toEqual([
          [
            event('atomic-sentinel-b', seed.projectIds[0], seed.ownerIds[1], 102),
            event('atomic-sentinel-a', seed.projectIds[0], seed.ownerIds[0], 101),
          ],
          [event('atomic-other-project', seed.projectIds[1], seed.ownerIds[1], 103)],
        ]);

        const target = entry('atomic-target', seed.projectIds[0], seed.ownerIds[0], 201);
        const history = event(target.id, target.projectId, target.userId, target.createdAt);
        await port.append(structuredClone(target), structuredClone(history));
        const settledEntries: [JournalEntry[], JournalEntry[], JournalEntry[]] = [
          [stored(sentinels[0], 1), stored(target, 2)],
          beforeEntries[1],
          beforeEntries[2],
        ];
        const settledHistory = [
          [
            history,
            event('atomic-sentinel-b', seed.projectIds[0], seed.ownerIds[1], 102),
            event('atomic-sentinel-a', seed.projectIds[0], seed.ownerIds[0], 101),
          ],
          beforeHistory[1],
        ];
        expect(
          await Promise.all([
            readers.journal.entriesFor(seed.projectIds[0], seed.ownerIds[0]),
            readers.journal.entriesFor(seed.projectIds[0], seed.ownerIds[1]),
            readers.journal.entriesFor(seed.projectIds[1], seed.ownerIds[1]),
          ]),
        ).toEqual(settledEntries);
        expect(
          await Promise.all(
            seed.projectIds.map((projectId) => readers.planEvents.listFor(projectId, {})),
          ),
        ).toEqual(settledHistory);

        // Proof: removing the journal late control from either real source opener
        // failed its dedicated Task 5.1 run here with this exact scenario error.
        if (scenario.kind !== 'late-write' || scenario.point !== 'journal-history-insert')
          throw new Error('journal.append:history-atomic requires journal-history-insert scenario');
        const lateTarget = entry('atomic-late-target', seed.projectIds[0], seed.ownerIds[0], 202);
        const lateHistory = event(
          lateTarget.id,
          lateTarget.projectId,
          lateTarget.userId,
          lateTarget.createdAt,
        );
        scenario.arm();
        const rejected = port.append(structuredClone(lateTarget), structuredClone(lateHistory));
        expect(rejected).rejects.toThrow('journal-history-insert');
        await rejected.catch(() => undefined);
        expect(scenario.reached()).toBe(true);
        expect(
          await Promise.all([
            readers.journal.entriesFor(seed.projectIds[0], seed.ownerIds[0]),
            readers.journal.entriesFor(seed.projectIds[0], seed.ownerIds[1]),
            readers.journal.entriesFor(seed.projectIds[1], seed.ownerIds[1]),
          ]),
        ).toEqual(settledEntries);
        expect(
          await Promise.all(
            seed.projectIds.map((projectId) => readers.planEvents.listFor(projectId, {})),
          ),
        ).toEqual(settledHistory);
      },
    ),
    storeCase(
      'journal',
      'journal.append:account-redo-depth',
      open,
      async ({ port, readers, seed }) => {
        const undoneA = entry('redo-a', seed.projectIds[0], seed.ownerIds[0], 101);
        const undoneB = entry('redo-b', seed.projectIds[0], seed.ownerIds[1], 102);
        const other = entry('redo-other-project', seed.projectIds[1], seed.ownerIds[1], 103);
        for (const row of [undoneA, undoneB, other]) {
          await port.append(
            structuredClone(row),
            event(row.id, row.projectId, row.userId, row.createdAt),
          );
          await port.flip(row.id, true, { expected: { [row.id]: 900 }, from: { [row.id]: 899 } });
        }
        const flippedA = stored(undoneA, 1, true, {
          expected: { 'redo-a': 900 },
          from: { 'redo-a': 899 },
        });
        const flippedB = stored(undoneB, 1, true, {
          expected: { 'redo-b': 900 },
          from: { 'redo-b': 899 },
        });
        const flippedOther = stored(other, 1, true, {
          expected: { 'redo-other-project': 900 },
          from: { 'redo-other-project': 899 },
        });
        expect(
          await Promise.all([
            readers.journal.entriesFor(seed.projectIds[0], seed.ownerIds[0]),
            readers.journal.entriesFor(seed.projectIds[0], seed.ownerIds[1]),
            readers.journal.entriesFor(seed.projectIds[1], seed.ownerIds[1]),
          ]),
        ).toEqual([[flippedA], [flippedB], [flippedOther]]);
        expect(
          await Promise.all([
            readers.journal.stateOf(seed.projectIds[0], seed.ownerIds[0]),
            readers.journal.stateOf(seed.projectIds[0], seed.ownerIds[1]),
            readers.journal.stateOf(seed.projectIds[1], seed.ownerIds[1]),
          ]),
        ).toEqual([
          { undoable: false, redoable: true },
          { undoable: false, redoable: true },
          { undoable: false, redoable: true },
        ]);
        expect(
          await Promise.all(
            seed.projectIds.map((projectId) => readers.planEvents.listFor(projectId, {})),
          ),
        ).toEqual([
          [
            event(undoneB.id, undoneB.projectId, undoneB.userId, undoneB.createdAt),
            event(undoneA.id, undoneA.projectId, undoneA.userId, undoneA.createdAt),
          ],
          [event(other.id, other.projectId, other.userId, other.createdAt)],
        ]);
        const replacement = entry('redo-a-replacement', seed.projectIds[0], seed.ownerIds[0], 200);
        await port.append(
          structuredClone(replacement),
          event(replacement.id, replacement.projectId, replacement.userId, replacement.createdAt),
        );
        expect(
          await Promise.all([
            readers.journal.entriesFor(seed.projectIds[0], seed.ownerIds[0]),
            readers.journal.entriesFor(seed.projectIds[0], seed.ownerIds[1]),
            readers.journal.entriesFor(seed.projectIds[1], seed.ownerIds[1]),
          ]),
        ).toEqual([[stored(replacement, 1)], [flippedB], [flippedOther]]);
        expect(
          await Promise.all([
            readers.journal.stateOf(seed.projectIds[0], seed.ownerIds[0]),
            readers.journal.stateOf(seed.projectIds[0], seed.ownerIds[1]),
            readers.journal.stateOf(seed.projectIds[1], seed.ownerIds[1]),
          ]),
        ).toEqual([
          { undoable: true, redoable: false },
          { undoable: false, redoable: true },
          { undoable: false, redoable: true },
        ]);
        expect(
          await Promise.all(
            seed.projectIds.map((projectId) => readers.planEvents.listFor(projectId, {})),
          ),
        ).toEqual([
          [
            event(replacement.id, replacement.projectId, replacement.userId, replacement.createdAt),
            event(undoneB.id, undoneB.projectId, undoneB.userId, undoneB.createdAt),
            event(undoneA.id, undoneA.projectId, undoneA.userId, undoneA.createdAt),
          ],
          [event(other.id, other.projectId, other.userId, other.createdAt)],
        ]);
        // Proof: changing only the production constant to 51 or 2 failed both
        // real-source Task 5.1 runs here (`Expected: 50`, `Received: 51`/`2`).
        expect(JOURNAL_DEPTH).toBe(50);
        const bulk = Array.from({ length: 51 }, (_, index) =>
          entry(
            `depth-${String(index).padStart(2, '0')}`,
            seed.projectIds[0],
            seed.ownerIds[0],
            300 + index,
          ),
        );
        for (const row of bulk)
          await port.append(
            structuredClone(row),
            event(row.id, row.projectId, row.userId, row.createdAt),
          );

        expect(await readers.journal.entriesFor(seed.projectIds[0], seed.ownerIds[0])).toEqual(
          Array.from({ length: 50 }, (_, index) =>
            stored(
              entry(
                `depth-${String(index + 1).padStart(2, '0')}`,
                seed.projectIds[0],
                seed.ownerIds[0],
                301 + index,
              ),
              index + 3,
            ),
          ),
        );
        expect(await readers.journal.entriesFor(seed.projectIds[0], seed.ownerIds[1])).toEqual([
          stored(undoneB, 1, true, { expected: { 'redo-b': 900 }, from: { 'redo-b': 899 } }),
        ]);
        expect(await readers.journal.stateOf(seed.projectIds[0], seed.ownerIds[0])).toEqual({
          undoable: true,
          redoable: false,
        });
        expect(await readers.journal.stateOf(seed.projectIds[0], seed.ownerIds[1])).toEqual({
          undoable: false,
          redoable: true,
        });
        expect(await readers.journal.entriesFor(seed.projectIds[1], seed.ownerIds[1])).toEqual([
          stored(other, 1, true, {
            expected: { 'redo-other-project': 900 },
            from: { 'redo-other-project': 899 },
          }),
        ]);
        expect(await readers.planEvents.listFor(seed.projectIds[0], {})).toEqual([
          ...Array.from({ length: 51 }, (_, index) => {
            const depth = 50 - index;
            return event(
              `depth-${String(depth).padStart(2, '0')}`,
              seed.projectIds[0],
              seed.ownerIds[0],
              300 + depth,
            );
          }),
          event(replacement.id, replacement.projectId, replacement.userId, replacement.createdAt),
          event(undoneB.id, undoneB.projectId, undoneB.userId, undoneB.createdAt),
          event(undoneA.id, undoneA.projectId, undoneA.userId, undoneA.createdAt),
        ]);
        expect(await readers.planEvents.listFor(seed.projectIds[1], {})).toEqual([
          event(other.id, other.projectId, other.userId, other.createdAt),
        ]);
      },
    ),
  ];
}
