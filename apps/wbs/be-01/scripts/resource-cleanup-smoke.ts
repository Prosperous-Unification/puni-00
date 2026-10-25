import assert from 'node:assert/strict';
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resourceRuntimeEvent, resourceUse, resourceUseEvent } from '@wbs/contracts';
import { type } from 'arktype';

// Proof: Nx rejected this cross-application import; this executable smoke intentionally composes the real WBS and Dash applications.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  loadResourceConfiguration,
  ResourceRuntime,
} from '../../../twilight-structure/twilight-dash/cli/src/resources/runtime';
import { addAgentPerson, issueApiKey } from '../src/testing/machine-credential-fixture';
import { OrganizationHarness } from '../src/testing/organization-harness';

/** Real destructive cleanup is confined to a disposable PID namespace and a fresh temporary root.
 * Run: unshare --user --map-root-user --pid --fork --mount-proc bun apps/wbs/be-01/scripts/resource-cleanup-smoke.ts
 */
if (process.pid !== 1)
  throw new Error(
    'Run this smoke in a disposable PID namespace with unshare --user --map-root-user --pid --fork --mount-proc bun',
  );
const projectIdentity = type({ project: { id: 'string' } });
const commandIdentities = type({ results: type({ id: 'string' }).array() });
const identity = type({ id: 'string' });
const uses = type({ uses: resourceUse.array() });
const useResponse = type({ use: resourceUse });
const historyResponse = type({ events: resourceUseEvent.array() });
function commandId(body: unknown): string {
  const first = commandIdentities.assert(body).results.at(0);
  if (first === undefined) throw new Error('Command returned no identity');
  return first.id;
}
function firstUse(body: unknown) {
  const first = uses.assert(body).uses.at(0);
  if (first === undefined) throw new Error('Tracking returned no resource use');
  return first;
}
const h = OrganizationHarness.openComposed();
const scratch = mkdtempSync(join(tmpdir(), 'wbs-dash-roundtrip-'));
let runtime: ResourceRuntime | undefined;
try {
  await h.register('owner');
  h.organization('org-a');
  h.member('org-a', 'owner', 'super_admin');
  h.bind('owner', 'org-a');
  h.activate();
  addAgentPerson(h.sqlite, 'runtime-agent', 'org-a', h.userId('owner'));
  const issued = await issueApiKey(h.sqlite, {
    organizationId: 'org-a',
    personId: 'runtime-agent',
    issuedBy: h.userId('owner'),
  });
  const project = await h.call('owner', 'POST', '/api/projects', {
    name: 'Real cleanup roundtrip',
  });
  assert.equal(project.status, 200);
  const projectId = projectIdentity.assert(project.body).project.id;
  const work = await h.call('owner', 'POST', `/api/projects/${projectId}/commands`, {
    commands: [{ kind: 'createWorkItem', parentId: null, name: 'Disposable proof' }],
  });
  assert.equal(work.status, 200);
  const workItemId = commandId(work.body);
  const resource = await h.call('owner', 'POST', '/api/directory/commands', {
    commands: [
      { kind: 'createResource', name: 'Managed disk', resourceKind: 'divisible', unitLabel: 'KiB' },
    ],
  });
  assert.equal(resource.status, 200);
  const resourceId = commandId(resource.body);
  const provider = await h.call('owner', 'POST', '/api/organization/compute-providers', {
    kind: 'ssh_host',
    name: 'Proof host',
    locator: 'local proof',
  });
  assert.equal(provider.status, 201);
  const providerId = identity.assert(provider.body).id;
  const authorityId = 'proof-runtime';
  const epoch = 'proof-epoch';
  assert.equal(
    (
      await h.call('owner', 'PUT', `/api/organization/resource-authorities/${authorityId}`, {
        providerId,
        credentialId: issued.id,
        epoch,
      })
    ).status,
    200,
  );
  const root = join(scratch, 'managed');
  mkdirSync(root, { mode: 0o700 });
  const config = join(scratch, 'runtime.json');
  writeFileSync(
    config,
    JSON.stringify({
      schemaVersion: 1,
      root,
      authorityId,
      epoch,
      providerId,
      wbsOrigin: 'http://localhost',
      credential: issued.key,
      diskUnitBytes: 1024,
      diskBudgetUnits: 2,
      workspaceSlots: 2,
      headroomBytes: 0,
    }),
    { mode: 0o600 },
  );
  runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), {
    read: () => Date.now(),
  });
  const use = runtime.create({
    projectId,
    resourceId,
    workItemId,
    agentRun: 'proof-run',
    responsiblePersonId: 'runtime-agent',
    units: 1,
    diskUnits: 1,
    kind: 'temporary_directory',
  });
  writeFileSync(join(use.locator, 'disposable-output'), 'proof output');
  const send = async (request: Request) => {
    const metadata =
      request.method === 'PUT' ? resourceRuntimeEvent.assert(await request.clone().json()) : null;
    const reply = await h.app.handle(request);
    if (reply.status !== 200)
      console.error(
        JSON.stringify({
          phase: 'transport refusal',
          kind: metadata?.kind,
          sequence: metadata?.sequence,
          revision: metadata?.revision,
          requestId: metadata?.requestId,
          status: reply.status,
        }),
      );
    return reply;
  };
  let lost = false;
  await assert.rejects(
    runtime.synchronize(async (request) => {
      const reply = await send(request);
      if (!lost && request.method === 'PUT') {
        lost = true;
        assert.equal(reply.status, 200);
        throw new Error('simulated acknowledgement loss');
      }
      return reply;
    }),
    /acknowledgement loss/,
  );
  assert.equal(runtime.outbox().length, 1);
  await runtime.synchronize(send);
  const path = `/api/projects/${projectId}/resource-uses`;
  let projection = await h.call('owner', 'GET', path);
  assert.equal(projection.status, 200);
  assert.equal(firstUse(projection.body).state, 'active');
  const request = await h.call('owner', 'POST', `${path}/${use.id}/events`, {
    eventId: crypto.randomUUID(),
    expectedRevision: 1,
    kind: 'cleanup_requested',
    reason: 'Operator requests real cleanup',
  });
  assert.equal(request.status, 200);
  assert.equal(useResponse.assert(request.body).use.pendingCleanupRequest, true);
  assert.equal(useResponse.assert(request.body).use.state, 'active');
  await runtime.synchronize(send);
  runtime.close();
  let retryClock = Date.now();
  runtime = ResourceRuntime.open(loadResourceConfiguration(config), { read: () => retryClock });
  const heldFile = openSync(join(use.locator, 'disposable-output'), 'r');
  try {
    runtime.sweep();
    assert.equal(runtime.inspect(use.id).state, 'blocked');
    assert.equal(existsSync(use.locator), true);
    assert.equal(runtime.inspect(use.id).releasedDiskUnits, 0);
    await runtime.synchronize(send);
    assert.equal(firstUse((await h.call('owner', 'GET', path)).body).state, 'blocked');
  } finally {
    closeSync(heldFile);
  }
  retryClock += 2000;
  runtime.sweep();
  assert.equal(runtime.inspect(use.id).state, 'released', runtime.inspect(use.id).reason);
  assert.equal(existsSync(use.locator), false);
  assert.equal(runtime.inspect(use.id).releasedDiskUnits, 1);
  await assert.rejects(
    runtime.synchronize(() => Promise.reject(new Error('simulated WBS outage'))),
    /WBS outage/,
  );
  assert.ok(runtime.outbox().length >= 1);
  await runtime.synchronize(send);
  await runtime.synchronize(send);
  projection = await h.call('owner', 'GET', path);
  const published = firstUse(projection.body);
  assert.equal(published.state, 'release_verified');
  assert.equal(published.source, 'runtime');
  assert.equal(published.pendingCleanupRequest, false);
  assert.equal(published.reclaimedBytes, null);
  const history = await h.call('owner', 'GET', `${path}/${use.id}/history`);
  assert.equal(history.status, 200);
  assert.equal(
    historyResponse.assert(history.body).events.filter((event) => event.kind === 'release_verified')
      .length,
    1,
  );
  assert.equal(runtime.outbox().length, 0);
  console.log(
    JSON.stringify({
      verified: true,
      physicalPathAbsent: true,
      blockedRetryRecovered: true,
      releasedDiskUnits: 1,
      reclaimedBytes: null,
      wbsState: published.state,
      acknowledgedRequest: !published.pendingCleanupRequest,
      responseLossReplay: true,
      restartRecovery: true,
      outageRecovery: true,
      uniqueReleaseHistory: true,
    }),
  );
} finally {
  runtime?.close();
  await h.closeComposed();
  rmSync(scratch, { recursive: true, force: true });
}
