import { createHash, randomUUID } from 'node:crypto';

import { type RunDocker, runDockerBefore } from './docker-deadline';
import { parseDockerInspection } from './docker-inspection-json';
import { assertDependencyOwner, type DependencyOwner, ownerDockerHashed } from './edge-ownership';
import { type EnvLayout, sourceDevContract } from './env';
import { assertSame, publishRecord, readFields, readIdentity, readRecord } from './managed-cohort';
import {
  assertSourceDevExcluded,
  decodeSourceDev,
  identifySourceInventory,
  sourceDevIdentity,
  type SourceDevMember,
} from './source-dev-cohort';

const identity: unique symbol = Symbol('source-dev-exclusion');
/** Live callback-scoped whole-private-namespace evidence; serialized records cannot recreate it. */
export interface SourceDevExclusion {
  readonly [identity]: true;
}
interface SourceScope {
  owner: DependencyOwner;
  layouts: { readonly prod: EnvLayout; readonly dev: EnvLayout };
  sha: string;
  docker: RunDocker;
  deadline: number;
  member: SourceDevMember | null;
  records: { path: string; contents: string }[];
}
const exclusions = new WeakMap<SourceDevExclusion, SourceScope>();

function assertScopeDeadline(scope: SourceScope): void {
  if (!Number.isFinite(scope.deadline) || performance.now() >= scope.deadline)
    throw new Error('source dev exclusion deadline exceeded');
}
/** A local read view only; never stored, mutated into the original or used as WeakMap authority. */
function limitObservation(scope: SourceScope, deadline?: number): SourceScope {
  // Proof: validation omission lost invalid-supplied classification; six deadline input negatives failed.
  if (deadline !== undefined && (!Number.isFinite(deadline) || performance.now() >= deadline))
    throw new Error('source dev observer deadline invalid');
  // Proof: original-limit omission let a longer supplied deadline outlive original authority; both longer-limit negatives failed.
  // Proof: tighter-scope omission failed real stalled child abort and original-scope reuse negatives.
  return deadline === undefined
    ? scope
    : { ...scope, deadline: Math.min(scope.deadline, deadline) };
}
async function assertScope(scope: SourceScope): Promise<void> {
  // Native filesystem syscalls are checked at awaited boundaries; Docker children receive hard abort.
  assertScopeDeadline(scope);
  await assertDependencyOwner(scope.owner, scope.layouts.prod, scope.sha);
  assertScopeDeadline(scope);
  await assertDependencyOwner(scope.owner, scope.layouts.dev, scope.sha);
  assertScopeDeadline(scope);
  // Proof: source-bytes omission admitted changed intent; source final readback refuses bytes failed (exit 1).
  for (const record of scope.records) {
    const contents = await readRecord(record.path);
    assertScopeDeadline(scope);
    if (contents !== record.contents) throw new Error('source dev retained evidence changed');
  }
}

function findSource(inventory: readonly unknown[], layout: EnvLayout): unknown {
  const contract = sourceDevContract(layout);
  const candidates: unknown[] = [];
  const ids = new Set<string>();
  for (const raw of inventory) {
    const container = readFields(raw);
    const id = readIdentity(container['Id']);
    if (ids.has(id)) throw new Error('source dev duplicate inventory identity');
    ids.add(id);
    const config = readFields(container['Config']);
    const labels = config['Labels'] === null ? {} : readFields(config['Labels']);
    const name = container['Name'];
    const service = labels['com.docker.compose.service'];
    const networks = readFields(readFields(container['NetworkSettings'])['Networks']);
    // Proof: removing this guard admitted an additional dev backend in the actual initial inventory; initial inventory negative failed.
    if (
      [name, service].some(
        (value) => typeof value === 'string' && /^\/?dev-(?:be|gw)-01/.test(value),
      ) ||
      (Object.hasOwn(networks, layout.network) &&
        typeof config['Image'] === 'string' &&
        /\/wbs-(?:be|gw)-01(?:@|:)/.test(config['Image']))
    )
      throw new Error('source dev refuses transitional dev backend/gateway topology');
    if (
      name === `/${contract.name}` ||
      service === contract.service ||
      config['Image'] === contract.image ||
      (typeof name === 'string' && name.startsWith(`/${contract.name}`))
    )
      candidates.push(raw);
  }
  // Proof: cardinality omission admitted a conflicting full-ID replacement; source live recognition refuses replacement failed.
  if (candidates.length !== 1)
    throw new Error('source dev requires exactly one source inventory member');
  return candidates[0];
}

async function inspectInventory(scope: SourceScope): Promise<unknown[]> {
  await assertScope(scope);
  const listed = (
    await runDockerBefore(
      ['ps', '-a', '--no-trunc', '--format', '{{.ID}}'],
      scope.docker,
      scope.deadline,
    )
  ).trim();
  const ids = listed === '' ? [] : listed.split('\n');
  if (ids.length === 0 || new Set(ids).size !== ids.length)
    throw new Error('source dev inventory missing or duplicated');
  for (const id of ids) readIdentity(id);
  const inventory: unknown = parseDockerInspection(
    await runDockerBefore(['inspect', ...ids], scope.docker, scope.deadline),
  );
  if (!Array.isArray(inventory) || inventory.length !== ids.length)
    throw new Error('source dev inventory incomplete');
  const observed = inventory.map((raw: unknown) => readIdentity(readFields(raw)['Id']));
  assertSame([...ids].sort(), observed.sort(), 'source dev complete inventory');
  return inventory.map((entry: unknown) => entry);
}

