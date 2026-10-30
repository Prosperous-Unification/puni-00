import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { closeSync, constants, openSync } from 'node:fs';
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';

import { expect, test } from 'bun:test';

import { git } from '../src/fixtures/source-startup';
import { envLayout } from '../src/lib/env';
import { WRITER_MEMBERS, type WriterManifest } from '../src/lib/installed-writers';
import type { SourceReview } from './source-stageb-bootstrap';

export const slots = [
  'prerequisites',
  'source-tree',
  'dependencies',
  'configuration',
  'startup-manifest',
  'openapi',
  'migration-manifest',
  'installed-authority-manifest',
  'solver-artifacts',
] as const;
export const hash = (bytes: string | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
export const json = (value: unknown) => Buffer.from(JSON.stringify(value) + '\n');
function pack(header: unknown, bodies: readonly Uint8Array[]) {
  const bytes = json(header);
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(bytes.length);
  return Buffer.concat([prefix, bytes, ...bodies]);
}
/** Synthetic byte fixture; no executable payload is launched, no image/build provenance is asserted. */
export async function fixture(color: 'blue' | 'green' = 'blue', distinct = false) {
  const root = await mkdtemp('/tmp/puni-b1-');
  await chmod(root, 0o700);
  const source = join(root, 'prepared');
  await mkdir(source, { mode: 0o700 });
  const sourceFiles = {
    backend: 'PORT=3100\nMIGRATE_ON_STARTUP=false\n',
    gateway: 'PORT=3200\nBE_URL=http://localhost:3100\n',
    mcp: 'WBS_API_URL=http://localhost:3100\n',
    frontend: 'VITE_BE_URL=http://localhost:3100\nVITE_GW_URL=http://localhost:3200\n',
  };
  const paths = { backend: 'be-01', gateway: 'gw-01', mcp: 'mcp-01', frontend: 'fe-01' };
  for (const tier of Object.values(paths))
    await mkdir(join(source, 'apps/wbs', tier), { recursive: true, mode: 0o755 });
  await writeFile(join(source, '.gitignore'), 'node_modules/\n');
  await writeFile(join(source, 'empty'), '');
  await writeFile(join(source, 'executable'), 'synthetic executable bytes\n', { mode: 0o755 });
  await writeFile(join(source, 'multichunk'), Buffer.alloc(140000, 43));
  const migrationNames = [
    '20261022211000_add_external_dependencies',
    '20261022212000_add_cross_project_dependency_activation',
  ];
  const rows = [];
  for (const name of migrationNames) {
    const directory = join(source, 'apps/wbs/be-01/drizzle', name);
    await mkdir(directory, { recursive: true, mode: 0o755 });
    const migration = Buffer.from('SELECT 1;\n');
    const down = Buffer.from('SELECT 2;\n');
    await writeFile(join(directory, 'migration.sql'), migration);
    await writeFile(join(directory, 'down.sql'), down);
    rows.push({
      name,
      migration: { size: migration.length, sha256: hash(migration) },
      down: { size: down.length, sha256: hash(down) },
      snapshot: null,
    });
  }
  await git(source, 'init', '-q');
  await git(source, 'add', '.');
  await git(
    source,
    '-c',
    'user.name=Synthetic',
    '-c',
    'user.email=synthetic@example.invalid',
    'commit',
    '-qm',
    'synthetic B1 input',
  );
  const sha = await git(source, 'rev-parse', 'HEAD');
  await mkdir(join(source, 'node_modules/.bin'), { recursive: true, mode: 0o755 });
  await writeFile(join(source, 'node_modules/module'), 'synthetic dependency\n');
  await symlink('../module', join(source, 'node_modules/.bin/module'));
  const entries: Record<string, unknown>[] = [];
  const bodies = new Map<string, Buffer>();
  async function walk(directory: string, rootName: string, prefix = '') {
    const names = (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)),
    );
    for (const child of names) {
      if (rootName === 'source' && prefix === '' && ['.git', 'node_modules'].includes(child.name))
        continue;
      const path = prefix + child.name;
      const location = join(directory, child.name);
      if (child.isDirectory()) {
        await chmod(location, 0o755);
        entries.push({ root: rootName, path, kind: 'directory', mode: 0o755 });
        await walk(location, rootName, path + '/');
      } else if (child.isSymbolicLink())
        entries.push({ root: rootName, path, kind: 'symlink', target: '../module' });
      else {
        const bytes = await readFile(location);
        const mode = child.name === 'executable' || child.name.endsWith('.sample') ? 0o755 : 0o644;
        await chmod(location, mode);
        entries.push({
          root: rootName,
          path,
          kind: 'file',
          mode,
          size: bytes.length,
          sha256: hash(bytes),
        });
        bodies.set(rootName + '/' + path, bytes);
      }
    }
  }
  await walk(source, 'source');
  await walk(join(source, 'node_modules'), 'dependencies');
  await walk(join(source, '.git'), 'git');
  const startup = json({
    format: 'wbs-source-startup',
    version: 1,
    profile: 'wbs-source-cold-v1',
    sourceSha: sha,
    entries,
    configuration: Object.entries(sourceFiles).map(([slot, bytes]) => ({
      slot,
      size: Buffer.byteLength(bytes),
      sha256: hash(bytes),
    })),
  });
  const image = `registry/wbs-be-01@sha256:${'b'.repeat(64)}`;
  const solverReference = `registry/solver@sha256:${'c'.repeat(64)}`;
  const second = distinct ? `registry/solver@sha256:${'d'.repeat(64)}` : solverReference;
  const configuration = json({
    socketPath: '/run/user/1000/wbs-solver/supervisor.sock',
    maxSearchWorkers: 1,
    maxMemoryLimitMb: 256,
    pidsLimit: 64,
    maxManagedContainers: 4,
    devSourceSha: sha,
    images: [
      { callerName: `be-01-${color}`, callerImage: image, solverImage: solverReference },
      { callerName: 'wbs-dev-src', callerImage: null, solverImage: second },
    ],
  });
  const solverBodies = [
    Buffer.from('synthetic bun'),
    Buffer.from('synthetic bundle'),
    configuration,
    Buffer.from('synthetic unit'),
  ];
  const solver = {
    version: 1,
    sourceSha: sha,
    bunSha256: hash(solverBodies[0]),
    bundleSha256: hash(solverBodies[1]),
    configSha256: hash(configuration),
    unitSha256: hash(solverBodies[3]),
  };
  const writerBodies = WRITER_MEMBERS.map((member) => Buffer.from(`synthetic ${member}\n`));
  const fixed = [
    '/home/puni1/wbs/bin/swap.js',
    '/home/puni1/wbs/bin/smoke.js',
    '/home/puni1/wbs-dev/bin/swap.js',
    '/home/puni1/wbs-dev/bin/smoke.js',
    '/home/puni1/wbs-dev/bin/poll.sh',
    '/home/puni1/wbs-dev/bin/dev-poll-sync.sh',
    '/home/puni1/wbs-dev/bin/bun',
  ];
  const writer = JSON.stringify({
    version: 1,
    sourceSha: sha,
    buildSha: sha,
    buildId: 'synthetic',
    members: WRITER_MEMBERS.map((member, index) => ({
      member,
      origin: index % 2 ? 'source' : 'build',
      hostPath: fixed[index] ?? `/synthetic-deferred/${member}`,
      reviewed: `/synthetic-reviewed/${member}`,
      installed: `/synthetic-installed/${member}`,
      sha256: hash(writerBodies[index]),
    })),
  });
  const migration = json({
    format: 'dependency-migration-artifact',
    version: 1,
    sourceSha: sha,
    candidateImage: image,
    candidateImageId: `sha256:${'b'.repeat(64)}`,
    migrations: rows,
  });
  const sourceEnvironment = ['SYNTHETIC=true'];
  const activation = {
    format: 'complete-dependency-activation',
    version: 1,
    owner: { sha, layouts: [envLayout('prod'), envLayout('dev')] },
    activate: ['dev'],
    solver,
    prod: {
      backend: { color, image },
      gateway: { color: 'green', image: `registry/wbs-gw-01@sha256:${'e'.repeat(64)}` },
    },
    source: {
      pins: {
        version: 1,
        sourceSha: sha,
        runtimeImageId: `sha256:${'a'.repeat(64)}`,
        manifestSha256: hash(startup),
        environmentSha256: hash(JSON.stringify(sourceEnvironment)),
      },
      runtimeReference: `registry/toolchain@sha256:${'a'.repeat(64)}`,
    },
    authorities: {
      pins: {
        format: 'installed-dependency-authority-pins',
        version: 1,
        sourceSha: sha,
        writerManifestSha256: hash(writer),
        hostMachineIdSha256: 'f'.repeat(64),
        launchConfigurationSha256: 'e'.repeat(64),
        solver,
      },
    },
    migrations: {
      version: 1,
      sourceSha: sha,
      candidateImage: image,
      candidateImageId: `sha256:${'b'.repeat(64)}`,
      manifestSha256: hash(migration),
    },
  };
  const images = {
    gatewayImageId: `sha256:${'e'.repeat(64)}`,
    caddy: {
      reference: `registry/caddy@sha256:${'f'.repeat(64)}`,
      imageId: `sha256:${'f'.repeat(64)}`,
    },
    solver: [...new Set([solverReference, second])]
      .sort()
      .map((reference) => ({ reference, imageId: `sha256:${'c'.repeat(64)}` })),
  };
  const artifacts: Record<(typeof slots)[number], Buffer> = {
    prerequisites: json({ format: 'source-stageb-prerequisites', version: 1, activation, images }),
    'source-tree': Buffer.concat([
      Buffer.from('source-stageb-source-tree-v1\n'),
      ...entries
        .filter((entry) => entry['kind'] === 'file' && entry['root'] !== 'dependencies')
        .map(
          (entry) =>
            bodies.get(String(entry['root']) + '/' + String(entry['path'])) ?? Buffer.alloc(0),
        ),
    ]),
    dependencies: Buffer.concat([
      Buffer.from('source-stageb-dependencies-v1\n'),
      ...entries
        .filter((entry) => entry['kind'] === 'file' && entry['root'] === 'dependencies')
        .map((entry) => bodies.get('dependencies/' + String(entry['path'])) ?? Buffer.alloc(0)),
    ]),
    configuration: json({
      format: 'source-stageb-configuration',
      version: 1,
      sourceFiles,
      sourceEnvironment,
      productEnvironment: { backend: ['SYNTHETIC=true'], gateway: ['SYNTHETIC=true'] },
      caddyFiles: {
        root: 'synthetic root\n',
        redaction: 'synthetic redaction\n',
        prod: 'synthetic prod\n',
        dev: 'synthetic dev\n',
      },
    }),
    'startup-manifest': startup,
    openapi: Buffer.from('{"openapi":"3.1.0","info":{},"paths":{}}\n'),
    'migration-manifest': migration,
    'installed-authority-manifest': pack(
      {
        format: 'source-stageb-authority-files',
        version: 1,
        writerManifestContents: writer,
        members: WRITER_MEMBERS.map((member, index) => ({
          member,
          bytes: writerBodies[index].length,
          mode: 0o644,
        })),
      },
      writerBodies,
    ),
    'solver-artifacts': pack(
      {
        format: 'source-stageb-solver-files',
        version: 1,
        members: ['bun', 'bundle', 'configuration', 'unit'].map((slot, index) => ({
          slot,
          bytes: solverBodies[index].length,
        })),
      },
      solverBodies,
    ),
  };
  return { root, source, sha, artifacts, entries, sourceFiles, paths, activation, images };
}

