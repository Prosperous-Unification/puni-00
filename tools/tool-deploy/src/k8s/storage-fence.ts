import { createHash } from 'node:crypto';

import type { FluxUnit } from './release';

export interface StorageIdentity {
  namespace: string;
  pvcName: 'wbs-data';
  pvcUid: string;
  volumeName: string;
  pvUid: string;
  databasePath: '/data/wbs.sqlite';
}
export interface StorageController {
  kind: string;
  name: string;
  uid: string;
  state: 'stopped' | 'suspended' | 'terminal';
}
/** Observational identity only; it grants no migration, exposure or controller restoration authority. */
export interface StorageFence {
  storage: StorageIdentity;
  policyUid: string;
  backendUid: string;
  fluxUid: string | null;
  controllers: readonly StorageController[];
  templatesSha256: string;
}
export interface StorageFenceOptions {
  namespace: string;
  flux: Pick<FluxUnit, 'namespace' | 'kustomization'> | null;
}
export interface StorageFenceEffects {
  inspectStorageFence(
    flux: StorageFenceOptions['flux'],
    expected?: StorageFence,
  ): Promise<StorageFence>;
}
type ReadCall = (args: readonly string[]) => Promise<string>;
type Fields = Record<string, unknown>;
function readFields(value: unknown, label: string): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`malformed ${label}`);
  // JSON objects are checked at this external Kubernetes boundary before field access.
  return value as Fields;
}
function readText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`missing ${label}`);
  return value;
}
function readList(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`malformed ${label}`);
  return value;
}
function canonical(value: unknown): string {
  if (value === undefined) throw new Error('missing storage evidence');
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, field]) => `${JSON.stringify(key)}:${canonical(field)}`)
      .join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  return encoded;
}
function readIdentity(value: unknown, name: string, namespace: string | null) {
  const fields = readFields(value, name);
  const metadata = readFields(fields['metadata'], `${name} metadata`);
  if (metadata['name'] !== name || (namespace !== null && metadata['namespace'] !== namespace))
    throw new Error(`foreign ${name} identity`);
  // Proof: removing deletion refusal admitted deleting PVC/controller fixtures.
  if ('deletionTimestamp' in metadata) throw new Error(`${name} is deleting`);
  return { fields, uid: readText(metadata['uid'], `${name} UID`) };
}
/** Classifies every source volume and container family; ambiguous source access refuses. */
function classifyAccess(value: unknown): 'absent' | 'readonly' | 'writable' {
  const spec = readFields(value, 'Pod spec');
  const volumes = 'volumes' in spec ? readList(spec['volumes'], 'Pod volumes') : [];
  const sources = new Map<string, boolean>();
  for (const volume of volumes) {
    const fields = readFields(volume, 'volume');
    if (!('persistentVolumeClaim' in fields)) continue;
    const claim = readFields(fields['persistentVolumeClaim'], 'PVC reference');
    const name = readText(claim['claimName'], 'claim name');
    if (name !== 'wbs-data') continue;
    const volumeName = readText(fields['name'], 'volume name');
    // Proof: removing duplicate-volume refusal admitted the duplicate source reference.
    if (sources.has(volumeName)) throw new Error('duplicate source volume');
    sources.set(volumeName, claim['readOnly'] === true);
  }
  if (sources.size === 0) return 'absent';
  let writable = false;
  const containers = [...readList(spec['containers'], 'containers')];
  if (containers.length === 0) throw new Error('empty source containers');
  // Proof: omitting each non-main family admitted its unlabeled writable Pod fixture.
  for (const family of ['initContainers', 'ephemeralContainers']) {
    if (family in spec) containers.push(...readList(spec[family], family));
  }
  for (const container of containers) {
    const fields = readFields(container, 'container');
    readText(fields['name'], 'container name');
    if ('volumeDevices' in fields) {
      for (const device of readList(fields['volumeDevices'], 'volume devices')) {
        if (sources.has(readText(readFields(device, 'volume device')['name'], 'device name')))
          // Proof: removing device refusal admitted the raw-source-device fixture.
          throw new Error('source volume device is unclassifiable');
      }
    }
    if (!('volumeMounts' in fields)) continue;
    for (const mount of readList(fields['volumeMounts'], 'volume mounts')) {
      const fields = readFields(mount, 'mount');
      const name = readText(fields['name'], 'mount name');
      if (!sources.has(name)) continue;
      readText(fields['mountPath'], 'mount path');
      // Recursive mount exclusions are required for any allowed source reader, as for observation Jobs.
      if (
        !sources.get(name) ||
        fields['readOnly'] !== true ||
        fields['recursiveReadOnly'] !== 'Enabled' ||
        ('mountPropagation' in fields && fields['mountPropagation'] !== 'None') ||
        'subPath' in fields ||
        'subPathExpr' in fields
      )
        writable = true;
    }
  }
  return writable ? 'writable' : 'readonly';
}

