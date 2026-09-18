import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';
import { parse } from 'yaml';

import {
  bundleConfigMapName,
  cancelRun,
  decodeSyntheticTemplate,
  dispatchRun,
  readJournal,
  reconcileRun,
  renderSyntheticJob,
} from './maintenance-workers';
import type { Kubectl } from './recover';

const root = join(import.meta.dir, '../../..');
const bundle = new TextEncoder().encode('bundle bytes');

interface EditableTemplate {
  spec: {
    backoffLimit?: number;
    ttlSecondsAfterFinished?: number;
    podReplacementPolicy?: string;
    template: {
      spec: {
        automountServiceAccountToken: boolean;
        containers: { resources: { limits: object } }[];
        volumes: unknown[];
      };
    };
  };
}

async function templateSource(): Promise<EditableTemplate> {
  // Boundary: the committed template is a Job mapping; decodeSyntheticTemplate validates it, and
  // the negatives below only need these paths to exist.
  return parse(
    await readFile(join(root, 'infra/platform/workers-jobs/synthetic-job.yaml'), 'utf8'),
  ) as EditableTemplate;
}

function withSpec(source: EditableTemplate, change: (spec: EditableTemplate['spec']) => void) {
  const copy = structuredClone(source);
  change(copy.spec);
  return copy;
}

describe('the committed synthetic Job template', () => {
  it('decodes with every bound present', async () => {
    const job = decodeSyntheticTemplate(await templateSource());
    expect(job.spec.podReplacementPolicy).toBe('Failed');
  });

  it('refuses a template that loosens a bound', async () => {
    const source = await templateSource();
    const loosened = [
      withSpec(source, (spec) => delete spec.podReplacementPolicy),
      withSpec(source, (spec) => (spec.backoffLimit = 6)),
      withSpec(source, (spec) => {
        spec.template.spec.automountServiceAccountToken = true;
      }),
      withSpec(source, (spec) => {
        spec.template.spec.containers[0].resources.limits = { cpu: '1' };
      }),
      withSpec(source, (spec) => {
        spec.template.spec.volumes[0] = { name: 'workspace', hostPath: { path: '/' } };
      }),
      withSpec(source, (spec) => {
        spec.template.spec.volumes[0] = { name: 'workspace', emptyDir: { sizeLimit: '64Mi' } };
      }),
      withSpec(source, (spec) => (spec.ttlSecondsAfterFinished = 3600)),
    ];
    for (const job of loosened) expect(() => decodeSyntheticTemplate(job)).toThrow(/unbounded/);
  });

  it('renders one run with its own name, run id, scenario and bundle', async () => {
    const job = renderSyntheticJob(decodeSyntheticTemplate(await templateSource()), {
      runId: 'drill-7',
      scenario: 'exhaust-memory',
      holdSeconds: 5,
      bundleConfigMap: 'harness-worker-abc',
    });
    expect(job.metadata.name).toBe('synthetic-drill-7');
    const env = Object.fromEntries(
      job.spec.template.spec.containers[0].env.map(({ name, value }) => [name, value]),
    );
    expect(env).toMatchObject({
      PUNI_RUN_ID: 'drill-7',
      PUNI_SCENARIO: 'exhaust-memory',
      PUNI_HOLD_SECONDS: '5',
    });
    expect(JSON.stringify(job.spec.template.spec.volumes)).toContain('harness-worker-abc');
    expect(() =>
      renderSyntheticJob(job, {
        runId: 'Bad/Id',
        scenario: 'complete',
        holdSeconds: 0,
        bundleConfigMap: 'x',
      }),
    ).toThrow(/run id/);
  });
});