/** Modeled trusted fixture controller pins expected bytes before candidate delivery; does not prove user custody. */
export async function consumer(
  owned: Awaited<ReturnType<typeof fixture>>,
  operation = 'read',
  fault = '',
) {
  let solverConfigurationOffset = 0;
  if (fault === 'consumed-solver-config') {
    const solverDelivery = owned.artifacts['solver-artifacts'];
    const solverHeaderLength = solverDelivery.readUInt32BE();
    const solverDeliveryHeader = parseFixture(
      solverDelivery.subarray(4, 4 + solverHeaderLength).toString(),
    ) as SolverHeader;
    solverConfigurationOffset =
      4 +
      solverHeaderLength +
      solverDeliveryHeader.members[0].bytes +
      solverDeliveryHeader.members[1].bytes;
  }
  const directory = await mkdtemp(join(owned.root, 'case-'));
  await chmod(directory, 0o700);
  const registry = join(directory, 'registry');
  await mkdir(registry, { mode: 0o700 });
  const identity = await stat(registry, { bigint: true });
  const recipient = `age1${'q'.repeat(58)}`;
  const joins = {
    implementationSha: '1'.repeat(40),
    workflowSha: '2'.repeat(40),
    nonce: '3'.repeat(32),
    sourceSha: owned.sha,
    recipientFingerprint: hash(recipient),
    fixtureAuthoritySha256: '5'.repeat(64),
    rosterPolicySha256: '6'.repeat(64),
    archivePolicySha256: '7'.repeat(64),
  };
  for (const slot of slots)
    await writeFile(join(directory, slot), owned.artifacts[slot], { mode: 0o600 });
  const index = json({
    format: 'source-stageb-inputs',
    version: 1,
    ...joins,
    artifacts: slots.map((slot) => ({
      slot,
      bytes: owned.artifacts[slot].length,
      sha256: hash(owned.artifacts[slot]),
    })),
  });
  await writeFile(join(directory, 'index'), index, { mode: 0o600 });
  const now = Date.now();
  const review: SourceReview = {
    format: 'source-stageb-review',
    version: 1,
    ...joins,
    inputManifestSha256: hash(index),
    recipient,
    registry: {
      scope: '8'.repeat(32),
      device: identity.dev.toString(),
      inode: identity.ino.toString(),
      uid: Number(identity.uid),
      gid: Number(identity.gid),
      mode: 448,
    },
    notBefore: now - 1000,
    notAfter: now + 120000,
    maximumDurationMs: ['late-acquisition', 'late-artifact-open', 'late-parent-open'].includes(
      fault,
    )
      ? 500
      : 90000,
  };
  const waveSetup =
    "\nconst waveFault=@WAVEFAULT@; const waveRetained=new Set();let waveSentinel;let waveCloseCount=0;\nconst describeFailure=(failure)=>({message:String(failure?.message??failure),cause:failure?.cause===undefined?undefined:describeFailure(failure.cause),errors:failure instanceof AggregateError?Array.from(failure.errors,describeFailure):undefined});\nif(waveFault.startsWith('r1-')){\n const prototype=Object.getPrototypeOf(files.openapi);const originalRead=prototype.read;const originalWrite=prototype.write;const originalClose=prototype.close;let injected=false;\n const isLeaf=(file)=>file.fd>=0&&syncFs.readlinkSync('/proc/self/fd/'+file.fd).includes('/source-stageb-staging/');\n const isReader=(file)=>Number.parseInt(syncFs.readFileSync('/proc/self/fdinfo/'+file.fd,'utf8').match(/^flags:[ \\t]+([0-7]+)/m)?.[1]??'777',8)%4===0;\n prototype.close=async function(...arguments_){if(waveRetained.has(this)){waveCloseCount++;throw Error('r1 injected leaf close failure');}return await originalClose.apply(this,arguments_);};\n prototype.read=async function(...arguments_){if(!injected&&isLeaf(this)&&isReader(this)&&['r1-reader-close','r1-reader-primary-close','r1-reader-recycle'].includes(waveFault)){injected=true;waveRetained.add(this);expectedRetainedReferences.add(this);if(waveFault==='r1-reader-recycle'){waveRetained.delete(this);const descriptor=this.fd;syncFs.closeSync(descriptor);await writeFile(directory+'/r1-sentinel','sentinel');waveSentinel=await actualOpen(directory+'/r1-sentinel',constants.O_RDONLY);if(waveSentinel.fd!==descriptor)throw Error('r1 actual reader reuse absent');throw Error('r1 injected reader primary');}if(waveFault==='r1-reader-primary-close')throw Error('r1 injected reader primary');}return await originalRead.apply(this,arguments_);};\n prototype.write=async function(...arguments_){if(!injected&&isLeaf(this)&&['r1-writer-primary-close','r1-writer-recycle'].includes(waveFault)){injected=true;waveRetained.add(this);expectedRetainedReferences.add(this);if(waveFault==='r1-writer-recycle'){waveRetained.delete(this);const descriptor=this.fd;syncFs.closeSync(descriptor);await writeFile(directory+'/r1-sentinel','sentinel');waveSentinel=await actualOpen(directory+'/r1-sentinel',constants.O_RDONLY);if(waveSentinel.fd!==descriptor)throw Error('r1 actual writer reuse absent');}throw Error('r1 injected writer primary');}return await originalWrite.apply(this,arguments_);};\n}\n\nif(waveFault==='r1-recheck-before-parent'){\n process.on('unhandledRejection',failure=>syncFs.writeFileSync(directory+'/r1-unhandled',String(failure)));\n const prototype=Object.getPrototypeOf(files.openapi);const original=prototype.read;let injected=false;prototype.read=async function(...arguments_){if(!injected&&syncFs.readlinkSync('/proc/self/fd/'+this.fd).endsWith('/openapi')){injected=true;await new Promise(resolve=>setTimeout(resolve,30));throw Error('r1 injected input recheck failure');}return await original.apply(this,arguments_);};\n\n}\nif(['r1-remove-intent','r1-remove-dispatch'].includes(waveFault)){\n const prototype=Object.getPrototypeOf(files.openapi);const original=prototype.sync;prototype.sync=async function(...arguments_){const location=syncFs.readlinkSync('/proc/self/fd/'+this.fd);if(location.endsWith('/'+(waveFault==='r1-remove-intent'?'00000007':'00000008')+'.event.json'))throw Error('r1 injected remove publication failure');return await original.apply(this,arguments_);};\n const isStaging=(path)=>{const match=/^\\/proc\\/self\\/fd\\/([0-9]+)/.exec(String(path));return match!==null&&syncFs.readlinkSync('/proc/self/fd/'+match[1]).includes('/source-stageb-staging');};\n for(const name of ['unlink','rmdir']){const original=asyncFs[name];spyOn(asyncFs,name).mockImplementation(async (...arguments_)=>{if(isStaging(arguments_[0])||String(arguments_[0]).endsWith('/source-stageb-staging'))syncFs.appendFileSync(directory+'/r1-removal-effect',name+'\\n');return await original(...arguments_);});}\n}\nlet aliasBaseline;\nconst captureJournal=async()=>{const snapshot=await inspectSourceJournal(journal);const names=(await readdir(parentPath+'/source-stageb-'+inspection.review.nonce)).sort();return JSON.stringify({records:snapshot.records,resources:snapshot.resources.map(({reference,...fields})=>fields),entries:await Promise.all(names.map(async name=>[name,await readFile(parentPath+'/source-stageb-'+inspection.review.nonce+'/'+name,'utf8')]))});};\nif(['r1-recorded-alias','r1-absence-parent'].includes(waveFault)){\n const intent=await appendSourceIntent(journal,{operation:'create',resourceClass:'directory',purpose:'inputs'});const dispatch=await dispatchSourceIntent(journal,intent);const identity=await asyncFs.stat(stagingParent,{bigint:true});const resource=await recordSourceObservation(journal,dispatch,{identity:{kind:'directory',device:String(identity.dev),inode:String(identity.ino),uid:Number(identity.uid),gid:Number(identity.gid),mode:448},observationSha256:'a'.repeat(64)});\n if(waveFault==='r1-absence-parent'){const intent=await appendSourceIntent(journal,{operation:'remove',resource});await recordSourceObservation(journal,await dispatchSourceIntent(journal,intent),{observationSha256:'b'.repeat(64)});}\n}\nif(['r1-recorded-alias','r1-shared-parent'].includes(waveFault))await writeFile(stagingParent+'/r1-sibling','unrelated sibling');if(['r1-backing-alias','r1-recorded-alias'].includes(waveFault))aliasBaseline=await captureJournal();\n\nif(waveFault==='r2-chmod-recycle'){\n await writeFile(directory+'/r2-sentinel','already-created sentinel');const sentinelIdentity=await asyncFs.stat(directory+'/r2-sentinel',{bigint:true});const prototype=Object.getPrototypeOf(files.openapi);const originalChmod=prototype.chmod;let injected=false;prototype.chmod=async function(...arguments_){await originalChmod.apply(this,arguments_);if(!injected&&syncFs.readlinkSync('/proc/self/fd/'+this.fd).includes('/source-stageb-staging/')){injected=true;const descriptor=this.fd;const originalIdentity=syncFs.fstatSync(descriptor,{bigint:true});if(originalIdentity.dev===sentinelIdentity.dev&&originalIdentity.ino===sentinelIdentity.ino)throw Error('r2 distinct sentinel inode absent');expectedRetainedReferences.add(this);syncFs.closeSync(descriptor);waveSentinel=await actualOpen(directory+'/r2-sentinel',constants.O_RDONLY);if(waveSentinel.fd!==descriptor)throw Error('r2 actual chmod descriptor reuse absent');await writeFile(directory+'/r2-injected',JSON.stringify({originalInode:String(originalIdentity.ino),sentinelInode:String(sentinelIdentity.ino)}));}};\n}\n";
  const entry = `import {readSourceInputs,closeSourceInputs,inspectSourceInputs} from ${JSON.stringify(join(import.meta.dir, 'source-stageb-inputs.ts'))};
import {readSourceArtifacts,inspectSourceArtifacts,closeSourceArtifacts,readSourceArtifactChunk,recheckSourceArtifacts} from ${JSON.stringify(join(import.meta.dir, 'source-stageb-artifacts.ts'))};
import {open,mkdir,readFile,writeFile,readdir,rename} from 'node:fs/promises';
import {constants} from 'node:fs';
import * as syncFs from 'node:fs';
import * as asyncFs from 'node:fs/promises';
import * as crypto from 'node:crypto';
import {spyOn} from 'bun:test';
const directory=${JSON.stringify(directory)}; const slots=${JSON.stringify(slots)};
const inputs=await readSourceInputs(); let artifacts;const expectedRetainedReferences=new Set();const callerFiles=[];const ownedReferences=[];const childReferences=[];const actualFstatSync=syncFs.fstatSync;const journalSuffix='/parent/source-stageb-'+inspectSourceInputs(inputs).review.nonce;const cooperative={yielded:false,acquired:false};const actualOpen=asyncFs.open;let procOpens=0;spyOn(asyncFs,'open').mockImplementation(async (...arguments_)=>{const location=String(arguments_[0]);const suffix=location.slice('/proc/self/fd/'.length);const isReference=location.startsWith('/proc/self/fd/')&&/^[0-9]+$/.test(suffix);if(isReference){procOpens++;if(${JSON.stringify(fault)}==='r1-recheck-before-parent'&&procOpens===10){syncFs.writeFileSync(directory+'/r1-parent-requested','actual parent IO');await new Promise(resolve=>setTimeout(resolve,100));}if(${JSON.stringify(fault)}==='open-first'&&procOpens===1||${JSON.stringify(fault)}==='open-middle'&&procOpens===5||${JSON.stringify(fault)}==='open-last'&&procOpens===9||${JSON.stringify(fault)}==='primary-and-close'&&procOpens===5)throw Error('injected primary reopen failure');}const file=await actualOpen(...arguments_);if(location.startsWith('/proc/self/fd/'))ownedReferences.push(file);if(isReference){if(${JSON.stringify(fault)}==='borrowed-reuse-during-admission'&&procOpens===1){const original=callerFiles.find(candidate=>candidate.fd===Number(suffix));if(!original)throw Error('fixture original absent');const descriptor=original.fd;await original.close();const replacement=await actualOpen(directory+'/borrowed-sentinel',constants.O_RDONLY);if(replacement.fd!==descriptor)throw Error('fixture borrowed number reuse absent');syncFs.readSync(replacement.fd,Buffer.alloc(1),0,1,null);callerFiles.push(replacement);}if((${JSON.stringify(fault)}==='late-artifact-open'&&procOpens===1)||(${JSON.stringify(fault)}==='late-parent-open'&&procOpens===10))await new Promise(resolve=>setTimeout(resolve,1000));}return file;});
try {await writeFile(directory+'/borrowed-sentinel','synthetic borrowed sentinel',{mode:384});let files={};for(const slot of slots){files[slot]=await open(directory+'/'+(slot==='openapi'&&['input-alias','input-alias-witness'].includes(${JSON.stringify(fault)})?'prerequisites':slot),(slot==='openapi'&&${JSON.stringify(fault)}==='read-write-input'?constants.O_RDWR:slot==='openapi'&&${JSON.stringify(fault)}==='path-only-input'?0x200000:constants.O_RDONLY)|constants.O_NOFOLLOW);callerFiles.push(files[slot]);if(${JSON.stringify(fault)}!=='path-only-input')syncFs.readSync(files[slot].fd,Buffer.alloc(1),0,1,null);}
const actualOpenSync=syncFs.openSync;spyOn(syncFs,'openSync').mockImplementation((...arguments_)=>{const descriptor=actualOpenSync(...arguments_);if(String(arguments_[0]).endsWith('/source-stageb-staging')){const identity=actualFstatSync(descriptor,{bigint:true});childReferences.push({descriptor,device:identity.dev,inode:identity.ino});}return descriptor;});const prototypeForSync=Object.getPrototypeOf(files.prerequisites);const syncForProof=prototypeForSync.sync;let dispatchFileSynced=false;let dispatchDirectorySynced=false;prototypeForSync.sync=async function(...arguments_){const location=syncFs.readlinkSync('/proc/self/fd/'+this.fd);await syncForProof.apply(this,arguments_);if(location.endsWith('/00000002.event.json'))dispatchFileSynced=true;if(dispatchFileSynced&&location.endsWith(journalSuffix))dispatchDirectorySynced=true;};const mkdirForProof=syncFs.mkdirSync;spyOn(syncFs,'mkdirSync').mockImplementation((...arguments_)=>{if(String(arguments_[0]).endsWith('/source-stageb-staging')&&(!dispatchFileSynced||!dispatchDirectorySynced)){syncFs.writeFileSync(directory+'/mkdir-before-durable','actual unsatisfied durability oracle');throw Error('B mkdir before actual durable J dispatch');}if(${JSON.stringify(fault)}==='racing-child'&&String(arguments_[0]).endsWith('/source-stageb-staging')){mkdirForProof(...arguments_);syncFs.writeFileSync(String(arguments_[0])+'/foreign','foreign');}const observed=mkdirForProof(...arguments_);if(${JSON.stringify(fault)}==='no-yield'&&String(arguments_[0]).endsWith('/source-stageb-staging'))queueMicrotask(()=>{cooperative.yielded=true;});return observed;});

${fault === 'role-order' ? 'files=Object.fromEntries(Object.entries(files).reverse());' : ''}${fault === 'role-missing' ? 'delete files.openapi;' : ''}

${fault === 'short-read' ? 'const prototype=Object.getPrototypeOf(files.openapi);const read=prototype.read;prototype.read=async function(buffer,offset,length,position){return await read.call(this,buffer,offset,Math.min(length,7),position);};' : ''}
${fault === 'pre-open-readability' ? "await asyncFs.chmod(directory+'/openapi',0);" : ''}let descriptors=Object.fromEntries(Object.entries(files).map(([slot,file])=>[slot,file.fd]));${fault === 'directory-input' ? 'const callerDirectory=await open(directory,constants.O_RDONLY|constants.O_DIRECTORY);callerFiles.push(callerDirectory);descriptors.openapi=callerDirectory.fd;' : ''}${fault === 'closed-input' ? 'const descriptor=files.openapi.fd;await files.openapi.close();descriptors.openapi=descriptor;' : ''}${fault === 'pipe-input' ? 'descriptors.openapi=1;' : ''}${fault === 'descriptor-null-prototype' ? 'Object.setPrototypeOf(descriptors,null);' : ''}${fault === 'descriptor-nonenumerable' ? "Object.defineProperty(descriptors,'openapi',{value:files.openapi.fd,enumerable:false});" : ''}${fault === 'semantic-startup-witness' ? "const parse=JSON.parse;spyOn(JSON,'parse').mockImplementation((contents,...rest)=>{if(typeof contents==='string'&&contents.includes('\"format\":\"wbs-source-startup\"'))syncFs.writeFileSync(directory+'/semantic-startup-invoked','actual native decoder parse');return parse(contents,...rest);});" : ''}${fault === 'descriptor-getter' ? "Object.defineProperty(descriptors,'openapi',{enumerable:true,get(){syncFs.writeFileSync(directory+'/invoked','getter');return files.openapi.fd;}});" : ''}${fault === 'descriptor-proxy' ? "descriptors=new Proxy(descriptors,{ownKeys(){syncFs.writeFileSync(directory+'/invoked','proxy');return Reflect.ownKeys(descriptors);}});" : ''}${fault === 'descriptor-object' ? "descriptors.openapi={fd:files.openapi.fd,stat(){syncFs.writeFileSync(directory+'/invoked','method');},close(){syncFs.writeFileSync(directory+'/invoked','close');}};" : ''}${fault === 'descriptor-duplicate' ? 'descriptors.openapi=descriptors.prerequisites;' : ''}${fault === 'descriptor-boxed' ? 'descriptors.openapi=new Number(files.openapi.fd);' : ''}${fault === 'descriptor-fraction' ? 'descriptors.openapi=1.5;' : ''}${fault === 'descriptor-range' ? 'descriptors.openapi=2147483648;' : ''}${fault === 'descriptor-nan' ? 'descriptors.openapi=NaN;' : ''}${fault === 'primary-and-close' ? "const prototype=Object.getPrototypeOf(files.openapi);const close=prototype.close;let injected=false;prototype.close=async function(...arguments_){const isOwn=ownedReferences.includes(this);await close.apply(this,arguments_);if(isOwn&&!injected){injected=true;throw Error('injected cleanup close failure');}};" : ''}${fault === 'consumed-solver-config' ? `const prototype=Object.getPrototypeOf(files.prerequisites);const read=prototype.read;let matches=0;prototype.read=async function(buffer,offset,length,position){const observed=await read.call(this,buffer,offset,length,position);if(syncFs.readlinkSync('/proc/self/fd/'+this.fd).endsWith('/solver-artifacts')&&position===${String(solverConfigurationOffset)}&&++matches===2){const key=Buffer.from('"maxSearchWorkers":1');const index=buffer.subarray(offset,offset+observed.bytesRead).indexOf(key);if(index<0)throw Error('fixture config control absent');buffer[offset+index+key.length-1]=50;}return observed;};` : ''}${fault === 'after-open-stat-failure' ? "const original=syncFs.fstatSync;let injected=false;spyOn(syncFs,'fstatSync').mockImplementation((fd,...arguments_)=>{if(!injected&&ownedReferences.some(file=>file.fd===fd)){injected=true;throw Error('injected post-open stat failure');}return original(fd,...arguments_);});" : ''}${fault === 'overlap-admission' ? "const pending=readSourceArtifacts(inputs,descriptors);let refused=false;try{await readSourceArtifacts(inputs,descriptors);}catch{refused=true;}if(!refused)throw Error('overlapping admission accepted');artifacts=await pending;" : 'artifacts=await readSourceArtifacts(inputs,descriptors);'} const snapshot=inspectSourceArtifacts(artifacts);${fault === 'input-byte-drift' ? "await writeFile(directory+'/openapi',(await readFile(directory+'/openapi','utf8')).replace('3.1.0','3.2.0'));await recheckSourceArtifacts(inputs,artifacts);" : ''}${fault === 'input-inode-drift' ? "const original=await readFile(directory+'/openapi');await rename(directory+'/openapi',directory+'/openapi-original');await writeFile(directory+'/openapi',original,{mode:384});await recheckSourceArtifacts(inputs,artifacts);" : ''}${fault === 'recycled-input-fd' ? `const descriptor=files.openapi.fd;await files.openapi.close();const replacement=syncFs.openSync(directory+'/index',constants.O_RDONLY);if(replacement!==descriptor)throw Error('fixture did not recycle exact FD');const bytes=await readSourceArtifactChunk(inputs,artifacts,'openapi',0,${String(owned.artifacts.openapi.length)});if(Buffer.from(bytes).toString()!==${JSON.stringify(owned.artifacts.openapi.toString())})throw Error('caller reuse redirected owned input');await closeSourceArtifacts(artifacts);syncFs.fstatSync(replacement);syncFs.closeSync(replacement);artifacts=undefined;` : ''}${fault === 'close-originals' ? 'for(const file of callerFiles)await file.close();' : ''}${fault === 'own-recycle' ? "const prototype=Object.getPrototypeOf(files.openapi);const read=prototype.read;let replacement;let injected=false;prototype.read=async function(...arguments_){const observed=await read.apply(this,arguments_);if(!injected&&syncFs.readlinkSync('/proc/self/fd/'+this.fd).endsWith('/openapi')){injected=true;const descriptor=this.fd;syncFs.closeSync(descriptor);replacement=syncFs.openSync(directory+'/borrowed-sentinel',constants.O_RDONLY);if(replacement!==descriptor)throw Error('fixture private number reuse absent');}return observed;};let refused=false;try{await readSourceArtifactChunk(inputs,artifacts,'openapi',0,1);}catch{refused=true;}if(!refused)throw Error('private descriptor reuse admitted');let closeRefused=false;try{await closeSourceArtifacts(artifacts);}catch{closeRefused=true;}if(!closeRefused)throw Error('private descriptor close ownership guessed');syncFs.fstatSync(replacement);syncFs.closeSync(replacement);artifacts=undefined;" : ''}${fault === 'private-reference-overlap' ? "const repeated={...descriptors,prerequisites:ownedReferences[0].fd};let admitted;let refused=false;try{admitted=await readSourceArtifacts(inputs,repeated);}catch{refused=true;}if(admitted)await closeSourceArtifacts(admitted);if(!refused)throw Error('B reborrowed a known private owned reference');" : ''}${fault === 'projection-detachment' ? "const expected=JSON.stringify(snapshot);snapshot.configuration.sourceFiles.backend='untrusted changed projection';snapshot.members[0].path='../../untrusted';snapshot.migrationManifestBytes.fill(0);snapshot.openapiBytes.fill(0);snapshot.frames[0].bytes.fill(0);if(JSON.stringify(inspectSourceArtifacts(artifacts))!==expected)throw Error('artifact inspection retained caller mutation');" : ''}${fault === 'helper-lifetime' ? "for(const action of [()=>readSourceArtifactChunk({},artifacts,'openapi',0,1),()=>readSourceArtifactChunk(inputs,{},'openapi',0,1),()=>closeSourceArtifacts({}),()=>readSourceArtifactChunk(inputs,artifacts,'openapi',0,0),()=>readSourceArtifactChunk(inputs,artifacts,'openapi',0,65537),()=>readSourceArtifactChunk(inputs,artifacts,'openapi',-1,1)]){let refused=false;try{await action();}catch{refused=true;}if(!refused)throw Error('foreign/bounded helper admitted');}const first=readSourceArtifactChunk(inputs,artifacts,'openapi',0,1);let refused=false;try{await recheckSourceArtifacts(inputs,artifacts);}catch{refused=true;}if(!refused)throw Error('overlap admitted');const bytes=await first;bytes[0]=0;const second=await readSourceArtifactChunk(inputs,artifacts,'openapi',0,1);if(second[0]!==123)throw Error('chunk alias');const active=readSourceArtifactChunk(inputs,artifacts,'openapi',0,1);const closing=closeSourceArtifacts(artifacts);if(closing!==closeSourceArtifacts(artifacts))throw Error('close not memoized');let late=false;try{await active;late=true;}catch{}if(late)throw Error('late chunk admitted');await closing;" : ''} if(snapshot.scope!=='verified-input-staging'||snapshot.authorityInstallation!=='not-established'||snapshot.writerBuildProvenance!=='not-established')throw Error('scope differs');
${operation === 'stage' ? `const {stageSourceArtifacts,closeSourceStaging}=await import(${JSON.stringify(join(import.meta.dir, 'source-stageb-builder.ts'))}); const {createSourceJournal,closeSourceJournal,inspectSourceJournal,appendSourceIntent,dispatchSourceIntent,recordSourceObservation,abandonSourceIntent}=await import(${JSON.stringify(join(import.meta.dir, 'source-stageb-journal.ts'))}); const inspection=inspectSourceInputs(inputs);const parentPath=directory+'/parent';await mkdir(parentPath,{mode:448});await mkdir(parentPath+'/source-stageb-'+inspection.review.nonce,{mode:448});const journal=await createSourceJournal({parent:await open(parentPath,constants.O_RDONLY|constants.O_DIRECTORY),directory:await open(parentPath+'/source-stageb-'+inspection.review.nonce,constants.O_RDONLY|constants.O_DIRECTORY),claim:{format:'source-stageb-journal',version:1,nonce:inspection.review.nonce,implementationSha:inspection.review.implementationSha,workflowSha:inspection.review.workflowSha,sourceSha:inspection.review.sourceSha,inputManifestSha256:inspection.review.inputManifestSha256},deadline:inspection.originalDeadline});const stagingParent=${JSON.stringify(fault)}==='r1-backing-alias'?parentPath+'/source-stageb-'+inspection.review.nonce:${JSON.stringify(fault)}==='r1-shared-parent'?parentPath:directory+'/staging-parent';if(!['r1-backing-alias','r1-shared-parent'].includes(${JSON.stringify(fault)}))await mkdir(stagingParent,{mode:448});let staged;${fault === 'preexisting' ? "await mkdir(stagingParent+'/source-stageb-staging',{mode:448});await writeFile(stagingParent+'/source-stageb-staging/foreign','foreign');" : ''}${fault === 'short-write' ? 'const prototype=Object.getPrototypeOf(files.openapi);const write=prototype.write;prototype.write=async function(buffer,offset,length,position){return await write.call(this,buffer,offset,Math.min(length,7),position);};' : ''}${fault === 'consumed-byte' ? "const prototype=Object.getPrototypeOf(files.openapi);const read=prototype.read;let injected=false;prototype.read=async function(buffer,offset,length,position){const observed=await read.call(this,buffer,offset,length,position);if(!injected&&syncFs.existsSync(stagingParent+'/source-stageb-staging')&&syncFs.readlinkSync('/proc/self/fd/'+this.fd).endsWith('/source-tree')&&position>=27&&observed.bytesRead>0){buffer[offset]^=1;injected=true;}return observed;};" : ''}${fault === 'partial-write' ? "const prototype=Object.getPrototypeOf(files.openapi);const write=prototype.write;let count=0;prototype.write=async function(...arguments_){if(++count===8)throw Error('injected actual write failure');return await write.apply(this,arguments_);};" : ''}${fault === 'staged-restored-byte' ? "const prototype=Object.getPrototypeOf(files.prerequisites);const close=prototype.close;let injected=false;prototype.close=async function(...arguments_){const location=this.fd<0?'':syncFs.readlinkSync('/proc/self/fd/'+this.fd);await close.apply(this,arguments_);if(!injected&&location.includes('/source-stageb-staging/')&&location.endsWith('/source/multichunk')){injected=true;const original=await readFile(location);await writeFile(location,Buffer.alloc(original.length,44));await writeFile(location,original);}};" : ''}${fault === 'final-readback-observation' ? "const prototype=Object.getPrototypeOf(files.prerequisites);const read=prototype.read;let injected=false;prototype.read=async function(buffer,offset,length,position){const observed=await read.call(this,buffer,offset,length,position);const location=syncFs.readlinkSync('/proc/self/fd/'+this.fd);if(!injected&&location.includes('/source-stageb-staging/')&&location.endsWith('/source/multichunk')){const flags=syncFs.readFileSync('/proc/self/fdinfo/'+this.fd,'utf8').match(/^flags:[ \t]+([0-7]+)/m)?.[1];if(flags===undefined)throw Error('readback flags absent');if((Number.parseInt(flags,8)&3)===0&&observed.bytesRead>0){buffer[offset]^=1;injected=true;}}return observed;};" : ''}${fault === 'staged-byte' ? "const prototype=Object.getPrototypeOf(files.openapi);const close=prototype.close;let injected=false;prototype.close=async function(...arguments_){const location=this.fd<0?'':syncFs.readlinkSync('/proc/self/fd/'+this.fd);await close.apply(this,arguments_);if(!injected&&location.includes('/source-stageb-staging/')&&location.endsWith('/source/multichunk')){injected=true;await writeFile(location,Buffer.alloc(140000,44));}};" : ''}${fault === 'dispatch-failure' || fault === 'journal-observation-failure' ? `const prototype=Object.getPrototypeOf(files.openapi);const sync=prototype.sync;prototype.sync=async function(...arguments_){const location=syncFs.readlinkSync('/proc/self/fd/'+this.fd);if(location.endsWith('/${fault === 'dispatch-failure' ? '00000002' : '00000003'}.event.json'))throw Error('injected actual durable publication failure');return await sync.apply(this,arguments_);};` : ''}${fault === 'mkdir-failure' ? "spyOn(syncFs,'mkdirSync').mockImplementation(()=>{throw Error('injected mkdir failure');});" : ''}${fault === 'first-open-failure' ? "const original=syncFs.openSync;spyOn(syncFs,'openSync').mockImplementation((...arguments_)=>{if(String(arguments_[0]).endsWith('/source-stageb-staging'))throw Error('injected first open failure');return original(...arguments_);});" : ''}${fault === 'first-stat-failure' ? "const original=syncFs.fstatSync;let injected=false;spyOn(syncFs,'fstatSync').mockImplementation((...arguments_)=>{if(!injected&&syncFs.readlinkSync('/proc/self/fd/'+arguments_[0]).endsWith('/source-stageb-staging')){injected=true;throw Error('injected first stat failure');}return original(...arguments_);});" : ''}${fault === 'late-acquisition' ? "const original=syncFs.fsync;let delayed=false;spyOn(syncFs,'fsync').mockImplementation((fd,callback)=>{if(!delayed&&syncFs.readlinkSync('/proc/self/fd/'+fd).endsWith('/source-stageb-staging')){delayed=true;original(fd,(failure)=>{setTimeout(()=>callback(failure),1000);});}else original(fd,callback);});" : ''}${fault === 'stream-observation' ? "const create=crypto.createHash;spyOn(crypto,'createHash').mockImplementation((...arguments_)=>{const hash=create(...arguments_);const update=hash.update.bind(hash);const digest=hash.digest.bind(hash);let selected=false;hash.update=function(bytes,...rest){if(Buffer.from(bytes).equals(Buffer.from('source-stageb-source-tree-v1\\n')))selected=true;return update(bytes,...rest);};hash.digest=function(encoding){const observed=digest(encoding);return selected&&encoding==='hex'?(observed[0]==='0'?'1':'0')+observed.slice(1):observed;};return hash;});" : ''}${fault === 'no-yield' ? "const actualFstat=syncFs.fstatSync;spyOn(syncFs,'fstatSync').mockImplementation((...arguments_)=>{const isChild=syncFs.readlinkSync('/proc/self/fd/'+arguments_[0]).endsWith('/source-stageb-staging');if(isChild&&cooperative.yielded&&!cooperative.acquired)throw Error('cooperative acquisition yielded');const observed=actualFstat(...arguments_);if(isChild)cooperative.acquired=true;return observed;});" : ''}${waveSetup.replace('@WAVEFAULT@', JSON.stringify(fault))}try{const callerParent=await open(stagingParent,${fault === 'parent-path-only' ? '0x200000' : 'constants.O_RDONLY|constants.O_DIRECTORY'});try{staged=await stageSourceArtifacts(inputs,artifacts,journal,${fault === 'parent-object' ? "{fd:callerParent.fd,close(){syncFs.writeFileSync(directory+'/invoked','parent-method');}}" : 'callerParent.fd'}).then(async token=>{if(aliasBaseline!==undefined){const journalUnchanged=await captureJournal()===aliasBaseline;const intent=await appendSourceIntent(journal,{operation:'create',resourceClass:'file',purpose:'inputs'});await abandonSourceIntent(journal,intent);await writeFile(directory+'/r1-alias.json',JSON.stringify({journalUnchanged,journalUsable:true,childAbsent:!syncFs.existsSync(stagingParent+'/source-stageb-staging'),siblingIntact:waveFault!=='r1-recorded-alias'||(await readFile(stagingParent+'/r1-sibling','utf8'))==='unrelated sibling'}));}return token;}).catch(async failure=>{if(waveFault.startsWith('r1-')||waveFault==='r2-chmod-recycle'){if(aliasBaseline!==undefined){let journalUnchanged=false;let journalUsable=false;try{journalUnchanged=await captureJournal()===aliasBaseline;const intent=await appendSourceIntent(journal,{operation:'create',resourceClass:'file',purpose:'inputs'});await abandonSourceIntent(journal,intent);journalUsable=true;}catch(aliasFailure){await writeFile(directory+'/r1-alias-error',JSON.stringify(describeFailure(aliasFailure)));}await writeFile(directory+'/r1-alias.json',JSON.stringify({journalUnchanged,journalUsable,childAbsent:!syncFs.existsSync(stagingParent+'/source-stageb-staging'),siblingIntact:waveFault!=='r1-recorded-alias'||(await readFile(stagingParent+'/r1-sibling','utf8'))==='unrelated sibling'}));}let sentinelSurvived=true;if(waveSentinel){try{syncFs.fstatSync(waveSentinel.fd);sentinelSurvived=(await readFile('/proc/self/fd/'+waveSentinel.fd,'utf8'))===(waveFault==='r2-chmod-recycle'?'already-created sentinel':'sentinel');await waveSentinel.close();}catch(sentinelFailure){sentinelSurvived=false;}}await writeFile(directory+'/r1-failure.json',JSON.stringify({failure:describeFailure(failure),closeCount:waveCloseCount,sentinelSurvived}));}throw failure;});syncFs.fstatSync(callerParent.fd);${fault === 'overlap-stage' ? "let refused=false;try{await stageSourceArtifacts(inputs,artifacts,journal,callerParent.fd);}catch{refused=true;}if(!refused)throw Error('overlapping staging accepted');" : ''}}finally{try{syncFs.fstatSync(callerParent.fd);}catch(cause){throw Error('B interfered with caller original parent',{cause});}await callerParent.close();}const dependency=await readFile(stagingParent+'/source-stageb-staging/source/node_modules/module','utf8');if(dependency!=='synthetic dependency\\n')throw Error('actual payload differs');if(!Buffer.from(await readFile(stagingParent+'/source-stageb-staging/migration/manifest.json')).equals(Buffer.from(${JSON.stringify([...owned.artifacts['migration-manifest']])})))throw Error('exact migration manifest bytes differ');${fault === 'foreign-close' ? "let refused=false;try{await closeSourceStaging({});}catch{refused=true;}if(!refused)throw Error('foreign staging close admitted');" : ''}${fault === 'stage-close-memo' ? "const closing=closeSourceStaging(staged);const repeated=closeSourceStaging(staged);if(closing!==repeated){syncFs.writeFileSync(directory+'/stage-close-not-memoized','actual Promise identity differed');throw Error('staging close not memoized');}await closing;staged=undefined;" : ''}${fault === 'replace-child' ? "await rename(stagingParent+'/source-stageb-staging',stagingParent+'/original-moved');await mkdir(stagingParent+'/source-stageb-staging',{mode:448});await writeFile(stagingParent+'/source-stageb-staging/foreign','foreign');" : ''}${fault === 'replace-parent' ? "await rename(stagingParent,stagingParent+'-moved');await mkdir(stagingParent,{mode:448});await writeFile(stagingParent+'/foreign','foreign');" : ''}}finally{try{if(staged)await closeSourceStaging(staged).catch(async failure=>{if(waveFault.startsWith('r1-remove-'))await writeFile(directory+'/r1-remove-failure.json',JSON.stringify(describeFailure(failure)));throw failure;});if(['r1-shared-parent','r1-absence-parent'].includes(waveFault)){const intent=await appendSourceIntent(journal,{operation:'create',resourceClass:'file',purpose:'inputs'});await abandonSourceIntent(journal,intent);if(waveFault==='r1-shared-parent'&&(await readFile(stagingParent+'/r1-sibling','utf8'))!=='unrelated sibling')throw Error('r1 shared sibling changed');await writeFile(directory+'/r1-allowed-parent','usable');}}finally{await closeSourceJournal(journal);}}if(${JSON.stringify(fault)}!=='r1-shared-parent'&&(await readdir(stagingParent)).length!==0)throw Error('cleanup residue');` : ''}
console.log('synthetic-B1-verified');}finally{try{if(artifacts)await closeSourceArtifacts(artifacts);}finally{if(['pre-open-readability','input-alias-witness'].includes(${JSON.stringify(fault)})&&procOpens!==0)syncFs.writeFileSync(directory+'/unexpected-reopen-attempt','observed actual open attempt');for(const reference of childReferences){let current;try{current=actualFstatSync(reference.descriptor,{bigint:true});}catch(failure){if(!(failure instanceof Error&&'code'in failure&&failure.code==='EBADF'))throw failure;}if(current&&current.dev===reference.device&&current.ino===reference.inode)throw Error('B child reference leaked');}for(const file of ownedReferences)if(file.fd>=0&&${JSON.stringify(fault)}!=='own-recycle'&&!expectedRetainedReferences.has(file))throw Error('B owned reference leaked');for(const file of callerFiles)if(file.fd>=0){try{syncFs.fstatSync(file.fd);if(syncFs.fstatSync(file.fd).isFile()&&${JSON.stringify(fault)}!=='path-only-input'&&syncFs.readFileSync('/proc/self/fdinfo/'+file.fd,'utf8').match(/^pos:[ \t]+([0-9]+)$/m)?.[1]!=='1')throw Error('B changed caller offset');}catch(cause){throw Error('B interfered with caller original',{cause});}await file.close();}await closeSourceInputs(inputs);}}`;
  const compilation = await Bun.build({
    entrypoints: ['synthetic-b1:entry'],
    target: 'bun',
    format: 'esm',
    splitting: false,
    define: { SOURCE_STAGEB_REVIEW_LITERAL: JSON.stringify(JSON.stringify(review)) },
    plugins: [
      {
        name: 'fixed-synthetic-b1',
        setup(build) {
          build.onResolve({ filter: /^synthetic-b1:entry$/ }, () => ({
            path: 'entry',
            namespace: 'synthetic-b1',
          }));
          build.onLoad({ filter: /.*/, namespace: 'synthetic-b1' }, () => ({
            contents: entry,
            loader: 'ts',
            resolveDir: import.meta.dir,
          }));
        },
      },
    ],
  });
  if (!compilation.success) throw new AggregateError(compilation.logs, 'synthetic build failed');
  const output = compilation.outputs.find((output) => output.kind === 'entry-point');
  if (output === undefined) throw Error('synthetic output missing');
  const expected = new Uint8Array(await output.arrayBuffer());
  const trustedPin = hash(expected);
  const candidate =
    fault === 'candidate'
      ? Buffer.concat([expected, Buffer.from('\n// modified candidate\n')])
      : expected;
  const delivery = { bytes: candidate, claimedSha256: trustedPin };
  if (hash(delivery.bytes) !== trustedPin)
    return { code: 78, stdout: '', stderr: 'synthetic controller refused candidate', directory };
  const path = join(directory, 'consumer.mjs');
  await writeFile(path, delivery.bytes, { mode: 0o600 });
  if (fault === 'group-writable-input') await chmod(join(directory, 'openapi'), 0o660);
  if (fault === 'hardlinked-input') {
    const { link } = await import('node:fs/promises');
    await link(join(directory, 'openapi'), join(directory, 'openapi-alias'));
  }
  if (fault === 'digest')
    await writeFile(
      join(directory, 'openapi'),
      owned.artifacts.openapi.toString().replace('3.1.0', '3.2.0'),
    );
  async function collect(stream: Readable | null) {
    if (stream === null) throw Error('child pipe absent');
    let contents = '';
    for await (const chunk of stream) {
      contents += Buffer.from(chunk).toString();
      if (Buffer.byteLength(contents) > 256 * 1024) throw Error('child output bound');
    }
    return contents;
  }
  const indexFd = openSync(join(directory, 'index'), constants.O_RDONLY);
  const registryFd = openSync(registry, constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    const child = spawn(process.execPath, [path], {
      stdio: [
        'ignore',
        'pipe',
        'pipe',
        'ignore',
        'ignore',
        'ignore',
        'ignore',
        indexFd,
        registryFd,
      ],
      env: { ...process.env, WBS_ENV: 'dev' },
    });
    const completed = once(child, 'close');
    const stdout = collect(child.stdout);
    const stderr = collect(child.stderr);
    const status: unknown[] = await completed;
    const code = status.at(0);
    if (typeof code !== 'number') throw Error('synthetic child did not exit normally');
    const output = await stdout;
    const errors = await stderr;
    if ((await readdir(directory)).includes('stage-close-not-memoized'))
      throw new Error('staging close not memoized', { cause: new Error(errors) });
    if ((await readdir(directory)).includes('mkdir-before-durable'))
      throw new Error('B mkdir before actual durable J dispatch', { cause: new Error(errors) });
    if (
      errors.includes('B interfered with caller original') ||
      errors.includes('B owned reference leaked') ||
      errors.includes('B child reference leaked') ||
      errors.includes('B changed caller offset')
    )
      throw Error(errors);
    return { code, stdout: output, stderr: errors, directory };
  } finally {
    closeSync(indexFd);
    closeSync(registryFd);
  }
}

