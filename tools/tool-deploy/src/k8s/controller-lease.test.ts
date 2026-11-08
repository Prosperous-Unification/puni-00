/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Mutable Kubernetes API boundary fixtures and Bun rejection assertion typings. */
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { kubectlEffects, type KubectlSettings } from './execute';
import { fileJournal } from './journal';
import { initialState, type ReleaseRequest } from './release';
import { sealReplayReceipt } from './replay-receipt';
import { sealStorageOwnership } from './storage-ownership';

function fixture() {
  const root = scratchSync('controller-lease-');
  const path = join(root, 'kubectl');
  const store = join(root, 'lease.json');
  const faults = join(root, 'fault.json');
  const journal = fileJournal(join(root, 'release.json'));
  const image = `registry.test/be@sha256:${'a'.repeat(64)}`;
  const release = {
    sourceSha: 'a'.repeat(40),
    images: { backend: image, frontend: image, gateway: image, mcp: image },
  };
  const request: ReleaseRequest = {
    environment: 'local',
    cluster: { context: 'lab', uid: 'cluster' },
    namespaces: { app: 'wbs', backend: 'wbs-solver' },
    release,
    expectedCurrent: release,
    admission: { package: 'p', activation: 'a' },
    flux: null,
    recovers: null,
  };
  const state = initialState(request);
  journal.write({
    schemaVersion: 4,
    request,
    state: { ...state, phase: 'writer-stopped' },
    history: [],
  });
  writeFileSync(store, 'null');
  writeFileSync(faults, 'null');
  writeFileSync(
    path,
    `#!/usr/bin/env bun
import {readFileSync,writeFileSync} from 'node:fs';
const args=process.argv.slice(2);
const path=${JSON.stringify(store)};
const faultPath=${JSON.stringify(faults)};
let lease=JSON.parse(readFileSync(path,'utf8'));
const fault=JSON.parse(readFileSync(faultPath,'utf8'));
const save=()=>writeFileSync(path,JSON.stringify(lease));
if(args.includes('get')) { if(lease===null) { console.error('NotFound');process.exit(1); } console.log(JSON.stringify(lease));process.exit(0); }
const input=args.includes('-f')?JSON.parse(await Bun.stdin.text()):null;
if(args.includes('create')) { if(lease!==null)throw new Error('AlreadyExists'); lease={...input,metadata:{...input.metadata,uid:'lease-uid',resourceVersion:'1'}};save();console.log(JSON.stringify(lease));process.exit(0); }
if(args.includes('replace')) {
  if(!lease||lease.metadata.uid!==input.metadata.uid||lease.metadata.resourceVersion!==input.metadata.resourceVersion)throw new Error('Conflict');
  lease={...input,metadata:{...input.metadata,resourceVersion:String(Number(lease.metadata.resourceVersion)+1)}};save();console.log(JSON.stringify(lease));process.exit(0);
}
if(args.includes('patch')) {
  writeFileSync(faultPath,'null');
  if(fault==='no-apply')throw new Error('uncertain transport');
  if(fault==='UID')lease.metadata.uid='replacement';
  if(fault==='resourceVersion')lease.metadata.resourceVersion='99';
  if(fault==='holder')lease.spec.holderIdentity='foreign#run';
  save();
  const operations=JSON.parse(args[args.indexOf('-p')+1]);
  const draft=structuredClone(lease);
  for(const operation of operations){
    const keys=operation.path.slice(1).split('/').map(key=>key.replaceAll('~1','/').replaceAll('~0','~'));
    let parent=draft;for(const key of keys.slice(0,-1))parent=parent[key];const key=keys.at(-1);
    if(operation.op==='test'&&JSON.stringify(parent[key])!==JSON.stringify(operation.value))throw new Error('Conflict');
    if(operation.op==='add')parent[key]=operation.value;
  }
  draft.metadata.resourceVersion=String(Number(lease.metadata.resourceVersion)+1);lease=draft;
  if(fault==='ABA')lease.metadata.uid='replacement';
  save();if(fault==='lost-response')throw new Error('uncertain transport after commit');console.log(JSON.stringify(lease));process.exit(0);
}
if(args.includes('delete')) {
  if(fault==='deleteUID'){lease.metadata.uid='replacement';save();}
  if(fault==='deleteVersion'){lease.metadata.resourceVersion='99';save();}
  if(!lease||(input.preconditions.uid!==undefined&&lease.metadata.uid!==input.preconditions.uid)||(input.preconditions.resourceVersion!==undefined&&lease.metadata.resourceVersion!==input.preconditions.resourceVersion))throw new Error('Conflict');
  lease=null;save();console.log('{}');process.exit(0);
}
throw new Error('unexpected command');
`,
  );
  chmodSync(path, 0o755);
  const settings: KubectlSettings = {
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
  };
  const adapter = () => kubectlEffects(settings);
  return {
    root,
    store,
    faults,
    journal,
    request,
    state,
    holder: `${state.transactionId}#run`,
    adapter,
    read: () => JSON.parse(readFileSync(store, 'utf8')),
  };
}

