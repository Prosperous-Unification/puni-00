import { WriteCoordinator } from '@wbs/store-sqlite/gate';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';

import { openDatabase } from '../repository/db';
import { addAgentPerson, issueApiKey } from './machine-credential-fixture';
import { OrganizationHarness } from './organization-harness';

function requireOk(reply: { status: number }): void {
  if (reply.status !== 200) throw new Error(`fixture request failed: ${String(reply.status)}`);
}
const pushes: string[] = [];
const harness = OrganizationHarness.openComposedWith({
  now: () => 1_792_368_000_000,
  withOptimizer: process.env['MCP_PARITY_OPTIMIZER'] === 'installed',
  solverVersion: '0.4.0',
  spawn: () => {
    const child = Bun.spawn([process.execPath, '-e', 'process.exit(1)'], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    return Promise.resolve({
      pid: child.pid,
      stdout: child.stdout,
      stderr: child.stderr,
      exited: child.exited,
      kill: () => {
        child.kill();
      },
      verdict: () => undefined,
    });
  },
  pushFetch: (url) => {
    pushes.push(url);
    return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
  },
});
if (process.env['MCP_PARITY_ACTIVE'] === 'true') seedDependencyAuthority(harness.databasePath());
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
  endpoints.push({
    projectId: project.id,
    workItemId: row.id,
    scope: 'whole' as const,
    steps: steps.map(({ id }) => id),
  });
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
let releaseWriter: (() => void) | undefined;
let heldWriter: Promise<void> | undefined;
let queuedWriter: Promise<void> | undefined;
const enterDescriptor = Object.getOwnPropertyDescriptor(WriteCoordinator.prototype, 'enter');
if (enterDescriptor === undefined) throw new Error('fixture writer method missing');
// The descriptor comes from the concrete coordinator prototype; preserve its generic signature.
const enter = enterDescriptor.value as WriteCoordinator['enter'];

const backend = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: async (request) => {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/_parity/authority/')) {
      if (request.headers.get('authorization') !== `Bearer ${controlToken}`)
        return new Response(null, { status: 403 });
      if (request.method !== 'POST') return new Response(null, { status: 405 });
      switch (path.slice('/_parity/authority/'.length)) {
        case 'restricted-predecessor': {
          await harness.register('owner');
          harness.member('org-a', 'owner', 'member');
          harness.sqlite.run('UPDATE project SET owner_id=?, restricted=1 WHERE id=?', [
            harness.userId('owner'),
            predecessor.projectId,
          ]);
          harness.sqlite.run('UPDATE project SET owner_id=? WHERE id=?', [
            harness.userId('owner'),
            successor.projectId,
          ]);
          break;
        }
        case 'hold': {
          if (heldWriter !== undefined) throw new Error('writer already held');
          let markEntered: (() => void) | undefined;
          const entered = new Promise<void>((resolve) => {
            markEntered = resolve;
          });
          heldWriter = harness.holdWriteTurn(
            new Promise<void>((resolve) => {
              releaseWriter = resolve;
            }),
            () => {
              if (markEntered === undefined) throw new Error('writer entry signal missing');
              markEntered();
            },
          );
          await entered;
          queuedWriter = new Promise<void>((resolve) => {
            WriteCoordinator.prototype.enter = function <T>(
              this: WriteCoordinator,
              work: () => Promise<T>,
            ): Promise<T> {
              // The delegated coordinator executes this same generic callback; only its enqueue is observed.
              const pending = enter.call(this, work) as Promise<T>;
              resolve();
              return pending;
            };
          });
          break;
        }
        case 'queued':
          if (queuedWriter === undefined) throw new Error('writer was not held');
          await queuedWriter;
          WriteCoordinator.prototype.enter = enter;
          break;
        case 'revoke-credential':
        case 'restrict-successor': {
          const separate = openDatabase(harness.databasePath());
          try {
            if (path.endsWith('revoke-credential'))
              separate.run('UPDATE machine_credential SET revoked_at=1 WHERE id=?', [
                credential.id,
              ]);
            else separate.run('UPDATE project SET restricted=1 WHERE id=?', [successor.projectId]);
          } finally {
            separate.close();
          }
          break;
        }
        case 'release':
          if (releaseWriter === undefined || heldWriter === undefined)
            throw new Error('writer was not held');
          releaseWriter();
          await heldWriter;
          heldWriter = undefined;
          queuedWriter = undefined;
          releaseWriter = undefined;
          WriteCoordinator.prototype.enter = enter;
          break;
        default:
          throw new Error('unknown authority fixture action');
      }
      return Response.json({ prepared: true });
    }
    if (path === '/_parity/optimization') {
      if (request.headers.get('authorization') !== `Bearer ${controlToken}`)
        return new Response(null, { status: 403 });
      if (request.method !== 'POST') return new Response(null, { status: 405 });
      // Model persisted required-engine settings even when this process lacks the adapter.
      harness.sqlite
        .query("UPDATE project SET schedule_engine='optimized',optimization_enabled=1 WHERE id=?")
        .run(successor.projectId);
      if (process.env['MCP_PARITY_OPTIMIZER'] === 'installed') {
        harness.triggerOptimization(successor.projectId);
        await harness.drainOptimization();
      }
      return Response.json({ prepared: true });
    }
    if (new URL(request.url).pathname === '/_parity/state') {
      if (request.headers.get('authorization') !== `Bearer ${controlToken}`)
        return new Response(null, { status: 403 });
      const sqlite = harness.sqlite;
      return Response.json({
        pushes,
        predecessorAuthored: sqlite
          .query('SELECT name,notes,priority,readiness FROM work_item WHERE id=?')
          .get(predecessor.workItemId),
        relationship: sqlite.query('SELECT * FROM external_dependency').get(),
        journal: sqlite
          .query(
            'SELECT preconditions,payload FROM command_journal WHERE project_id=? ORDER BY seq DESC LIMIT 1',
          )
          .get(successor.projectId),
        staged: sqlite
          .query(
            "SELECT id,project_id AS projectId,revision FROM work_item WHERE name='Staged successor'",
          )
          .get(),
        localRelationships: sqlite.query('SELECT * FROM typed_dependency').all(),
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
    releaseWriter?.();
    WriteCoordinator.prototype.enter = enter;
    await backend.stop(true);
    await harness.closeComposed();
    process.exit(0);
  })();
});
console.log(
  JSON.stringify({ port: backend.port, key: credential.key, controlToken, predecessor, successor }),
);
