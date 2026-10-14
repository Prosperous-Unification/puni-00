function requireRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new Error('first-start PVC inventory is malformed');
  // Boundary: non-null object was checked before accessing unknown inventory fields.
  return raw as Record<string, unknown>;
}
function readRows(raw: unknown): readonly unknown[] {
  const rows = requireRecord(raw)['items'];
  if (!Array.isArray(rows)) throw new Error('first-start PVC inventory has no items');
  return rows;
}
/** All claim references count, including read-only and init-only mounts and unlabeled Pods. */
export function mountsPvc(raw: unknown, pvc: string): boolean {
  const spec = requireRecord(raw);
  if (!Object.hasOwn(spec, 'volumes')) return false;
  const volumes = spec['volumes'];
  if (!Array.isArray(volumes)) throw new Error('first-start PVC volumes are malformed');
  return volumes.some((raw) => {
    const volume = requireRecord(raw);
    if (!Object.hasOwn(volume, 'persistentVolumeClaim')) return false;
    return requireRecord(volume['persistentVolumeClaim'])['claimName'] === pvc;
  });
}
function controlledBy(raw: unknown, kind: string, uids: ReadonlySet<string>): boolean {
  const owners = requireRecord(raw)['ownerReferences'];
  if (!Array.isArray(owners)) return false;
  return owners.some((raw) => {
    const owner = requireRecord(raw);
    return (
      owner['controller'] === true &&
      owner['kind'] === kind &&
      typeof owner['uid'] === 'string' &&
      uids.has(owner['uid'])
    );
  });
}

