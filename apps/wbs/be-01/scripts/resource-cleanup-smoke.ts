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

import { resourceUse, resourceUseEvent } from '@wbs/contracts';
import { type } from 'arktype';

// Proof: Nx rejected this cross-application import too; the smoke composes Dash's tool port.
// eslint-disable-next-line @nx/enforce-module-boundaries
import type {
  ToolAnswer,
  WbsTools,
} from '../../../twilight-structure/twilight-dash/cli/src/mcp/wbs-tools';
// Proof: Nx rejected this cross-application import; this executable smoke intentionally composes the real WBS and Dash applications.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  linuxHostFacts,
  loadResourceConfiguration,
  ResourceRuntime,
} from '../../../twilight-structure/twilight-dash/cli/src/resources/runtime';
import { addAgentPerson, issueApiKey } from '../src/testing/machine-credential-fixture';
import { callForwarded, forwardingMachineGrants } from '../src/testing/mcp-forwarded-call';
import { OrganizationHarness } from '../src/testing/organization-harness';

/** Real destructive cleanup is confined to a disposable PID namespace and a fresh temporary root.
 * Dash's runtime calls WBS's tools (`wbs-mcp-agent-surface` M9): each call here is be-01's half
 * of what mcp-01 forwards ({@link callForwarded}), read back as mcp-01 reports it.
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
/** The runtime routes by tool name, as mcp-01 derives them. */
const RUNTIME_ROUTES = new Map<string, readonly ['GET' | 'PUT', string]>([
  ['putApiResourceAuthoritiesByAuthorityIdAdmissions', ['PUT', 'admissions']],
  ['putApiResourceAuthoritiesByAuthorityIdEvents', ['PUT', 'events']],
  ['getApiResourceAuthoritiesByAuthorityIdCleanupRequests', ['GET', 'cleanup-requests']],
]);
const errorCode = type({ error: 'string' });
const EVENT_TOOL = 'putApiResourceAuthoritiesByAuthorityIdEvents';
const h = OrganizationHarness.openComposedWith({ machineGrants: await forwardingMachineGrants() });

/**
 * Dash's tool port over be-01's forwarded machine grant for `key`: a 2xx is relayed, a
 * `401 unknown_identity` is mcp-01's `machine_credential_refused`, any other 4xx a refusal.
 */
function forwardedTools(key: string): WbsTools {
  return {
    async call(name, input): Promise<ToolAnswer> {
      const route = RUNTIME_ROUTES.get(name);
      if (route === undefined) throw new Error(`the smoke serves no tool ${name}`);
      const [method, leaf] = route;
      const { authorityId, after, limit, ...body } = input;
      const query = method === 'GET' ? `?after=${String(after)}&limit=${String(limit)}` : '';
      const answer = await callForwarded(
        h,
        key,
        method,
        `/api/resource-authorities/${encodeURIComponent(String(authorityId))}/${leaf}${query}`,
        method === 'GET' ? undefined : body,
      );
      if (answer.status >= 200 && answer.status < 300)
        return { kind: 'answered', body: answer.body };
      const code = errorCode(answer.body);
      const error = code instanceof type.errors ? null : code.error;
      console.error(
        JSON.stringify({ phase: 'transport refusal', tool: name, status: answer.status, error }),
      );
      if (answer.status === 401 && error === 'unknown_identity')
        return { kind: 'not_called', reason: 'machine_credential_refused' };
      return { kind: 'refused', status: answer.status, error, body: answer.body };
    },
    close: () => Promise.resolve(),
  };
}

/** `tools`, whose first call of `name` throws `lost` after WBS has answered it. */
function losingFirstAnswer(tools: WbsTools, name: string, lost: string): WbsTools {
  let thrown = false;
  return {
    async call(called, input) {
      const reply = await tools.call(called, input);
      if (!thrown && called === name) {
        thrown = true;
        assert.equal(reply.kind, 'answered');
        throw new Error(lost);
      }
      return reply;
    },
    close: () => Promise.resolve(),
  };
}

