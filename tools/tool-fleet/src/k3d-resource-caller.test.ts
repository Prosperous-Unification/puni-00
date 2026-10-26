import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { type } from 'arktype';
import { expect, it } from 'bun:test';

const root = join(import.meta.dir, '../../..');

async function fixture(fault = '') {
  const directory = await scratchAsync('k3d-resource-caller-');
  await mkdir(join(directory, 'bin'));
  for (const path of ['infra/versions', 'infra/local'])
    await mkdir(join(directory, path), { recursive: true });
  for (const path of ['infra/versions/toolchain.json', 'infra/local/platform.k3d.yaml'])
    await copyFile(join(root, path), join(directory, path));
  expect(Bun.spawnSync(['git', 'init', '-q', directory]).exitCode).toBe(0);
  await writeFile(join(directory, '.gitignore'), '.puni/\n');
  await writeFile(join(directory, 'events'), '');
  const program = `#!${process.execPath}
import { appendFileSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';
const directory = ${JSON.stringify(directory)};
const fault = ${JSON.stringify(fault)};
const argv = process.argv.slice(2);
const tool = basename(process.argv[1]);
appendFileSync(directory + '/calls', JSON.stringify([tool,...argv]) + '\\n');
if (tool === 'kubectl') { console.log('Client Version: v1.36.4'); process.exit(0); }
let state = existsSync(directory+'/docker.json') ? JSON.parse(readFileSync(directory+'/docker.json','utf8')) : { network: '', containers: [], volumes: [] };
const save = () => writeFileSync(directory+'/docker.json', JSON.stringify(state));
const project = fields => console.log(argv.at(-1).replace(/{{json ([^}]+)}}/g, (_,field) => JSON.stringify(fields[field])));
const id = letter => letter.repeat(64);
const containerFault = (kind,action,attributes) => fault==='temporary-missing-mount'&&kind==='volume'&&action==='mount'&&attributes.container===id('d');
const event = (kind, action, identity, attributes = {}) => {
 if(identity===id('d')&&kind==='container'&&fault==='temporary-missing-'+action)return;
 if(containerFault(kind,action,attributes))return;
 const entry = { kind, action, id: identity, time: String(BigInt(Date.now()) * 1000000n), name: '', container: '', destination: '', driver: '', image: '', ...attributes };
 appendFileSync(directory+'/events', JSON.stringify(entry)+'\\n');
};
const mount = (name, destination) => ({Type:'volume',Name:name,Driver:'local',Source:'/volumes/'+name,Destination:destination,RW:true});
const addVolume = name => { if (!state.volumes.includes(name)) {state.volumes.push(name); event('volume','create',name,{driver:'local'});} };
const addContainer = (name, identity, image, mounts) => {
 const container={ id:identity,name:'/'+name,image:'sha256:'+id('e'),configuredImage:image,networks:{lab:{NetworkID:id('a')}},mounts };
 state.containers.push(container); save();
 event('container','create',identity,{name,image});
 for(const entry of mounts.filter(entry=>entry.Type==='volume')) event('volume','mount',entry.Name,{container:identity,destination:entry.Destination,driver:'local'});
 return container;
};
if (tool === 'k3d') {
 if(argv[0]==='version') {console.log('k3d version v5.9.0');process.exit(0);}
 if(argv[0]==='kubeconfig') {console.log('private kubeconfig');process.exit(0);}
 if(argv[0]==='cluster'&&argv[1]==='create') {
  if(!argv.includes('--no-rollback')||!argv.includes('--verbose')) throw Error('missing required flags');
  if(fault==='stream-disconnect'){writeFileSync(directory+'/creator-started','yes');await Bun.sleep(1000);writeFileSync(directory+'/late-created','yes');}
  const config=Bun.YAML.parse(readFileSync(argv[argv.indexOf('--config')+1],'utf8'));
  const prefix='k3d-'+config.metadata.name;
  const cache=prefix+'-images';addVolume(cache);
  for(const [suffix,identity,image,temporary] of [['tools',id('d'),'ghcr.io/k3d-io/k3d-tools:5.9.0',true],['server-0',id('b'),config.image,false],['serverlb',id('c'),'ghcr.io/k3d-io/k3d-proxy:5.9.0',false]]) {
   const mounts=suffix==='serverlb'?[]:[mount(cache,'/k3d/images'),...(suffix==='server-0'?[{Type:'bind',Source:directory,Destination:'/srv/puni/worktrees',RW:true}]:[])];
   addContainer(prefix+'-'+suffix,identity,image,mounts);
   if(fault!=='missing-creator'||suffix!=='server-0') console.log('time="2026-10-27T00:00:00Z" level=debug msg="Created container '+prefix+'-'+suffix+' (ID: '+identity+')"');
   if(temporary) {event('container','destroy',identity,{name:prefix+'-'+suffix,image});state.containers=state.containers.filter(entry=>entry.id!==identity);save();}
  }
  console.error('PRIVATE_TOKEN_SENTINEL');
  if(fault==='cluster-failure') process.exit(12);
  process.exit(0);
 }
 throw Error('unexpected k3d command');
}
if (process.env.DOCKER_CONTEXT || !['unix:///run/docker.sock','unix://'+directory+'/alternate.sock'].includes(process.env.DOCKER_HOST)) throw Error('unbound Docker endpoint');
if(argv[0]==='info') {console.log('daemon-1');process.exit(0);}
if(argv[0]==='events') {
 let offset=0;
 const poll=()=>{if(fault==='stream-disconnect'&&existsSync(directory+'/creator-started'))process.exit(0);const bytes=readFileSync(directory+'/events','utf8');process.stdout.write(bytes.slice(offset));offset=bytes.length;};poll();setInterval(poll,2);
} else if(argv[0]==='ps') {
 if(argv.includes('--format')) {
  if(argv.includes('{{.Names}}')) {
   if(fault==='reused-tools') {
    const parent=directory+'/.puni/fleet-labs/k3d';const lab=readdirSync(parent).find(name=>/^c[0-9a-f]{15}$/.test(name));
    console.log('k3d-puni-'+lab+'-platform-tools');
   }
   console.log(state.containers.map(entry=>entry.name.slice(1)).join('\\n'));
  }
 } else {const filter=argv[argv.indexOf('--filter')+1];console.log(state.containers.filter(entry=>!argv.includes('--filter')||entry.mounts.some(mount=>filter==='volume='+mount.Name)).map(entry=>entry.id).join('\\n'));if(!argv.includes('--filter')&&(fault==='temporary-present'||existsSync(directory+'/temporary-reappeared')))console.log(id('d'));if(argv.includes('--filter')&&existsSync(directory+'/volume-consumer'))console.log(id('9'));}
} else if(argv[0]==='network'&&argv[1]==='ls') {
 console.log(state.network);
} else if(argv[0]==='volume'&&argv[1]==='ls') {
 if(fault==='reused-cache') {const parent=directory+'/.puni/fleet-labs/k3d';const lab=readdirSync(parent).find(name=>/^c[0-9a-f]{15}$/.test(name));console.log('k3d-puni-'+lab+'-platform-images');}
 console.log(state.volumes.join('\\n'));
} else if(argv[0]==='network'&&argv[1]==='create') {
 state.network=argv.at(-1);save();if(fault!=='missing-handshake')event('network','create',id('a'),{name:state.network});console.log(id('a'));
} else if(argv[0]==='run') {
 const volume=id('f');addVolume(volume);addContainer(argv[argv.indexOf('--name')+1],id('1'),argv.at(-1),[mount(volume,'/var/lib/registry')]);console.log(id('1'));
} else if(argv[0]==='image'&&argv[1]==='inspect') {project({'.Id':'sha256:'+id('e'),'(index .Config "Volumes")':fault==='temporary-anonymous'?{'/private-store':{}}:null});
} else if(argv[0]==='port') {console.log('5000/tcp -> 127.0.0.1:40000');
} else if(argv[0]==='container'&&argv[1]==='inspect') {const found=state.containers.find(entry=>entry.id===argv[2]);project({'.Id':found.id,'.Name':found.name,'.Image':found.image,'.Config.Image':found.configuredImage,'.NetworkSettings.Networks':found.networks,'.Mounts':found.mounts,'.State.Running':false,'.State.ExitCode':0});
} else if(argv[0]==='network'&&argv[1]==='inspect') {
 project({'.Id':id('a'),'.Name':state.network,'.Containers':Object.fromEntries(state.containers.map(entry=>[entry.id,{}]))});
} else if(argv[0]==='volume'&&argv[1]==='inspect') {
 project({'.Name':argv[2],'.Driver':'local','.Mountpoint':(existsSync(directory+'/volume-locator')?'/replaced/':'/volumes/')+argv[2],'.CreatedAt':'2026-10-27T00:00:00Z'});
} else if(argv[0]==='stop') {
} else if(argv[0]==='rm') {
 if(argv.some(arg=>arg==='--volumes'||arg==='-v'))throw Error('FORBIDDEN_VOLUME_REMOVAL');
 state.containers=state.containers.filter(entry=>entry.id!==argv[1]);save();
} else if(argv[0]==='network'&&argv[1]==='rm') {state.network='';save();
} else throw Error('unexpected docker command '+argv.join(' '));
`;
  for (const name of ['docker', 'k3d', 'kubectl']) {
    await writeFile(join(directory, 'bin', name), program);
    await chmod(join(directory, 'bin', name), 0o700);
  }
  const lock = type({
    binaries: { k3d: { sha256: 'string' }, kubectl: { sha256: 'string' } },
  }).assert(JSON.parse(await readFile(join(directory, 'infra/versions/toolchain.json'), 'utf8')));
  const sha256 = createHash('sha256').update(program).digest('hex');
  lock.binaries.k3d.sha256 = sha256;
  lock.binaries.kubectl.sha256 = sha256;
  await writeFile(join(directory, 'infra/versions/toolchain.json'), JSON.stringify(lock));
  if (fault === 'wrong-tool') await writeFile(join(directory, 'bin', 'k3d'), `${program}\n`);
  const invoke = async (arguments_: string[], endpoint = 'unix:///run/docker.sock') => {
    const child = Bun.spawn(
      [
        process.execPath,
        '--eval',
        `import { runLab } from ${JSON.stringify(join(root, 'tools/tool-fleet/src/k3d-lab.ts'))};await runLab(${JSON.stringify(arguments_)},${JSON.stringify(directory)},async()=>({availableMemoryMiB:4096,freeDiskMiB:12288}));`,
      ],
      {
        env: {
          ...process.env,
          PATH: `${join(directory, 'bin')}:${process.env['PATH'] ?? ''}`,
          DOCKER_CONTEXT: '',
          DOCKER_HOST: endpoint,
          K3D: join(directory, 'bin/k3d'),
          KUBECTL: join(directory, 'bin/kubectl'),
        },
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 15000,
      },
    );
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exit, stdout, stderr };
  };
  const up = () =>
    invoke([
      'up',
      '--profile',
      'app',
      '--worktree-root',
      directory,
      '--resource-evidence',
      'creation-v1',
    ]);
  const labId = async () =>
    (await readdir(join(directory, '.puni/fleet-labs/k3d'))).find((name) =>
      /^c[0-9a-f]{15}$/.test(name),
    )!;
  return { directory, invoke, up, labId };
}

