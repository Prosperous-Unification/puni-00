import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/** Extracts only the real created identity from the actual HTTP fixture response. */
function projectIdOf(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('project' in body))
    throw new Error('move fixture project response is absent');
  const project = body.project;
  if (
    typeof project !== 'object' ||
    project === null ||
    !('id' in project) ||
    typeof project.id !== 'string' ||
    project.id === ''
  )
    throw new Error('move fixture created project identity is absent');
  return project.id;
}

/** The combined creation response, rather than an invented parent/package fixture identity. */
function workPackageIdOf(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('workPackage' in body))
    throw new Error('move fixture combined package response is absent');
  const workPackage = body.workPackage;
  if (
    typeof workPackage !== 'object' ||
    workPackage === null ||
    !('id' in workPackage) ||
    typeof workPackage.id !== 'string' ||
    workPackage.id === ''
  )
    throw new Error('move fixture created package identity is absent');
  return workPackage.id;
}

/** Independent physical tables, including histories and migration/receipt state; no repository-derived oracle. */
function snapshotTables(scope: OrganizationHarness) {
  return scope.sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map(({ name }) => ({
      name,
      rows: scope.sqlite
        .query<Record<string, unknown>, []>('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
        .all()
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    }));
}

function describeFailure(failure: unknown): unknown {
  return failure instanceof Error
    ? { name: failure.name, message: failure.message, stack: failure.stack }
    : { type: typeof failure, value: String(failure) };
}

it('mounts current-authority work-package move with committed revisions and one audit', async () => {
  const evidence = mkdtempSync(join(tmpdir(), 'work-package-move-mounted-'));
  console.info('Mounted work-package move fixture:', evidence);
  const owner: {
    acquisitionAttempted: boolean;
    acquired: boolean;
    close: (() => Promise<void>) | undefined;
    closeAttempts: number;
    closeSettled: boolean;
    databasePath: string | undefined;
  } = {
    acquisitionAttempted: false,
    acquired: false,
    close: undefined,
    closeAttempts: 0,
    closeSettled: false,
    databasePath: undefined,
  };
  let primary: { failure: unknown } | undefined;
  const cleanupFailures: unknown[] = [];
  let phase = 'before-acquisition';
  let moved: unknown;
  writeFileSync(
    join(evidence, 'start.json'),
    JSON.stringify({ startedAt: new Date().toISOString(), phase }),
    { flag: 'wx', mode: 0o600 },
  );
  try {
    phase = 'acquiring-harness';
    owner.acquisitionAttempted = true;
    writeFileSync(
      join(evidence, 'acquisition-attempt.json'),
      JSON.stringify({ attemptedAt: new Date().toISOString(), phase }),
      { flag: 'wx', mode: 0o600 },
    );
    const clock = { at: 100 };
    const scope = OrganizationHarness.openComposedWith({ now: () => clock.at });
    owner.acquired = true;
    owner.close = scope.closeComposed.bind(scope);
    owner.databasePath = scope.databasePath();
    phase = 'real-creation-prerequisites';
    await scope.register('Creator');
    scope.organization('move-org');
    scope.member('move-org', 'Creator', 'member', ['org-super-admin']);
    // This existing native resolver fixture is not actual browser organization selection.
    scope.bind('Creator', 'move-org');
    scope.activate();
    const created = await scope.call('Creator', 'POST', '/api/projects', {
      name: 'Move source',
      workPackage: { name: 'Moving package' },
    });
    expect(created.status).toBe(201);
    const sourceProjectId = projectIdOf(created.body);
    const workPackageId = workPackageIdOf(created.body);
    const target = await scope.call('Creator', 'POST', '/api/projects', { name: 'Move target' });
    expect(target.status).toBe(201);
    const targetProjectId = projectIdOf(target.body);
    const actorId = scope.userId('Creator');
    expect(created.body).toMatchObject({
      project: { id: sourceProjectId, revision: 0, workPackageCount: 1 },
      workPackage: { id: workPackageId, projectId: sourceProjectId, revision: 0 },
    });
    expect(
      scope.sqlite
        .query(
          "SELECT role_id,scope_kind,scope_id,subject_id,origin FROM access_grant WHERE scope_id IN (?,?) AND origin='creation' ORDER BY role_id",
        )
        .all(sourceProjectId, workPackageId),
    ).toEqual([
      {
        role_id: 'package-manager',
        scope_kind: 'work_package',
        scope_id: workPackageId,
        subject_id: actorId,
        origin: 'creation',
      },
      {
        role_id: 'project-manager',
        scope_kind: 'project',
        scope_id: sourceProjectId,
        subject_id: actorId,
        origin: 'creation',
      },
    ]);
    expect((await scope.call('Creator', 'GET', '/api/work-packages/' + workPackageId)).status).toBe(
      200,
    );
    expect((await scope.call('Creator', 'GET', '/api/projects/' + targetProjectId)).status).toBe(
      200,
    );
    const beforePackage = scope.sqlite
      .query<Record<string, unknown>, [string]>('SELECT * FROM work_package WHERE id=?')
      .get(workPackageId);
    if (beforePackage === null) throw new Error('move fixture actual package row is absent');
    expect(beforePackage).toMatchObject({
      project_id: sourceProjectId,
      revision: 0,
      created_by: actorId,
    });
    for (const projectId of [sourceProjectId, targetProjectId])
      expect(scope.sqlite.query('SELECT revision FROM project WHERE id=?').get(projectId)).toEqual({
        revision: 0,
      });
    const before = snapshotTables(scope);
    writeFileSync(join(evidence, 'before.json'), JSON.stringify(before), {
      flag: 'wx',
      mode: 0o600,
    });
    clock.at = 200;
    phase = 'missing-route-owning-assertion';
    const reply = await scope.call(
      'Creator',
      'POST',
      '/api/work-packages/' + workPackageId + '/move',
      {
        projectId: targetProjectId,
      },
    );
    moved = reply;
    expect(reply.status).toBe(200);
    expect(reply.body).toEqual({
      workPackageId,
      projectId: targetProjectId,
      revision: 1,
      sourceProject: { id: sourceProjectId, revision: 1 },
      targetProject: { id: targetProjectId, revision: 1 },
    });
    phase = 'committed-state-assertions';
    expect(scope.sqlite.query('SELECT * FROM work_package WHERE id=?').get(workPackageId)).toEqual({
      ...beforePackage,
      project_id: targetProjectId,
      revision: 1,
      updated_at: 200,
    });
    for (const projectId of [sourceProjectId, targetProjectId])
      expect(
        scope.sqlite.query('SELECT revision,updated_at FROM project WHERE id=?').get(projectId),
      ).toEqual({ revision: 1, updated_at: 200 });
    const audits = scope.sqlite
      .query<
        {
          organization_id: string;
          actor_id: string;
          action: string;
          subject_kind: string;
          subject_id: string;
          detail: string;
          created_at: number;
        },
        []
      >(
        "SELECT organization_id,actor_id,action,subject_kind,subject_id,detail,created_at FROM organization_audit WHERE action='work_package_moved'",
      )
      .all();
    expect(audits).toHaveLength(1);
    const audit = audits.at(0);
    if (audit === undefined) throw new Error('committed move audit is absent');
    const detail: unknown = JSON.parse(audit.detail);
    expect({ ...audit, detail }).toEqual({
      organization_id: 'move-org',
      actor_id: actorId,
      action: 'work_package_moved',
      subject_kind: 'project',
      subject_id: targetProjectId,
      detail: {
        workPackageId,
        fromProjectId: sourceProjectId,
        toProjectId: targetProjectId,
        workPackageRevision: 1,
        sourceProjectRevision: 1,
        targetProjectRevision: 1,
      },
      created_at: 200,
    });
    const after = snapshotTables(scope);
    writeFileSync(join(evidence, 'after.json'), JSON.stringify(after), { flag: 'wx', mode: 0o600 });
    const unchanged = (snapshot: typeof before) =>
      snapshot.filter(
        ({ name }) => !['project', 'work_package', 'organization_audit'].includes(name),
      );
    expect(unchanged(after)).toEqual(unchanged(before));
    phase = 'complete';
  } catch (failure) {
    primary = { failure };
  } finally {
    if (owner.close !== undefined) {
      owner.closeAttempts++;
      try {
        await owner.close();
        owner.closeSettled = true;
      } catch (failure) {
        cleanupFailures.push(failure);
      }
    }
  }
  try {
    writeFileSync(
      join(evidence, 'fixture-custody.json'),
      JSON.stringify(
        {
          endedAt: new Date().toISOString(),
          phase,
          owner: {
            acquisitionAttempted: owner.acquisitionAttempted,
            acquired: owner.acquired,
            closeCaptured: owner.close !== undefined,
            closeAttempts: owner.closeAttempts,
            closeSettled: owner.closeSettled,
            databasePath: owner.databasePath,
            unknownAcquisition: owner.acquisitionAttempted && !owner.acquired,
            unknownCustody: owner.acquired && !owner.closeSettled,
          },
          moved,
          primary: primary === undefined ? null : describeFailure(primary.failure),
          cleanupFailures: cleanupFailures.map(describeFailure),
          qualification:
            'Selected actual Harness close only; no global FD/loan-drain or browser-selection claim. Unknown resources are not repaired or removed here.',
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
  } catch (failure) {
    cleanupFailures.push(failure);
  }
  if (primary !== undefined) {
    if (cleanupFailures.length !== 0)
      throw new AggregateError(
        [primary.failure, ...cleanupFailures],
        'mounted move assertion and cleanup failed; evidence retained at ' + evidence,
        { cause: primary.failure },
      );
    throw primary.failure;
  }
  if (cleanupFailures.length !== 0)
    throw new AggregateError(
      cleanupFailures,
      'mounted move cleanup failed; evidence retained at ' + evidence,
      {
        cause: cleanupFailures[0],
      },
    );
});

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

import { MCP_INTERNAL_SECRET_HEADER } from '@wbs/contracts';
import { AccessDecisionRepository } from '@wbs/store-sqlite/access-decisions';
import { observeCommitted, openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { decodeJwt, generateKeyPair } from 'jose';

import {
  addAgentPerson,
  grantCredential,
  issueApiKey,
} from '../testing/machine-credential-fixture';
import { TEST_MACHINE_GRANT_ENV } from '../testing/machine-grant-fixture';
import { forwardingMachineGrants, requestGrant } from '../testing/mcp-forwarded-call';
import type { Answer, ComposedHarnessOptions } from '../testing/organization-harness';
import { delegationFor, mapUpstream } from '../testing/scim-fixture';

const MOVE_ORGANIZATION = 'move-a';
const FOREIGN_MOVE_ORGANIZATION = 'move-b';
type PhysicalMoveSnapshot = ReturnType<typeof snapshotTables>;
interface MoveFailure {
  failure: unknown;
}
type ObservedMove<T> = { kind: 'returned'; value: T } | { kind: 'threw'; failure: unknown };

/** Tags actual settlement immediately, including a rejection whose reason is undefined. */
function observeMove<T>(pending: Promise<T>): Promise<ObservedMove<T>> {
  return pending.then(
    (value) => ({ kind: 'returned', value }),
    (failure: unknown) => ({ kind: 'threw', failure }),
  );
}

/** Preserves an operation primary separately from independent cleanup failures. */
function throwMoveFailures(
  primary: MoveFailure | undefined,
  secondary: unknown[],
  cleanup: unknown[],
) {
  if (primary !== undefined) {
    if (secondary.length !== 0 || cleanup.length !== 0)
      throw new AggregateError(
        [primary.failure, ...secondary, ...cleanup],
        'mounted move operation and observation failed',
        { cause: primary.failure },
      );
    throw primary.failure;
  }
  if (secondary.length !== 0)
    throw new AggregateError(
      [...secondary, ...cleanup],
      'mounted move operation observation failed',
      { cause: secondary[0] },
    );
  if (cleanup.length !== 0)
    throw new AggregateError(cleanup, 'mounted move cleanup failed', { cause: cleanup[0] });
}

interface MountedMoveOwner {
  evidence: string;
  acquisitionAttempted: boolean;
  acquired: boolean;
  close: (() => Promise<string>) | undefined;
  closeAttempts: number;
  closeSettled: boolean;
  databasePath: string | undefined;
  directoryRetained: boolean | undefined;
  helperCustodyUnknown: boolean;
  phase: string;
  snapshotSequence: number;
}
interface MountedMoveWorld {
  scope: OrganizationHarness;
  owner: MountedMoveOwner;
  clock: { at: number };
  sourceProjectId: string;
  targetProjectId: string;
  workPackageId: string;
  foreignProjectId: string;
  foreignWorkPackageId: string;
  signing: Awaited<ReturnType<typeof generateKeyPair>> | undefined;
  arm: (observer: () => void) => void;
  disarm: () => void;
  callHuman: (username: string, method: string, path: string, body?: unknown) => Promise<Answer>;
  rawHuman: (username: string, path: string, body: string | undefined) => Promise<Response>;
  principalOf: (
    username: string,
  ) => ReturnType<OrganizationHarness['authenticatedCommandPrincipal']>;
  createPackage: (name: string, projectId: string) => Promise<string>;
}

function recordMoveSnapshot(
  world: MountedMoveWorld,
  label: string,
  snapshot: PhysicalMoveSnapshot,
) {
  writeFileSync(
    join(world.owner.evidence, String(world.owner.snapshotSequence++) + '-' + label + '.json'),
    JSON.stringify(snapshot),
    { flag: 'wx', mode: 0o600 },
  );
}

async function selectMoveOrganization(
  scope: OrganizationHarness,
  username: string,
  organizationId: string,
) {
  const selected = await scope.request('/api/organization/active', {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      authorization: 'Bearer ' + scope.token(username),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ organizationId }),
  });
  expect(selected.status).toBe(200);
  const cookie = selected.headers.get('set-cookie')?.split(';').at(0);
  if (cookie === undefined || cookie === '')
    throw new Error('actual move selection cookie is absent');
  return cookie;
}

/** Acquires the selected recovery close before awaiting any native registration or dependency setup. */
async function createMountedMoveWorld(
  owner: MountedMoveOwner,
  credential?: 'machine' | 'consent',
): Promise<MountedMoveWorld> {
  const clock = { at: Date.now() };
  owner.phase = 'credential-fixture-keys';
  const signing = credential === 'consent' ? await generateKeyPair('RS256') : undefined;
  const machineGrants = credential === 'machine' ? await forwardingMachineGrants() : undefined;
  let observer: (() => void) | undefined;
  const options: ComposedHarnessOptions = {
    sessionBinding: true,
    now: () => clock.at,
    afterResolve: () => {
      const selected = observer;
      observer = undefined;
      selected?.();
    },
    ...(signing === undefined ? {} : { delegationKey: signing.publicKey }),
    ...(machineGrants === undefined ? {} : { machineGrants }),
  };
  owner.phase = 'harness-acquisition';
  owner.acquisitionAttempted = true;
  const scope = OrganizationHarness.openComposedWith(options);
  owner.acquired = true;
  owner.close = scope.stopForRecovery.bind(scope);
  owner.databasePath = scope.databasePath();
  owner.phase = 'native-registration-selection';
  for (const username of ['Creator', 'Actor']) await scope.register(username);
  scope.organization(MOVE_ORGANIZATION);
  scope.organization(FOREIGN_MOVE_ORGANIZATION);
  scope.member(MOVE_ORGANIZATION, 'Creator', 'member', ['org-super-admin']);
  scope.member(FOREIGN_MOVE_ORGANIZATION, 'Creator', 'member', ['org-super-admin']);
  scope.member(MOVE_ORGANIZATION, 'Actor', 'member', ['org-super-admin']);
  scope.activate();
  const cookies = new Map<string, string>();
  cookies.set('Creator', await selectMoveOrganization(scope, 'Creator', MOVE_ORGANIZATION));
  cookies.set('Actor', await selectMoveOrganization(scope, 'Actor', MOVE_ORGANIZATION));
  function cookieOf(username: string) {
    const cookie = cookies.get(username);
    if (cookie === undefined)
      throw new Error('move fixture has no selected cookie for ' + username);
    return cookie;
  }
  const callHuman = (username: string, method: string, path: string, body?: unknown) =>
    scope.callWith(scope.token(username), method, path, body, {
      cookie: cookieOf(username),
      'X-WBS-Expected-Organization': MOVE_ORGANIZATION,
    });
  const rawHuman = (username: string, path: string, body: string | undefined) =>
    scope.request(path, {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        authorization: 'Bearer ' + scope.token(username),
        cookie: cookieOf(username),
        'X-WBS-Expected-Organization': MOVE_ORGANIZATION,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body }),
    });
  owner.phase = 'actual-parent-package-prerequisites';
  const source = await callHuman('Creator', 'POST', '/api/projects', {
    name: 'HTTP move source',
    workPackage: { name: 'HTTP moving package' },
  });
  expect(source.status).toBe(201);
  const sourceProjectId = projectIdOf(source.body),
    workPackageId = workPackageIdOf(source.body);
  const target = await callHuman('Creator', 'POST', '/api/projects', { name: 'HTTP move target' });
  expect(target.status).toBe(201);
  const targetProjectId = projectIdOf(target.body);
  const foreignCookie = await selectMoveOrganization(scope, 'Creator', FOREIGN_MOVE_ORGANIZATION);
  const foreign = await scope.callWith(
    scope.token('Creator'),
    'POST',
    '/api/projects',
    { name: 'Foreign source', workPackage: { name: 'Foreign package' } },
    { cookie: foreignCookie, 'X-WBS-Expected-Organization': FOREIGN_MOVE_ORGANIZATION },
  );
  expect(foreign.status).toBe(201);
  const foreignProjectId = projectIdOf(foreign.body),
    foreignWorkPackageId = workPackageIdOf(foreign.body);
  scope.grant(MOVE_ORGANIZATION, 'Actor', 'package-manager', 'work_package', workPackageId);
  expect(
    scope.sqlite
      .query('SELECT project_id,revision,restricted,created_by FROM work_package WHERE id=?')
      .get(workPackageId),
  ).toEqual({
    project_id: sourceProjectId,
    revision: 0,
    restricted: 0,
    created_by: scope.userId('Creator'),
  });
  expect(
    scope.sqlite
      .query(
        "SELECT role_id,scope_kind,scope_id,subject_id FROM access_grant WHERE origin='creation' AND scope_id IN (?,?) ORDER BY scope_kind",
      )
      .all(sourceProjectId, workPackageId),
  ).toEqual([
    {
      role_id: 'project-manager',
      scope_kind: 'project',
      scope_id: sourceProjectId,
      subject_id: scope.userId('Creator'),
    },
    {
      role_id: 'package-manager',
      scope_kind: 'work_package',
      scope_id: workPackageId,
      subject_id: scope.userId('Creator'),
    },
  ]);
  expect((await callHuman('Actor', 'GET', '/api/work-packages/' + workPackageId)).status).toBe(200);
  expect((await callHuman('Actor', 'GET', '/api/projects/' + targetProjectId)).status).toBe(200);
  const world: MountedMoveWorld = {
    scope,
    owner,
    clock,
    sourceProjectId,
    targetProjectId,
    workPackageId,
    foreignProjectId,
    foreignWorkPackageId,
    signing,
    arm: (next) => {
      if (observer !== undefined) throw new Error('move observer is already armed');
      observer = next;
    },
    disarm: () => {
      observer = undefined;
    },
    callHuman,
    rawHuman,
    principalOf: (username) => scope.authenticatedCommandPrincipal(username, cookieOf(username)),
    createPackage: async (name, projectId) => {
      const created = await callHuman('Creator', 'POST', '/api/work-packages', { name, projectId });
      expect(created.status).toBe(200);
      const rows = scope.sqlite
        .query<{ id: string }, [string, string]>(
          'SELECT id FROM work_package WHERE project_id=? AND name=?',
        )
        .all(projectId, name);
      expect(rows).toHaveLength(1);
      const row = rows.at(0);
      if (row === undefined) throw new Error('actual explicit-parent package was not persisted');
      return row.id;
    },
  };
  owner.phase = 'prerequisites-complete';
  return world;
}

/** Retains the private database, with no fallback recursive cleanup on an unknown selected close. */
async function runMountedMove(
  credential: 'machine' | 'consent' | undefined,
  check: (world: MountedMoveWorld) => Promise<void>,
) {
  const evidence = mkdtempSync(join(tmpdir(), 'mounted-move-negative-'));
  console.info('Mounted move negative fixture:', evidence);
  const owner: MountedMoveOwner = {
    evidence,
    acquisitionAttempted: false,
    acquired: false,
    close: undefined,
    closeAttempts: 0,
    closeSettled: false,
    databasePath: undefined,
    directoryRetained: undefined,
    helperCustodyUnknown: false,
    phase: 'before-acquisition',
    snapshotSequence: 0,
  };
  writeFileSync(
    join(evidence, 'start.json'),
    JSON.stringify({ startedAt: new Date().toISOString(), phase: owner.phase }),
    { flag: 'wx', mode: 0o600 },
  );
  let primary: MoveFailure | undefined;
  const cleanupFailures: unknown[] = [];
  try {
    const world = await createMountedMoveWorld(owner, credential);
    owner.phase = 'owning-check';
    await check(world);
    world.disarm();
    owner.phase = 'complete';
  } catch (failure: unknown) {
    primary = { failure };
  }
  if (owner.close !== undefined) {
    owner.closeAttempts++;
    try {
      const retainedPath = await owner.close();
      owner.closeSettled = true;
      owner.directoryRetained = existsSync(retainedPath);
      if (retainedPath !== owner.databasePath || !owner.directoryRetained)
        throw new Error('selected move recovery close did not retain its actual database');
    } catch (failure: unknown) {
      cleanupFailures.push(failure);
    }
  }
  try {
    writeFileSync(
      join(evidence, 'fixture-custody.json'),
      JSON.stringify(
        {
          endedAt: new Date().toISOString(),
          phase: owner.phase,
          owner: {
            acquisitionAttempted: owner.acquisitionAttempted,
            acquired: owner.acquired,
            closeCaptured: owner.close !== undefined,
            closeAttempts: owner.closeAttempts,
            closeSettled: owner.closeSettled,
            databasePath: owner.databasePath,
            directoryRetained: owner.directoryRetained,
            unknownAcquisition: owner.acquisitionAttempted && !owner.acquired,
            unknownCustody: owner.acquired && !owner.closeSettled,
            helperCustodyUnknown: owner.helperCustodyUnknown,
          },
          primary: primary === undefined ? null : describeFailure(primary.failure),
          cleanupFailures: cleanupFailures.map(describeFailure),
          qualification:
            'Selected sequential Harness stopForRecovery only. A thrown close is unknown custody; no global FD/loan-drain, browser automation or operational activation claim. Private database intentionally retained.',
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
  } catch (failure: unknown) {
    cleanupFailures.push(failure);
  }
  throwMoveFailures(primary, [], cleanupFailures);
}

/** A setup witness loses to an actual premature request or holder settlement. */
async function awaitMoveWitness(
  witness: Promise<undefined>,
  pending: Promise<ObservedMove<Answer>>,
  label: string,
  holder?: Promise<ObservedMove<void>>,
) {
  const observations = [
    witness.then(() => ({ kind: 'witness' as const })),
    pending.then((outcome) => ({ kind: 'request' as const, outcome })),
    ...(holder === undefined
      ? []
      : [holder.then((outcome) => ({ kind: 'holder' as const, outcome }))]),
  ];
  const selected = await Promise.race(observations);
  if (selected.kind !== 'witness') {
    const cause =
      selected.outcome.kind === 'threw' ? selected.outcome.failure : selected.outcome.value;
    throw new Error(label + ' was not observed before premature ' + selected.kind + ' settlement', {
      cause,
    });
  }
}

/** Includes auth/consent effects in the full baseline; no request identity is invented for afterResolve. */
async function observeMountedMove(world: MountedMoveWorld, invoke: () => Promise<Answer>) {
  const reached = Promise.withResolvers<undefined>();
  let before: PhysicalMoveSnapshot | undefined;
  world.arm(() => {
    before = snapshotTables(world.scope);
    reached.resolve(undefined);
  });
  const pending = observeMove(invoke());
  let primary: MoveFailure | undefined;
  try {
    await awaitMoveWitness(reached.promise, pending, 'post-authentication move resolution');
  } catch (failure: unknown) {
    primary = { failure };
  }
  world.disarm();
  const observed = await pending;
  if (observed.kind === 'threw') {
    if (primary === undefined) primary = { failure: observed.failure };
    else throwMoveFailures(primary, [observed.failure], []);
  }
  throwMoveFailures(primary, [], []);
  if (before === undefined || observed.kind !== 'returned')
    throw new Error('post-authentication move observation is incomplete');
  recordMoveSnapshot(world, 'post-auth-before', before);
  return { reply: observed.value, before };
}

/** The entered witness proves the earlier holder, not that the pending move already enqueued. */
async function delayMountedMove(
  world: MountedMoveWorld,
  invoke: () => Promise<Answer>,
  mutate: () => void,
) {
  const resolved = Promise.withResolvers<undefined>(),
    entered = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>();
  let holder: Promise<ObservedMove<void>> | undefined;
  let before: PhysicalMoveSnapshot | undefined;
  world.arm(() => {
    before = snapshotTables(world.scope);
    holder = observeMove(
      world.scope.holdWriteTurn(release.promise, () => {
        entered.resolve(undefined);
      }),
    );
    resolved.resolve(undefined);
  });
  const pending = observeMove(invoke());
  let primary: MoveFailure | undefined;
  try {
    await awaitMoveWitness(resolved.promise, pending, 'post-authentication held-owner resolution');
    const acquiredHolder = holder;
    if (acquiredHolder === undefined) throw new Error('move holder was not acquired');
    await awaitMoveWitness(entered.promise, pending, 'earlier source holder entry', acquiredHolder);
    if (before === undefined) throw new Error('move post-authentication baseline is absent');
    recordMoveSnapshot(world, 'post-auth-before-change', before);
    mutate();
    before = snapshotTables(world.scope);
    recordMoveSnapshot(world, 'after-change-before-owner', before);
  } catch (failure: unknown) {
    primary = { failure };
  } finally {
    world.disarm();
    release.resolve(undefined);
  }
  const cleanupFailures: unknown[] = [];
  if (holder !== undefined) {
    const settled = await holder;
    if (settled.kind === 'threw') cleanupFailures.push(settled.failure);
  }
  const observed = await pending;
  const secondary: unknown[] = [];
  if (observed.kind === 'threw') {
    if (primary === undefined) primary = { failure: observed.failure };
    else secondary.push(observed.failure);
  }
  throwMoveFailures(primary, secondary, cleanupFailures);
  if (before === undefined || observed.kind !== 'returned')
    throw new Error('held-owner move observation is incomplete');
  return { reply: observed.value, before };
}

const mountedMovePath = (world: MountedMoveWorld, workPackageId = world.workPackageId) =>
  '/api/work-packages/' + workPackageId + '/move';
const invokeHumanMove = (
  world: MountedMoveWorld,
  targetProjectId = world.targetProjectId,
  username = 'Actor',
  workPackageId = world.workPackageId,
) =>
  world.callHuman(username, 'POST', mountedMovePath(world, workPackageId), {
    projectId: targetProjectId,
  });
function expectMoveUnchanged(world: MountedMoveWorld, before: PhysicalMoveSnapshot) {
  const after = snapshotTables(world.scope);
  recordMoveSnapshot(world, 'after', after);
  expect(after).toEqual(before);
}
function expectCommittedMountedMove(
  world: MountedMoveWorld,
  before: PhysicalMoveSnapshot,
  reply: Answer,
) {
  expect(reply).toEqual({
    status: 200,
    body: {
      workPackageId: world.workPackageId,
      projectId: world.targetProjectId,
      revision: 1,
      sourceProject: { id: world.sourceProjectId, revision: 1 },
      targetProject: { id: world.targetProjectId, revision: 1 },
    },
  });
  const after = snapshotTables(world.scope);
  recordMoveSnapshot(world, 'committed-after', after);
  const beforeAudit = before.find(({ name }) => name === 'organization_audit');
  const afterAudit = after.find(({ name }) => name === 'organization_audit');
  if (beforeAudit === undefined || afterAudit === undefined)
    throw new Error('actual move audit table snapshot is absent');
  const priorIds = new Set(beforeAudit.rows.map((row) => row['id']));
  const appended = afterAudit.rows.filter((row) => !priorIds.has(row['id']));
  expect(appended).toHaveLength(1);
  const audit = appended.at(0);
  if (audit === undefined || typeof audit['id'] !== 'string')
    throw new Error('actual appended move audit identity is absent');
  expect(audit['id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(audit).toEqual({
    id: audit['id'],
    organization_id: MOVE_ORGANIZATION,
    actor_id: world.scope.userId('Actor'),
    action: 'work_package_moved',
    subject_kind: 'project',
    subject_id: world.targetProjectId,
    detail: JSON.stringify({
      workPackageId: world.workPackageId,
      fromProjectId: world.sourceProjectId,
      toProjectId: world.targetProjectId,
      workPackageRevision: 1,
      sourceProjectRevision: 1,
      targetProjectRevision: 1,
    }),
    created_at: world.clock.at,
  });
  const expected = before.map((table) => {
    const rows =
      table.name === 'work_package'
        ? table.rows.map((row) =>
            row['id'] === world.workPackageId
              ? {
                  ...row,
                  project_id: world.targetProjectId,
                  revision: 1,
                  updated_at: world.clock.at,
                }
              : row,
          )
        : table.name === 'project'
          ? table.rows.map((row) =>
              row['id'] === world.sourceProjectId || row['id'] === world.targetProjectId
                ? { ...row, revision: 1, updated_at: world.clock.at }
                : row,
            )
          : table.name === 'organization_audit'
            ? [...table.rows, audit]
            : table.rows;
    return {
      name: table.name,
      rows: [...rows].sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      ),
    };
  });
  expect(after).toEqual(expected);
}

async function createMoveLeaf(world: MountedMoveWorld, workPackageId: string, name: string) {
  const created = await world.callHuman(
    'Creator',
    'POST',
    '/api/work-packages/' + workPackageId + '/commands',
    { commands: [{ kind: 'createWorkItem', name }] },
  );
  expect(created.status).toBe(200);
  const rows = world.scope.sqlite
    .query<{ id: string }, [string, string]>(
      'SELECT id FROM work_item WHERE work_package_id=? AND name=?',
    )
    .all(workPackageId, name);
  expect(rows).toHaveLength(1);
  const selected = rows.at(0);
  if (selected === undefined) throw new Error('mounted dependency leaf is absent');
  return selected.id;
}
/** Actual current borrowed storage; the existing synthetic receipt is not runtime activation evidence. */
async function createMoveRelationship(
  world: MountedMoveWorld,
  id: string,
  predecessor: { workPackageId: string; workItemId: string },
  successor: { workPackageId: string; workItemId: string },
) {
  await world.scope.publicWrites().uow.run(async (scope) => {
    await scope.stores.typedDependencies.add(
      {
        id,
        workPackageId: successor.workPackageId,
        predecessor: { scope: 'whole', ...predecessor },
        successor: { scope: 'whole', ...successor },
        type: 'FS',
      },
      { at: world.clock.at, by: world.scope.userId('Creator') },
    );
    return { commit: true, value: undefined };
  });
  expect(
    world.scope.sqlite
      .query(
        'SELECT id FROM ' +
          (predecessor.workPackageId === successor.workPackageId
            ? 'typed_dependency'
            : 'external_dependency') +
          ' WHERE id=?',
      )
      .get(id),
  ).toEqual({ id });
}
function seedMountedDependencyAuthority(world: MountedMoveWorld) {
  world.owner.helperCustodyUnknown = true;
  seedDependencyAuthority(world.scope.databasePath());
  world.owner.helperCustodyUnknown = false;
}
async function sourceMoveRelationship(world: MountedMoveWorld, direction: 'outgoing' | 'incoming') {
  seedMountedDependencyAuthority(world);
  const neighbor = await world.createPackage('Source neighbor', world.sourceProjectId);
  const moving = {
    workPackageId: world.workPackageId,
    workItemId: await createMoveLeaf(world, world.workPackageId, 'Moving leaf'),
  };
  const counterpart = {
    workPackageId: neighbor,
    workItemId: await createMoveLeaf(world, neighbor, 'Counterpart leaf'),
  };
  const id = crypto.randomUUID();
  await createMoveRelationship(
    world,
    id,
    direction === 'outgoing' ? moving : counterpart,
    direction === 'outgoing' ? counterpart : moving,
  );
  return { id, moving, counterpart };
}

it('keeps a real selected same-parent HTTP move unchanged with maximal revisions and an incident blocker', async () =>
  runMountedMove(undefined, async (world) => {
    await sourceMoveRelationship(world, 'outgoing');
    world.scope.sqlite.run('UPDATE work_package SET revision=? WHERE id=?', [
      Number.MAX_SAFE_INTEGER,
      world.workPackageId,
    ]);
    world.scope.sqlite.run('UPDATE project SET revision=? WHERE id=?', [
      Number.MAX_SAFE_INTEGER,
      world.sourceProjectId,
    ]);
    const { reply, before } = await observeMountedMove(world, () =>
      invokeHumanMove(world, world.sourceProjectId),
    );
    expect(reply).toEqual({
      status: 200,
      body: {
        workPackageId: world.workPackageId,
        projectId: world.sourceProjectId,
        revision: Number.MAX_SAFE_INTEGER,
        sourceProject: { id: world.sourceProjectId, revision: Number.MAX_SAFE_INTEGER },
        targetProject: { id: world.sourceProjectId, revision: Number.MAX_SAFE_INTEGER },
      },
    });
    expectMoveUnchanged(world, before);
  }));

it('rejects actual mounted move bodies without accepting caller authority or malformed JSON', async () =>
  runMountedMove(undefined, async (world) => {
    const bodies: readonly unknown[] = [
      undefined,
      {},
      { projectId: '' },
      { projectId: null },
      { projectId: 42 },
      { projectId: world.targetProjectId, actor: world.scope.userId('Actor') },
      { projectId: world.targetProjectId, organizationId: FOREIGN_MOVE_ORGANIZATION },
      { projectId: world.targetProjectId, workPackageId: world.foreignWorkPackageId },
    ];
    for (const body of bodies) {
      const before = snapshotTables(world.scope);
      recordMoveSnapshot(world, 'body-before', before);
      const response = await world.rawHuman(
        'Actor',
        mountedMovePath(world),
        body === undefined ? undefined : JSON.stringify(body),
      );
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: 'invalid_body' });
      expectMoveUnchanged(world, before);
    }
    const before = snapshotTables(world.scope);
    recordMoveSnapshot(world, 'malformed-json-before', before);
    const response = await world.rawHuman('Actor', mountedMovePath(world), '{');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_json' });
    expectMoveUnchanged(world, before);
  }));

for (const visibility of ['absent', 'foreign', 'hidden'] as const)
  it(
    'keeps actual mounted ' + visibility + ' package opacity before a missing destination',
    async () =>
      runMountedMove(undefined, async (world) => {
        if (visibility === 'hidden')
          world.scope.sqlite.run(
            "DELETE FROM access_grant WHERE subject_kind='user' AND subject_id=?",
            [world.scope.userId('Actor')],
          );
        const id =
          visibility === 'absent'
            ? crypto.randomUUID()
            : visibility === 'foreign'
              ? world.foreignWorkPackageId
              : world.workPackageId;
        const before = snapshotTables(world.scope);
        recordMoveSnapshot(world, 'opacity-before', before);
        expect(await invokeHumanMove(world, crypto.randomUUID(), 'Actor', id)).toEqual({
          status: 404,
          body: { error: 'not_found' },
        });
        expectMoveUnchanged(world, before);
      }),
  );

for (const destination of ['missing', 'foreign'] as const)
  it(
    'returns mounted ' + destination + ' destination404 before missing organization permission',
    async () =>
      runMountedMove(undefined, async (world) => {
        world.scope.sqlite.run(
          "DELETE FROM access_grant WHERE subject_kind='user' AND subject_id=? AND scope_kind='organization'",
          [world.scope.userId('Actor')],
        );
        expect(
          (await world.callHuman('Actor', 'GET', '/api/work-packages/' + world.workPackageId))
            .status,
        ).toBe(200);
        const before = snapshotTables(world.scope);
        recordMoveSnapshot(world, 'destination-before', before);
        expect(
          await invokeHumanMove(
            world,
            destination === 'missing' ? crypto.randomUUID() : world.foreignProjectId,
          ),
        ).toEqual({ status: 404, body: { error: 'not_found' } });
        expectMoveUnchanged(world, before);
        expect(await invokeHumanMove(world)).toEqual({
          status: 403,
          body: { error: 'forbidden', permission: 'organization.create_project' },
        });
        expectMoveUnchanged(world, before);
      }),
  );

it('returns mounted organization permission before an actual dependency blocker', async () =>
  runMountedMove(undefined, async (world) => {
    await sourceMoveRelationship(world, 'outgoing');
    world.scope.sqlite.run(
      "DELETE FROM access_grant WHERE subject_kind='user' AND subject_id=? AND scope_kind='organization'",
      [world.scope.userId('Actor')],
    );
    expect(
      (await world.callHuman('Actor', 'GET', '/api/work-packages/' + world.workPackageId)).status,
    ).toBe(200);
    const { reply, before } = await observeMountedMove(world, () => invokeHumanMove(world));
    expect(reply).toEqual({
      status: 403,
      body: { error: 'forbidden', permission: 'organization.create_project' },
    });
    expectMoveUnchanged(world, before);
  }));

it('refuses a restricted creator without current-parent or package write grants for real and same-parent moves', async () =>
  runMountedMove(undefined, async (world) => {
    world.scope.sqlite.run('UPDATE work_package SET restricted=1 WHERE id=?', [
      world.workPackageId,
    ]);
    world.scope.sqlite.run(
      "DELETE FROM access_grant WHERE subject_kind='user' AND subject_id=? AND scope_kind='work_package' AND scope_id=?",
      [world.scope.userId('Creator'), world.workPackageId],
    );
    expect(
      world.scope.sqlite
        .query('SELECT created_by,restricted FROM work_package WHERE id=?')
        .get(world.workPackageId),
    ).toEqual({ created_by: world.scope.userId('Creator'), restricted: 1 });
    expect(
      world.scope.sqlite
        .query(
          "SELECT role_id FROM access_grant WHERE subject_id=? AND scope_kind='project' AND scope_id=? AND origin='creation'",
        )
        .get(world.scope.userId('Creator'), world.sourceProjectId),
    ).toEqual({ role_id: 'project-manager' });
    world.scope.sqlite.run(
      "DELETE FROM access_grant WHERE subject_kind='user' AND subject_id=? AND scope_kind='project' AND scope_id=?",
      [world.scope.userId('Creator'), world.sourceProjectId],
    );
    expect(
      world.scope.sqlite
        .query(
          "SELECT id FROM access_grant WHERE subject_kind='user' AND subject_id=? AND scope_kind='project' AND scope_id=?",
        )
        .get(world.scope.userId('Creator'), world.sourceProjectId),
    ).toBeNull();
    expect(
      (await world.callHuman('Creator', 'GET', '/api/work-packages/' + world.workPackageId)).status,
    ).toBe(200);
    for (const target of [world.targetProjectId, world.sourceProjectId]) {
      const { reply, before } = await observeMountedMove(world, () =>
        invokeHumanMove(world, target, 'Creator'),
      );
      expect(reply).toEqual({
        status: 403,
        body: { error: 'forbidden', permission: 'package.write' },
      });
      expectMoveUnchanged(world, before);
    }
  }));

for (const changed of ['membership', 'direct grant', 'restriction'] as const)
  it(
    'refuses mounted ' + changed + ' changed after request resolution before the move owner',
    async () =>
      runMountedMove(undefined, async (world) => {
        const actorId = world.scope.userId('Actor');
        if (changed === 'direct grant')
          world.scope.sqlite.run('UPDATE work_package SET restricted=1 WHERE id=?', [
            world.workPackageId,
          ]);
        if (changed === 'restriction')
          world.scope.sqlite.run(
            "DELETE FROM access_grant WHERE subject_kind='user' AND subject_id=? AND scope_kind='work_package' AND scope_id=?",
            [actorId, world.workPackageId],
          );
        expect(
          world.scope.sqlite
            .query('SELECT restricted FROM work_package WHERE id=?')
            .get(world.workPackageId),
        ).toEqual({ restricted: changed === 'direct grant' ? 1 : 0 });
        expect(
          world.scope.sqlite
            .query(
              "SELECT COUNT(*) AS count FROM access_grant WHERE subject_kind='user' AND subject_id=? AND scope_kind='work_package' AND scope_id=?",
            )
            .get(actorId, world.workPackageId),
        ).toEqual({ count: changed === 'restriction' ? 0 : 1 });
        expect((await invokeHumanMove(world, world.sourceProjectId)).status).toBe(200);
        const { reply, before } = await delayMountedMove(
          world,
          () => invokeHumanMove(world),
          () => {
            if (changed === 'membership')
              world.scope.sqlite.run(
                'DELETE FROM organization_membership WHERE organization_id=? AND user_id=?',
                [MOVE_ORGANIZATION, actorId],
              );
            else if (changed === 'direct grant')
              world.scope.sqlite.run(
                "DELETE FROM access_grant WHERE subject_kind='user' AND subject_id=? AND scope_kind='work_package' AND scope_id=?",
                [actorId, world.workPackageId],
              );
            else
              world.scope.sqlite.run('UPDATE work_package SET restricted=1 WHERE id=?', [
                world.workPackageId,
              ]);
          },
        );
        expect(reply).toEqual(
          changed === 'membership'
            ? { status: 403, body: { error: 'not_a_member' } }
            : { status: 403, body: { error: 'forbidden', permission: 'package.write' } },
        );
        expectMoveUnchanged(world, before);
        if (changed !== 'membership')
          expect(
            (await world.callHuman('Actor', 'GET', '/api/work-packages/' + world.workPackageId))
              .status,
          ).toBe(200);
      }),
  );

it('uses the current parent at the mounted held-owner boundary without a second increment', async () =>
  runMountedMove(undefined, async (world) => {
    const { reply, before } = await delayMountedMove(
      world,
      () => invokeHumanMove(world),
      () => {
        world.scope.sqlite.run('UPDATE work_package SET project_id=? WHERE id=?', [
          world.targetProjectId,
          world.workPackageId,
        ]);
      },
    );
    expect(reply).toEqual({
      status: 200,
      body: {
        workPackageId: world.workPackageId,
        projectId: world.targetProjectId,
        revision: 0,
        sourceProject: { id: world.targetProjectId, revision: 0 },
        targetProject: { id: world.targetProjectId, revision: 0 },
      },
    });
    expectMoveUnchanged(world, before);
  }));

it('refuses a browser credential revoked after resolution as absent current binding before move ownership', async () =>
  runMountedMove(undefined, async (world) => {
    const token = world.scope.token('Actor'),
      claims = decodeJwt(token);
    if (typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp))
      throw new Error('actual native credential expiry is absent');
    const expiresAt = claims.exp * 1000;
    const { reply, before } = await delayMountedMove(
      world,
      () => invokeHumanMove(world),
      () => {
        world.scope.sqlite.run(
          'INSERT INTO browser_credential_revocations(kind,user_id,credential_digest,expires_at,revoked_at) VALUES(?,?,?,?,?)',
          [
            'native',
            world.scope.userId('Actor'),
            createHash('sha256').update(token).digest('hex'),
            expiresAt,
            world.clock.at,
          ],
        );
      },
    );
    expect(reply).toEqual({ status: 403, body: { error: 'no_active_organization' } });
    expectMoveUnchanged(world, before);
  }));

