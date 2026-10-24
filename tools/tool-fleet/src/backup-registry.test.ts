import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

const fake = `#!${process.execPath}
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
const root=process.env.FIXTURE_ROOT;
const args=process.argv.slice(2);
const state=JSON.parse(readFileSync(root+'/state.json','utf8'));
const command=args.join(' ');
appendFileSync(root+'/commands',JSON.stringify(args)+'\\n');
function save(){writeFileSync(root+'/state.json',JSON.stringify(state))}
function fail(){console.error('fixture dependency failed');process.exit(23)}
if(state.fault==='source' && args.includes('get') && args.includes('kustomization')){console.log('{}');process.exit(0)}
if(args[0]==='kubectl'){
 if(args.includes('get')){
  const kind=args[args.indexOf('get')+1];const name=args[args.indexOf('get')+2];
  let answer;
  if(kind==='kustomization') answer={metadata:{name,namespace:'flux-system'},spec:{suspend:state[name],sourceRef:{kind:'GitRepository',name:'puni-platform'},path:name==='puni-cluster'?'./infra/clusters/platform/production':'./infra/platform/registry/production'}};
  else if(kind==='deployment') answer={metadata:{name:'registry',namespace:'puni-registry',labels:{'kustomize.toolkit.fluxcd.io/name':'platform','kustomize.toolkit.fluxcd.io/namespace':'flux-system'}},spec:{replicas:state.fault==='replicas'?2:state.replicas,selector:{matchLabels:{'app.kubernetes.io/name':'registry'}},template:{spec:{volumes:[{name:'storage',persistentVolumeClaim:{claimName:'registry'}}]}}}};
  else if(kind==='pvc') answer={metadata:{name:'registry',namespace:'puni-registry',uid:'pvc-uid'},status:{phase:'Bound'},spec:{volumeName:'registry-pv'}};
  else if(kind==='pv') answer={metadata:{name:'registry-pv'},spec:{claimRef:{name:'registry',namespace:'puni-registry',uid:state.fault==='claim'?'wrong':'pvc-uid'},hostPath:{path:state.fault==='path'?root+'/missing':root+'/volume'},nodeAffinity:{required:{nodeSelectorTerms:[{matchExpressions:[{key:'kubernetes.io/hostname',operator:'In',values:[state.fault==='node'?'wrong-node':'registry-node-alias']}]}]}}}};
  else if(kind==='node') answer={metadata:{name},status:{nodeInfo:{machineID:state.fault==='node'?'wrong-machine':readFileSync('/etc/machine-id','utf8').trim()}}};
  else if(kind==='pods') answer={items:state.fault==='pods'?[{metadata:{name:'registry-stuck'}}]:[]};
  else fail();
  if(state.fault==='malformed')console.log('broken');else console.log(JSON.stringify(answer));
 }else if(args.includes('patch')){
  const name=args[args.indexOf('patch')+2];const patch=JSON.parse(args[args.indexOf('-p')+1]);
  if(state.fault==='cleanup' && patch.spec.suspend===false && name==='platform')fail();
  state[name]=patch.spec.suspend;save();
  if(patch.spec.suspend===true && ((state.fault==='suspend-root' && name==='puni-cluster')||(state.fault==='suspend-platform' && name==='platform')))fail();
 }else if(args.includes('scale')){const replicas=Number(args.find(a=>a.startsWith('--replicas=')).split('=')[1]);if(state.fault==='cleanup-scale'&&replicas===1)fail();state.replicas=replicas;save();if(state.fault==='scale-down'&&replicas===0)fail()}
 else if(args.includes('rollout')){if(state.fault==='rollout')fail()}
 else fail();
}else{
 if(args[0]==='cat'){if(state.fault==='repository')fail();console.log('{}')}
 else if(args[0]==='backup'){
  if(state.fault==='backup')fail();
  if(state.fault==='signal'){writeFileSync(root+'/started','yes');await new Promise(r=>setTimeout(r,10000))}
  console.log(JSON.stringify({message_type:'summary',snapshot_id:state.fault==='snapshot'?'':'a'.repeat(64),total_bytes_processed:state.fault==='empty'?0:10}));
 }else if(args[0]==='check'){if(state.replicas!==1 || state.fault==='check')fail()}
 else fail();
}
`;

