import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openConnection, openDatabase } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { countBoundClaims } from '@wbs/store-sqlite/organization-limits';

/**
 * Times `countBoundClaims` (`wbs-organization-limits` task 3.5) over a scratch
 * database, the numbers verify.md records. Each of `organizations`
 * organizations owns one project with five steps, twenty agents and `leaves`
 * leaves, and holds `claims` claim rows spread over its leaves and steps; the
 * count is read for the first. Prints the claim rows, the count, the query
 * plan and the mean of 500 timed calls after 50 warm-up calls.
 *
 * Run: `bun apps/wbs/be-01/src/testing/measure-bound-claims.ts <claims> <leaves> <organizations>`.
 *
 * @throws when an argument is not a positive integer, or `claims` exceeds
 * five rows per leaf (one per step, as `claim_step` allows).
 */
const STEPS = 5;
const AGENTS = 20;
const RUNS = 7;

function positive(argument: string | undefined, name: string): number {
  const parsed = Number(argument);
  if (!Number.isSafeInteger(parsed) || parsed < 1)
    throw new Error(`${name} must be a positive integer, not ${String(argument)}`);
  return parsed;
}

const [claimsArgument, leavesArgument, organizationsArgument] = process.argv.slice(2);
const claims = positive(claimsArgument, 'claims');
const leaves = positive(leavesArgument, 'leaves');
const organizations = positive(organizationsArgument, 'organizations');
if (claims > leaves * STEPS) throw new Error(`at most ${String(STEPS)} claims per leaf`);

const folder = new URL('../../drizzle', import.meta.url).pathname;
const directory = mkdtempSync(join(tmpdir(), 'measure-bound-claims-'));
try {
  const path = join(directory, 'measure.db');
  runMigrations(path, folder);
  const seeding = openDatabase(path);
  try {
    seeding.run('BEGIN');
    seeding.run("INSERT INTO users (id, username, created_at) VALUES ('owner', 'owner', 1)");
    for (let o = 0; o < organizations; o++) {
      const organizationId = `org-${String(o)}`;
      const projectId = `project-${String(o)}`;
      seeding.run('INSERT INTO organization (id, name, created_at) VALUES (?, ?, 1)', [
        organizationId,
        organizationId,
      ]);
      seeding.run(
        "INSERT INTO project (id, name, owner_id, created_at, updated_at) VALUES (?, ?, 'owner', 1, 1)",
        [projectId, projectId],
      );
      seeding.run('INSERT INTO project_organization (resource_id, organization_id) VALUES (?, ?)', [
        projectId,
        organizationId,
      ]);
      for (let k = 0; k < STEPS; k++)
        seeding.run('INSERT INTO step (id, project_id, name) VALUES (?, ?, ?)', [
          `step-${String(o)}-${String(k)}`,
          projectId,
          `Step ${String(k)}`,
        ]);
      for (let n = 0; n < AGENTS; n++) {
        const agentId = `agent-${String(o)}-${String(n)}`;
        seeding.run("INSERT INTO person (id, name, kind) VALUES (?, ?, 'agent')", [
          agentId,
          agentId,
        ]);
      }
      for (let l = 0; l < leaves; l++)
        seeding.run('INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, ?, ?)', [
          `leaf-${String(o)}-${String(l)}`,
          projectId,
          l,
          `Leaf ${String(o)}-${String(l)}`,
        ]);
      for (let c = 0; c < claims; c++) {
        const leaf = c % leaves;
        seeding.run(
          'INSERT INTO claim (id, work_item_id, step_id, person_id, run_id, created_at) VALUES (?, ?, ?, ?, ?, 1)',
          [
            `claim-${String(o)}-${String(c)}`,
            `leaf-${String(o)}-${String(leaf)}`,
            `step-${String(o)}-${String(Math.floor(c / leaves))}`,
            `agent-${String(o)}-${String(leaf % AGENTS)}`,
            `run-${String(leaf % RUNS)}`,
          ],
        );
      }
    }
    seeding.run('COMMIT');
    seeding.run('ANALYZE');
  } finally {
    seeding.close();
  }
  let captured = '';
  const connection = openConnection(path, {
    logQuery: (query) => {
      captured = query;
    },
  });
  try {
    const counted = countBoundClaims(connection.db, 'org-0');
    const reading = openDatabase(path);
    // The logger kept the count's own text; its one parameter is the organization.
    const plan = reading
      .query<{ detail: string }, [string]>(`EXPLAIN QUERY PLAN ${captured}`)
      .all('org-0')
      .map(({ detail }) => detail);
    reading.close();
    for (let warm = 0; warm < 50; warm++) countBoundClaims(connection.db, 'org-0');
    const calls = 500;
    const started = performance.now();
    for (let call = 0; call < calls; call++) countBoundClaims(connection.db, 'org-0');
    const mean = (performance.now() - started) / calls;
    console.log(
      JSON.stringify({
        claimRows: claims * organizations,
        boundClaims: counted,
        plan,
        meanMs: mean,
      }),
    );
  } finally {
    connection.close();
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
