/**
 * The SQLite backup CronJob ships with the WBS release (deploy/k8s/wbs/base/backup.yaml) and
 * must copy from the backend exactly what F6 admission and the RWO volume require. These are
 * the comparisons `tool-fleet:check` (family `wbs-backup`) runs on every rendered overlay.
 */

interface Container {
  name?: string;
  image?: string;
  command?: string[];
  env?: {
    name: string;
    value?: string;
    valueFrom?: { configMapKeyRef?: { name: string; key: string } };
  }[];
  volumeMounts?: { name: string; mountPath: string }[];
}
interface PodSpec {
  serviceAccountName?: string;
  nodeSelector?: Record<string, string>;
  securityContext?: { runAsUser?: number; runAsGroup?: number; fsGroup?: number };
  affinity?: {
    podAffinity?: {
      requiredDuringSchedulingIgnoredDuringExecution?: {
        labelSelector?: { matchLabels?: Record<string, string> };
      }[];
    };
  };
  containers?: Container[];
  volumes?: {
    name: string;
    persistentVolumeClaim?: { claimName: string };
    configMap?: { name: string };
  }[];
}
export interface K8sObject {
  kind?: string;
  metadata?: { name?: string; namespace?: string };
  spec?: {
    selector?: { matchLabels?: Record<string, string> };
    template?: { metadata?: { labels?: Record<string, string> }; spec?: PodSpec };
    jobTemplate?: {
      spec?: { template?: { metadata?: { labels?: Record<string, string> }; spec?: PodSpec } };
    };
  };
  data?: Record<string, string>;
}

/** The release record key the coordinator's `persistRelease` writes the source commit to. */
export const RELEASE_RECORD = { name: 'wbs-release', sourceKey: 'sourceSha' } as const;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`;
  }
  return value === undefined ? 'undefined' : JSON.stringify(value);
}

function find(objects: readonly K8sObject[], kind: string, name: string): K8sObject | undefined {
  return objects.find((each) => each.kind === kind && each.metadata?.name === name);
}

function envValue(container: Container | undefined, name: string): string | undefined {
  return container?.env?.find((each) => each.name === name)?.value;
}

function mountOf(container: Container | undefined, pod: PodSpec | undefined, claim: string) {
  const volume = pod?.volumes?.find((each) => each.persistentVolumeClaim?.claimName === claim);
  return container?.volumeMounts?.find((each) => each.name === volume?.name)?.mountPath;
}

/**
 * Every way the backup Job could diverge from the backend it backs up. `runner` is the source of
 * tools/tool-fleet/src/backup-sqlite.ts, which the runner ConfigMap must carry byte for byte.
 */
export function judgeBackupJob(objects: readonly K8sObject[], runner: string): string[] {
  const backend = find(objects, 'Deployment', 'wbs-backend');
  const cron = find(objects, 'CronJob', 'sqlite-backup');
  if (backend === undefined || cron === undefined) {
    return ['the overlay must render both Deployment wbs-backend and CronJob sqlite-backup'];
  }
  const problems: string[] = [];
  const backendPod = backend.spec?.template?.spec;
  const backendLabels = backend.spec?.template?.metadata?.labels ?? {};
  const backendContainer = backendPod?.containers?.find((each) => each.name === 'backend');
  const job = cron.spec?.jobTemplate?.spec?.template;
  const jobPod = job?.spec;
  const jobContainer = jobPod?.containers?.[0];
  const same = (field: string, actual: unknown, expected: unknown): void => {
    // Key order is not meaning: kubectl kustomize re-serialises maps sorted.
    if (canonical(actual) !== canonical(expected)) {
      problems.push(
        `sqlite-backup ${field} is ${JSON.stringify(actual)}, the backend's is ${JSON.stringify(expected)}`,
      );
    }
  };
  // Proof: check-backup.test.ts `refuses a backup job whose <field> differs` failed for namespace,
  // image and PUNI_SOURCE_REVISION each with its comparison removed (2026-09-18); check-faults.ts
  // changes the database path in the real base and the rendered-overlay family fails.
  same('namespace', cron.metadata?.namespace, backend.metadata?.namespace);
  // F6 admission in wbs-solver: service account, controller label, product node, backend image.
  same('serviceAccountName', jobPod?.serviceAccountName, backendPod?.serviceAccountName);
  same(
    'label puni.dev/controller',
    job?.metadata?.labels?.['puni.dev/controller'],
    backendLabels['puni.dev/controller'],
  );
  same('nodeSelector', jobPod?.nodeSelector, backendPod?.nodeSelector);
  same('image', jobContainer?.image, backendContainer?.image);
  same('runAsUser', jobPod?.securityContext?.runAsUser, backendPod?.securityContext?.runAsUser);
  same('fsGroup', jobPod?.securityContext?.fsGroup, backendPod?.securityContext?.fsGroup);
  // RWO: the Job must land on the backend's node, so its affinity selects the backend pods.
  same(
    'podAffinity selector',
    jobPod?.affinity?.podAffinity?.requiredDuringSchedulingIgnoredDuringExecution?.[0]
      ?.labelSelector?.matchLabels,
    backend.spec?.selector?.matchLabels,
  );
  const claim = backendPod?.volumes?.find((each) => each.persistentVolumeClaim !== undefined)
    ?.persistentVolumeClaim?.claimName;
  if (claim === undefined) {
    problems.push('the backend mounts no PersistentVolumeClaim');
  } else {
    same(
      'PersistentVolumeClaim',
      jobPod?.volumes?.find((each) => each.persistentVolumeClaim !== undefined)
        ?.persistentVolumeClaim?.claimName,
      claim,
    );
    // The database path is relative to the claim's mount on each side.
    const backendPath = envValue(backendContainer, 'DB_PATH');
    const backendMount = mountOf(backendContainer, backendPod, claim);
    const jobPath = envValue(jobContainer, 'BACKUP_DATABASE_PATH');
    const jobMount = mountOf(jobContainer, jobPod, claim);
    if (
      backendPath === undefined ||
      backendMount === undefined ||
      !backendPath.startsWith(`${backendMount}/`)
    ) {
      problems.push(`the backend's DB_PATH ${String(backendPath)} is not on its ${claim} mount`);
    } else {
      same(
        'database path on the claim',
        jobMount === undefined ? jobPath : jobPath?.replace(`${jobMount}/`, ''),
        backendPath.slice(backendMount.length + 1),
      );
    }
  }
  const revision = jobContainer?.env?.find((each) => each.name === 'PUNI_SOURCE_REVISION')
    ?.valueFrom?.configMapKeyRef;
  same('PUNI_SOURCE_REVISION source', revision, {
    name: RELEASE_RECORD.name,
    key: RELEASE_RECORD.sourceKey,
  });
  const runnerMap = jobPod?.volumes?.find((each) => each.configMap !== undefined)?.configMap?.name;
  const carried =
    runnerMap === undefined
      ? undefined
      : find(objects, 'ConfigMap', runnerMap)?.data?.['backup-sqlite.ts'];
  // Proof: `refuses a runner ConfigMap that is not backup-sqlite.ts byte for byte` passed an
  // edited runner with this comparison disabled (it replaces platform.ts's former runner check).
  if (carried !== runner) {
    problems.push(
      `ConfigMap ${String(runnerMap)} does not carry tools/tool-fleet/src/backup-sqlite.ts byte for byte`,
    );
  }
  return problems;
}