it('uses the existing up and receipt-consuming down while retaining every volume and private record', async () => {
  const fixture_ = await fixture();
  const up = await fixture_.up();
  expect(up).toMatchObject({ exit: 0, stderr: '' });
  expect(up.stdout).not.toContain('PRIVATE_TOKEN_SENTINEL');
  const labId = await fixture_.labId();
  const down = await fixture_.invoke([
    'down',
    '--profile',
    'app',
    '--id',
    labId,
    '--resource-evidence',
    'creation-v1',
  ]);
  expect(down).toMatchObject({ exit: 0, stderr: '' });
  const retained = type({ containers: 'unknown[]', network: 'string', volumes: 'string[]' }).assert(
    await Bun.file(join(fixture_.directory, 'docker.json')).json(),
  );
  expect(retained.containers).toEqual([]);
  expect(retained.network).toBe('');
  expect(retained.volumes).toHaveLength(2);
  expect(
    await Bun.file(join(fixture_.directory, '.puni/fleet-labs/k3d', labId, 'lab.json')).exists(),
  ).toBe(true);
  expect(await readFile(join(fixture_.directory, 'calls'), 'utf8')).not.toContain(
    'cluster","delete',
  );
});
for (const fault of ['missing-handshake', 'missing-creator', 'cluster-failure'])
  it(`retains partial ${fault} evidence without any cleanup`, async () => {
    const fixture_ = await fixture(fault);
    const up = await fixture_.up();
    expect(up.exit).not.toBe(0);
    expect(up.stderr).toContain('resource state is unknown');
    expect(up.stderr).not.toContain('PRIVATE_TOKEN_SENTINEL');
    const calls = await readFile(join(fixture_.directory, 'calls'), 'utf8');
    expect(calls).not.toContain('"kill"');
    expect(calls).not.toContain('"rm"');
    expect(calls).not.toContain('"delete"');
    if (fault === 'missing-handshake') expect(calls).not.toContain('"run"');
  });

