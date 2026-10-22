import { FORWARD_PHASES, type ReleaseRequest, type ReleaseState } from './release';
import { inspectStorageOwner } from './storage-controller';
import { isTerminalJob, isTerminalPod } from './storage-fence';
import {
  assertStorageOwnership,
  serializeStorage,
  type StorageOwnership,
} from './storage-ownership';

export interface ControllerLifecycle {
  ownership: StorageOwnership;
  stage:
    | 'suspend-pending'
    | 'suspended'
    | 'drained'
    | 'restore-pending'
    | 'restore-applied'
    | 'cleanup-pending'
    | 'restored';
}
export interface ControllerAuthority {
  assertLease(): Promise<void>;
  /** Must persist and read back this exact enclosing release-journal state before resolving. */
  checkpoint(lifecycle: ControllerLifecycle): Promise<void>;
}
type Call = (args: readonly string[], input?: string) => Promise<string>;
type Fields = Record<string, unknown>;
const TOKEN = 'puni.dev/storage-owner';
function fields(value: unknown): Fields {
  // Proof: object-boundary removal lost the named trusted-state diagnostic in the malformed lifecycle test.
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('malformed backup controller');
  // Boundary: Kubernetes JSON object checked above; members remain unknown.
  return value as Fields;
}
function identityOf(owner: StorageOwnership) {
  return {
    transactionId: owner.transactionId,
    clusterUid: owner.clusterUid,
    namespace: owner.namespace,
    storage: owner.storage,
    flux: owner.flux,
  };
}
/** Closed journal boundary: prepared ownership retains its existing independent version/contract. */
export function assertControllerLifecycle(value: unknown): asserts value is ControllerLifecycle {
  const lifecycle = fields(value);
  // Proof: closed-lifecycle removal made `unknown lifecycle fields refuse before any cluster transport` contact Kubernetes.
  if (
    Object.keys(lifecycle).sort().join(',') !== 'ownership,stage' ||
    ![
      'suspend-pending',
      'suspended',
      'drained',
      'restore-pending',
      'restore-applied',
      'cleanup-pending',
      'restored',
    ].includes(String(lifecycle['stage']))
  )
    throw new Error('malformed controller lifecycle');
  const owner = fields(lifecycle['ownership']);
  // Boundary: the existing ownership codec checks every identity member and canonical byte/hash binding.
  const projection = owner as unknown as StorageOwnership;
  assertStorageOwnership(owner, identityOf(projection));
}
function same(left: unknown, right: unknown, label: string): void {
  // Proof: original-identity-comparison bypass reached a patch for a foreign UID in the refusal fixture.
  if (serializeStorage(left) !== serializeStorage(right))
    throw new Error(`backup ${label} changed`);
}
async function observe(owner: StorageOwnership, call: Call) {
  const backup: { value: Fields | null } = { value: null };
  let firstToken: { value: unknown } | null = null;
  const observed = await inspectStorageOwner(identityOf(owner), async (args) => {
    const text = await call(args);
    if (!args.includes('cronjob/sqlite-backup')) return text;
    const body = fields(JSON.parse(text));
    const metadata = fields(body['metadata']);
    const annotations = 'annotations' in metadata ? fields(metadata['annotations']) : {};
    const token = annotations[TOKEN];
    if (token !== undefined && token !== owner.token)
      throw new Error('foreign backup ownership token');
    // Proof: token-stability removal admitted `owned token changing between read passes` without acknowledgment refusal.
    if (firstToken !== null && firstToken.value !== token)
      throw new Error('backup token changed during observation');
    firstToken = { value: token };
    backup.value = body;
    const { [TOKEN]: _token, ...others } = annotations;
    return JSON.stringify({ ...body, metadata: { ...metadata, annotations: others } });
  });
  if (backup.value === null) throw new Error('backup controller was not observed');
  same(observed.clusterUid, owner.clusterUid, 'cluster UID');
  same(observed.storage, owner.storage, 'storage identity');
  same(observed.fluxUid, owner.fluxUid, 'Flux UID');
  same(observed.owner.uid, owner.owner.uid, 'UID');
  same(observed.owner.templateSha256, owner.owner.templateSha256, 'template');
  // Boundary: the bounded inspection callback assigned the actual validated Kubernetes object.
  const body = backup.value;
  const metadata = fields(body['metadata']);
  const spec = fields(body['spec']);
  const annotations = 'annotations' in metadata ? fields(metadata['annotations']) : {};
  return { metadata, spec, annotations, token: annotations[TOKEN], observation: observed };
}
async function patch(
  owner: StorageOwnership,
  observed: Awaited<ReturnType<typeof observe>>,
  operations: unknown[],
  call: Call,
  authority: ControllerAuthority,
): Promise<void> {
  await authority.assertLease();
  // Proof: independently removing UID, RV, spec or annotation tests made each mounted atomic guard race change suspension.
  const tests = [
    { op: 'test', path: '/metadata/uid', value: owner.owner.uid },
    {
      op: 'test',
      path: '/metadata/resourceVersion',
      value: observed.observation.owner.resourceVersion,
    },
    { op: 'test', path: '/spec', value: observed.spec },
    ...('annotations' in observed.metadata
      ? [{ op: 'test', path: '/metadata/annotations', value: observed.annotations }]
      : []),
  ];
  await call([
    '-n',
    owner.namespace,
    'patch',
    'cronjob/sqlite-backup',
    '--type=json',
    '-p',
    JSON.stringify([...tests, ...operations]),
  ]);
  await authority.assertLease();
}
async function checkpoint(
  lifecycle: ControllerLifecycle,
  authority: ControllerAuthority,
): Promise<ControllerLifecycle> {
  await authority.assertLease();
  await authority.checkpoint(lifecycle);
  return lifecycle;
}
/**
 * Conditionally suspends the exact prepared backup. The durable pending state precedes patching;
 * only matching original state or our exact token/suspended/template state permits restart.
 */
