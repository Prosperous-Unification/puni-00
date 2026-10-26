import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  JOURNAL_DEPTH,
  type NewJournalEntry,
  type PlanEvent,
  type Project,
  type UndoStack,
  type WriteStamp,
} from '@wbs/core';
import { projectRow } from '@wbs/store-memory/project-fixture';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { CommandJournalRepository } from './command-journal';
import { openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { PlanEventRepository } from './plan-event';
import { ProjectRepository } from './project';
import { UserRepository } from './user';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;

/** The account's own stack on `p1`, with no agent person acting. */
const OWNER_STACK: UndoStack = { projectId: 'p1', userId: 'owner', personId: null };
/** The stack of `codex`, an agent person acting as the `owner` account. */
const CODEX_STACK: UndoStack = { projectId: 'p1', userId: 'owner', personId: 'codex' };

/** The stamp the setup's writes carry; `owner` is the account it creates first. */
const wrote: WriteStamp = { at: 1, by: 'owner' };

/**
 * The one act that writes two tables: the account's undo stack and the plan's
 * history.
 *
 * Every claim here is about the pair, and none of them can be made against
 * `inMemoryCommandJournal` — an array has no transaction and no depth rule the
 * history is exempt from. The stack's own behaviour under two writers stays in
 * `service/undo.test.ts`, which is where it was already asserted.
 */
describe('appending a command', () => {
  let dir: string;
  let sqlite: Database;
  let journal: CommandJournalRepository;
  let events: PlanEventRepository;

  const project = (id: string): Project =>
    projectRow({
      id,
      ownerId: 'owner',
    });

  const entry = (id: string, at: number): NewJournalEntry => ({
    id,
    projectId: 'p1',
    userId: 'owner',
    personId: null,
    kind: 'estimate',
    payload: { label: `estimate ${id}`, forward: { do: 'set_estimate' } },
    inverse: { do: 'clear_estimate' },
    preconditions: { expected: {}, from: {} },
    createdAt: at,
  });

  const event = (id: string, at: number, over: Partial<PlanEvent> = {}): PlanEvent => ({
    id: `e-${id}`,
    projectId: 'p1',
    userId: 'owner',
    kind: 'estimate',
    label: `estimate ${id}`,
    workItemId: 'w1',
    stepId: 'r1',
    before: { do: 'clear_estimate', workItemId: 'w1', stepId: 'r1' },
    after: { do: 'set_estimate', workItemId: 'w1', stepId: 'r1', days: { o: 1, r: 2, p: 3 } },
    createdAt: at,
    ...over,
  });

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-journal-'));
    const path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    const db = openDrizzle(path);
    sqlite = openDatabase(path);
    journal = new CommandJournalRepository(db, OPEN);
    events = new PlanEventRepository(db, OPEN);
    await new UserRepository(db, OPEN).create(
      { id: 'owner', username: 'owner', passwordHash: 'x', createdAt: 1 },
      wrote,
    );
    await new ProjectRepository(db, OPEN).create(project('p1'), [], wrote);
  });

  afterEach(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes the undo entry and the history row in one transaction', async () => {
    await journal.append(entry('j1', 1_000), event('j1', 1_000));

    expect(
      (await journal.entriesFor({ projectId: 'p1', userId: 'owner', personId: null })).map(
        (each) => each.id,
      ),
    ).toEqual(['j1']);
    expect((await events.listFor('p1', {})).map((each) => each.id)).toEqual(['e-j1']);
  });

  it('writes neither when the history row is refused', async () => {
    // The whole reason the history is a second argument rather than a second
    // call. A `plan_event` this database refuses — an unknown project, which is a
    // project deleted between the mutation and the record — must take the journal
    // entry with it, because a plan holding an undo key for a change absent from
    // its history is a history that is quietly short.
    //
    // Proof: with the `planEvent` insert moved out of `append`'s transaction and
    // run after it, this fails on a `toEqual` diff of the stack against `[]` — one
    // journal entry standing for a command the history never received. 4 pass, 1
    // fail; watched 2026-08-17.
    sqlite.run('PRAGMA foreign_keys = ON');
    const refused = journal.append(
      entry('j1', 1_000),
      event('j1', 1_000, { projectId: 'gone-since' }),
    );

    expect(refused).rejects.toThrow();
    await refused.catch(() => undefined);

    expect(await journal.entriesFor({ projectId: 'p1', userId: 'owner', personId: null })).toEqual(
      [],
    );
    expect(await events.listFor('p1', {})).toEqual([]);
  });

  it('keeps the history of a command the stack has evicted', async () => {
    // The property that makes this a history and the journal an undo stack. The
    // stack is fifty deep per account; the history is pruned by age and by nothing
    // else, so the fifty-first command evicts an entry and leaves its event.
    //
    // Proof: a `DELETE FROM plan_event` by age added to the same transaction —
    // the prune widened to the history — and this fails on
    // `Expected length: 60 / Received length: 50`, ten changes gone from a table
    // whose entire purpose is to still hold them. It takes the two cases below it
    // with it. 2 pass, 3 fail; watched 2026-08-17.
    for (let n = 0; n < JOURNAL_DEPTH + 10; n++) {
      await journal.append(entry(`j${String(n)}`, 1_000 + n), event(`j${String(n)}`, 1_000 + n));
    }

    expect(
      await journal.entriesFor({ projectId: 'p1', userId: 'owner', personId: null }),
    ).toHaveLength(JOURNAL_DEPTH);
    expect(await events.listFor('p1', {})).toHaveLength(JOURNAL_DEPTH + 10);
    // Including the very first, which left the stack ten commands ago.
    expect((await events.listFor('p1', {})).at(-1)?.id).toBe('e-j0');
  });

  it('keeps the history of a command whose redo branch has been deleted', async () => {
    // The second of the journal's five disqualifying properties: an append deletes
    // this account's redo branch, so a change that was undone and then written
    // over vanishes from the stack. It does not vanish from the history.
    await journal.append(entry('undone-later', 1_000), event('undone-later', 1_000));
    await journal.flip(OWNER_STACK, 'undone-later', true, { expected: {}, from: {} });
    await journal.append(entry('the-new-one', 2_000), event('the-new-one', 2_000));

    expect(
      (await journal.entriesFor({ projectId: 'p1', userId: 'owner', personId: null })).map(
        (each) => each.id,
      ),
    ).toEqual(['the-new-one']);
    expect((await events.listFor('p1', {})).map((each) => each.id)).toEqual([
      'e-the-new-one',
      'e-undone-later',
    ]);
  });

  it('records one project’s history whoever ran the command', async () => {
    // Per project, not per (project, account): two people editing one plan produce
    // two disjoint stacks and **one** history, which is the difference R5 asks for.
    await new UserRepository(openDrizzle(join(dir, 'test.db')), OPEN).create(
      { id: 'someone-else', username: 'someone-else', passwordHash: 'x', createdAt: 1 },
      { at: 1, by: 'someone-else' },
    );
    await journal.append(entry('mine', 1_000), event('mine', 1_000));
    await journal.append(
      { ...entry('theirs', 2_000), userId: 'someone-else' },
      event('theirs', 2_000, { userId: 'someone-else' }),
    );

    expect(
      (await journal.entriesFor({ projectId: 'p1', userId: 'owner', personId: null })).map(
        (each) => each.id,
      ),
    ).toEqual(['mine']);
    expect(
      (await journal.entriesFor({ projectId: 'p1', userId: 'someone-else', personId: null })).map(
        (each) => each.id,
      ),
    ).toEqual(['theirs']);
    expect((await events.listFor('p1', {})).map((each) => each.id)).toEqual(['e-theirs', 'e-mine']);
  });

  describe('per acting person', () => {
    beforeEach(() => {
      sqlite.run("INSERT INTO person (id, name, kind) VALUES ('codex', 'Codex', 'agent')");
    });

    // The outgoing colour mid-swap: its `INSERT` names no `person_id`, so the
    // column is NULL and the entry is the account's own, as every entry was
    // before the column. Its undo, which reads by the pair alone, still sees
    // the agent's rows until it stops.
    it('puts an entry the outgoing colour wrote on the account’s own stack', async () => {
      await journal.append({ ...entry('agent', 1_000), personId: 'codex' }, event('agent', 1_000));
      sqlite.run(
        `INSERT INTO command_journal (id, project_id, user_id, seq, kind, payload, inverse, preconditions, undone, created_at)
         VALUES ('outgoing', 'p1', 'owner', (SELECT coalesce(max(seq), 0) + 1 FROM command_journal WHERE project_id = 'p1' AND user_id = 'owner'), 'estimate', '{}', '{}', '{}', 0, 2000)`,
      );

      expect((await journal.entriesFor(OWNER_STACK)).map((each) => [each.id, each.seq])).toEqual([
        ['outgoing', 2],
      ]);
      expect((await journal.entriesFor(CODEX_STACK)).map((each) => [each.id, each.seq])).toEqual([
        ['agent', 1],
      ]);
      const outgoingUndo = sqlite
        .query<{ id: string }, []>(
          "SELECT id FROM command_journal WHERE project_id = 'p1' AND user_id = 'owner' AND undone = 0 ORDER BY seq",
        )
        .all();
      expect(outgoingUndo.map(({ id }) => id)).toEqual(['agent', 'outgoing']);
    });

    // The outgoing colour's own append, verbatim in shape: it clears the redo
    // branch and prunes by (project, account) alone, so until it stops it can
    // clear an agent's redo and, counting the agent's rows, prune the human's
    // older entries. Pinned here so the window is a stated fact, not a surprise.
    it('lets the outgoing colour clear and prune by the pair until it stops', async () => {
      await journal.append(entry('human-old', 1_000), event('human-old', 1_000));
      for (let n = 0; n < JOURNAL_DEPTH; n++)
        await journal.append(
          { ...entry(`agent-${String(n)}`, 2_000 + n), personId: 'codex' },
          event(`agent-${String(n)}`, 2_000 + n),
        );
      await journal.flip(CODEX_STACK, 'agent-49', true, { expected: {}, from: {} });
      const pair = "project_id = 'p1' AND user_id = 'owner'";
      sqlite.run(`DELETE FROM command_journal WHERE ${pair} AND undone = 1`);
      sqlite.run(
        `INSERT INTO command_journal (id, project_id, user_id, seq, kind, payload, inverse, preconditions, undone, created_at)
         VALUES ('outgoing', 'p1', 'owner', (SELECT coalesce(max(seq), 0) + 1 FROM command_journal WHERE ${pair}), 'estimate', '{}', '{}', '{}', 0, 3000)`,
      );
      sqlite.run(
        `DELETE FROM command_journal WHERE ${pair} AND seq < (SELECT max(seq) FROM command_journal WHERE ${pair}) - ${String(JOURNAL_DEPTH - 1)}`,
      );

      expect((await journal.entriesFor(OWNER_STACK)).map((each) => each.id)).toEqual(['outgoing']);
      const agent = (await journal.entriesFor(CODEX_STACK)).map((each) => each.id);
      expect(agent).toHaveLength(JOURNAL_DEPTH - 1);
      expect(agent).not.toContain('agent-49');
      expect(agent.at(0)).toBe('agent-0');
    });

    it('numbers a new stack after the account’s other stacks, never colliding', async () => {
      await journal.append(entry('mine', 1_000), event('mine', 1_000));
      await journal.append({ ...entry('agent', 2_000), personId: 'codex' }, event('agent', 2_000));
      await journal.append(entry('mine-again', 3_000), event('mine-again', 3_000));

      expect((await journal.entriesFor(OWNER_STACK)).map((each) => each.seq)).toEqual([1, 3]);
      expect((await journal.entriesFor(CODEX_STACK)).map((each) => each.seq)).toEqual([2]);
    });

    it('takes a deleted agent’s stack with it, and leaves its human’s', async () => {
      await journal.append(entry('mine', 1_000), event('mine', 1_000));
      await journal.append({ ...entry('agent', 2_000), personId: 'codex' }, event('agent', 2_000));
      sqlite.run("DELETE FROM person WHERE id = 'codex'");

      expect((await journal.entriesFor(CODEX_STACK)).map((each) => each.id)).toEqual([]);
      expect((await journal.entriesFor(OWNER_STACK)).map((each) => each.id)).toEqual(['mine']);
    });

    it('refuses an entry for a person that does not exist', async () => {
      const refused = journal.append(
        { ...entry('ghost', 1_000), personId: 'nobody' },
        event('ghost', 1_000),
      );
      const failure: unknown = await refused.then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      expect(String((failure as Error).cause)).toContain('FOREIGN KEY');
      expect(await journal.entriesFor(OWNER_STACK)).toEqual([]);
    });
  });
});