for (const fault of ['reused-tools', 'reused-cache'])
  it(`refuses ${fault} before any direct creation`, async () => {
    const fixture_ = await fixture(fault);
    const up = await fixture_.up();
    expect(up.exit).not.toBe(0);
    expect(up.stderr).toContain('existing namespace resources');
    const calls = await readFile(join(fixture_.directory, 'calls'), 'utf8');
    expect(calls).not.toContain('"kill"');
    expect(calls).not.toContain('"create"');
    expect(calls).not.toContain('"run"');
  });
for (const fault of [
  'missing-binding',
  'edited-receipt',
  'foreign-network',
  'changed-container',
  'missing-volume',
])
  it(`refuses strict teardown for ${fault} without legacy fallback or deletion`, async () => {
    const fixture_ = await fixture();
    expect((await fixture_.up()).exit).toBe(0);
    const labId = await fixture_.labId();
    const state = join(fixture_.directory, '.puni/fleet-labs/k3d', labId);
    if (fault === 'missing-binding') await rm(join(state, 'creation-binding.json'));
    if (fault === 'edited-receipt') await writeFile(join(state, 'creation-complete.json'), '{}');
    const inventory = type({
      containers: type({ id: 'string', configuredImage: 'string', mounts: 'unknown[]' }).array(),
      network: 'string',
      volumes: 'string[]',
    }).assert(await Bun.file(join(fixture_.directory, 'docker.json')).json());
    if (fault === 'foreign-network')
      inventory.containers.push({ ...inventory.containers[0], id: '9'.repeat(64), mounts: [] });
    if (fault === 'changed-container') inventory.containers[0].configuredImage = 'foreign';
    if (fault === 'missing-volume') inventory.containers[0].mounts = [];
    await writeFile(join(fixture_.directory, 'docker.json'), JSON.stringify(inventory));
    const down = await fixture_.invoke([
      'down',
      '--profile',
      'app',
      '--id',
      labId,
      '--resource-evidence',
      'creation-v1',
    ]);
    expect(down.exit).not.toBe(0);
    const calls = await readFile(join(fixture_.directory, 'calls'), 'utf8');
    expect(calls).not.toContain('"stop"');
    expect(calls).not.toContain('"kill"');
    expect(calls).not.toContain('"rm"');
    expect(calls).not.toContain('"delete"');
  });