test('native-binding integration: actual nine-role reader uses original same-closure I', async () => {
  const owned = await fixture();
  const observed = await consumer(owned);
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('synthetic-B1-verified\n');
}, 20000);
test('synthetic controller refuses modified candidate before I nonce claim', async () => {
  const observed = await consumer(await fixture(), 'read', 'candidate');
  expect(observed.code).toBe(78);
  expect(await readdir(join(observed.directory, 'registry'))).toEqual([]);
}, 20000);
test('native-binding integration: actual bytes with wrong outer digest refuse', async () => {
  const observed = await consumer(await fixture(), 'read', 'digest');
  expect(observed.code).not.toBe(0);
  expect(observed.stdout).toBe('');
}, 20000);

type Fixture = Awaited<ReturnType<typeof fixture>>;
interface SolverConfiguration {
  socketPath: string;
  maxSearchWorkers: number;
  maxMemoryLimitMb: number;
  pidsLimit: number;
  maxManagedContainers: number;
  devSourceSha: string;
  images: { callerName: string; callerImage: string | null; solverImage: string }[];
}
interface AuthorityHeader {
  format: string;
  version: number;
  writerManifestContents: string;
  members: { member: string; bytes: number; mode: number }[];
}
interface SolverHeader {
  format: string;
  version: number;
  members: { slot: string; bytes: number }[];
}
interface FixtureDocuments {
  prerequisites: {
    format: string;
    version: number;
    activation: Fixture['activation'];
    images: Fixture['images'];
  };
  configuration: {
    format: string;
    version: number;
    sourceFiles: Fixture['sourceFiles'];
    sourceEnvironment: string[];
    productEnvironment: { backend: string[]; gateway: string[] };
    caddyFiles: { root: string; redaction: string; prod: string; dev: string };
    extra?: boolean;
  };
  'startup-manifest': { entries: { path: string }[] };
  'migration-manifest': { migrations: { down: { sha256: string } }[] };
}
/** Fixture bytes are constructed above; casts here describe intentionally mutable synthetic claims, never production decoder success. */
function parseFixture(contents: string): unknown {
  const parsed: unknown = JSON.parse(contents);
  return parsed;
}
function editJson<Slot extends keyof FixtureDocuments>(
  owned: Fixture,
  slot: Slot,
  edit: (fields: FixtureDocuments[Slot]) => void,
) {
  const fields = parseFixture(owned.artifacts[slot].toString()) as FixtureDocuments[Slot];
  edit(fields);
  owned.artifacts[slot] = json(fields);
}
function editSolver(owned: Fixture, edit: (configuration: SolverConfiguration) => void) {
  const packed = owned.artifacts['solver-artifacts'];
  const length = packed.readUInt32BE();
  const header = parseFixture(packed.subarray(4, 4 + length).toString()) as SolverHeader;
  let offset = 4 + length;
  const bodies = header.members.map((member) => {
    const bytes = packed.subarray(offset, offset + member.bytes);
    offset += member.bytes;
    return bytes;
  });
  const configuration = parseFixture(bodies[2].toString()) as SolverConfiguration;
  edit(configuration);
  bodies[2] = json(configuration);
  header.members[2].bytes = bodies[2].length;
  owned.artifacts['solver-artifacts'] = pack(header, bodies);
  editJson(owned, 'prerequisites', (fields) => {
    fields.activation.solver.configSha256 = hash(bodies[2]);
    fields.activation.authorities.pins.solver.configSha256 = hash(bodies[2]);
  });
}
function editWriter(
  owned: Fixture,
  edit: (manifest: WriterManifest, header: AuthorityHeader) => void,
) {
  const packed = owned.artifacts['installed-authority-manifest'];
  const length = packed.readUInt32BE();
  const header = parseFixture(packed.subarray(4, 4 + length).toString()) as AuthorityHeader;
  const manifest = parseFixture(header.writerManifestContents) as WriterManifest;
  edit(manifest, header);
  header.writerManifestContents = JSON.stringify(manifest);
  owned.artifacts['installed-authority-manifest'] = pack(header, [packed.subarray(4 + length)]);
  editJson(owned, 'prerequisites', (fields) => {
    fields.activation.authorities.pins.writerManifestSha256 = hash(header.writerManifestContents);
  });
}
const faults: Record<string, (owned: Awaited<ReturnType<typeof fixture>>) => void> = {
  'private-dev-roster': (owned) => {
    editJson(owned, 'prerequisites', (fields) => {
      fields.activation.activate = ['prod'];
    });
  },
  'producer-source-join': (owned) => {
    editJson(owned, 'prerequisites', (fields) => {
      fields.activation.owner.sha = '0'.repeat(40);
    });
  },
  'configuration-vs-env-digest': (owned) => {
    editJson(owned, 'configuration', (fields) => {
      fields.sourceEnvironment = ['SYNTHETIC=false'];
    });
  },
  'source-config-size-hash': (owned) => {
    editJson(owned, 'configuration', (fields) => {
      fields.sourceFiles.backend += '# changed\n';
    });
  },
  'source-config-target': (owned) => {
    editJson(owned, 'configuration', (fields) => {
      fields.sourceFiles.gateway = 'PORT=3200\nBE_URL=https://foreign.invalid\n';
    });
  },
  'configuration-extra-field': (owned) => {
    editJson(owned, 'configuration', (fields) => {
      fields.extra = true;
    });
  },
  'configuration-order': (owned) => {
    const fields: unknown = JSON.parse(owned.artifacts.configuration.toString());
    owned.artifacts.configuration = Buffer.from(JSON.stringify(fields, null, 2) + '\n');
  },
  'environment-duplicate-name': (owned) => {
    editJson(owned, 'configuration', (fields) => {
      fields.productEnvironment.backend = ['A=1', 'A=2'];
    });
  },
  'caddy-empty': (owned) => {
    editJson(owned, 'configuration', (fields) => {
      fields.caddyFiles.root = '';
    });
  },
  'tree-prefix': (owned) => {
    owned.artifacts['source-tree'][0] = 0;
  },
  'tree-truncated': (owned) => {
    owned.artifacts['source-tree'] = owned.artifacts['source-tree'].subarray(0, -1);
  },
  'tree-trailing': (owned) => {
    owned.artifacts['source-tree'] = Buffer.concat([
      owned.artifacts['source-tree'],
      Buffer.from('x'),
    ]);
  },
  'tree-member-hash': (owned) => {
    owned.artifacts['source-tree'][30] ^= 1;
  },
  'dependency-prefix': (owned) => {
    owned.artifacts.dependencies[0] = 0;
  },
  'dependency-truncated': (owned) => {
    owned.artifacts.dependencies = owned.artifacts.dependencies.subarray(0, -1);
  },
  'authority-wrong-source': (owned) => {
    editWriter(owned, (manifest) => {
      manifest.sourceSha = '0'.repeat(40);
    });
  },
  'authority-wrong-build': (owned) => {
    editWriter(owned, (manifest) => {
      manifest.buildSha = '0'.repeat(40);
    });
  },
  'authority-known-target': (owned) => {
    editWriter(owned, (manifest) => {
      manifest.members[0].hostPath = '/synthetic-unlisted/swap.js';
    });
  },
  'authority-omitted': (owned) => {
    editWriter(owned, (manifest) => {
      manifest.members.pop();
    });
  },
  'authority-header-order': (owned) => {
    editWriter(owned, (_manifest, header) => {
      header.members.reverse();
    });
  },
  'authority-mode': (owned) => {
    editWriter(owned, (_manifest, header) => {
      header.members[0].mode = 0o777;
    });
  },
  'authority-body': (owned) => {
    const bytes = owned.artifacts['installed-authority-manifest'];
    bytes[bytes.length - 1] ^= 1;
  },
  'authority-outer-trailing': (owned) => {
    owned.artifacts['installed-authority-manifest'] = Buffer.concat([
      owned.artifacts['installed-authority-manifest'],
      Buffer.from('x'),
    ]);
  },
  'solver-opposite-color': (owned) => {
    editSolver(owned, (configuration) => {
      configuration.images[0].callerName = 'be-01-green';
    });
  },
  'solver-rule-order': (owned) => {
    editSolver(owned, (configuration) => {
      configuration.images.reverse();
    });
  },
  'solver-kubernetes-extra': (owned) => {
    editSolver(owned, (configuration) => {
      configuration.images.push({
        callerName: 'k8s_wbs-solver_backend',
        callerImage: configuration.images[0].callerImage,
        solverImage: configuration.images[0].solverImage,
      });
    });
  },
  'solver-source-missing': (owned) => {
    editSolver(owned, (configuration) => {
      configuration.images.pop();
    });
  },
  'solver-source-sha': (owned) => {
    editSolver(owned, (configuration) => {
      configuration.devSourceSha = '0'.repeat(40);
    });
  },
  'solver-socket': (owned) => {
    editSolver(owned, (configuration) => {
      configuration.socketPath = '/run/user/1001/wbs-solver/supervisor.sock';
    });
  },
  'solver-backend-image': (owned) => {
    editSolver(owned, (configuration) => {
      configuration.images[0].callerImage = 'registry/wbs-be-01@sha256:' + '0'.repeat(64);
    });
  },
  'solver-image-table-extra': (owned) => {
    editJson(owned, 'prerequisites', (fields) => {
      fields.images.solver.push({
        reference: 'registry/unused@sha256:' + 'f'.repeat(64),
        imageId: 'sha256:' + 'f'.repeat(64),
      });
      fields.images.solver.sort((left, right) => left.reference.localeCompare(right.reference));
    });
  },
  'solver-image-table-missing': (owned) => {
    editJson(owned, 'prerequisites', (fields) => {
      fields.images.solver = [];
    });
  },
  'solver-image-id-grammar': (owned) => {
    editJson(owned, 'prerequisites', (fields) => {
      fields.images.solver[0].imageId = 'observed-not-pinned';
    });
  },
  'migration-source-drift': (owned) => {
    editJson(owned, 'migration-manifest', (fields) => {
      fields.migrations[0].down.sha256 = '0'.repeat(64);
    });
    editJson(owned, 'prerequisites', (fields) => {
      fields.activation.migrations.manifestSha256 = hash(owned.artifacts['migration-manifest']);
    });
  },
  'startup-traversal': (owned) => {
    editJson(owned, 'startup-manifest', (fields) => {
      fields.entries[0].path = '../escape';
    });
    editJson(owned, 'prerequisites', (fields) => {
      fields.activation.source.pins.manifestSha256 = hash(owned.artifacts['startup-manifest']);
    });
  },
  'malformed-utf8': (owned) => {
    owned.artifacts.openapi[0] = 255;
  },
};
for (const [name, inject] of Object.entries(faults))
  test(`native-binding integration refuses authenticated ${name}`, async () => {
    const owned = await fixture();
    inject(owned);
    const observed = await consumer(owned);
    expect(observed.code).not.toBe(0);
    expect(observed.stdout).toBe('');
  }, 20000);
