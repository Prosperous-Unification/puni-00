import { describe, expect, it } from 'bun:test';

import {
  type ClusterSnapshot,
  evaluateHealth,
  type HealthRule,
  healthRules,
  observeCluster,
  readOnly,
} from './health';
import type { Kubectl } from './recover';

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
    throw error;
  }
  throw new Error('Expected the operation to reject');
}

const now = new Date('2026-09-18T12:00:00Z');
const ready = [{ type: 'Ready', status: 'True' }];

function healthy(): ClusterSnapshot {
  return {
    clusterId: 'platform-local',
    marker: { data: { 'cluster-id': 'platform-local' } },
    nodes: {
      items: [
        {
          metadata: { name: 'server-0', labels: { 'node-role.kubernetes.io/etcd': 'true' } },
          spec: {},
          status: { conditions: [...ready, { type: 'EtcdIsVoter', status: 'True' }] },
        },
      ],
    },
    pods: {
      items: [
        {
          metadata: { name: 'registry', namespace: 'puni-registry' },
          status: { phase: 'Running', conditions: ready },
        },
        {
          metadata: {
            name: 'drill-1',
            namespace: 'wbs',
            ownerReferences: [{ kind: 'Job', name: 'drill' }],
          },
          status: { phase: 'Failed' },
        },
      ],
    },
    attachments: {
      items: [
        { metadata: { name: 'va-1' }, spec: { nodeName: 'server-0' }, status: { attached: true } },
      ],
    },
    claims: {
      items: [
        { metadata: { name: 'registry', namespace: 'puni-registry' }, status: { phase: 'Bound' } },
      ],
    },
    flux: {
      items: [
        {
          kind: 'Kustomization',
          metadata: { name: 'backup', namespace: 'flux-system' },
          spec: {},
          status: { conditions: ready },
        },
      ],
    },
    etcdSnapshots: {
      items: [
        {
          metadata: { name: 's3-snap' },
          spec: { snapshotName: 'snap' },
          status: { readyToUse: true, creationTime: '2026-09-18T08:00:00Z' },
        },
      ],
    },
    backups: {
      cronJobs: {
        items: [
          {
            metadata: { name: 'sqlite-backup', namespace: 'wbs' },
            spec: {},
            status: { lastSuccessfulTime: '2026-09-18T11:17:00Z' },
          },
        ],
      },
      jobs: {
        items: [
          {
            metadata: {
              name: 'sqlite-backup-1',
              namespace: 'wbs',
              ownerReferences: [{ kind: 'CronJob', name: 'sqlite-backup' }],
            },
            status: {
              startTime: '2026-09-18T10:17:00Z',
              conditions: [{ type: 'Failed', status: 'True' }],
            },
          },
          {
            metadata: {
              name: 'sqlite-backup-2',
              namespace: 'wbs',
              ownerReferences: [{ kind: 'CronJob', name: 'sqlite-backup' }],
            },
            status: {
              startTime: '2026-09-18T11:17:00Z',
              conditions: [{ type: 'Complete', status: 'True' }],
            },
          },
        ],
      },
      schedules: {
        items: [
          {
            metadata: { name: 'puni-daily', namespace: 'puni-backup' },
            status: { lastBackup: '2026-09-18T02:00:00Z' },
          },
        ],
      },
      certificates: {
        items: [
          {
            metadata: { name: 'registry-tls', namespace: 'puni-registry' },
            status: { conditions: ready, notAfter: '2026-12-01T00:00:00Z' },
          },
        ],
      },
    },
  };
}

function rulesOf(snapshot: ClusterSnapshot, severity = 'critical'): HealthRule[] {
  return evaluateHealth(snapshot, now)
    .filter((finding) => finding.severity === severity)
    .map(({ rule }) => rule);
}

type Fault = (snapshot: ClusterSnapshot) => ClusterSnapshot;

