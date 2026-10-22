/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Mounted Kubernetes JSON fault fixtures and Bun async assertion typings. */
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { backendTaskJob, executeRelease, jobName, kubectlEffects } from './execute';
import { FakeCluster } from './fake-cluster';
import { fileJournal } from './journal';
import type { ReleaseIdentity, ReleaseRequest } from './release';

function identity(fill: string): ReleaseIdentity {
  const image = `registry.test/backend@sha256:${fill.repeat(64)}`;
  return {
    sourceSha: fill.repeat(40),
    images: { backend: image, gateway: image, frontend: image, mcp: image },
  };
}
function mounted(original?: boolean) {
  const root = scratchSync('k8s-controller-release-');
  const path = join(root, 'kubectl');
  const store = join(root, 'cluster.json');
  const journal = fileJournal(join(root, 'release.json'));
  const previous = identity('a');
  const candidate = identity('b');
  const request: ReleaseRequest = {
    environment: 'local',
    cluster: { context: 'lab', uid: 'uid-lab' },
    namespaces: { app: 'wbs', backend: 'wbs-solver' },
    release: candidate,
    expectedCurrent: previous,
    admission: { package: 'p', activation: 'a' },
    flux: null,
    recovers: null,
  };
  const fake = new FakeCluster(previous, ['0001_init'], 'desired');
  fake.migrationsByImage.set(previous.images.backend, [
    { name: '0001_init', hash: 'hash-0001_init', downSha256: 'down-1' },
  ]);
  fake.migrationsByImage.set(candidate.images.backend, [
    { name: '0001_init', hash: 'hash-0001_init', downSha256: 'down-1' },
    { name: '0002_add', hash: 'hash-0002_add', downSha256: 'down-2' },
  ]);
  const metadata = (name: string) => ({
    name,
    namespace: 'wbs-solver',
    uid: `${name}-uid`,
    resourceVersion: '1',
    annotations: {},
  });
  const source = {
    containers: [
      {
        name: 'backup',
        image: previous.images.backend,
        volumeMounts: [{ name: 'db', mountPath: '/data' }],
      },
    ],
    volumes: [{ name: 'db', persistentVolumeClaim: { claimName: 'wbs-data' } }],
  };
  const objects: Record<string, any> = {
    'namespace/kube-system': { metadata: { name: 'kube-system', uid: 'uid-lab' } },
    'pvc/wbs-data': {
      metadata: metadata('wbs-data'),
      spec: { volumeName: 'disk' },
      status: { phase: 'Bound' },
    },
    'pv/disk': {
      metadata: { name: 'disk', uid: 'disk-uid' },
      spec: { claimRef: { name: 'wbs-data', namespace: 'wbs-solver', uid: 'wbs-data-uid' } },
      status: { phase: 'Bound' },
    },
    'cronjob/sqlite-backup': {
      apiVersion: 'batch/v1',
      kind: 'CronJob',
      metadata: metadata('sqlite-backup'),
      spec: {
        schedule: '* * * * *',
        ...(original === undefined ? {} : { suspend: original }),
        jobTemplate: { spec: { template: { spec: source } } },
      },
    },
    'deployment/wbs-backend': {
      kind: 'Deployment',
      metadata: metadata('wbs-backend'),
      spec: { replicas: 1, template: { spec: source } },
      status: { replicas: 1 },
    },
    'networkpolicy/wbs-backend-writers': {
      metadata: metadata('wbs-backend-writers'),
      spec: {
        podSelector: { matchLabels: { 'app.kubernetes.io/name': 'wbs-backend' } },
        policyTypes: ['Ingress'],
      },
    },
    jobs: { items: [] },
    pods: { items: [] },
  };
  const save = () => writeFileSync(store, JSON.stringify(objects));
  const load = () => {
    Object.assign(objects, JSON.parse(readFileSync(store, 'utf8')));
  };
  save();
  writeFileSync(
    path,
    `#!/usr/bin/env bun
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
const store = ${JSON.stringify(store)};
const journal = ${JSON.stringify(journal.path)};
const objects = JSON.parse(readFileSync(store, 'utf8'));
appendFileSync(${JSON.stringify(join(root, 'calls.jsonl'))}, JSON.stringify(args)+'\\n');
const backup = objects['cronjob/sqlite-backup'];
const persist = () => writeFileSync(store, JSON.stringify(objects));
if (args.includes('get')) {
  const resource = args[args.indexOf('get')+1];
  if (resource.includes('deployments,statefulsets')) { console.log(JSON.stringify({items:[objects['deployment/wbs-backend'],backup,...objects.jobs.items,...(objects.foreignControllers??[])]})); process.exit(0); }
  if (!(resource in objects)) throw new Error('Forbidden resource '+resource);
  const response=JSON.stringify(objects[resource]);
  if(resource==='pods'&&(objects.swapStorage||objects.swapOwner)){
    objects.podReads=(objects.podReads??0)+1;
    if(objects.podReads===2){ if(objects.swapStorage){objects['pvc/wbs-data'].metadata.uid='replacement-pvc';objects['pv/disk'].spec.claimRef.uid='replacement-pvc';} if(objects.swapOwner==='template')backup.spec.schedule='foreign'; if(objects.swapOwner==='token')backup.metadata.annotations['puni.dev/storage-owner']='foreign'; }
    persist();
  }
  console.log(response); process.exit(0);
}
const intervals = Object.values(JSON.parse(readFileSync(journal,'utf8')).state.controllers);
if (args.includes('patch')) {
  const operations = JSON.parse(args[args.indexOf('-p')+1]);
  const token = backup.metadata.annotations['puni.dev/storage-owner'] ?? operations.find(p=>p.op==='add' && p.path==='/metadata/annotations')?.value['puni.dev/storage-owner'];
  const interval = intervals.find(p=>p?.ownership.token===token);
  if (!interval) throw new Error('missing durable interval');
  const cleanup = operations.some(p=>p.op==='remove' && p.path.includes('storage-owner'));
  const expected = cleanup?'cleanup-pending':backup.metadata.annotations['puni.dev/storage-owner']?'restore-pending':'suspend-pending';
  if (interval.stage!==expected) throw new Error('missing durable '+expected);
  if (objects.race) {
    const fault=objects.race; delete objects.race;
    if(fault==='UID')backup.metadata.uid='replacement';
    if(fault==='resourceVersion')backup.metadata.resourceVersion='99';
    if(fault==='template')backup.spec.schedule='foreign';
    if(fault==='token')backup.metadata.annotations['puni.dev/storage-owner']='foreign';
    persist();
  }
  const draft = structuredClone(backup);
  for (const operation of operations) {
    const keys = operation.path.slice(1).split('/').map(k=>k.replaceAll('~1','/').replaceAll('~0','~'));
    let parent=draft;
    for (const key of keys.slice(0,-1)) parent=parent[key];
    const key=keys.at(-1);
    if (operation.op==='test' && JSON.stringify(parent[key])!==JSON.stringify(operation.value)) throw new Error('Conflict');
    if (operation.op==='add'||operation.op==='replace') parent[key]=operation.value;
    if (operation.op==='remove') delete parent[key];
  }
  draft.metadata.resourceVersion=String(Number(backup.metadata.resourceVersion)+1);
  objects['cronjob/sqlite-backup']=draft; persist(); console.log(JSON.stringify(draft)); process.exit(0);
}
if (args.includes('delete')) {
  const options=JSON.parse(await Bun.stdin.text());
  appendFileSync(${JSON.stringify(join(root, 'deletes.jsonl'))}, JSON.stringify(options)+'\\n');
  const resource=args[args.indexOf('--raw')+1].includes('/pods/')?'pods':'jobs';
  const name=decodeURIComponent(args[args.indexOf('--raw')+1].split('/').at(-1));
  const selected=objects[resource].items.find(p=>p.metadata.name===name);
  if (!selected || selected.metadata.uid!==options.preconditions.uid) throw new Error('Conflict UID');
  if(!objects.holdDeletion)objects[resource].items=objects[resource].items.filter(p=>p!==selected); persist(); console.log('{}'); process.exit(0);
}
throw new Error('unexpected command '+args.join(' '));
`,
  );
  chmodSync(path, 0o755);
  const adapter = kubectlEffects({
    kubectl: path,
    kubeconfig: null,
    context: 'lab',
    namespaces: request.namespaces,
    stateDir: root,
    overlay: root,
    anonymousProjectsStatus: 200,
    rolloutTimeoutSeconds: 1,
    jobTimeoutSeconds: 1,
    drainTimeoutMs: 50,
    leaseDurationSeconds: 20,
    log: () => undefined,
  });
  const close = fake.closeWrites.bind(fake);
  fake.closeWrites = async () => {
    await close();
    load();
    objects['networkpolicy/wbs-backend-writers'].spec.podSelector = {
      matchLabels: { 'puni.dev/writes': 'fenced' },
    };
    save();
  };
  const stop = fake.stopWriter.bind(fake);
  fake.stopWriter = async () => {
    await stop();
    load();
    objects['deployment/wbs-backend'].spec.replicas = 0;
    objects['deployment/wbs-backend'].status.replicas = 0;
    save();
  };
  const retain = (purpose: string, attempt: string, image: string) => {
    load();
    const name = jobName(purpose, attempt);
    const manifest = backendTaskJob({ namespaces: request.namespaces }, name, image, {});
    const job = {
      ...manifest,
      metadata: {
        ...(manifest['metadata'] as object),
        uid: `retained-${name}`,
        resourceVersion: '1',
      },
      status: {
        active: 0,
        terminating: 0,
        succeeded: 1,
        conditions: [{ type: 'Complete', status: 'True' }],
      },
    };
    const template = (manifest['spec'] as { template: { metadata: object; spec: unknown } })
      .template;
    const pod = {
      metadata: {
        ...template.metadata,
        name: `${name}-pod`,
        namespace: request.namespaces.backend,
        uid: `retained-pod-${name}`,
        ownerReferences: [{ kind: 'Job', name, uid: job.metadata.uid, controller: true }],
      },
      spec: template.spec,
      status: { phase: 'Succeeded' },
    };
    objects['jobs'].items = [
      ...objects['jobs'].items.filter((prior: any) => prior.metadata.name !== name),
      job,
    ];
    objects['pods'].items = [
      ...objects['pods'].items.filter((prior: any) => prior.metadata.name !== pod.metadata.name),
      pod,
    ];
    save();
  };
  const replay = fake.observeReplayInventory.bind(fake);
  fake.observeReplayInventory = async (attempt, image) => {
    const inventory = await replay(attempt, image);
    retain('replay-inventory', attempt, image);
    return inventory;
  };
  const kinds = fake.observeReplayCapabilities.bind(fake);
  fake.observeReplayCapabilities = async (attempt, image) => {
    const capability = await kinds(attempt, image);
    retain('replay-kinds', attempt, image);
    return capability;
  };
  const migrate = fake.migrate.bind(fake);
  fake.migrate = async (attempt, image) => {
    const applied = await migrate(attempt, image);
    retain('migrate', attempt, image);
    return applied;
  };
  const capture = fake.capture.bind(fake);
  fake.capture = async (...args) => {
    expect(journal.read()?.state.controllers.forward?.stage).toBe('drained');
    const observation = await capture(...args);
    retain('capture', args[0].attempt, args[1]);
    return observation;
  };
  const rollout = fake.rolloutBackend.bind(fake);
  fake.rolloutBackend = async (image) => {
    expect(journal.read()?.state.controllers.forward?.stage).toBe('restored');
    await rollout(image);
    load();
    objects['cronjob/sqlite-backup'].spec.jobTemplate.spec.template.spec.containers[0].image =
      image;
    objects['deployment/wbs-backend'].spec.replicas = 1;
    objects['deployment/wbs-backend'].status.replicas = 1;
    save();
  };
  const rollback = fake.rollbackSchema.bind(fake);
  fake.rollbackSchema = async (...args) => {
    const state = journal.read()?.state;
    const interval =
      state?.controllers.forward?.stage === 'restored'
        ? state.controllers.rollback
        : state?.controllers.forward;
    expect(interval?.stage).toBe('drained');
    load();
    expect(objects['cronjob/sqlite-backup'].metadata.annotations['puni.dev/storage-owner']).toBe(
      interval?.ownership.token,
    );
    const restored = await rollback(...args);
    retain('rollback', args[0], args[1]);
    return restored;
  };
  const tiers = fake.rolloutTiers.bind(fake);
  fake.rolloutTiers = async (release) => {
    const state = journal.read()?.state;
    if (release.images.backend === previous.images.backend) {
      const interval = state?.controllers.rollback ?? state?.controllers.forward;
      expect(interval?.stage).toBe('restored');
    }
    await tiers(release);
    load();
    objects['cronjob/sqlite-backup'].spec.jobTemplate.spec.template.spec.containers[0].image =
      release.images.backend;
    objects['deployment/wbs-backend'].spec.replicas = 1;
    objects['deployment/wbs-backend'].status.replicas = 1;
    save();
  };
  Object.assign(fake, {
    suspendStorageController: adapter.suspendStorageController.bind(adapter),
    drainStorageController: adapter.drainStorageController.bind(adapter),
    restoreStorageController: adapter.restoreStorageController.bind(adapter),
    manualControllerCommand: adapter.manualControllerCommand.bind(adapter),
  });
  return {
    root,
    store,
    journal,
    request,
    fake,
    objects,
    save,
    load,
    options: {
      clock: fake.clock,
      sleep: async (ms: number) => {
        fake.now += ms;
        await Promise.resolve();
      },
      heartbeatMs: 3_600_000,
    },
  };
}
for (const original of [undefined, false, true])
  test(`mounted release checkpoints and restores exact ${String(original)} backup suspension`, async () => {
    const fixture = mounted(original);
    try {
      const final = await executeRelease(
        fixture.request,
        fixture.journal,
        fixture.fake,
        () => undefined,
        fixture.options,
      );
      fixture.load();
      expect(final.phase).toBe('lease-released');
      expect(final.controllers.forward?.stage).toBe('restored');
      expect(final.controllers.rollback).toBeNull();
      expect(fixture.objects['cronjob/sqlite-backup'].spec.suspend).toBe(original);
      expect(
        fixture.objects['cronjob/sqlite-backup'].metadata.annotations['puni.dev/storage-owner'],
      ).toBeUndefined();
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }, 30000);

test('mounted dormant abort after rollout creates a new rollback interval and retains forward history', async () => {
  const fixture = mounted(false);
  try {
    fixture.fake.faults.set('smoke', new Error('candidate smoke failed'));
    await expect(
      executeRelease(
        fixture.request,
        fixture.journal,
        fixture.fake,
        () => undefined,
        fixture.options,
      ),
    ).rejects.toThrow('rolled-back');
    const state = fixture.journal.read()?.state;
    fixture.load();
    expect(state?.controllers.forward?.stage).toBe('restored');
    expect(state?.controllers.rollback?.stage).toBe('restored');
    expect(state?.controllers.forward?.ownership.token).not.toBe(
      state?.controllers.rollback?.ownership.token,
    );
    expect(state?.controllers.forward?.ownership.owner.templateSha256).not.toBe(
      state?.controllers.rollback?.ownership.owner.templateSha256,
    );
    expect(fixture.objects['cronjob/sqlite-backup'].spec.suspend).toBe(false);
    expect(fixture.fake.applied).toEqual(['0001_init']);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}, 30000);

test('mounted dormant abort during source work reuses the active forward interval', async () => {
  const fixture = mounted();
  try {
    fixture.fake.brokenEffects.add('migrate');
    await expect(
      executeRelease(
        fixture.request,
        fixture.journal,
        fixture.fake,
        () => undefined,
        fixture.options,
      ),
    ).rejects.toThrow('rolled-back');
    const state = fixture.journal.read()?.state;
    expect(state?.controllers.forward?.stage).toBe('restored');
    expect(state?.controllers.rollback).toBeNull();
    fixture.load();
    expect('suspend' in fixture.objects['cronjob/sqlite-backup'].spec).toBe(false);
    expect(fixture.fake.applied).toEqual(['0001_init']);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}, 30000);

test('mounted omitted checkpoint refuses before controller mutation or capture', async () => {
  const fixture = mounted(false);
  try {
    const omitted = {
      ...fixture.journal,
      write: (entry: Parameters<typeof fixture.journal.write>[0]) => {
        if (entry.state.controllers.forward?.stage !== 'suspend-pending')
          fixture.journal.write(entry);
      },
    };
    await expect(
      executeRelease(fixture.request, omitted, fixture.fake, () => undefined, fixture.options),
    ).rejects.toThrow('checkpoint did not read back');
    fixture.load();
    expect(fixture.objects['cronjob/sqlite-backup'].spec.suspend).toBe(false);
    expect(fixture.fake.calls).not.toContain('capture');
    expect(fixture.fake.calls).not.toContain('migrate');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}, 30000);

for (const stage of ['suspended', 'restore-applied', 'restored'] as const)
  test(`mounted restart reconciles ${stage} patch before durable acknowledgment`, async () => {
    const fixture = mounted(false);
    try {
      let crashed = false;
      const interrupted = {
        ...fixture.journal,
        write: (entry: Parameters<typeof fixture.journal.write>[0]) => {
          if (!crashed && entry.state.controllers.forward?.stage === stage) {
            crashed = true;
            throw new Error('process crashed before acknowledgment');
          }
          fixture.journal.write(entry);
        },
      };
      await expect(
        executeRelease(
          fixture.request,
          interrupted,
          fixture.fake,
          () => undefined,
          fixture.options,
        ),
      ).rejects.toThrow('process crashed');
      expect(crashed).toBe(true);
      await expect(
        executeRelease(
          fixture.request,
          fixture.journal,
          fixture.fake,
          () => undefined,
          fixture.options,
        ),
      ).rejects.toThrow('rolled-back');
      const state = fixture.journal.read()?.state;
      fixture.load();
      expect(state?.controllers.forward?.stage).toBe('restored');
      expect(state?.controllers.rollback?.stage ?? 'restored').toBe('restored');
      expect(fixture.objects['cronjob/sqlite-backup'].spec.suspend).toBe(false);
      expect(
        fixture.objects['cronjob/sqlite-backup'].metadata.annotations['puni.dev/storage-owner'],
      ).toBeUndefined();
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }, 30000);

for (const [name, change] of Object.entries({
  UID: (backup: any) => {
    backup.metadata.uid = 'replacement';
  },
  template: (backup: any) => {
    backup.spec.schedule = 'foreign';
  },
  token: (backup: any) => {
    backup.metadata.annotations['puni.dev/storage-owner'] = 'foreign';
  },
}))
  test(`mounted ${name} change parks before capture and schema reversal`, async () => {
    const fixture = mounted(false);
    try {
      let changed = false;
      const recording = {
        ...fixture.journal,
        write: (entry: Parameters<typeof fixture.journal.write>[0]) => {
          fixture.journal.write(entry);
          if (!changed && entry.state.controllers.forward?.stage === 'suspended') {
            changed = true;
            fixture.load();
            change(fixture.objects['cronjob/sqlite-backup']);
            fixture.save();
          }
        },
      };
      await expect(
        executeRelease(fixture.request, recording, fixture.fake, () => undefined, fixture.options),
      ).rejects.toThrow('rollback-failed');
      expect(fixture.fake.calls).not.toContain('capture');
      expect(fixture.fake.calls).not.toContain('rollbackSchema');
      expect(fixture.fake.calls).not.toContain('rolloutTiers');
      expect(fixture.fake.lease?.parked).toBe('rollback-failed');
      expect(fixture.fake.writesOpen).toBe(false);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }, 30000);

test('mounted exact restore failure retains barrier and pinned manual inspection command', async () => {
  const fixture = mounted(false);
  try {
    let changed = false;
    const recording = {
      ...fixture.journal,
      write: (entry: Parameters<typeof fixture.journal.write>[0]) => {
        fixture.journal.write(entry);
        if (!changed && entry.state.controllers.forward?.stage === 'restore-pending') {
          changed = true;
          fixture.load();
          fixture.objects['cronjob/sqlite-backup'].spec.schedule = 'foreign';
          fixture.save();
        }
      },
    };
    await expect(
      executeRelease(fixture.request, recording, fixture.fake, () => undefined, fixture.options),
    ).rejects.toThrow('rollback-failed');
    const state = fixture.journal.read()?.state;
    expect(state?.failure?.manualCommand).toContain('sqlite-backup-uid');
    expect(state?.failure?.manualCommand).toContain(
      state?.controllers.forward?.ownership.token ?? 'missing',
    );
    expect(state?.failure?.manualCommand).toContain(fixture.journal.path);
    expect(fixture.fake.calls).not.toContain('rolloutBackend');
    expect(fixture.fake.calls).not.toContain('rollbackSchema');
    expect(fixture.fake.applied).toEqual(['0001_init', '0002_add']);
    expect(fixture.fake.calls.filter((call) => call === 'stopWriter')).toHaveLength(1);
    expect(fixture.fake.lease?.parked).toBe('rollback-failed');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}, 30000);

function descendants(fixture: ReturnType<typeof mounted>, foreignPod = false) {
  const spec = structuredClone(
    fixture.objects['cronjob/sqlite-backup'].spec.jobTemplate.spec.template.spec,
  );
  fixture.objects['jobs'].items = [
    {
      kind: 'Job',
      metadata: {
        name: 'backup-job',
        namespace: 'wbs-solver',
        uid: 'backup-job-uid',
        ownerReferences: [
          { kind: 'CronJob', name: 'sqlite-backup', uid: 'sqlite-backup-uid', controller: true },
        ],
      },
      spec: { template: { spec } },
      status: { active: 1 },
    },
  ];
  fixture.objects['pods'].items = [
    {
      metadata: {
        name: 'backup-pod',
        namespace: 'wbs-solver',
        uid: 'backup-pod-uid',
        ownerReferences: [
          {
            kind: 'Job',
            name: 'backup-job',
            uid: foreignPod ? 'foreign-job-uid' : 'backup-job-uid',
            controller: true,
          },
        ],
      },
      spec,
      status: { phase: 'Running' },
    },
  ];
  fixture.save();
}

test('mounted drain deletes actual UID descendants with UID-preconditioned orphan deletion', async () => {
  const fixture = mounted(false);
  try {
    descendants(fixture);
    const final = await executeRelease(
      fixture.request,
      fixture.journal,
      fixture.fake,
      () => undefined,
      fixture.options,
    );
    expect(final.phase).toBe('lease-released');
    const deleted = readFileSync(join(fixture.root, 'deletes.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(deleted.map((entry) => entry.preconditions)).toEqual([
      { uid: 'backup-pod-uid' },
      { uid: 'backup-job-uid' },
    ]);
    expect(deleted.every((entry) => entry.propagationPolicy === 'Orphan')).toBe(true);
    expect(deleted.every((entry) => !('gracePeriodSeconds' in entry))).toBe(true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}, 30000);

test('mounted drain never deletes a Pod with the same Job name and a foreign Job UID', async () => {
  const fixture = mounted(false);
  try {
    descendants(fixture, true);
    await expect(
      executeRelease(
        fixture.request,
        fixture.journal,
        fixture.fake,
        () => undefined,
        fixture.options,
      ),
    ).rejects.toThrow('foreign source consumer');
    fixture.load();
    expect(fixture.objects['pods'].items[0].metadata.uid).toBe('backup-pod-uid');
    expect(fixture.objects['jobs'].items[0].metadata.uid).toBe('backup-job-uid');
    expect(fixture.fake.calls).not.toContain('capture');
    expect(fixture.fake.lease?.parked).toBe('rollback-failed');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}, 30000);

for (const readonly of [false, true])
  test(`mounted unlabelled ${readonly ? 'readonly' : 'writable'} source consumer refuses`, async () => {
    const fixture = mounted(false);
    try {
      const spec = structuredClone(
        fixture.objects['cronjob/sqlite-backup'].spec.jobTemplate.spec.template.spec,
      );
      if (readonly) {
        spec.volumes[0].persistentVolumeClaim.readOnly = true;
        spec.containers[0].volumeMounts[0].readOnly = true;
        spec.containers[0].volumeMounts[0].recursiveReadOnly = 'Enabled';
      }
      fixture.objects['pods'].items = [
        {
          metadata: { name: 'unlabelled', namespace: 'wbs-solver', uid: 'unlabelled-uid' },
          spec,
          status: { phase: 'Running' },
        },
      ];
      fixture.save();
      await expect(
        executeRelease(
          fixture.request,
          fixture.journal,
          fixture.fake,
          () => undefined,
          fixture.options,
        ),
      ).rejects.toThrow('foreign source consumer');
      expect(fixture.fake.calls).not.toContain('capture');
      expect(fixture.fake.calls).not.toContain('rollbackSchema');
      fixture.load();
      expect(fixture.objects['pods'].items).toHaveLength(1);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }, 30000);

test('mounted repeated inventory refuses a reader appearing after source capture', async () => {
  const fixture = mounted(false);
  try {
    const capture = fixture.fake.capture.bind(fixture.fake);
    fixture.fake.capture = async (...args) => {
      const captured = await capture(...args);
      fixture.load();
      fixture.objects['pods'].items = [
        {
          metadata: { name: 'late-reader', namespace: 'wbs-solver', uid: 'late-reader-uid' },
          spec: fixture.objects['cronjob/sqlite-backup'].spec.jobTemplate.spec.template.spec,
          status: { phase: 'Running' },
        },
      ];
      fixture.save();
      return captured;
    };
    await expect(
      executeRelease(
        fixture.request,
        fixture.journal,
        fixture.fake,
        () => undefined,
        fixture.options,
      ),
    ).rejects.toThrow('foreign source consumer');
    expect(fixture.fake.calls).toContain('capture');
    expect(fixture.fake.calls).not.toContain('migrate');
    expect(fixture.fake.calls).not.toContain('rollbackSchema');
    expect(fixture.fake.calls).not.toContain('rolloutBackend');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}, 30000);

test('mounted Lease loss during inventory stops before descendant deletion or source work', async () => {
  const fixture = mounted(false);
  try {
    descendants(fixture);
    const renew = fixture.fake.renewLease.bind(fixture.fake);
    fixture.fake.renewLease = async (holder) => {
      let calls = '';
      try {
        calls = readFileSync(join(fixture.root, 'calls.jsonl'), 'utf8');
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
      }
      if (calls.includes('"jobs"')) throw new Error('Lease lost during controller inventory');
      await renew(holder);
    };
    await expect(
      executeRelease(
        fixture.request,
        fixture.journal,
        fixture.fake,
        () => undefined,
        fixture.options,
      ),
    ).rejects.toThrow('Lease lost');
    fixture.load();
    expect(fixture.objects['pods'].items).toHaveLength(1);
    expect(fixture.objects['jobs'].items).toHaveLength(1);
    expect(fixture.fake.calls).not.toContain('capture');
    expect(fixture.fake.calls).not.toContain('rollbackSchema');
    expect(fixture.journal.read()?.state.controllers.forward?.stage).toBe('suspended');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}, 30000);

for (const fault of ['missing', 'unreadable', 'corrupt'] as const)
  test(`mounted ${fault} journal refuses before controller mutation on restart`, async () => {
    const fixture = mounted(false);
    try {
      const interrupted = {
        ...fixture.journal,
        write: (entry: Parameters<typeof fixture.journal.write>[0]) => {
          fixture.journal.write(entry);
          if (entry.state.controllers.forward?.stage === 'suspend-pending')
            throw new Error('process crash before patch');
        },
      };
      await expect(
        executeRelease(
          fixture.request,
          interrupted,
          fixture.fake,
          () => undefined,
          fixture.options,
        ),
      ).rejects.toThrow('process crash');
      if (fault === 'missing') rmSync(fixture.journal.path);
      if (fault === 'unreadable') chmodSync(fixture.journal.path, 0o000);
      if (fault === 'corrupt') writeFileSync(fixture.journal.path, '{');
      await expect(
        executeRelease(
          fixture.request,
          fixture.journal,
          fixture.fake,
          () => undefined,
          fixture.options,
        ),
      ).rejects.toThrow();
      fixture.load();
      expect(fixture.objects['cronjob/sqlite-backup'].spec.suspend).toBe(false);
      expect(
        fixture.objects['cronjob/sqlite-backup'].metadata.annotations['puni.dev/storage-owner'],
      ).toBeUndefined();
      expect(fixture.fake.calls).not.toContain('capture');
      expect(fixture.fake.calls).not.toContain('migrate');
    } finally {
      chmodSync(fixture.root, 0o700);
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }, 30000);

for (const fault of ['UID', 'resourceVersion', 'template', 'token'])
  test(`mounted atomic ${fault} guard refuses a patch race before changing suspension`, async () => {
    const fixture = mounted(false);
    try {
      fixture.objects['race'] = fault;
      fixture.save();
      await expect(
        executeRelease(
          fixture.request,
          fixture.journal,
          fixture.fake,
          () => undefined,
          fixture.options,
        ),
      ).rejects.toThrow('rollback-failed');
      fixture.load();
      expect(fixture.objects['cronjob/sqlite-backup'].spec.suspend).toBe(false);
      expect(fixture.fake.calls).not.toContain('capture');
      expect(fixture.fake.calls).not.toContain('rollbackSchema');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }, 30000);

test('mounted bounded drain timeout preserves suspended owner and refuses source work', async () => {
  const fixture = mounted(false);
  try {
    descendants(fixture);
    fixture.objects['holdDeletion'] = true;
    fixture.save();
    await expect(
      executeRelease(
        fixture.request,
        fixture.journal,
        fixture.fake,
        () => undefined,
        fixture.options,
      ),
    ).rejects.toThrow('did not converge');
    fixture.load();
    expect(fixture.objects['cronjob/sqlite-backup'].spec.suspend).toBe(true);
    expect(fixture.objects['pods'].items).toHaveLength(1);
    expect(fixture.fake.calls).not.toContain('capture');
    expect(fixture.fake.calls).not.toContain('rollbackSchema');
    expect(fixture.fake.lease?.parked).toBe('rollback-failed');
    expect(
      readFileSync(join(fixture.root, 'deletes.jsonl'), 'utf8').trim().split('\n'),
    ).toHaveLength(4);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}, 30000);

test('mounted storage replacement after drain refuses before source capture', async () => {
  const fixture = mounted(false);
  try {
    fixture.objects['swapStorage'] = true;
    fixture.save();
    await expect(
      executeRelease(
        fixture.request,
        fixture.journal,
        fixture.fake,
        () => undefined,
        fixture.options,
      ),
    ).rejects.toThrow('controller interval storage or owner identity changed');
    expect(fixture.fake.calls).not.toContain('observeReplayInventory');
    expect(fixture.fake.calls).not.toContain('capture');
    expect(fixture.fake.calls).not.toContain('migrate');
    expect(fixture.fake.lease?.parked).toBe('rollback-failed');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}, 30000);

test('mounted retained production Job manifests survive every subsequent source barrier', async () => {
  const fixture = mounted(false);
  try {
    await executeRelease(
      fixture.request,
      fixture.journal,
      fixture.fake,
      () => undefined,
      fixture.options,
    );
    fixture.load();
    expect(
      fixture.objects['jobs'].items.some((job: any) =>
        job.metadata.name.startsWith('wbs-replay-inventory-'),
      ),
    ).toBe(true);
    expect(
      fixture.objects['jobs'].items.some((job: any) =>
        job.metadata.name.startsWith('wbs-capture-'),
      ),
    ).toBe(true);
    expect(
      fixture.objects['jobs'].items.every((job: any) => job.spec.ttlSecondsAfterFinished === 86400),
    ).toBe(true);
    expect(
      fixture.objects['pods'].items.every((pod: any) => pod.status.phase === 'Succeeded'),
    ).toBe(true);
    for (const pod of fixture.objects['pods'].items) {
      const owner = fixture.objects['jobs'].items.find(
        (job: any) => job.metadata.uid === pod.metadata.ownerReferences[0].uid,
      );
      expect(pod.spec).toEqual(owner.spec.template.spec);
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}, 30000);

test('mounted dormant rollback resumes after durable restoration of its reused forward interval', async () => {
  const fixture = mounted(false);
  try {
    fixture.fake.brokenEffects.add('migrate');
    let crashed = false;
    const interrupted = {
      ...fixture.journal,
      write: (entry: Parameters<typeof fixture.journal.write>[0]) => {
        fixture.journal.write(entry);
        if (
          !crashed &&
          entry.state.phase === 'rollback-replay-checked' &&
          entry.state.controllers.forward?.stage === 'restored'
        ) {
          crashed = true;
          throw new Error('crash after durable rollback restore');
        }
      },
    };
    await expect(
      executeRelease(fixture.request, interrupted, fixture.fake, () => undefined, fixture.options),
    ).rejects.toThrow('crash after durable rollback restore');
    await expect(
      executeRelease(
        fixture.request,
        fixture.journal,
        fixture.fake,
        () => undefined,
        fixture.options,
      ),
    ).rejects.toThrow('rolled-back');
    expect(fixture.journal.read()?.state.controllers.forward?.stage).toBe('restored');
    expect(fixture.journal.read()?.state.controllers.rollback).toBeNull();
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}, 30000);

for (const fault of ['template', 'token'])
  test(`mounted owner ${fault} drift after drain refuses before source replay`, async () => {
    const fixture = mounted(false);
    try {
      fixture.objects['swapOwner'] = fault;
      fixture.save();
      await expect(
        executeRelease(
          fixture.request,
          fixture.journal,
          fixture.fake,
          () => undefined,
          fixture.options,
        ),
      ).rejects.toThrow('rollback-failed');
      expect(fixture.fake.calls).not.toContain('observeReplayInventory');
      expect(fixture.fake.calls).not.toContain('capture');
      expect(fixture.fake.calls).not.toContain('migrate');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }, 30000);

for (const fault of [
  'active',
  'terminating',
  'condition',
  'deleting-job',
  'live-pod',
  'deleting-pod',
])
  test(`mounted retained history refuses ${fault} before source capture`, async () => {
    const fixture = mounted(false);
    try {
      const replay = fixture.fake.observeReplayInventory.bind(fixture.fake);
      let injected = false;
      fixture.fake.observeReplayInventory = async (...args) => {
        const inventory = await replay(...args);
        if (!injected) {
          injected = true;
          fixture.load();
          const job = fixture.objects['jobs'].items[0];
          const pod = fixture.objects['pods'].items[0];
          if (fault === 'active') job.status.active = 1;
          if (fault === 'terminating') job.status.terminating = 1;
          if (fault === 'condition') job.status.conditions[0].status = 'False';
          if (fault === 'deleting-job') job.metadata.deletionTimestamp = '2026-10-23T00:00:00Z';
          if (fault === 'live-pod') pod.status.phase = 'Running';
          if (fault === 'deleting-pod') pod.metadata.deletionTimestamp = '2026-10-23T00:00:00Z';
          fixture.save();
        }
        return inventory;
      };
      await expect(
        executeRelease(
          fixture.request,
          fixture.journal,
          fixture.fake,
          () => undefined,
          fixture.options,
        ),
      ).rejects.toThrow('foreign source consumer');
      expect(fixture.fake.calls).not.toContain('capture');
      expect(fixture.fake.calls).not.toContain('migrate');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }, 30000);