for (const fault of ['wrong-tool', 'temporary-anonymous'])
  it(`refuses ${fault} before direct resource mutation`, async () => {
    const fixture_ = await fixture(fault);
    const up = await fixture_.up();
    expect(up.exit).not.toBe(0);
    expect(up.stderr).toContain(fault === 'wrong-tool' ? 'checksum differs' : 'anonymous volumes');
    const calls = await readFile(join(fixture_.directory, 'calls'), 'utf8');
    expect(calls).not.toContain('"kill"');
    expect(calls).not.toContain('"create"');
    expect(calls).not.toContain('"run"');
  });

it('aborts existing k3d creation immediately when the event witness disconnects', async () => {
  const fixture_ = await fixture('stream-disconnect');
  const up = await fixture_.up();
  expect(up.exit).not.toBe(0);
  expect(up.stderr).toContain('resource state is unknown');
  expect(await Bun.file(join(fixture_.directory, 'late-created')).exists()).toBe(false);
  expect(await readFile(join(fixture_.directory, 'calls'), 'utf8')).not.toContain('"kill"');
});

it('accepts only a permutation of the same complete mount set during receipt teardown', async () => {
  const fixture_ = await fixture();
  expect((await fixture_.up()).exit).toBe(0);
  const inventory = type({
    containers: type({ name: 'string', mounts: 'unknown[]' }).array(),
  }).assert(await Bun.file(join(fixture_.directory, 'docker.json')).json());
  const server = inventory.containers.find((container) => container.name.endsWith('-server-0'));
  if (server === undefined) throw new Error('Fixture server missing');
  server.mounts.reverse();
  await writeFile(join(fixture_.directory, 'docker.json'), JSON.stringify(inventory));
  const down = await fixture_.invoke([
    'down',
    '--profile',
    'app',
    '--id',
    await fixture_.labId(),
    '--resource-evidence',
    'creation-v1',
  ]);
  expect(down).toMatchObject({ exit: 0, stderr: '' });
});