/**
 * The restore-verification CronJob runs beside the backup in `wbs-solver`, so it must carry the
 * same admitted identity as the backend, the backup's runner map and egress label, and no
 * database volume: it restores from object storage only.
 */
export function judgeVerifyJob(objects: readonly K8sObject[]): string[] {
  const backend = find(objects, 'Deployment', 'wbs-backend');
  const backup = find(objects, 'CronJob', 'sqlite-backup');
  const verify = find(objects, 'CronJob', 'sqlite-backup-verify');
  if (backend === undefined || backup === undefined || verify === undefined) {
    return ['the overlay must render wbs-backend, sqlite-backup and sqlite-backup-verify'];
  }
  const problems: string[] = [];
  const backendPod = backend.spec?.template?.spec;
  const backendContainer = backendPod?.containers?.find((each) => each.name === 'backend');
  const backupTemplate = backup.spec?.jobTemplate?.spec?.template;
  const job = verify.spec?.jobTemplate?.spec?.template;
  const jobPod = job?.spec;
  const same = (field: string, actual: unknown, expected: unknown, owner: string): void => {
    if (canonical(actual) !== canonical(expected)) {
      problems.push(
        `sqlite-backup-verify ${field} is ${JSON.stringify(actual)}, the ${owner}'s is ${JSON.stringify(expected)}`,
      );
    }
  };
  // Proof: check-backup.test.ts `refuses a verification job whose <field> differs` failed for
  // each field with its comparison removed (2026-09-18).
  same('namespace', verify.metadata?.namespace, backend.metadata?.namespace, 'backend');
  same('serviceAccountName', jobPod?.serviceAccountName, backendPod?.serviceAccountName, 'backend');
  same(
    'label puni.dev/controller',
    job?.metadata?.labels?.['puni.dev/controller'],
    backend.spec?.template?.metadata?.labels?.['puni.dev/controller'],
    'backend',
  );
  same('nodeSelector', jobPod?.nodeSelector, backendPod?.nodeSelector, 'backend');
  same('image', jobPod?.containers?.[0]?.image, backendContainer?.image, 'backend');
  same(
    'runAsUser',
    jobPod?.securityContext?.runAsUser,
    backendPod?.securityContext?.runAsUser,
    'backend',
  );
  same(
    'label puni.dev/workload',
    job?.metadata?.labels?.['puni.dev/workload'],
    backupTemplate?.metadata?.labels?.['puni.dev/workload'],
    'backup',
  );
  same(
    'runner ConfigMap',
    jobPod?.volumes?.find((each) => each.configMap !== undefined)?.configMap?.name,
    backupTemplate?.spec?.volumes?.find((each) => each.configMap !== undefined)?.configMap?.name,
    'backup',
  );
  if (jobPod?.volumes?.some((each) => each.persistentVolumeClaim !== undefined) === true) {
    problems.push('sqlite-backup-verify mounts a PersistentVolumeClaim; it restores from S3 only');
  }
  return problems;
}