/** Public-facing tiers must have no unadmitted Pod or controller that can inherit an ingress selector. */
export function assertAppActors(
  controllers: unknown,
  pods: unknown,
  deploymentUids: ReadonlySet<string>,
  stopped: boolean,
): void {
  const replicaSets = new Set<string>();
  const seenDeployments = new Set<string>();
  for (const raw of readRows(controllers)) {
    const controller = requireRecord(raw);
    const metadata = requireRecord(controller['metadata']);
    const spec = requireRecord(controller['spec']);
    const kind = controller['kind'];
    const uid = metadata['uid'];
    if (
      kind === 'Deployment' &&
      typeof uid === 'string' &&
      deploymentUids.has(uid) &&
      (spec['replicas'] === 0 || (!stopped && spec['replicas'] === 1))
    ) {
      seenDeployments.add(uid);
      continue;
    }
    if (
      kind === 'ReplicaSet' &&
      controlledBy(metadata, 'Deployment', deploymentUids) &&
      (spec['replicas'] === 0 || (!stopped && spec['replicas'] === 1))
    ) {
      if (typeof uid !== 'string' || uid === '')
        throw new Error('first-start app ReplicaSet UID is absent');
      replicaSets.add(uid);
      continue;
    }
    if (kind === 'Job') {
      const status = requireRecord(controller['status']);
      const conditions = status['conditions'];
      if (
        Array.isArray(conditions) &&
        conditions.some((raw) => {
          const condition = requireRecord(raw);
          return (
            (condition['type'] === 'Complete' || condition['type'] === 'Failed') &&
            condition['status'] === 'True'
          );
        }) &&
        (!Object.hasOwn(status, 'active') || status['active'] === 0)
      )
        continue;
    }
    // Proof: complete app controller negative fails when unknown actor refusal is omitted.
    throw new Error('first-start unadmitted app controller can reopen a public traffic path');
  }
  // Proof: missing app Deployment negative fails when completeness admission is omitted.
  if (seenDeployments.size !== deploymentUids.size)
    throw new Error('first-start app controller inventory is incomplete');
  const live = readRows(pods).filter((raw) => {
    const phase = requireRecord(requireRecord(raw)['status'])['phase'];
    return phase !== 'Succeeded' && phase !== 'Failed';
  });
  // Proof: live app Pod negative fails when stopped/ownership/selector admission is omitted.
  if (
    (stopped && live.length !== 0) ||
    live.length > deploymentUids.size ||
    live.some((raw) => {
      const metadata = requireRecord(requireRecord(raw)['metadata']);
      return (
        !controlledBy(metadata, 'ReplicaSet', replicaSets) ||
        requireRecord(metadata['labels'])['puni.dev/writes'] === 'fenced'
      );
    })
  )
    throw new Error('first-start app Pod can inherit public ingress or is unadmitted');
}
/** Require zero PVC users when stopped; after start allow only one admitted backend descendant. */
export function assertPvcWriters(
  raw: unknown,
  pvc: string,
  stopped: boolean,
  backendReplicaSets: ReadonlySet<string>,
): void {
  const users = readRows(raw).filter((raw) => {
    const pod = requireRecord(raw);
    const phase = requireRecord(pod['status'])['phase'];
    return phase !== 'Succeeded' && phase !== 'Failed' && mountsPvc(pod['spec'], pvc);
  });
  // Proof: unlabeled/terminating/read-only/pending/init-only PVC Pod negatives all fail if this guard is omitted.
  if (
    (stopped && users.length !== 0) ||
    (!stopped &&
      (users.length > 1 ||
        users.some(
          (raw) => !controlledBy(requireRecord(raw)['metadata'], 'ReplicaSet', backendReplicaSets),
        )))
  )
    throw new Error('first-start PVC is mounted by an unadmitted live or terminating Pod');
}
/** Admit only the backend descendant chain, suspended reviewed backups, or terminal Jobs. */
export function assertPvcControllers(
  raw: unknown,
  pvc: string,
  stopped: boolean,
  backendUid: string,
  backupUids: ReadonlySet<string>,
): ReadonlySet<string> {
  const replicaSets = new Set<string>();
  for (const rawController of readRows(raw)) {
    const controller = requireRecord(rawController);
    const kind = controller['kind'];
    const metadata = requireRecord(controller['metadata']);
    const spec = requireRecord(controller['spec']);
    if (kind === 'HorizontalPodAutoscaler')
      throw new Error('first-start namespace has an unadmitted autoscaler');
    const pod =
      kind === 'CronJob'
        ? requireRecord(requireRecord(requireRecord(spec['jobTemplate'])['spec'])['template'])[
            'spec'
          ]
        : requireRecord(spec['template'])['spec'];
    if (!mountsPvc(pod, pvc)) continue;
    const uid = metadata['uid'];
    if (
      kind === 'Deployment' &&
      uid === backendUid &&
      (spec['replicas'] === 0 || (!stopped && spec['replicas'] === 1))
    )
      continue;
    if (
      kind === 'ReplicaSet' &&
      controlledBy(metadata, 'Deployment', new Set([backendUid])) &&
      (spec['replicas'] === 0 || (!stopped && spec['replicas'] === 1))
    ) {
      if (typeof uid !== 'string' || uid === '')
        throw new Error('first-start ReplicaSet UID is absent');
      replicaSets.add(uid);
      continue;
    }
    if (
      kind === 'CronJob' &&
      typeof uid === 'string' &&
      backupUids.has(uid) &&
      spec['suspend'] === true
    )
      continue;
    if (kind === 'Job') {
      const status = requireRecord(controller['status']);
      const conditions = status['conditions'];
      if (
        Array.isArray(conditions) &&
        conditions.some((raw) => {
          const condition = requireRecord(raw);
          return (
            (condition['type'] === 'Complete' || condition['type'] === 'Failed') &&
            condition['status'] === 'True'
          );
        }) &&
        (!Object.hasOwn(status, 'active') || status['active'] === 0)
      )
        continue;
    }
    // Proof: each unknown controller kind with the actual PVC is refused in the production controller negatives.
    throw new Error('first-start unadmitted controller can create a PVC writer');
  }
  return replicaSets;
}