for (const color of ['blue', 'green'] as const)
  for (const distinct of [false, true])
    test(`native-binding integration accepts exact ${color} roster with ${distinct ? 'two' : 'one'} solver images`, async () => {
      const observed = await consumer(await fixture(color, distinct));
      expect(observed.stderr).toBe('');
      expect(observed.code).toBe(0);
    }, 20000);
test('native-binding integration stages unknown declared writer metadata only as logical slots', async () => {
  const owned = await fixture();
  const sentinel = join(owned.root, 'protected');
  await writeFile(sentinel, 'protected');
  editWriter(owned, (manifest) => {
    manifest.members[7].hostPath = sentinel;
    manifest.members[7].reviewed = sentinel + '-reviewed';
  });
  const observed = await consumer(owned, 'stage');
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
  expect(await readFile(sentinel, 'utf8')).toBe('protected');
}, 20000);

test('native-binding integration: bounded helper original-token overlap detached-copy and close joins', async () => {
  const observed = await consumer(await fixture(), 'read', 'helper-lifetime');
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
}, 20000);
test('native-binding integration: shipping logical role caps and next-byte aggregate arithmetic', async () => {
  const { reserveSourceArtifactBytes } = await import('./source-stageb-artifacts');
  const gib = 1024 ** 3;
  expect(reserveSourceArtifactBytes('source-tree', 16 * gib, 4 * gib)).toBe(20 * gib);
  expect(() => reserveSourceArtifactBytes('source-tree', 16 * gib + 1, 0)).toThrow();
  expect(() => reserveSourceArtifactBytes('dependencies', 16 * gib, 4 * gib + 1)).toThrow();
  expect(() => reserveSourceArtifactBytes('openapi', 0, 0)).toThrow();
});