test('real Lease adapter preserves a sticky journal marker across renewal takeover and parking', async () => {
  const cluster = fixture();
  try {
    const first = cluster.adapter();
    await first.createLease(cluster.holder, cluster.journal.path);
    await first.requireJournal(cluster.holder);
    expect(cluster.read().metadata.annotations['puni.dev/journal-required']).toBe('true');
    await first.renewLease(cluster.holder);
    const resumed = cluster.adapter();
    const lease = await resumed.readLease();
    if (lease === null) throw new Error('missing fixture lease');
    await resumed.takeoverLease('resumed#run', lease.version, cluster.journal.path, lease.uid);
    await resumed.renewLease('resumed#run');
    await resumed.parkLease('resumed#run', 'rollback-failed');
    expect(cluster.read().metadata.annotations['puni.dev/journal-required']).toBe('true');
    expect(cluster.read().metadata.uid).toBe('lease-uid');
  } finally {
    rmSync(cluster.root, { recursive: true, force: true });
  }
});
for (const fault of ['UID', 'resourceVersion', 'holder', 'no-apply', 'ABA'])
  test(`real Lease marker refuses ${fault} race or uncertainty`, async () => {
    const cluster = fixture();
    try {
      const effects = cluster.adapter();
      await effects.createLease(cluster.holder, cluster.journal.path);
      writeFileSync(cluster.faults, JSON.stringify(fault));
      await expect(effects.requireJournal(cluster.holder)).rejects.toThrow();
      if (fault !== 'ABA')
        expect(cluster.read().metadata.annotations['puni.dev/journal-required']).toBe('false');
    } finally {
      rmSync(cluster.root, { recursive: true, force: true });
    }
  });
test('real Lease marker reconciles a committed patch with a lost response', async () => {
  const cluster = fixture();
  try {
    const effects = cluster.adapter();
    await effects.createLease(cluster.holder, cluster.journal.path);
    writeFileSync(cluster.faults, JSON.stringify('lost-response'));
    await effects.requireJournal(cluster.holder);
    expect(cluster.read().metadata.annotations['puni.dev/journal-required']).toBe('true');
  } finally {
    rmSync(cluster.root, { recursive: true, force: true });
  }
});
for (const operation of ['renewLease', 'parkLease', 'releaseLease'] as const)
  test(`real Lease ${operation} refuses delete-recreate ABA with the same holder`, async () => {
    const cluster = fixture();
    try {
      const effects = cluster.adapter();
      await effects.createLease(cluster.holder, cluster.journal.path);
      const replacement = cluster.read();
      replacement.metadata.uid = 'replacement';
      writeFileSync(cluster.store, JSON.stringify(replacement));
      if (operation === 'parkLease')
        await expect(effects.parkLease(cluster.holder, 'rollback-failed')).rejects.toThrow();
      else await expect(effects[operation](cluster.holder)).rejects.toThrow();
      expect(cluster.read().metadata.uid).toBe('replacement');
    } finally {
      rmSync(cluster.root, { recursive: true, force: true });
    }
  });
for (const fault of ['recoverable', 'missing', 'corrupt'])
  test(`real Lease cleanup refuses ${fault} marked journal`, async () => {
    const cluster = fixture();
    try {
      const effects = cluster.adapter();
      await effects.createLease(cluster.holder, cluster.journal.path);
      await effects.requireJournal(cluster.holder);
      if (fault === 'missing') rmSync(cluster.journal.path);
      if (fault === 'corrupt') writeFileSync(cluster.journal.path, '{');
      await expect(effects.releaseLease(cluster.holder)).rejects.toThrow();
      expect(cluster.read().metadata.annotations['puni.dev/journal-required']).toBe('true');
    } finally {
      rmSync(cluster.root, { recursive: true, force: true });
    }
  });

