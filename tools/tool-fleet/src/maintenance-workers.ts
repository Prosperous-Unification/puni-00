import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';
import { parse } from 'yaml';

import { createKubectl, type Kubectl } from './recover';

const templatePath = 'infra/platform/workers-jobs/synthetic-job.yaml';

export type SyntheticScenario = 'complete' | 'exhaust-memory' | 'exhaust-disk';

export interface SyntheticRequest {
  readonly runId: string;
  readonly scenario: SyntheticScenario;
  readonly holdSeconds: number;
  readonly bundleConfigMap: string;
}

const Resources = type({
  requests: { cpu: 'string', memory: 'string', 'ephemeral-storage': 'string', '+': 'reject' },
  limits: { cpu: 'string', memory: 'string', 'ephemeral-storage': 'string', '+': 'reject' },
  '+': 'reject',
});

// The template may change values but never drop a bound: every key below is required.
const BoundedJob = type({
  apiVersion: "'batch/v1'",
  kind: "'Job'",
  metadata: { name: 'string', namespace: "'workers'", labels: 'object' },
  spec: {
    backoffLimit: '0 <= number.integer <= 1',
    activeDeadlineSeconds: '0 < number.integer <= 900',
    // The authority deletes a Job after recording its outcome; a TTL would delete it first, and
    // an absent Job would then read as a lost run.
    // Proof: with this key allowed, the TTL negative in maintenance-workers.test.ts decoded.
    'ttlSecondsAfterFinished?': 'never',
    podReplacementPolicy: "'Failed'",
    podFailurePolicy: {
      rules: type({
        action: "'Ignore'",
        onPodConditions: type({ type: "'DisruptionTarget'" }).array().exactlyLength(1),
      })
        .or({ action: "'FailJob'", onExitCodes: 'object' })
        .array()
        .exactlyLength(2),
    },
    template: {
      metadata: {
        labels: { 'puni.dev/workload': "'worker'", 'puni.dev/proof': "'infrastructure'" },
      },
      spec: {
        restartPolicy: "'Never'",
        serviceAccountName: "'worker'",
        automountServiceAccountToken: 'false',
        terminationGracePeriodSeconds: 'number.integer <= 60',
        nodeSelector: { 'puni.dev/capability-execution': "'true'", '+': 'reject' },
        securityContext: { runAsNonRoot: 'true', seccompProfile: { type: "'RuntimeDefault'" } },
        containers: type({
          name: "'worker'",
          image: 'string',
          env: type({ name: 'string', value: 'string' }).array(),
          resources: Resources,
          securityContext: {
            allowPrivilegeEscalation: 'false',
            readOnlyRootFilesystem: 'true',
            capabilities: { drop: type("'ALL'").array().exactlyLength(1) },
          },
        })
          .array()
          .exactlyLength(1),
        // Proof: with medium optional, the disk-backed-scratch negative in
        // maintenance-workers.test.ts decoded (2026-09-18).
        volumes: type({
          name: "'workspace'",
          emptyDir: { medium: "'Memory'", sizeLimit: 'string', '+': 'reject' },
          '+': 'reject',
        })
          .or({
            name: "'runner'",
            emptyDir: { medium: "'Memory'", sizeLimit: 'string', '+': 'reject' },
            '+': 'reject',
          })
          .or({ name: "'bundle'", configMap: { name: 'string', '+': 'reject' }, '+': 'reject' })
          .array()
          .exactlyLength(3),
      },
    },
  },
});

type BoundedJob = typeof BoundedJob.infer;

/**
 * Decode the committed synthetic Job template. Throws when any bound (retry, deadline,
 * replacement policy, disruption rule, limits, scratch size, restricted context, no API token,
 * execution placement) is absent, so a loosened template cannot reach a cluster.
 */
export function decodeSyntheticTemplate(input: unknown): BoundedJob {
  const job = BoundedJob(input);
  if (job instanceof type.errors) {
    // Proof: with the template's podReplacementPolicy removed, this refused with
    // `spec.podReplacementPolicy must be "Failed"` in maintenance-workers.test.ts.
    throw new Error(`Synthetic Job template is unbounded: ${job.summary}`);
  }
  return job;
}