for (const fault of [
  'role-order',
  'role-missing',
  'read-write-input',
  'input-alias',
  'group-writable-input',
  'hardlinked-input',
  'input-byte-drift',
  'input-inode-drift',
])
  test(`native-binding integration: original artifact delivery refuses ${fault}`, async () => {
    const observed = await consumer(await fixture(), 'read', fault);
    expect(observed.code).not.toBe(0);
    expect(observed.stdout).toBe('');
  }, 20000);
test('native-binding integration: artifact close preserves a recycled foreign descriptor', async () => {
  const observed = await consumer(await fixture(), 'read', 'recycled-input-fd');
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
}, 20000);

for (const fault of [
  'descriptor-getter',
  'descriptor-proxy',
  'descriptor-object',
  'descriptor-duplicate',
  'descriptor-boxed',
  'descriptor-fraction',
  'descriptor-range',
  'descriptor-nan',
  'path-only-input',
  'open-first',
  'open-middle',
  'open-last',
  'late-artifact-open',
  'primary-and-close',
])
  test(`native-binding integration: borrowed descriptor boundary refuses ${fault} with exact owned settlement`, async () => {
    const observed = await consumer(await fixture(), 'read', fault);
    expect(observed.code).not.toBe(0);
    expect(observed.stdout).toBe('');
    expect(await readdir(observed.directory)).not.toContain('invoked');
    if (fault === 'primary-and-close') {
      expect(observed.stderr).toContain('injected primary reopen failure');
      expect(observed.stderr).toContain('injected cleanup close failure');
    }
  }, 20000);