// One injected fault per rule; each must produce exactly its own critical finding.
const faults: Record<HealthRule, Fault> = {
  'cluster-marker': (snapshot) => ({
    ...snapshot,
    marker: { data: { 'cluster-id': 'workers-local' } },
  }),
  'node-ready': (snapshot) => ({
    ...snapshot,
    nodes: {
      items: snapshot.nodes.items.map((node) => ({
        ...node,
        status: {
          conditions: [
            { type: 'Ready', status: 'Unknown' },
            { type: 'EtcdIsVoter', status: 'True' },
          ],
        },
      })),
    },
  }),
  'etcd-voter': (snapshot) => ({
    ...snapshot,
    nodes: {
      items: snapshot.nodes.items.map((node) => ({ ...node, status: { conditions: ready } })),
    },
  }),
  'etcd-snapshot-fresh': (snapshot) => ({
    ...snapshot,
    etcdSnapshots: {
      items: snapshot.etcdSnapshots.items.map((file) => ({
        ...file,
        status: { readyToUse: true, creationTime: '2026-09-18T04:00:00Z' },
      })),
    },
  }),
  'flux-ready': (snapshot) => ({
    ...snapshot,
    flux: {
      items: snapshot.flux.items.map((object) => ({
        ...object,
        status: { conditions: [{ type: 'Ready', status: 'False' }] },
      })),
    },
  }),
  'pod-ready': (snapshot) => ({
    ...snapshot,
    pods: {
      items: [
        ...snapshot.pods.items,
        { metadata: { name: 'stuck', namespace: 'wbs' }, status: { phase: 'Pending' } },
      ],
    },
  }),
  'volume-attached': (snapshot) => ({
    ...snapshot,
    attachments: {
      items: [
        { metadata: { name: 'va-1' }, spec: { nodeName: 'server-0' }, status: { attached: false } },
      ],
    },
  }),
  'claim-bound': (snapshot) => ({
    ...snapshot,
    claims: {
      items: [
        { metadata: { name: 'registry', namespace: 'puni-registry' }, status: { phase: 'Lost' } },
      ],
    },
  }),
  'backup-fresh': (snapshot) => ({
    ...snapshot,
    backups: snapshot.backups && {
      ...snapshot.backups,
      cronJobs: {
        items: snapshot.backups.cronJobs.items.map((cronJob) => ({
          ...cronJob,
          spec: { suspend: true },
        })),
      },
    },
  }),
  'backup-job-failed': (snapshot) => ({
    ...snapshot,
    backups: snapshot.backups && {
      ...snapshot.backups,
      jobs: { items: snapshot.backups.jobs.items.slice(0, 1) },
    },
  }),
  'certificate-valid': (snapshot) => ({
    ...snapshot,
    backups: snapshot.backups && {
      ...snapshot.backups,
      certificates: {
        items: [
          {
            metadata: { name: 'registry-tls', namespace: 'puni-registry' },
            status: { conditions: ready, notAfter: '2026-09-25T00:00:00Z' },
          },
        ],
      },
    },
  }),
};

describe('evaluateHealth', () => {
  it('reports no critical finding for the healthy fixture', () => {
    expect(rulesOf(healthy())).toEqual([]);
  });

  for (const rule of healthRules) {
    it(`reports ${rule} for its injected fault`, () => {
      expect(rulesOf(faults[rule](healthy()))).toEqual([rule]);
    });
  }

  it('reports a suspended Flux object and a cordoned node as warnings', () => {
    const snapshot = healthy();
    const suspended = {
      ...snapshot,
      flux: {
        items: snapshot.flux.items.map((object) => ({ ...object, spec: { suspend: true } })),
      },
      nodes: {
        items: snapshot.nodes.items.map((node) => ({ ...node, spec: { unschedulable: true } })),
      },
    };
    expect(rulesOf(suspended, 'warning').sort()).toEqual(['flux-ready', 'node-ready']);
  });

  it('reports an absent marker, absent snapshots and absent backups as critical', () => {
    expect(rulesOf({ ...healthy(), marker: 'absent' })).toEqual(['cluster-marker']);
    expect(rulesOf({ ...healthy(), etcdSnapshots: { items: [] } })).toEqual([
      'etcd-snapshot-fresh',
    ]);
    const snapshot = healthy();
    const noBackups = {
      ...snapshot,
      backups: snapshot.backups && {
        ...snapshot.backups,
        cronJobs: { items: [] },
        schedules: { items: [] },
      },
    };
    expect(rulesOf(noBackups)).toEqual(['backup-fresh', 'backup-fresh']);
  });
});

describe('observeCluster', () => {
  it('reads only with get and refuses any other verb', async () => {
    const calls: string[] = [];
    const kubectl: Kubectl = (arguments_) => {
      calls.push(arguments_[0]);
      return Promise.resolve('{"items":[]}');
    };
    expect(
      (await rejectionOf(readOnly(kubectl)(['delete', 'node', 'server-0']))).message,
    ).toContain('read-only');
    const snapshot = await observeCluster(kubectl, 'workers-local');
    expect(new Set(calls)).toEqual(new Set(['get']));
    expect(snapshot.backups).toBeUndefined();
    expect(rulesOf(snapshot)).toEqual(['cluster-marker']);
  });

  it('fails when a required resource type cannot be read', async () => {
    const kubectl: Kubectl = (arguments_) => {
      if (arguments_[1] === 'schedules.velero.io') {
        return Promise.reject(new Error('no resource type'));
      }
      if (arguments_[1] === 'configmaps') {
        return Promise.resolve(
          JSON.stringify({
            items: [
              {
                metadata: { name: 'puni-cluster-platform-local' },
                data: { 'cluster-id': 'platform-local' },
              },
            ],
          }),
        );
      }
      return Promise.resolve('{"items":[]}');
    };
    expect((await rejectionOf(observeCluster(kubectl, 'platform-local'))).message).toContain(
      'no resource type',
    );
  });
});
