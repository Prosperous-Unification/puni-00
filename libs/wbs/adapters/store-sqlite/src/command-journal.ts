import {
  type CommandJournalStore,
  JOURNAL_DEPTH,
  type JournalEntry,
  type NewJournalEntry,
  type PlanEvent,
  type UndoStack,
  type UndoState,
} from '@wbs/core';
import { and, asc, eq, lt, type SQL, sql } from 'drizzle-orm';

import type { Drizzle } from './db';
import type { Gate } from './gate';
import { inertSqliteLateWriteSeam, type SqliteLateWriteSeam } from './late-write-seam';
import { commandJournal, type CommandJournalRow, planEvent } from './schema';
import { requireStepBlockageActivation } from './step-blockage-activation';

/**
 * The rows of one {@link UndoStack}. `person_id IS ?` rather than `=`, so the
 * account's own stack (a null person) matches only null rows; `= NULL` would
 * match nothing and leave the human with no undo at all.
 *
 * Proof (watched 2026-10-26): with the person predicate dropped, the SQLite
 * certification's `journal.append:acting-person-stacks` failed (74 pass,
 * 1 fail); with `=` for `IS`, `command-journal.db.test.ts` failed 7 of 9.
 */
function stackOf(stack: UndoStack): SQL {
  const mine = and(
    eq(commandJournal.projectId, stack.projectId),
    eq(commandJournal.userId, stack.userId),
    sql`${commandJournal.personId} IS ${stack.personId}`,
  );
  if (mine === undefined) throw new Error('an undo stack has no predicate');
  return mine;
}

/**
 * The undo stacks, one per {@link UndoStack}, on the server — and the one
 * statement that writes the plan's history, because a command is journalled and
 * recorded in the same transaction. See {@link CommandJournalRepository.append}.
 *
 * `seq` is assigned by SQLite inside the `INSERT`, from the pair's current
 * maximum — `(select coalesce(max(seq), 0) + 1 …)`. It is the same rule the
 * revision counters follow and it is here for the same reason: two be-01
 * processes share one file during a blue/green swap, and a maximum read into
 * this process and written back would let both pick the same number. The
 * unique index on `(project_id, user_id, seq)` would then refuse the second
 * insert — failing an edit that had already been applied to the plan.
 *
 * A subquery over the table being inserted into is evaluated against the table
 * as it stands when the statement runs, which is what makes one statement
 * enough. SQLite serialises writers, so there is no moment at which two
 * inserts are both choosing a number.
 *
 * The number is the **pair's**, shared by every stack of the account, so the
 * unique index stays `(project_id, user_id, seq)` and the outgoing colour,
 * which numbers by the pair, can never collide with this one mid-swap. One
 * stack's numbers therefore have gaps, and the prune counts rows, not numbers.
 *
 * **Mid-swap.** The outgoing colour knows nothing of `person_id` and writes it
 * NULL, so an agent edit it journals lands on its human's own stack, as every
 * edit did before the column. It also reads, clears and prunes by the pair, so
 * until it stops, its undo can reach an agent entry this colour wrote.
 */
export class CommandJournalRepository implements CommandJournalStore {
  constructor(
    private readonly db: Drizzle,
    private readonly gate: Gate,
    private readonly lateWrite: SqliteLateWriteSeam = inertSqliteLateWriteSeam,
  ) {}