test('native-binding integration: closed caller originals do not redirect actual own staging references', async () => {
  const observed = await consumer(await fixture(), 'stage', 'close-originals');
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
}, 20000);

for (const fault of ['after-open-stat-failure'])
  test(`native-binding integration: ${fault} registers then closes only the actual new reference`, async () => {
    const observed = await consumer(await fixture(), 'read', fault);
    expect(observed.code).not.toBe(0);
    expect(observed.stdout).toBe('');
  }, 20000);
for (const fault of ['overlap-admission', 'overlap-stage'])
  test(`native-binding integration: ${fault} preserves the legitimate own-reference lifetime`, async () => {
    const observed = await consumer(
      await fixture(),
      fault === 'overlap-stage' ? 'stage' : 'read',
      fault,
    );
    expect(observed.stderr).toBe('');
    expect(observed.code).toBe(0);
  }, 20000);

test('native-binding integration: observable borrowed reuse during admission refuses without touching the new caller file', async () => {
  const observed = await consumer(await fixture(), 'read', 'borrowed-reuse-during-admission');
  expect(observed.code).not.toBe(0);
  expect(observed.stderr).toContain('borrowed binding changed');
  expect(observed.stdout).toBe('');
}, 20000);
test('native-binding integration: observable private own descriptor recycling refuses close and preserves replacement', async () => {
  const observed = await consumer(await fixture(), 'read', 'own-recycle');
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
}, 20000);

