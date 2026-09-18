import { type } from 'arktype';

import { createKubectl, type Kubectl } from './recover';

/** Each rule has an injected-fault drill in health.test.ts and in the k3s-platform verify.md. */
export const healthRules = [
  'cluster-marker',
  'node-ready',
  'etcd-voter',
  'etcd-snapshot-fresh',
  'flux-ready',
  'pod-ready',
  'volume-attached',
  'claim-bound',
  'backup-fresh',
  'backup-job-failed',
  'certificate-valid',
] as const;

export type HealthRule = (typeof healthRules)[number];

export interface HealthFinding {
  readonly rule: HealthRule;
  readonly severity: 'critical' | 'warning';
  readonly subject: string;
  readonly detail: string;
}

const Condition = type({ type: 'string', status: 'string', 'reason?': 'string' });
const Metadata = type({
  name: 'string',
  'namespace?': 'string',
  'labels?': type({ '[string]': 'string' }),
  'creationTimestamp?': 'string',
  'ownerReferences?': type({ kind: 'string', name: 'string' }).array(),
});
const List = <Item>(item: type.Any<Item>) => type({ items: item.array() });

const NodeList = List(
  type({
    metadata: Metadata,
    spec: { 'unschedulable?': 'boolean' },
    status: { 'conditions?': Condition.array() },
  }),
);
const PodList = List(
  type({
    metadata: Metadata,
    status: { phase: 'string', 'conditions?': Condition.array() },
  }),
);
const AttachmentList = List(
  type({ metadata: Metadata, spec: { nodeName: 'string' }, 'status?': { 'attached?': 'boolean' } }),
);
const ClaimList = List(type({ metadata: Metadata, status: { 'phase?': 'string' } }));
const FluxList = List(
  type({
    kind: 'string',
    metadata: Metadata,
    spec: { 'suspend?': 'boolean' },
    'status?': { 'conditions?': Condition.array() },
  }),
);
const CronJobList = List(
  type({
    metadata: Metadata,
    spec: { 'suspend?': 'boolean' },
    'status?': { 'lastSuccessfulTime?': 'string' },
  }),
);
const JobList = List(
  type({
    metadata: Metadata,
    'status?': { 'conditions?': Condition.array(), 'startTime?': 'string' },
  }),
);
const ScheduleList = List(
  type({ metadata: Metadata, 'status?': { 'lastBackup?': 'string', 'phase?': 'string' } }),
);
const SnapshotFileList = List(
  type({
    metadata: Metadata,
    spec: { snapshotName: 'string', 'location?': 'string' },
    'status?': { 'readyToUse?': 'boolean', 'creationTime?': 'string' },
  }),
);
const CertificateList = List(
  type({
    metadata: Metadata,
    'status?': { 'conditions?': Condition.array(), 'notAfter?': 'string' },
  }),
);
interface Marker {
  readonly data: { readonly 'cluster-id': string };
}

/** One read-only observation of a cluster; `undefined` resources were not required. */
export interface ClusterSnapshot {
  readonly clusterId: string;
  readonly marker: Marker | 'absent';
  readonly nodes: typeof NodeList.infer;
  readonly pods: typeof PodList.infer;
  readonly attachments: typeof AttachmentList.infer;
  readonly claims: typeof ClaimList.infer;
  readonly flux: typeof FluxList.infer;
  readonly etcdSnapshots: typeof SnapshotFileList.infer;
  readonly backups?: {
    readonly cronJobs: typeof CronJobList.infer;
    readonly jobs: typeof JobList.infer;
    readonly schedules: typeof ScheduleList.infer;
    readonly certificates: typeof CertificateList.infer;
  };
}

/** Maximum age of the newest successful copy per store, one missed schedule plus slack. */
export const backupWindows = {
  etcdHours: 7,
  sqliteHours: 2,
  veleroHours: 26,
  certificateDays: 14,
} as const;

function conditionTrue(conditions: readonly (typeof Condition.infer)[] | undefined, name: string) {
  return (conditions ?? []).some(({ type: kind, status }) => kind === name && status === 'True');
}

function subject(metadata: typeof Metadata.infer): string {
  return metadata.namespace === undefined
    ? metadata.name
    : `${metadata.namespace}/${metadata.name}`;
}

function hoursSince(timestamp: string | undefined, now: Date): number {
  if (timestamp === undefined) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) throw new Error(`Health input has an invalid timestamp ${timestamp}`);
  return (now.getTime() - parsed) / 3_600_000;
}

