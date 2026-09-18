import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'bun:test';
import { parseAllDocuments } from 'yaml';

import { judgeBackupJob, type K8sObject } from './check-backup';

const ROOT = resolve(import.meta.dir, '../../..');
const RUNNER = readFileSync(join(ROOT, 'tools/tool-fleet/src/backup-sqlite.ts'), 'utf8');

/** The committed base backend and backup manifests, as every WBS overlay renders them. */
function committed(): K8sObject[] {
  return ['backend.yaml', 'backup.yaml'].flatMap((file) =>
    parseAllDocuments(readFileSync(join(ROOT, 'deploy/k8s/wbs/base', file), 'utf8')).map(
      (document) => document.toJS() as K8sObject,
    ),
  );
}

interface Pod {
  serviceAccountName: string;
  nodeSelector: Record<string, string>;
  securityContext: { runAsUser: number; fsGroup: number };
  affinity: {
    podAffinity: {
      requiredDuringSchedulingIgnoredDuringExecution: {
        labelSelector: { matchLabels: Record<string, string> };
      }[];
    };
  };
  containers: {
    image: string;
    env: { name: string; value?: string; valueFrom?: { configMapKeyRef: { key: string } } }[];
  }[];
  volumes: { persistentVolumeClaim?: { claimName: string } }[];
}

/** The committed objects with one change to the backup CronJob's job pod or the runner map. */
function mutated(change: (cron: K8sObject, pod: Pod, labels: Record<string, string>) => void) {
  const objects = committed();
  const cron = objects.find((each) => each.kind === 'CronJob');
  if (cron === undefined) throw new Error('no CronJob in backup.yaml');
  const template = cron.spec?.jobTemplate?.spec?.template;
  // Boundary: the committed backup.yaml fills every field this fixture touches.
  change(cron, template?.spec as unknown as Pod, template?.metadata?.labels ?? {});
  return objects;
}

const env = (pod: Pod, name: string) => {
  const entry = pod.containers[0].env.find((each) => each.name === name);
  if (entry === undefined) throw new Error(`no ${name}`);
  return entry;
};

describe('the release-shipped SQLite backup job', () => {
  it('matches the backend on every field in the committed base', () => {
    expect(judgeBackupJob(committed(), RUNNER)).toEqual([]);
  });

  const negatives: [string, (cron: K8sObject, pod: Pod, labels: Record<string, string>) => void][] =
    [
      [
        'namespace',
        (cron) => {
          cron.metadata = { ...cron.metadata, namespace: 'wbs' };
        },
      ],
      [
        'serviceAccountName',
        (_, pod) => {
          pod.serviceAccountName = 'default';
        },
      ],
      [
        'label puni.dev/controller',
        (_, __, labels) => {
          labels['puni.dev/controller'] = 'x';
        },
      ],
      [
        'nodeSelector',
        (_, pod) => {
          pod.nodeSelector = {};
        },
      ],
      [
        'image',
        (_, pod) => {
          pod.containers[0].image = 'docker.io/oven/bun:1.4.2-alpine';
        },
      ],
      [
        'runAsUser',
        (_, pod) => {
          pod.securityContext.runAsUser = 1000;
        },
      ],
      [
        'fsGroup',
        (_, pod) => {
          pod.securityContext.fsGroup = 1000;
        },
      ],
      [
        'podAffinity selector',
        (_, pod) => {
          const [term] = pod.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution;
          term.labelSelector.matchLabels = { 'app.kubernetes.io/name': 'be-01' };
        },
      ],
      [
        'PersistentVolumeClaim',
        (_, pod) => {
          const volume = pod.volumes.find((each) => each.persistentVolumeClaim !== undefined);
          if (volume?.persistentVolumeClaim) volume.persistentVolumeClaim.claimName = 'other';
        },
      ],
      [
        'database path on the claim',
        (_, pod) => {
          env(pod, 'BACKUP_DATABASE_PATH').value = '/data/wbs.db';
        },
      ],
      [
        'PUNI_SOURCE_REVISION source',
        (_, pod) => {
          const ref = env(pod, 'PUNI_SOURCE_REVISION').valueFrom?.configMapKeyRef;
          if (ref) ref.key = 'revision';
        },
      ],
    ];
  for (const [field, change] of negatives) {
    it(`refuses a backup job whose ${field} differs from the backend`, () => {
      const problems = judgeBackupJob(mutated(change), RUNNER);
      expect(problems[0]).toStartWith(`sqlite-backup ${field} is `);
    });
  }

  it('refuses a runner ConfigMap that is not backup-sqlite.ts byte for byte', () => {
    expect(judgeBackupJob(committed(), `${RUNNER}\n// changed`)).toEqual([
      'ConfigMap sqlite-backup-runner does not carry tools/tool-fleet/src/backup-sqlite.ts byte for byte',
    ]);
  });

  it('refuses an overlay without the backup job', () => {
    expect(
      judgeBackupJob(
        committed().filter((each) => each.kind !== 'CronJob'),
        RUNNER,
      ),
    ).toEqual(['the overlay must render both Deployment wbs-backend and CronJob sqlite-backup']);
  });
});
