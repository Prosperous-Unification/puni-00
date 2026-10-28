import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { type } from 'arktype';
import { expect, it } from 'bun:test';

import { ImageCreationInputs } from './creation-resources';
import { HistoricalCreationClosure, ImageCreationClosure } from './k3d-creation';
import { archiveFixture } from './object-store-archive.fixture.test';

const root = join(import.meta.dir, '../../..');

async function fixture(fault = '', platform = false) {
  const directory = await scratchAsync('k3d-resource-caller-');
  await mkdir(join(directory, 'bin'));
  for (const path of [
    'infra/versions',
    'infra/local',
    ...(platform ? ['infra/platform/flux'] : []),
  ])
    await mkdir(join(directory, path), { recursive: true });
  for (const path of [
    'infra/versions/toolchain.json',
    'infra/local/platform.k3d.yaml',
    ...(platform ? ['infra/versions/object-store.json', 'infra/platform/flux/install.yaml'] : []),
  ])
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
const selected = JSON.parse(readFileSync(directory+'/infra/versions/toolchain.json','utf8')).k3dHelpers;
const reference = role => selected[role].name+'@'+selected[role].manifestDigest;
const childId = image => Object.values(selected).find(pin=>pin && typeof pin==='object' && pin.name+'@'+pin.manifestDigest===image)?.manifestDigest ?? 'sha256:'+id('e');
const imageId = image => image.split('@')[1];
const descriptor = (image,platform) => ({mediaType: platform||imageId(image)===childId(image)?'application/vnd.oci.image.manifest.v1+json':'application/vnd.oci.image.index.v1+json',digest:platform?childId(image):imageId(image),size:610,...(platform||imageId(image)===childId(image)?{platform:{os:'linux',architecture:'amd64'}}:{})});
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
 const container={ id:identity,name:'/'+name,image:fault==='effective-permanent'&&name.endsWith('-serverlb')||fault==='effective-transient'&&name.endsWith('-tools')?'sha256:'+id('9'):imageId(image),configuredImage:fault==='reference-transient'&&name.endsWith('-tools')?'foreign:tools':image,networks:{lab:{NetworkID:id('a')}},mounts };
 state.containers.push(container); save();
 event('container','create',identity,{name,image});
 for(const entry of mounts.filter(entry=>entry.Type==='volume')) event('volume','mount',entry.Name,{container:identity,destination:entry.Destination,driver:'local'});
 return container;
};
if (tool === 'k3d') {
 if(argv[0]==='version') {console.log('k3d version v5.9.0');process.exit(0);}
 if(argv[0]==='kubeconfig') {console.log('private kubeconfig');process.exit(0);}
 if(argv[0]==='cluster'&&argv[1]==='create') {
  if(!argv.includes('--no-rollback')||(!argv.includes('--verbose')&&fault!=='ordinary')) throw Error('missing required flags');
  if(fault==='stream-disconnect'){writeFileSync(directory+'/creator-started','yes');await Bun.sleep(1000);writeFileSync(directory+'/late-created','yes');}
  writeFileSync(directory+'/helper-env',JSON.stringify({K3D_IMAGE_LOADBALANCER:process.env.K3D_IMAGE_LOADBALANCER,K3D_IMAGE_TOOLS:process.env.K3D_IMAGE_TOOLS}));
  const config=Bun.YAML.parse(readFileSync(argv[argv.indexOf('--config')+1],'utf8'));
  const prefix='k3d-'+config.metadata.name;
  const cache=prefix+'-images';addVolume(cache);
  for(const [suffix,identity,image,temporary] of [['tools',id('d'),process.env.K3D_IMAGE_TOOLS,true],...(fault==='serial-tools'?[['tools',id('8'),process.env.K3D_IMAGE_TOOLS,true]]:[]),['server-0',id('b'),config.image,false],['serverlb',id('c'),process.env.K3D_IMAGE_LOADBALANCER,false]]) {
   const mounts=suffix==='serverlb'?[]:[mount(cache,'/k3d/images'),...(suffix==='server-0'?[{Type:'bind',Source:directory,Destination:'/srv/puni/worktrees',RW:true}]:[])];
   addContainer(prefix+'-'+suffix,identity,image,mounts);
   if(fault!=='missing-creator'||suffix!=='server-0') console.log('time="2026-10-27T00:00:00Z" level=debug msg="Created container '+prefix+'-'+suffix+' (ID: '+identity+')"');
   if(temporary) {
    if(!['inspection-race','ordinary'].includes(fault)) {
     const deadline=Date.now()+3000;
     while(!existsSync(directory+'/inspected-'+identity)) {if(Date.now()>deadline)throw Error('fixture inspection deadline');await Bun.sleep(2);}
    }
    event('container','destroy',identity,{name:prefix+'-'+suffix,image});state.containers=state.containers.filter(entry=>entry.id!==identity);save();}
  }
  console.error('PRIVATE_TOKEN_SENTINEL');
  if(fault==='cluster-failure') process.exit(12);
  process.exit(0);
 }
 throw Error('unexpected k3d command');
}
if (process.env.DOCKER_CONTEXT || !['unix:///run/docker.sock','unix://'+directory+'/alternate.sock'].includes(process.env.DOCKER_HOST)) throw Error('unbound Docker endpoint');
if(argv[0]==='version') { if(process.env.DOCKER_API_VERSION!=='1.55')throw Error('IDENTITY_API_NOT_PINNED');project({'.Server.Version':fault==='identity-engine'||fault==='identity-runtime-engine'&&state.containers.length>0?'28.0.0':'29.7.2','.Server.APIVersion':'1.55','.Server.MinAPIVersion':'1.40'});process.exit(0); }
if(argv[0]==='info') { const daemon=fault==='import-daemon'&&state.containers.length>1?'foreign-daemon':'daemon-1'; if(argv.at(-1)==='{{.ID}}')console.log(daemon);else project({'.ID':daemon,'.OSType':'linux','.Architecture':'x86_64','.Driver':'overlayfs','.DriverStatus':fault==='identity-store'?[]:[['driver-type','io.containerd.snapshotter.v1']]});process.exit(0);}
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
 if(fault==='archive-original-changed')writeFileSync(directory+'/source.oci','replaced original after capture');
 if(fault==='archive-retained-changed') {
  const parent=directory+'/.puni/fleet-labs/k3d';const lab=readdirSync(parent).find(name=>/^c[0-9a-f]{15}$/.test(name));
  const path=parent+'/'+lab+'/object-store/image.oci';require('node:fs').chmodSync(path,0o600);writeFileSync(path,Buffer.alloc(readFileSync(path).length));
 }
 if(fault==='import-retained-lock') {
  const path=directory+'/infra/versions/toolchain.json';const chain=JSON.parse(readFileSync(path,'utf8'));chain.runtimeImages.objectStore.digest='sha256:'+id('9');writeFileSync(path,JSON.stringify(chain));
 }
 state.network=argv.at(-1);save();if(fault!=='missing-handshake')event('network','create',id('a'),{name:state.network});console.log(id('a'));
} else if(argv[0]==='run') {
 const volume=id('f');addVolume(volume);addContainer(argv[argv.indexOf('--name')+1],id('1'),argv.at(-1),[mount(volume,'/var/lib/registry')]);console.log(id('1'));
} else if(argv[0]==='image'&&argv[1]==='inspect') {if(process.env.DOCKER_API_VERSION!=='1.55')throw Error('IDENTITY_API_NOT_PINNED');project({'.Descriptor':(image=>{const projection=descriptor(image,argv.includes('--platform'));if(image.includes('k3d-'))delete projection.platform;return projection;})(argv[2]),'.ID':fault==='preimage-config'?'sha256:'+id('9'):(argv.includes('--platform')?childId(argv[2]):imageId(argv[2])),'.Os':'linux','.Architecture':fault==='preimage-arch'?'arm64':'amd64','.Variant':fault==='image-variant'?'v2':'','.RepoDigests':fault==='preimage-reference'?[]:[argv[2].split('@')[0].split(':')[0].replace('docker.io/','').replace('library/','')+'@'+imageId(argv[2])],'.Config.Volumes':fault==='temporary-anonymous'?{'/private-store':{}}:null});
} else if(argv[0]==='port') {console.log('5000/tcp -> 127.0.0.1:40000');
} else if(argv[0]==='container'&&argv[1]==='inspect') {if(argv.at(-1).includes('ImageManifestDescriptor')&&process.env.DOCKER_API_VERSION!=='1.55')throw Error('IDENTITY_API_NOT_PINNED');const found=state.containers.find(entry=>entry.id===argv[2]);if(found&&found.name.endsWith('-tools'))writeFileSync(directory+'/inspected-'+found.id,'observed');project({'.Id':found.id,'.Name':fault==='import-name'?'/foreign':found.name,'.Image':found.image,'.ImageManifestDescriptor':(image=>{const projection=descriptor(image,true);if(fault==='container-platform')delete projection.platform;return projection;})(found.configuredImage),'.Config.Image':fault==='import-image'?'foreign:release':found.configuredImage,'.NetworkSettings.Networks':fault==='import-network'?{foreign:{NetworkID:id('9')}}:found.networks,'.Mounts':found.mounts,'.State.Running':false,'.State.ExitCode':0});
} else if(argv[0]==='network'&&argv[1]==='inspect') {
 project({'.Id':id('a'),'.Name':state.network,'.Containers':Object.fromEntries(state.containers.map(entry=>[entry.id,{}]))});
} else if(argv[0]==='volume'&&argv[1]==='inspect') {
 project({'.Name':argv[2],'.Driver':'local','.Mountpoint':(existsSync(directory+'/volume-locator')?'/replaced/':'/volumes/')+argv[2],'.CreatedAt':'2026-10-27T00:00:00Z'});
} else if(argv[0]==='exec') {
 const expected=JSON.parse(readFileSync(directory+'/infra/versions/toolchain.json','utf8')).runtimeImages.objectStore;
 if(argv.includes('import')) {
  if(argv[2]!==id('b'))throw Error('IMPORT_NOT_CREATOR_ID');
  const bytes=readFileSync(0);writeFileSync(directory+'/imported.oci',bytes);
  if(fault==='import-exit')process.exit(42);
 } else if(argv.includes('ls')) {
  const reference=argv.at(-1).replace('name==','');
  console.log('REF TYPE DIGEST SIZE');
  if(fault!=='import-missing-source')console.log(reference+' manifest '+(fault==='import-source'||(fault==='import-alias'&&reference.includes('@'))?'sha256:'+id('9'):expected.digest)+' 1MiB');
 }
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
  if (platform) {
    const archive = archiveFixture(fault.replace(/^archive-/, ''));
    const chain = type({
      runtimeImages: { objectStore: { name: 'string', digest: 'string' } },
    }).assert(lock);
    chain.runtimeImages.objectStore.name = archive.lock.image;
    chain.runtimeImages.objectStore.digest = archive.lock.digest;
    await writeFile(join(directory, 'source.oci'), archive.bytes);
    if (fault === 'archive-absent') await rm(join(directory, 'source.oci'));
    if (fault === 'archive-unreadable') await chmod(join(directory, 'source.oci'), 0);
  }
  await writeFile(join(directory, 'infra/versions/toolchain.json'), JSON.stringify(lock));
  {
    expect(Bun.spawnSync(['git', '-C', directory, 'add', 'infra']).exitCode).toBe(0);
    expect(
      Bun.spawnSync([
        'git',
        '-C',
        directory,
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '-qm',
        'fixture',
      ]).exitCode,
    ).toBe(0);
  }
  if (platform && fault === 'changed-lock')
    await writeFile(
      join(directory, 'infra/versions/object-store.json'),
      (await readFile(join(directory, 'infra/versions/object-store.json'), 'utf8')) + '\n',
    );
  if (fault === 'source-lock-changed')
    await writeFile(join(directory, 'infra/versions/toolchain.json'), JSON.stringify(lock) + ' ');
  if (fault === 'wrong-tool') await writeFile(join(directory, 'bin', 'k3d'), `${program}\n`);
  const invoke = async (arguments_: string[], endpoint = 'unix:///run/docker.sock') => {
    const child = Bun.spawn(
      [
        process.execPath,
        '--eval',
        `import { runLab } from ${JSON.stringify(join(root, 'tools/tool-fleet/src/k3d-lab.ts'))};await runLab(${JSON.stringify(arguments_)},${JSON.stringify(directory)},async()=>({availableMemoryMiB:${platform ? '16384' : '4096'},freeDiskMiB:${platform ? '40960' : '12288'}}));`,
      ],
      {
        env: {
          ...process.env,
          PATH: `${join(directory, 'bin')}:${process.env['PATH'] ?? ''}`,
          DOCKER_CONTEXT: '',
          DOCKER_HOST: endpoint,
          K3D: join(directory, 'bin/k3d'),
          KUBECTL: join(directory, 'bin/kubectl'),
          ...(fault === 'inherited-override' ? { K3D_IMAGE_TOOLS: 'foreign:tools' } : {}),
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
      platform ? 'platform' : 'app',
      ...(platform ? ['--object-store-archive', join(directory, 'source.oci')] : []),
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
        : fault === 'temporary-missing-mount'
          ? 'Transient mount identity differs'
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

it('Task21 strict platform caller freezes and imports without Buildx through creator IDs', async () => {
  const lab = await fixture('', true);
  const execution = await lab.up();
  expect(execution).toMatchObject({ exit: 0, stderr: '' });
  expect(execution.stderr).toBe('');
  const labId = await lab.labId();
  const frozen = await readFile(
    join(lab.directory, '.puni/fleet-labs/k3d', labId, 'object-store/image.oci'),
  );
  expect((await readFile(join(lab.directory, 'imported.oci'))).equals(frozen)).toBe(true);
  const commands = await readFile(join(lab.directory, 'calls'), 'utf8');
  expect(commands).not.toContain('buildx');
  expect(commands).not.toContain('image","import');
  expect(commands).toContain('exec","-i","' + 'b'.repeat(64));
});

for (const fault of [
  'archive-absent',
  'archive-unreadable',
  'changed-lock',
  'archive-manifest',
  'archive-config',
  'archive-layer',
  'archive-duplicate',
  'archive-unsafe',
  'archive-platform',
  'archive-size',
  'archive-reference',
  'archive-docker-reference',
  'archive-symlink',
  'archive-json',
]) {
  it(`Task21 strict platform refuses ${fault} before first Docker creation`, async () => {
    const lab = await fixture(fault, true);
    const execution = await lab.up();
    expect(execution.exit).not.toBe(0);
    const commands = await readFile(join(lab.directory, 'calls'), 'utf8');
    expect(commands).not.toContain('network","create');
    expect(commands).not.toContain('cluster","create');
    expect(commands).not.toContain('"run"');
    expect(commands).not.toContain('"exec"');
    expect(commands).not.toContain('buildx');
  });
}
for (const fault of [
  'archive-retained-changed',
  'import-retained-lock',
  'import-name',
  'import-image',
  'import-network',
  'import-daemon',
  'import-exit',
  'import-source',
  'import-alias',
  'import-missing-source',
]) {
  it(`Task21 strict platform refuses ${fault} before Flux`, async () => {
    const lab = await fixture(fault, true);
    const execution = await lab.up();
    expect(execution.exit).not.toBe(0);
    const commands = await readFile(join(lab.directory, 'calls'), 'utf8');
    expect(commands).not.toContain('infra/platform/flux/install.yaml');
    expect(commands).not.toContain('buildx');
    if (
      [
        'archive-retained-changed',
        'import-retained-lock',
        'import-name',
        'import-image',
        'import-network',
        'import-daemon',
      ].includes(fault)
    )
      expect(commands).not.toContain('"exec"');
  });
}

it('Task21 original-path mutation after capture cannot substitute imported bytes', async () => {
  const lab = await fixture('archive-original-changed', true);
  const execution = await lab.up();
  expect(execution).toMatchObject({ exit: 0, stderr: '' });
  const imported = await readFile(join(lab.directory, 'imported.oci'));
  expect(imported.equals(archiveFixture().bytes)).toBe(true);
  expect(await readFile(join(lab.directory, 'source.oci'), 'utf8')).toBe(
    'replaced original after capture',
  );
});

import { selectedHelpers } from './k3d-helper-images.fixture.test';
it('Task37 real up persists selection, process environment and every serial effective observation', async () => {
  const lab = await fixture('serial-tools');
  const execution = await lab.up();
  expect(execution).toMatchObject({ exit: 0, stderr: '' });
  expect(await Bun.file(join(lab.directory, 'helper-env')).json()).toEqual({
    K3D_IMAGE_LOADBALANCER:
      'ghcr.io/k3d-io/k3d-proxy@sha256:9181bb55f3c04c86510af3526dda86baa9abc389ef988a3c4bb4879b32d8c21c',
    K3D_IMAGE_TOOLS:
      'ghcr.io/k3d-io/k3d-tools@sha256:f18c1e21aba123fe6ff315c514a0feffc005f587aa3db773e89489c2118842dd',
  });
  const labId = await lab.labId();
  const attempts = join(lab.directory, '.puni/fleet-labs/k3d/.attempts', labId);
  const resources = (await readdir(attempts)).find((name) => name.endsWith('.resources'))!;
  const path = join(attempts, resources);
  const closure = ImageCreationClosure.assert(await Bun.file(join(path, 'closure.json')).json());
  expect(closure.schemaVersion).toBe(3);
  expect(closure.plan.helpers).toEqual(selectedHelpers);
  expect(closure.transients.map((observation) => observation.id)).toEqual([
    'd'.repeat(64),
    '8'.repeat(64),
  ]);
  for (const observation of closure.transients) {
    expect(observation.image).toBe(
      'sha256:f18c1e21aba123fe6ff315c514a0feffc005f587aa3db773e89489c2118842dd',
    );
    expect(await Bun.file(join(path, `observation-${observation.id}.json`)).json()).toEqual(
      observation,
    );
  }
  expect(
    ImageCreationInputs.assert(await Bun.file(join(path, 'inputs.json')).json()).schemaVersion,
  ).toBe(3);
});
for (const fault of [
  'preimage-config',
  'preimage-arch',
  'preimage-reference',
  'effective-permanent',
  'effective-transient',
  'reference-transient',
  'inspection-race',
  'inherited-override',
]) {
  it(`Task37 real up refuses ${fault} without ready evidence or cleanup`, async () => {
    const lab = await fixture(fault);
    const execution = await lab.up();
    expect(execution.exit).not.toBe(0);
    expect(execution.stderr).toContain(
      fault.startsWith('preimage')
        ? 'Docker'
        : fault === 'inherited-override'
          ? 'environment overrides'
          : 'resource state is unknown',
    );
    const labId = await lab.labId();
    expect(
      await Bun.file(
        join(lab.directory, '.puni/fleet-labs/k3d', labId, 'creation-complete.json'),
      ).exists(),
    ).toBe(false);
    const calls = await readFile(join(lab.directory, 'calls'), 'utf8');
    if (fault.startsWith('preimage')) expect(calls).not.toContain('network","create');
    for (const mutation of ['kill', 'stop', 'rm', 'delete'])
      expect(calls).not.toContain(JSON.stringify(mutation));
  });
}

it('Task37 ordinary up propagates the same owned helper references', async () => {
  const lab = await fixture('ordinary');
  expect(
    await lab.invoke([
      'up',
      '--profile',
      'app',
      '--id',
      'ordinary',
      '--worktree-root',
      lab.directory,
    ]),
  ).toMatchObject({ exit: 0, stderr: '' });
  expect(await Bun.file(join(lab.directory, 'helper-env')).json()).toMatchObject({
    K3D_IMAGE_TOOLS:
      'ghcr.io/k3d-io/k3d-tools@sha256:f18c1e21aba123fe6ff315c514a0feffc005f587aa3db773e89489c2118842dd',
  });
});
it('Task37 strict up rejects changed source lock before direct creation', async () => {
  const lab = await fixture('source-lock-changed');
  const execution = await lab.up();
  expect(execution.exit).not.toBe(0);
  expect(execution.stderr).toContain('unchanged committed helper source lock');
  expect(await readFile(join(lab.directory, 'calls'), 'utf8')).not.toContain('network","create');
});
it('Task37 authentic baseline sealed receipt still tears down with volumes and history retained', async () => {
  const lab = await fixture();
  const captured = type({
    labId: 'string',
    files: 'Record<string,string>',
    inventory: { containers: 'unknown[]', volumes: 'string[]' },
  }).assert(await Bun.file(join(import.meta.dir, 'fixtures/k3d-creation-v1.json')).json());
  for (const [name, bytes] of Object.entries(captured.files)) {
    await mkdir(join(lab.directory, name, '..'), { recursive: true, mode: 0o700 });
    await writeFile(join(lab.directory, name), bytes, { mode: 0o600 });
  }
  await writeFile(join(lab.directory, 'docker.json'), JSON.stringify(captured.inventory));
  const execution = await lab.invoke([
    'down',
    '--profile',
    'app',
    '--id',
    captured.labId,
    '--resource-evidence',
    'creation-v1',
  ]);
  expect(execution).toMatchObject({ exit: 0, stderr: '' });
  const retained = type({ containers: 'unknown[]', volumes: 'string[]' }).assert(
    await Bun.file(join(lab.directory, 'docker.json')).json(),
  );
  expect(retained.containers).toEqual([]);
  expect(retained.volumes).toEqual(captured.inventory.volumes);
  for (const [name, bytes] of Object.entries(captured.files))
    expect(await readFile(join(lab.directory, name), 'utf8')).toBe(bytes);
});
for (const fault of [
  'inputs-version',
  'plan-cohort',
  'config-cohort',
  'selection-cohort',
  'observation-cohort',
  'observation-missing',
  'lineage-cohort',
  'unknown-version',
]) {
  it(`Task37 sealed reader refuses ${fault} before teardown`, async () => {
    const lab = await fixture();
    expect(await lab.up()).toMatchObject({ exit: 0, stderr: '' });
    const labId = await lab.labId();
    const attempts = join(lab.directory, '.puni/fleet-labs/k3d/.attempts', labId);
    const path = join(
      attempts,
      (await readdir(attempts)).find((name) => name.endsWith('.resources'))!,
    );
    const name =
      fault === 'plan-cohort'
        ? 'plan'
        : fault === 'unknown-version'
          ? 'closure'
          : fault.startsWith('observation')
            ? 'observation-' + 'd'.repeat(64)
            : fault === 'lineage-cohort'
              ? 'creator-0001'
              : 'inputs';
    const entry = type('Record<string,unknown>').assert(
      await Bun.file(join(path, name + '.json')).json(),
    );
    if (fault === 'inputs-version') {
      const inputs = ImageCreationInputs.assert(entry);
      entry['schemaVersion'] = 1;
      delete entry['helpers'];
      delete entry['sourceRevision'];
      delete entry['toolchainSha256'];
      entry['images'] = inputs.images.map(({ name, imageBinding }) => ({
        name,
        id: imageBinding.rootObject.digest,
        volumes: imageBinding.volumes,
      }));
    }
    if (fault === 'plan-cohort')
      type({
        expected: type({ imageBinding: { rootObject: { digest: 'string' } } }).array(),
      }).assert(entry).expected[0].imageBinding.rootObject.digest = 'sha256:' + '9'.repeat(64);
    if (fault === 'config-cohort')
      type({ images: type({ imageBinding: { rootObject: { digest: 'string' } } }).array() }).assert(
        entry,
      ).images[0].imageBinding.rootObject.digest = 'sha256:' + '9'.repeat(64);
    if (fault === 'selection-cohort')
      type({ helpers: { tools: { configDigest: 'string' } } }).assert(
        entry,
      ).helpers.tools.configDigest = 'sha256:' + '9'.repeat(64);
    if (fault === 'observation-cohort') entry['image'] = 'sha256:' + '9'.repeat(64);
    if (fault === 'lineage-cohort') entry['id'] = '9'.repeat(64);
    if (fault === 'unknown-version') entry['schemaVersion'] = 4;
    await writeFile(join(path, name + '.json'), JSON.stringify(entry));
    if (fault === 'observation-missing') await rm(join(path, name + '.json'));
    const files = [];
    for (const filename of (await readdir(path)).filter((name) => name !== 'complete.json').sort())
      files.push({
        name: filename,
        sha256: createHash('sha256')
          .update(await readFile(join(path, filename)))
          .digest('hex'),
      });
    const seal = JSON.stringify({ schemaVersion: 1, files }) + '\n';
    await writeFile(join(path, 'complete.json'), seal);
    await writeFile(
      join(lab.directory, '.puni/fleet-labs/k3d', labId, 'creation-complete.json'),
      JSON.stringify({ schemaVersion: 1, sha256: createHash('sha256').update(seal).digest('hex') }),
    );
    const execution = await lab.invoke([
      'down',
      '--profile',
      'app',
      '--id',
      labId,
      '--resource-evidence',
      'creation-v1',
    ]);
    expect(execution.exit).not.toBe(0);
    const calls = await readFile(join(lab.directory, 'calls'), 'utf8');
    for (const mutation of ['kill', 'stop', 'rm', 'delete'])
      expect(calls).not.toContain(JSON.stringify(mutation));
  });
}

for (const version of [2, 3])
  it(`${version === 3 ? 'Task44' : 'Task37'} historical cohort rejects ${version === 3 ? 'version3' : 'effective'} observation records before teardown`, async () => {
    const lab = await fixture();
    const fixturePath = join(import.meta.dir, 'fixtures/k3d-creation-v1.json');
    const fixtureBytes = await readFile(fixturePath, 'utf8');
    const captured = type({
      labId: 'string',
      files: 'Record<string,string>',
      inventory: { containers: 'unknown[]', volumes: 'string[]' },
    }).assert(JSON.parse(fixtureBytes));
    for (const [name, bytes] of Object.entries(captured.files)) {
      await mkdir(join(lab.directory, name, '..'), { recursive: true, mode: 0o700 });
      await writeFile(join(lab.directory, name), bytes, { mode: 0o600 });
    }
    const inventoryBytes = JSON.stringify(captured.inventory);
    await writeFile(join(lab.directory, 'docker.json'), inventoryBytes);
    const closureName = Object.keys(captured.files).find((name) =>
      name.endsWith('.resources/closure.json'),
    )!;
    const path = join(lab.directory, closureName, '..');
    const closure = HistoricalCreationClosure.assert(JSON.parse(captured.files[closureName]));
    const historicalObservation = closure.snapshots[0];
    const imageIdentity = {
      kind: 'config-object',
      object: { role: 'config', digest: historicalObservation.image },
      platform: { os: 'linux', arch: 'amd64' },
    };
    const observation =
      version === 3
        ? {
            ...historicalObservation,
            schemaVersion: 3,
            imageIdentity,
            imageBinding: {
              schemaVersion: 3,
              provider: 'docker',
              daemonId: closure.plan.daemonId,
              requestApi: '1.55',
              reference: historicalObservation.configuredImage,
              identity: imageIdentity,
            },
          }
        : historicalObservation;
    await writeFile(join(path, `observation-${observation.id}.json`), JSON.stringify(observation), {
      mode: 0o600,
    });
    const files = [];
    for (const name of (await readdir(path)).filter((name) => name !== 'complete.json').sort())
      files.push({
        name,
        sha256: createHash('sha256')
          .update(await readFile(join(path, name)))
          .digest('hex'),
      });
    const seal = JSON.stringify({ schemaVersion: 1, files }) + '\n';
    await writeFile(join(path, 'complete.json'), seal);
    const state = join(lab.directory, '.puni/fleet-labs/k3d', captured.labId);
    await writeFile(
      join(state, 'creation-complete.json'),
      JSON.stringify({
        schemaVersion: 1,
        sha256: createHash('sha256').update(seal).digest('hex'),
      }),
    );
    const execution = await lab.invoke([
      'down',
      '--profile',
      'app',
      '--id',
      captured.labId,
      '--resource-evidence',
      'creation-v1',
    ]);
    expect(execution.exit).not.toBe(0);
    expect(execution.stderr).toContain(
      'Historical creation cohort contains effective observations',
    );
    expect(await Bun.file(join(state, 'creation-teardown.json')).exists()).toBe(false);
    expect(await readFile(join(lab.directory, 'docker.json'), 'utf8')).toBe(inventoryBytes);
    const calls = await readFile(join(lab.directory, 'calls'), 'utf8');
    for (const mutation of ['kill', 'stop', 'rm', 'delete'])
      expect(calls).not.toContain(JSON.stringify(mutation));
    expect(await readFile(fixturePath, 'utf8')).toBe(fixtureBytes);
  });

it('Task44 real up binds manifest preinspect and root-index runtime objects in sealed v3 evidence', async () => {
  const lab = await fixture('serial-tools');
  expect(await lab.up()).toMatchObject({ exit: 0, stderr: '' });
  const attempts = join(lab.directory, '.puni/fleet-labs/k3d/.attempts', await lab.labId());
  const path = join(
    attempts,
    (await readdir(attempts)).find((name) => name.endsWith('.resources'))!,
  );
  const closure = type({
    schemaVersion: '3',
    plan: {
      schemaVersion: '3',
      expected: type({
        image: 'string',
        imageIdentity: { kind: 'string' },
        imageBinding: {
          rootObject: { digest: 'string' },
          preinspectIdentity: { object: { digest: 'string' } },
        },
      }).array(),
    },
    snapshots: type({
      schemaVersion: '3',
      image: 'string',
      imageIdentity: { object: { role: 'string' } },
    }).array(),
    transients: type({ schemaVersion: '3' }).array(),
  }).assert(await Bun.file(join(path, 'closure.json')).json());
  const node = closure.plan.expected.find((expected) => expected.image.includes('/k3s:'))!;
  expect(node.imageBinding.rootObject.digest).not.toBe(
    node.imageBinding.preinspectIdentity.object.digest,
  );
  expect(closure.snapshots.some((snapshot) => snapshot.imageIdentity.object.role === 'index')).toBe(
    true,
  );
  expect(closure.transients).toHaveLength(2);
  expect(
    await lab.invoke([
      'down',
      '--profile',
      'app',
      '--id',
      await lab.labId(),
      '--resource-evidence',
      'creation-v1',
    ]),
  ).toMatchObject({ exit: 0, stderr: '' });
});
for (const fault of ['identity-engine', 'identity-store'])
  it(`Task44 real up refuses ${fault} before network mutation`, async () => {
    const lab = await fixture(fault);
    expect((await lab.up()).exit).not.toBe(0);
    expect(await readFile(join(lab.directory, 'calls'), 'utf8')).not.toContain('network","create');
  });

async function resealFixture(
  lab: Awaited<ReturnType<typeof fixture>>,
  path: string,
): Promise<void> {
  const files = [];
  for (const name of (await readdir(path)).filter((name) => name !== 'complete.json').sort())
    files.push({
      name,
      sha256: createHash('sha256')
        .update(await readFile(join(path, name)))
        .digest('hex'),
    });
  const seal = JSON.stringify({ schemaVersion: 1, files }) + '\n';
  await writeFile(join(path, 'complete.json'), seal, { mode: 0o600 });
  await writeFile(
    join(lab.directory, '.puni/fleet-labs/k3d', await lab.labId(), 'creation-complete.json'),
    JSON.stringify({ schemaVersion: 1, sha256: createHash('sha256').update(seal).digest('hex') }),
    { mode: 0o600 },
  );
}
for (const fault of [
  'source-selection',
  'source-object',
  'source-hash',
  'source-git-exit',
  'source-git-missing',
  'mixed-observation',
  'runtime-graph',
  'runtime-raw-id',
  'runtime-identity-copy',
  'runtime-transient-missing',
])
  it(`Task44 sealed v3 reader refuses ${fault} before teardown`, async () => {
    const lab = await fixture();
    expect(await lab.up()).toMatchObject({ exit: 0, stderr: '' });
    const attempts = join(lab.directory, '.puni/fleet-labs/k3d/.attempts', await lab.labId());
    const path = join(
      attempts,
      (await readdir(attempts)).find((name) => name.endsWith('.resources'))!,
    );
    const inputs = ImageCreationInputs.assert(await Bun.file(join(path, 'inputs.json')).json());
    const closure = ImageCreationClosure.assert(await Bun.file(join(path, 'closure.json')).json());
    if (fault === 'source-selection') {
      inputs.helpers.tools.configDigest = 'sha256:' + '9'.repeat(64);
      closure.plan.helpers.tools.configDigest = inputs.helpers.tools.configDigest;
      for (const expected of closure.plan.expected)
        if (expected.role === 'tools' && expected.imageIdentity.kind === 'helper')
          expected.imageIdentity.selection.configDigest = inputs.helpers.tools.configDigest;
      for (const image of inputs.images)
        if (image.imageIdentity.kind === 'helper' && image.name.includes('k3d-tools'))
          image.imageIdentity.selection.configDigest = inputs.helpers.tools.configDigest;
    }
    if (fault === 'source-object') inputs.sourceRevision = '9'.repeat(40);
    if (fault === 'source-hash') inputs.toolchainSha256 = '9'.repeat(64);
    if (fault === 'source-git-exit' || fault === 'source-git-missing') {
      const git = join(lab.directory, 'bin/git');
      await writeFile(
        git,
        fault === 'source-git-missing'
          ? '#!/definitely/unavailable-git\n'
          : `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(await readFile(join(lab.directory, 'infra/versions/toolchain.json'), 'utf8'))});process.exit(42);\n`,
      );
      await chmod(git, 0o700);
    }

    if (fault === 'runtime-raw-id' || fault === 'runtime-identity-copy') {
      const observed = closure.transients[0];
      observed.image = 'sha256:' + '9'.repeat(64);
      if (fault === 'runtime-identity-copy' && observed.imageIdentity.kind === 'manifest-object') {
        observed.imageIdentity.object.digest = observed.image;
        observed.imageIdentity.manifest.digest = observed.image;
      }
      await writeFile(join(path, `observation-${observed.id}.json`), JSON.stringify(observed));
    }
    if (fault === 'runtime-transient-missing') {
      for (const observed of closure.transients)
        await rm(join(path, `observation-${observed.id}.json`));
      closure.transients = [];
    }
    if (fault === 'runtime-graph') {
      const observed = closure.transients[0];
      observed.image = 'sha256:' + '9'.repeat(64);
      if (
        observed.imageIdentity.kind !== 'manifest-object' ||
        observed.imageBinding.identity.kind !== 'manifest-object'
      )
        throw new Error('Fixture requires manifest role');
      observed.imageIdentity.object.digest = observed.image;
      observed.imageIdentity.manifest.digest = observed.image;
      observed.imageBinding.identity = structuredClone(observed.imageIdentity);
      await writeFile(join(path, `observation-${observed.id}.json`), JSON.stringify(observed));
    }
    await writeFile(join(path, 'inputs.json'), JSON.stringify(inputs));
    await writeFile(join(path, 'plan.json'), JSON.stringify(closure.plan));
    await writeFile(join(path, 'closure.json'), JSON.stringify(closure));
    if (fault === 'mixed-observation') {
      const observed = structuredClone(closure.transients[0]);
      Reflect.set(observed, 'schemaVersion', 2);
      await writeFile(join(path, `observation-${observed.id}.json`), JSON.stringify(observed));
    }
    await resealFixture(lab, path);
    const execution = await lab.invoke([
      'down',
      '--profile',
      'app',
      '--id',
      await lab.labId(),
      '--resource-evidence',
      'creation-v1',
    ]);
    expect(execution.exit).not.toBe(0);
    if (fault.startsWith('source-') && fault !== 'source-selection')
      expect(execution.stderr).toContain('restore the original Git revision');
    const calls = await readFile(join(lab.directory, 'calls'), 'utf8');
    for (const mutation of ['kill', 'stop', 'rm', 'delete'])
      expect(calls).not.toContain(JSON.stringify(mutation));
  });

it('Task44 real up refuses an unsupported runtime engine after precreation', async () => {
  const lab = await fixture('identity-runtime-engine');
  const execution = await lab.up();
  expect(execution.exit).not.toBe(0);
  expect(execution.stderr).toContain('resource state is unknown');
  expect(
    await Bun.file(
      join(lab.directory, '.puni/fleet-labs/k3d', await lab.labId(), 'creation-complete.json'),
    ).exists(),
  ).toBe(false);
});

import { EffectiveCreationInputs } from './creation-resources';
import { EffectiveCreationClosure, EffectiveCreationPlan } from './k3d-creation';

/** Synthetic v2 producer semantics, constructed from historical IDs and exact config identities; no v3 relabeling. */
async function installSyntheticVersion2(
  lab: Awaited<ReturnType<typeof fixture>>,
  fault: string,
): Promise<void> {
  const captured = type({
    labId: 'string',
    files: 'Record<string,string>',
    inventory: { containers: 'unknown[]', volumes: 'string[]' },
  }).assert(await Bun.file(join(import.meta.dir, 'fixtures/k3d-creation-v1.json')).json());
  for (const [name, bytes] of Object.entries(captured.files)) {
    await mkdir(join(lab.directory, name, '..'), { recursive: true, mode: 0o700 });
    await writeFile(join(lab.directory, name), bytes, { mode: 0o600 });
  }
  const closurePath = Object.keys(captured.files).find((name) =>
    name.endsWith('.resources/closure.json'),
  )!;
  const path = join(lab.directory, closurePath, '..');
  const historical = HistoricalCreationClosure.assert(JSON.parse(captured.files[closurePath]));
  const plan = EffectiveCreationPlan.assert({
    ...historical.plan,
    schemaVersion: 2,
    helpers: selectedHelpers,
    expected: historical.plan.expected.map((expected) => {
      const selected =
        expected.role === 'tools' || expected.role === 'serverlb'
          ? selectedHelpers[expected.role]
          : undefined;
      return {
        ...expected,
        image:
          selected === undefined ? expected.image : `${selected.name}@${selected.manifestDigest}`,
        configId: selected === undefined ? 'sha256:' + 'e'.repeat(64) : selected.configDigest,
      };
    }),
  });
  const snapshots = historical.snapshots.map((observed) => {
    const expected = plan.expected.find((expected) => expected.name === observed.name)!;
    return { ...observed, configuredImage: expected.image, image: expected.configId };
  });
  const tools = plan.expected.find((expected) => expected.role === 'tools')!;
  const creator = historical.creators.find((creator) => creator.name === tools.name)!;
  const mount = historical.events.find(
    (event) =>
      event.kind === 'volume' && event.action === 'mount' && event.container === creator.id,
  )!;
  const volume = historical.volumes.find((volume) => volume.name === mount.id)!;
  const transient = {
    id: creator.id,
    name: tools.name,
    image: tools.configId,
    configuredImage: tools.image,
    networkIds: [historical.network.id],
    mounts: [
      {
        kind: 'volume',
        name: volume.name,
        driver: volume.driver,
        source: volume.mountpoint,
        destination: mount.destination,
        rw: true,
      },
    ],
  };
  const events = historical.events.map((event) =>
    event.name === tools.name ? { ...event, image: tools.image } : event,
  );
  const closure = EffectiveCreationClosure.assert({
    ...historical,
    schemaVersion: 2,
    plan,
    snapshots,
    transients: [transient],
    events,
  });
  const inputs = EffectiveCreationInputs.assert({
    schemaVersion: 2,
    helpers: selectedHelpers,
    sourceRevision: 'b'.repeat(40),
    toolchainSha256: 'a'.repeat(64),
    configs: [],
    tools: { k3d: 'a'.repeat(64), kubectl: 'a'.repeat(64) },
    images: [
      ...new Map(
        plan.expected.map((expected) => [
          expected.image,
          {
            name: expected.image,
            id: expected.configId,
            os: 'linux',
            arch: 'amd64',
            repoDigests: [expected.image],
            volumes: [],
          },
        ]),
      ).values(),
    ],
  });
  await writeFile(join(path, 'plan.json'), JSON.stringify(plan));
  await writeFile(join(path, 'inputs.json'), JSON.stringify(inputs));
  await writeFile(join(path, 'closure.json'), JSON.stringify(closure));
  await writeFile(
    join(path, `observation-${creator.id}.json`),
    JSON.stringify(fault === 'mixed' ? { ...transient, schemaVersion: 3 } : transient),
    { mode: 0o600 },
  );
  if (fault === 'config') {
    closure.snapshots[0].image = 'sha256:' + '9'.repeat(64);
    await writeFile(join(path, 'closure.json'), JSON.stringify(closure));
  }
  for (const [index, event] of events.entries())
    await writeFile(
      join(path, `event-${String(index + 1).padStart(6, '0')}.json`),
      JSON.stringify(event),
    );
  await writeFile(
    join(lab.directory, 'docker.json'),
    JSON.stringify({
      ...captured.inventory,
      containers: snapshots.map((observed) => ({
        id: observed.id,
        name: '/' + observed.name,
        image: observed.image,
        configuredImage: observed.configuredImage,
        networks: { lab: { NetworkID: historical.network.id } },
        mounts: observed.mounts.map((mount) => ({
          Type: mount.kind,
          Name: mount.name,
          Driver: mount.driver,
          Source: mount.source,
          Destination: mount.destination,
          RW: mount.rw,
        })),
      })),
    }),
  );
  await resealFixture(lab, path);
  await rm(join(lab.directory, '.git'), { recursive: true });
}
for (const fault of ['none', 'config', 'mixed'])
  it(`Task44 synthetic version2 ${fault === 'none' ? 'teardown keeps original config equality without Git' : `refuses ${fault} before teardown`}`, async () => {
    const lab = await fixture();
    await installSyntheticVersion2(lab, fault);
    const execution = await lab.invoke([
      'down',
      '--profile',
      'app',
      '--id',
      await lab.labId(),
      '--resource-evidence',
      'creation-v1',
    ]);
    if (fault === 'none') expect(execution).toMatchObject({ exit: 0, stderr: '' });
    else {
      expect(execution.exit).not.toBe(0);
      const calls = await readFile(join(lab.directory, 'calls'), 'utf8');
      for (const mutation of ['kill', 'stop', 'rm', 'delete'])
        expect(calls).not.toContain(JSON.stringify(mutation));
    }
  });

import { HistoricalDockerContainerImage } from './docker-image-identity';
import { imagePlan } from './k3d-image-identity.fixture.test';

it('Task49 real CLI carries observed4 through callback import permanent closure and retained teardown', async () => {
  const lab = await fixture('serial-tools', true);
  expect(await lab.up()).toMatchObject({ exit: 0, stderr: '' });
  const attempts = join(lab.directory, '.puni/fleet-labs/k3d/.attempts', await lab.labId());
  const path = join(
    attempts,
    (await readdir(attempts)).find((name) => name.endsWith('.resources'))!,
  );
  const closed = ImageCreationClosure.assert(await Bun.file(join(path, 'closure.json')).json());
  expect(closed.transients).toHaveLength(2);
  for (const expected of closed.plan.expected) expect(expected.imageBinding.schemaVersion).toBe(4);
  for (const observed of [...closed.snapshots, ...closed.transients])
    expect(observed.imageBinding).toMatchObject({
      schemaVersion: 4,
      platformOrigin: 'container-descriptor',
      manifest: { platform: { state: 'present' } },
    });
  for (const expected of closed.plan.expected.filter(
    (expected) => expected.role === 'tools' || expected.role === 'serverlb',
  ))
    expect(expected.imageBinding).toMatchObject({
      platformOrigin: 'image-config-fields',
      inspection: {
        normal: { imageVariant: '', descriptor: { platform: { state: 'absent' } } },
        selected: { imageVariant: '', descriptor: { platform: { state: 'absent' } } },
      },
    });
  expect(await Bun.file(join(lab.directory, 'imported.oci')).exists()).toBe(true);
  expect(
    await lab.invoke([
      'down',
      '--profile',
      'platform',
      '--id',
      await lab.labId(),
      '--resource-evidence',
      'creation-v1',
    ]),
  ).toMatchObject({ exit: 0, stderr: '' });
});
for (const fault of ['image-variant', 'container-platform'])
  it(`Task49 real CLI refuses synthetic ${fault} before ready evidence`, async () => {
    const lab = await fixture(fault);
    const execution = await lab.up();
    expect(execution.exit).not.toBe(0);
    expect(
      await Bun.file(
        join(lab.directory, '.puni/fleet-labs/k3d', await lab.labId(), 'creation-complete.json'),
      ).exists(),
    ).toBe(false);
    const calls = await readFile(join(lab.directory, 'calls'), 'utf8');
    if (fault === 'image-variant') expect(calls).not.toContain('network","create');
    for (const mutation of ['kill', 'stop', 'rm', 'delete'])
      expect(calls).not.toContain(JSON.stringify(mutation));
  });
for (const fault of ['raw-recompute', 'missing-provenance', 'mixed-cohort'])
  it(`Task49 sealed reader refuses ${fault} with matching receipt copies`, async () => {
    const lab = await fixture();
    expect(await lab.up()).toMatchObject({ exit: 0, stderr: '' });
    const attempts = join(lab.directory, '.puni/fleet-labs/k3d/.attempts', await lab.labId());
    const path = join(
      attempts,
      (await readdir(attempts)).find((name) => name.endsWith('.resources'))!,
    );
    const closed = ImageCreationClosure.assert(await Bun.file(join(path, 'closure.json')).json());
    const inputs = ImageCreationInputs.assert(await Bun.file(join(path, 'inputs.json')).json());
    const tools = closed.plan.expected.find((expected) => expected.role === 'tools')!;
    const image = inputs.images.find((image) => image.name === tools.image)!;
    if (fault === 'mixed-cohort') {
      const legacy = imagePlan(
        {
          schemaVersion: 2,
          helpers: selectedHelpers,
          endpoint: closed.plan.endpoint,
          daemonId: closed.plan.daemonId,
          profile: closed.plan.profile,
          network: closed.plan.network,
          binds: [],
          expected: [
            {
              name: tools.name,
              image: tools.image,
              configId: selectedHelpers.tools.configDigest,
              role: 'tools',
              temporary: true,
            },
          ],
        },
        3,
      ).expected[0].imageBinding;
      tools.imageBinding = legacy;
      image.imageBinding = structuredClone(legacy);
      for (const observed of closed.transients) {
        observed.imageBinding = HistoricalDockerContainerImage.assert({
          schemaVersion: 3,
          provider: 'docker',
          daemonId: closed.plan.daemonId,
          requestApi: '1.55',
          reference: observed.configuredImage,
          identity: observed.imageIdentity,
        });
        await writeFile(join(path, `observation-${observed.id}.json`), JSON.stringify(observed));
      }
    } else {
      if (tools.imageBinding.schemaVersion !== 4 || image.imageBinding.schemaVersion !== 4)
        throw new Error('Fixture requires observed4');
      if (fault === 'raw-recompute') {
        tools.imageBinding.inspection.selected.imageOs = 'windows';
        image.imageBinding.inspection.selected.imageOs = 'windows';
      }
      if (fault === 'missing-provenance') {
        Reflect.deleteProperty(tools.imageBinding, 'inspection');
        Reflect.deleteProperty(image.imageBinding, 'inspection');
      }
    }
    await writeFile(join(path, 'inputs.json'), JSON.stringify(inputs));
    await writeFile(join(path, 'plan.json'), JSON.stringify(closed.plan));
    await writeFile(join(path, 'closure.json'), JSON.stringify(closed));
    await resealFixture(lab, path);
    expect(
      (
        await lab.invoke([
          'down',
          '--profile',
          'app',
          '--id',
          await lab.labId(),
          '--resource-evidence',
          'creation-v1',
        ])
      ).exit,
    ).not.toBe(0);
    const calls = await readFile(join(lab.directory, 'calls'), 'utf8');
    for (const mutation of ['kill', 'stop', 'rm', 'delete'])
      expect(calls).not.toContain(JSON.stringify(mutation));
  });
