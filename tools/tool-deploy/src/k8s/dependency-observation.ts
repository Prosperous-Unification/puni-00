import { createHash, randomUUID } from 'node:crypto';

import {
  buildDependencyCapabilityCommand,
  buildDependencyInventoryCommand,
  decodeDependencyCapabilities,
  decodeDormantDependencies,
  type DependencyCapabilityObservation,
  type DormantDependencyStore,
  storedSnapshotCommand,
} from '@tools/deploy-contract';
import { assertDigestPinnedRef } from '@tools/docker';

/** An invocation identity binds output to one exact Job, Pod, image and coordinator command. */
export interface DependencyJobEvidence {
  observationId: string;
  namespace: string;
  jobName: string;
  jobUid: string;
  podUid: string;
  image: string;
  commandSha256: string;
}

/** Binary observation only; empty semantics is valid and grants no migration/activation permission. */
export interface DependencyBinaryObservation {
  evidence: DependencyJobEvidence;
  capability: DependencyCapabilityObservation;
}

/** Transport-only store observation; the caller must independently establish a stopped-storage interval. */
export interface DependencyStoreObservation {
  evidence: DependencyJobEvidence;
  authority: DormantDependencyStore;
}

/** Separate from release effects so observations cannot accidentally admit migration or exposure. */
export interface DependencyObservationEffects {
  observeDependencyBinaries(
    attempt: string,
    candidate: string,
    previous: string,
  ): Promise<readonly DependencyBinaryObservation[]>;
  observeDependencyStore(attempt: string, image: string): Promise<DependencyStoreObservation>;
}

/** Every call must honor the supplied remaining deadline, including create, polling and Pod logs. */
export type ObservationCall = (
  args: readonly string[],
  stdin: string | null,
  timeoutMs: number,
) => Promise<string>;

type Purpose = 'candidate' | 'previous' | 'store';
interface ObservationOptions {
  namespace: string;
  attempt: string;
  purpose: Purpose;
  image: string;
  timeoutSeconds: number;
}