test('native-binding integration: every shipping outer-role cap accepts boundary and rejects next byte without large IO', async () => {
  const { reserveSourceArtifactBytes } = await import('./source-stageb-artifacts');
  const mib = 1024 * 1024;
  const limits: Record<(typeof slots)[number], number> = {
    prerequisites: mib,
    'source-tree': 16 * 1024 * mib,
    dependencies: 16 * 1024 * mib,
    configuration: 80 * mib,
    'startup-manifest': 64 * mib,
    openapi: 16 * mib,
    'migration-manifest': 4 * mib,
    'installed-authority-manifest': 1536 * mib + 2 * mib + 4,
    'solver-artifacts': 4 + 8192 + 144 * mib + 128 * 1024,
  };
  for (const slot of slots) {
    expect(reserveSourceArtifactBytes(slot, limits[slot], 0)).toBe(limits[slot]);
    expect(() => reserveSourceArtifactBytes(slot, limits[slot] + 1, 0)).toThrow();
  }
});

for (const fault of ['directory-input', 'closed-input', 'pipe-input'])
  test(`native-binding integration: borrowed ${fault} refuses before owning or reading payload`, async () => {
    const observed = await consumer(await fixture(), 'read', fault);
    expect(observed.code).not.toBe(0);
    expect(observed.stdout).toBe('');
  }, 20000);