/** Name the immutable bundle ConfigMap after the bundle's bytes. */
export function bundleConfigMapName(bundle: Uint8Array): string {
  return `harness-worker-${createHash('sha256').update(bundle).digest('hex').slice(0, 12)}`;
}

export function renderBundleConfigMap(bundle: Uint8Array): Record<string, unknown> {
  return {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: bundleConfigMapName(bundle),
      namespace: 'workers',
      labels: { 'puni.dev/proof': 'infrastructure' },
    },
    immutable: true,
    binaryData: { 'worker.js.gz': Buffer.from(bundle).toString('base64') },
  };
}

/** Render one run's Job. The name derives from the run id, so the API refuses a second start. */
export function renderSyntheticJob(template: BoundedJob, request: SyntheticRequest): BoundedJob {
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(request.runId)) {
    throw new Error(`Synthetic run id is invalid: ${request.runId}`);
  }
  const values: Record<string, string> = {
    PUNI_RUN_ID: request.runId,
    PUNI_SCENARIO: request.scenario,
    PUNI_HOLD_SECONDS: String(request.holdSeconds),
  };
  const [container] = template.spec.template.spec.containers;
  const runLabels = { 'puni.dev/run-id': request.runId };
  return {
    ...template,
    metadata: {
      ...template.metadata,
      name: `synthetic-${request.runId}`,
      labels: { ...template.metadata.labels, ...runLabels },
    },
    spec: {
      ...template.spec,
      template: {
        ...template.spec.template,
        metadata: { labels: { ...template.spec.template.metadata.labels, ...runLabels } },
        spec: {
          ...template.spec.template.spec,
          containers: [
            {
              ...container,
              env: container.env.map((variable) => ({
                name: variable.name,
                value: values[variable.name] ?? variable.value,
              })),
            },
          ],
          volumes: template.spec.template.spec.volumes.map((volume) =>
            volume.name === 'bundle'
              ? { name: 'bundle', configMap: { name: request.bundleConfigMap } }
              : volume,
          ),
        },
      },
    },
  };
}

const RunState = type({
  state: "'dispatched' | 'complete' | 'failed' | 'cancelled'",
  attempts: 'number.integer >= 1',
  cluster: 'string',
  scenario: "'complete' | 'exhaust-memory' | 'exhaust-disk'",
  holdSeconds: 'number.integer >= 0',
  bundleConfigMap: 'string',
  // kube-system's namespace UID when the run was last started: a new UID means a new cluster.
  clusterUid: 'string>0',
  'detail?': 'string',
  '+': 'reject',
});
const Journal = type({ runs: type({ '[string]': RunState }) });
export type AuthorityJournal = typeof Journal.infer;
type RunRecord = typeof RunState.infer;

function lookupRun(journal: AuthorityJournal, runId: string): RunRecord | undefined {
  return Object.hasOwn(journal.runs, runId) ? journal.runs[runId] : undefined;
}

/**
 * Stand-in for Twilight's durable authority: a JSON file outside every cluster. Absent means
 * no run was ever dispatched; a present but unreadable or malformed journal throws.
 */
export async function readJournal(path: string): Promise<AuthorityJournal> {
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return { runs: {} };
    throw new Error(`Authority journal ${path} cannot be read`, { cause });
  }
  const journal = Journal(JSON.parse(source));
  if (journal instanceof type.errors)
    throw new Error(`Authority journal is invalid: ${journal.summary}`);
  return journal;
}

async function writeJournal(path: string, journal: AuthorityJournal): Promise<void> {
  await writeFile(`${path}.partial`, `${JSON.stringify(journal, null, 2)}\n`);
  await rename(`${path}.partial`, path);
}

/** Maximum starts of one run across cluster loss; the authority gives up loudly after it. */
export const maximumAttempts = 2;