function hashBytes(bytes: string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * One fresh F6 backend Job. Capabilities have no store access. Store inspection uses coordinator
 * code against scratch main/WAL/journal copies; Enabled recursive readonly fails on unsupported
 * runtimes. No fsGroup is requested: observation must never change source ownership.
 */
export function buildDependencyObservationJob(options: ObservationOptions) {
  assertDigestPinnedRef(options.image, 'be');
  if (
    !Number.isSafeInteger(options.timeoutSeconds) ||
    options.timeoutSeconds < 1 ||
    options.timeoutSeconds > 3600
  )
    throw new Error('invalid dependency observation timeout');
  const observationId = randomUUID();
  const name = `wbs-dep-${options.purpose}-${hashBytes(JSON.stringify([options.attempt, observationId, options.image])).slice(0, 32)}`;
  const command =
    options.purpose === 'store'
      ? storedSnapshotCommand(buildDependencyInventoryCommand())
      : [...buildDependencyCapabilityCommand()];
  const labels = {
    'app.kubernetes.io/part-of': 'wbs',
    'puni.dev/controller': 'wbs-backend',
    'puni.dev/dependency-observation': observationId,
  };
  const container = {
    name: 'task',
    image: options.image,
    imagePullPolicy: 'IfNotPresent',
    command,
    terminationMessagePath: '/dev/termination-log',
    terminationMessagePolicy: 'File',
    resources: { requests: { cpu: '50m', memory: '128Mi' }, limits: { memory: '512Mi' } },
    securityContext: {
      allowPrivilegeEscalation: false,
      runAsNonRoot: true,
      seccompProfile: { type: 'RuntimeDefault' },
      capabilities: { drop: ['ALL'] },
      readOnlyRootFilesystem: true,
    },
    ...(options.purpose === 'store'
      ? {
          env: [
            { name: 'DB_PATH', value: '/data/wbs.sqlite' },
            { name: 'HOME', value: '/tmp' },
          ],
          volumeMounts: [
            {
              name: 'source',
              mountPath: '/data',
              readOnly: true,
              recursiveReadOnly: 'Enabled',
              mountPropagation: 'None',
            },
            { name: 'scratch', mountPath: '/tmp' },
          ],
        }
      : {}),
  };
  const pod = {
    restartPolicy: 'Never',
    serviceAccountName: 'wbs-backend',
    automountServiceAccountToken: false,
    nodeSelector: { 'puni.dev/capability-product': 'true' },
    securityContext: {
      runAsUser: 10001,
      runAsGroup: 10001,
      runAsNonRoot: true,
      seccompProfile: { type: 'RuntimeDefault' },
    },
    enableServiceLinks: false,
    dnsPolicy: 'ClusterFirst',
    schedulerName: 'default-scheduler',
    terminationGracePeriodSeconds: 30,
    preemptionPolicy: 'PreemptLowerPriority',
    priority: 0,
    tolerations: [
      {
        key: 'node.kubernetes.io/not-ready',
        operator: 'Exists',
        effect: 'NoExecute',
        tolerationSeconds: 300,
      },
      {
        key: 'node.kubernetes.io/unreachable',
        operator: 'Exists',
        effect: 'NoExecute',
        tolerationSeconds: 300,
      },
    ],
    containers: [container],
    ...(options.purpose === 'store'
      ? {
          volumes: [
            { name: 'source', persistentVolumeClaim: { claimName: 'wbs-data', readOnly: true } },
            { name: 'scratch', emptyDir: { sizeLimit: '256Mi' } },
          ],
        }
      : {}),
  };
  return {
    observationId,
    image: options.image,
    purpose: options.purpose,
    timeoutSeconds: options.timeoutSeconds,
    commandSha256: hashBytes(JSON.stringify(command)),
    manifest: {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: { name, namespace: options.namespace, labels },
      spec: {
        backoffLimit: 0,
        podReplacementPolicy: 'Failed',
        activeDeadlineSeconds: options.timeoutSeconds,
        ttlSecondsAfterFinished: 86400,
        parallelism: 1,
        completions: 1,
        completionMode: 'NonIndexed',
        suspend: false,
        manualSelector: false,
        template: { metadata: { labels }, spec: pod },
      },
    },
  };
}

type ObservationRequest = ReturnType<typeof buildDependencyObservationJob>;

function readRecord(value: unknown, label: string): Record<string, unknown> {
  // Proof: omitting this boundary lost the named missing Pod/Job status and termination diagnostics.
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`missing or malformed ${label}`);
  // Boundary: object/non-null/non-array checked immediately above; keys remain unknown.
  return value as Record<string, unknown>;
}
function readString(value: unknown, label: string): string {
  // Proof: omitting this boundary lost missing Job UID, Pod UID and Pod name diagnostics.
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`missing or malformed ${label}`);
  return value;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  if (value === undefined) throw new Error('undefined observation field');
  return JSON.stringify(value);
}
function assertEqual(observed: unknown, expected: unknown, label: string): void {
  // Proof: bypassing equality admitted foreign Job identity/selector/deadline and task image/name/restarts.
  if (canonical(observed) !== canonical(expected))
    throw new Error(`dependency observation ${label} differs from pinned manifest`);
}

function assertLabels(observed: unknown, request: ObservationRequest, uid: string): void {
  // Proof: bypassing label checks admitted independently stripped Job, template and Pod attribution labels.
  const labels = readRecord(observed, 'workload labels');
  const expected: Record<string, string> = { ...request.manifest.metadata.labels };
  for (const [key, value] of Object.entries(expected))
    assertEqual(labels[key], value, `label ${key}`);
  const generated: Record<string, string> = {
    'batch.kubernetes.io/controller-uid': uid,
    'controller-uid': uid,
    'batch.kubernetes.io/job-name': request.manifest.metadata.name,
    'job-name': request.manifest.metadata.name,
  };
  for (const [key, value] of Object.entries(labels)) {
    if (!(key in expected)) assertEqual(value, generated[key], `generated label ${key}`);
  }
}

