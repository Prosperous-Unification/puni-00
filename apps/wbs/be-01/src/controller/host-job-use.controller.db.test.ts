import { createHash } from 'node:crypto';

import { readWorkPackageResources, resourceRuntimeEvent, validateSchema } from '@wbs/contracts';
import { computeProvidersOver } from '@wbs/store-sqlite';
import { openConnection } from '@wbs/store-sqlite/db';
import { WriteCoordinator } from '@wbs/store-sqlite/gate';
import { afterEach, beforeAll, beforeEach, expect, it } from 'bun:test';

import {
  addAgentPerson,
  grantCredential,
  issueApiKey,
} from '../testing/machine-credential-fixture';
import { callForwarded, forwardingMachineGrants } from '../testing/mcp-forwarded-call';
import { type HarnessMachineGrants, OrganizationHarness } from '../testing/organization-harness';
import { createFixturePackage } from '../testing/space-rollup';

let machineGrants: HarnessMachineGrants;
let h: OrganizationHarness;
let workPackageId: string;
let leaf: string;
let ram: string;
let providerId: string;
let runtimeKey: string;
let runtimeCredentialId: string;
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
  h.member('org-a', 'owner', 'super_admin', ['org-super-admin']);
  h.member('org-a', 'viewer', 'viewer', ['org-viewer']);
  h.bind('owner', 'org-a');
  h.bind('viewer', 'org-a');
  h.activate();
  workPackageId = await createFixturePackage(h, 'owner', 'Gates');
  const created = await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/commands`, {
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
  runtimeCredentialId = issued.id;
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
    launcherSha: null,
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
            locator: `dash-host-job-run://h2puni/${useId}`,
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
  const answer = await h.call('viewer', 'GET', `/api/work-packages/${workPackageId}/resources`);
  expect(answer.status).toBe(200);
  const [success] = readWorkPackageResources.responses;
  const parsed = await validateSchema(success.schema, answer.body);
  if (parsed.issues !== undefined)
    throw new Error(`the resources read failed its contract: ${JSON.stringify(parsed.issues)}`);
  const resources = (answer.body as { resources: { id: string; hostJobs?: unknown }[] }).resources;
  return resources.find((each) => each.id === ram)?.hostJobs;
}

