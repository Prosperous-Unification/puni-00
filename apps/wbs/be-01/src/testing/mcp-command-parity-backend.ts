import { MCP_INTERNAL_SECRET_HEADER } from '@wbs/contracts';
import { WriteCoordinator } from '@wbs/store-sqlite/gate';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';

import { openDatabase } from '../repository/db';
import { addAgentPerson, grantCredential, issueApiKey } from './machine-credential-fixture';
import { TEST_MACHINE_GRANT_ENV } from './machine-grant-fixture';
import { forwardingMachineGrants, requestGrant } from './mcp-forwarded-call';
import { OrganizationHarness } from './organization-harness';

function requireOk(reply: { status: number }): void {
  if (reply.status !== 200) throw new Error(`fixture request failed: ${String(reply.status)}`);
}
const pushes: string[] = [];
const harness = OrganizationHarness.openComposedWith({
  now: () => 1_792_368_000_000,
  machineGrants: await forwardingMachineGrants(),
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
harness.member('org-a', 'ada', 'super_admin', ['org-super-admin']);
harness.bind('ada', 'org-a');
harness.activate();
const endpoints = [];
for (const name of ['Predecessor', 'Successor']) {
  const parent = await harness.call('ada', 'POST', '/api/projects', { name: name + ' parent' });
  if (parent.status !== 201) throw new Error('parity project creation refused', { cause: parent });
  const projectId = (parent.body as { project: { id: string } }).project.id;
  for (const [position, label] of ['Dev', 'QA'].entries()) {
    const bound = await harness.call('ada', 'POST', '/api/organization/step-bindings', {
      scopeKind: 'project',
      scopeId: projectId,
      workItemTypeId: null,
      position,
      define: {
        name: name + ' ' + label,
        code: name.toLowerCase() + '-' + label.toLowerCase(),
        position,
        defaultEstimateUnit: 'workdays',
        defaultAllowanceBps: 0,
      },
    });
    if (bound.status !== 201) throw new Error('parity step binding refused', { cause: bound });
  }
  const created = await harness.call('ada', 'POST', '/api/work-packages', { name, projectId });
  requireOk(created);
  const { steps } = created.body as { steps: { id: string }[] };
  if (steps.length !== 2) throw new Error('parity package did not inherit its two steps');
  const workPackage = harness.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM work_package WHERE name=?')
    .get(name);
  if (workPackage === null) throw new Error('fixture work package missing');
  requireOk(
    await harness.call('ada', 'POST', `/api/work-packages/${workPackage.id}/commands`, {
      commands: [{ kind: 'createWorkItem', name }],
    }),
  );
  const row = harness.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE work_package_id=?')
    .get(workPackage.id);
  if (row === null) throw new Error('fixture row missing');
  harness.sqlite
    .query(
      "UPDATE work_package SET start_date='2026-10-19', estimate_method='realistic', estimate_rounding='exact' WHERE id=?",
    )
    .run(workPackage.id);
  harness.sqlite.query("UPDATE work_item SET readiness='ready' WHERE id=?").run(row.id);
  for (const step of steps)
    harness.sqlite
      .query(
        'INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES (?,?,1,1,1)',
      )
      .run(row.id, step.id);
  endpoints.push({
    workPackageId: workPackage.id,
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

grantCredential(
  harness.sqlite,
  'org-a',
  credential.id,
  'project-contributor',
  'organization',
  'org-a',
);
const issued = await requestGrant(
  harness,
  { kind: 'api_key', key: credential.key },
  { now: 1_792_368_000_000 },
);
requireOk(issued);
// The successful production grant route supplies this fixture's signed grant and identity.
const grant = (await issued.json()) as { grant: string };
requireOk(
  await harness.callWith(
    grant.grant,
    'GET',
    `/api/work-packages/${successor.workPackageId}/work-items`,
    undefined,
    {
      [MCP_INTERNAL_SECRET_HEADER]: TEST_MACHINE_GRANT_ENV['MCP_BE_INTERNAL_SECRET'],
    },
  ),
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
          harness.member('org-a', 'owner', 'member', ['project-contributor']);
          grantCredential(
            harness.sqlite,
            'org-a',
            credential.id,
            'package-viewer',
            'work_package',
            predecessor.workPackageId,
          );
          harness.sqlite.transaction(() => {
            harness.sqlite.run('UPDATE work_package SET restricted=1 WHERE id=?', [
              predecessor.workPackageId,
            ]);
            for (const endpoint of [predecessor, successor]) {
              const changed = harness.sqlite.run(
                "UPDATE access_grant SET subject_id=? WHERE scope_kind='work_package' AND scope_id=? AND subject_kind='user' AND subject_id=? AND role_id='package-manager' AND origin='creation'",
                [harness.userId('owner'), endpoint.workPackageId, harness.userId('ada')],
              );
              if (changed.changes !== 1) throw new Error('parity direct package grant absent');
            }
          })();
          break;
        }
        case 'write-predecessor':
          grantCredential(
            harness.sqlite,
            'org-a',
            credential.id,
            'package-contributor',
            'work_package',
            predecessor.workPackageId,
          );
          break;
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
            else {
              grantCredential(
                separate,
                'org-a',
                credential.id,
                'package-viewer',
                'work_package',
                successor.workPackageId,
              );
              separate.run('UPDATE work_package SET restricted=1 WHERE id=?', [
                successor.workPackageId,
              ]);
            }
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
    if (path === '/_parity/work-package-settings') {
      if (request.headers.get('authorization') !== `Bearer ${controlToken}`)
        return new Response(null, { status: 403 });
      if (request.method !== 'POST') return new Response(null, { status: 405 });
      const { workPackageId, patch } = (await request.json()) as {
        workPackageId: string;
        patch: unknown;
      };
      return Response.json(
        await harness.call('ada', 'PATCH', `/api/work-packages/${workPackageId}`, patch),
      );
    }
    if (path === '/_parity/optimization') {
      if (request.headers.get('authorization') !== `Bearer ${controlToken}`)
        return new Response(null, { status: 403 });
      if (request.method !== 'POST') return new Response(null, { status: 405 });
      // Model persisted required-engine settings even when this process lacks the adapter.
      harness.sqlite
        .query(
          "UPDATE work_package SET schedule_engine='optimized',optimization_enabled=1 WHERE id=?",
        )
        .run(successor.workPackageId);
      if (process.env['MCP_PARITY_OPTIMIZER'] === 'installed') {
        harness.triggerOptimization(successor.workPackageId);
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
            'SELECT preconditions,payload FROM command_journal WHERE work_package_id=? ORDER BY seq DESC LIMIT 1',
          )
          .get(successor.workPackageId),
        staged: sqlite
          .query(
            "SELECT id,work_package_id AS workPackageId,revision FROM work_item WHERE name='Staged successor'",
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
  JSON.stringify({
    port: backend.port,
    grant,
    secret: TEST_MACHINE_GRANT_ENV['MCP_BE_INTERNAL_SECRET'],
    controlToken,
    predecessor,
    successor,
  }),
);