function readJob(
  request: ObservationRequest,
  observed: unknown,
  expectedUid: string | null,
): string {
  const job = readRecord(observed, 'Job');
  assertEqual(job['apiVersion'], 'batch/v1', 'Job apiVersion');
  assertEqual(job['kind'], 'Job', 'Job kind');
  const metadata = readRecord(job['metadata'], 'Job metadata');
  const uid = readString(metadata['uid'], 'Job UID');
  // Proof: removing UID comparison made the replaced Job UID negative return attributed evidence.
  if (expectedUid !== null && uid !== expectedUid) throw new Error('dependency Job UID changed');
  assertEqual(metadata['name'], request.manifest.metadata.name, 'Job name');
  assertEqual(metadata['namespace'], request.manifest.metadata.namespace, 'Job namespace');
  if ('deletionTimestamp' in metadata) throw new Error('dependency Job is deleting');
  assertLabels(metadata['labels'], request, uid);
  const spec = readRecord(job['spec'], 'Job spec');
  if ('selector' in spec)
    assertEqual(
      spec['selector'],
      { matchLabels: { 'batch.kubernetes.io/controller-uid': uid } },
      'Job selector',
    );
  for (const key of Object.keys(spec)) {
    if (!(key in request.manifest.spec) && key !== 'selector')
      throw new Error(`unexpected dependency Job field ${key}`);
  }
  for (const [key, value] of Object.entries(request.manifest.spec)) {
    if (key !== 'template') assertEqual(spec[key], value, `Job ${key}`);
  }
  const template = readRecord(spec['template'], 'Job template');
  assertLabels(readRecord(template['metadata'], 'Job template metadata')['labels'], request, uid);
  assertPodSpec(template['spec'], request.manifest.spec.template.spec, false);
  return uid;
}
/** Kubernetes conversion mirrors the account name into a deprecated alias; only an identical alias is harmless. */
function assertPodSpec(
  observed: unknown,
  expected: ObservationRequest['manifest']['spec']['template']['spec'],
  scheduled: boolean,
): void {
  const spec = { ...readRecord(observed, 'Pod spec') };
  if ('serviceAccount' in spec) {
    // Proof: removing alias equality made both mismatched create-response and Pod-GET alias tests return evidence.
    assertEqual(spec['serviceAccount'], expected.serviceAccountName, 'serviceAccount alias');
    delete spec['serviceAccount'];
  }
  if (scheduled && 'nodeName' in spec) {
    readString(spec['nodeName'], 'Pod nodeName');
    delete spec['nodeName'];
  }
  // Proof: bypassing this closed comparison admitted 17 injected image/command/storage/env/security/container faults.
  assertEqual(spec, expected, 'effective Pod spec');
}

