import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDrizzle } from './db';
import type { Project, Role } from './index';
import { runMigrations } from './migrate';
import { ProjectRepository } from './project';
import { UserRepository } from './user';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

let dir: string;
let repo: ProjectRepository;
let ownerId: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-project-'));
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  const db = openDrizzle(path);
  repo = new ProjectRepository(db);
  ownerId = crypto.randomUUID();
  await new UserRepository(db).create({
    id: ownerId,
    username: 'owner',
    passwordHash: 'x',
    createdAt: 1,
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function project(name: string, createdAt: number): Project {
  return { id: crypto.randomUUID(), name, ownerId, restricted: false, createdAt };
}

function roles(projectId: string, ...names: string[]): Role[] {
  return names.map((name) => ({ id: crypto.randomUUID(), projectId, name }));
}

/**
 * The message a promise rejected with, or a marker when it resolved.
 *
 * Written out rather than using `.rejects.toThrow`, which returns void here and
 * so cannot be awaited — an assertion that is never awaited passes whatever
 * happens, which is the failure mode these two tests exist to rule out.
 */
async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return '(resolved without throwing)';
  } catch (err) {
    return String(err);
  }
}

describe('ProjectRepository', () => {
  it('writes a project and its starting roles together', async () => {
    const shed = project('Rewire the shed', 100);
    await repo.create(shed, roles(shed.id, 'Dev', 'QA'));

    expect(await repo.findById(shed.id)).toMatchObject({
      name: 'Rewire the shed',
      ownerId,
      restricted: false,
    });
    expect((await repo.rolesOf(shed.id)).map((r) => r.name)).toEqual(['Dev', 'QA']);
  });

  it('lists projects newest first, whoever owns them', async () => {
    const older = project('Older', 100);
    const newer = project('Newer', 200);
    await repo.create(older, roles(older.id, 'Dev'));
    await repo.create(newer, roles(newer.id, 'Dev'));

    expect((await repo.list()).map((p) => p.name)).toEqual(['Newer', 'Older']);
  });

  it('patches name and restricted, leaving the rest alone', async () => {
    const shed = project('Rewire the shed', 100);
    await repo.create(shed, roles(shed.id, 'Dev'));

    const updated = await repo.update(shed.id, { restricted: true });

    expect(updated).toMatchObject({ name: 'Rewire the shed', restricted: true, ownerId });
  });

  it('returns null when patching a project that is not there', async () => {
    expect(await repo.update(crypto.randomUUID(), { name: 'Ghost' })).toBeNull();
  });

  it('refuses two roles with one name in one project', async () => {
    // The uniqueness lives in the schema rather than the service because two
    // concurrent role additions both pass a check-then-insert.
    const shed = project('Rewire the shed', 100);
    expect(await rejection(repo.create(shed, roles(shed.id, 'Dev', 'Dev')))).toMatch(/UNIQUE/);
  });

  it('lists per account: opened first by recency, then never-opened by creation', async () => {
    const a = project('A', 100);
    const b = project('B', 200);
    const c = project('C', 300);
    for (const p of [a, b, c]) await repo.create(p, roles(p.id, 'Dev'));

    await repo.recordOpen(ownerId, a.id, 1000);
    await repo.recordOpen(ownerId, b.id, 2000);

    const listed = await repo.listFor(ownerId);
    expect(listed.map((p) => p.name)).toEqual(['B', 'A', 'C']);
    expect(listed.map((p) => p.lastOpenedAt)).toEqual([2000, 1000, null]);
  });

  it('gives another account its own order', async () => {
    const other = crypto.randomUUID();
    await new UserRepository(openDrizzle(join(dir, 'test.db'))).create({
      id: other,
      username: 'other',
      passwordHash: 'x',
      createdAt: 1,
    });
    const a = project('A', 100);
    const b = project('B', 200);
    const c = project('C', 300);
    for (const p of [a, b, c]) await repo.create(p, roles(p.id, 'Dev'));
    await repo.recordOpen(ownerId, a.id, 1000);
    await repo.recordOpen(other, c.id, 500);

    expect((await repo.listFor(other)).map((p) => p.name)).toEqual(['C', 'B', 'A']);
    expect((await repo.listFor(ownerId)).map((p) => p.name)).toEqual(['A', 'C', 'B']);
  });

  it('keeps one record per pair, holding the later moment', async () => {
    const shed = project('Rewire the shed', 100);
    await repo.create(shed, roles(shed.id, 'Dev'));

    await repo.recordOpen(ownerId, shed.id, 1000);
    await repo.recordOpen(ownerId, shed.id, 3000);

    expect((await repo.listFor(ownerId)).map((p) => p.lastOpenedAt)).toEqual([3000]);
  });

  it('refuses a project whose owner does not exist', async () => {
    // Proof that foreign keys are enforced rather than merely declared: this
    // insert parses fine and is rejected only because the pragma is on.
    const orphan: Project = { ...project('Orphan', 100), ownerId: crypto.randomUUID() };
    expect(await rejection(repo.create(orphan, roles(orphan.id, 'Dev')))).toMatch(/FOREIGN KEY/);
  });
});