export async function suspendController(
  owner: StorageOwnership,
  prior: ControllerLifecycle | null,
  call: Call,
  authority: ControllerAuthority,
): Promise<ControllerLifecycle> {
  assertStorageOwnership(owner, identityOf(owner));
  if (prior !== null) {
    assertControllerLifecycle(prior);
    same(prior.ownership, owner, 'journal ownership');
    if (
      prior.stage !== 'suspend-pending' &&
      prior.stage !== 'suspended' &&
      prior.stage !== 'drained'
    )
      throw new Error('invalid suspension lifecycle stage');
  }
  await authority.assertLease();
  const observed = await observe(owner, call);
  let pending = prior;
  if (pending === null) {
    same(observed.observation.owner.suspension, owner.owner.suspension, 'original suspension');
    same(
      observed.observation.owner.resourceVersion,
      owner.owner.resourceVersion,
      'original resourceVersion',
    );
    if (observed.token !== undefined)
      throw new Error('backup already owned without pending journal');
    // Proof: pending-checkpoint omission reached kubectl without durable intent in the mounted release test.
    pending = await checkpoint({ ownership: owner, stage: 'suspend-pending' }, authority);
  }
  if (observed.token === owner.token && observed.spec['suspend'] === true) {
    if (pending.stage === 'suspended' || pending.stage === 'drained') {
      await authority.assertLease();
      return pending;
    }
    return checkpoint({ ownership: owner, stage: 'suspended' }, authority);
  }
  if (pending.stage !== 'suspend-pending') throw new Error('acknowledged backup suspension lost');
  if (observed.token !== undefined) throw new Error('backup has unexpected ownership');
  same(observed.observation.owner.suspension, owner.owner.suspension, 'original suspension');
  same(
    observed.observation.owner.resourceVersion,
    owner.owner.resourceVersion,
    'original resourceVersion',
  );
  await patch(
    owner,
    observed,
    [
      {
        op: 'add',
        path: '/metadata/annotations',
        value: { ...observed.annotations, [TOKEN]: owner.token },
      },
      { op: 'add', path: '/spec/suspend', value: true },
    ],
    call,
    authority,
  );
  const readback = await observe(owner, call);
  if (readback.token !== owner.token || readback.spec['suspend'] !== true)
    throw new Error('backup suspension readback failed');
  // Proof: suspension-ack omission made the mounted release refuse before source work.
  return checkpoint({ ownership: owner, stage: 'suspended' }, authority);
}
/**
 * Restores only the recorded absent/false/true field on the pinned template and UID. Uncertain
 * restore acknowledgment retains the enclosing release barrier for attended recovery.
 */
