import { createHash, randomUUID } from 'node:crypto';

import { type RunDocker, runDockerBefore } from './docker-deadline';
import { assertDependencyOwner, type DependencyOwner, ownerDocker } from './edge-ownership';
import type { EnvLayout } from './env';
import { assertNoGatewayFence } from './gateway-fence';
import { withLock } from './lock';
import {
  assertExcluded,
  assertRoot,
  assertSame,
  inspectManagedCohort as inspectCohort,
  type ManagedCohort as Cohort,
  parseManagedCohort as parseCohort,
  projectIdentities,
  publishRecord,
  readClosed,
  readRecord,
  readString,
} from './managed-cohort';

const MARKER = '{"format":"dependency-gateway-fence","version":1}\n';
const INTENT = 'dependency-gateway-intent.json';
const COMPLETE = 'dependency-gateway-complete.json';
const COLORS = ['blue', 'green'] as const;
const SHA = /^[a-f0-9]{40}$/;

interface Intent {
  format: 'dependency-gateway-intent';
  version: 1;
  attempt: string;
  environment: string;
  root: string;
  network: string;
  sha: string;
  cohort: Cohort;
}
/** Historical receipt only. {@link inspectGatewayFence} must freshly prove physical exclusion. */
export interface GatewayCompletion {
  format: 'dependency-gateway-complete';
  version: 1;
  attempt: string;
  intentSha256: string;
  cohort: Cohort;
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
  ]);
  if (
    record['format'] !== 'dependency-gateway-intent' ||
    // Proof: omitting intent version validation admitted wrong-intent-version even with a recomputed binding hash.
    record['version'] !== 1 ||
    record['environment'] !== layout.env ||
    record['root'] !== layout.root ||
    record['network'] !== layout.network ||
    !SHA.test(readString(record['sha'])) ||
    // Proof: the mounted wrong-intent-attempt negative admitted a non-UUID with matching completion/hash before this grammar.
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      readString(record['attempt']),
    )
  )
    throw new Error('gateway fence intent provenance is malformed or foreign');
  return {
    format: 'dependency-gateway-intent',
    version: 1,
    attempt: readString(record['attempt']),
    environment: layout.env,
    root: layout.root,
    network: layout.network,
    sha: readString(record['sha']),
    cohort: parseCohort(record['cohort'], layout),
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
): Promise<{ intent: Intent; completion: GatewayCompletion }> {
  const marker = await readRetainedRecord(`${layout.stateDir}/dependency-gateway-fence.json`);
  const contents = await readRetainedRecord(`${layout.stateDir}/${INTENT}`);
  const completed = await readRetainedRecord(`${layout.stateDir}/${COMPLETE}`);
  if (marker === null && contents === null && completed === null)
    throw new Error('gateway fence absent; no physical exclusion proof');
  if (completed !== null && (marker === null || contents === null))
    throw new Error(
      'gateway fence corrupt orphan completion; retain evidence; attended recovery required',
    );
  if (marker === null)
    throw new Error(
      'gateway fence corrupt orphan intent; retain evidence; attended recovery required',
    );
  assertSame(MARKER, marker, 'marker');
  if (contents === null)
    throw new Error(
      'gateway fence interrupted before durable intent; retain marker; attended recovery required',
    );
  const intent = parseIntent(contents, layout);
  if (completed === null)
    throw new Error(
      'gateway fence uncertain without completion; retain current Docker state; attended recovery required',
    );
  const record = readClosed(JSON.parse(completed), [
    'format',
    'version',
    'attempt',
    'intentSha256',
    'cohort',
  ]);
  if (
    record['format'] !== 'dependency-gateway-complete' ||
    record['version'] !== 1 ||
    record['attempt'] !== intent.attempt ||
    // Proof: omitting byte-hash binding accepted changed-intent whitespace during mounted inspection.
    record['intentSha256'] !== digestIntent(contents)
  )
    throw new Error('gateway fence completion is not bound to persisted intent');
  const completion: GatewayCompletion = {
    format: 'dependency-gateway-complete',
    version: 1,
    attempt: intent.attempt,
    intentSha256: digestIntent(contents),
    cohort: parseCohort(record['cohort'], layout),
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
 * Owns deploy.lock; no caller can bypass ordinary admission. All Docker observations/effects share
 * one bounded budget. Any failure after publication retains evidence and current Docker state;
 * no cleanup, restart, activation, exposure or broad participant claim is authorized.
 * Existing gateways without init/private PID/strict image/labels need attended preparation.
 * See docs/runbook-prod-deploy.md#managed-compose-gateway-exclusion.
 */
export async function fenceGateways(
  layout: EnvLayout,
  sha: string,
  runDocker: RunDocker,
  totalMs = 60000,
): Promise<GatewayCompletion> {
  if (!SHA.test(sha) || !Number.isFinite(totalMs) || totalMs <= 0)
    throw new Error('gateway fence requires full git SHA and finite positive deadline');
  // Proof: bypassing lock acquisition let the mounted concurrent-operation negative execute under a held real flock.
  return await withLock(`${layout.stateDir}/deploy.lock`, async () => {
    return await fenceGatewayCore(layout, sha, runDocker, performance.now() + totalMs);
  });
}

/** Live owner path; takes no nested flock and grants no activation authority. */
export async function fenceGatewaysUnderOwner(
  owner: DependencyOwner,
  layout: EnvLayout,
  sha: string,
  runDocker: RunDocker,
  deadline: number,
): Promise<GatewayCompletion> {
  await assertDependencyOwner(owner, layout, sha);
  return fenceGatewayCore(layout, sha, ownerDocker(owner, layout, runDocker), deadline);
}

async function fenceGatewayCore(
  layout: EnvLayout,
  sha: string,
  runDocker: RunDocker,
  deadline: number,
): Promise<GatewayCompletion> {
  await assertRoot(layout);
  await assertNoGatewayFence(layout.stateDir);
  const cohort = await inspectCohort(layout, runDocker, deadline);
  try {
    await publishRecord(`${layout.stateDir}/dependency-gateway-fence.json`, MARKER);
    const intent: Intent = {
      format: 'dependency-gateway-intent',
      version: 1,
      attempt: randomUUID(),
      environment: layout.env,
      root: layout.root,
      network: layout.network,
      sha,
      cohort,
    };
    const contents = serializeRecord(intent);
    await publishRecord(`${layout.stateDir}/${INTENT}`, contents);
    assertSame(cohort, await inspectCohort(layout, runDocker, deadline), 'pre-effect cohort');
    for (const color of COLORS) {
      const gateway = cohort[color];
      if (gateway === null) continue;
      // Proof: suppressing update made the mounted successful fence fail its policy readback; stalled update retains intent at its shared deadline.
      await runDockerBefore(['update', '--restart=no', gateway.id], runDocker, deadline);
      const observed = await inspectCohort(layout, runDocker, deadline);
      const expected: Cohort = structuredClone(cohort);
      const updated = expected[color];
      if (updated === null) throw new Error('gateway fence lost known cohort member');
      updated.restartPolicy = { name: 'no', maximumRetryCount: 0 };
      assertSame(expected, observed, 'restart update readback');
      cohort[color] = observed[color];
    }
    for (const color of COLORS) {
      const gateway = cohort[color];
      if (gateway === null) continue;
      // Proof: suppressing exact-ID stop made the mounted successful fence refuse running/PID state.
      await runDockerBefore(['stop', '--time', '10', gateway.id], runDocker, deadline);
      const observed = await inspectCohort(layout, runDocker, deadline);
      assertSame(projectIdentities(cohort), projectIdentities(observed), 'stop identity readback');
      const stopped = observed[color];
      if (stopped === null) throw new Error('gateway fence lost stopped member');
      assertExcluded({ blue: stopped, green: null });
      for (const other of COLORS)
        if (other !== color) assertSame(cohort[other], observed[other], 'unaffected member');
      cohort[color] = stopped;
    }
    const stopped = await inspectCohort(layout, runDocker, deadline);
    assertSame(cohort, stopped, 'fresh stopped cohort');
    assertExcluded(stopped);
    const completion: GatewayCompletion = {
      format: 'dependency-gateway-complete',
      version: 1,
      attempt: intent.attempt,
      intentSha256: digestIntent(contents),
      cohort: stopped,
    };
    await publishRecord(`${layout.stateDir}/${COMPLETE}`, serializeRecord(completion));
    const retained = await readCompletion(layout);
    assertSame(completion, retained.completion, 'completion readback');
    // Proof: reusing stopped observations admitted completion-drift; the mounted final-current-state negative failed.
    const final = await inspectCohort(layout, runDocker, deadline);
    assertSame(stopped, final, 'final current cohort');
    assertExcluded(final);
    return completion;
  } catch (cause) {
    throw new Error(
      `gateway fence failed after publication; retain all dependency-gateway records and current Docker state; explicit attended recovery required; no restart or automatic cleanup: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
}

/** Read-only lock-owned proof; historical completion alone never establishes present exclusion. */
export async function inspectGatewayFence(
  layout: EnvLayout,
  runDocker: RunDocker,
): Promise<GatewayCompletion> {
  // Proof: bypassing lock acquisition let the mounted concurrent-operation negative execute under a held real flock.
  return await withLock(`${layout.stateDir}/deploy.lock`, async () => {
    return await inspectGatewayFenceUnderLock(layout, runDocker, performance.now() + 60000);
  });
}

/** Caller must hold this layout's deploy.lock; shares the owner's total Docker deadline. */
export async function inspectGatewayFenceUnderLock(
  layout: EnvLayout,
  runDocker: RunDocker,
  deadline: number,
): Promise<GatewayCompletion> {
  await assertRoot(layout);
  const { completion } = await readCompletion(layout);
  // Proof: trusting historical completion let the mounted inspection accept a resumed gateway.
  const observed = await inspectCohort(layout, runDocker, deadline);
  assertSame(completion.cohort, observed, 'current completed cohort');
  assertExcluded(observed);
  return completion;
}