async function readBoundStorage(
  namespace: string,
  get: (resource: string, scope?: string | null) => Promise<unknown>,
) {
  const pvc = readIdentity(await get('pvc/wbs-data'), 'wbs-data', namespace);
  const pvcSpec = readFields(pvc.fields['spec'], 'PVC spec');
  // Proof: removing Bound refusal admitted the Pending PVC fixture.
  if (readFields(pvc.fields['status'], 'PVC status')['phase'] !== 'Bound')
    throw new Error('PVC is not Bound');
  const volumeName = readText(pvcSpec['volumeName'], 'bound volume name');
  const pv = readIdentity(await get(`pv/${volumeName}`, null), volumeName, null);
  const claim = readFields(
    readFields(pv.fields['spec'], 'PV spec')['claimRef'],
    'PV claim reference',
  );
  // Proof: removing binding refusal admitted a PV with a foreign claim UID.
  if (
    readFields(pv.fields['status'], 'PV status')['phase'] !== 'Bound' ||
    claim['name'] !== 'wbs-data' ||
    claim['namespace'] !== namespace ||
    claim['uid'] !== pvc.uid
  )
    throw new Error('PV is not bound to the observed PVC UID');
  return {
    storage: {
      namespace,
      pvcName: 'wbs-data',
      pvcUid: pvc.uid,
      volumeName,
      pvUid: pv.uid,
      databasePath: '/data/wbs.sqlite',
    } satisfies StorageIdentity,
    pvc,
    pv,
  };
}

/** Reads bound PVC/PV identities without requiring stopped backend or suspended backup. */
export async function inspectStorageIdentity(
  namespace: string,
  call: ReadCall,
): Promise<StorageIdentity> {
  readText(namespace, 'backend namespace');
  const observed = await readBoundStorage(
    namespace,
    async (resource, scope = namespace) =>
      JSON.parse(
        await call([...(scope === null ? [] : ['-n', scope]), 'get', resource, '-o', 'json']),
      ) as unknown,
  );
  return observed.storage;
}

/**
 * Reads the bounded standard Kubernetes storage owners without selectors. Rechecks exact PVC/PV,
 * stopped/suspended owner identities and templates against prior evidence. Kubernetes omits zero
 * optional status counters; the status object and desired replica count remain required. This readback alone
 * does not establish a continuously enforced interval, suspend/drain owners, persist ownership,
 * prove Lease authority or admit scans. Live readers and unknown source controllers also refuse
 * until runtime read-only proof and transaction ownership are supplied by the caller.
 */