async function createJob(kubectl: Kubectl, job: BoundedJob): Promise<void> {
  try {
    await kubectl(['create', '--filename=-', '--output=name'], JSON.stringify(job));
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes('AlreadyExists')) {
      // Proof: with this translation disabled, the API duplicate-start negative failed on
      // 2026-09-18: the raw server error no longer named the refused run.
      throw new Error(`Duplicate start refused: ${job.metadata.name} already exists`, { cause });
    }
    throw cause;
  }
}

/** The UID of kube-system: it changes only when the cluster itself is recreated. */
async function clusterIdentity(kubectl: Kubectl): Promise<string> {
  const uid = (
    await kubectl(['get', 'namespace', 'kube-system', '--output=jsonpath={.metadata.uid}'])
  ).trim();
  if (uid.length === 0) throw new Error('kube-system has no UID; cannot identify the cluster');
  return uid;
}

async function ensureBundle(kubectl: Kubectl, bundle: Uint8Array): Promise<string> {
  const name = bundleConfigMapName(bundle);
  const existing = await kubectl([
    'get',
    'configmap',
    name,
    '--namespace=workers',
    '--ignore-not-found',
    '--output=name',
  ]);
  if (existing.trim().length === 0) {
    await kubectl(['create', '--filename=-'], JSON.stringify(renderBundleConfigMap(bundle)));
  }
  return name;
}

/** Record and start a new run. A run the authority already knows is never started again here. */
export async function dispatchRun(
  kubectl: Kubectl,
  template: BoundedJob,
  journalPath: string,
  request: Omit<SyntheticRequest, 'bundleConfigMap'> & {
    readonly cluster: string;
    readonly bundle: Uint8Array;
  },
): Promise<AuthorityJournal> {
  const journal = await readJournal(journalPath);
  const known = lookupRun(journal, request.runId);
  if (known !== undefined) {
    throw new Error(`Duplicate start refused: run ${request.runId} is already ${known.state}`);
  }
  const clusterUid = await clusterIdentity(kubectl);
  const bundleConfigMap = await ensureBundle(kubectl, request.bundle);
  await createJob(kubectl, renderSyntheticJob(template, { ...request, bundleConfigMap }));
  const updated = {
    runs: {
      ...journal.runs,
      [request.runId]: {
        state: 'dispatched' as const,
        attempts: 1,
        cluster: request.cluster,
        scenario: request.scenario,
        holdSeconds: request.holdSeconds,
        bundleConfigMap,
        clusterUid,
      },
    },
  };
  await writeJournal(journalPath, updated);
  return updated;
}

const JobStatus = type({
  metadata: { uid: 'string' },
  'status?': {
    'succeeded?': 'number',
    'conditions?': type({ type: 'string', status: 'string', 'reason?': 'string' }).array(),
  },
});

/**
 * Move one dispatched run forward from what the cluster reports. A Job that vanished because
 * its cluster was recreated (kube-system has a new UID) is started again under the same run id
 * until {@link maximumAttempts}; a Job that vanished from the same cluster is a failed run
 * whose outcome is unknown, never a restart. After recording an outcome the authority deletes
 * the Job; the cluster never decides a run's outcome by forgetting it.
 */