  /**
   * Appends, clears this stack's redo branch, prunes the stack and writes the
   * history row — in one transaction, because all four describe the same act.
   *
   * The order matters. The redo branch goes **first**: those entries hold the
   * highest `seq` values for the stack, and leaving them would make the new
   * entry look older than commands that are no longer reachable. Pruning goes
   * last, against the maximum the insert has just written.
   *
   * **Why the `plan_event` insert is here and not in `PlanEventRepository`.** The
   * two rows record one act, and a history row written by a second call is a
   * history row that can fail on its own — leaving a plan with an undo entry for
   * a change its history does not contain. The store interfaces are async, so a
   * transaction cannot be handed across one; the alternative is this statement,
   * in the transaction that already exists, in the class that owns it. Reads and
   * retention live in `PlanEventRepository`, which has no `append` at all so that
   * a second write path cannot be added by accident.
   *
   * The prune deliberately does **not** reach `plan_event`: the journal is fifty
   * deep per stack and the history is kept by age. Pruning the history here
   * would make it a second undo stack.
   *
   * Proof: with the `planEvent` insert moved out of the transaction and run after
   * it, `writes neither when the history row is refused` in
   * `command-journal.test.ts` fails on a `toEqual` diff — the stack holding a
   * command the history never received, which is the shape of the failure this
   * refuses to be able to have. 4 pass, 1 fail; watched 2026-08-17.
   */
  async append(entry: NewJournalEntry, event: PlanEvent): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      const mine = stackOf(entry);
      this.db.transaction((tx) => {
        tx.delete(commandJournal)
          .where(and(mine, eq(commandJournal.undone, true)))
          .run();
        tx.insert(commandJournal)
          .values({
            id: entry.id,
            projectId: entry.projectId,
            userId: entry.userId,
            personId: entry.personId,
            // Never a number this process read and wrote back. See the class note.
            seq: sql`(select coalesce(max(${commandJournal.seq}), 0) + 1 from ${commandJournal} where ${commandJournal.projectId} = ${entry.projectId} and ${commandJournal.userId} = ${entry.userId})`,
            kind: entry.kind,
            payload: JSON.stringify(entry.payload),
            inverse: JSON.stringify(entry.inverse),
            preconditions: JSON.stringify(entry.preconditions),
            undone: false,
            createdAt: entry.createdAt,
          })
          .run();
        // Everything older than this stack's JOURNAL_DEPTH-th newest entry.
        // Ranked in SQL rather than against a count read out first, so the
        // prune describes the table the insert just left behind; ranked rather
        // than `max(seq) - 49`, because the account's other stacks leave gaps.
        // Under fifty rows the subquery is NULL and `seq < NULL` deletes none.
        // Proof: with `max(seq) - 49` over the pair, the SQLite certification's
        // `journal.append:acting-person-stacks` lost the human's older entry
        // (74 pass, 1 fail) and `an agent's fifty-one edits never prune its
        // human's history` (undo-acting-person.controller.db.test.ts) failed
        // (4 pass, 1 fail); watched 2026-10-26.
        tx.delete(commandJournal)
          .where(
            and(
              mine,
              lt(
                commandJournal.seq,
                sql`(select ${commandJournal.seq} from ${commandJournal} where ${mine} order by ${commandJournal.seq} desc limit 1 offset ${JOURNAL_DEPTH - 1})`,
              ),
            ),
          )
          .run();
        // The history, in the same transaction and after the prune, so that a
        // journal write which fails for any reason takes this with it. Never
        // pruned here: the plan's history is kept by age, by the retention timer.
        tx.insert(planEvent).values(planEventRow(event)).run();
        this.lateWrite.reach('journal-history-insert');
      });
    });
  }

  async appendEvent(event: PlanEvent): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      // Proof: with a stack row inserted beside it, the SQLite certification's
      // `journal.appendEvent:history-only` case found it on the stack (74 pass,
      // 1 fail); watched 2026-10-23.
      this.db.insert(planEvent).values(planEventRow(event)).run();
    });
  }

  async entriesFor(stack: UndoStack): Promise<JournalEntry[]> {
    const rows = await this.db
      .select()
      .from(commandJournal)
      .where(stackOf(stack))
      .orderBy(asc(commandJournal.seq));
    return rows.map(asEntry);
  }

  async flip(stack: UndoStack, id: string, undone: boolean, preconditions: unknown): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      // Proof: forward/inverse/precondition inventory branches omitted separately; their empty nested replay negatives advanced the cursor (2026-10-14).
      const admission = this.db.get<{ required: number }>(sql`SELECT EXISTS (
        SELECT 1 FROM command_journal journal, json_tree(journal.payload) node
        WHERE journal.id = ${id} AND ((node.key = 'do' AND node.value = 'replace_blockage') OR node.key IN ('deletionState','expectedProgress'))
        UNION ALL
        SELECT 1 FROM command_journal journal, json_tree(journal.inverse) node
        WHERE journal.id = ${id} AND ((node.key = 'do' AND node.value = 'replace_blockage') OR node.key IN ('deletionState','expectedProgress'))
        UNION ALL
        SELECT 1 FROM command_journal journal, json_tree(journal.preconditions) node
        WHERE journal.id = ${id} AND node.key = 'moveProgress'
      ) AS required`);
      // Proof: flip admission omitted; mounted empty structural undo returned 200 and changed its cursor (2026-10-14).
      if (admission.required === 1) requireStepBlockageActivation(this.db);
      const flipped = this.db
        .update(commandJournal)
        .set({ undone, preconditions: JSON.stringify(preconditions) })
        .where(and(eq(commandJournal.id, id), stackOf(stack)))
        .run();
      // Proof: with the stack dropped from the WHERE, and again with this
      // check removed, the SQLite certification's
      // `journal.append:acting-person-stacks` saw a flip of another stack's
      // entry resolve (74 pass, 1 fail each); watched 2026-10-26.
      if (flipped.changes !== 1) throw new Error(`no journal entry ${id} on that undo stack`);
    });
  }

  async restamp(id: string, preconditions: unknown): Promise<void> {
    await this.gate.enter(async () => {
      await this.db
        .update(commandJournal)
        .set({ preconditions: JSON.stringify(preconditions) })
        .where(eq(commandJournal.id, id));
    });
  }

  async discard(id: string): Promise<void> {
    await this.gate.enter(async () => {
      await this.db.delete(commandJournal).where(eq(commandJournal.id, id));
    });
  }

  /**
   * Two existence questions, asked as two `LIMIT 1` reads.
   *
   * It is answered on every tree read, so it counts nothing: a plan somebody
   * has been editing all afternoon holds fifty entries, and counting them to
   * discover whether there is at least one is work with no reader.
   */
  async stateOf(stack: UndoStack): Promise<UndoState> {
    const half = async (undone: boolean): Promise<boolean> => {
      const rows = await this.db
        .select({ id: commandJournal.id })
        .from(commandJournal)
        .where(and(stackOf(stack), eq(commandJournal.undone, undone)))
        .limit(1);
      return rows.length > 0;
    };
    return { undoable: await half(false), redoable: await half(true) };
  }
}

/**
 * A stored row as the service reads it: the three JSON columns parsed.
 *
 * `JSON.parse` throws on text that is not JSON, which is the right answer for
 * a column this process wrote — malformed trusted data is R5's "unknown is not
 * OK", not a condition to model. What comes back is `unknown` rather than a
 * shape, because a cast here would be a claim about rows written by a release
 * that may no longer exist.
 */
function asEntry(row: CommandJournalRow): JournalEntry {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    personId: row.personId,
    seq: row.seq,
    kind: row.kind,
    payload: JSON.parse(row.payload),
    inverse: JSON.parse(row.inverse),
    preconditions: JSON.parse(row.preconditions),
    undone: row.undone,
    createdAt: row.createdAt,
  };
}

/** The `plan_event` row one event is stored as. */
function planEventRow(event: PlanEvent) {
  return {
    id: event.id,
    projectId: event.projectId,
    userId: event.userId,
    kind: event.kind,
    label: event.label,
    workItemId: event.workItemId,
    stepId: event.stepId,
    before: JSON.stringify(event.before),
    after: JSON.stringify(event.after),
    createdAt: event.createdAt,
  };
}