async function observeMember(
  scope: SourceScope,
  inventory: readonly unknown[],
): Promise<SourceDevMember> {
  const member = decodeSourceDev(findSource(inventory, scope.layouts.dev), scope.layouts.dev);
  const resolved = (
    await runDockerBefore(
      ['image', 'inspect', '--format', '{{.Id}}', sourceDevContract(scope.layouts.dev).image],
      scope.docker,
      scope.deadline,
    )
  ).trim();
  // Proof: omitted tag resolution admitted image substitution; source refuses omitted image failed (exit 1).
  assertSame(member.image, resolved, 'source dev mutable image tag resolution');
  const inspected: unknown = parseDockerInspection(
    await runDockerBefore(['image', 'inspect', member.image], scope.docker, scope.deadline),
  );
  if (!Array.isArray(inspected) || inspected.length !== 1)
    throw new Error('source dev immutable image inspection missing');
  const image = readFields(inspected[0]);
  assertSame(member.image, image['Id'], 'source dev immutable image identity');
  // Proof: omitted inherited entrypoint equality admitted changed image startup; source refuses omitted entrypoint failed.
  assertSame(
    readFields(image['Config'])['Entrypoint'],
    member.config['Entrypoint'],
    'source dev inherited image entrypoint',
  );
  await assertScope(scope);
  return member;
}

async function inspectScope(scope: SourceScope): Promise<void> {
  await assertScope(scope);
  const observed = await observeMember(scope, await inspectInventory(scope));
  assertSame(scope.member, observed, 'source dev current exclusion');
  assertSourceDevExcluded(observed);
}

/**
 * Own both layouts, retain private durable intent, disable restart by captured full ID and
 * stop the whole private PID namespace. No init requirement is needed after terminal/PID-zero.
 * Every outcome retains all records/current Docker state; token expires even when final inspection fails.
 */
export async function withSourceDevExcluded<T>(
  owner: DependencyOwner,
  layouts: { readonly prod: EnvLayout; readonly dev: EnvLayout },
  sha: string,
  runDocker: RunDocker,
  deadline: number,
  action: (exclusion: SourceDevExclusion) => Promise<T>,
): Promise<T> {
  layouts = structuredClone(layouts);
  if (layouts.prod.env !== 'prod' || layouts.dev.env !== 'dev' || !/^[a-f0-9]{40}$/.test(sha))
    throw new Error('source dev requires exact prod/dev layouts and full SHA');
  await assertDependencyOwner(owner, layouts.prod, sha);
  await assertDependencyOwner(owner, layouts.dev, sha);
  const docker = ownerDockerHashed(owner, layouts.dev, runDocker);
  const scope: SourceScope = {
    owner,
    layouts,
    sha,
    docker,
    deadline,
    member: null,
    records: [],
  };
  await assertScope(scope);
  const initial = await observeMember(scope, await inspectInventory(scope));
  const intent = {
    attempt: randomUUID(),
    sha,
    layouts,
    member: {
      id: initial.id,
      image: initial.image,
      snapshotSha256: createHash('sha256').update(JSON.stringify(initial)).digest('hex'),
    },
  };
  async function retain(label: string, record: object): Promise<void> {
    const path = `${layouts.dev.stateDir}/dependency-source-dev-${label}.json`;
    const contents = `${JSON.stringify(record)}\n`;
    await publishRecord(path, contents);
    scope.records.push({ path, contents });
    await assertScope(scope);
  }
  await retain('intent', intent);
  assertSame(
    initial,
    await observeMember(scope, await inspectInventory(scope)),
    'source dev pre-effect identity',
  );
  // Proof: restart-call omission failed exact stopped source token at independent policy readback (exit 1).
  await runDockerBefore(['update', '--restart=no', initial.id], docker, deadline);
  const inhibited = await observeMember(scope, await inspectInventory(scope));
  assertSame(
    sourceDevIdentity(initial),
    sourceDevIdentity(inhibited),
    'source dev restart update identity',
  );
  assertSame(
    { Name: 'no', MaximumRetryCount: 0 },
    inhibited.host['RestartPolicy'],
    'source dev restart update readback',
  );
  assertSame(initial.state, inhibited.state, 'source dev unchanged process before stop');
  // Proof: stop-call omission failed exact stopped source token at independent terminal/PID-zero readback (exit 1).
  await runDockerBefore(['stop', '--time', '10', initial.id], docker, deadline);
  const terminal = await observeMember(scope, await inspectInventory(scope));
  assertSame(
    sourceDevIdentity(initial),
    sourceDevIdentity(terminal),
    'source dev stopped identity',
  );
  assertSourceDevExcluded(terminal);
  scope.member = terminal;
  await inspectScope(scope);
  await retain('complete', {
    intentSha256: createHash('sha256').update(JSON.stringify(intent)).digest('hex'),
    member: {
      id: terminal.id,
      image: terminal.image,
      snapshotSha256: createHash('sha256').update(JSON.stringify(terminal)).digest('hex'),
    },
  });
  await inspectScope(scope);
  const exclusion: SourceDevExclusion = Object.freeze({ [identity]: true as const });
  exclusions.set(exclusion, scope);
  try {
    return await action(exclusion);
  } finally {
    try {
      // Proof: final-readback omission admitted resumed/config/retained-byte faults; all three source final negatives failed.
      await inspectScope(scope);
    } finally {
      // Proof: expiry omission made the post-callback token usable; exact stopped source token failed (exit 1).
      exclusions.delete(exclusion);
    }
  }
}

