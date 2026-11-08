import { writeFileSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { join } from 'node:path';

import { workItemTree } from '@wbs/contracts';
import { createLogger } from '@wbs/observability';
import { openSqliteSource } from '@wbs/store-sqlite';

import { buildApp } from '../app';
import { bootBe01 } from '../boot';
import { openDatabase } from '../repository/db';
import { joseTokenCodec } from '../runtime/bun-runtime';
import { TEST_MCP_SERVICE_SETTINGS } from './machine-grant-fixture';
import { TEST_ORGANIZATION_DEFAULT_LIMITS } from './organization-limits-fixture';

const [role, databasePath, directory] = process.argv.slice(2);
if (!['writer', 'reader'].includes(role) || !databasePath || !directory)
  throw new Error('capacity fanout child requires role, database and directory');
const secret = 's'.repeat(32);
const jwtKey = 'k'.repeat(32);
const sqlite = openDatabase(databasePath);
if (role === 'writer') {
  for (const user of ['ada', 'grace'])
    sqlite.run('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, 1)', [
      user,
      user,
      'unused',
    ]);
  sqlite.run(
    "INSERT INTO organization (id, name, created_at, shared_people) VALUES ('org-a', 'A', 1, 1), ('org-z', 'Z', 1, 0)",
  );
  sqlite.run(
    "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'ada', 'admin', 1), ('org-z', 'grace', 'member', 1)",
  );
  sqlite.run("UPDATE organization_activation SET state = 'activated', activated_at = 1");
  sqlite.run("INSERT INTO person (id, name) VALUES ('ana', 'Ana')");
  sqlite.run(
    "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('ana', 'org-a', 'Ana')",
  );
  for (const [position, project] of ['A', 'B'].entries()) {
    sqlite.run(
      "INSERT INTO project (id, name, owner_id, restricted, revision, created_at, start_date, estimate_rounding, schedule_engine, optimization_enabled) VALUES (?, ?, 'ada', 0, 0, 1, '2026-10-05', 'exact', 'fast', 0)",
      [project, project],
    );
    sqlite.run(
      "INSERT INTO project_organization (resource_id, organization_id) VALUES (?, 'org-a')",
      [project],
    );
    sqlite.run(
      "INSERT INTO project_rank (project_id, organization_id, position, created_at, created_by) VALUES (?, 'org-a', ?, 1, 'ada')",
      [project, position * 10],
    );
    sqlite.run('INSERT INTO step (id, project_id, name, position) VALUES (?, ?, ?, 10)', [
      `${project}-step`,
      project,
      `${project}-step`,
    ]);
    sqlite.run('INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 10, ?)', [
      project,
      project,
      project,
    ]);
    sqlite.run(
      'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
      [project, `${project}-step`],
    );
    sqlite.run("INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, 'ana')", [
      project,
      `${project}-step`,
    ]);
  }
  const markerPath = join(directory, 'committed.json');
  const stagedPath = join(directory, `.committed-${String(process.pid)}.pending`);
  let publication: Promise<void> | undefined;
  /** Publishes from this child's staging path; transport retries share one promise. */
  async function publishMarker(): Promise<void> {
    await Bun.write(stagedPath, JSON.stringify({ pid: process.pid, cursor: -1 }));
    while (!(await Bun.file(join(directory, 'release-marker')).exists())) await Bun.sleep(1);
    await rename(stagedPath, markerPath);
  }
  globalThis.fetch = Object.assign(
    async () => {
      const repeated = publication !== undefined;
      publication ??= publishMarker();
      await publication;
      if (repeated) writeFileSync(join(directory, 'retried'), '');
      return new Promise<Response>(() => undefined);
    },
    { preconnect: globalThis.fetch.preconnect },
  );
}
let app: ReturnType<typeof buildApp> | undefined;
const running = await bootBe01(
  {
    appOrigin: 'http://localhost',
    dbPath: databasePath,
    port: 0,
    logger: createLogger({
      service: 'be-01',
      level: 'error',
      destination: { write: () => undefined },
    }),
    jwtKey,
    gwUrl: 'http://gw.invalid',
    internalAuthSecret: secret,
    browserSessionAuthority: 'enabled',
    organizationDefaultLimits: TEST_ORGANIZATION_DEFAULT_LIMITS,
    mcpService: TEST_MCP_SERVICE_SETTINGS,
  },
  {
    openSource: openSqliteSource,
    makeApp: (options) => {
      const mounted = buildApp(options);
      mounted.stop = () => Promise.resolve(mounted);
      app = mounted;
      return mounted;
    },
    startListener: (_app, _port, ready) => {
      ready();
    },
  },
);
if (app === undefined) throw new Error('boot did not mount capacity app');
const mounted = app;
async function call(path: string, cookie: string, body?: unknown, internal = false) {
  return mounted.handle(
    new Request(`http://localhost${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        cookie,
        origin: 'http://localhost',
        'content-type': 'application/json',
        'X-WBS-Expected-Organization': 'org-a',
        ...(internal ? { 'x-internal-auth': secret } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}
async function select(user: string, organizationId: string) {
  const token = await joseTokenCodec(jwtKey).sign({ subject: user, username: user }, 3600);
  const access = `__Host-wbs_access=${token}`;
  const response = await call('/api/organization/active', access, { organizationId });
  if (response.status !== 200)
    throw new Error(`selection failed: ${String(response.status)} ${await response.text()}`);
  const selection = response.headers.get('set-cookie');
  if (selection === null) throw new Error('selection issued no cookie');
  return `${access}; ${selection.split(';')[0]}`;
}
try {
  const cookie = await select('ada', 'org-a');
  if (role === 'writer') {
    const initial = await call('/api/projects/B/work-items', cookie);
    if (initial.status !== 200) throw new Error('pre-edit tree was refused');
    const tree = workItemTree.assert(await initial.json());
    if (tree.seq !== -1) throw new Error('pre-edit fixture cursor must be -1');
    await Bun.write(join(directory, 'cursor.json'), JSON.stringify(tree.seq));
    const response = await call('/api/projects/A/commands', cookie, {
      commands: [
        {
          kind: 'setEstimate',
          workItemId: 'A',
          stepId: 'A-step',
          days: { optimistic: 3, realistic: 3, pessimistic: 3 },
        },
      ],
    });
    throw new Error(
      `writer returned before kill: ${String(response.status)} ${await response.text()}`,
    );
  }
  const emptyBuffer = !running.services.replayBuffer.covers('project:B', 0);
  const snapshot = () =>
    JSON.stringify(
      Object.fromEntries(
        [
          'event_log',
          'event_sequencer',
          'command_journal',
          'optimized_schedule_cache',
          'optimization_generation',
          'solver_queue',
          'solver_slot',
          'organization_audit',
          'shared_people_audit',
          'project',
          'estimate',
        ].map((table) => [table, sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all()]),
      ),
    );
  const before = snapshot();
  async function resume(credential: string, seq: number) {
    const response = await call(
      '/internal/resume',
      credential,
      { resume_points: { 'project:B': seq }, trace_id: 'capacity-crash' },
      true,
    );
    if (response.status !== 200)
      throw new Error(`resume failed: ${String(response.status)} ${await response.text()}`);
    const payload: unknown = await response.json();
    return payload;
  }
  const cursor: unknown = await Bun.file(join(directory, 'cursor.json')).json();
  if (typeof cursor !== 'number') throw new Error('pre-edit cursor is not numeric');
  const resumeAnswer: unknown = await resume(cookie, cursor);
  const repeated: unknown = await resume(cookie, 0);
  const response = await call('/api/projects/B/work-items', cookie);
  if (response.status !== 200)
    throw new Error(`tree failed: ${String(response.status)} ${await response.text()}`);
  const tree = workItemTree.assert(await response.json());
  const placed = tree.slices.find(({ workItemId }) => workItemId === 'B');
  if (placed === undefined) throw new Error('B has no scheduled slice');
  const { earliestStart: start, earliestFinish: end, personId, boundBy, elsewhereHolder } = placed;
  const unchanged = before === snapshot();
  const foreign: unknown = await resume(await select('grace', 'org-z'), -1);
  sqlite.run("DELETE FROM organization_membership WHERE user_id = 'ada'");
  const removed: unknown = await resume(cookie, -1);
  await Bun.write(
    join(directory, 'read.json'),
    JSON.stringify({
      pid: process.pid,
      emptyBuffer,
      resume: resumeAnswer,
      repeated,
      slice: { start, end, personId, boundBy, elsewhereHolder },
      waitingElsewhere: tree.waitingElsewhere,
      foreign,
      removed,
      unchanged,
    }),
  );
} finally {
  await running.stop();
  sqlite.close();
}
