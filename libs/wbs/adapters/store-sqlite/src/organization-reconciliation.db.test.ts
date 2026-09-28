import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import {
  OrganizationOwnershipRepository,
  OWNERSHIP_CONFLICT_KINDS,
  type OwnershipConflictKind,
} from './organization-ownership';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
/**
 * The migration below the ownership freeze. The conflicts here re-own roots,
 * which the freeze now refuses; reconciliation still guards a database that
 * reached such a state before the freeze applied, so the fixture builds one.
 */
const ORGANIZATION_BRIDGE = '20260927190000_add_organization_bridge';

let dir: string;
let path: string;

function run(statements: readonly string[]): void {
  const db = openDatabase(path);
  try {
    for (const statement of statements) db.run(statement);
  } finally {
    db.close();
  }
}

/**
 * Two organizations before activation: the bridge maps everything to legacy, then organization
 * B's roots are re-owned, as a bug or a premature second tenant would leave them. Each has a
 * project, two work items, a step and one of every catalog, all linked inside the organization.
 */
function roots(org: string): string[] {
  const statements = [
    `INSERT INTO project (id, name, owner_id, created_at) VALUES ('p-${org}', 'Plan ${org}', 'u1', 1)`,
    `INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES ('w-${org}', 'p-${org}', NULL, 0, 'Root')`,
    `INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES ('w2-${org}', 'p-${org}', 'w-${org}', 0, 'Child')`,
    `INSERT INTO step (id, project_id, name, position) VALUES ('st-${org}', 'p-${org}', 'Build', 0)`,
    `INSERT INTO person (id, name) VALUES ('pe-${org}', 'Ada ${org}')`,
    `INSERT INTO service_team (id, name) VALUES ('tm-${org}', 'Team ${org}')`,
    `INSERT INTO service (id, name) VALUES ('sv-${org}', 'Service ${org}')`,
    `INSERT INTO tag (id, name) VALUES ('tg-${org}', 'Tag ${org}')`,
    `INSERT INTO work_item_type (id, name) VALUES ('ty-${org}', 'Type ${org}')`,
    `INSERT INTO external_system (id, name) VALUES ('es-${org}', 'System ${org}')`,
    `INSERT INTO saved_plan (id, project_id, name, created_by, created_at, input_schema_version, input_bytes, input_sha256, schedule_absent_reason)
     VALUES ('sp-${org}', 'p-${org}', 'Baseline', 'u1', 1, 1, 0, 'x', 'not-scheduled')`,
  ];
  if (org === 'b')
    for (const kind of [
      'project',
      'person',
      'service_team',
      'service',
      'tag',
      'work_item_type',
      'external_system',
      'saved_plan',
    ])
      statements.push(
        `UPDATE ${kind}_organization SET organization_id = 'org-b' WHERE resource_id LIKE '%-b'`,
      );
  return statements;
}