export async function restoreController(
  prior: ControllerLifecycle,
  call: Call,
  authority: ControllerAuthority,
): Promise<ControllerLifecycle> {
  assertControllerLifecycle(prior);
  const owner = prior.ownership;
  // Proof: restored-current-state bypass admitted the changed suspension before writer rollout.
  if (prior.stage === 'restored') {
    await authority.assertLease();
    const restored = await observe(owner, call);
    if (
      restored.token !== undefined ||
      serializeStorage(restored.observation.owner.suspension) !==
        serializeStorage(owner.owner.suspension)
    )
      throw new Error('restored backup state changed before writer rollout');
    await authority.assertLease();
    return prior;
  }
  if (prior.stage === 'suspend-pending') throw new Error('backup is not acknowledged suspended');
  await authority.assertLease();
  let observed = await observe(owner, call);
  let current = prior;
  const original = owner.owner.suspension;
  const isOriginal = () =>
    serializeStorage(observed.observation.owner.suspension) === serializeStorage(original);
  if (current.stage === 'suspended' || current.stage === 'drained') {
    if (observed.token !== owner.token || observed.spec['suspend'] !== true)
      throw new Error('owned backup suspension lost before restore');
    current = await checkpoint({ ownership: owner, stage: 'restore-pending' }, authority);
  }
  if (current.stage === 'restore-pending') {
    if (observed.token !== owner.token) throw new Error('restore intent lost its ownership token');
    if (!isOriginal()) {
      if (observed.spec['suspend'] !== true)
        throw new Error('restore intent has an ambiguous suspension');
      await patch(
        owner,
        observed,
        [
          original.kind === 'absent'
            ? { op: 'remove', path: '/spec/suspend' }
            : { op: 'replace', path: '/spec/suspend', value: original.value },
        ],
        call,
        authority,
      );
      observed = await observe(owner, call);
    }
    if (observed.token !== owner.token || !isOriginal())
      throw new Error('backup restore readback failed');
    current = await checkpoint({ ownership: owner, stage: 'restore-applied' }, authority);
  }
  if (current.stage === 'restore-applied') {
    if (observed.token !== owner.token || !isOriginal())
      throw new Error('acknowledged restore state changed');
    current = await checkpoint({ ownership: owner, stage: 'cleanup-pending' }, authority);
  }
  if (current.stage !== 'cleanup-pending') throw new Error('invalid controller restore stage');
  if (!isOriginal()) throw new Error('backup original suspension changed before cleanup');
  if (observed.token === owner.token) {
    await patch(
      owner,
      observed,
      [{ op: 'remove', path: '/metadata/annotations/puni.dev~1storage-owner' }],
      call,
      authority,
    );
    observed = await observe(owner, call);
  }
  if (observed.token !== undefined || !isOriginal())
    throw new Error('backup restoration readback failed');
  return checkpoint({ ownership: owner, stage: 'restored' }, authority);
}

function list(value: unknown): unknown[] {
  const rows = fields(value)['items'];
  if (!Array.isArray(rows)) throw new Error('malformed controller inventory');
  return rows;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error('missing controller identity');
  return value;
}
function controllerReference(metadata: Fields, kind: string, name: string, uid: string): boolean {
  if (!('ownerReferences' in metadata)) return false;
  const references = metadata['ownerReferences'];
  if (!Array.isArray(references)) throw new Error('malformed controller references');
  const controllers = references
    .map(fields)
    .filter((reference) => reference['controller'] === true);
  if (controllers.length > 1) throw new Error('ambiguous controller references');
  return controllers.some(
    (reference) =>
      reference['kind'] === kind && reference['name'] === name && reference['uid'] === uid,
  );
}
function sourceConsumer(spec: unknown): boolean {
  const pod = fields(spec);
  if (!('volumes' in pod)) return false;
  const volumes = pod['volumes'];
  if (!Array.isArray(volumes)) throw new Error('malformed source volumes');
  return volumes.some((volume) => {
    const entry = fields(volume);
    return (
      'persistentVolumeClaim' in entry &&
      fields(entry['persistentVolumeClaim'])['claimName'] === 'wbs-data'
    );
  });
}
/**
 * Drains only actual CronJob→Job→Pod controller UID descendants. Deletes use API UID
 * preconditions and orphan propagation, never a label selector. Two consecutive unfiltered
 * inventories must be empty; unknown source consumers, including readers, refuse.
 */