async function fixture(fault = '', suspended = false) {
  const root = await scratchAsync('registry-backup-');
  await mkdir(join(root, 'volume'));
  await writeFile(join(root, 'volume/blob'), 'known registry blob');
  const executable = join(root, 'k3s');
  await writeFile(executable, fake, { mode: 0o700 });
  await copyFile(join(import.meta.dir, 'backup-registry.ts'), join(root, 'backup-registry.ts'));
  await writeFile(
    join(root, 'backup-registry.lock.json'),
    JSON.stringify({
      version: '0.19.1',
      executable,
      sha256: createHash('sha256').update(fake).digest('hex'),
      archiveSha256: 'fixture',
      archiveUrl: 'fixture',
    }),
  );
  await writeFile(join(root, 'backup.env'), 'fixture-only', { mode: 0o600 });
  await writeFile(join(root, 'password'), 'fixture-only', { mode: 0o600 });
  await writeFile(join(root, 'last-success.json'), 'prior receipt');
  await writeFile(
    join(root, 'state.json'),
    JSON.stringify({ fault, 'puni-cluster': suspended, platform: suspended, replicas: 1 }),
  );
  const env = {
    ...process.env,
    FIXTURE_ROOT: root,
    PATH: root + ':' + String(process.env['PATH']),
    PUNI_REGISTRY_BACKUP_DIRECTORY: root,
    RESTIC_CACHE_DIR: join(root, 'cache'),
    PUNI_REGISTRY_BACKUP_WAIT_MS: '10',
    RESTIC_REPOSITORY: 's3:fixture',
    RESTIC_PASSWORD_FILE: join(root, 'password'),
    AWS_ACCESS_KEY_ID: 'never-print-access',
    AWS_SECRET_ACCESS_KEY: 'never-print-secret',
    AWS_DEFAULT_REGION: 'eu-central-1',
  };
  function start() {
    return Bun.spawn([process.execPath, join(root, 'backup-registry.ts')], {
      env,
      stdout: 'pipe',
      stderr: 'pipe',
    });
  }
  async function finish(child = start()) {
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(stdout + stderr).not.toContain('never-print');
    return { code, stdout, stderr };
  }
  async function state(): Promise<unknown> {
    return JSON.parse(await readFile(join(root, 'state.json'), 'utf8'));
  }
  async function commands(): Promise<string[][]> {
    return (await readFile(join(root, 'commands'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[]);
  }
  return { root, finish, start, state, commands, env };
}

test('captures full resolved volume, checks every archived byte and restores flags before atomic receipt', async () => {
  const run = await fixture();
  expect((await run.finish()).code).toBe(0);
  expect(await run.state()).toMatchObject({ replicas: 1, 'puni-cluster': false, platform: false });
  const commands = await run.commands();
  expect(commands.find((args) => args[0] === 'backup')).toEqual([
    'backup',
    '--json',
    '--tag',
    'puni-registry-consistent',
    '--',
    join(run.root, 'volume'),
  ]);
  expect(commands.find((args) => args[0] === 'check')).toEqual(['check', '--read-data']);
  expect(commands.findIndex((args) => args[0] === 'check')).toBeGreaterThan(
    commands.findLastIndex((args) => args.includes('patch')),
  );
  const receipt: unknown = JSON.parse(await readFile(join(run.root, 'last-success.json'), 'utf8'));
  expect(receipt).toMatchObject({
    snapshotId: 'a'.repeat(64),
    sourcePvcUid: 'pvc-uid',
    sourcePvPath: join(run.root, 'volume'),
    archiveCheck: 'restic check --read-data',
  });
  expect(
    commands
      .filter((args) => args.includes('patch'))
      .map((args) => args[args.indexOf('patch') + 2]),
  ).toEqual(['puni-cluster', 'platform', 'platform', 'puni-cluster']);
});

for (const fault of ['repository', 'claim', 'malformed', 'source', 'replicas', 'node', 'path']) {
  test('preflight refuses ' + fault + ' before changing cluster or prior receipt', async () => {
    const run = await fixture(fault);
    expect((await run.finish()).code).not.toBe(0);
    expect(
      (await run.commands()).some((args) => args.includes('patch') || args.includes('scale')),
    ).toBe(false);
    expect(await readFile(join(run.root, 'last-success.json'), 'utf8')).toBe('prior receipt');
  });
}
for (const fault of [
  'backup',
  'check',
  'snapshot',
  'empty',
  'pods',
  'suspend-root',
  'suspend-platform',
  'scale-down',
]) {
  test('restores all state and preserves receipt after ' + fault, async () => {
    const run = await fixture(fault);
    expect((await run.finish()).code).not.toBe(0);
    expect(await run.state()).toMatchObject({
      replicas: 1,
      'puni-cluster': false,
      platform: false,
    });
    expect(await readFile(join(run.root, 'last-success.json'), 'utf8')).toBe('prior receipt');
  });
}
test('retains original suspended flags', async () => {
  const run = await fixture('', true);
  expect((await run.finish()).code).toBe(0);
  expect(await run.state()).toMatchObject({ replicas: 1, 'puni-cluster': true, platform: true });
});
test('cleanup failure reports exact recovery commands and still restores root', async () => {
  const run = await fixture('cleanup');
  const outcome = await run.finish();
  expect(outcome.code).not.toBe(0);
  expect(outcome.stderr).toContain(
    "k3s kubectl '-n' 'flux-system' 'patch' 'kustomization' 'platform' '--type=merge' '-p'",
  );
  expect(await run.state()).toMatchObject({ replicas: 1, 'puni-cluster': false });
  expect(await readFile(join(run.root, 'last-success.json'), 'utf8')).toBe('prior receipt');
});
test('owner-only credentials and pinned executable are required before any consumer runs', async () => {
  for (const fault of ['mode', 'pin', 'missing', 'unreadable']) {
    const run = await fixture();
    if (fault === 'mode') await chmod(join(run.root, 'backup.env'), 0o644);
    else if (fault === 'missing') await rm(join(run.root, 'password'));
    else if (fault === 'unreadable') await chmod(join(run.root, 'password'), 0o000);
    else await writeFile(join(run.root, 'k3s'), fake + '\n// changed');
    expect((await run.finish()).code).not.toBe(0);
    expect(await run.state()).toMatchObject({
      replicas: 1,
      'puni-cluster': false,
      platform: false,
    });
  }
});
test('SIGTERM cancels child, restores all state and preserves receipt; flock excludes second run', async () => {
  const run = await fixture('signal');
  const child = run.start();
  for (
    let attempt = 0;
    attempt < 300 && !(await Bun.file(join(run.root, 'started')).exists());
    attempt++
  )
    await Bun.sleep(10);
  expect(await Bun.file(join(run.root, 'started')).exists()).toBe(true);
  expect((await run.finish()).code).not.toBe(0);
  child.kill('SIGTERM');
  expect((await run.finish(child)).code).not.toBe(0);
  expect(await run.state()).toMatchObject({ replicas: 1, 'puni-cluster': false, platform: false });
  expect(await readFile(join(run.root, 'last-success.json'), 'utf8')).toBe('prior receipt');
});

const realRestic = process.env['PUNI_TEST_RESTIC_BINARY'];

async function localRepository() {
  if (realRestic === undefined) throw new Error('PUNI_TEST_RESTIC_BINARY is required');
  const run = await fixture();
  run.env.RESTIC_REPOSITORY = join(run.root, 'repository');
  const executable = realRestic;
  const digest = createHash('sha256')
    .update(await readFile(executable))
    .digest('hex');
  expect(digest).toBe('20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639');
  await writeFile(
    join(run.root, 'backup-registry.lock.json'),
    JSON.stringify({ executable, sha256: digest }),
  );
  const child = Bun.spawn([executable, 'init'], { env: run.env, stdout: 'pipe', stderr: 'pipe' });
  const initialized = await run.finish(child);
  expect(initialized.code).toBe(0);
  return run;
}

test.skipIf(realRestic === undefined)(
  'real pinned restic transfers full filesystem and refuses corrupted pack without replacing receipt',
  async () => {
    const run = await localRepository();
    const captured = await run.finish();
    expect(captured.stderr).toBe('');
    expect(captured.code).toBe(0);
    const restored = await run.finish(
      Bun.spawn(
        [
          String(realRestic),
          'restore',
          'latest:' + join(run.root, 'volume'),
          '--target',
          join(run.root, 'restored'),
          '--verify',
        ],
        {
          env: run.env,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      ),
    );
    expect(restored.stderr).toBe('');
    expect(restored.code).toBe(0);
    expect(await readFile(join(run.root, 'restored/blob'), 'utf8')).toBe('known registry blob');
    const receipt = await readFile(join(run.root, 'last-success.json'), 'utf8');
    const packs = await readdir(join(run.root, 'repository/data'), { recursive: true });
    const pack = packs.find((path) => path.includes('/') && !path.endsWith('/'));
    expect(pack).toBeDefined();
    if (pack === undefined) throw new Error('Expected uploaded pack');
    const path = join(run.root, 'repository/data', pack);
    const bytes = await readFile(path);
    bytes[0] = bytes[0] ^ 0xff;
    await chmod(path, 0o600);
    await writeFile(path, bytes);
    const rejected = await run.finish();
    expect(rejected.code).not.toBe(0);
    expect(rejected.stderr).toContain('restic check failed');
    expect(await readFile(join(run.root, 'last-success.json'), 'utf8')).toBe(receipt);
    expect(await run.state()).toMatchObject({
      replicas: 1,
      'puni-cluster': false,
      platform: false,
    });
  },
);

test.skipIf(realRestic === undefined)(
  'real restic partial source transfer exits 3 and restores state',
  async () => {
    const run = await localRepository();
    await chmod(join(run.root, 'volume/blob'), 0o000);
    const rejected = await run.finish();
    expect(rejected.code).not.toBe(0);
    expect(rejected.stderr).toContain('restic backup failed (exit 3)');
    expect(await readFile(join(run.root, 'last-success.json'), 'utf8')).toBe('prior receipt');
    expect(await run.state()).toMatchObject({
      replicas: 1,
      'puni-cluster': false,
      platform: false,
    });
  },
);

for (const fault of ['cleanup-scale', 'rollout']) {
  test(
    'failed registry recovery stays loud while both Flux flags are restored: ' + fault,
    async () => {
      const run = await fixture(fault);
      const outcome = await run.finish();
      expect(outcome.code).not.toBe(0);
      expect(outcome.stderr).toContain('MANUAL RECOVERY: k3s kubectl');
      if (fault === 'rollout')
        expect(outcome.stderr).toContain(
          "'rollout' 'status' 'deployment/registry' '--timeout=45s'",
        );
      expect(await run.state()).toMatchObject({ 'puni-cluster': false, platform: false });
      expect((await run.commands()).some((args) => args[0] === 'check')).toBe(false);
      expect(await readFile(join(run.root, 'last-success.json'), 'utf8')).toBe('prior receipt');
    },
  );
}
