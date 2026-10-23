import { createHash, randomUUID } from 'node:crypto';

import {
  type BackendCohort as Cohort,
  type GatewayBinding,
  gatewayBinding,
  inspectBackendCohort as inspectCohort,
  parseBackendCohort as parseCohort,
  parseGatewayBinding,
} from './backend-cohort';
import { assertNoBackendFence } from './backend-fence';
import { type RunDocker, runDockerBefore } from './docker-deadline';
import { type DockerExec, runDockerExec } from './docker-exec';
import {
  assertDependencyOwner,
  type DependencyOwner,
  ownerDocker,
  ownerDockerExec,
} from './edge-ownership';
import type { EnvLayout } from './env';
import { inspectGatewayFenceUnderLock } from './gateway-exclusion';
import { withLock } from './lock';
import {
  assertExcluded,
  assertRoot,
  assertSame,
  projectIdentities,
  publishRecord,
  readClosed,
  readRecord,
  readString,
} from './managed-cohort';
import { verifyContainerNamespace } from './mount-audit';

const MARKER = '{"format":"dependency-backend-fence","version":1}\n';
const INTENT = 'dependency-backend-intent.json';
const COMPLETE = 'dependency-backend-complete.json';
const COLORS = ['blue', 'green'] as const;
const SHA = /^[a-f0-9]{40}$/;

interface Intent {
  format: 'dependency-backend-intent';
  version: 1;
  attempt: string;
  environment: string;
  root: string;
  network: string;
  sha: string;
  cohort: Cohort;
  gateway: GatewayBinding;
}
/** Historical receipt only. {@link inspectBackendFence} must freshly prove physical exclusion. */
export interface BackendCompletion {
  format: 'dependency-backend-complete';
  version: 1;
  attempt: string;
  intentSha256: string;
  cohort: Cohort;
  gateway: GatewayBinding;
}

function digestIntent(contents: string): string {
  return createHash('sha256').update(contents).digest('hex');
}

function serializeRecord(record: unknown): string {
  return `${JSON.stringify(record)}\n`;
}
function parseIntent(contents: string, layout: EnvLayout): Intent {
  const record = readClosed(JSON.parse(contents), [
    'format',
    'version',
    'attempt',
    'environment',
    'root',
    'network',
    'sha',
    'cohort',
    'gateway',
  ]);
  if (
    record['format'] !== 'dependency-backend-intent' ||
    record['version'] !== 1 ||
    record['environment'] !== layout.env ||
    record['root'] !== layout.root ||
    record['network'] !== layout.network ||
    !SHA.test(readString(record['sha'])) ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      readString(record['attempt']),
    )
  )
    throw new Error('backend fence intent provenance is malformed or foreign');
  return {
    format: 'dependency-backend-intent',
    version: 1,
    attempt: readString(record['attempt']),
    environment: layout.env,
    root: layout.root,
    network: layout.network,
    sha: readString(record['sha']),
    cohort: parseCohort(record['cohort'], layout),
    gateway: parseGatewayBinding(record['gateway']),
  };
}
async function readRetainedRecord(path: string): Promise<string | null> {
  try {
    return await readRecord(path);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return null;
    throw cause;
  }
}
async function readCompletion(
  layout: EnvLayout,
): Promise<{ intent: Intent; completion: BackendCompletion }> {
  const marker = await readRetainedRecord(`${layout.stateDir}/dependency-backend-fence.json`);
  const contents = await readRetainedRecord(`${layout.stateDir}/${INTENT}`);
  const completed = await readRetainedRecord(`${layout.stateDir}/${COMPLETE}`);
  if (marker === null && contents === null && completed === null)
    throw new Error('backend fence absent; no physical exclusion proof');
  if (completed !== null && (marker === null || contents === null))
    throw new Error(
      'backend fence corrupt orphan completion; retain evidence; attended recovery required',
    );
  if (marker === null)
    throw new Error(
      'backend fence corrupt orphan intent; retain evidence; attended recovery required',
    );
  assertSame(MARKER, marker, 'marker');
  if (contents === null)
    throw new Error(
      'backend fence interrupted before durable intent; retain marker; attended recovery required',
    );
  const intent = parseIntent(contents, layout);
  if (completed === null)
    throw new Error(
      'backend fence uncertain without completion; retain current Docker state; attended recovery required',
    );
  // Proof: extra-completion-field is refused even when the intent remains valid; no historical receipt grants exclusion.
  const record = readClosed(JSON.parse(completed), [
    'format',
    'version',
    'attempt',
    'intentSha256',
    'cohort',
    'gateway',
  ]);
  if (
    record['format'] !== 'dependency-backend-complete' ||
    record['version'] !== 1 ||
    record['attempt'] !== intent.attempt ||
    record['intentSha256'] !== digestIntent(contents)
  )
    throw new Error('backend fence completion is not bound to persisted intent');
  assertSame(intent.gateway, parseGatewayBinding(record['gateway']), 'completed gateway binding');
  const completion: BackendCompletion = {
    format: 'dependency-backend-complete',
    version: 1,
    attempt: intent.attempt,
    intentSha256: digestIntent(contents),
    cohort: parseCohort(record['cohort'], layout),
    gateway: parseGatewayBinding(record['gateway']),
  };
  assertSame(
    projectIdentities(intent.cohort),
    projectIdentities(completion.cohort),
    'completed identity',
  );
  assertExcluded(completion.cohort);
  return { intent, completion };
}