it('work packages two gates with no planning link beside the resource, until each is returned', async () => {
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
      locator: `dash-host-job-run://h2puni/${first}`,
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

it('keeps a deleted work package from stranding a linked host job', async () => {
  const useId = crypto.randomUUID();
  const linked = gateUse('gate linked', {
    workPackageId,
    workItemId: leaf,
    responsiblePersonId: 'runtime-controller',
  });
  expect((await publish(hostJobEvent(1, useId, 'registered', linked))).status).toBe(200);
  expect(
    (
      await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/commands`, {
        commands: [{ kind: 'deleteWorkItem', workItemId: leaf }],
      })
    ).status,
  ).toBe(200);
  // Work package deletion has no public route in this increment; mirror the orphan-history fixture.
  h.sqlite.run('DELETE FROM work_package_access WHERE work_package_id=?', [workPackageId]);
  h.sqlite.run('DELETE FROM work_package WHERE id=?', [workPackageId]);
  expect(await publish(hostJobEvent(2, useId, 'release_verified', linked))).toEqual({
    status: 200,
    body: { acceptedSequence: 2, useId, revision: 2 },
  });
});

it('accepts a v1 use byte for byte beside the variant', async () => {
  grantCredential(
    h.sqlite,
    'org-a',
    runtimeCredentialId,
    'package-contributor',
    'work_package',
    workPackageId,
  );
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
      workPackageId,
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
  ).toBe(JSON.stringify({ schemaVersion: 2, use: v1.use }));
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
          workPackageId,
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
  // A registration never carries settlement evidence, a request, or a later revision.
  const fresh = crypto.randomUUID();
  const withEvidence = hostJobEvent(2, fresh, 'release_verified', use);
  expect(
    (
      await publish({
        ...hostJobEvent(2, fresh, 'registered', use),
        evidence: withEvidence.evidence,
      })
    ).status,
  ).toBe(400);
  expect((await publish(hostJobEvent(2, fresh, 'registered', use, { revision: 2 }))).status).toBe(
    409,
  );
  expect((await publish(hostJobEvent(2, fresh, 'registered', use, { requestId: 1 }))).status).toBe(
    409,
  );
  // A return of another incarnation, or carrying a request.
  expect(
    (
      await publish(
        hostJobEvent(2, useId, 'release_verified', use, { incarnation: 'another-incarnation' }),
      )
    ).status,
  ).toBe(409);
  expect(
    (await publish(hostJobEvent(2, useId, 'release_verified', use, { requestId: 1 }))).status,
  ).toBe(409);
  expect(
    h.sqlite
      .query<{ accepted_sequence: number }, [string]>(
        'SELECT accepted_sequence FROM resource_authority WHERE authority_id=?',
      )
      .get(authorityId),
  ).toEqual({ accepted_sequence: 1 });
  // Another authority cannot return this authority's job.
  const otherProvider = await h.call('owner', 'POST', '/api/organization/compute-providers', {
    kind: 'ssh_host',
    name: 'h4claw',
    locator: 'puni1@h4claw',
  });
  addAgentPerson(h.sqlite, 'runtime-controller-b', 'org-a', h.userId('owner'));
  const otherKey = await issueApiKey(h.sqlite, {
    organizationId: 'org-a',
    personId: 'runtime-controller-b',
    issuedBy: h.userId('owner'),
    name: 'runtime-key-b',
  });
  expect(
    (
      await h.call('owner', 'PUT', '/api/organization/resource-authorities/dash-h4claw', {
        providerId: (otherProvider.body as { id: string }).id,
        credentialId: otherKey.id,
        epoch: 'epoch-one',
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await callForwarded(
        h,
        otherKey.key,
        'PUT',
        '/api/resource-authorities/dash-h4claw/events',
        hostJobEvent(1, useId, 'release_verified', use),
      )
    ).status,
  ).toBe(409);
  expect((await publish(hostJobEvent(2, useId, 'release_verified', use))).status).toBe(200);
  // A host job never takes the id of a worktree use.
  grantCredential(
    h.sqlite,
    'org-a',
    runtimeCredentialId,
    'package-contributor',
    'work_package',
    workPackageId,
  );
  const worktree = crypto.randomUUID();
  expect(
    (
      await publish({
        ...hostJobEvent(3, worktree, 'registered', use),
        use: {
          workPackageId,
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
  ).toBe(200);
  expect((await publish(hostJobEvent(4, worktree, 'registered', use))).status).toBe(409);
});

it("keeps the run record as a returned job's evidence and refuses the ledger-row shape", async () => {
  const useId = crypto.randomUUID();
  const use = gateUse('gate 1a2b3c4');
  expect((await publish(hostJobEvent(1, useId, 'registered', use))).status).toBe(200);
  const returned = hostJobEvent(2, useId, 'release_verified', use);
  // S5-A11's evidence: the ledger row's digest under its `dash-host-job://` locator.
  for (const locator of [
    `dash-host-job://${authorityId}/${useId}/5`,
    // The run record of another host, or of another job.
    `dash-host-job-run://h4claw/${useId}`,
    `dash-host-job-run://h2puni/${crypto.randomUUID()}`,
  ])
    expect(
      (await publish({ ...returned, evidence: { ...returned.evidence, locator } })).status,
    ).toBe(400);
  // A job whose gate never opened has no run record: `not_created`, digesting that absence.
  const absent = `dash-host-job-run://h2puni/${useId} absent`;
  expect(
    (
      await publish({
        ...returned,
        evidence: { ...returned.evidence, disposition: 'not_created', digest: DIGEST },
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
  const digest = createHash('sha256').update(absent).digest('hex');
  expect(
    (
      await publish({
        ...returned,
        evidence: { ...returned.evidence, disposition: 'not_created', digest },
      })
    ).status,
  ).toBe(200);
  expect(
    h.sqlite
      .query<{ evidence: string }, [string]>(
        'SELECT evidence FROM resource_host_job WHERE use_id=?',
      )
      .get(useId),
  ).toEqual({
    evidence: JSON.stringify({
      digest,
      locator: `dash-host-job-run://h2puni/${useId}`,
      disposition: 'not_created',
      reclaimedBytes: null,
    }),
  });
});

for (const format of ['legacy', 'tagged'] as const) {
  it('reads ' + format + ' host-job identity as recorded provider observations', async () => {
    const useId = crypto.randomUUID();
    const use = gateUse('recorded host job');
    expect((await publish(hostJobEvent(1, useId, 'registered', use))).status).toBe(200);
    const retained = JSON.stringify(format === 'legacy' ? use : { schemaVersion: 2, use });
    h.sqlite
      .query('UPDATE resource_host_job SET declaration=? WHERE use_id=?')
      .run(retained, useId);
    expect(await hostJobsOnRam()).toEqual([
      { useId, label: use.label, type: use.type, host: use.host, reservations: use.reservations },
    ]);
    expect(
      h.sqlite
        .query<{ declaration: string }, [string]>(
          'SELECT declaration FROM resource_host_job WHERE use_id=?',
        )
        .get(useId)?.declaration,
    ).toBe(retained);
  });
  for (const corruption of ['encoding', 'shape', 'kind'] as const) {
    it(
      'refuses corrupt ' +
        format +
        ' host-job ' +
        corruption +
        ' before returning provider observations',
      async () => {
        const useId = crypto.randomUUID();
        const use = gateUse('recorded host job');
        expect((await publish(hostJobEvent(1, useId, 'registered', use))).status).toBe(200);
        const candidate =
          corruption === 'kind'
            ? {
                ...(format === 'legacy' ? { projectId: workPackageId } : { workPackageId }),
                resourceId: ram,
                workItemId: leaf,
                agentRun: 'run',
                responsiblePersonId: 'runtime-controller',
                locator: '/managed',
                units: 1,
                kind: 'temporary_directory',
                reservedDiskUnits: 1,
                reservedWorkspaceUnits: 1,
              }
            : corruption === 'shape'
              ? { ...use, unexpectedMetadata: true }
              : use;
        const encoded = JSON.stringify(
          format === 'legacy' ? candidate : { schemaVersion: 2, use: candidate },
        );
        const retained = corruption === 'encoding' ? ' ' + encoded : encoded;
        h.sqlite
          .query('UPDATE resource_host_job SET declaration=? WHERE use_id=?')
          .run(retained, useId);
        const before = h.sqlite.query('SELECT * FROM resource_host_job ORDER BY rowid').all();
        expect(
          (await h.call('viewer', 'GET', '/api/work-packages/' + workPackageId + '/resources'))
            .status,
        ).toBe(500);
        expect(h.sqlite.query('SELECT * FROM resource_host_job ORDER BY rowid').all()).toEqual(
          before,
        );
        const connection = openConnection(h.databasePath());
        let failure: unknown;
        try {
          await computeProvidersOver(connection.db, new WriteCoordinator()).reports.readingsOf([
            ram,
          ]);
        } catch (cause) {
          failure = cause;
        } finally {
          connection.close();
        }
        expect(failure).toBeInstanceOf(Error);
        if (corruption === 'kind')
          expect(failure).toMatchObject({
            message: 'stored host-job declaration is not a host job',
          });
      },
    );
  }
}
