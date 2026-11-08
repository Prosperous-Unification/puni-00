import {
  type CommandJournalStore,
  JOURNAL_DEPTH,
  type JournalEntry,
  type NewJournalEntry,
  type PlanEvent,
  type UndoStack,
} from '@wbs/core';

/**
 * The undo stack in an array, for tests whose subject is not SQLite.
 *
 * It keeps every rule the real store's callers depend on — a per-pair `seq`,
 * one stack per {@link UndoStack} with a null person matching only null, the
 * redo branch cleared by a forward command, the depth prune by rank, and the
 * ordering each half of the stack is read in — because a fixture laxer than
 * production lets a test pass against behaviour that does not exist.
 *
 * **What it does not model is the one claim the SQL makes**: that `seq` is
 * chosen by the database inside the insert rather than read out and written
 * back. An array has no statement to put it in, so this reads the maximum and
 * adds one — the exact implementation the real store refuses to have. That is
 * the same call `subtree-fixture.ts` makes about atomicity, for the same
 * reason, and it is why the journal's behaviour under two writers is asserted
 * against real SQLite in `service/undo.test.ts` and nowhere else.
 *
 * The JSON columns are held as the values they were given rather than as text.
 * Callers that care about the round trip run against the real store.
 *
 * `events` is the plan's history as this fixture received it — every append's
 * second argument, in the order they arrived, **never pruned**. The real store
 * writes both rows in one transaction and prunes only the stack, and holding the
 * events in a list that the depth rule cannot reach is how a test can see that
 * an evicted undo entry still has its history row. That the two are written
 * atomically is the one claim this fixture cannot make, so it is asserted against
 * real SQLite in `repository/command-journal.test.ts` and nowhere else.
 */
export interface MemoryCommandJournalTables {
  readonly entries: JournalEntry[];
  readonly events: PlanEvent[];
}
export function memoryCommandJournalTables(): MemoryCommandJournalTables {
  return { entries: [], events: [] };
}

export function inMemoryCommandJournal(
  tables: MemoryCommandJournalTables = memoryCommandJournalTables(),
  afterHistoryInsert: (eventIds: readonly string[]) => void = () => undefined,
): CommandJournalStore & {
  readonly entries: JournalEntry[];
  readonly events: PlanEvent[];
} {
  const { entries, events } = tables;
  const mine = (stack: UndoStack): JournalEntry[] =>
    entries.filter(
      (each) =>
        each.projectId === stack.projectId &&
        each.userId === stack.userId &&
        each.personId === stack.personId,
    );

  return {
    entries,
    events,
    append(entry: NewJournalEntry, event: PlanEvent) {
      for (const undone of mine(entry).filter((each) => each.undone)) {
        entries.splice(entries.indexOf(undone), 1);
      }
      // The pair's number, shared by the account's stacks, as the real store's.
      const pair = entries.filter(
        (each) => each.projectId === entry.projectId && each.userId === entry.userId,
      );
      const seq = pair.reduce((highest, each) => Math.max(highest, each.seq), 0) + 1;
      entries.push({ ...entry, seq, undone: false });
      // By rank within the stack: the account's other stacks leave gaps in `seq`.
      // Proof: pruning by `seq - 49`, the memory certification's
      // `journal.append:acting-person-stacks` failed (74 pass, 1 fail), as it
      // did with the person dropped from `mine` and with `flip` searching every
      // entry; watched 2026-10-26.
      const newestFirst = mine(entry).sort((a, b) => b.seq - a.seq);
      for (const old of newestFirst.slice(JOURNAL_DEPTH)) {
        entries.splice(entries.indexOf(old), 1);
      }
      events.push(event);
      afterHistoryInsert(events.filter(({ id }) => id === event.id).map(({ id }) => id));
      return Promise.resolve();
    },
    appendEvent(event: PlanEvent) {
      // Proof: with an entry pushed beside the event, the memory certification's
      // `journal.appendEvent:history-only` case found it on the stack (74 pass,
      // 1 fail); watched 2026-10-23.
      events.push(event);
      afterHistoryInsert([event.id]);
      return Promise.resolve();
    },
    entriesFor(stack) {
      return Promise.resolve(mine(stack).sort((a, b) => a.seq - b.seq));
    },
    flip(stack, id, undone, preconditions) {
      const found = mine(stack).find((each) => each.id === id);
      if (found === undefined) throw new Error(`no journal entry ${id} on that undo stack`);
      found.undone = undone;
      found.preconditions = preconditions;
      return Promise.resolve();
    },
    restamp(id, preconditions) {
      const found = entries.find((each) => each.id === id);
      if (found === undefined) throw new Error(`no journal entry ${id}`);
      found.preconditions = preconditions;
      return Promise.resolve();
    },
    discard(id) {
      const found = entries.find((each) => each.id === id);
      if (found === undefined) throw new Error(`no journal entry ${id}`);
      entries.splice(entries.indexOf(found), 1);
      return Promise.resolve();
    },
    stateOf(stack) {
      const group = mine(stack);
      return Promise.resolve({
        undoable: group.some((each) => !each.undone),
        redoable: group.some((each) => each.undone),
      });
    },
  };
}