/**
 * Publish retained intent, disable restart and stop only the exact managed Compose blue/green IDs.
 * Owns deploy.lock; requires existing verified gateway exclusion. All Docker observations/effects share
 * one bounded budget. Any failure after publication retains evidence and current Docker state;
 * no cleanup, restart, activation, exposure or broad participant claim is authorized.
 * Existing backends without init/private PID/strict image/labels need attended preparation.
 * See docs/runbook-prod-deploy.md#managed-compose-backend-exclusion.
 */
export async function fenceBackends(
  layout: EnvLayout,
  sha: string,
  runDocker: RunDocker,
  totalMs = 60000,
  namespaceProof: typeof verifyContainerNamespace = verifyContainerNamespace,
): Promise<BackendCompletion> {
  if (!SHA.test(sha) || !Number.isFinite(totalMs) || totalMs <= 0)
    throw new Error('backend fence requires full git SHA and finite positive deadline');
  // Proof: holding the actual flock makes both backend executor/inspector refuse before Docker.
  return await withLock(`${layout.stateDir}/deploy.lock`, async () => {
    return await fenceBackendCore(
      layout,
      sha,
      runDocker,
      performance.now() + totalMs,
      namespaceProof,
    );
  });
}

/** Live owner path; takes no nested flock and grants no activation authority. */
export async function fenceBackendsUnderOwner(
  owner: DependencyOwner,
  layout: EnvLayout,
  sha: string,
  runDocker: RunDocker,
  deadline: number,
  namespaceProof: typeof verifyContainerNamespace = verifyContainerNamespace,
  execDocker: DockerExec = runDockerExec,
): Promise<BackendCompletion> {
  await assertDependencyOwner(owner, layout, sha);
  // Proof: bypassing ownerDockerExec made composed acceptance reach scanner without nonce-bound durable intent (exit 1).
  const verifyOwnedNamespace: typeof verifyContainerNamespace = (
    container,
    destinations,
    databaseHostPath,
    image,
    docker,
    databasePath,
    bounds,
  ) =>
    namespaceProof(
      container,
      destinations,
      databaseHostPath,
      image,
      docker,
      databasePath,
      bounds,
      ownerDockerExec(owner, layout, execDocker),
    );
  return fenceBackendCore(
    layout,
    sha,
    ownerDocker(owner, layout, runDocker),
    deadline,
    verifyOwnedNamespace,
  );
}