function fakeCluster() {
  const jobs = new Map<string, Record<string, unknown>>();
  const calls: string[][] = [];
  const identity = { uid: 'cluster-1' };
  const respond = (arguments_: readonly string[], stdin?: string): string => {
    calls.push([...arguments_]);
    const [verb, kind, name] = arguments_;
    if (verb === 'get' && kind === 'namespace') return identity.uid;
    if (verb === 'get' && kind === 'configmap') return '';
    if (verb === 'create' && stdin !== undefined) {
      const object = JSON.parse(stdin) as { kind: string; metadata: { name: string } };
      if (object.kind !== 'Job') return '';
      if (jobs.has(object.metadata.name)) {
        throw new Error(
          `Error from server (AlreadyExists): jobs "${object.metadata.name}" already exists`,
        );
      }
      jobs.set(object.metadata.name, { metadata: { uid: 'u' }, status: {} });
      return `job.batch/${object.metadata.name}`;
    }
    if (verb === 'get' && kind === 'job') {
      const job = jobs.get(name);
      return job === undefined ? '' : JSON.stringify(job);
    }
    if (verb === 'delete') {
      jobs.delete(name);
      return '';
    }
    throw new Error(`unexpected kubectl ${arguments_.join(' ')}`);
  };
  const kubectl: Kubectl = (arguments_, stdin) => {
    try {
      return Promise.resolve(respond(arguments_, stdin));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  };
  return { jobs, calls, kubectl, identity };
}

describe('the synthetic run authority', () => {
  async function setup() {
    const template = decodeSyntheticTemplate(await templateSource());
    const journal = join(await mkdtemp(join(tmpdir(), 'puni-authority-')), 'journal.json');
    const cluster = fakeCluster();
    const request = {
      runId: 'drill-1',
      scenario: 'complete' as const,
      holdSeconds: 0,
      cluster: 'workers-local',
      bundle,
    };
    return { template, journal, cluster, request };
  }

  it('refuses a duplicate start from the authority and from the API', async () => {
    const { template, journal, cluster, request } = await setup();
    await dispatchRun(cluster.kubectl, template, journal, request);
    expect(dispatchRun(cluster.kubectl, template, journal, request)).rejects.toThrow(
      /already dispatched/,
    );
    const otherJournal = `${journal}.other`;
    expect(dispatchRun(cluster.kubectl, template, otherJournal, request)).rejects.toThrow(
      /synthetic-drill-1 already exists/,
    );
    await Bun.sleep(0);
    expect((await readJournal(otherJournal)).runs).toEqual({});
  });

  it('starts a run again once after its cluster lost it, then fails loudly', async () => {
    const { template, journal, cluster, request } = await setup();
    await dispatchRun(cluster.kubectl, template, journal, request);
    cluster.jobs.clear();
    cluster.identity.uid = 'cluster-2';
    const second = await reconcileRun(cluster.kubectl, template, journal, 'drill-1', bundle);
    expect(second.runs['drill-1']).toMatchObject({ state: 'dispatched', attempts: 2 });
    cluster.jobs.clear();
    cluster.identity.uid = 'cluster-3';
    const third = await reconcileRun(cluster.kubectl, template, journal, 'drill-1', bundle);
    expect(third.runs['drill-1']).toMatchObject({ state: 'failed', attempts: 2 });
  });

  it('reports an unknown outcome, never a restart, for a Job gone from the same cluster', async () => {
    const { template, journal, cluster, request } = await setup();
    await dispatchRun(cluster.kubectl, template, journal, request);
    cluster.jobs.clear();
    const reconciled = await reconcileRun(cluster.kubectl, template, journal, 'drill-1', bundle);
    expect(reconciled.runs['drill-1']).toMatchObject({
      state: 'failed',
      attempts: 1,
      detail: 'outcome unknown: Job absent on the same cluster',
    });
    expect(cluster.calls.filter(([verb]) => verb === 'create').length).toBe(1 + 1);
  });

  it('records completion and failure from the Job, and cancellation before deletion', async () => {
    const { template, journal, cluster, request } = await setup();
    await dispatchRun(cluster.kubectl, template, journal, request);
    cluster.jobs.set('synthetic-drill-1', { metadata: { uid: 'u' }, status: { succeeded: 1 } });
    expect(
      (await reconcileRun(cluster.kubectl, template, journal, 'drill-1', bundle)).runs['drill-1']
        .state,
    ).toBe('complete');
    expect(cluster.jobs.has('synthetic-drill-1')).toBe(false);
    await dispatchRun(cluster.kubectl, template, journal, { ...request, runId: 'drill-2' });
    cluster.jobs.set('synthetic-drill-2', {
      metadata: { uid: 'u' },
      status: { conditions: [{ type: 'Failed', status: 'True', reason: 'PodFailurePolicy' }] },
    });
    const failed = await reconcileRun(cluster.kubectl, template, journal, 'drill-2', bundle);
    expect(failed.runs['drill-2']).toMatchObject({ state: 'failed', detail: 'PodFailurePolicy' });
    await dispatchRun(cluster.kubectl, template, journal, { ...request, runId: 'drill-3' });
    const cancelled = await cancelRun(cluster.kubectl, journal, 'drill-3');
    expect(cancelled.runs['drill-3'].state).toBe('cancelled');
    expect(cluster.jobs.has('synthetic-drill-3')).toBe(false);
  });

  it('names the bundle ConfigMap after its bytes', () => {
    expect(bundleConfigMapName(bundle)).toMatch(/^harness-worker-[0-9a-f]{12}$/);
    expect(bundleConfigMapName(new TextEncoder().encode('other'))).not.toBe(
      bundleConfigMapName(bundle),
    );
  });
});