/** Complete audit identity with mount ordering only for the live capability's exact raw source. */
export async function identifySourceAuditInventory(
  owner: DependencyOwner,
  layout: EnvLayout,
  token: SourceDevExclusion,
  inventory: readonly unknown[],
): Promise<unknown> {
  const raw = await inspectExcludedSourceMember(owner, layout, token, inventory);
  const scope = exclusions.get(token);
  if (scope === undefined) throw new Error('source dev exclusion expired during inspection');
  return identifySourceInventory(inventory, raw);
}

/**
 * Recognizes only the exact raw member of this same complete audit inventory, under the exact
 * live owner/layout/SHA and retained byte binding, then independently re-observes current exclusion.
 * Copied/foreign/expired tokens and missing/replaced/restarted inventory members always refuse.
 * An optional finite future deadline only tightens nested reads; final authority remains the original scope.
 */
export async function inspectExcludedSourceMember(
  owner: DependencyOwner,
  layout: EnvLayout,
  token: SourceDevExclusion,
  inventory: readonly unknown[],
  deadline?: number,
): Promise<unknown> {
  const original = exclusions.get(token);
  // Proof: owner-comparison omission admitted the foreign live owner; foreign-owner recognition negative failed (exit 1).
  if (original?.owner !== owner) throw new Error('source dev exclusion is not live for owner');
  const scope = limitObservation(original, deadline);
  assertSame(scope.layouts.prod, layout, 'source dev backend layout');
  await assertScope(scope);
  const current = await inspectInventory(scope);
  // Proof: omitting complete equality admitted an omitted unrelated writer and erased unrelated mounts; both complete-inventory negatives failed.
  const raw = findSource(inventory, scope.layouts.dev);
  const observed = await observeMember(scope, inventory);
  const currentRaw = findSource(current, scope.layouts.dev);
  decodeSourceDev(currentRaw, scope.layouts.dev);
  assertSame(
    identifySourceInventory(current, currentRaw),
    identifySourceInventory(inventory, raw),
    'complete audit inventory',
  );
  // Proof: retained-member equality omission admitted coherent caller finish/exit-code drift; both terminal-identity negatives failed.
  assertSame(scope.member, observed, 'source dev audit inventory member');
  assertSourceDevExcluded(observed);
  await inspectScope(scope);
  // Proof: final-expiry omission returned in-flight proof after callback expiry; original-authority
  // substitution also failed successful bounded reads. Both use original WeakMap authority.
  if (exclusions.get(token) !== original)
    throw new Error('source dev exclusion expired during inspection');
  return raw;
}

/**
 * Fresh owner-only source inspection; retained completion grants no ordinary admission.
 * An optional deadline tightens nested reads without extending or replacing original scope authority.
 */
export async function inspectSourceDevExclusion(
  owner: DependencyOwner,
  token: SourceDevExclusion,
  deadline?: number,
): Promise<void> {
  const original = exclusions.get(token);
  // Proof: owner-comparison omission admitted the foreign live owner; foreign-owner recognition negative failed (exit 1).
  if (original?.owner !== owner) throw new Error('source dev exclusion is not live for owner');
  const scope = limitObservation(original, deadline);
  await inspectScope(scope);
  // Proof: final-expiry omission returned in-flight proof after callback expiry; original-authority
  // substitution also failed successful bounded reads. Both use original WeakMap authority.
  if (exclusions.get(token) !== original)
    throw new Error('source dev exclusion expired during inspection');
}

/** Fresh source-only parked monitoring; never returns audit recognition or recreates an exclusion token. */
export async function assertParkedSourceDev(
  owner: DependencyOwner,
  layouts: { readonly prod: EnvLayout; readonly dev: EnvLayout },
  sha: string,
  expected: SourceDevMember,
  inventory: readonly unknown[],
  runDocker: RunDocker,
  deadline: number,
): Promise<void> {
  const scope: SourceScope = {
    owner,
    layouts,
    sha,
    member: null,
    records: [],
    deadline,
    docker: ownerDockerHashed(owner, layouts.dev, runDocker),
  };
  await assertScope(scope);
  const observed = await observeMember(scope, inventory);
  assertSame(expected, observed, 'restoration parked source');
  assertSourceDevExcluded(observed);
  await assertScope(scope);
}
