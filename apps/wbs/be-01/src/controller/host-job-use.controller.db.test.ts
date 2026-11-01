import { readProjectResources, resourceRuntimeEvent, validateSchema } from '@wbs/contracts';
import { afterEach, beforeAll, beforeEach, expect, it } from 'bun:test';

import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import { callForwarded, forwardingMachineGrants } from '../testing/mcp-forwarded-call';
import { type HarnessMachineGrants, OrganizationHarness } from '../testing/organization-harness';

let machineGrants: HarnessMachineGrants;
let h: OrganizationHarness;
let projectId: string;
let leaf: string;
let ram: string;
let providerId: string;
let runtimeKey: string;
const authorityId = 'dash-h2puni';
const eventsPath = `/api/resource-authorities/${authorityId}/events`;
const DIGEST = 'a'.repeat(64);

beforeAll(async () => {
  machineGrants = await forwardingMachineGrants();
});
/**
 * Host jobs as `resourceRuntimeUse` v2 (`dash-host-jobs` J10, task 5.2) over be-01's production
 * composition and real SQLite: the runtime controller's key reaches be-01 through mcp-01's
 * forwarded grant, as Dash's outbox does.
 */
beforeEach(async () => {
  h = OrganizationHarness.openComposedWith({ machineGrants });
  for (const username of ['owner', 'viewer']) await h.register(username);
  h.organization('org-a');
  h.member('org-a', 'owner', 'super_admin');
  h.member('org-a', 'viewer', 'viewer');
  h.bind('owner', 'org-a');
  h.bind('viewer', 'org-a');
  h.activate();
  const project = await h.call('owner', 'POST', '/api/projects', { name: 'Gates' });
  projectId = (project.body as { project: { id: string } }).project.id;
  const created = await h.call('owner', 'POST', `/api/projects/${projectId}/commands`, {
    commands: [{ kind: 'createWorkItem', parentId: null, name: 'Leaf' }],
  });
  leaf = (created.body as { results: { id: string }[] }).results[0].id;
  const provider = await h.call('owner', 'POST', '/api/organization/compute-providers', {
    kind: 'ssh_host',
    name: 'h2puni',
    locator: 'puni1@h2puni',
  });
  providerId = (provider.body as { id: string }).id;
  const resource = await h.call('owner', 'POST', '/api/directory/commands', {
    commands: [
      { kind: 'createResource', name: 'h2puni ram', resourceKind: 'divisible', unitLabel: 'GiB' },
    ],
  });
  ram = (resource.body as { results: { id: string }[] }).results[0].id;
  expect(
    (
      await h.call('owner', 'POST', '/api/directory/commands', {
        commands: [{ kind: 'patchResource', resourceId: ram, patch: { providerId } }],
      })
    ).status,
  ).toBe(200);
  addAgentPerson(h.sqlite, 'runtime-controller', 'org-a', h.userId('owner'));
  const issued = await issueApiKey(h.sqlite, {
    organizationId: 'org-a',
    personId: 'runtime-controller',
    issuedBy: h.userId('owner'),
    name: 'runtime-key',
  });
  runtimeKey = issued.key;
  expect(
    (
      await h.call('owner', 'PUT', `/api/organization/resource-authorities/${authorityId}`, {
        providerId,
        credentialId: issued.id,
        epoch: 'epoch-one',
      })
    ).status,
  ).toBe(200);
});
afterEach(async () => h.closeComposed());

/** A gate's host job use as Dash's outbox declares it: no planning link. */
function gateUse(label: string, links: Record<string, string> = {}) {
  return {
    kind: 'host_job',
    ...links,
    type: 'puni-00-gate',
    label,
    host: 'h2puni',
    payloadSha: null,
    reservations: [
      { dimension: 'cpuCores', units: 4 },
      { dimension: 'memoryGib', units: 6 },
      { dimension: 'tmpDiskGib', units: 20 },
      { dimension: 'gate_tree', units: 1 },
    ],
  };
}