function evaluateNodes(snapshot: ClusterSnapshot): HealthFinding[] {
  const findings: HealthFinding[] = [];
  if (snapshot.nodes.items.length === 0) {
    findings.push({
      rule: 'node-ready',
      severity: 'critical',
      subject: 'cluster',
      detail: 'no nodes',
    });
  }
  for (const node of snapshot.nodes.items) {
    if (!conditionTrue(node.status.conditions, 'Ready')) {
      // Proof: with this rule disabled, the node-ready fault test found no finding (2026-09-18).
      findings.push({
        rule: 'node-ready',
        severity: 'critical',
        subject: node.metadata.name,
        detail: 'Ready is not True',
      });
    }
    if (node.spec.unschedulable === true) {
      findings.push({
        rule: 'node-ready',
        severity: 'warning',
        subject: node.metadata.name,
        detail: 'cordoned',
      });
    }
    const server = node.metadata.labels?.['node-role.kubernetes.io/etcd'] === 'true';
    if (server && !conditionTrue(node.status.conditions, 'EtcdIsVoter')) {
      findings.push({
        rule: 'etcd-voter',
        severity: 'critical',
        subject: node.metadata.name,
        detail: 'EtcdIsVoter is not True',
      });
    }
  }
  return findings;
}

function evaluateEtcdSnapshots(snapshot: ClusterSnapshot, now: Date): HealthFinding[] {
  const ready = snapshot.etcdSnapshots.items.filter(({ status }) => status?.readyToUse === true);
  const newest = ready
    .map(({ status, metadata }) => status?.creationTime ?? metadata.creationTimestamp)
    .filter((time) => time !== undefined)
    .sort()
    .at(-1);
  const age = hoursSince(newest, now);
  if (age > backupWindows.etcdHours) {
    // Proof: with this rule disabled, the stale and absent snapshot tests found no finding.
    return [
      {
        rule: 'etcd-snapshot-fresh',
        severity: 'critical',
        subject: 'etcd',
        detail:
          newest === undefined
            ? 'no ready etcd snapshot'
            : `newest ready snapshot is ${age.toFixed(1)} h old`,
      },
    ];
  }
  return [];
}

function evaluateFlux(snapshot: ClusterSnapshot): HealthFinding[] {
  if (snapshot.flux.items.length === 0) {
    return [
      {
        rule: 'flux-ready',
        severity: 'critical',
        subject: 'flux-system',
        detail: 'no Flux objects',
      },
    ];
  }
  return snapshot.flux.items.flatMap((object): HealthFinding[] => {
    const name = `${object.kind}/${subject(object.metadata)}`;
    if (object.spec.suspend === true) {
      return [{ rule: 'flux-ready', severity: 'warning', subject: name, detail: 'suspended' }];
    }
    if (!conditionTrue(object.status?.conditions, 'Ready')) {
      // Proof: with this rule disabled, the flux-ready fault test found no finding.
      return [
        { rule: 'flux-ready', severity: 'critical', subject: name, detail: 'Ready is not True' },
      ];
    }
    return [];
  });
}

function evaluateWorkloads(snapshot: ClusterSnapshot): HealthFinding[] {
  const findings: HealthFinding[] = [];
  for (const pod of snapshot.pods.items) {
    const ownedByJob = (pod.metadata.ownerReferences ?? []).some(({ kind }) => kind === 'Job');
    if (pod.status.phase === 'Succeeded' || (ownedByJob && pod.status.phase === 'Failed')) continue;
    if (pod.status.phase !== 'Running' || !conditionTrue(pod.status.conditions, 'Ready')) {
      findings.push({
        rule: 'pod-ready',
        severity: 'critical',
        subject: subject(pod.metadata),
        detail: `phase ${pod.status.phase} without Ready`,
      });
    }
  }
  for (const attachment of snapshot.attachments.items) {
    if (attachment.status?.attached !== true) {
      findings.push({
        rule: 'volume-attached',
        severity: 'critical',
        subject: attachment.metadata.name,
        detail: `not attached on ${attachment.spec.nodeName}`,
      });
    }
  }
  for (const claim of snapshot.claims.items) {
    if (claim.status.phase !== 'Bound') {
      findings.push({
        rule: 'claim-bound',
        severity: claim.status.phase === 'Lost' ? 'critical' : 'warning',
        subject: subject(claim.metadata),
        detail: `phase ${claim.status.phase ?? 'unknown'}`,
      });
    }
  }
  return findings;
}