function readPod(
  request: ObservationRequest,
  observed: unknown,
  jobUid: string,
  expectedUid: string | null,
) {
  const pod = readRecord(observed, 'Pod');
  const metadata = readRecord(pod['metadata'], 'Pod metadata');
  const uid = readString(metadata['uid'], 'Pod UID');
  const name = readString(metadata['name'], 'Pod name');
  assertLabels(metadata['labels'], request, jobUid);
  // Proof: removing UID comparison admitted the Pod replaced after its logs were read.
  if (expectedUid !== null && uid !== expectedUid) throw new Error('dependency Pod UID changed');
  assertEqual(metadata['namespace'], request.manifest.metadata.namespace, 'Pod namespace');
  if ('deletionTimestamp' in metadata) throw new Error('dependency Pod is deleting');
  if ('annotations' in metadata && canonical(metadata['annotations']) !== '{}')
    throw new Error('unexpected dependency Pod annotations');
  if (!Array.isArray(metadata['ownerReferences']) || metadata['ownerReferences'].length !== 1)
    throw new Error('ambiguous dependency Pod owner');
  const owner = readRecord(metadata['ownerReferences'][0], 'Pod owner');
  for (const [key, value] of Object.entries({
    apiVersion: 'batch/v1',
    kind: 'Job',
    name: request.manifest.metadata.name,
    uid: jobUid,
    controller: true,
  }))
    // Proof: bypassing owner equality admitted a Pod owned by a foreign Job UID.
    assertEqual(owner[key], value, `Pod owner ${key}`);
  assertPodSpec(pod['spec'], request.manifest.spec.template.spec, true);
  const status = readRecord(pod['status'], 'Pod status');
  if (status['phase'] === 'Failed' || status['phase'] === 'Unknown')
    throw new Error('dependency observation Pod failed');
  if (!['Pending', 'Running', 'Succeeded'].includes(readString(status['phase'], 'Pod phase')))
    throw new Error('malformed dependency Pod phase');
  if (status['phase'] !== 'Succeeded') return { name, uid, complete: false };
  if (!Array.isArray(status['containerStatuses']) || status['containerStatuses'].length !== 1)
    throw new Error('missing task status');
  const task = readRecord(status['containerStatuses'][0], 'task status');
  assertEqual(task['name'], 'task', 'status container');
  assertEqual(task['image'], request.image, 'status image');
  const imageId = readString(task['imageID'], 'task imageID');
  const digest = request.image.slice(request.image.lastIndexOf('@') + 1);
  // Proof: removing digest attribution admitted the foreign runtime imageID negative.
  if (!(imageId.endsWith(`@${digest}`) || imageId.endsWith(`://${digest}`)))
    throw new Error('task image digest differs');
  assertEqual(task['restartCount'], 0, 'task restart count');
  const termination = readRecord(
    readRecord(task['state'], 'task state')['terminated'],
    'task termination',
  );
  // Proof: removing exit/reason comparisons independently admitted failed exit and false Completed evidence.
  assertEqual(termination['exitCode'], 0, 'task exit');
  assertEqual(termination['reason'], 'Completed', 'task termination reason');
  // Proof: bypassing runtime mount checks admitted Disabled, writable and absent effective mount evidence.
  if (request.purpose === 'store') {
    if (!Array.isArray(task['volumeMounts']))
      throw new Error('missing effective recursive readonly mount status');
    const source = task['volumeMounts']
      .map((mount) => readRecord(mount, 'effective mount'))
      .filter((mount) => mount['name'] === 'source' && mount['mountPath'] === '/data');
    if (
      source.length !== 1 ||
      source[0]?.['readOnly'] !== true ||
      source[0]?.['recursiveReadOnly'] !== 'Enabled'
    )
      throw new Error('runtime did not establish recursive readonly source');
  }
  return { name, uid, complete: true };
}

/**
 * Fresh create-only transport, never schema Job reuse. Validate Job and single owned Pod on every
 * poll and after Pod/container-specific logs. Deadline and output bound apply even to valid stdout.
 * This does not prove stopped source writers or grant release admission.
 */
