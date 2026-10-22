import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';

import { addAgentPerson, issueApiKey } from './machine-credential-fixture';
import { OrganizationHarness } from './organization-harness';

function requireOk(reply: { status: number }): void {
  if (reply.status !== 200) throw new Error(`fixture request failed: ${String(reply.status)}`);
}
const pushes: string[] = [];
const harness = OrganizationHarness.openComposedWith({
  now: () => 1_792_368_000_000,
  ...(process.env['MCP_PARITY_ACTIVE'] === 'true' ? { syntheticExternalCommands: true } : {}),
  pushFetch: (url) => {
    pushes.push(url);
    return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
  },
});
seedDependencyAuthority(harness.databasePath());
await harness.register('ada');
harness.organization('org-a');
harness.member('org-a', 'ada', 'super_admin');
harness.bind('ada', 'org-a');
harness.activate();
const endpoints = [];
for (const name of ['Predecessor', 'Successor']) {
  requireOk(await harness.call('ada', 'POST', '/api/projects', { name }));
  const project = harness.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM project WHERE name=?')
    .get(name);
  if (project === null) throw new Error('fixture project missing');
  requireOk(
    await harness.call('ada', 'POST', `/api/projects/${project.id}/commands`, {
      commands: [{ kind: 'createWorkItem', name }],
    }),
  );
  const row = harness.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE project_id=?')
    .get(project.id);
  if (row === null) throw new Error('fixture row missing');
  harness.sqlite
    .query(
      "UPDATE project SET start_date='2026-10-19', estimate_method='realistic', estimate_rounding='exact' WHERE id=?",
    )
    .run(project.id);
  harness.sqlite.query("UPDATE work_item SET readiness='ready' WHERE id=?").run(row.id);
  const steps = harness.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM step WHERE project_id=? ORDER BY position')
    .all(project.id);
  for (const step of steps)
    harness.sqlite
      .query(
        'INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES (?,?,1,1,1)',
      )
      .run(row.id, step.id);
  endpoints.push({ projectId: project.id, workItemId: row.id, scope: 'whole' as const });
}
const predecessor = endpoints.at(0);
const successor = endpoints.at(1);
if (predecessor === undefined || successor === undefined)
  throw new Error('fixture endpoints missing');
addAgentPerson(harness.sqlite, 'parity-agent', 'org-a', harness.userId('ada'));
const credential = await issueApiKey(harness.sqlite, {
  organizationId: 'org-a',
  personId: 'parity-agent',
  issuedBy: harness.userId('ada'),
});

requireOk(
  await harness.callWith(credential.key, 'GET', `/api/projects/${successor.projectId}/work-items`),
);
pushes.length = 0;
const controlToken = crypto.randomUUID();
const backend = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: (request) => {
    if (new URL(request.url).pathname === '/_parity/state') {
      if (request.headers.get('authorization') !== `Bearer ${controlToken}`)
        return new Response(null, { status: 403 });
      const sqlite = harness.sqlite;
      return Response.json({
        pushes,
        relationship: sqlite.query('SELECT * FROM external_dependency').get(),
        journal: sqlite
          .query(
            'SELECT preconditions FROM command_journal WHERE project_id=? ORDER BY seq DESC LIMIT 1',
          )
          .get(successor.projectId),
        journalCount: sqlite.query('SELECT id FROM command_journal').all().length,
        revisions: sqlite.query('SELECT revision FROM work_item ORDER BY id').all(),
        effects: sqlite
          .query<{ name: string }, []>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
          )
          .all()
          .map(({ name }) => ({
            name,
            rows: sqlite.query(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all(),
          })),
      });
    }
    return harness.app.handle(request);
  },
});
let closing = false;
process.on('SIGTERM', () => {
  if (closing) return;
  closing = true;
  void (async () => {
    await backend.stop(true);
    await harness.closeComposed();
    process.exit(0);
  })();
});
console.log(
  JSON.stringify({ port: backend.port, key: credential.key, controlToken, predecessor, successor }),
);