test('real Lease takeover refuses UID ABA between observation and CAS', async () => {
  const cluster = fixture();
  try {
    const first = cluster.adapter();
    await first.createLease(cluster.holder, cluster.journal.path);
    const resumed = cluster.adapter();
    const observed = await resumed.readLease();
    if (observed === null) throw new Error('missing fixture Lease');
    const replacement = cluster.read();
    replacement.metadata.uid = 'replacement';
    writeFileSync(cluster.store, JSON.stringify(replacement));
    await expect(
      resumed.takeoverLease('resumed#run', observed.version, cluster.journal.path, observed.uid),
    ).rejects.toThrow('changed before takeover');
    expect(cluster.read().spec.holderIdentity).toBe(cluster.holder);
  } finally {
    rmSync(cluster.root, { recursive: true, force: true });
  }
});
for (const operation of ['renewLease', 'parkLease', 'releaseLease'] as const)
  test(`real Lease ${operation} refuses a cleared sticky marker`, async () => {
    const cluster = fixture();
    try {
      const effects = cluster.adapter();
      await effects.createLease(cluster.holder, cluster.journal.path);
      await effects.requireJournal(cluster.holder);
      const changed = cluster.read();
      changed.metadata.annotations['puni.dev/journal-required'] = 'false';
      writeFileSync(cluster.store, JSON.stringify(changed));
      if (operation === 'parkLease')
        await expect(effects.parkLease(cluster.holder, 'rollback-failed')).rejects.toThrow();
      else await expect(effects[operation](cluster.holder)).rejects.toThrow();
      expect(cluster.read()).not.toBeNull();
    } finally {
      rmSync(cluster.root, { recursive: true, force: true });
    }
  });

function completed(cluster: ReturnType<typeof fixture>) {
  const ownership = sealStorageOwnership(
    {
      transactionId: cluster.state.transactionId,
      clusterUid: cluster.request.cluster.uid,
      namespace: cluster.request.namespaces.backend,
      storage: {
        namespace: cluster.request.namespaces.backend,
        pvcName: 'wbs-data',
        pvcUid: 'pvc',
        volumeName: 'disk',
        pvUid: 'pv',
        databasePath: '/data/wbs.sqlite',
      },
      flux: null,
    },
    {
      fluxUid: null,
      owner: {
        kind: 'CronJob',
        name: 'sqlite-backup',
        uid: 'backup',
        resourceVersion: '1',
        templateSha256: 'a'.repeat(64),
        suspension: { kind: 'absent' },
      },
    },
    'token',
  );
  const image = cluster.request.release.images.backend;
  cluster.journal.write({
    schemaVersion: 4,
    request: cluster.request,
    state: {
      ...cluster.state,
      phase: 'flux-resumed',
      controllers: { forward: { ownership, stage: 'restored' }, rollback: null },
      replayForward: sealReplayReceipt(
        cluster.request,
        cluster.state.transactionId,
        'forward',
        [],
        { image, capabilities: [] },
        { image, capabilities: [] },
      ),
    },
    history: [],
  });
}
test('real Lease cleanup deletes an eligible completed journal with exact API preconditions', async () => {
  const cluster = fixture();
  try {
    const effects = cluster.adapter();
    await effects.createLease(cluster.holder, cluster.journal.path);
    await effects.requireJournal(cluster.holder);
    completed(cluster);
    await effects.releaseLease(cluster.holder);
    expect(cluster.read()).toBeNull();
  } finally {
    rmSync(cluster.root, { recursive: true, force: true });
  }
});
for (const fault of ['deleteUID', 'deleteVersion'])
  test(`real Lease cleanup ${fault} race cannot delete a replacement`, async () => {
    const cluster = fixture();
    try {
      const effects = cluster.adapter();
      await effects.createLease(cluster.holder, cluster.journal.path);
      await effects.requireJournal(cluster.holder);
      completed(cluster);
      writeFileSync(cluster.faults, JSON.stringify(fault));
      await expect(effects.releaseLease(cluster.holder)).rejects.toThrow('Conflict');
      expect(cluster.read()).not.toBeNull();
    } finally {
      rmSync(cluster.root, { recursive: true, force: true });
    }
  });