function evaluateBackups(
  backups: NonNullable<ClusterSnapshot['backups']>,
  now: Date,
): HealthFinding[] {
  const findings: HealthFinding[] = [];
  const sqlite = backups.cronJobs.items.find(
    ({ metadata }) => metadata.namespace === 'wbs' && metadata.name === 'sqlite-backup',
  );
  const sqliteAge = hoursSince(sqlite?.status?.lastSuccessfulTime, now);
  if (
    sqlite === undefined ||
    sqlite.spec.suspend === true ||
    sqliteAge > backupWindows.sqliteHours
  ) {
    // Proof: with this rule disabled, the suspended-CronJob and absent-CronJob tests failed.
    findings.push({
      rule: 'backup-fresh',
      severity: 'critical',
      subject: 'wbs/sqlite-backup',
      detail:
        sqlite === undefined
          ? 'CronJob is absent'
          : `last success ${sqliteAge.toFixed(1)} h ago${sqlite.spec.suspend === true ? ', suspended' : ''}`,
    });
  }
  if (backups.schedules.items.length === 0) {
    findings.push({
      rule: 'backup-fresh',
      severity: 'critical',
      subject: 'velero',
      detail: 'no Velero Schedule',
    });
  }
  for (const schedule of backups.schedules.items) {
    const age = hoursSince(schedule.status?.lastBackup, now);
    if (age > backupWindows.veleroHours) {
      findings.push({
        rule: 'backup-fresh',
        severity: 'critical',
        subject: subject(schedule.metadata),
        detail: Number.isFinite(age)
          ? `last Velero backup ${age.toFixed(1)} h ago`
          : 'no Velero backup yet',
      });
    }
  }
  const latestByOwner = new Map<string, (typeof backups.jobs.items)[number]>();
  for (const job of backups.jobs.items) {
    const owner = job.metadata.ownerReferences?.find(({ kind }) => kind === 'CronJob');
    if (owner === undefined) continue;
    const key = `${job.metadata.namespace ?? ''}/${owner.name}`;
    const previous = latestByOwner.get(key);
    if (
      previous === undefined ||
      (previous.status?.startTime ?? '') < (job.status?.startTime ?? '')
    ) {
      latestByOwner.set(key, job);
    }
  }
  for (const [owner, job] of latestByOwner) {
    if (conditionTrue(job.status?.conditions, 'Failed')) {
      // Proof: with this rule disabled, the latest-Job-failed fault test found no finding.
      findings.push({
        rule: 'backup-job-failed',
        severity: 'critical',
        subject: owner,
        detail: `latest Job ${job.metadata.name} failed`,
      });
    }
  }
  for (const certificate of backups.certificates.items) {
    const days = -hoursSince(certificate.status?.notAfter, now) / 24;
    if (
      !conditionTrue(certificate.status?.conditions, 'Ready') ||
      days < backupWindows.certificateDays
    ) {
      findings.push({
        rule: 'certificate-valid',
        severity: 'critical',
        subject: subject(certificate.metadata),
        detail: Number.isFinite(days) ? `Ready false or ${days.toFixed(1)} d left` : 'not issued',
      });
    }
  }
  return findings;
}

/**
 * Evaluate one read-only cluster observation. The marker rule runs first: findings about a
 * cluster that is not the requested one would be about the wrong system.
 */
// Proof: disabling each rule in turn failed exactly its `reports <rule> for its injected fault`
// test in health.test.ts on 2026-09-18 (eleven rules, eleven observed failures).
export function evaluateHealth(snapshot: ClusterSnapshot, now: Date): readonly HealthFinding[] {
  if (snapshot.marker === 'absent' || snapshot.marker.data['cluster-id'] !== snapshot.clusterId) {
    // Proof: with this guard removed, the wrong-marker and absent-marker tests reported the
    // other cluster's findings instead of refusing it.
    return [
      {
        rule: 'cluster-marker',
        severity: 'critical',
        subject: `kube-system/puni-cluster-${snapshot.clusterId}`,
        detail: 'the kubeconfig does not reach this cluster',
      },
    ];
  }
  return [
    ...evaluateNodes(snapshot),
    ...evaluateEtcdSnapshots(snapshot, now),
    ...evaluateFlux(snapshot),
    ...evaluateWorkloads(snapshot),
    ...(snapshot.backups === undefined ? [] : evaluateBackups(snapshot.backups, now)),
  ];
}

/**
 * Wrap kubectl so the health check can only read: any verb other than `get` throws before a
 * process starts.
 */