/** Actual signed/verified credential fixture; no request principal or cap is substituted. */
async function prepareMountedMoveCredential(world: MountedMoveWorld, kind: 'machine' | 'consent') {
  const actorId = world.scope.userId('Actor');
  addAgentPerson(world.scope.sqlite, 'mounted-agent', MOVE_ORGANIZATION, actorId);
  const credential = await issueApiKey(world.scope.sqlite, {
    organizationId: MOVE_ORGANIZATION,
    personId: 'mounted-agent',
    issuedBy: actorId,
  });
  grantCredential(
    world.scope.sqlite,
    MOVE_ORGANIZATION,
    credential.id,
    'org-super-admin',
    'organization',
    MOVE_ORGANIZATION,
  );
  grantCredential(
    world.scope.sqlite,
    MOVE_ORGANIZATION,
    credential.id,
    'package-manager',
    'work_package',
    world.workPackageId,
  );
  if (kind === 'machine') {
    const issued = await requestGrant(
      world.scope,
      { kind: 'api_key', key: credential.key },
      { now: world.clock.at },
    );
    expect(issued.status).toBe(200);
    const answer: unknown = await issued.json();
    if (
      typeof answer !== 'object' ||
      answer === null ||
      !('grant' in answer) ||
      typeof answer.grant !== 'string'
    )
      throw new Error('actual forwarded move grant is absent');
    const grant = answer.grant;
    const headers = {
      [MCP_INTERNAL_SECRET_HEADER]: TEST_MACHINE_GRANT_ENV['MCP_BE_INTERNAL_SECRET'],
    };
    expect(
      (
        await world.scope.callWith(
          grant,
          'GET',
          '/api/work-packages/' + world.workPackageId,
          undefined,
          headers,
        )
      ).status,
    ).toBe(200);
    return {
      id: credential.id,
      invoke: () =>
        world.scope.callWith(
          grant,
          'POST',
          mountedMovePath(world),
          { projectId: world.targetProjectId },
          headers,
        ),
    };
  }
  world.scope.sqlite.run(
    "UPDATE machine_credential SET source='mcp_consent',mcp_family_id='family-1' WHERE id=?",
    [credential.id],
  );
  mapUpstream(world.scope, 'Actor', 'mounted-actor');
  const signing = world.signing;
  if (signing === undefined) throw new Error('actual consent signing key is absent');
  const readToken = await delegationFor(
    world.scope,
    signing.privateKey,
    'Actor',
    MOVE_ORGANIZATION,
    'mounted-actor',
    { credentialId: credential.id, personId: 'mounted-agent' },
  );
  world.clock.at = Date.now();
  expect(
    (await world.scope.callWith(readToken, 'GET', '/api/work-packages/' + world.workPackageId))
      .status,
  ).toBe(200);
  const moveToken = await delegationFor(
    world.scope,
    signing.privateKey,
    'Actor',
    MOVE_ORGANIZATION,
    'mounted-actor',
    { credentialId: credential.id, personId: 'mounted-agent' },
  );
  world.clock.at = Date.now();
  return {
    id: credential.id,
    invoke: () =>
      world.scope.callWith(moveToken, 'POST', mountedMovePath(world), {
        projectId: world.targetProjectId,
      }),
  };
}
for (const kind of ['machine', 'consent'] as const) {
  it(
    'retains the real mounted ' + kind + ' contributor cap after authentication effects',
    async () =>
      runMountedMove(kind, async (world) => {
        const credential = await prepareMountedMoveCredential(world, kind);
        const { reply, before } = await observeMountedMove(world, credential.invoke);
        expect(reply).toEqual({
          status: 403,
          body: { error: 'forbidden', permission: 'organization.create_project' },
        });
        expectMoveUnchanged(world, before);
      }),
  );
  it(
    'refuses the real mounted ' +
      kind +
      ' credential revoked after authentication before move ownership',
    async () =>
      runMountedMove(kind, async (world) => {
        const credential = await prepareMountedMoveCredential(world, kind);
        const { reply, before } = await delayMountedMove(world, credential.invoke, () => {
          world.scope.sqlite.run('UPDATE machine_credential SET revoked_at=? WHERE id=?', [
            world.clock.at,
            credential.id,
          ]);
        });
        expect(reply).toEqual({ status: 409, body: { error: 'organization_context_changed' } });
        expectMoveUnchanged(world, before);
      }),
  );
}