function hostJobEvent(
  sequence: number,
  useId: string,
  kind: 'registered' | 'release_verified',
  use: ReturnType<typeof gateUse>,
  extra: Record<string, unknown> = {},
) {
  return {
    eventId: crypto.randomUUID(),
    epoch: 'epoch-one',
    sequence,
    useId,
    incarnation: `${useId}-incarnation`,
    revision: kind === 'registered' ? 1 : 2,
    kind,
    observedAt: Date.now() - 1000,
    reason: kind === 'registered' ? 'admitted by the host pool' : 'every entry returned',
    use,
    ...(kind === 'release_verified'
      ? {
          evidence: {
            digest: DIGEST,
            locator: `dash-host-job://${authorityId}/${useId}/5`,
            disposition: 'returned',
            reclaimedBytes: null,
          },
        }
      : {}),
    ...extra,
  };
}

function publish(body: unknown) {
  return callForwarded(h, runtimeKey, 'PUT', eventsPath, body);
}

async function hostJobsOnRam(): Promise<unknown> {
  const answer = await h.call('viewer', 'GET', `/api/projects/${projectId}/resources`);
  expect(answer.status).toBe(200);
  const [success] = readProjectResources.responses;
  const parsed = await validateSchema(success.schema, answer.body);
  if (parsed.issues !== undefined)
    throw new Error(`the resources read failed its contract: ${JSON.stringify(parsed.issues)}`);
  const resources = (answer.body as { resources: { id: string; hostJobs?: unknown }[] }).resources;
  return resources.find((each) => each.id === ram)?.hostJobs;
}

it('projects two gates with no planning link beside the resource, until each is returned', async () => {
  const first = crypto.randomUUID();
  const second = crypto.randomUUID();
  expect(await publish(hostJobEvent(1, first, 'registered', gateUse('gate 1a2b3c4')))).toEqual({
    status: 200,
    body: { acceptedSequence: 1, useId: first, revision: 1 },
  });
  expect(
    (await publish(hostJobEvent(2, second, 'registered', gateUse('gate 5d6e7f8')))).status,
  ).toBe(200);
  expect(await hostJobsOnRam()).toEqual([
    {
      useId: first,
      label: 'gate 1a2b3c4',
      type: 'puni-00-gate',
      host: 'h2puni',
      reservations: gateUse('').reservations,
    },
    {
      useId: second,
      label: 'gate 5d6e7f8',
      type: 'puni-00-gate',
      host: 'h2puni',
      reservations: gateUse('').reservations,
    },
  ]);
  expect(
    (await publish(hostJobEvent(3, first, 'release_verified', gateUse('gate 1a2b3c4')))).status,
  ).toBe(200);
  expect(await hostJobsOnRam()).toMatchObject([{ useId: second }]);
  expect(
    h.sqlite
      .query<{ state: string; evidence: string | null }, [string]>(
        'SELECT state, evidence FROM resource_host_job WHERE use_id=?',
      )
      .get(first),
  ).toEqual({
    state: 'release_verified',
    evidence: JSON.stringify({
      digest: DIGEST,
      locator: `dash-host-job://${authorityId}/${first}/5`,
      disposition: 'returned',
      reclaimedBytes: null,
    }),
  });
  // A resource the authority's instance does not fulfil shows no host job.
  await h.call('owner', 'POST', '/api/directory/commands', {
    commands: [{ kind: 'patchResource', resourceId: ram, patch: { providerId: null } }],
  });
  expect(await hostJobsOnRam()).toBeUndefined();
});

it('keeps a deleted project from stranding a linked host job', async () => {
  const useId = crypto.randomUUID();
  const linked = gateUse('gate linked', {
    projectId,
    workItemId: leaf,
    responsiblePersonId: 'runtime-controller',
  });
  expect((await publish(hostJobEvent(1, useId, 'registered', linked))).status).toBe(200);
  expect(
    (
      await h.call('owner', 'POST', `/api/projects/${projectId}/commands`, {
        commands: [{ kind: 'deleteWorkItem', workItemId: leaf }],
      })
    ).status,
  ).toBe(200);
  // Project deletion has no public route in this increment; mirror the orphan-history fixture.
  h.sqlite.run('DELETE FROM project_access WHERE project_id=?', [projectId]);
  h.sqlite.run('DELETE FROM step WHERE project_id=?', [projectId]);
  h.sqlite.run('DELETE FROM project WHERE id=?', [projectId]);
  expect(await publish(hostJobEvent(2, useId, 'release_verified', linked))).toEqual({
    status: 200,
    body: { acceptedSequence: 2, useId, revision: 2 },
  });
});