export async function drainController(
  lifecycle: ControllerLifecycle,
  call: Call,
  authority: ControllerAuthority,
  options: { attempts: number; sleep: () => Promise<void> },
): Promise<void> {
  assertControllerLifecycle(lifecycle);
  if (lifecycle.stage !== 'suspended' && lifecycle.stage !== 'drained')
    throw new Error('drain requires acknowledged suspension');
  if (!Number.isSafeInteger(options.attempts) || options.attempts < 2)
    throw new Error('drain needs a bounded convergence budget of at least two');
  const owner = lifecycle.ownership;
  let empty = 0;
  for (let attempt = 0; attempt < options.attempts; attempt++) {
    await authority.assertLease();
    const backup = await observe(owner, call);
    if (backup.token !== owner.token || backup.spec['suspend'] !== true)
      throw new Error('owned backup suspension lost during drain');
    const jobs = list(JSON.parse(await call(['-n', owner.namespace, 'get', 'jobs', '-o', 'json'])));
    const pods = list(JSON.parse(await call(['-n', owner.namespace, 'get', 'pods', '-o', 'json'])));
    const owned = new Map<string, string>();
    for (const entry of jobs) {
      const job = fields(entry);
      const metadata = fields(job['metadata']);
      const name = text(metadata['name']);
      const uid = text(metadata['uid']);
      if (metadata['namespace'] !== owner.namespace) throw new Error('foreign Job namespace');
      if (controllerReference(metadata, 'CronJob', owner.owner.name, owner.owner.uid))
        owned.set(uid, name);
      // Proof: terminal-history-acceptance omission blocked retained production manifests before the next source barrier.
      else if (
        sourceConsumer(fields(fields(job['spec'])['template'])['spec']) &&
        !isTerminalJob(job)
      )
        throw new Error('foreign source consumer Job');
    }
    const descendants: { name: string; uid: string }[] = [];
    for (const entry of pods) {
      const pod = fields(entry);
      const metadata = fields(pod['metadata']);
      const name = text(metadata['name']);
      const uid = text(metadata['uid']);
      if (metadata['namespace'] !== owner.namespace) throw new Error('foreign Pod namespace');
      if (
        [...owned].some(([jobUid, jobName]) =>
          controllerReference(metadata, 'Job', jobName, jobUid),
        )
      )
        descendants.push({ name, uid });
      else if (sourceConsumer(pod['spec']) && !isTerminalPod(pod))
        throw new Error('foreign source consumer Pod');
    }
    await authority.assertLease();
    const targets =
      descendants.length > 0
        ? descendants.map((pod) => ({ ...pod, kind: 'pods', prefix: '/api/v1' }))
        : [...owned].map(([uid, name]) => ({ uid, name, kind: 'jobs', prefix: '/apis/batch/v1' }));
    for (const target of targets) {
      await authority.assertLease();
      await call(
        [
          'delete',
          '--raw',
          `${target.prefix}/namespaces/${encodeURIComponent(owner.namespace)}/${target.kind}/${encodeURIComponent(target.name)}`,
          '-f',
          '-',
        ],
        JSON.stringify({
          apiVersion: 'v1',
          kind: 'DeleteOptions',
          // Proof: descendant-delete-uid omission failed the mounted exact-descendant deletion test.
          preconditions: { uid: target.uid },
          // Proof: non-force-pod-delete injected zero grace and failed the mounted non-force DeleteOptions assertion.
          propagationPolicy: 'Orphan',
        }),
      );
    }
    empty = targets.length === 0 ? empty + 1 : 0;
    if (empty >= 2) {
      await authority.assertLease();
      return;
    }
    await options.sleep();
  }
  // Proof: drain-convergence removal lost the mounted bounded-timeout refusal after exactly four delete attempts.
  throw new Error('backup controller drain did not converge within its bounded budget');
}

/** Validates both retained interval histories against the enclosing authoritative release. */
export function assertControllerProgress(state: ReleaseState, request: ReleaseRequest): void {
  const intervals = fields(state.controllers);
  if (Object.keys(intervals).sort().join(',') !== 'forward,rollback')
    throw new Error('missing controller lifecycle histories');
  for (const interval of Object.values(intervals)) {
    if (interval === null) continue;
    assertControllerLifecycle(interval);
    assertStorageOwnership(interval.ownership, {
      transactionId: state.transactionId,
      clusterUid: request.cluster.uid,
      namespace: request.namespaces.backend,
      storage: interval.ownership.storage,
      flux:
        request.flux === null
          ? null
          : { namespace: request.flux.namespace, kustomization: request.flux.kustomization },
    });
  }
  const forward = state.controllers.forward;
  const rollback = state.controllers.rollback;
  const phases: readonly string[] = FORWARD_PHASES;
  const reached = phases.indexOf(state.phase);
  const origin = state.rollbackFrom === null ? -1 : phases.indexOf(state.rollbackFrom);
  if (
    (reached >= phases.indexOf('replay-checked') || origin >= phases.indexOf('replay-checked')) &&
    forward === null
  )
    throw new Error('missing forward controller interval after source work');
  if (
    reached >= phases.indexOf('replay-checked') &&
    forward !== null &&
    ['suspend-pending', 'suspended'].includes(forward.stage)
  )
    throw new Error('missing durable controller drain acknowledgment');
  if (reached >= phases.indexOf('backend-ready') && forward?.stage !== 'restored')
    throw new Error('missing durable controller restore acknowledgment before writer rollout');
  if (
    forward !== null &&
    rollback !== null &&
    (forward.stage !== 'restored' || forward.ownership.token === rollback.ownership.token)
  )
    throw new Error(
      'rollback controller interval did not retain a separate completed forward history',
    );
}