for (const direction of ['outgoing', 'incoming'] as const)
  for (const held of [false, true])
    it(
      'returns only dependency IDs for mounted ' +
        direction +
        (held ? ' held' : ' active') +
        ' source blockers',
      async () =>
        runMountedMove(undefined, async (world) => {
          const relationship = await sourceMoveRelationship(world, direction);
          if (held)
            world.scope.sqlite.run("UPDATE work_item SET hold='on_hold' WHERE id=?", [
              relationship.moving.workItemId,
            ]);
          if (direction === 'incoming' && held) {
            world.scope.sqlite.run('UPDATE work_package SET restricted=1 WHERE id=?', [
              relationship.counterpart.workPackageId,
            ]);
            world.scope.sqlite.run(
              "DELETE FROM access_grant WHERE subject_kind='user' AND subject_id=? AND scope_kind='organization'",
              [world.scope.userId('Actor')],
            );
            world.scope.grantPermissions(MOVE_ORGANIZATION, 'Actor', [
              'organization.create_project',
              'organization.navigate',
            ]);
            expect(
              world.scope.sqlite
                .query('SELECT project_id,restricted FROM work_package WHERE id=?')
                .get(relationship.counterpart.workPackageId),
            ).toEqual({ project_id: world.sourceProjectId, restricted: 1 });
            expect(await world.callHuman('Actor', 'GET', '/api/projects')).toEqual({
              status: 200,
              body: { projects: [{ id: world.sourceProjectId, name: 'HTTP move source' }] },
            });
            expect(
              await world.callHuman('Actor', 'GET', '/api/projects/' + world.sourceProjectId),
            ).toEqual({ status: 403, body: { error: 'forbidden', permission: 'project.read' } });
            const principal = await world.principalOf('Actor');
            expect(principal.id).toBe(world.scope.userId('Actor'));
            const loan = { acquired: 0, closeAttempts: 0, closeSettled: 0 };
            await observeCommitted(
              () => {
                const connection = openReadOnlyConnection(world.scope.databasePath());
                loan.acquired++;
                const close = connection.close.bind(connection);
                return {
                  db: connection.db,
                  close() {
                    loan.closeAttempts++;
                    close();
                    loan.closeSettled++;
                  },
                };
              },
              async (snapshot) => {
                const decisions = new AccessDecisionRepository(snapshot);
                const moving = await decisions.packageTargetOf(world.workPackageId, null);
                const counterpart = await decisions.packageTargetOf(
                  relationship.counterpart.workPackageId,
                  null,
                );
                if (moving === null || counterpart === null)
                  throw new Error('Actual dependency visibility targets are absent');
                const readable = await decisions.readablePackageIds(principal, MOVE_ORGANIZATION);
                expect(readable.has(world.workPackageId)).toBe(true);
                expect(readable.has(relationship.counterpart.workPackageId)).toBe(false);
                const movingRole = await decisions.effectiveRoleAt(principal, moving);
                expect(movingRole?.permissions.has('package.read')).toBe(true);
                expect(await decisions.effectiveRoleAt(principal, counterpart)).toBeNull();
              },
            );
            expect(loan).toEqual({ acquired: 1, closeAttempts: 1, closeSettled: 1 });
            expect(
              (await world.callHuman('Actor', 'GET', '/api/work-packages/' + world.workPackageId))
                .status,
            ).toBe(200);
          }
          const { reply, before } = await observeMountedMove(world, () => invokeHumanMove(world));
          expect(reply).toEqual({
            status: 409,
            body: { error: 'dependency_crosses_project', dependencyIds: [relationship.id] },
          });
          expectMoveUnchanged(world, before);
        }),
    );