/** Every dependent relation, linked within organization `org`. */
function links(org: string): string[] {
  return [
    `INSERT INTO dependency (id, project_id, predecessor_id, successor_id) VALUES ('d-${org}', 'p-${org}', 'w-${org}', 'w2-${org}')`,
    `UPDATE work_item SET service_team_id = 'tm-${org}', service_id = 'sv-${org}' WHERE id = 'w2-${org}'`,
    `INSERT INTO work_item_tag (work_item_id, tag_id) VALUES ('w-${org}', 'tg-${org}')`,
    `INSERT INTO work_item_team (work_item_id, team_id) VALUES ('w-${org}', 'tm-${org}')`,
    `INSERT INTO work_item_work_item_type (work_item_id, type_id) VALUES ('w-${org}', 'ty-${org}')`,
    `INSERT INTO work_item_service (work_item_id, service_id) VALUES ('w-${org}', 'sv-${org}')`,
    `INSERT INTO work_item_external_ref (id, work_item_id, system_id, url, name, position) VALUES ('x-${org}', 'w-${org}', 'es-${org}', 'https://x', 'X', 0)`,
    `INSERT INTO assignment (work_item_id, step_id, person_id) VALUES ('w-${org}', 'st-${org}', 'pe-${org}')`,
    `INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES ('w-${org}', 'st-${org}', 1, 2, 3)`,
    `INSERT INTO actual (work_item_id, step_id, days, recorded_at) VALUES ('w-${org}', 'st-${org}', 1, 1)`,
    `INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES ('w-${org}', 'st-${org}', 'done', 1)`,
    `INSERT INTO step_measure (work_item_id, step_id, metric, value, recorded_at) VALUES ('w-${org}', 'st-${org}', 'hours_actual', 1, 1)`,
    `INSERT INTO person_team (person_id, service_team_id) VALUES ('pe-${org}', 'tm-${org}')`,
    `INSERT INTO team_service (team_id, service_id) VALUES ('tm-${org}', 'sv-${org}')`,
    `INSERT INTO project_team_capacity (project_id, service_team_id, size) VALUES ('p-${org}', 'tm-${org}', 1)`,
    `INSERT INTO plan_event (id, project_id, user_id, kind, label, work_item_id, step_id, before, after, created_at) VALUES ('e-${org}', 'p-${org}', 'u1', 'k', 'l', 'w-${org}', 'st-${org}', '{}', '{}', 1)`,
    `INSERT INTO event_sequencer (subscription, next_seq) VALUES ('project:p-${org}', 1)`,
    `INSERT INTO event_log (subscription, seq, message, created_at) VALUES ('project:p-${org}', 0, '{}', 1)`,
  ];
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-organization-reconciliation-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  rollbackTo(path, FOLDER, ORGANIZATION_BRIDGE);
  run([
    "INSERT INTO users (id, username, created_at) VALUES ('u1', 'u1', 1)",
    "INSERT INTO organization (id, name, legacy, created_at) VALUES ('legacy', 'Legacy', 1, 1)",
    "INSERT INTO organization (id, name, created_at) VALUES ('org-b', 'B', 1)",
    ...roots('a'),
    ...roots('b'),
    ...links('a'),
    ...links('b'),
  ]);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function findConflicts(): Promise<{ kind: OwnershipConflictKind; id: string }[]> {
  return new OrganizationOwnershipRepository(openDrizzle(path)).findOwnershipConflicts();
}

/** One cross-organization or cross-project reference per conflict kind. */
const INJECTIONS: Record<OwnershipConflictKind, readonly [string, string]> = {
  saved_plan_project: [
    "UPDATE saved_plan_organization SET organization_id = 'org-b' WHERE resource_id = 'sp-a'",
    'sp-a',
  ],
  dependency_endpoint: [
    "INSERT INTO dependency (id, project_id, predecessor_id, successor_id) VALUES ('d-x', 'p-a', 'w-a', 'w-b')",
    'd-x',
  ],
  work_item_parent: ["UPDATE work_item SET parent_id = 'w-b' WHERE id = 'w2-a'", 'w2-a'],
  work_item_service_team: [
    "UPDATE work_item SET service_team_id = 'tm-b' WHERE id = 'w2-a'",
    'w2-a',
  ],
  work_item_service: ["UPDATE work_item SET service_id = 'sv-b' WHERE id = 'w2-a'", 'w2-a'],
  work_item_tag: [
    "INSERT INTO work_item_tag (work_item_id, tag_id) VALUES ('w-a', 'tg-b')",
    'w-a/tg-b',
  ],
  work_item_team: [
    "INSERT INTO work_item_team (work_item_id, team_id) VALUES ('w-a', 'tm-b')",
    'w-a/tm-b',
  ],
  work_item_type: [
    "INSERT INTO work_item_work_item_type (work_item_id, type_id) VALUES ('w2-a', 'ty-b')",
    'w2-a/ty-b',
  ],
  work_item_service_link: [
    "INSERT INTO work_item_service (work_item_id, service_id) VALUES ('w2-a', 'sv-b')",
    'w2-a/sv-b',
  ],
  work_item_external_ref: [
    "INSERT INTO work_item_external_ref (id, work_item_id, system_id, url, name, position) VALUES ('x-x', 'w-a', 'es-b', 'https://y', 'Y', 1)",
    'x-x',
  ],
  assignment_person: [
    "INSERT INTO assignment (work_item_id, step_id, person_id) VALUES ('w2-a', 'st-a', 'pe-b')",
    'w2-a/st-a/pe-b',
  ],
  assignment_step: [
    "INSERT INTO assignment (work_item_id, step_id, person_id) VALUES ('w2-a', 'st-b', 'pe-a')",
    'w2-a/st-b/pe-a',
  ],
  estimate_step: [
    "INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES ('w2-a', 'st-b', 1, 2, 3)",
    'w2-a/st-b',
  ],
  actual_step: [
    "INSERT INTO actual (work_item_id, step_id, days, recorded_at) VALUES ('w2-a', 'st-b', 1, 1)",
    'w2-a/st-b',
  ],
  step_progress_step: [
    "INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES ('w2-a', 'st-b', 'done', 1)",
    'w2-a/st-b',
  ],
  step_measure_step: [
    "INSERT INTO step_measure (work_item_id, step_id, metric, value, recorded_at) VALUES ('w2-a', 'st-b', 'token_actual', 1, 1)",
    'w2-a/st-b/token_actual',
  ],
  person_team: [
    "INSERT INTO person_team (person_id, service_team_id) VALUES ('pe-a', 'tm-b')",
    'pe-a/tm-b',
  ],
  team_service: [
    "INSERT INTO team_service (team_id, service_id) VALUES ('tm-a', 'sv-b')",
    'tm-a/sv-b',
  ],
  project_team_capacity: [
    "INSERT INTO project_team_capacity (project_id, service_team_id, size) VALUES ('p-a', 'tm-b', 1)",
    'p-a/tm-b',
  ],
  plan_event_subject: [
    "INSERT INTO plan_event (id, project_id, user_id, kind, label, work_item_id, step_id, before, after, created_at) VALUES ('e-x', 'p-a', 'u1', 'k', 'l', 'w-b', NULL, '{}', '{}', 1)",
    'e-x',
  ],
  event_stream: [
    "INSERT INTO event_log (subscription, seq, message, created_at) VALUES ('project:deleted', 0, '{}', 1)",
    'project:deleted',
  ],
};

describe('OrganizationOwnershipRepository.findOwnershipConflicts', () => {
  it('answers empty when every dependent stays inside its organization', async () => {
    expect(await findConflicts()).toEqual([]);
  });

  it.each(OWNERSHIP_CONFLICT_KINDS.map((kind) => [kind]))('reports a %s conflict', async (kind) => {
    const [injection, id] = INJECTIONS[kind];
    run([injection]);
    expect(await findConflicts()).toEqual([{ kind, id }]);
  });

  it('keeps late legacy-era writes of every family mapped and conflict-free through the bridge', async () => {
    // An outgoing-release writer adds a whole project family after the legacy organization exists.
    // Proof: dropping `saved_plan_organization_bridge` first made this case fail on the unmapped
    // `sp-c`. Observed 2026-09-27.
    run([...roots('c'), ...links('c')]);
    const repository = new OrganizationOwnershipRepository(openDrizzle(path));
    expect((await repository.findUnmappedRoots()).filter((root) => root.id.endsWith('-c'))).toEqual(
      [],
    );
    expect(await findConflicts()).toEqual([]);
  });
});
