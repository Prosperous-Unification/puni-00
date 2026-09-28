import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ProjectPatch, WriteStamp } from '@wbs/core';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import { ProjectRepository } from './project';
import { UserRepository } from './user';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const AUDIT = '20260927220000_add_organization_audit';
const SOLUTION = '20260928010000_add_project_solution';
const wrote: WriteStamp = { at: 1, by: 'ada' };
/** Long enough that the racing edit starts while the holder still writes. */
const HELD_FOR_MS = 300;
const link = (slug: string) => ({ slug, url: `https://solutions.example/${slug}` });

/**
 * `20260928010000_add_project_solution` and the scoped solution link (task
 * 3.5 part 2): a slug is unique within its organization only, the link's
 * organization is its project's owner, and a project holds a legacy pair or a
 * scoped link, never both.
 */
describe('scoped solution links', () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-project-solution-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    raw((sqlite) => {
      sqlite.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)");
      sqlite.run("INSERT INTO organization (id, name, created_at) VALUES ('org-b', 'B', 1)");
    });
    const db = openDrizzle(path);
    await new UserRepository(db, OPEN).create(
      { id: 'ada', username: 'ada', passwordHash: 'x', createdAt: 1 },
      wrote,
    );
    raw((sqlite) =>
      sqlite.run(
        "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'ada', 'member', 1), ('org-b', 'ada', 'member', 1)",
      ),
    );
    const projects = new ProjectRepository(db, OPEN);
    for (const [id, organizationId] of [
      ['a1', 'org-a'],
      ['a2', 'org-a'],
      ['b1', 'org-b'],
    ] as const) {
      await projects.createInOrganization(
        projectRow({ id, name: id, ownerId: 'ada' }),
        [],
        wrote,
        organizationId,
      );
    }
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function raw<T>(use: (db: ReturnType<typeof openDatabase>) => T): T {
    const db = openDatabase(path);
    try {
      db.run('PRAGMA foreign_keys = ON');
      return use(db);
    } finally {
      db.close();
    }
  }

  const store = () => new ProjectRepository(openDrizzle(path), OPEN);
  const edit = (id: string, organizationId: string, patch: ProjectPatch) =>
    store().editInOrganization(id, patch, { at: 2, by: 'ada' }, organizationId, {
      actorId: 'ada',
      auditId: crypto.randomUUID(),
    });
  const insertLink = (projectId: string, organizationId: string, slug: string) =>
    raw((db) =>
      db.run(
        'INSERT INTO project_solution (project_id, organization_id, slug, url) VALUES (?, ?, ?, ?)',
        [projectId, organizationId, slug, `https://solutions.example/${slug}`],
      ),
    );
  const rows = () =>
    raw((db) => ({
      links: db.query('SELECT project_id, slug FROM project_solution ORDER BY project_id').all(),
      legacy: db.query('SELECT id, solution_slug, name, revision FROM project ORDER BY id').all(),
      audits: db.query('SELECT COUNT(*) AS n FROM organization_audit').get(),
    }));

  describe('the table', () => {
    it("refuses a link naming an organization other than its project's owner", () => {
      // Proof: dropping the composite reference let `a1` be linked as org-b's.
      expect(() => insertLink('a1', 'org-b', 'x')).toThrow();
      expect(() => insertLink('a1', 'org-a', 'x')).not.toThrow();
    });

    it('refuses a slug twice in one organization and allows it in two', () => {
      insertLink('a1', 'org-a', 'shared');
      expect(() => insertLink('a2', 'org-a', 'shared')).toThrow();
      expect(() => insertLink('b1', 'org-b', 'shared')).not.toThrow();
    });

    it('refuses a link of no project', () => {
      expect(() =>
        raw((db) =>
          db.run(
            "INSERT INTO project_solution (project_id, organization_id, slug, url) VALUES (NULL, 'org-a', 's', 'u')",
          ),
        ),
      ).toThrow();
    });

    it('refuses an empty slug or url', () => {
      expect(() => insertLink('a1', 'org-a', '')).toThrow();
      expect(() =>
        raw((db) =>
          db.run(
            "INSERT INTO project_solution (project_id, organization_id, slug, url) VALUES ('a1', 'org-a', 's', '')",
          ),
        ),
      ).toThrow();
    });

    it('goes with its project, past the ownership freeze', () => {
      insertLink('a1', 'org-a', 'gone');
      raw((db) => db.run("DELETE FROM project WHERE id = 'a1'"));
      expect(rows().links).toEqual([]);
    });
  });

  describe('the rollback', () => {
    it('rolls back while nothing is linked before activation', () => {
      expect(rollbackTo(path, FOLDER, AUDIT)).toEqual([
        '20260928030000_add_delegation_use',
        '20260928020000_add_email_verification',
        SOLUTION,
      ]);
    });

    it('refuses while a link is recorded', () => {
      insertLink('a1', 'org-a', 'kept');
      expect(() => rollbackTo(path, FOLDER, AUDIT)).toThrow();
      expect(rows().links).toEqual([{ project_id: 'a1', slug: 'kept' }]);
    });

    const applied = () =>
      raw((db) =>
        db
          .query<{ name: string }, []>('SELECT name FROM __drizzle_migrations ORDER BY created_at')
          .all()
          .map((row) => row.name)
          .at(-1),
      );

    const rollbackVerification = () => rollbackTo(path, FOLDER, SOLUTION);

    it('refuses with a missing or malformed marker, keeping the table and the ledger', () => {
      rollbackVerification();
      raw((db) => {
        db.run('PRAGMA ignore_check_constraints = ON');
        db.run('UPDATE organization_activation SET activated_at = 5');
      });
      expect(() => rollbackTo(path, FOLDER, AUDIT)).toThrow();
      expect(applied()).toBe('20260928030000_add_delegation_use');
      raw((db) => db.run('DELETE FROM organization_activation'));
      expect(() => rollbackTo(path, FOLDER, AUDIT)).toThrow();
      expect(applied()).toBe('20260928030000_add_delegation_use');
      expect(raw((db) => db.query('SELECT COUNT(*) AS n FROM project_solution').get())).toEqual({
        n: 0,
      });
    });

    it('refuses after activation even with no link', () => {
      rollbackVerification();
      raw((db) =>
        db.run("UPDATE organization_activation SET state = 'activated', activated_at = 5"),
      );
      expect(() => rollbackTo(path, FOLDER, AUDIT)).toThrow();
      expect(raw((db) => db.query('SELECT COUNT(*) AS n FROM project_solution').get())).toEqual({
        n: 0,
      });
    });
  });

  describe('an organization edit', () => {
    it('links a slug only another organization holds', async () => {
      expect(await edit('b1', 'org-b', { solutionRef: link('shared') })).toMatchObject({
        solutionRef: link('shared'),
      });
      expect(await edit('a1', 'org-a', { solutionRef: link('shared') })).toMatchObject({
        solutionRef: link('shared'),
      });
      expect((await store().findBySolutionSlugInOrganization('shared', 'org-a'))?.id).toBe('a1');
      expect((await store().findBySolutionSlugInOrganization('shared', 'org-b'))?.id).toBe('b1');
      expect((await store().findById('a1'))?.solutionRef).toEqual(link('shared'));
    });

    it('refuses a slug another project of the organization holds, writing nothing', async () => {
      await edit('a1', 'org-a', { solutionRef: link('mine') });
      const before = rows();
      expect(await edit('a2', 'org-a', { name: 'Renamed', solutionRef: link('mine') })).toBe(
        'solution_taken',
      );
      expect(rows()).toEqual(before);
    });

    it('refuses a slug a project of the organization kept from before activation', async () => {
      raw((db) =>
        db.run(
          "UPDATE project SET solution_slug = 'old', solution_url = 'https://solutions.example/old' WHERE id = 'a1'",
        ),
      );
      expect((await store().findBySolutionSlugInOrganization('old', 'org-a'))?.id).toBe('a1');
      expect(await edit('a2', 'org-a', { solutionRef: link('old') })).toBe('solution_taken');
      expect(await edit('b1', 'org-b', { solutionRef: link('old') })).toMatchObject({
        solutionRef: link('old'),
      });
    });

    it('moves a legacy pair into the organization link, relinks and unlinks', async () => {
      raw((db) =>
        db.run(
          "UPDATE project SET solution_slug = 'old', solution_url = 'https://solutions.example/old' WHERE id = 'a1'",
        ),
      );
      expect(await edit('a1', 'org-a', { solutionRef: link('old') })).toMatchObject({
        solutionRef: link('old'),
      });
      expect(rows().legacy).toContainEqual({
        id: 'a1',
        solution_slug: null,
        name: 'a1',
        revision: 1,
      });
      expect(rows().links).toEqual([{ project_id: 'a1', slug: 'old' }]);
      expect(
        await edit('a1', 'org-a', { solutionRef: { slug: 'old', url: 'https://moved.example' } }),
      ).toMatchObject({
        solutionRef: { slug: 'old', url: 'https://moved.example' },
      });
      expect(await edit('a1', 'org-a', { solutionRef: null })).toMatchObject({ solutionRef: null });
      expect(rows().links).toEqual([]);
      expect(await edit('a2', 'org-a', { solutionRef: link('old') })).toMatchObject({
        solutionRef: link('old'),
      });
    });

    it("refuses a lookup two of the organization's projects answer", async () => {
      raw((db) =>
        db.run(
          "UPDATE project SET solution_slug = 'dup', solution_url = 'https://solutions.example/dup' WHERE id = 'a1'",
        ),
      );
      insertLink('a2', 'org-a', 'dup');
      const refused = await store()
        .findBySolutionSlugInOrganization('dup', 'org-a')
        .then(
          () => 'found',
          (error: unknown) => String(error),
        );
      expect(refused).toContain('hold one solution slug');
    });

    it('answers solution_taken to a link racing another process, writing nothing', async () => {
      const ready = join(dir, 'held');
      const holder = Bun.spawn({
        cmd: [
          process.execPath,
          '-e',
          `
            import { Database } from 'bun:sqlite';
            import { writeFileSync } from 'node:fs';
            const db = new Database(${JSON.stringify(path)});
            db.run('PRAGMA foreign_keys = ON');
            db.run('BEGIN IMMEDIATE');
            db.run("INSERT INTO project_solution (project_id, organization_id, slug, url) VALUES ('a2', 'org-a', 'race', 'u')");
            writeFileSync(${JSON.stringify(ready)}, '');
            Bun.sleepSync(${String(HELD_FOR_MS)});
            db.run('COMMIT');
          `,
        ],
        stderr: 'pipe',
      });
      const startedWaiting = Date.now();
      while (!existsSync(ready)) {
        if (Date.now() - startedWaiting > 10_000) {
          throw new Error(
            `the holder never took the lock: ${await new Response(holder.stderr).text()}`,
          );
        }
        await Bun.sleep(5);
      }
      const answer = await edit('a1', 'org-a', { name: 'Renamed', solutionRef: link('race') }).then(
        (outcome) => outcome,
        (error: unknown) => String(error),
      );
      expect(await holder.exited).toBe(0);
      expect(answer).toBe('solution_taken');
      expect(rows().legacy).toContainEqual({
        id: 'a1',
        solution_slug: null,
        name: 'a1',
        revision: 0,
      });
      expect(rows().links).toEqual([{ project_id: 'a2', slug: 'race' }]);
    });

    it('answers a foreign project as absent before judging its slug', async () => {
      await edit('a1', 'org-a', { solutionRef: link('mine') });
      expect(await edit('b1', 'org-a', { solutionRef: link('mine') })).toBeNull();
    });

    it('refuses a project holding both a legacy and a scoped reference', async () => {
      insertLink('a1', 'org-a', 'scoped');
      raw((db) =>
        db.run(
          "UPDATE project SET solution_slug = 'old', solution_url = 'https://solutions.example/old' WHERE id = 'a1'",
        ),
      );
      const failure = (read: Promise<unknown>) =>
        read.then(
          () => 'read',
          (error: unknown) => String(error),
        );
      expect(await failure(store().findById('a1'))).toContain('both a legacy and a scoped');
      expect(await failure(store().listForInOrganization('ada', 'org-a'))).toContain(
        'both a legacy and a scoped',
      );
    });

    it('creates a project with its organization link', async () => {
      await store().createInOrganization(
        projectRow({ id: 'a3', name: 'a3', ownerId: 'ada', solutionRef: link('fresh') }),
        [],
        wrote,
        'org-a',
      );
      expect(rows().links).toEqual([{ project_id: 'a3', slug: 'fresh' }]);
      expect((await store().findInOrganization('a3', 'org-a'))?.solutionRef).toEqual(link('fresh'));
      expect((await store().list()).find((p) => p.id === 'a3')?.solutionRef).toEqual(link('fresh'));
      expect(
        (await store().listForInOrganization('ada', 'org-a')).find((p) => p.id === 'a3')
          ?.solutionRef,
      ).toEqual(link('fresh'));
    });
  });
});
