import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import { rollbackTo } from './migrate-down';
import { ProjectRankRepository } from './project-rank';
import { MIGRATIONS_FOLDER as FOLDER, openSpaceDatabase } from './testing/space-database';

const BEFORE_AUDIT = '20260929200000_add_shared_people';

let dir: string;
let path: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-shared-people-mode-'));
  // Organizations `org-a` and `org-b`.
  path = await openSpaceDatabase(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const store = () => new ProjectRankRepository(openDrizzle(path), OPEN);

function records(): unknown[] {
  const db = openDatabase(path);
  try {
    return db
      .query(
        'SELECT id, organization_id, actor_id, shared_people, created_at FROM shared_people_audit ORDER BY created_at',
      )
      .all();
  } finally {
    db.close();
  }
}

function sql(statement: string): void {
  const db = openDatabase(path);
  try {
    db.run(statement);
  } finally {
    db.close();
  }
}

describe('the capacity mode', () => {
  it('reads isolated until switched', async () => {
    expect(await store().sharedPeopleIn('org-a')).toBe(false);
  });

  it('records who switched the mode, and nothing for a switch to the mode it had', async () => {
    expect(await store().setSharedPeople('org-a', true, { at: 5, by: 'sam' }, 'au-1')).toEqual({
      changed: true,
    });
    expect(await store().setSharedPeople('org-a', true, { at: 6, by: 'sam' }, 'au-2')).toEqual({
      changed: false,
    });
    expect(await store().setSharedPeople('org-a', false, { at: 7, by: 'ada' }, 'au-3')).toEqual({
      changed: true,
    });
    expect(await store().sharedPeopleIn('org-a')).toBe(false);
    expect(await store().sharedPeopleIn('org-b')).toBe(false);
    expect(records()).toEqual([
      { id: 'au-1', organization_id: 'org-a', actor_id: 'sam', shared_people: 1, created_at: 5 },
      { id: 'au-3', organization_id: 'org-a', actor_id: 'ada', shared_people: 0, created_at: 7 },
    ]);
  });

  it('refuses an organization that does not exist', async () => {
    const refusal = async (attempt: () => Promise<unknown>) => {
      try {
        await attempt();
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };
    expect(await refusal(() => store().sharedPeopleIn('nowhere'))).toContain('does not exist');
    expect(
      await refusal(() => store().setSharedPeople('nowhere', true, { at: 5, by: 'sam' }, 'au-1')),
    ).toContain('does not exist');
    expect(records()).toEqual([]);
  });

  it('refuses a record of a third mode', () => {
    expect(() => {
      sql(
        "INSERT INTO shared_people_audit (id, organization_id, actor_id, shared_people, created_at) VALUES ('x', 'org-a', 'sam', 2, 1)",
      );
    }).toThrow(/CHECK constraint failed/);
  });
});

describe('rolling back past the audit', () => {
  it('rolls back while nothing is recorded', () => {
    expect(rollbackTo(path, FOLDER, BEFORE_AUDIT)).toEqual([
      '20260929210000_add_shared_people_audit',
    ]);
  });

  it('refuses to roll back over a recorded switch', async () => {
    await store().setSharedPeople('org-a', true, { at: 5, by: 'sam' }, 'au-1');
    await store().setSharedPeople('org-a', false, { at: 6, by: 'sam' }, 'au-2');
    expect(() => rollbackTo(path, FOLDER, BEFORE_AUDIT)).toThrow(
      /audit evidence is never discarded/,
    );
    expect(records()).toHaveLength(2);
  });
});