for (const fault of ['endpoint-drift', 'volume-locator', 'volume-consumer', 'temporary-reappeared'])
  it(`isolates ${fault} at strict teardown without signals or removal`, async () => {
    const fixture_ = await fixture();
    expect((await fixture_.up()).exit).toBe(0);
    const labId = await fixture_.labId();
    const inventory = await readFile(join(fixture_.directory, 'docker.json'), 'utf8');
    // External consumer is detached from the owned network; all owned observations stay exact.
    await writeFile(join(fixture_.directory, fault), 'injected');
    await writeFile(join(fixture_.directory, 'alternate.sock'), 'fixture endpoint');
    const down = await fixture_.invoke(
      ['down', '--profile', 'app', '--id', labId, '--resource-evidence', 'creation-v1'],
      fault === 'endpoint-drift' ? `unix://${fixture_.directory}/alternate.sock` : undefined,
    );
    expect(down.exit).not.toBe(0);
    expect(down.stderr).toContain(
      fault === 'endpoint-drift'
        ? 'Docker endpoint changed'
        : fault === 'temporary-reappeared'
          ? 'Temporary creator identity reappeared'
          : 'Volume identity or attachments changed',
    );
    expect(await readFile(join(fixture_.directory, 'docker.json'), 'utf8')).toBe(inventory);
    expect(
      await Bun.file(
        join(fixture_.directory, '.puni/fleet-labs/k3d', labId, 'creation-teardown.json'),
      ).exists(),
    ).toBe(false);
    const calls = await readFile(join(fixture_.directory, 'calls'), 'utf8');
    for (const mutation of ['kill', 'stop', 'rm', 'delete'])
      expect(calls).not.toContain(JSON.stringify(mutation));
  });

for (const fault of [
  'temporary-present',
  'temporary-missing-create',
  'temporary-missing-mount',
  'temporary-missing-destroy',
])
  it(`isolates ${fault} at creation closure without cleanup`, async () => {
    const fixture_ = await fixture(fault);
    const up = await fixture_.up();
    expect(up.exit).not.toBe(0);
    expect(up.stderr).toContain('resource state is unknown');
    expect(up.stderr).toContain(
      fault === 'temporary-present'
        ? 'Temporary tools lifecycle did not finish'
        : 'Temporary creator lifecycle remains unknown',
    );
    expect(up.stderr).not.toContain('PRIVATE_TOKEN_SENTINEL');
    const labId = await fixture_.labId();
    expect(
      await Bun.file(
        join(fixture_.directory, '.puni/fleet-labs/k3d', labId, 'creation-complete.json'),
      ).exists(),
    ).toBe(false);
    const calls = await readFile(join(fixture_.directory, 'calls'), 'utf8');
    for (const mutation of ['kill', 'stop', 'rm', 'delete'])
      expect(calls).not.toContain(JSON.stringify(mutation));
  });
