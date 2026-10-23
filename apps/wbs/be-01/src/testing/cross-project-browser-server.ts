import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';

import { TEST_JWT_KEY } from './auth-fixture';
import { OrganizationHarness } from './organization-harness';

const secret = 'browser-reconciliation-secret-'.repeat(2);
const harness = OrganizationHarness.openComposedWith({
  internalAuthSecret: secret,
  appOrigin: 'http://localhost:7600',
  pushFetch: (url, init) => fetch(url.replace('http://gw.invalid', 'http://localhost:7501'), init),
});
seedDependencyAuthority(harness.databasePath());
for (const username of ['ada', 'grace']) await harness.register(username);
for (const organizationId of ['org-a', 'org-b']) harness.organization(organizationId);
harness.member('org-a', 'ada', 'member');
harness.member('org-b', 'grace', 'member');
harness.bind('ada', 'org-a');
harness.bind('grace', 'org-b');
harness.activate();
const projects: Record<string, { id: string; row: string; step: string } | undefined> = {};
let ready = false;
const server = Bun.serve({
  port: 7500,
  hostname: 'localhost',
  fetch: async (request) => {
    const path = new URL(request.url).pathname;
    if (path === '/__fixture/ready') return Response.json({ ready }, { status: ready ? 200 : 503 });
    if (path === '/__fixture/identities')
      return Response.json({
        projects,
        token: harness.token('ada'),
        foreignToken: harness.token('grace'),
      });
    if (
      (path === '/__fixture/complete' || path === '/__fixture/reset') &&
      request.method === 'POST'
    ) {
      const project = projects['A'];
      if (project === undefined) throw new Error('missing upstream');
      const answer = await harness.call('ada', 'POST', `/api/projects/${project.id}/commands`, {
        commands: [
          {
            kind: path === '/__fixture/complete' ? 'setProgress' : 'clearProgress',
            workItemId: project.row,
            stepId: project.step,
            ...(path === '/__fixture/complete' ? { state: 'done' } : {}),
          },
        ],
      });
      return Response.json(answer.body, { status: answer.status });
    }
    return harness.request(path + new URL(request.url).search, {
      method: request.method,
      headers: request.headers,
      ...(request.method === 'GET' || request.method === 'HEAD'
        ? {}
        : { body: await request.text() }),
    });
  },
});
const gateway = Bun.spawn(
  [
    process.execPath,
    new URL('../../../gw-01/src/testing/cross-project-delivery-gateway.ts', import.meta.url)
      .pathname,
    'http://localhost:7500',
    TEST_JWT_KEY,
    secret,
    'http://localhost:7600',
    '7501',
  ],
  { stdout: 'pipe', stderr: 'inherit' },
);
if (!(gateway.stdout instanceof ReadableStream)) throw new Error('gateway stdout not piped');
const reader = gateway.stdout.getReader();
const startup = await reader.read();
reader.releaseLock();
const address = JSON.parse(new TextDecoder().decode(startup.value)) as { port: number };
if (address.port <= 0) throw new Error('gateway did not announce a port');
for (const name of ['A', 'B', 'C', 'Unrelated', 'Foreign']) {
  const answer = await harness.call(name === 'Foreign' ? 'grace' : 'ada', 'POST', '/api/projects', {
    name,
  });
  if (answer.status !== 200) throw new Error(`fixture project refused: ${JSON.stringify(answer)}`);
  const body = answer.body as { project: { id: string }; steps: { id: string }[] };
  const step = body.steps.at(0);
  if (step === undefined) throw new Error('missing fixture step');
  const project = { id: body.project.id, row: `${name}-row`, step: step.id };
  projects[name] = project;
  harness.sqlite.run('DELETE FROM step WHERE project_id = ? AND id <> ?', [
    project.id,
    project.step,
  ]);
  harness.sqlite.run(
    "INSERT INTO work_item (id, project_id, position, name, readiness) VALUES (?, ?, 10, ?, 'ready')",
    [project.row, project.id, `${name} row`],
  );
}
for (const [left, right] of [
  ['A', 'B'],
  ['B', 'C'],
] as const) {
  const predecessor = projects[left];
  const successor = projects[right];
  if (predecessor === undefined || successor === undefined) throw new Error('missing chain member');
  harness.sqlite.run(
    `INSERT INTO external_dependency (id, organization_id, predecessor_project_id, successor_project_id, predecessor_work_item_id, predecessor_scope, predecessor_step_id, successor_work_item_id, successor_scope, successor_step_id, type) VALUES (?, 'org-a', ?, ?, ?, 'node', ?, ?, 'node', ?, 'FS')`,
    [
      `${left}-${right}`,
      predecessor.id,
      successor.id,
      predecessor.row,
      predecessor.step,
      successor.row,
      successor.step,
    ],
  );
}
ready = true;
async function stop() {
  gateway.kill();
  await gateway.exited;
  await server.stop(true);
  await harness.closeComposed();
  process.exit(0);
}
process.once('SIGTERM', () => {
  void stop();
});
process.once('SIGINT', () => {
  void stop();
});