it('commits a mounted move with actual local and destination relationships without rewriting them', async () =>
  runMountedMove(undefined, async (world) => {
    seedMountedDependencyAuthority(world);
    const neighbor = await world.createPackage('Destination neighbor', world.targetProjectId);
    const moving = {
      workPackageId: world.workPackageId,
      workItemId: await createMoveLeaf(world, world.workPackageId, 'Moving destination leaf'),
    };
    const counterpart = {
      workPackageId: neighbor,
      workItemId: await createMoveLeaf(world, neighbor, 'Destination leaf'),
    };
    const local = {
      workPackageId: world.workPackageId,
      workItemId: await createMoveLeaf(world, world.workPackageId, 'Moving local leaf'),
    };
    await createMoveRelationship(world, crypto.randomUUID(), moving, counterpart);
    await createMoveRelationship(world, crypto.randomUUID(), counterpart, local);
    await createMoveRelationship(world, crypto.randomUUID(), moving, local);
    const { reply, before } = await observeMountedMove(world, () => invokeHumanMove(world));
    expectCommittedMountedMove(world, before, reply);
  }));

it('uses a current project grant for restricted same-parent and real moves without a direct package grant', async () =>
  runMountedMove(undefined, async (world) => {
    const actorId = world.scope.userId('Actor');
    world.scope.sqlite.run('UPDATE work_package SET restricted=1 WHERE id=?', [
      world.workPackageId,
    ]);
    world.scope.sqlite.run(
      "DELETE FROM access_grant WHERE subject_kind='user' AND subject_id=? AND scope_kind='work_package' AND scope_id=?",
      [actorId, world.workPackageId],
    );
    for (const parentId of [world.sourceProjectId, world.targetProjectId])
      world.scope.grant(MOVE_ORGANIZATION, 'Actor', 'project-manager', 'project', parentId);
    expect(
      world.scope.sqlite
        .query('SELECT created_by,restricted FROM work_package WHERE id=?')
        .get(world.workPackageId),
    ).toEqual({ created_by: world.scope.userId('Creator'), restricted: 1 });
    expect(
      world.scope.sqlite
        .query(
          "SELECT scope_kind,scope_id,role_id FROM access_grant WHERE subject_kind='user' AND subject_id=? AND scope_kind IN ('project','work_package') ORDER BY scope_id",
        )
        .all(actorId),
    ).toEqual(
      [world.sourceProjectId, world.targetProjectId].sort().map((scopeId) => ({
        scope_kind: 'project',
        scope_id: scopeId,
        role_id: 'project-manager',
      })),
    );

    const same = await observeMountedMove(world, () =>
      invokeHumanMove(world, world.sourceProjectId),
    );
    expect(same.reply).toEqual({
      status: 200,
      body: {
        workPackageId: world.workPackageId,
        projectId: world.sourceProjectId,
        revision: 0,
        sourceProject: { id: world.sourceProjectId, revision: 0 },
        targetProject: { id: world.sourceProjectId, revision: 0 },
      },
    });
    expectMoveUnchanged(world, same.before);

    world.scope.sqlite.run(
      "DELETE FROM access_grant WHERE subject_kind='user' AND subject_id=? AND scope_kind='project' AND scope_id=?",
      [actorId, world.sourceProjectId],
    );
    const refused = await observeMountedMove(world, () => invokeHumanMove(world));
    expect(refused.reply).toEqual({
      status: 403,
      body: { error: 'forbidden', permission: 'package.write' },
    });
    expectMoveUnchanged(world, refused.before);

    world.scope.grant(
      MOVE_ORGANIZATION,
      'Actor',
      'project-manager',
      'project',
      world.sourceProjectId,
    );
    const committed = await observeMountedMove(world, () => invokeHumanMove(world));
    expectCommittedMountedMove(world, committed.before, committed.reply);
  }));