/** A WBS that answers nothing. */
const unreachable: WbsTools = {
  call: () => Promise.reject(new Error('simulated WBS outage')),
  close: () => Promise.resolve(),
};
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
      schemaVersion: 3,
      root,
      authorityId,
      epoch,
      providerId,
      mcpResource: 'http://localhost/mcp',
      credential: issued.key,
      diskUnitBytes: 1024,
      diskBudgetUnits: 2,
      workspaceSlots: 2,
      headroomBytes: 0,
      cpuCores: 1,
      memoryGib: 1,
      headroom: { cpuCores: 0, memoryGib: 0 },
      exclusiveUnits: {},
      enrollmentId: 'enrollment-one',
    }),
    { mode: 0o600 },
  );
  runtime = ResourceRuntime.initialize(
    loadResourceConfiguration(config),
    {
      read: () => Date.now(),
    },
    linuxHostFacts,
  );
  const send = forwardedTools(issued.key);
  const use = await runtime.create(
    {
      projectId,
      resourceId,
      workItemId,
      agentRun: 'proof-run',
      responsiblePersonId: 'runtime-agent',
      units: 1,
      diskUnits: 1,
      kind: 'temporary_directory',
    },
    send,
  );
  writeFileSync(join(use.locator, 'disposable-output'), 'proof output');
  await assert.rejects(
    runtime.synchronize(losingFirstAnswer(send, EVENT_TOOL, 'simulated acknowledgement loss')),
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
  await assert.rejects(runtime.synchronize(unreachable), /WBS outage/);
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
  // Local release can race an already queued WBS request. Its acknowledgment must reuse
  // the complete durable proof through restart and an accepted-but-lost response.
  const raced = await runtime.create({ ...use.request, agentRun: 'terminal-race' }, send);
  await runtime.synchronize(send);
  const racedPath = `${path}/${raced.id}`;
  assert.equal(
    (
      await h.call('owner', 'POST', `${racedPath}/events`, {
        eventId: crypto.randomUUID(),
        expectedRevision: 1,
        kind: 'cleanup_requested',
        reason: 'Queued before local completion',
      })
    ).status,
    200,
  );
  runtime.requestCleanup(raced.id, raced.revision, raced.incarnation, 'local completion');
  runtime.sweep();
  const original = runtime
    .outbox()
    .find((event) => event.useId === raced.id && event.kind === 'release_verified');
  assert.ok(original?.evidence);
  assert.equal(existsSync(raced.locator), false);
  await runtime.synchronize(send);
  runtime.close();
  runtime = ResourceRuntime.open(loadResourceConfiguration(config), { read: () => retryClock });
  const acknowledgment = runtime.outbox().find((event) => event.useId === raced.id);
  assert.deepEqual(acknowledgment?.evidence, original.evidence);
  // A replacement canary proves terminal acknowledgment performs no second removal.
  mkdirSync(raced.locator);
  writeFileSync(join(raced.locator, 'replacement'), 'must remain');
  await assert.rejects(
    runtime.synchronize(losingFirstAnswer(send, EVENT_TOOL, 'terminal acknowledgment loss')),
    /terminal acknowledgment loss/,
  );
  runtime.close();
  runtime = ResourceRuntime.open(loadResourceConfiguration(config), { read: () => retryClock });
  await runtime.synchronize(send);
  runtime.sweep();
  assert.equal(runtime.outbox().length, 0);
  assert.equal(runtime.inspect(raced.id).releasedDiskUnits, 1);
  assert.equal(runtime.inspect(raced.id).releasedWorkspaceUnits, 1);
  assert.equal(existsSync(join(raced.locator, 'replacement')), true);
  const racedProjection = uses
    .assert((await h.call('owner', 'GET', path)).body)
    .uses.find((entry) => entry.id === raced.id);
  assert.equal(racedProjection?.pendingCleanupRequest, false);
  assert.equal(
    historyResponse
      .assert((await h.call('owner', 'GET', `${racedPath}/history`)).body)
      .events.filter((event) => event.kind === 'release_verified').length,
    2,
  );
  // Admission must preserve authorization before task deletion and first source publication.
  const delayed = await runtime.create(
    { ...use.request, agentRun: 'deleted-before-publication' },
    send,
  );
  runtime.requestCleanup(delayed.id, delayed.revision, delayed.incarnation, 'local completion');
  runtime.sweep();
  assert.equal(runtime.inspect(delayed.id).state, 'released');
  assert.equal(
    (
      await h.call('owner', 'POST', `/api/projects/${projectId}/commands`, {
        commands: [{ kind: 'deleteWorkItem', workItemId }],
      })
    ).status,
    200,
  );
  await runtime.synchronize(send);
  assert.equal(runtime.outbox().length, 0);
  const survivingWork = commandId(
    (
      await h.call('owner', 'POST', `/api/projects/${projectId}/commands`, {
        commands: [{ kind: 'createWorkItem', parentId: null, name: 'Following admission' }],
      })
    ).body,
  );
  const following = await runtime.create(
    { ...use.request, workItemId: survivingWork, agentRun: 'following-use' },
    send,
  );
  runtime.requestCleanup(following.id, following.revision, following.incarnation, 'done');
  runtime.sweep();
  await runtime.synchronize(send);
  assert.equal(runtime.outbox().length, 0);
  // WBS commits admission, then the response is lost and the creator disappears before
  // any source sequence or path exists. Deletion cannot invalidate that original admission.
  await assert.rejects(
    runtime.create(
      { ...use.request, workItemId: survivingWork, agentRun: 'lost-admission' },
      losingFirstAnswer(
        send,
        'putApiResourceAuthoritiesByAuthorityIdAdmissions',
        'admission response lost',
      ),
    ),
    /admission response lost/,
  );
  const uncertain = runtime.list().find((entry) => entry.request.agentRun === 'lost-admission');
  assert.ok(uncertain);
  assert.equal(uncertain.revision, 0);
  assert.equal(existsSync(uncertain.locator), false);
  assert.equal(runtime.outbox().length, 0);
  assert.equal(
    (
      await h.call('owner', 'POST', `${path}/${uncertain.id}/events`, {
        eventId: crypto.randomUUID(),
        expectedRevision: 1,
        kind: 'cleanup_requested',
        reason: 'Cancelled before creation',
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await h.call('owner', 'POST', `/api/projects/${projectId}/commands`, {
        commands: [{ kind: 'deleteWorkItem', workItemId: survivingWork }],
      })
    ).status,
    200,
  );
  runtime.close();
  runtime = ResourceRuntime.open(loadResourceConfiguration(config), {
    read: () => retryClock + 120000,
  });
  runtime.sweep();
  assert.equal(runtime.outbox().length, 0);
  assert.equal(runtime.inspect(uncertain.id).releasedDiskUnits, 0);
  await runtime.synchronize(send);
  runtime.sweep();
  await runtime.synchronize(send);
  assert.equal(runtime.outbox().length, 0);
  assert.equal(runtime.inspect(uncertain.id).state, 'released');
  assert.equal(runtime.inspect(uncertain.id).releasedDiskUnits, 1);
  assert.equal(runtime.list().find((entry) => entry.id === uncertain.id)?.dev, null);
  const neverCreated = historyResponse.assert(
    (await h.call('owner', 'GET', `${path}/${uncertain.id}/history`)).body,
  ).events;
  assert.equal(neverCreated.filter((event) => event.kind === 'registered').length, 1);
  assert.equal(
    uses
      .assert((await h.call('owner', 'GET', path)).body)
      .uses.find((entry) => entry.id === uncertain.id)?.pendingCleanupRequest,
    false,
  );

  // A rejected admission reserves no authority sequence and cannot wedge another use's publication.
  await assert.rejects(
    runtime.create(
      { ...use.request, workItemId: 'never-existed', agentRun: 'rejected-admission' },
      send,
    ),
    /admission HTTP 404/,
  );
  const rejected = runtime.list().find((entry) => entry.request.agentRun === 'rejected-admission');
  assert.ok(rejected);
  assert.equal(rejected.revision, 0);
  assert.equal(existsSync(rejected.locator), false);
  const finalWork = commandId(
    (
      await h.call('owner', 'POST', `/api/projects/${projectId}/commands`, {
        commands: [{ kind: 'createWorkItem', parentId: null, name: 'After refusal' }],
      })
    ).body,
  );
  const independent = await runtime.create(
    { ...use.request, workItemId: finalWork, agentRun: 'independent' },
    send,
  );
  runtime.requestCleanup(
    independent.id,
    independent.revision,
    independent.incarnation,
    'done during outage',
  );
  runtime.sweep();
  assert.equal(runtime.inspect(independent.id).state, 'released');
  await assert.rejects(runtime.synchronize(send), /admission HTTP 404/);
  assert.equal(runtime.outbox().length, 0);
  assert.equal(
    uses
      .assert((await h.call('owner', 'GET', path)).body)
      .uses.find((entry) => entry.id === independent.id)?.state,
    'release_verified',
  );
  assert.equal(runtime.inspect(rejected.id).releasedDiskUnits, 0);
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
      terminalRaceReplay: true,
      admittedDeletionRecovery: true,
      uncertainAdmissionRecovery: true,
      rejectedAdmissionDoesNotBlockStream: true,
    }),
  );
} finally {
  runtime?.close();
  await h.closeComposed();
  rmSync(scratch, { recursive: true, force: true });
}