export async function reconcileRun(
  kubectl: Kubectl,
  template: BoundedJob,
  journalPath: string,
  runId: string,
  bundle: Uint8Array,
): Promise<AuthorityJournal> {
  const journal = await readJournal(journalPath);
  const run = lookupRun(journal, runId);
  if (run === undefined) throw new Error(`Run ${runId} was never dispatched`);
  if (run.state !== 'dispatched') return journal;
  const observed = await kubectl([
    'get',
    'job',
    `synthetic-${runId}`,
    '--namespace=workers',
    '--ignore-not-found',
    '--output=json',
  ]);
  let next: typeof run;
  if (observed.trim().length === 0) {
    const clusterUid = await clusterIdentity(kubectl);
    if (clusterUid === run.clusterUid) {
      // Proof: with this branch removed, the same-cluster negative restarted a run whose Job
      // had been deleted after it completed (maintenance-workers.test.ts, 2026-09-18).
      next = { ...run, state: 'failed', detail: 'outcome unknown: Job absent on the same cluster' };
    } else if (run.attempts >= maximumAttempts) {
      next = { ...run, state: 'failed', detail: `Job lost ${String(run.attempts)} times` };
    } else {
      const bundleConfigMap = await ensureBundle(kubectl, bundle);
      await createJob(
        kubectl,
        renderSyntheticJob(template, {
          runId,
          scenario: run.scenario,
          holdSeconds: run.holdSeconds,
          bundleConfigMap,
        }),
      );
      next = { ...run, attempts: run.attempts + 1, bundleConfigMap, clusterUid };
    }
  } else {
    const job = JobStatus(JSON.parse(observed));
    if (job instanceof type.errors) throw new Error(`Job status is invalid: ${job.summary}`);
    const failed = (job.status?.conditions ?? []).find(
      ({ type: kind, status }) => kind === 'Failed' && status === 'True',
    );
    if ((job.status?.succeeded ?? 0) >= 1) next = { ...run, state: 'complete' };
    else if (failed === undefined) return journal;
    else next = { ...run, state: 'failed', detail: failed.reason ?? 'Failed' };
  }
  const updated = { runs: { ...journal.runs, [runId]: next } };
  await writeJournal(journalPath, updated);
  if (next.state !== 'dispatched' && observed.trim().length > 0) {
    await kubectl([
      'delete',
      'job',
      `synthetic-${runId}`,
      '--namespace=workers',
      '--ignore-not-found',
      '--wait=true',
    ]);
  }
  return updated;
}

/** Cancel a dispatched run: the authority records the decision, then the Job is deleted. */
export async function cancelRun(
  kubectl: Kubectl,
  journalPath: string,
  runId: string,
): Promise<AuthorityJournal> {
  const journal = await readJournal(journalPath);
  const run = lookupRun(journal, runId);
  if (run?.state !== 'dispatched') throw new Error(`Run ${runId} is not dispatched`);
  const updated = { runs: { ...journal.runs, [runId]: { ...run, state: 'cancelled' as const } } };
  await writeJournal(journalPath, updated);
  await kubectl(['delete', 'job', `synthetic-${runId}`, '--namespace=workers', '--wait=true']);
  return updated;
}

function flag(argv: readonly string[], name: string): string {
  const position = argv.indexOf(name);
  const value = position < 0 ? undefined : argv[position + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`Missing required ${name}`);
  return value;
}

async function runCli(argv: readonly string[], root: string): Promise<unknown> {
  const [command, ...rest] = argv;
  const kubectl = createKubectl(flag(rest, '--kubectl'), flag(rest, '--kubeconfig'));
  const journalPath = flag(rest, '--journal');
  const runId = flag(rest, '--run');
  const template = decodeSyntheticTemplate(parse(await readFile(join(root, templatePath), 'utf8')));
  switch (command) {
    case 'dispatch': {
      const scenario = flag(rest, '--scenario');
      if (scenario !== 'complete' && scenario !== 'exhaust-memory' && scenario !== 'exhaust-disk') {
        throw new Error(`Unknown synthetic scenario ${scenario}`);
      }
      return dispatchRun(kubectl, template, journalPath, {
        runId,
        scenario,
        holdSeconds: Number.parseInt(flag(rest, '--hold-seconds'), 10),
        cluster: flag(rest, '--cluster'),
        bundle: new Uint8Array(await readFile(flag(rest, '--bundle'))),
      });
    }
    case 'reconcile':
      return reconcileRun(
        kubectl,
        template,
        journalPath,
        runId,
        new Uint8Array(await readFile(flag(rest, '--bundle'))),
      );
    case 'cancel':
      return cancelRun(kubectl, journalPath, runId);
    default:
      throw new Error('Usage: maintenance-workers.ts dispatch|reconcile|cancel --flag value ...');
  }
}

if (import.meta.main) {
  console.log(
    JSON.stringify(await runCli(process.argv.slice(2), join(import.meta.dir, '../../..')), null, 2),
  );
}