async function fenceBackendCore(
  layout: EnvLayout,
  sha: string,
  runDocker: RunDocker,
  deadline: number,
  namespaceProof: typeof verifyContainerNamespace,
): Promise<BackendCompletion> {
  await assertRoot(layout);
  await assertNoBackendFence(layout.stateDir);
  // Proof: missing-gateway and resumed-gateway production invocations refuse before backend publication/effects.
  await inspectGatewayFenceUnderLock(layout, runDocker, deadline);
  const gateway = await gatewayBinding(layout);
  const cohort = await inspectCohort(layout, runDocker, deadline, gateway, namespaceProof);
  try {
    await publishRecord(`${layout.stateDir}/dependency-backend-fence.json`, MARKER);
    const intent: Intent = {
      format: 'dependency-backend-intent',
      version: 1,
      attempt: randomUUID(),
      environment: layout.env,
      root: layout.root,
      network: layout.network,
      sha,
      cohort,
      gateway,
    };
    const contents = serializeRecord(intent);
    // Proof: deleting this publication fails every-backend-effect-before-durable-intent (exit 1).
    await publishRecord(`${layout.stateDir}/${INTENT}`, contents);
    assertSame(
      cohort,
      await inspectCohort(layout, runDocker, deadline, gateway, namespaceProof),
      'pre-effect cohort',
    );
    for (const color of COLORS) {
      const backend = cohort[color];
      if (backend === null) continue;
      // Proof: suppressing update fails both-colours success at independent policy readback (exit 1).
      await runDockerBefore(['update', '--restart=no', backend.id], runDocker, deadline);
      const observed = await inspectCohort(layout, runDocker, deadline, gateway, namespaceProof);
      const expected: Cohort = structuredClone(cohort);
      const updated = expected[color];
      if (updated === null) throw new Error('backend fence lost known cohort member');
      updated.restartPolicy = { name: 'no', maximumRetryCount: 0 };
      // Proof: deleting this readback admits stop after skipped restart; skipped-restart negative fails (exit 1).
      assertSame(expected, observed, 'restart update readback');
      cohort[color] = observed[color];
    }
    for (const color of COLORS) {
      const backend = cohort[color];
      if (backend === null) continue;
      // Proof: suppressing stop fails both-colours success at fresh process/PID exclusion (exit 1).
      await runDockerBefore(['stop', '--time', '10', backend.id], runDocker, deadline);
      const observed = await inspectCohort(layout, runDocker, deadline, gateway, namespaceProof);
      assertSame(projectIdentities(cohort), projectIdentities(observed), 'stop identity readback');
      const stopped = observed[color];
      if (stopped === null) throw new Error('backend fence lost stopped member');
      assertExcluded({ blue: stopped, green: null });
      for (const other of COLORS)
        if (other !== color) assertSame(cohort[other], observed[other], 'unaffected member');
      cohort[color] = stopped;
    }
    const stopped = await inspectCohort(layout, runDocker, deadline, gateway, namespaceProof);
    assertSame(cohort, stopped, 'fresh stopped cohort');
    assertExcluded(stopped);
    const completion: BackendCompletion = {
      format: 'dependency-backend-complete',
      version: 1,
      attempt: intent.attempt,
      intentSha256: digestIntent(contents),
      cohort: stopped,
      gateway,
    };
    await publishRecord(`${layout.stateDir}/${COMPLETE}`, serializeRecord(completion));
    const retained = await readCompletion(layout);
    assertSame(completion, retained.completion, 'completion readback');
    // Proof: substituting historical stopped state admits completion-drift; its production-path negative fails (exit 1).
    const final = await inspectCohort(layout, runDocker, deadline, gateway, namespaceProof);
    assertSame(stopped, final, 'final current cohort');
    assertExcluded(final);
    return completion;
  } catch (cause) {
    throw new Error(
      `backend fence failed after publication; retain all dependency-backend records and current Docker state; explicit attended recovery required; no restart or automatic cleanup: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
}

/** Read-only lock-owned proof; historical completion alone never establishes present exclusion. */
export async function inspectBackendFence(
  layout: EnvLayout,
  runDocker: RunDocker,
  namespaceProof: typeof verifyContainerNamespace = verifyContainerNamespace,
): Promise<BackendCompletion> {
  // Proof: holding the actual flock makes both backend executor/inspector refuse before Docker.
  return await withLock(`${layout.stateDir}/deploy.lock`, async () => {
    return await inspectBackendFenceUnderLock(
      layout,
      runDocker,
      performance.now() + 60000,
      namespaceProof,
    );
  });
}

/**
 * Freshly inspect retained backend/gateway exclusion while the caller holds this
 * layout's deploy.lock. Shares the owner's total Docker deadline; never acquires
 * another lock and establishes no completeness beyond this managed DB cohort.
 */
export async function inspectBackendFenceUnderLock(
  layout: EnvLayout,
  runDocker: RunDocker,
  deadline: number = performance.now() + 60000,
  namespaceProof: typeof verifyContainerNamespace = verifyContainerNamespace,
): Promise<BackendCompletion> {
  await assertRoot(layout);
  const { completion, intent } = await readCompletion(layout);
  const gateway = intent.gateway;
  const observed = await inspectCohort(layout, runDocker, deadline, gateway, namespaceProof);
  // Proof: deleting current-cohort equality admits a replaced main DB inode; replaced-main-file negative fails (exit 1).
  assertSame(completion.cohort, observed, 'current completed cohort');
  assertExcluded(observed);
  return completion;
}