export async function observeDependencyJob(
  request: ObservationRequest,
  call: ObservationCall,
): Promise<{ evidence: DependencyJobEvidence; stdout: string }> {
  const deadline = performance.now() + request.timeoutSeconds * 1000;
  const namespace = request.manifest.metadata.namespace;
  const name = request.manifest.metadata.name;
  async function invoke(args: readonly string[], stdin: string | null = null) {
    const remaining = Math.ceil(deadline - performance.now());
    if (remaining <= 0) throw new Error('dependency observation deadline exceeded');
    return call(args, stdin, remaining);
  }
  const existing = await invoke([
    '-n',
    namespace,
    'get',
    'job',
    name,
    '--ignore-not-found',
    '-o',
    'json',
  ]);
  // Proof: removing create-only refusal reused the stale existing Job in the freshness negative.
  if (existing.trim() !== '')
    throw new Error('dependency observation Job already exists; refusing stale evidence');
  const jobUid = readJob(
    request,
    JSON.parse(await invoke(['create', '-f', '-', '-o', 'json'], JSON.stringify(request.manifest))),
    null,
  );
  let podUid: string | null = null;
  async function inspect() {
    const observedJob = JSON.parse(
      await invoke(['-n', namespace, 'get', 'job', name, '-o', 'json']),
    ) as unknown;
    readJob(request, observedJob, jobUid);
    const status = readRecord(readRecord(observedJob, 'Job')['status'], 'Job status');
    // Proof: removing count validation admitted string-valued failed status despite a Complete flag.
    for (const count of ['active', 'failed', 'succeeded']) {
      if (
        count in status &&
        (typeof status[count] !== 'number' ||
          !Number.isSafeInteger(status[count]) ||
          status[count] < 0)
      )
        throw new Error('malformed dependency Job status count');
    }
    // Proof: omitting failure-count/condition checks separately admitted failed Jobs with contradictory Complete evidence.
    if ('failed' in status && Number(status['failed']) > 0)
      throw new Error('dependency Job failed');
    const conditions = status['conditions'];
    if (conditions !== undefined && !Array.isArray(conditions))
      throw new Error('malformed dependency Job conditions');
    const flags = (conditions ?? []).map((condition: unknown) =>
      readRecord(condition, 'Job condition'),
    );
    if (
      flags.some(
        (condition) =>
          ['Failed', 'FailureTarget'].includes(String(condition['type'])) &&
          condition['status'] === 'True',
      )
    )
      throw new Error('dependency Job failed condition');
    // Proof: omitting Complete-condition membership admitted the explicitly incomplete Job negative.
    const complete =
      status['succeeded'] === 1 &&
      flags.some((condition) => condition['type'] === 'Complete' && condition['status'] === 'True');
    const pods = readRecord(
      JSON.parse(
        await invoke([
          '-n',
          namespace,
          'get',
          'pods',
          '-l',
          `batch.kubernetes.io/job-name=${name}`,
          '-o',
          'json',
        ]),
      ),
      'Pod list',
    );
    // Proof: omitting single-Pod cardinality admitted the extra owned Pod negative.
    if (
      !Array.isArray(pods['items']) ||
      pods['items'].length > 1 ||
      (podUid !== null && pods['items'].length !== 1)
    )
      throw new Error('dependency observation requires exactly one owned Pod');
    if (pods['items'].length === 0) return null;
    const pod = readPod(request, pods['items'][0], jobUid, podUid);
    podUid = pod.uid;
    return { ...pod, complete: pod.complete && complete };
  }
  for (;;) {
    const pod = await inspect();
    if (pod?.complete) {
      const stdout = await invoke(['-n', namespace, 'logs', pod.name, '-c', 'task']);
      // Proof: dropping this bound returned oversized stdout in the 65537-byte negative.
      if (Buffer.byteLength(stdout) > 65536)
        throw new Error('dependency observation stdout exceeds limit');
      // Proof: omitting post-log inspection admitted independently replaced Job and Pod UIDs.
      const finalPod = await inspect();
      if (!finalPod?.complete) throw new Error('dependency observation lost completion');
      return {
        evidence: {
          observationId: request.observationId,
          namespace,
          jobName: name,
          jobUid,
          podUid: pod.uid,
          image: request.image,
          commandSha256: request.commandSha256,
        },
        stdout,
      };
    }
    if (performance.now() + 100 >= deadline)
      throw new Error('dependency observation deadline exceeded');
    await Bun.sleep(100);
  }
}

/** Independently runs both images, including equal refs; never substitutes cached candidate support. */
export async function observeDependencyBinaries(
  options: Omit<ObservationOptions, 'purpose' | 'image'>,
  candidate: string,
  previous: string,
  call: ObservationCall,
): Promise<readonly DependencyBinaryObservation[]> {
  assertDigestPinnedRef(candidate, 'be');
  assertDigestPinnedRef(previous, 'be');
  const observations: DependencyBinaryObservation[] = [];
  // Proof: omitting previous invocation failed equal-image count; candidate substitution failed distinct-image attribution.
  for (const [purpose, image] of [
    ['candidate', candidate],
    ['previous', previous],
  ] as const) {
    const observation = await observeDependencyJob(
      buildDependencyObservationJob({ ...options, purpose, image }),
      call,
    );
    observations.push({
      evidence: observation.evidence,
      capability: { image, semantics: decodeDependencyCapabilities(observation.stdout) },
    });
  }
  return observations;
}

/** Caller-owned stopped-storage prerequisite is mandatory; returned dormant authority is observational only. */
export async function observeDependencyStore(
  options: Omit<ObservationOptions, 'purpose'>,
  call: ObservationCall,
): Promise<DependencyStoreObservation> {
  const observation = await observeDependencyJob(
    buildDependencyObservationJob({ ...options, purpose: 'store' }),
    call,
  );
  return {
    evidence: observation.evidence,
    authority: decodeDormantDependencies(observation.stdout),
  };
}