export async function inspectStorageFence(
  options: StorageFenceOptions,
  call: ReadCall,
  expected?: StorageFence,
): Promise<StorageFence> {
  const namespace = readText(options.namespace, 'backend namespace');
  async function get(resource: string, scope: string | null = namespace): Promise<unknown> {
    return JSON.parse(
      await call([...(scope === null ? [] : ['-n', scope]), 'get', resource, '-o', 'json']),
    ) as unknown;
  }
  const { storage, pvc, pv } = await readBoundStorage(namespace, get);
  const volumeName = storage.volumeName;
  const policy = readIdentity(
    await get('networkpolicy/wbs-backend-writers'),
    'wbs-backend-writers',
    namespace,
  );
  const policySpec = readFields(policy.fields['spec'], 'writer policy spec');
  // Proof: removing fence refusal admitted the widened writer selector.
  if (
    canonical(policySpec['podSelector']) !==
      canonical({ matchLabels: { 'puni.dev/writes': 'fenced' } }) ||
    canonical(policySpec['policyTypes']) !== canonical(['Ingress'])
  )
    throw new Error('writer policy is not fenced');
  const backend = readIdentity(await get('deployment/wbs-backend'), 'wbs-backend', namespace);
  // Proof: removing desired-zero refusal admitted backend replicas=1.
  if (readFields(backend.fields['spec'], 'backend spec')['replicas'] !== 0)
    throw new Error('backend is not stopped');
  const backendStatus = readFields(backend.fields['status'], 'backend status');
  for (const count of [
    'replicas',
    'readyReplicas',
    'availableReplicas',
    'updatedReplicas',
    'terminatingReplicas',
  ]) {
    // Proof: removing observed-zero refusal admitted status.replicas=1.
    if (count in backendStatus && backendStatus[count] !== 0)
      throw new Error('backend still has replicas');
  }
  let fluxUid: string | null = null;
  if (options.flux !== null) {
    const flux = readIdentity(
      await get(
        `kustomizations.kustomize.toolkit.fluxcd.io/${options.flux.kustomization}`,
        options.flux.namespace,
      ),
      options.flux.kustomization,
      options.flux.namespace,
    );
    // Proof: removing Flux refusal admitted the unsuspended Flux fixture.
    if (readFields(flux.fields['spec'], 'Flux spec')['suspend'] !== true)
      throw new Error('Flux is not suspended');
    fluxUid = flux.uid;
  }
  const pods = readList(readFields(await get('pods'), 'Pod list')['items'], 'Pods');
  for (const pod of pods) {
    const fields = readFields(pod, 'Pod');
    const metadata = readFields(fields['metadata'], 'Pod metadata');
    const access = classifyAccess(fields['spec']);
    if (access !== 'absent') {
      readText(metadata['name'], 'source Pod name');
      // Proof: removing source UID read admitted the terminal source Pod with no UID.
      readText(metadata['uid'], 'source Pod UID');
      // Proof: removing source namespace refusal admitted the terminal foreign-namespace Pod.
      if (metadata['namespace'] !== namespace) throw new Error('foreign source Pod namespace');
    }
    const labels = 'labels' in metadata ? readFields(metadata['labels'], 'Pod labels') : {};
    const phase = readFields(fields['status'], 'Pod status')['phase'];
    if (
      !['Pending', 'Running', 'Succeeded', 'Failed', 'Unknown'].includes(
        readText(phase, 'Pod phase'),
      )
    )
      throw new Error('unclassifiable Pod phase');
    const terminal = phase === 'Succeeded' || phase === 'Failed';
    if (
      labels['app.kubernetes.io/name'] === 'wbs-backend' &&
      (!terminal || 'deletionTimestamp' in metadata)
    )
      throw new Error('backend Pod remains');
    // Proof: removing writable refusal admitted the unlabeled live/terminating backup Pods, including the real kubectl adapter.
    if (access === 'writable' && (!terminal || 'deletionTimestamp' in metadata))
      throw new Error('writable PVC consumer remains');
    // Proof: removing reader refusal admitted a live reader without runtime mount proof.
    if (access === 'readonly' && (!terminal || 'deletionTimestamp' in metadata))
      throw new Error('live readonly PVC consumer requires runtime proof');
  }
  const owners = readList(
    readFields(
      await get(
        'deployments,statefulsets,daemonsets,replicasets,replicationcontrollers,jobs,cronjobs,podtemplates',
      ),
      'controller list',
    )['items'],
    'controllers',
  );
  const controllers: StorageController[] = [];
  const templates: unknown[] = [];
  for (const owner of owners) {
    const fields = readFields(owner, 'controller');
    const kind = readText(fields['kind'], 'controller kind');
    const metadata = readFields(fields['metadata'], 'controller metadata');
    const name = readText(metadata['name'], 'controller name');
    const identity = readIdentity(owner, name, namespace);
    const spec = kind === 'PodTemplate' ? fields : readFields(fields['spec'], 'controller spec');
    const template =
      kind === 'CronJob'
        ? readFields(
            readFields(readFields(spec['jobTemplate'], 'Job template')['spec'], 'Job spec')[
              'template'
            ],
            'Pod template',
          )
        : readFields(spec['template'], 'Pod template');
    const access = classifyAccess(template['spec']);
    if (access === 'absent') continue;
    let state: StorageController['state'];
    if (
      kind === 'Deployment' &&
      name === 'wbs-backend' &&
      identity.uid === backend.uid &&
      spec['replicas'] === 0
    )
      state = 'stopped';
    else if (kind === 'CronJob' && name === 'sqlite-backup' && spec['suspend'] === true)
      state = 'suspended';
    else if (
      kind === 'ReplicaSet' &&
      spec['replicas'] === 0 &&
      readFields(fields['status'], 'ReplicaSet status')['replicas'] === 0 &&
      readList(metadata['ownerReferences'], 'ReplicaSet owners').length === 1
    ) {
      const owner = readFields(
        readList(metadata['ownerReferences'], 'ReplicaSet owners')[0],
        'ReplicaSet owner',
      );
      // Proof: removing owner equality admitted the foreign backend ReplicaSet UID.
      if (
        owner['kind'] !== 'Deployment' ||
        owner['name'] !== 'wbs-backend' ||
        owner['uid'] !== backend.uid ||
        owner['controller'] !== true
      )
        throw new Error('foreign writable ReplicaSet owner');
      state = 'stopped';
    } else if (kind === 'Job') {
      const status = readFields(fields['status'], 'Job status');
      // Proof: removing terminal refusal admitted active and false-Complete Jobs.
      if (
        ('active' in status && status['active'] !== 0) ||
        !readList(status['conditions'], 'Job conditions').some((condition) => {
          const flag = readFields(condition, 'Job condition');
          return (
            ['Complete', 'Failed'].includes(readText(flag['type'], 'condition type')) &&
            flag['status'] === 'True'
          );
        })
      )
        throw new Error('writable Job is not terminal');
      state = 'terminal';
    } else {
      // Proof: removing unknown-owner refusal admitted unknown StatefulSet/DaemonSet/controller fixtures.
      throw new Error(`unexcluded writable controller ${kind}/${name}`);
    }
    controllers.push({ kind, name, uid: identity.uid, state });
    templates.push({ kind, name, uid: identity.uid, template });
  }
  if (!controllers.some((owner) => owner.kind === 'Deployment' && owner.uid === backend.uid))
    throw new Error('backend missing from source controller inventory');
  controllers.sort((a, b) => `${a.kind}/${a.name}`.localeCompare(`${b.kind}/${b.name}`));
  templates.sort((a, b) => canonical(a).localeCompare(canonical(b)));
  const fence: StorageFence = {
    storage,
    policyUid: policy.uid,
    backendUid: backend.uid,
    fluxUid,
    controllers,
    templatesSha256: createHash('sha256').update(canonical(templates)).digest('hex'),
  };
  const finalPvc = readIdentity(await get('pvc/wbs-data'), 'wbs-data', namespace);
  const finalPv = readIdentity(await get(`pv/${volumeName}`, null), volumeName, null);
  // Proof: removing final readback comparison admitted PVC replacement during inventory.
  if (
    canonical(finalPvc.fields['spec']) !== canonical(pvc.fields['spec']) ||
    canonical(finalPvc.fields['status']) !== canonical(pvc.fields['status']) ||
    finalPvc.uid !== pvc.uid ||
    finalPv.uid !== pv.uid ||
    canonical(finalPv.fields['spec']) !== canonical(pv.fields['spec']) ||
    canonical(finalPv.fields['status']) !== canonical(pv.fields['status'])
  )
    throw new Error('storage identity changed during inventory');
  // Proof: removing interval comparison admitted valid PVC/PV replacement and policy/backend/Flux/backup UID or template drift.
  if (expected !== undefined && canonical(expected) !== canonical(fence))
    throw new Error('storage fence identity or controller template changed');
  return fence;
}