it('accepts a v1 use byte for byte beside the variant', async () => {
  const v1 = {
    eventId: crypto.randomUUID(),
    epoch: 'epoch-one',
    sequence: 1,
    useId: crypto.randomUUID(),
    incarnation: 'incarnation-one',
    revision: 1,
    kind: 'registered',
    observedAt: Date.now() - 1000,
    reason: 'Created managed checkout',
    use: {
      projectId,
      resourceId: ram,
      workItemId: leaf,
      agentRun: 'run-a',
      responsiblePersonId: 'runtime-controller',
      locator: '/enrolled/managed',
      units: 3,
      kind: 'temporary_directory',
      reservedDiskUnits: 3,
      reservedWorkspaceUnits: 1,
    },
  };
  expect(JSON.stringify(resourceRuntimeEvent.assert(structuredClone(v1)))).toBe(JSON.stringify(v1));
  expect((await publish(v1)).status).toBe(200);
  expect(
    h.sqlite
      .query<{ declaration: string }, [string]>(
        'SELECT declaration FROM resource_runtime_use WHERE use_id=?',
      )
      .get(v1.useId)?.declaration,
  ).toBe(JSON.stringify(v1.use));
  expect(await hostJobsOnRam()).toBeUndefined();
});

it('refuses what a host job cannot be, accepting nothing and advancing no sequence', async () => {
  const useId = crypto.randomUUID();
  const use = gateUse('gate 1a2b3c4');
  // Never admitted by WBS: the admission contract takes a v1 use only.
  expect(
    (
      await callForwarded(
        h,
        runtimeKey,
        'PUT',
        `/api/resource-authorities/${authorityId}/admissions`,
        {
          eventId: crypto.randomUUID(),
          epoch: 'epoch-one',
          useId,
          incarnation: 'i',
          observedAt: Date.now(),
          reason: 'admit me',
          use,
        },
      )
    ).status,
  ).toBe(400);
  // Returned before it was registered.
  expect((await publish(hostJobEvent(1, useId, 'release_verified', use))).status).toBe(409);
  expect((await publish(hostJobEvent(1, useId, 'registered', use))).status).toBe(200);
  // Registered twice under another event id.
  expect((await publish(hostJobEvent(2, useId, 'registered', use))).status).toBe(409);
  // A host job's only lifecycle events are registered and returned.
  expect(
    (await publish(hostJobEvent(2, useId, 'registered', use, { kind: 'blocked' }))).status,
  ).toBe(400);
  // Returned with a v1 disposition, or without evidence.
  const removed = hostJobEvent(2, useId, 'release_verified', use);
  expect(
    (await publish({ ...removed, evidence: { ...removed.evidence, disposition: 'removed' } }))
      .status,
  ).toBe(400);
  expect((await publish({ ...removed, evidence: undefined })).status).toBe(400);
  // Returned with a drifted declaration.
  expect(
    (await publish(hostJobEvent(2, useId, 'release_verified', gateUse('another label')))).status,
  ).toBe(409);
  // A v1 use never claims `returned`.
  const v1Release = hostJobEvent(2, crypto.randomUUID(), 'release_verified', use);
  expect(
    (
      await publish({
        ...v1Release,
        use: {
          projectId,
          resourceId: ram,
          workItemId: leaf,
          agentRun: 'run-a',
          responsiblePersonId: 'runtime-controller',
          locator: '/enrolled/managed',
          units: 3,
          kind: 'temporary_directory',
          reservedDiskUnits: 3,
          reservedWorkspaceUnits: 1,
        },
      })
    ).status,
  ).toBe(400);
  expect(
    h.sqlite
      .query<{ accepted_sequence: number }, [string]>(
        'SELECT accepted_sequence FROM resource_authority WHERE authority_id=?',
      )
      .get(authorityId),
  ).toEqual({ accepted_sequence: 1 });
  expect((await publish(hostJobEvent(2, useId, 'release_verified', use))).status).toBe(200);
});