export function readOnly(kubectl: Kubectl): Kubectl {
  return async (arguments_) => {
    if (arguments_[0] !== 'get') {
      // Proof: with this guard removed, the read-only adapter test ran `delete`.
      throw new Error(`Health check is read-only; refused kubectl ${arguments_[0] ?? ''}`);
    }
    return kubectl(arguments_);
  };
}

async function readList<Shape>(
  kubectl: Kubectl,
  schema: type.Any<Shape>,
  resource: string,
  scope: 'cluster' | 'all' | 'kube-system',
): Promise<Shape> {
  const arguments_ = ['get', resource, '--output=json'];
  if (scope === 'all') arguments_.push('--all-namespaces');
  if (scope === 'kube-system') arguments_.push('--namespace=kube-system');
  const decoded = schema(JSON.parse(await kubectl(arguments_)));
  if (decoded instanceof type.errors)
    throw new Error(`${resource} list is invalid: ${decoded.summary}`);
  // Boundary: ArkType validated `decoded` against `schema`, whose output type is `Shape`; the
  // generic distillation type is not reducible to `Shape` for the compiler.
  return decoded as Shape;
}

/** Observe one cluster through a read-only kubectl. Missing required resource types throw. */
export async function observeCluster(
  kubectl: Kubectl,
  clusterId: string,
): Promise<ClusterSnapshot> {
  const reader = readOnly(kubectl);
  const markers = await readList(
    reader,
    // Other kube-system ConfigMaps carry arbitrary data; only the marker must hold cluster-id.
    // Proof: requiring cluster-id on every item made the first live run refuse the source
    // cluster's kube-root-ca ConfigMap on 2026-09-18; restoring that schema failed the
    // "finds the marker among other kube-system ConfigMaps" test.
    List(type({ metadata: Metadata, 'data?': type({ '[string]': 'string' }) })),
    'configmaps',
    'kube-system',
  );
  const marker = markers.items.find(
    ({ metadata }) => metadata.name === `puni-cluster-${clusterId}`,
  );
  const flux = await Promise.all(
    [
      'kustomizations.kustomize.toolkit.fluxcd.io',
      'helmreleases.helm.toolkit.fluxcd.io',
      'gitrepositories.source.toolkit.fluxcd.io',
    ].map((resource) => readList(reader, FluxList, resource, 'all')),
  );
  const platform = clusterId.startsWith('platform-');
  return {
    clusterId,
    marker:
      marker === undefined
        ? 'absent'
        : { data: { 'cluster-id': marker.data?.['cluster-id'] ?? '' } },
    nodes: await readList(reader, NodeList, 'nodes', 'cluster'),
    pods: await readList(reader, PodList, 'pods', 'all'),
    attachments: await readList(
      reader,
      AttachmentList,
      'volumeattachments.storage.k8s.io',
      'cluster',
    ),
    claims: await readList(reader, ClaimList, 'persistentvolumeclaims', 'all'),
    flux: { items: flux.flatMap(({ items }) => items) },
    etcdSnapshots: await readList(
      reader,
      SnapshotFileList,
      'etcdsnapshotfiles.k3s.cattle.io',
      'cluster',
    ),
    ...(platform
      ? {
          backups: {
            cronJobs: await readList(reader, CronJobList, 'cronjobs', 'all'),
            jobs: await readList(reader, JobList, 'jobs', 'all'),
            schedules: await readList(reader, ScheduleList, 'schedules.velero.io', 'all'),
            certificates: await readList(
              reader,
              CertificateList,
              'certificates.cert-manager.io',
              'all',
            ),
          },
        }
      : {}),
  };
}

function flagValue(argv: readonly string[], name: string): string {
  const position = argv.indexOf(name);
  const value = position < 0 ? undefined : argv[position + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`Missing required ${name}`);
  return value;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const allowed = new Set(['--cluster', '--kubeconfig', '--kubectl']);
  for (let position = 0; position < argv.length; position += 2) {
    if (!allowed.has(argv[position] ?? ''))
      throw new Error(`Unexpected health argument ${argv[position] ?? ''}`);
  }
  const kubectl = createKubectl(flagValue(argv, '--kubectl'), flagValue(argv, '--kubeconfig'));
  const findings = evaluateHealth(
    await observeCluster(kubectl, flagValue(argv, '--cluster')),
    new Date(),
  );
  console.log(JSON.stringify(findings, null, 2));
  if (findings.some(({ severity }) => severity === 'critical')) process.exit(1);
}