test('native-binding integration: exact OpenAPI JSON refuses raw UTF8 BOM before decoding', async () => {
  const owned = await fixture();
  owned.artifacts.openapi = Buffer.concat([Buffer.from([239, 187, 191]), owned.artifacts.openapi]);
  const observed = await consumer(owned);
  expect(observed.code).not.toBe(0);
  expect(observed.stdout).toBe('');
}, 20000);
test('native-binding integration: OpenAPI rejects invalid UTF8 inside an otherwise valid JSON string', async () => {
  const owned = await fixture();
  owned.artifacts.openapi = Buffer.concat([
    Buffer.from('{"openapi":"3.1.0","info":{"title":"'),
    Buffer.from([240, 159, 146]),
    Buffer.from('"},"paths":{}}\n'),
  ]);
  const observed = await consumer(owned);
  expect(observed.code).not.toBe(0);
  expect(observed.stdout).toBe('');
}, 20000);

for (const fault of [
  'product-env-count',
  'product-env-json-bound',
  'product-env-name',
  'authority-disallowed-mode',
  'writer-inner-pin',
])
  test(`native-binding integration: finite representation refuses ${fault}`, async () => {
    const owned = await fixture();
    if (fault === 'product-env-count')
      editJson(owned, 'configuration', (fields) => {
        fields.productEnvironment.backend = Array.from(
          { length: 4097 },
          (_, index) => `V${String(index)}=x`,
        );
      });
    if (fault === 'product-env-json-bound')
      editJson(owned, 'configuration', (fields) => {
        fields.productEnvironment.backend = Array.from({ length: 16 }, (_, index) => {
          const prefix = `V${String(index)}=`;
          return prefix + 'x'.repeat(65536 - prefix.length);
        });
      });
    if (fault === 'product-env-name')
      editJson(owned, 'configuration', (fields) => {
        fields.productEnvironment.backend = ['MISSING_ASSIGNMENT'];
      });
    if (fault === 'authority-disallowed-mode')
      editWriter(owned, (_manifest, header) => {
        header.members[0].mode = 0o700;
      });
    if (fault === 'writer-inner-pin')
      editJson(owned, 'prerequisites', (fields) => {
        fields.activation.authorities.pins.writerManifestSha256 = '0'.repeat(64);
      });
    const observed = await consumer(owned);
    expect(observed.code).not.toBe(0);
    expect(observed.stdout).toBe('');
  }, 20000);

for (const fault of ['descriptor-null-prototype', 'descriptor-nonenumerable'])
  test(`native-binding integration: own borrowed record refuses ${fault}`, async () => {
    const observed = await consumer(await fixture(), 'read', fault);
    expect(observed.code).not.toBe(0);
    expect(observed.stdout).toBe('');
  }, 20000);
test('native-binding integration: closed prerequisite fields refuse before actual startup decoder dispatch', async () => {
  const owned = await fixture();
  editJson(owned, 'prerequisites', (fields) => {
    Object.defineProperty(fields, 'unexpected', { value: true, enumerable: true });
  });
  const observed = await consumer(owned, 'read', 'semantic-startup-witness');
  expect(observed.code).not.toBe(0);
  expect(await readdir(observed.directory)).not.toContain('semantic-startup-invoked');
}, 20000);

for (const fault of [
  'authority-format',
  'authority-version',
  'authority-member-label',
  'authority-canonical-bytes',
])
  test(`native-binding integration: authority semantic/canonical boundary refuses ${fault}`, async () => {
    const owned = await fixture();
    if (fault === 'authority-format')
      editWriter(owned, (_manifest, header) => {
        header.format = 'wrong-authority-format';
      });
    if (fault === 'authority-version')
      editWriter(owned, (_manifest, header) => {
        header.version = 2;
      });
    if (fault === 'authority-member-label')
      editWriter(owned, (_manifest, header) => {
        header.members[0].member = header.members[1].member;
      });
    if (fault === 'authority-canonical-bytes') {
      const packed = owned.artifacts['installed-authority-manifest'];
      const length = packed.readUInt32BE();
      const header: unknown = JSON.parse(packed.subarray(4, 4 + length).toString());
      const bytes = Buffer.from(JSON.stringify(header, null, 2) + '\n');
      const prefix = Buffer.alloc(4);
      prefix.writeUInt32BE(bytes.length);
      owned.artifacts['installed-authority-manifest'] = Buffer.concat([
        prefix,
        bytes,
        packed.subarray(4 + length),
      ]);
    }
    const observed = await consumer(owned);
    expect(observed.code).not.toBe(0);
    expect(observed.stdout).toBe('');
  }, 20000);

test('native-binding integration: unreadable borrowed mode refuses before actual procfd reopen attempt', async () => {
  const observed = await consumer(await fixture(), 'read', 'pre-open-readability');
  expect(observed.code).not.toBe(0);
  expect(await readdir(observed.directory)).not.toContain('unexpected-reopen-attempt');
}, 20000);

test('native-binding integration: consumed solver configuration is hashed before interpretation independently of later FD rehash', async () => {
  const owned = await fixture();
  const packed = owned.artifacts['solver-artifacts'];
  const length = packed.readUInt32BE();
  const header = parseFixture(packed.subarray(4, 4 + length).toString()) as SolverHeader;
  let offset = 4 + length;
  const bodies = header.members.map((member) => {
    const bytes = packed.subarray(offset, offset + member.bytes);
    offset += member.bytes;
    return bytes;
  });
  bodies[0] = Buffer.alloc(32768, 43);
  header.members[0].bytes = bodies[0].length;
  owned.artifacts['solver-artifacts'] = pack(header, bodies);
  editJson(owned, 'prerequisites', (fields) => {
    fields.activation.solver.bunSha256 = hash(bodies[0]);
    fields.activation.authorities.pins.solver.bunSha256 = hash(bodies[0]);
  });
  const observed = await consumer(owned, 'read', 'consumed-solver-config');
  expect(observed.code).not.toBe(0);
  expect(observed.stderr).toContain('consumed solver configuration differs');
}, 20000);
test('native-binding integration: exact solver package EOF refuses a trailing byte', async () => {
  const owned = await fixture();
  owned.artifacts['solver-artifacts'] = Buffer.concat([
    owned.artifacts['solver-artifacts'],
    Buffer.from('x'),
  ]);
  const observed = await consumer(owned);
  expect(observed.code).not.toBe(0);
  expect(observed.stdout).toBe('');
}, 20000);

for (const slot of ['installed-authority-manifest', 'solver-artifacts'] as const)
  for (const fault of [
    'zero-header',
    'oversized-declared-header',
    'truncated-header',
    'malformed-header-UTF8',
  ])
    test(`native-binding integration: actual ${slot} refuses ${fault}`, async () => {
      const owned = await fixture();
      const prefix = Buffer.alloc(4);
      const body = fault === 'malformed-header-UTF8' ? Buffer.from([255, 255]) : Buffer.from('{}');
      prefix.writeUInt32BE(
        fault === 'zero-header'
          ? 0
          : fault === 'oversized-declared-header'
            ? slot === 'solver-artifacts'
              ? 8193
              : 2 * 1024 * 1024 + 1
            : fault === 'truncated-header'
              ? 10
              : body.length,
      );
      owned.artifacts[slot] = Buffer.concat([prefix, body]);
      const observed = await consumer(owned);
      expect(observed.code).not.toBe(0);
      expect(observed.stdout).toBe('');
    }, 20000);

test('native-binding integration: known B-owned reference cannot be reborrowed as a caller slot', async () => {
  const observed = await consumer(await fixture(), 'read', 'private-reference-overlap');
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
}, 20000);

test('native-binding integration: aliased role identities refuse before actual reference acquisition', async () => {
  const owned = await fixture();
  owned.artifacts.openapi = owned.artifacts.prerequisites;
  const observed = await consumer(owned, 'read', 'input-alias-witness');
  expect(observed.code).not.toBe(0);
  expect(await readdir(observed.directory)).not.toContain('unexpected-reopen-attempt');
}, 20000);
test('native-binding integration: artifact inspection detaches all mutable small bytes and nested plans', async () => {
  const observed = await consumer(await fixture(), 'read', 'projection-detachment');
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
}, 20000);

test('native-binding integration: OpenAPI own fields cannot be supplied through a parsed __proto__ value', async () => {
  const owned = await fixture();
  owned.artifacts.openapi = Buffer.from('{"__proto__":{"openapi":"3.1.0","info":{},"paths":{}}}\n');
  const observed = await consumer(owned);
  expect(observed.code).not.toBe(0);
  expect(observed.stdout).toBe('');
}, 20000);
