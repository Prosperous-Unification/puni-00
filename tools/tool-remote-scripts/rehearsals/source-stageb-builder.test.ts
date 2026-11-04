import { expect, test } from 'bun:test';
import type { Node as TypeScriptNode } from 'typescript';

import { consumer, fixture } from './source-stageb-artifacts.test';

test('native-binding integration: actual J-owned staging streams real payloads and cleans only its child', async () => {
  const observed = await consumer(await fixture(), 'stage');
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('synthetic-B1-verified\n');
}, 20000);

for (const fault of ['preexisting', 'consumed-byte', 'partial-write'])
  test(`native-binding integration: actual staging refuses ${fault} and preserves bounded cleanup`, async () => {
    const observed = await consumer(await fixture(), 'stage', fault);
    expect(observed.code).not.toBe(0);
    expect(observed.stdout).toBe('');
    const { readdir, readFile } = await import('node:fs/promises');
    const parent = observed.directory + '/staging-parent';
    if (fault === 'preexisting')
      expect(await readFile(parent + '/source-stageb-staging/foreign', 'utf8')).toBe('foreign');
    else expect(await readdir(parent)).toEqual([]);
  }, 20000);
for (const fault of ['short-read', 'short-write', 'no-yield'])
  test(`native-binding integration: actual staging ${fault} obeys complete IO/acquisition`, async () => {
    const observed = await consumer(await fixture(), 'stage', fault);
    expect(observed.stderr).toBe('');
    expect(observed.code).toBe(0);
  }, 20000);

for (const fault of ['replace-child', 'replace-parent'])
  test(`native-binding integration: ${fault} cleanup preserves foreign objects and reports unproved`, async () => {
    const observed = await consumer(await fixture(), 'stage', fault);
    expect(observed.code).not.toBe(0);
    expect(observed.stdout).toBe('');
    const { readFile } = await import('node:fs/promises');
    expect(
      await readFile(
        observed.directory +
          '/staging-parent/' +
          (fault === 'replace-child' ? 'source-stageb-staging/' : '') +
          'foreign',
        'utf8',
      ),
    ).toBe('foreign');
  }, 20000);
test('native-binding integration: foreign staging close cannot affect original lifetime', async () => {
  const observed = await consumer(await fixture(), 'stage', 'foreign-close');
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
}, 20000);

test('native-binding integration: final population rechecks an earlier same-inode staged byte change', async () => {
  const observed = await consumer(await fixture(), 'stage', 'staged-byte');
  expect(observed.code).not.toBe(0);
  expect(observed.stdout).toBe('');
}, 20000);

for (const fault of [
  'dispatch-failure',
  'mkdir-failure',
  'first-open-failure',
  'first-stat-failure',
  'journal-observation-failure',
  'late-acquisition',
])
  test(`native-binding integration: ${fault} settles acquisition without a token or staging residue`, async () => {
    const observed = await consumer(await fixture(), 'stage', fault);
    expect(observed.code).not.toBe(0);
    expect(observed.stdout).toBe('');
    const { readdir } = await import('node:fs/promises');
    expect(await readdir(observed.directory + '/staging-parent')).toEqual([]);
  }, 20000);

test('native-binding integration: actual consumed-stream join refuses isolated digest observation fault', async () => {
  const observed = await consumer(await fixture(), 'stage', 'stream-observation');
  expect(observed.code).not.toBe(0);
  expect(observed.stderr).toContain('artifact join refused');
  expect(observed.stdout).toBe('');
}, 20000);

for (const fault of ['late-parent-open', 'parent-path-only', 'parent-object'])
  test(`native-binding integration: ${fault} preserves caller parent and settles own acquisition`, async () => {
    const observed = await consumer(await fixture(), 'stage', fault);
    expect(observed.code).not.toBe(0);
    expect(observed.stdout).toBe('');
    const { readdir } = await import('node:fs/promises');
    expect(await readdir(observed.directory + '/staging-parent')).toEqual([]);
    expect(await readdir(observed.directory)).not.toContain('invoked');
  }, 20000);

test('native-binding integration: racing EEXIST child is never adopted populated or removed', async () => {
  const observed = await consumer(await fixture(), 'stage', 'racing-child');
  expect(observed.code).not.toBe(0);
  const { readFile } = await import('node:fs/promises');
  expect(
    await readFile(observed.directory + '/staging-parent/source-stageb-staging/foreign', 'utf8'),
  ).toBe('foreign');
}, 20000);
test('native-binding integration: known preexisting child refuses before J effect-intent records', async () => {
  const observed = await consumer(await fixture(), 'stage', 'preexisting');
  expect(observed.code).not.toBe(0);
  const { readdir } = await import('node:fs/promises');
  expect(
    (await readdir(observed.directory + '/parent/source-stageb-' + '3'.repeat(32))).length,
  ).toBe(1);
}, 20000);

test('native-binding integration: final staged identity refuses write-and-restore timestamp drift', async () => {
  const observed = await consumer(await fixture(), 'stage', 'staged-restored-byte');
  expect(observed.code).not.toBe(0);
  expect(observed.stdout).toBe('');
}, 20000);
test('native-binding integration: independent final output readback hash refuses an actual read observation fault', async () => {
  const observed = await consumer(await fixture(), 'stage', 'final-readback-observation');
  expect(observed.code).not.toBe(0);
  expect(observed.stderr).toContain('final file bytes differ');
}, 20000);

test('native-binding integration: staging close memoizes the original in-flight settlement Promise', async () => {
  const observed = await consumer(await fixture(), 'stage', 'stage-close-memo');
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
}, 20000);

for (const fault of [
  'r1-reader-close',
  'r1-reader-primary-close',
  'r1-writer-primary-close',
  'r1-reader-recycle',
  'r1-writer-recycle',
])
  test(`native-binding integration: wave1 leaf settlement preserves primary and sentinel for ${fault}`, async () => {
    const observed = await consumer(await fixture(), 'stage', fault);
    expect(observed.code).not.toBe(0);
    const { readFile } = await import('node:fs/promises');
    const evidence: unknown = JSON.parse(
      await readFile(observed.directory + '/r1-failure.json', 'utf8'),
    );
    const encoded = JSON.stringify(evidence);
    if (fault.includes('primary') || fault.includes('recycle'))
      expect(encoded).toContain(
        'r1 injected ' + (fault.includes('reader') ? 'reader' : 'writer') + ' primary',
      );
    if (fault.includes('recycle')) {
      expect(encoded).toContain('object identity differs');
      expect(encoded).toContain('"sentinelSurvived":true');
    } else {
      expect(encoded).toContain('cleanup unproved');
      expect(encoded).toContain('r1 injected leaf close failure');
      expect(encoded).toContain('"closeCount":1');
    }
  }, 20000);

test('native-binding integration: wave1 required recheck settles before any parent IO', async () => {
  const observed = await consumer(await fixture(), 'stage', 'r1-recheck-before-parent');
  expect(observed.code).not.toBe(0);
  const { readdir, readFile } = await import('node:fs/promises');
  expect(observed.stderr).toContain('r1 injected input recheck failure');
  const names = await readdir(observed.directory);
  expect(names).not.toContain('r1-unhandled');
  expect(names).not.toContain('r1-parent-requested');
  expect(await readFile(observed.directory + '/r1-failure.json', 'utf8')).toContain(
    'r1 injected input recheck failure',
  );
}, 20000);
for (const fault of ['r1-remove-intent', 'r1-remove-dispatch'])
  test(`native-binding integration: wave1 published cleanup requires ${fault} durability before deletion`, async () => {
    const observed = await consumer(await fixture(), 'stage', fault);
    expect(observed.code).not.toBe(0);
    const { readdir, readFile } = await import('node:fs/promises');
    expect(await readdir(observed.directory)).not.toContain('r1-removal-effect');
    expect(await readFile(observed.directory + '/r1-remove-failure.json', 'utf8')).toContain(
      'cleanup unproved',
    );
    expect(
      await readFile(
        observed.directory + '/staging-parent/source-stageb-staging/source/node_modules/module',
        'utf8',
      ),
    ).toBe('synthetic dependency\n');
  }, 20000);
for (const fault of ['r1-backing-alias', 'r1-recorded-alias'])
  test(`native-binding integration: wave1 ${fault} refuses before effects and preserves usable J`, async () => {
    const observed = await consumer(await fixture(), 'stage', fault);
    expect(observed.code).not.toBe(0);
    const { readFile } = await import('node:fs/promises');
    expect(JSON.parse(await readFile(observed.directory + '/r1-alias.json', 'utf8'))).toEqual({
      journalUnchanged: true,
      journalUsable: true,
      childAbsent: true,
      siblingIntact: true,
    });
  }, 20000);
for (const fault of ['r1-shared-parent', 'r1-absence-parent'])
  test(`native-binding integration: wave1 ${fault} remains eligible with J usability`, async () => {
    const observed = await consumer(await fixture(), 'stage', fault);
    expect(observed.stderr).toBe('');
    expect(observed.code).toBe(0);
    const { readFile } = await import('node:fs/promises');
    expect(await readFile(observed.directory + '/r1-allowed-parent', 'utf8')).toBe('usable');
  }, 20000);

test('native-binding integration: wave2 post-chmod observation cannot replace original close identity', async () => {
  const observed = await consumer(await fixture(), 'stage', 'r2-chmod-recycle');
  expect(observed.code).not.toBe(0);
  expect(observed.stdout).toBe('');
  const { readFile } = await import('node:fs/promises');
  const evidence = await readFile(observed.directory + '/r1-failure.json', 'utf8');
  expect(evidence).toContain('"sentinelSurvived":true');
  expect(evidence).toContain('post-chmod identity differs');
  expect(evidence).toContain('cleanup unproved');
  expect(evidence).toContain('object identity differs');
  expect(await readFile(observed.directory + '/r2-sentinel', 'utf8')).toBe(
    'already-created sentinel',
  );
  expect(await readFile(observed.directory + '/r2-injected', 'utf8')).toContain('sentinelInode');
}, 20000);

/** Actual I/J/B1 construction-retention probe; only the build exports private symbols for observation. */
async function probeConstructionRetention(fault = '') {
  const { mkdir, mkdtemp, writeFile, readFile, chmod, stat } = await import('node:fs/promises');
  const { constants, openSync, closeSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const { hash, json, slots } = await import('./source-stageb-artifacts.test');
  const owned = await fixture();
  const directory = await mkdtemp(owned.root + '/retention-');
  await chmod(directory, 0o700);
  for (const leaf of ['registry', 'parent', 'staging-parent', 'scratch'])
    await mkdir(directory + '/' + leaf, { mode: 0o700 });
  const registry = await stat(directory + '/registry', { bigint: true });
  for (const slot of slots)
    await writeFile(directory + '/' + slot, owned.artifacts[slot], { mode: 0o600 });
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
  await writeFile(directory + '/index', index, { mode: 0o600 });
  const review = {
    format: 'source-stageb-review',
    version: 1,
    ...joins,
    inputManifestSha256: hash(index),
    recipient,
    registry: {
      scope: '8'.repeat(32),
      device: String(registry.dev),
      inode: String(registry.ino),
      uid: Number(registry.uid),
      gid: Number(registry.gid),
      mode: 448,
    },
    notBefore: Date.now() - 1000,
    notAfter: Date.now() + 120000,
    maximumDurationMs: 90000,
  };
  const entry = `import {readSourceInputs,inspectSourceInputs,closeSourceInputs} from './source-stageb-inputs';
import {readSourceArtifacts,closeSourceArtifacts} from './source-stageb-artifacts';
import {createSourceJournal,closeSourceJournal} from './source-stageb-journal';
import {stageSourceArtifacts,closeSourceStaging,probeRetain,probeAssert,probeRelease,probeRead} from './source-stageb-builder';
import {open,mkdir,readFile,stat,readdir} from 'node:fs/promises';import {constants,readlinkSync} from 'node:fs';
const directory=${JSON.stringify(directory)};const inputs=await readSourceInputs();const inspection=inspectSourceInputs(inputs);
const files=[];let artifacts,journal,staging;let evidence;
try {
const descriptors={};for(const slot of ${JSON.stringify(slots)}){const file=await open(directory+'/'+slot,constants.O_RDONLY|constants.O_NOFOLLOW);files.push(file);descriptors[slot]=file.fd;}
artifacts=await readSourceArtifacts(inputs,descriptors);
await mkdir(directory+'/parent/source-stageb-'+inspection.review.nonce,{mode:448});
journal=await createSourceJournal({parent:await open(directory+'/parent',constants.O_RDONLY|constants.O_DIRECTORY),directory:await open(directory+'/parent/source-stageb-'+inspection.review.nonce,constants.O_RDONLY|constants.O_DIRECTORY),claim:{format:'source-stageb-journal',version:1,nonce:inspection.review.nonce,implementationSha:inspection.review.implementationSha,workflowSha:inspection.review.workflowSha,sourceSha:inspection.review.sourceSha,inputManifestSha256:inspection.review.inputManifestSha256},deadline:inspection.originalDeadline});
const caller=await open(directory+'/staging-parent',constants.O_RDONLY|constants.O_DIRECTORY);
try{staging=await stageSourceArtifacts(inputs,artifacts,journal,caller.fd);}finally{await caller.close();}
let wrongJoinRefused;const fault=${JSON.stringify(fault)};
if(fault==='wrong-inputs'||fault==='wrong-artifacts'||fault==='wrong-journal'){try{const unexpected=probeRetain?.(fault==='wrong-inputs'?{}:inputs,fault==='wrong-artifacts'?{}:artifacts,staging,fault==='wrong-journal'?{}:journal);wrongJoinRefused=false;if(unexpected)probeRelease?.(unexpected);}catch{wrongJoinRefused=true;}}
const retention=probeRetain?.(inputs,artifacts,staging,journal);
let foreignRetentionRefused;
if(fault==='foreign-retention'){let assertRefused=false,releaseRefused=false;try{probeAssert?.({});}catch{assertRefused=true;}try{probeRelease?.({});}catch{releaseRefused=true;}foreignRetentionRefused=assertRefused&&releaseRefused;}
let pendingRead,releaseRead,restoreRead,readBytes;
if(fault==='late-read-close'&&probeRead&&retention){let enter;const entered=new Promise(resolve=>{enter=resolve;});const gate=new Promise(resolve=>{releaseRead=resolve;});const prototype=Object.getPrototypeOf(files[0]);const originalRead=prototype.read;prototype.read=async function(...args){if(readlinkSync('/proc/self/fd/'+this.fd).endsWith('/source-stageb-staging/source/multichunk')){enter();await gate;}return await originalRead.apply(this,args);};restoreRead=()=>{prototype.read=originalRead;};pendingRead=probeRead(retention,'source/multichunk',0,65536);await entered;}
let foreignRefused=false,overlapRefused=false;
if(probeRetain){try{probeRetain(inputs,artifacts,{},journal);}catch{foreignRefused=true;}try{probeRetain(inputs,artifacts,staging,journal);}catch{overlapRefused=true;}}
let closed=false;const closing=closeSourceStaging(staging).then(()=>{closed=true;});
await new Promise(resolve=>setTimeout(resolve,10));
let held=false;try{held=(await readFile(directory+'/staging-parent/source-stageb-staging/source/multichunk')).length===140000;}catch(cause){if(cause?.code!=='ENOENT')throw cause;}
let closingRefused=false;try{probeRetain?.(inputs,artifacts,staging,journal);}catch{closingRefused=true;}
let admittedSurvives=false;if(probeAssert&&retention){probeAssert(retention);admittedSurvives=true;}
const waited=!closed;if(pendingRead){releaseRead();readBytes=(await pendingRead).byteLength;restoreRead();}if(probeRelease&&retention)await probeRelease(retention);await closing;staging=undefined;
evidence={held,waited,admittedSurvives,foreignRefused,overlapRefused,closingRefused,removed:(await readdir(directory+'/staging-parent')).length===0,...(wrongJoinRefused===undefined?{}:{wrongJoinRefused}),...(foreignRetentionRefused===undefined?{}:{foreignRetentionRefused}),...(readBytes===undefined?{}:{readBytes})};
}finally{try{if(staging)await closeSourceStaging(staging);}finally{try{if(journal)await closeSourceJournal(journal);}finally{try{if(artifacts)await closeSourceArtifacts(artifacts);}finally{for(const file of files)await file.close();await closeSourceInputs(inputs);}}}}
console.log(JSON.stringify(evidence));`;
  const compilation = await Bun.build({
    entrypoints: ['retention:entry'],
    target: 'bun',
    format: 'esm',
    splitting: false,
    define: { SOURCE_STAGEB_REVIEW_LITERAL: JSON.stringify(JSON.stringify(review)) },
    plugins: [
      {
        name: 'original-retention-probe',
        setup(build) {
          build.onResolve({ filter: /^retention:entry$/ }, () => ({
            path: 'entry',
            namespace: 'retention',
          }));
          build.onResolve({ filter: /^\.\/source-stageb-/, namespace: 'retention' }, (args) => ({
            path: import.meta.dir + '/' + args.path.slice(2) + '.ts',
            namespace: 'file',
          }));
          build.onLoad({ filter: /.*/, namespace: 'retention' }, () => ({
            contents: entry.replaceAll(
              "from './source-stageb-",
              "from '" + import.meta.dir + '/source-stageb-',
            ),
            loader: 'ts',
            resolveDir: import.meta.dir,
          }));
          build.onLoad({ filter: /source-stageb-builder\.ts$/ }, async (args) => ({
            contents:
              (await readFile(args.path, 'utf8')) +
              '\nexport const probeRetain=typeof retainOriginalStaging === "undefined"?undefined:retainOriginalStaging;\nexport const probeAssert=typeof assertOriginalStaging === "undefined"?undefined:assertOriginalStaging;\nexport const probeRelease=typeof releaseOriginalStaging === "undefined"?undefined:releaseOriginalStaging;\nexport const probeRead=typeof readOriginalStagedChunk === "undefined"?undefined:readOriginalStagedChunk;',
            loader: 'ts',
          }));
        },
      },
    ],
  });
  if (!compilation.success)
    throw new AggregateError(compilation.logs, 'retention probe compilation failed');
  const executable = compilation.outputs.find((output) => output.kind === 'entry-point');
  if (executable === undefined) throw Error('retention probe output absent');
  const candidate = Buffer.from(await executable.arrayBuffer());
  const pin = createHash('sha256').update(candidate).digest('hex');
  await writeFile(directory + '/probe.mjs', candidate, { mode: 0o600 });
  if (
    createHash('sha256')
      .update(await readFile(directory + '/probe.mjs'))
      .digest('hex') !== pin
  )
    throw Error('retention candidate pin differs');
  const indexFd = openSync(directory + '/index', constants.O_RDONLY | constants.O_NOFOLLOW);
  const registryFd = openSync(
    directory + '/registry',
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const child = spawn(process.execPath, ['--no-env-file', 'run', directory + '/probe.mjs'], {
      cwd: directory,
      env: {
        WBS_ENV: 'dev',
        TMPDIR: directory + '/scratch',
        BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
        LANG: 'C.UTF-8',
        TZ: 'UTC',
      },
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
    });
    const completion = once(child, 'close');
    async function collect(stream: NodeJS.ReadableStream | null) {
      if (stream === null) throw Error('retention pipe absent');
      let bytes = Buffer.alloc(0);
      for await (const chunk of stream) {
        bytes = Buffer.concat([bytes, Buffer.from(chunk)]);
        if (bytes.length > 65536) throw Error('retention pipe bound');
      }
      return bytes.toString();
    }
    const stdout = collect(child.stdout);
    const stderr = collect(child.stderr);
    const status = (await completion) as [number | null, NodeJS.Signals | null];
    return { code: status[0], stdout: await stdout, stderr: await stderr, directory, fault };
  } finally {
    closeSync(indexFd);
    closeSync(registryFd);
  }
}

test('construction retention keeps actual staged bytes usable until admitted construction settles', async () => {
  const observed = await probeConstructionRetention();
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
  expect(JSON.parse(observed.stdout)).toEqual({
    held: true,
    waited: true,
    admittedSurvives: true,
    foreignRefused: true,
    overlapRefused: true,
    closingRefused: true,
    removed: true,
  });
}, 20000);

for (const fault of [
  'wrong-inputs',
  'wrong-artifacts',
  'wrong-journal',
  'foreign-retention',
  'late-read-close',
])
  test(`construction retention ${fault} preserves the legitimate original lifetime`, async () => {
    const observed = await probeConstructionRetention(fault);
    expect(observed.stderr).toBe('');
    expect(observed.code).toBe(0);
    const evidence = JSON.parse(observed.stdout) as {
      held: boolean;
      waited: boolean;
      admittedSurvives: boolean;
      removed: boolean;
      wrongJoinRefused?: boolean;
      foreignRetentionRefused?: boolean;
      readBytes?: number;
    };
    expect(evidence.held).toBe(true);
    expect(evidence.waited).toBe(true);
    expect(evidence.admittedSurvives).toBe(true);
    expect(evidence.removed).toBe(true);
    if (fault.startsWith('wrong-')) expect(evidence.wrongJoinRefused).toBe(true);
    if (fault === 'foreign-retention') expect(evidence.foreignRetentionRefused).toBe(true);
    if (fault === 'late-read-close') expect(evidence.readBytes).toBe(65536);
  }, 20000);

import type { SourceFixtureAuthority } from './source-stageb-fixture';
import {
  createConstructionFixture,
  runOwnedConstructionProbe,
} from './source-stageb-fixture-bootstrap.test';

const originalPolicyBoundarySource = `
import * as policyBoundaryFs from 'node:fs/promises';
import * as policyBoundaryProcess from 'node:child_process';
import {spyOn as policyBoundarySpy} from 'bun:test';
export async function runLowerConstructionProbe(inputs,artifacts,staging,journal,borrow,directory,fault,archive){
 let custodyReads=0;let nativeSpawns=0;let refusal;
 const actualRead=policyBoundaryFs.readFile;
 const read=policyBoundarySpy(policyBoundaryFs,'readFile').mockImplementation(async(path,...arguments_)=>{if(String(path)==='/etc/machine-id'){custodyReads++;throw Error('policy-native-custody-boundary');}return await actualRead(path,...arguments_);});
 const spawn=policyBoundarySpy(policyBoundaryProcess,'spawn').mockImplementation(()=>{nativeSpawns++;throw Error('policy-native-spawn-boundary');});
 try{await buildSourcePrerequisites(inputs,artifacts,staging,journal,archive);throw Error('policy-unexpected-constructor-admission');}
 catch(cause){const primary=cause instanceof AggregateError&&cause.cause instanceof Error?cause.cause:cause;if(!(primary instanceof Error))throw cause;refusal=primary.message;}
 finally{spawn.mockRestore();read.mockRestore();}
 return {custodyReads,nativeSpawns,refusal};
}`;

for (const fault of [
  'valid-boundary',
  'configuration',
  ...(['backend', 'gateway', 'source', 'caddy', 'solver-prod', 'solver-dev'] as const).flatMap(
    (role) => [role + '-reference', role + '-imageId'],
  ),
  'solver-role-swap',
]) {
  test(`original policy join ${fault} refuses before native custody or effect`, async () => {
    const proposed = await createConstructionFixture();
    const facility = JSON.parse(proposed.facilityBytes.toString()) as SourceFixtureAuthority;
    if (fault === 'solver-role-swap') {
      const { createHash } = await import('node:crypto');
      const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
      const delivery = proposed.owned.artifacts['solver-artifacts'];
      const length = delivery.readUInt32BE();
      const header = JSON.parse(delivery.subarray(4, length + 4).toString()) as {
        members: { bytes: number }[];
      };
      let offset = 4 + length;
      const bodies = header.members.map((member) => {
        const body = delivery.subarray(offset, offset + member.bytes);
        offset += member.bytes;
        return body;
      });
      const configuration = JSON.parse(bodies[2].toString()) as {
        images: { solverImage: string }[];
      };
      const distinct = 'registry/solver@sha256:' + 'd'.repeat(64);
      configuration.images[1].solverImage = distinct;
      bodies[2] = Buffer.from(JSON.stringify(configuration) + '\n');
      header.members[2].bytes = bodies[2].length;
      const prefix = Buffer.from(JSON.stringify(header) + '\n');
      const size = Buffer.alloc(4);
      size.writeUInt32BE(prefix.length);
      proposed.owned.artifacts['solver-artifacts'] = Buffer.concat([size, prefix, ...bodies]);
      const prerequisites = JSON.parse(proposed.owned.artifacts.prerequisites.toString()) as {
        activation: {
          solver: { configSha256: string };
          authorities: { pins: { solver: { configSha256: string } } };
        };
        images: { solver: { reference: string; imageId: string }[] };
      };
      prerequisites.activation.solver.configSha256 = hash(bodies[2]);
      prerequisites.activation.authorities.pins.solver.configSha256 = hash(bodies[2]);
      prerequisites.images.solver.push({
        reference: distinct,
        imageId: 'sha256:' + 'c'.repeat(64),
      });
      prerequisites.images.solver.sort((left, right) =>
        left.reference.localeCompare(right.reference),
      );
      proposed.owned.artifacts.prerequisites = Buffer.from(JSON.stringify(prerequisites) + '\n');
      const dev = facility.images.find((image) => image.role === 'solver-dev');
      if (dev === undefined) throw Error('test distinct solver role absent');
      dev.reference = distinct;
    }
    if (fault === 'configuration') facility.configurationSha256 = '9'.repeat(64);
    else if (fault === 'solver-role-swap') {
      const prod = facility.images.find((image) => image.role === 'solver-prod');
      const dev = facility.images.find((image) => image.role === 'solver-dev');
      if (prod === undefined || dev === undefined) throw Error('test solver image roles absent');
      [prod.reference, dev.reference] = [dev.reference, prod.reference];
      [prod.imageId, dev.imageId] = [dev.imageId, prod.imageId];
    } else if (fault !== 'valid-boundary') {
      const image = facility.images.find((image) => fault.startsWith(image.role + '-'));
      if (image === undefined) throw Error('test original image role absent');
      if (fault.endsWith('-reference'))
        image.reference = 'registry.invalid/foreign@sha256:' + '9'.repeat(64);
      else image.imageId = 'sha256:' + '9'.repeat(64);
    }
    proposed.facilityBytes = Buffer.from(JSON.stringify(facility) + '\n');
    const observed = await runOwnedConstructionProbe(
      proposed,
      originalPolicyBoundarySource,
      '',
      'public',
    );
    expect(observed.stderr).toBe('');
    expect(observed.code).toBe(0);
    const evidence = JSON.parse(observed.stdout) as {
      custodyReads: number;
      nativeSpawns: number;
      refusal: string;
    };
    expect(evidence.nativeSpawns).toBe(0);
    if (fault === 'valid-boundary') {
      expect(evidence.custodyReads).toBe(1);
      expect(evidence.refusal).toBe('policy-native-custody-boundary');
    } else {
      expect(evidence.custodyReads).toBe(0);
      expect(evidence.refusal).toBe(
        fault === 'configuration'
          ? 'source fixture policy original configuration artifact pin'
          : fault === 'solver-role-swap'
            ? 'source construction original solver role image differs'
            : fault.startsWith('solver-')
              ? 'source fixture policy original solver image pin'
              : 'source fixture policy original fixed image pin',
      );
    }
  }, 30000);
}

test('actual constructor uncertainty keeps J cleanup-only and removes only original filesystem resources', async () => {
  const proposed = await createConstructionFixture();
  const extra = `
import {SourceFixtureConstruction} from '${import.meta.dir}/source-stageb-fixture.ts';
import {inspectSourceJournal} from '${import.meta.dir}/source-stageb-journal.ts';
import {writeFile,readFile,lstat} from 'node:fs/promises';
export async function runLowerConstructionProbe(inputs,artifacts,staging,journal,archive,directory){
 const retention=retainOriginalStaging(inputs,artifacts,staging,journal);let construction;
 try{
  construction=new SourceFixtureConstruction(inputs,artifacts,journal,retention,archive);
  const parent=directory+'/coordinator/uncertain-owned';const sibling=directory+'/coordinator/foreign-sibling';await writeFile(sibling,'foreign-inert',{mode:384});
  const scope=await construction.acquireDirectory(parent,448,process.geteuid(),process.getegid());await construction.populateDirectory(scope,[]);
  const primary=Error('owned-input-read-failed');let preserved=false;
  try{await construction.acquireFile(parent+'/partial',8,hashBytes('abcdefgh'),384,async offset=>{if(offset>0)throw primary;return Buffer.from('a');});}catch(cause){preserved=cause===primary;}
  const partial=(await readFile(parent+'/partial')).toString();const before=await inspectSourceJournal(journal);let laterRefused=false;
  try{await construction.acquireDirectory(parent+'/forbidden-later',448,process.geteuid(),process.getegid());}catch{laterRefused=true;}
  let laterAbsent=false;try{await lstat(parent+'/forbidden-later');}catch(cause){if(cause?.code!=='ENOENT')throw cause;laterAbsent=true;}
  await construction.close();const after=await inspectSourceJournal(journal);let originalAbsent=false;try{await lstat(parent);}catch(cause){if(cause?.code!=='ENOENT')throw cause;originalAbsent=true;}
  const payloads=after.records.map(record=>record.payload);const uncertainty=payloads.findIndex(payload=>payload.kind==='uncertain');
  const cleanup=payloads.slice(uncertainty+1).filter(payload=>payload.kind==='intent').map(payload=>payload.operation);
  return {preserved,partial,before:before.phase,after:after.phase,laterRefused,laterAbsent,originalAbsent,sibling:await readFile(sibling,'utf8'),cleanup,remaining:after.resources.filter(resource=>resource.identity.kind==='file'||resource.identity.kind==='directory').filter(resource=>resource.status!=='absence-recorded').length};
 }finally{try{if(construction)await construction.close();}finally{releaseOriginalStaging(retention);}}
}
`;
  const observed = await runOwnedConstructionProbe(proposed, extra);
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
  const evidence = JSON.parse(observed.stdout) as {
    preserved: boolean;
    partial: string;
    before: string;
    after: string;
    laterRefused: boolean;
    laterAbsent: boolean;
    originalAbsent: boolean;
    sibling: string;
    cleanup: string[];
    remaining: number;
  };
  expect(evidence).toEqual({
    preserved: true,
    partial: 'a',
    before: 'cleanup-only',
    after: 'cleanup-only',
    laterRefused: true,
    laterAbsent: true,
    originalAbsent: true,
    sibling: 'foreign-inert',
    cleanup: ['remove', 'capture', 'remove'],
    remaining: 1,
  });
}, 30000);

import { buildSourceFixtureMigrationWorker } from './source-stageb-fixture-bootstrap';

test('actual parent closes original permission pipe and joins before-grant worker when proc is unreadable', async () => {
  const proposed = await createConstructionFixture();
  const control = proposed.directory + '/coordinator/source-stageb-constructor';
  const worker = await buildSourceFixtureMigrationWorker({
    ...proposed.migrationPackage,
    envelope: control + '/envelope',
    databases: [
      { environment: 'prod', path: control + '/data/production.sqlite' },
      { environment: 'dev', path: control + '/data/development.sqlite' },
    ],
  });
  const facility = JSON.parse(proposed.facilityBytes.toString()) as SourceFixtureAuthority;
  facility.worker.bytes = worker.bytes.byteLength;
  facility.worker.sha256 = worker.sha256;
  proposed.facilityBytes = Buffer.from(JSON.stringify(facility) + '\n');
  proposed.worker = worker;
  const extra = `
import {SourceFixtureConstruction} from '${import.meta.dir}/source-stageb-fixture.ts';
import * as permissionFs from 'node:fs/promises';import {once as permissionOnce} from 'node:events';import {spyOn as permissionSpy} from 'bun:test';
export async function runLowerConstructionProbe(inputs,artifacts,staging,journal,archive,directory){
 const retention=retainOriginalStaging(inputs,artifacts,staging,journal);let construction;let readSpy;
 try{
  construction=new SourceFixtureConstruction(inputs,artifacts,journal,retention,archive);const parent=directory+'/coordinator/source-stageb-constructor';const uid=process.geteuid();const gid=process.getegid();
  const control=await construction.acquireDirectory(parent,448,uid,gid);const envelope=await construction.acquireDirectory(parent+'/envelope',448,uid,gid);const staged=inspectOriginalStaging(retention).members;
  await construction.populateDirectory(envelope,staged.filter(member=>member.path.startsWith('migration/')).map(member=>({...member,path:member.path.slice('migration/'.length),staged:member.path})));
  await construction.acquireDirectory(parent+'/data',448,uid,gid);const job=await construction.acquireDirectory(parent+'/migration-prod',448,uid,gid);await construction.populateDirectory(job,[{path:'copy',kind:'directory',mode:448},{path:'sqlite',kind:'directory',mode:448}]);
  const bun=staged.find(member=>member.path==='solver/bun');if(!bun)throw Error('actual Bun member absent');const runtime=await construction.acquireFile(parent+'/bun',bun.bytes,bun.sha256,320,(offset,maximum)=>readOriginalStagedChunk(retention,bun.path,offset,maximum));
  const workerBytes=construction.policy.worker;const worker=await construction.acquireFile(parent+'/migration-worker.mjs',workerBytes.byteLength,construction.policy.facility.worker.sha256,320,async(offset,maximum)=>workerBytes.subarray(offset,offset+maximum));const database=await construction.acquireFile(parent+'/data/production.sqlite',0,hashBytes(''),384,async()=>Buffer.alloc(0));
  const procFailure=Error('private-proc-unreadable');const actualRead=permissionFs.readFile;readSpy=permissionSpy(permissionFs,'readFile').mockImplementation(async(path,...arguments_)=>{const child=construction.children[0];if(child&&String(path)==='/proc/'+String(child.pid)+'/status')throw procFailure;return await actualRead(path,...arguments_);});
  let preserved=false;try{await construction.runMigration('prod',control,job,database,runtime,worker,envelope);}catch(cause){preserved=cause instanceof AggregateError&&cause.cause===procFailure;}
  const before=construction.children.map(child=>({exitCode:child.exitCode,stdinClosed:child.stdin.destroyed,stdoutClosed:child.stdout.destroyed,stderrClosed:child.stderr.destroyed}));const phase=(await inspectSourceJournal(journal)).phase;const bytes=Number((await permissionFs.lstat(database.path,{bigint:true})).size);
  readSpy.mockRestore();readSpy=undefined;
  // Test-only emergency settlement follows the observation; no signal uses an observed/model PID.
  for(const child of construction.children){if(child.exitCode===null){const closing=permissionOnce(child,'close');child.stdin.end();await closing;}}
  await construction.close();return {preserved,before,phase,bytes,remaining:(await permissionFs.readdir(directory+'/coordinator')).filter(name=>name!=='source-stageb-staging')};
 }finally{readSpy?.mockRestore();try{if(construction){for(const child of construction.children){if(child.exitCode===null){const closing=permissionOnce(child,'close');child.stdin.end();await closing;}}await construction.close();}}finally{releaseOriginalStaging(retention);}}
}
`;
  const observed = await runOwnedConstructionProbe(proposed, extra);
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
  const evidence = JSON.parse(observed.stdout) as unknown;
  expect(evidence).toEqual({
    preserved: true,
    before: [{ exitCode: 1, stdinClosed: true, stdoutClosed: true, stderrClosed: true }],
    phase: 'cleanup-only',
    bytes: 0,
    remaining: [],
  });
}, 30000);

test('actual directory open failure retains unpublished mkdir as cleanup unproved', async () => {
  const proposed = await createConstructionFixture();
  const extra = `
import {SourceFixtureConstruction} from '${import.meta.dir}/source-stageb-fixture.ts';
import * as orphanFs from 'node:fs';import * as orphanAsync from 'node:fs/promises';import {spyOn as orphanSpy} from 'bun:test';
export async function runLowerConstructionProbe(inputs,artifacts,staging,journal,archive,directory){
 const retention=retainOriginalStaging(inputs,artifacts,staging,journal);let construction;let intercepted;let original;const path=directory+'/coordinator/unpublished-directory';const sibling=directory+'/coordinator/foreign-unpublished-sibling';
 try{
  construction=new SourceFixtureConstruction(inputs,artifacts,journal,retention,archive);await orphanAsync.writeFile(sibling,'foreign-inert',{mode:384});
  const actualOpen=orphanFs.openSync;intercepted=orphanSpy(orphanFs,'openSync').mockImplementation((named,...arguments_)=>{if(String(named)===path){original=orphanFs.lstatSync(path,{bigint:true});orphanFs.chmodSync(path,0);}return actualOpen(named,...arguments_);});
  let refused;try{await construction.acquireDirectory(path,448,process.geteuid(),process.getegid());}catch(cause){refused=cause.code;}
  intercepted.mockRestore();intercepted=undefined;
  let closeRefused=false;try{await construction.close();}catch{closeRefused=true;}
  const present=await orphanAsync.lstat(path,{bigint:true});const evidence={refused,closeRefused,mode:Number(present.mode&4095n),sameInode:original.dev===present.dev&&original.ino===present.ino,sibling:await orphanAsync.readFile(sibling,'utf8'),phase:(await inspectSourceJournal(journal)).phase};
  // The test owns the outer namespace and the pre-fault inode; production never receives this repair authority.
  if(original.dev!==present.dev||original.ino!==present.ino)throw Error('test orphan inode replaced');await orphanAsync.chmod(path,448);await orphanAsync.rmdir(path);return evidence;
 }finally{intercepted?.mockRestore();releaseOriginalStaging(retention);}
}
`;
  const observed = await runOwnedConstructionProbe(proposed, extra);
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
  expect(JSON.parse(observed.stdout) as unknown).toEqual({
    refused: 'EACCES',
    closeRefused: true,
    mode: 0,
    sameInode: true,
    sibling: 'foreign-inert',
    phase: 'cleanup-only',
  });
}, 30000);

test('actual parent preserves ENOENT until terminal notification and owned pipe settlement', async () => {
  const proposed = await createConstructionFixture();
  const extra = `
import {SourceFixtureConstruction} from '${import.meta.dir}/source-stageb-fixture.ts';
import {spawn as terminalSpawn} from 'node:child_process';
import * as terminalFs from 'node:fs/promises';
export async function runLowerConstructionProbe(inputs,artifacts,staging,journal,archive,directory){
 const retention=retainOriginalStaging(inputs,artifacts,staging,journal);let construction;let foreign;let originalEmit;let child;let deliverClose;let observedFailure;let primary;let evidence;const cleanup=[];const reads=[];
 try{
  construction=new SourceFixtureConstruction(inputs,artifacts,journal,retention,archive);
  const parent=directory+'/coordinator/terminal-owned';const sibling=directory+'/coordinator/terminal-foreign';
  const scope=await construction.acquireDirectory(parent,448,process.geteuid(),process.getegid());await construction.populateDirectory(scope,[]);
  await terminalFs.writeFile(sibling,'foreign-terminal-sentinel',{mode:384});foreign=await terminalFs.open(sibling,'r');const foreignBefore=await foreign.stat({bigint:true});
  const captured=Promise.withResolvers();const osErrors=[];
  child=terminalSpawn(parent+'/nonexistent-owned-program',[],{cwd:parent,env:{WBS_ENV:'dev',TMPDIR:directory},stdio:['pipe','pipe','pipe']});
  originalEmit=child.emit.bind(child);child.emit=(event,...arguments_)=>{if(event==='close'){deliverClose=()=>{deliverClose=undefined;return originalEmit(event,...arguments_);};captured.resolve();return true;}return originalEmit(event,...arguments_);};
  child.on('error',cause=>osErrors.push(cause));child.stdin.on('error',cause=>cleanup.push(cause));
  const original=construction.trackNativeChild(child,'migration',false,[parent+'/nonexistent-owned-program']);
  const drain=async stream=>{const chunks=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks);};
  original.stdout=drain(child.stdout);original.stderr=drain(child.stderr);reads.push(original.stdout,original.stderr);for(const read of reads)void read.catch(()=>undefined);
  child.stdin.end();await captured.promise;
  let settled=false;const closing=construction.close();void closing.then(()=>{settled=true;},()=>{settled=true;});
  await Bun.sleep(30);const before=await terminalFs.lstat(parent,{bigint:true});const foreignHeld=await foreign.stat({bigint:true});
  const beforeClose={settled,directoryOriginal:before.dev===scope.identity.dev&&before.ino===scope.identity.ino,foreignOriginal:foreignHeld.dev===foreignBefore.dev&&foreignHeld.ino===foreignBefore.ino};
  if(deliverClose===undefined)throw Error('actual terminal notification absent');deliverClose();
  try{await closing;}catch(cause){observedFailure=cause;}
  const streams=await Promise.allSettled(reads);const pipeErrors=streams.filter(stream=>stream.status==='rejected').map(stream=>stream.reason);for(const failure of pipeErrors)if(failure?.code!=='ERR_STREAM_PREMATURE_CLOSE')throw failure;
  let absent=false;try{await terminalFs.lstat(parent);}catch(cause){if(cause?.code!=='ENOENT')throw cause;absent=true;}
  const after=await foreign.stat({bigint:true});evidence={beforeClose,errorCode:osErrors[0]?.code,errorRetained:observedFailure instanceof AggregateError&&observedFailure.errors.includes(osErrors[0]),pipeErrorCodes:pipeErrors.map(failure=>failure.code),pipeErrorsRetained:observedFailure instanceof AggregateError&&pipeErrors.every(failure=>observedFailure.errors.includes(failure)),directoryAbsent:absent,pipesClosed:child.stdin.destroyed&&child.stdout.destroyed&&child.stderr.destroyed,foreignOriginal:after.dev===foreignBefore.dev&&after.ino===foreignBefore.ino,foreignContents:await terminalFs.readFile(sibling,'utf8'),closeMemoized:construction.close()===closing};
 }catch(cause){primary=cause;}finally{
  if(deliverClose!==undefined)deliverClose();
  for(const read of await Promise.allSettled(reads))if(read.status==='rejected'&&read.reason?.code!=='ERR_STREAM_PREMATURE_CLOSE')cleanup.push(read.reason);
  if(child!==undefined&&originalEmit!==undefined)child.emit=originalEmit;
  if(construction!==undefined)try{await construction.close();}catch(cause){if(cause!==observedFailure)cleanup.push(cause);}
  if(foreign!==undefined)try{await foreign.close();}catch(cause){cleanup.push(cause);}
  releaseOriginalStaging(retention);
 }
 if(primary!==undefined||cleanup.length)throw new AggregateError(primary===undefined?cleanup:[primary,...cleanup],'actual terminal probe failed',{cause:primary});
 return evidence;
}
`;
  const observed = await runOwnedConstructionProbe(proposed, extra);
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
  console.info('source-b2 terminal evidence', observed.stdout);
  expect(JSON.parse(observed.stdout) as unknown).toEqual({
    beforeClose: { settled: false, directoryOriginal: true, foreignOriginal: true },
    errorCode: 'ENOENT',
    errorRetained: true,
    pipeErrorCodes: ['ERR_STREAM_PREMATURE_CLOSE', 'ERR_STREAM_PREMATURE_CLOSE'],
    pipeErrorsRetained: true,
    directoryAbsent: true,
    pipesClosed: true,
    foreignOriginal: true,
    foreignContents: 'foreign-terminal-sentinel',
    closeMemoized: true,
  });
}, 30000);

test('actual settlement waits for original terminal callback after pipe settlement', async () => {
  const proposed = await createConstructionFixture();
  const extra = `
import {SourceFixtureConstruction} from '${import.meta.dir}/source-stageb-fixture.ts';
import {spawn as terminalSpawn} from 'node:child_process';
import * as terminalFs from 'node:fs/promises';
export async function runLowerConstructionProbe(inputs,artifacts,staging,journal,archive,directory){
 const retention=retainOriginalStaging(inputs,artifacts,staging,journal);let construction;let foreign;let originalOnce;let child;let deliverClose;let actualClose;let waiting;let observedFailure;let primary;let evidence;const cleanup=[];const reads=[];
 try{
  construction=new SourceFixtureConstruction(inputs,artifacts,journal,retention,archive);
  const parent=directory+'/coordinator/terminal-owned';const sibling=directory+'/coordinator/terminal-foreign';
  const scope=await construction.acquireDirectory(parent,448,process.geteuid(),process.getegid());await construction.populateDirectory(scope,[]);
  await terminalFs.writeFile(sibling,'foreign-terminal-sentinel',{mode:384});foreign=await terminalFs.open(sibling,'r');const foreignBefore=await foreign.stat({bigint:true});
  const captured=Promise.withResolvers();actualClose=Promise.withResolvers();const osErrors=[];let closeRegistrations=0;let callbackDeliveries=0;
  child=terminalSpawn(parent+'/nonexistent-owned-program',[],{cwd:parent,env:{WBS_ENV:'dev',TMPDIR:directory},stdio:['pipe','pipe','pipe']});
  child.once('close',(code,signal)=>actualClose.resolve({code,signal}));
  originalOnce=child.once;child.once=function(event,listener){if(event!=='close')return originalOnce.call(this,event,listener);closeRegistrations++;return originalOnce.call(this,event,(...arguments_)=>{deliverClose=()=>{if(callbackDeliveries!==0)throw Error('production terminal callback repeated');callbackDeliveries++;deliverClose=undefined;return listener.apply(child,arguments_);};captured.resolve();});};
  child.on('error',cause=>osErrors.push(cause));child.stdin.on('error',cause=>cleanup.push(cause));
  let original;try{original=construction.trackNativeChild(child,'migration',false,[parent+'/nonexistent-owned-program']);}finally{child.once=originalOnce;}if(closeRegistrations!==1)throw Error('expected one original production close registration');
  const drain=async stream=>{const chunks=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks);};
  original.stdout=drain(child.stdout);original.stderr=drain(child.stderr);reads.push(original.stdout,original.stderr);for(const read of reads)void read.catch(()=>undefined);
  child.stdin.end();await captured.promise;const actualStatus=await actualClose.promise;
  let preparationTimer;let streams;const preparationRemaining=Math.min(1000,original.cutoff-performance.now());if(preparationRemaining<=0)throw Error('original cutoff already expired');try{streams=await Promise.race([Promise.allSettled(reads),new Promise((resolve,reject)=>{preparationTimer=setTimeout(()=>reject(Error('original drain preparation inconclusive')),preparationRemaining);})]);}finally{if(preparationTimer!==undefined)clearTimeout(preparationTimer);}
  const pipeErrors=streams.filter(stream=>stream.status==='rejected').map(stream=>stream.reason);for(const failure of pipeErrors)if(failure?.code!=='ERR_STREAM_PREMATURE_CLOSE')throw failure;
  let settled=false;waiting=construction.settleNativeChild(original);void waiting.then(()=>{settled=true;},()=>{settled=true;});
  await Bun.sleep(30);const before=await terminalFs.lstat(parent,{bigint:true});const foreignHeld=await foreign.stat({bigint:true});
  const beforeClose={settled,phase:original.phase,statusAbsent:original.status===undefined,drainsSettled:streams.length===2,actualCloseObserved:actualStatus!==undefined,directoryOriginal:before.dev===scope.identity.dev&&before.ino===scope.identity.ino,foreignOriginal:foreignHeld.dev===foreignBefore.dev&&foreignHeld.ino===foreignBefore.ino};
  if(deliverClose===undefined)throw Error('actual terminal notification absent');deliverClose();
  await original.closed;await waiting;const closing=construction.close();try{await closing;}catch(cause){observedFailure=cause;}
  let absent=false;try{await terminalFs.lstat(parent);}catch(cause){if(cause?.code!=='ENOENT')throw cause;absent=true;}
  const after=await foreign.stat({bigint:true});evidence={beforeClose,errorCode:osErrors[0]?.code,errorRetained:observedFailure instanceof AggregateError&&observedFailure.errors.includes(osErrors[0]),pipeErrorCodes:pipeErrors.map(failure=>failure.code),pipeErrorsRetained:observedFailure instanceof AggregateError&&pipeErrors.every(failure=>observedFailure.errors.includes(failure)),directoryAbsent:absent,pipesClosed:child.stdin.destroyed&&child.stdout.destroyed&&child.stderr.destroyed,foreignOriginal:after.dev===foreignBefore.dev&&after.ino===foreignBefore.ino,foreignContents:await terminalFs.readFile(sibling,'utf8'),closeMemoized:construction.close()===closing,callbackDeliveries};
 }catch(cause){primary=cause;}finally{
  if(deliverClose!==undefined)deliverClose();
  for(const read of await Promise.allSettled(reads))if(read.status==='rejected'&&read.reason?.code!=='ERR_STREAM_PREMATURE_CLOSE')cleanup.push(read.reason);
  if(child!==undefined&&originalOnce!==undefined)child.once=originalOnce;if(actualClose!==undefined)await actualClose.promise;if(waiting!==undefined)await waiting;
  if(construction!==undefined)try{await construction.close();}catch(cause){if(cause!==observedFailure)cleanup.push(cause);}
  if(foreign!==undefined)try{await foreign.close();}catch(cause){cleanup.push(cause);}
  releaseOriginalStaging(retention);
 }
 if(primary!==undefined||cleanup.length)throw new AggregateError(primary===undefined?cleanup:[primary,...cleanup],'actual terminal probe failed',{cause:primary});
 return evidence;
}
`;

  const observed = await runOwnedConstructionProbe(proposed, extra);
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
  console.info('source-b2 terminal evidence', observed.stdout);
  expect(JSON.parse(observed.stdout) as unknown).toEqual({
    beforeClose: {
      settled: false,
      phase: 'open',
      statusAbsent: true,
      drainsSettled: true,
      actualCloseObserved: true,
      directoryOriginal: true,
      foreignOriginal: true,
    },
    errorCode: 'ENOENT',
    errorRetained: true,
    pipeErrorCodes: ['ERR_STREAM_PREMATURE_CLOSE', 'ERR_STREAM_PREMATURE_CLOSE'],
    pipeErrorsRetained: true,
    directoryAbsent: true,
    pipesClosed: true,
    foreignOriginal: true,
    foreignContents: 'foreign-terminal-sentinel',
    closeMemoized: true,
    callbackDeliveries: 1,
  });
}, 30000);

test('actual parent waits for original inert Bun stdin child before removing owned cwd', async () => {
  const proposed = await createConstructionFixture();
  const extra = `
import {SourceFixtureConstruction} from '${import.meta.dir}/source-stageb-fixture.ts';
import {spawn as liveSpawn} from 'node:child_process';
import * as liveFs from 'node:fs/promises';
export async function runLowerConstructionProbe(inputs,artifacts,staging,journal,archive,directory){
 const retention=retainOriginalStaging(inputs,artifacts,staging,journal);let construction;let child;let foreign;let executable;let primary;let evidence;const cleanup=[];const reads=[];const closed=Promise.withResolvers();
 try{
  construction=new SourceFixtureConstruction(inputs,artifacts,journal,retention,archive);
  const parent=directory+'/coordinator/native-live-owned';const sibling=directory+'/coordinator/native-live-foreign';
  const scope=await construction.acquireDirectory(parent,448,process.geteuid(),process.getegid());await construction.populateDirectory(scope,[]);
  await liveFs.writeFile(sibling,'foreign-live-sentinel',{mode:384});foreign=await liveFs.open(sibling,'r');const foreignBefore=await foreign.stat({bigint:true});
  const pin=inspectOriginalStaging(retention).members.find(member=>member.path==='solver/bun');if(pin?.sha256===undefined||pin.bytes===undefined)throw Error('original trusted Bun pin absent');
  const program=process.execPath;const runtimeIdentity=await liveFs.lstat(program,{bigint:true});const runtimeHash=hashBytes(await liveFs.readFile(program));if(!runtimeIdentity.isFile()||runtimeHash!==pin.sha256||runtimeIdentity.size!==BigInt(pin.bytes))throw Error('actual current Bun differs from original I');
  const command=[program,'--no-env-file','-e','await Bun.stdin.text()'];const environment={WBS_ENV:'dev',TMPDIR:parent};const spawned=Promise.withResolvers();const childErrors=[];
  child=liveSpawn(command[0],command.slice(1),{cwd:parent,env:environment,stdio:['pipe','pipe','pipe']});
  child.once('close',(code,signal)=>closed.resolve({code,signal}));child.once('spawn',()=>spawned.resolve());child.on('error',cause=>{childErrors.push(cause);spawned.reject(cause);});child.stdin.on('error',cause=>childErrors.push(cause));
  const original=construction.trackNativeChild(child,'migration',false,command);
  const drain=async stream=>{const chunks=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks);};original.stdout=drain(child.stdout);original.stderr=drain(child.stderr);reads.push(original.stdout,original.stderr);for(const read of reads)void read.catch(()=>undefined);
  await spawned.promise;const identity=await construction.observeChild(child,{identity:runtimeIdentity,bytes:pin.bytes,sha256:pin.sha256});original.liveIdentity=identity;
  const proc='/proc/'+String(child.pid);const statStart=text=>text.slice(text.lastIndexOf(') ')+2).trimEnd().split(' ')[19];const start=statStart(await liveFs.readFile(proc+'/stat','utf8'));if(start!==identity.start)throw Error('actual child start differs');
  executable=await liveFs.open(proc+'/exe','r');const kernelIdentity=await executable.stat({bigint:true});const executableHash=hashBytes(await executable.readFile());await executable.close();executable=undefined;
  if(kernelIdentity.dev!==runtimeIdentity.dev||kernelIdentity.ino!==runtimeIdentity.ino||executableHash!==pin.sha256)throw Error('actual child executable differs');
  const observedEnvironment=(await liveFs.readFile(proc+'/environ')).toString().split('\\0').filter(Boolean).sort();if(JSON.stringify(observedEnvironment)!==JSON.stringify(['TMPDIR='+parent,'WBS_ENV=dev'].sort()))throw Error('actual inert child environment differs');
  const cwd=await liveFs.readlink(proc+'/cwd');if(cwd!==parent)throw Error('actual child cwd differs');
  let settled=false;const closing=construction.close();void closing.then(()=>{settled=true;},()=>{settled=true;});await Bun.sleep(30);
  const before=await liveFs.lstat(parent,{bigint:true});const foreignHeld=await foreign.stat({bigint:true});const currentStart=statStart(await liveFs.readFile(proc+'/stat','utf8'));
  const beforeClose={settled,directoryOriginal:before.dev===scope.identity.dev&&before.ino===scope.identity.ino,foreignOriginal:foreignHeld.dev===foreignBefore.dev&&foreignHeld.ino===foreignBefore.ino,originalChildLive:child.exitCode===null&&child.signalCode===null&&currentStart===start};
  child.stdin.end();const status=await closed.promise;await closing;const outputs=await Promise.all(reads);if(childErrors.length)throw new AggregateError(childErrors,'actual inert child error');
  let absent=false;try{await liveFs.lstat(parent);}catch(cause){if(cause?.code!=='ENOENT')throw cause;absent=true;}
  const after=await foreign.stat({bigint:true});evidence={beforeClose,pid:child.pid,start,command:child.spawnargs,environment,cwd,executableSha256:executableHash,runtimeSha256:runtimeHash,executableDevice:String(kernelIdentity.dev),executableInode:String(kernelIdentity.ino),status,stdoutBytes:outputs[0].length,stderrBytes:outputs[1].length,directoryAbsent:absent,pipesClosed:child.stdin.destroyed&&child.stdout.destroyed&&child.stderr.destroyed,foreignOriginal:after.dev===foreignBefore.dev&&after.ino===foreignBefore.ino,foreignContents:await liveFs.readFile(sibling,'utf8'),closeMemoized:construction.close()===closing};
 }catch(cause){primary=cause;}finally{
  if(child!==undefined){if(!child.stdin.destroyed&&!child.stdin.writableEnded)child.stdin.end();await closed.promise;}
  for(const read of await Promise.allSettled(reads))if(read.status==='rejected')cleanup.push(read.reason);
  if(executable!==undefined)try{await executable.close();}catch(cause){cleanup.push(cause);}
  if(construction!==undefined)try{await construction.close();}catch(cause){cleanup.push(cause);}
  if(foreign!==undefined)try{await foreign.close();}catch(cause){cleanup.push(cause);}
  releaseOriginalStaging(retention);
 }
 if(primary!==undefined||cleanup.length)throw new AggregateError(primary===undefined?cleanup:[primary,...cleanup],'actual inert child probe failed',{cause:primary});
 return evidence;
}
`;
  const observed = await runOwnedConstructionProbe(proposed, extra);
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
  const evidence = JSON.parse(observed.stdout) as {
    beforeClose: unknown;
    pid: number;
    start: string;
    command: string[];
    environment: unknown;
    cwd: string;
    executableSha256: string;
    runtimeSha256: string;
    status: unknown;
    stdoutBytes: number;
    stderrBytes: number;
    directoryAbsent: boolean;
    pipesClosed: boolean;
    foreignOriginal: boolean;
    foreignContents: string;
    closeMemoized: boolean;
  };
  process.stdout.write('source-b2 inert-child evidence ' + observed.stdout + '\n');
  expect(evidence.beforeClose).toEqual({
    settled: false,
    directoryOriginal: true,
    foreignOriginal: true,
    originalChildLive: true,
  });
  expect(evidence.pid).toBeGreaterThan(0);
  expect(evidence.start).toMatch(/^[1-9][0-9]*$/);
  expect(evidence.command).toEqual([
    process.execPath,
    '--no-env-file',
    '-e',
    'await Bun.stdin.text()',
  ]);
  expect(evidence.environment).toEqual({
    WBS_ENV: 'dev',
    TMPDIR: proposed.directory + '/coordinator/native-live-owned',
  });
  expect(evidence.cwd).toBe(proposed.directory + '/coordinator/native-live-owned');
  expect(evidence.executableSha256).toBe(evidence.runtimeSha256);
  expect(evidence.status).toEqual({ code: 0, signal: null });
  expect([evidence.stdoutBytes, evidence.stderrBytes]).toEqual([0, 0]);
  expect(evidence.directoryAbsent).toBe(true);
  expect(evidence.pipesClosed).toBe(true);
  expect(evidence.foreignOriginal).toBe(true);
  expect(evidence.foreignContents).toBe('foreign-live-sentinel');
  expect(evidence.closeMemoized).toBe(true);
}, 30000);

interface OriginalLifetimePacket {
  readonly directory: string;
  readonly clockPath: string;
  readonly enclosingDurationNs: string;
  readonly controls: readonly {
    readonly name: string;
    readonly entry: string;
    readonly sha256: string;
    readonly expected: 'normal-cleanup' | 'retained-emergency';
  }[];
}
import type { ChildProcess as OriginalControlProcess } from 'node:child_process';
import type { Readable as OriginalControlStream } from 'node:stream';

import type { Node as OriginalControlNode } from 'typescript';

interface OriginalControlRead {
  readonly eof: boolean;
  readonly bytes: number;
  readonly captured: Buffer;
  readonly failure?: unknown;
}
interface OriginalControlTerminal {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}
interface OriginalControlJoin {
  readonly joined: boolean;
  readonly terminal?: OriginalControlTerminal;
  readonly stdout?: OriginalControlRead;
  readonly stderr?: OriginalControlRead;
  readonly failures: readonly unknown[];
}

/** Owns one original child/reader pair; errors and bounded cancellation never substitute for actual close and EOF. */
class OriginalControlChild {
  readonly failures: unknown[] = [];
  readonly closed: Promise<OriginalControlTerminal>;
  readonly stdout: Promise<OriginalControlRead>;
  readonly stderr: Promise<OriginalControlRead>;
  readonly terminal = { observed: false };
  private readonly settled: Promise<OriginalControlJoin>;
  private cancellation: ReturnType<typeof setTimeout> | undefined;
  constructor(
    readonly child: OriginalControlProcess,
    readonly readClock: () => bigint,
    readonly cutoff: bigint,
    readonly cancelAt: bigint,
    readonly expired: Promise<void>,
    readonly references: unknown[],
    readonly onFailure: (failure: unknown) => void,
    readonly onOutput?: (chunk: Uint8Array) => void,
    readonly passive = false,
    readonly permitCancel?: () => boolean,
  ) {
    references.push(this, child, child.stdin, child.stdout, child.stderr, this.failures);
    this.closed = new Promise((resolve) => {
      child.once('close', (code, signal) => {
        this.terminal.observed = true;
        resolve({ code, signal });
      });
      child.once('error', (failure: unknown) => {
        this.record(failure);
        this.cancel();
      });
    });
    this.stdout = passive ? this.observe(child.stdout) : this.drain(child.stdout, 65536, onOutput);
    this.stderr = passive ? this.observe(child.stderr) : this.drain(child.stderr, 8192);
    child.stdin?.on('error', (failure: unknown) => {
      this.record(failure);
      this.cancel();
    });
    // Proof: held-reader wait omission produced HELD_READER_OUTCOME_MUST_WAIT RED;
    // custody receipts01/02 show independent close/both EOF, recovered readers and exact restoration.
    this.settled = Promise.all([this.closed, this.stdout, this.stderr]).then(
      ([terminal, stdout, stderr]) => ({
        joined: stdout.eof && stderr.eof,
        terminal,
        stdout,
        stderr,
        failures: this.failures,
      }),
    );
    references.push(this.closed, this.stdout, this.stderr, this.settled);
    try {
      const remaining = Number((cancelAt - readClock()) / 1000000n);
      if (remaining <= 0) {
        this.record(Error('original child cancellation reserve exhausted'));
        this.cancel();
      } else
        this.cancellation = setTimeout(() => {
          this.record(Error('original child cancellation reserve reached'));
          this.cancel();
        }, remaining);
    } catch (failure) {
      this.record(failure);
      this.cancel();
    }
  }
  record(failure: unknown): void {
    this.failures.push(failure);
    this.onFailure(failure);
  }
  cancel(): void {
    if (this.terminal.observed) return;
    try {
      if (this.permitCancel !== undefined && !this.permitCancel()) {
        // Proof: rearm omission produced RESERVE_CANCEL_BEFORE_ORIGINAL_CUTOFF RED;
        // reserve receipts05/06/07 prove denied/accepted retry, independent teardown and exact restoration.
        this.deferCancellation();
        return;
      }
      // Proof: original-cancel omission produced ORIGINAL_CANCEL_CALL_REQUIRED RED;
      // custody receipts03/04 joined the independent original kill/both EOF, then exact restoration.
      if (!this.child.kill('SIGKILL')) this.record(Error('original child cancellation refused'));
    } catch (failure) {
      this.record(failure);
    }
  }
  /** An early reserve timer must leave another attempt pending inside the same original cutoff. */
  private deferCancellation(): void {
    const now = this.readClock();
    if (now >= this.cutoff) {
      this.record(Error('original deferred cancellation unproved at immutable cutoff'));
      return;
    }
    const reserve = this.cancelAt > now ? this.cancelAt - now : 1_000_000n;
    const remaining = reserve < this.cutoff - now ? reserve : this.cutoff - now;
    if (this.cancellation !== undefined) clearTimeout(this.cancellation);
    this.cancellation = setTimeout(
      () => {
        try {
          if (this.readClock() >= this.cutoff)
            this.record(Error('original deferred cancellation unproved at immutable cutoff'));
          else this.cancel();
        } catch (failure) {
          this.record(failure);
        }
      },
      Number((remaining + 999_999n) / 1_000_000n),
    );
  }
  continueDiscard(): void {
    this.child.stdout?.resume();
    this.child.stderr?.resume();
  }
  private observe(stream: OriginalControlStream | null): Promise<OriginalControlRead> {
    if (stream === null) {
      const failure = Error('original passive pipe absent');
      this.record(failure);
      this.cancel();
      return Promise.resolve({ eof: false, bytes: 0, captured: Buffer.alloc(0), failure });
    }
    return new Promise((resolve) => {
      let ended = false;
      let failure: unknown;
      stream.once('end', () => {
        ended = true;
        resolve({ eof: true, bytes: 0, captured: Buffer.alloc(0), failure });
      });
      stream.once('error', (cause: unknown) => {
        failure = cause;
        this.record(cause);
        this.cancel();
        this.continueDiscard();
      });
      stream.once('close', () => {
        if (!ended) resolve({ eof: false, bytes: 0, captured: Buffer.alloc(0), failure });
      });
    });
  }
  private async drain(
    stream: OriginalControlStream | null,
    maximum: number,
    observe?: (chunk: Uint8Array) => void,
  ): Promise<OriginalControlRead> {
    let bytes = 0;
    let captured = Buffer.alloc(0);
    let overflowed = false;
    if (stream === null) {
      const failure = Error('original child reader absent');
      this.record(failure);
      this.cancel();
      return { eof: false, bytes, captured, failure };
    }
    try {
      for await (const chunk of stream) {
        if (!(chunk instanceof Uint8Array)) {
          this.record(Error('original child reader chunk refused'));
          this.cancel();
          continue;
        }
        bytes += chunk.byteLength;
        const available = maximum - captured.byteLength;
        if (available > 0) {
          const admitted = chunk.subarray(0, available);
          captured = Buffer.concat([captured, Buffer.from(admitted)]);
          if (observe !== undefined)
            try {
              observe(admitted);
            } catch (failure) {
              this.record(failure);
              this.cancel();
            }
        }
        if (bytes > maximum && !overflowed) {
          overflowed = true;
          this.record(Error('original child output bound exceeded'));
          this.cancel();
        }
      }
      return { eof: true, bytes, captured };
    } catch (failure) {
      this.record(failure);
      this.cancel();
      return { eof: false, bytes, captured, failure };
    }
  }
  async join(): Promise<OriginalControlJoin> {
    const joined = await Promise.race([this.settled, this.expired.then(() => undefined)]);
    if (joined !== undefined) {
      if (this.cancellation !== undefined) clearTimeout(this.cancellation);
      return joined;
    }
    this.cancel();
    return {
      joined: false,
      failures: [...this.failures, Error('original child close/EOF unproved at immutable cutoff')],
    };
  }
}

interface OriginalControlScope {
  readonly references: unknown[];
  readonly failures: unknown[];
  readonly readClock: () => bigint;
  readonly cutoff: bigint;
  readonly expired: Promise<void>;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly roots: string[];
  readonly children: OriginalControlChild[];
  readonly failed: Promise<unknown>;
  fail(failure: unknown): void;
}
function checkOriginalControlScope(scope: OriginalControlScope, reserveNs = 2_000_000_000n): void {
  if (scope.failures.length > 0)
    throw new AggregateError(scope.failures, 'original control scope has failed');
  if (scope.readClock() >= scope.cutoff - reserveNs)
    throw Error('original control original remainder insufficient');
}
function createOriginalControlScope(readClock: () => bigint): OriginalControlScope {
  const cutoff = readClock() + 90_000_000_000n;
  if (cutoff > 9223372036854775807n) throw Error('original control cutoff arithmetic refused');
  const expiry = Promise.withResolvers<undefined>();
  const failed = Promise.withResolvers<unknown>();
  const failures: unknown[] = [];
  const references: unknown[] = [];
  const roots: string[] = [];
  const children: OriginalControlChild[] = [];
  const timer = setTimeout(
    () => {
      failures.push(Error('original control immutable cutoff reached'));
      for (const child of children) child.cancel();
      expiry.resolve(undefined);
    },
    Number((cutoff - readClock()) / 1000000n),
  );
  const scope: OriginalControlScope = {
    references,
    failures,
    readClock,
    cutoff,
    expired: expiry.promise,
    timer,
    roots,
    children,
    failed: failed.promise,
    fail(failure) {
      failures.push(failure);
      failed.resolve(failure);
    },
  };
  references.push(scope, failures, roots, children, expiry, failed, timer);
  return scope;
}

interface OriginalReviewedRecipe {
  readonly format: 'original-lifetime-reviewed-recipe';
  readonly version: 1;
  readonly sources: readonly { readonly path: string; readonly sha256: string }[];
  readonly loaded: readonly { readonly path: string; readonly sha256: string }[];
  readonly imports: readonly string[];
  readonly git: { readonly path: string; readonly sha256: string; readonly bytes: number };
  readonly runtime: { readonly path: string; readonly sha256: string; readonly bytes: number };
  readonly adapters: Readonly<Record<'child' | 'git' | 'entry' | 'inert', string>>;
  readonly dynamicFields: readonly string[];
}
async function readOriginalReviewedRecipe(): Promise<OriginalReviewedRecipe> {
  const fs = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const path = process.env['PUNI_ORIGINAL_LIFETIME_RECIPE'];
  const expected = process.env['PUNI_ORIGINAL_LIFETIME_RECIPE_SHA256'];
  if (path === undefined || expected === undefined || !/^[a-f0-9]{64}$/.test(expected))
    throw Error('reviewed original recipe binding absent');
  const bytes = await fs.readFile(path);
  if (createHash('sha256').update(bytes).digest('hex') !== expected)
    throw Error('reviewed original recipe bytes differ');
  const record = (value: unknown, fields: readonly string[]): Record<string, unknown> => {
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())
    )
      throw Error('reviewed original recipe fields differ');
    return value as Record<string, unknown>;
  };
  const readHash = (value: unknown): string => {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
      throw Error('reviewed original hash refused');
    return value;
  };
  const pins = (value: unknown): readonly { path: string; sha256: string }[] => {
    if (!Array.isArray(value)) throw Error('reviewed original source pins absent');
    return value.map((value: unknown) => {
      const pin = record(value, ['path', 'sha256']);
      const path = pin['path'];
      if (typeof path !== 'string' || (!path.startsWith('/') && path !== '@clock'))
        throw Error('reviewed source path refused');
      return { path, sha256: readHash(pin['sha256']) };
    });
  };
  const strings = (value: unknown): readonly string[] => {
    if (!Array.isArray(value)) throw Error('reviewed original string list absent');
    return value.map((value: unknown) => {
      if (typeof value !== 'string') throw Error('reviewed original string refused');
      return value;
    });
  };
  const executable = (value: unknown) => {
    const pin = record(value, ['path', 'sha256', 'bytes']);
    const path = pin['path'];
    const bytes = pin['bytes'];
    if (
      typeof path !== 'string' ||
      !path.startsWith('/') ||
      typeof bytes !== 'number' ||
      !Number.isSafeInteger(bytes) ||
      bytes < 1
    )
      throw Error('reviewed executable pin refused');
    return { path, bytes, sha256: readHash(pin['sha256']) };
  };
  const candidate = record(JSON.parse(bytes.toString()) as unknown, [
    'adapters',
    'dynamicFields',
    'format',
    'git',
    'imports',
    'loaded',
    'runtime',
    'sources',
    'version',
  ]);
  if (candidate['format'] !== 'original-lifetime-reviewed-recipe' || candidate['version'] !== 1)
    throw Error('reviewed original recipe format refused');
  const adapters = record(candidate['adapters'], ['child', 'git', 'entry', 'inert']);
  const recipe: OriginalReviewedRecipe = {
    format: 'original-lifetime-reviewed-recipe',
    version: 1,
    sources: pins(candidate['sources']),
    loaded: pins(candidate['loaded']),
    imports: strings(candidate['imports']),
    git: executable(candidate['git']),
    runtime: executable(candidate['runtime']),
    adapters: {
      child: readHash(adapters['child']),
      git: readHash(adapters['git']),
      entry: readHash(adapters['entry']),
      inert: readHash(adapters['inert']),
    },
    dynamicFields: strings(candidate['dynamicFields']),
  };
  if (
    recipe.git.path !== '/usr/bin/git' ||
    JSON.stringify(recipe.dynamicFields) !==
      JSON.stringify([
        'own-roots-and-inodes',
        'initial-review-times',
        'own-source-commit',
        'derived-artifact-hashes',
      ])
  )
    throw Error('reviewed original dynamic recipe fields differ');
  for (const pin of recipe.sources)
    if (
      createHash('sha256')
        .update(await fs.readFile(pin.path))
        .digest('hex') !== pin.sha256
    )
      throw Error('reviewed original source drift: ' + pin.path);
  const runtime = await fs.readFile(process.execPath);
  if (
    recipe.runtime.path !== process.execPath ||
    recipe.runtime.bytes !== runtime.byteLength ||
    createHash('sha256').update(runtime).digest('hex') !== recipe.runtime.sha256
  )
    throw Error('reviewed original compiler/runtime executable differs');
  const canonical = new Bun.Transpiler({ loader: 'js', target: 'bun' });
  const adapterSources = {
    child: canonical.transformSync(OriginalControlChild.toString()),
    git: canonical.transformSync(createOriginalPreparerGitSource.toString()),
    entry: canonical.transformSync(createOriginalLifetimeEntry.toString()),
    inert: originalLifetimeInertSource,
  };
  if (
    JSON.stringify(Object.keys(recipe.adapters).sort()) !==
    JSON.stringify(['child', 'entry', 'git', 'inert'])
  )
    throw Error('reviewed adapter fields differ');
  for (const [name, source] of Object.entries(adapterSources))
    if (
      createHash('sha256').update(source).digest('hex') !==
      recipe.adapters[name as keyof typeof recipe.adapters]
    )
      throw Error('reviewed original adapter drift: ' + name);
  if (!recipe.sources.some((pin) => pin.path === import.meta.path))
    throw Error('reviewed recipe omits actual control owner');
  return recipe;
}

function createOriginalPreparerGitSource(cutoff: bigint, recipe: OriginalReviewedRecipe): string {
  return `
import * as fs from 'node:fs/promises';import * as sync from 'node:fs';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';import {spyOn} from 'original-preparer:test';import {readMonotonicNs} from 'original-preparer:clock';
${OriginalControlChild.toString()}
const cutoff=${String(cutoff)}n;const expiry=Promise.withResolvers();const failures=[];const references=[];const children=[];const roots=[];let root;let prepared;let constructorRoot;let rootIdentity;let preparedIdentity;let gitIdentity;let configBytes;let configIdentity;let calls=0;let fixtureSettled=false;let captureRestored=false;const captures=[];
const timer=setTimeout(()=>{fail(Error('original preparation immutable cutoff'));for(const child of children)child.cancel();expiry.resolve();},Math.max(0,Number((cutoff-readMonotonicNs())/1000000n)));
function fail(cause){failures.push(cause);}
function check(){if(failures.length)throw new AggregateError(failures,'original preparation retained failure');if(readMonotonicNs()>=cutoff-2000000000n)throw Error('original preparation cancellation reserve exhausted');}
function same(actual,expected){for(const field of ['dev','ino','mode','uid','gid'])if(actual[field]!==expected[field])throw Error('original preparation inode ownership drift');}
const native={mkdtemp:fs.mkdtemp,mkdir:fs.mkdir,open:fs.open,lstat:fs.lstat,realpath:fs.realpath,readFile:fs.readFile,readdir:fs.readdir};
async function retainDirectory(path){const file=await native.open(path,sync.constants.O_RDONLY|sync.constants.O_DIRECTORY|sync.constants.O_NOFOLLOW);references.push(file);const identity=await file.stat({bigint:true});if(!identity.isDirectory()||(identity.mode&4095n)!==448n||identity.uid!==BigInt(process.geteuid())||identity.gid!==BigInt(process.getegid())||await native.realpath(path)!==path)throw Error('original preparation fresh directory refused');return identity;}
export function installCapture(){check();captures.push(spyOn(fs,'mkdtemp').mockImplementation(async(prefix,...args)=>{check();if(!((prefix==='/tmp/puni-b1-'&&root===undefined)||(root!==undefined&&prefix===root+'/constructor-'&&constructorRoot===undefined)))throw Error('foreign/repeated fixture mkdtemp refused');const path=await native.mkdtemp(prefix,...args);roots.push(path);references.push(path);if(prefix==='/tmp/puni-b1-'){if(root!==undefined)throw Error('second source fixture root refused');root=path;rootIdentity=await retainDirectory(path);if((await native.readdir(path)).length!==0)throw Error('source fixture root not fresh');}else{constructorRoot=path;await retainDirectory(path);}return path;}));
for(const operation of ['mkdir','writeFile','chmod','copyFile','symlink']){const actual=fs[operation];captures.push(spyOn(fs,operation).mockImplementation(async(...args)=>{check();const destination=args[operation==='copyFile'||operation==='symlink'?1:0];if(typeof destination!=='string'||root===undefined||!(destination===root||destination.startsWith(root+'/')))throw Error('foreign fixture write refused');const value=await actual(...args);if(operation==='mkdir'&&root!==undefined&&args[0]===root+'/prepared'){if(prepared!==undefined)throw Error('second prepared directory refused');prepared=args[0];preparedIdentity=await retainDirectory(prepared);}return value;}));}references.push(captures);}
async function assertTree(path){for(const name of await native.readdir(path)){const member=path+'/'+name;const identity=await native.lstat(member,{bigint:true});if(identity.isSymbolicLink()||identity.uid!==BigInt(process.geteuid())||identity.gid!==BigInt(process.getegid()))throw Error('original Git repository member ownership refused');if(identity.isDirectory())await assertTree(member);}}
async function assertRepository(){if(root===undefined||prepared===undefined||rootIdentity===undefined||preparedIdentity===undefined)throw Error('actual fresh Git root acquisition absent');same(await native.lstat(root,{bigint:true}),rootIdentity);same(await native.lstat(prepared,{bigint:true}),preparedIdentity);if(await native.realpath(prepared)!==prepared)throw Error('original prepared canonical path drift');if(calls===0){try{await native.lstat(prepared+'/.git');throw Error('original Git repository not fresh');}catch(cause){if(cause?.code!=='ENOENT')throw cause;}}else{same(await native.lstat(prepared+'/.git',{bigint:true}),gitIdentity);await assertTree(prepared+'/.git');const contents=await native.readFile(prepared+'/.git/config');same(await native.lstat(prepared+'/.git/config',{bigint:true}),configIdentity);if(!contents.equals(configBytes))throw Error('original local Git configuration drift');}}
export async function ownedGit(directory,...args){check();await assertRepository();if(directory!==prepared)throw Error('foreign Git directory refused');const sequences=[['init','-q'],['add','.'],['-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid','commit','-qm','synthetic B1 input'],['rev-parse','HEAD']];if(calls>=sequences.length||JSON.stringify(args)!==JSON.stringify(sequences[calls]))throw Error('original Git command order refused');
for(const anchor of ['/','/usr','/usr/bin']){const identity=await native.lstat(anchor,{bigint:true});if(!identity.isDirectory()||identity.uid!==0n||identity.gid!==0n||(identity.mode&18n)!==0n||await native.realpath(anchor)!==anchor)throw Error('absolute Git parent premise differs');}const executable=${JSON.stringify(recipe.git)};const named=await native.lstat(executable.path,{bigint:true});if(!named.isFile()||named.uid!==0n||named.gid!==0n||(named.mode&4095n)!==493n||Number(named.size)!==executable.bytes||await native.realpath(executable.path)!==executable.path||createHash('sha256').update(await native.readFile(executable.path)).digest('hex')!==executable.sha256)throw Error('original absolute Git executable drift');
if(calls===0){await native.mkdir(root+'/empty-hooks',{mode:448});await native.mkdir(root+'/empty-templates',{mode:448});const hooks=await native.open(root+'/empty-hooks',sync.constants.O_RDONLY|sync.constants.O_DIRECTORY);references.push(hooks);const templates=await native.open(root+'/empty-templates',sync.constants.O_RDONLY|sync.constants.O_DIRECTORY);references.push(templates);}
if(calls>0&&((await native.readdir(root+'/empty-hooks')).length!==0||(await native.readdir(root+'/empty-templates')).length!==0))throw Error('fresh fixed Git hooks/templates changed');const ordinal=calls++;const argv=['--no-optional-locks','-c','core.hooksPath='+root+'/empty-hooks','-c','init.templateDir='+root+'/empty-templates','-c','commit.gpgSign=false','-c','tag.gpgSign=false','-c','gc.auto=0','-c','maintenance.auto=false','-c','core.fsmonitor=false','-c','core.untrackedCache=false','-c','credential.helper=','-C',prepared,...args];check();
const child=spawn(executable.path,argv,{cwd:prepared,env:{PATH:'/usr/bin:/bin',HOME:root,XDG_CONFIG_HOME:root+'/empty-config',LANG:'C',LC_ALL:'C',TZ:'UTC',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_SYSTEM:'/dev/null',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_COUNT:'0',GIT_ATTR_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0'},stdio:['ignore','pipe','pipe']});references.push(child,argv);const owned=new OriginalControlChild(child,readMonotonicNs,cutoff,cutoff-2000000000n,expiry.promise,references,fail);children.push(owned);const joined=await owned.join();references.push(joined);if(!joined.joined||joined.terminal?.code!==0||joined.terminal.signal!==null||joined.failures.length!==0||joined.stderr.captured.length!==0)throw new AggregateError([...failures,...joined.failures],'original Git lifetime unproved');
if(ordinal===0){gitIdentity=await native.lstat(prepared+'/.git',{bigint:true});configIdentity=await native.lstat(prepared+'/.git/config',{bigint:true});configBytes=await native.readFile(prepared+'/.git/config');references.push(gitIdentity,configIdentity,configBytes);const lines=configBytes.toString().trim().split('\\n').map(line=>line.trim());if(JSON.stringify(lines)!==JSON.stringify(['[core]','repositoryformatversion = 0','filemode = true','bare = false','logallrefupdates = true']))throw Error('unexpected fresh local Git configuration');}
await assertRepository();check();const output=joined.stdout.captured.toString();if(ordinal===3){if(!/^[a-f0-9]{40}\\n$/.test(output))throw Error('original source commit output refused');}else if(output!=='')throw Error('unexpected original quiet Git output');return output.trim();}
let interception;export const fixtureGit=(...args)=>interception===undefined?ownedGit(...args):interception(...args);export function installGitInterceptor(){if(interception!==undefined)throw Error('nested original Git interceptor refused');const holder={mockImplementation(callback){interception=callback;return holder;},mockRestore(){interception=undefined;}};references.push(holder);return holder;}
export function retainSpy(spy){references.push(spy);return spy;}
export async function finishCapture(){fixtureSettled=true;if(interception!==undefined)throw Error('fixed Git interceptor restoration unproved');const joins=await Promise.all(children.map(child=>child.join()));references.push(joins);if(failures.length||joins.some(joined=>!joined.joined)||calls!==4)throw new AggregateError(failures,'original preparation capture retained');for(const capture of captures.reverse())capture.mockRestore();captureRestored=true;clearTimeout(timer);}
export const preparationState={references,failures,children,roots,get calls(){return calls;},get fixtureSettled(){return fixtureSettled;},get captureRestored(){return captureRestored;},fail};
`;
}

async function createOriginalOwnedFixture(
  scope: OriginalControlScope,
  recipe: OriginalReviewedRecipe,
) {
  const fs = await import('node:fs/promises');
  const native = await import('node:fs');
  const { createHash } = await import('node:crypto');
  checkOriginalControlScope(scope);
  const assets = await Promise.all(
    [
      'apps/wbs/be-01/drizzle/20261022212000_add_cross_project_dependency_activation/migration.sql',
      'apps/wbs/be-01/drizzle/20261022212000_add_cross_project_dependency_activation/down.sql',
      'deploy/solver-supervisor/wbs-solver-supervisor.service',
    ].map(async (member) => {
      const path = await fs.realpath(import.meta.dir + '/../../../' + member);
      const pin = recipe.sources.find((pin) => pin.path === path);
      const bytes = await fs.readFile(path);
      if (pin?.sha256 !== createHash('sha256').update(bytes).digest('hex'))
        throw Error('owned preparer asset outside reviewed closure: ' + path);
      return { path, sha256: pin.sha256 };
    }),
  );
  scope.references.push(assets);
  const directory = await fs.mkdtemp('/tmp/puni-original-preparer-');
  scope.roots.push(directory);
  scope.references.push(directory);
  const parent = await fs.open(
    directory,
    native.constants.O_RDONLY | native.constants.O_DIRECTORY | native.constants.O_NOFOLLOW,
  );
  scope.references.push(parent);
  const clock = await readOriginalLifetimeClockSource();
  const gitSource = createOriginalPreparerGitSource(scope.cutoff, recipe);
  const entry = `import * as startup from '${import.meta.dir}/../src/fixtures/source-startup.ts';import {createConstructionFixture} from '${import.meta.dir}/source-stageb-fixture-bootstrap.test.ts';import {fixtureGit,installCapture,finishCapture,preparationState} from 'original-preparer:git';export {preparationState};export async function prepare(){installCapture();let primary;let fixture;try{if(startup.git!==fixtureGit)throw Error('actual original Git capture binding differs');fixture=await createConstructionFixture();}catch(cause){primary={cause};preparationState.fail(cause);}let cleanup;try{if(startup.git!==fixtureGit)throw Error('nested Git spy restore escaped fixed adapter');await finishCapture();}catch(cause){cleanup={cause};preparationState.fail(cause);}if(primary!==undefined||cleanup!==undefined)throw new AggregateError([...(primary===undefined?[]:[primary.cause]),...(cleanup===undefined?[]:[cleanup.cause])],'owned original fixture preparation failed',{cause:primary?.cause});return fixture;}`;
  const loaded = new Map<string, string>();
  const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
  const compiled = await Bun.build({
    entrypoints: ['original-preparer:entry'],
    target: 'bun',
    format: 'esm',
    plugins: [
      {
        name: 'fixed-owned-original-preparation',
        setup(build) {
          build.onResolve({ filter: /^original-preparer:real-test$/ }, () => ({
            path: 'bun:test',
            external: true,
          }));
          build.onResolve({ filter: /^original-preparer:test$/ }, () => ({
            path: 'test',
            namespace: 'original-preparer-test',
          }));
          build.onLoad({ filter: /.*/, namespace: 'original-preparer-test' }, () => ({
            contents: `import {expect,spyOn as actualSpy} from 'original-preparer:real-test';import {retainSpy,fixtureGit,installGitInterceptor} from 'original-preparer:git';export {expect};export function spyOn(...args){if(args[1]==='git'){if(args[0].git!==fixtureGit)throw Error('fixed Git interceptor target differs');return installGitInterceptor();}return retainSpy(actualSpy(...args));}export const test=Object.assign(()=>{}, {each:()=>()=>{},skip:()=>{},todo:()=>{}});`,
            loader: 'js',
          }));
          build.onResolve({ filter: /^original-preparer:(entry|git|clock)$/ }, (args) => ({
            path: args.path,
            namespace: 'original-preparer',
          }));
          build.onLoad({ filter: /.*/, namespace: 'original-preparer' }, (args) => ({
            contents: args.path.endsWith(':entry')
              ? entry
              : args.path.endsWith(':git')
                ? gitSource
                : clock,
            loader: 'js',
            resolveDir: import.meta.dir,
          }));
          build.onLoad({ filter: /.*/, namespace: 'file' }, async (args) => {
            const bytes = await fs.readFile(args.path);
            loaded.set(args.path, hash(bytes));
            if (
              /source-stageb-fixture-bootstrap\.test\.ts$|\/src\/fixtures\/source-startup\.ts$/.test(
                args.path,
              )
            )
              return undefined;
            if (!/\.[cm]?[jt]sx?$/.test(args.path)) return undefined;
            return {
              contents: bytes
                .toString()
                .replaceAll("'bun:test'", "'original-preparer:test'")
                .replaceAll('"bun:test"', '"original-preparer:test"')
                .replaceAll(
                  'import.meta.dir',
                  JSON.stringify(args.path.slice(0, args.path.lastIndexOf('/'))),
                ),
              loader: /\.[cm]?jsx?$/.test(args.path) ? 'js' : 'ts',
            };
          });
          build.onLoad({ filter: /source-stageb-fixture-bootstrap\.test\.ts$/ }, async (args) => {
            const source = await fs.readFile(args.path, 'utf8');
            const capture = 'const originalGit = startupFixture.git;';
            const ts = await import('typescript');
            const parsed = ts.createSourceFile(
              args.path,
              source,
              ts.ScriptTarget.Latest,
              true,
              ts.ScriptKind.TS,
            );
            let captures = 0;
            const visit = (node: OriginalControlNode) => {
              if (
                ts.isVariableDeclaration(node) &&
                node.name.getText(parsed) === 'originalGit' &&
                node.initializer?.getText(parsed) === 'startupFixture.git'
              )
                captures++;
              ts.forEachChild(node, visit);
            };
            visit(parsed);
            if (source.split(capture).length !== 2 || captures !== 1)
              throw Error('original helper Git capture source/AST identity differs');
            return {
              contents:
                "import {ownedGit} from 'original-preparer:git';\n" +
                source
                  .replace(capture, 'const originalGit = ownedGit;')
                  .replaceAll("'bun:test'", "'original-preparer:test'")
                  .replaceAll('import.meta.dir', JSON.stringify(import.meta.dir)),
              loader: 'ts',
            };
          });
          build.onLoad({ filter: /\/src\/fixtures\/source-startup\.ts$/ }, async (args) => {
            const source = await fs.readFile(args.path, 'utf8');
            const capture =
              /export async function git\(root: string, \.\.\.args: string\[\]\) \{[\s\S]*?\n\}/g;
            const matches = [...source.matchAll(capture)];
            const ts = await import('typescript');
            const parsed = ts.createSourceFile(
              args.path,
              source,
              ts.ScriptTarget.Latest,
              true,
              ts.ScriptKind.TS,
            );
            const functions = parsed.statements.filter(
              (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'git',
            );
            if (
              matches.length !== 1 ||
              functions.length !== 1 ||
              functions[0]?.getText(parsed) !== matches[0]?.[0] ||
              !matches[0]?.[0].includes('Bun.spawn')
            )
              throw Error('original startup Git export source identity differs');
            return {
              contents:
                "import {fixtureGit} from 'original-preparer:git';\n" +
                source
                  .replace(capture, 'export const git = fixtureGit;')
                  .replaceAll("'bun:test'", "'original-preparer:test'"),
              loader: 'ts',
            };
          });
        },
      },
    ],
  });
  if (!compiled.success)
    throw new AggregateError(compiled.logs, 'owned original preparer compile failed');
  for (const [path, sha256] of loaded) {
    const pin = recipe.loaded.find((pin) => pin.path === path);
    if (pin?.sha256 !== sha256)
      throw Error('owned preparer source outside reviewed closure: ' + path);
  }
  const output = compiled.outputs.filter((output) => output.kind === 'entry-point');
  const executable = output.at(0);
  if (output.length !== 1 || executable === undefined)
    throw Error('owned original preparer entry absent');
  const bytes = Buffer.from(await executable.arrayBuffer());
  const scan = new Bun.Transpiler({ loader: 'js', target: 'bun' }).scan(bytes.toString());
  if (scan.imports.some((binding) => !recipe.imports.includes(binding.path)))
    throw Error('owned preparer primitive import outside reviewed closure');
  const ts = await import('typescript');
  const emitted = ts.createSourceFile(
    'preparer.mjs',
    bytes.toString(),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const testBindings = emitted.statements
    .filter(ts.isImportDeclaration)
    .filter(
      (node) =>
        ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === 'bun:test',
    );
  const binding = testBindings.at(0)?.importClause?.namedBindings;
  if (
    testBindings.length !== 1 ||
    binding === undefined ||
    !ts.isNamedImports(binding) ||
    JSON.stringify(
      binding.elements.map((element) => element.propertyName?.text ?? element.name.text).sort(),
    ) !== JSON.stringify(['expect', 'spyOn'])
  )
    throw Error('emitted preparer real test registration/spy boundary differs');
  if (
    !bytes.toString().includes('function installGitInterceptor(') ||
    !bytes.toString().includes('const originalGit = ownedGit;') ||
    bytes.toString().includes('import.meta.dir')
  )
    throw Error('emitted preparer capture/interceptor/asset origin differs');
  for (const asset of assets)
    if (
      createHash('sha256')
        .update(await fs.readFile(asset.path))
        .digest('hex') !== asset.sha256
    )
      throw Error('owned preparer asset changed before import: ' + asset.path);
  const path = directory + '/preparer.mjs';
  await fs.writeFile(path, bytes, { mode: 0o600 });
  scope.references.push(bytes, loaded, gitSource, entry, path);
  checkOriginalControlScope(scope);
  const namespace = (await import(path)) as {
    prepare: () => ReturnType<typeof createConstructionFixture>;
    preparationState: {
      references: unknown[];
      failures: unknown[];
      children: OriginalControlChild[];
      roots: string[];
    };
  };
  scope.references.push(namespace, namespace.preparationState);
  const preparing = namespace.prepare();
  scope.references.push(preparing);
  try {
    const fixture = await Promise.race([
      preparing,
      scope.failed.then((failure) => {
        throw failure;
      }),
      scope.expired.then(() => {
        throw Error('original preparation cutoff unproved');
      }),
    ]);
    scope.children.push(...namespace.preparationState.children);
    scope.roots.push(...namespace.preparationState.roots);
    return fixture;
  } catch (failure) {
    scope.fail(failure);
    scope.children.push(...namespace.preparationState.children);
    scope.roots.push(...namespace.preparationState.roots);
    for (const child of namespace.preparationState.children) child.cancel();
    const joined = await Promise.all(
      namespace.preparationState.children.map((child) => child.join()),
    );
    scope.references.push(joined);
    throw new AggregateError(
      [failure, ...namespace.preparationState.failures],
      'original fixture preparation retained',
      { cause: failure },
    );
  }
}

const retainedOriginalLifetimeControls = new Set<{
  readonly name: string;
  readonly references: unknown[];
}>();

/** Synthetic recipient derived from fixed public bytes; no secret or key-generation subprocess belongs to this component. */
function createOriginalLifetimeRecipient(): string {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const words: number[] = [];
  let accumulator = 0;
  let bits = 0;
  for (const byte of new Uint8Array(32).fill(1)) {
    accumulator = ((accumulator << 8) | byte) & 65535;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((accumulator >>> bits) & 31);
    }
  }
  if (bits > 0) words.push((accumulator << (5 - bits)) & 31);
  let checksum = 1;
  for (const word of [3, 3, 3, 0, 1, 7, 5, ...words, 0, 0, 0, 0, 0, 0]) {
    const high = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ word;
    for (const [offset, generator] of [
      0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3,
    ].entries())
      if ((high >>> offset) & 1) checksum ^= generator;
  }
  checksum ^= 1;
  for (let offset = 5; offset >= 0; offset--) words.push((checksum >>> (offset * 5)) & 31);
  return (
    'age1' +
    words
      .map(
        (word) =>
          alphabet.at(word) ??
          (() => {
            throw Error('recipient word absent');
          })(),
      )
      .join('')
  );
}

const originalLifetimeInertSource = `
let originalLifetimeSeam;
const originalLifetimeEntered=Promise.withResolvers();
class OriginalLifetimeInertConstruction {
 constructor(inputs,artifacts,journal,retention,borrow){this.inputs=inputs;this.artifacts=artifacts;this.journal=journal;this.retention=retention;this.borrow=borrow;this.constructing=Promise.withResolvers();this.closed=Promise.withResolvers();this.closeEntered=Promise.withResolvers();this.closeCalls=0;originalLifetimeSeam=this;originalLifetimeEntered.resolve(this);}
 async construct(){await this.constructing.promise;const inspection=inspectSourceInputs(this.inputs);return {workflowSha:inspection.review.workflowSha,inputManifestSha256:inspection.review.inputManifestSha256,recipientFingerprint:inspection.review.recipientFingerprint,source:{nonce:inspection.review.nonce,dependencySha256:inspectSourceArtifacts(this.artifacts).dependencySha256}};}
 close(){this.closeCalls++;this.closeEntered.resolve();return this.closed.promise;}
}
export const originalLifetimeProbe={entered:originalLifetimeEntered.promise,construction:token=>constructions.get(token),failed:()=>[...failedConstructionLifetimes],failedC:construction=>failedConstructions.has(construction),staging:token=>getLifetime(token)};
`;

/** Extracts only the exact frozen existing provider source; this function neither imports nor samples it. */
async function readOriginalLifetimeClockSource(): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const helper = await readFile(
    import.meta.dir + '/source-stageb-fixture-bootstrap.test.ts',
    'utf8',
  );
  const clocks = [...helper.matchAll(/const commonClockModuleSource = `([\s\S]*?)`;/g)];
  const clock = clocks.at(0)?.at(1);
  if (
    clocks.length !== 1 ||
    clock === undefined ||
    createHash('sha256').update(clock).digest('hex') !==
      'a722f53a40ea02be49b871f6b2662f13b1b4aa5102fd368bc7e7290d9ad7240c'
  )
    throw Error('original common clock source absent or changed');
  return clock;
}

/** Prepares fresh synthetic source/fixture bytes only; it never acquires I, imports the clock, or runs a component/helper. */
async function prepareOriginalLifetimePacket(
  scope: OriginalControlScope,
  recipe: OriginalReviewedRecipe,
  selected: string,
): Promise<OriginalLifetimePacket> {
  const fs = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
  const clock = await readOriginalLifetimeClockSource();
  const names = [
    'healthy',
    'internal-rejection',
    'later-rejection',
    'archive-rejection',
    'omit-transfer',
    'omit-pre-release',
    'omit-reachability',
    'omit-archive-drain',
  ];
  if (!names.includes(selected) && !isPhase2Control(selected))
    throw Error('original component preparation selector refused');
  if (isPhase2Control(selected)) {
    const raw = await fs.readFile(import.meta.dir + '/source-stageb-fixture.test.ts', 'utf8');
    const helper = await fs.readFile(
      import.meta.dir + '/source-stageb-fixture-bootstrap.test.ts',
      'utf8',
    );
    if (hash(raw) !== phase2RawOwnerSha256 || hash(helper) !== phase2HelperOwnerSha256)
      throw Error('phase2 source-derived closure owner pin differs');
    checkOriginalControlScope(scope, 60_000_000_000n);
  }
  checkOriginalControlScope(scope);
  const proposed = await createOriginalOwnedFixture(scope, recipe);
  scope.references.push(proposed);
  scope.roots.push(proposed.directory);
  const packetDirectory = proposed.directory + '/original-lifetime-controls';
  await fs.mkdir(packetDirectory, { mode: 0o700 });
  await fs.writeFile(packetDirectory + '/clock.mjs', clock, { mode: 0o600 });
  const archiveSource = await fs.readFile(
    import.meta.dir + '/source-stageb-archive-preflight.ts',
    'utf8',
  );
  const builderSource = await fs.readFile(import.meta.dir + '/source-stageb-builder.ts', 'utf8');
  const tools = '/tmp/puni-age-tool-20261026/verified-v1.3.2';
  const age = await fs.lstat(tools + '/age', { bigint: true });
  const toolParent = await fs.lstat(tools, { bigint: true });
  if (
    !age.isFile() ||
    (age.mode & 4095n) !== 320n ||
    age.nlink !== 1n ||
    hash(await fs.readFile(tools + '/age')) !==
      'eb7dd1b518f0a307c99cd97782623c5321da049154b04acd2d98d21aa7bc9b2c'
  )
    throw Error('original component official age pin differs');
  const recipient = createOriginalLifetimeRecipient();
  const archivePolicy = {
    format: 'source-stageb-archive-policy',
    version: 1,
    container: {
      format: 'source-stageb-private-archive',
      version: 1,
      indexFormat: 'source-stageb-private-index',
      indexVersion: 1,
      maximumBytes: 134217728,
      membership: 'fixed-fifteen-slots-v1',
    },
    encryption: 'age-native-x25519',
    tool: {
      directory: tools,
      directoryIdentity: {
        device: String(toolParent.dev),
        inode: String(toolParent.ino),
        uid: Number(toolParent.uid),
        gid: Number(toolParent.gid),
        mode: 448,
      },
      file: {
        name: 'age',
        bytes: Number(age.size),
        sha256: hash(await fs.readFile(tools + '/age')),
        uid: Number(age.uid),
        gid: Number(age.gid),
        mode: 320,
      },
      release: 'v1.3.2',
    },
    preflight: {
      plaintext: 'source-stageb-age-preflight-v1\n',
      stdoutBytes: 65536,
      stderrBytes: 8192,
      maximumDurationMs: 30000,
    },
  };
  const archiveBytes = JSON.stringify(archivePolicy) + '\n';
  const controls: OriginalLifetimePacket['controls'][number][] = [];
  for (const name of [selected]) {
    checkOriginalControlScope(scope);
    const directory = packetDirectory + '/' + name;
    await fs.mkdir(directory, { mode: 0o700 });
    for (const leaf of ['coordinator', 'registry', 'journal-parent', 'scratch'])
      await fs.mkdir(directory + '/' + leaf, { mode: 0o700 });
    const coordinator = await fs.lstat(directory + '/coordinator', { bigint: true });
    const registry = await fs.lstat(directory + '/registry', { bigint: true });
    const facility = JSON.parse(proposed.facilityBytes.toString()) as SourceFixtureAuthority;
    const facilityBytes =
      JSON.stringify({
        ...facility,
        coordinator: {
          directory: directory + '/coordinator',
          device: String(coordinator.dev),
          inode: String(coordinator.ino),
          uid: Number(coordinator.uid),
          gid: Number(coordinator.gid),
          mode: 448,
        },
      }) + '\n';
    const joins = {
      implementationSha: '1'.repeat(40),
      workflowSha: facility.workflowSha,
      nonce: facility.nonce,
      sourceSha: proposed.owned.sha,
      recipientFingerprint: hash(recipient),
      fixtureAuthoritySha256: hash(facilityBytes),
      rosterPolicySha256: hash(proposed.rosterBytes),
      archivePolicySha256: hash(archiveBytes),
    };
    const { slots } = await import('./source-stageb-artifacts.test');
    const index =
      JSON.stringify({
        format: 'source-stageb-inputs',
        version: 1,
        ...joins,
        artifacts: slots.map((slot) => ({
          slot,
          bytes: proposed.owned.artifacts[slot].length,
          sha256: hash(proposed.owned.artifacts[slot]),
        })),
      }) + '\n';
    for (const slot of slots)
      await fs.writeFile(directory + '/' + slot, proposed.owned.artifacts[slot], { mode: 0o600 });
    await fs.writeFile(directory + '/index', index, { mode: 0o600 });
    const artifactJoins = [];
    for (const slot of slots) {
      const path = directory + '/' + slot;
      const identity = await fs.lstat(path, { bigint: true });
      const observed = await fs.readFile(path);
      if (
        !identity.isFile() ||
        identity.nlink !== 1n ||
        (identity.mode & 4095n) !== 384n ||
        observed.byteLength !== proposed.owned.artifacts[slot].byteLength ||
        hash(observed) !== hash(proposed.owned.artifacts[slot])
      )
        throw Error('fresh original artifact join differs before I: ' + slot);
      artifactJoins.push({
        slot,
        bytes: observed.byteLength,
        sha256: hash(observed),
        device: String(identity.dev),
        inode: String(identity.ino),
      });
    }
    if (hash(await fs.readFile(directory + '/index')) !== hash(index))
      throw Error('fresh original index bytes differ before I');
    scope.references.push(artifactJoins);
    checkOriginalControlScope(scope);

    const review = {
      format: 'source-stageb-review',
      version: 1,
      ...joins,
      inputManifestSha256: hash(index),
      recipient,
      registry: {
        scope: '8'.repeat(32),
        device: String(registry.dev),
        inode: String(registry.ino),
        uid: Number(registry.uid),
        gid: Number(registry.gid),
        mode: 448,
      },
      notBefore: Date.now() - 1000,
      notAfter: Date.now() + 120000,
      maximumDurationMs: name === 'healthy-initial-short-I' ? 10000 : 90000,
    };
    let adaptedBuilder = isPhase2Control(name)
      ? await adaptPublicReleaseSource(builderSource, 'builder')
      : builderSource;
    const creation =
      /new SourceFixtureConstruction\(\s*inputs,\s*artifacts,\s*journal,\s*retention,\s*borrow,?\s*\)/g;
    if (
      [...adaptedBuilder.matchAll(creation)].length !== 1 ||
      adaptedBuilder.split('decodeSourceProfilePacket(await construction.construct())').length !== 2
    )
      throw Error('inert original constructor/packet source seam differs');
    adaptedBuilder = adaptedBuilder
      .replace(
        creation,
        'new OriginalLifetimeInertConstruction(inputs, artifacts, journal, retention, borrow)',
      )
      .replace(
        'decodeSourceProfilePacket(await construction.construct())',
        'await construction.construct()',
      );
    if (name === 'omit-transfer')
      adaptedBuilder = adaptedBuilder.replace(
        'ownership,\n      packet,',
        'ownership: {},\n      packet,',
      );
    if (name === 'omit-pre-release')
      adaptedBuilder = adaptedBuilder.replace(
        'if (ownership.construction !== undefined) await ownership.construction.close();',
        'if (ownership.construction !== undefined) void ownership.construction.close().catch(()=>{});',
      );
    if (name === 'omit-reachability')
      adaptedBuilder = adaptedBuilder.replace(
        'failedConstructionLifetimes.add({ ownership, failure });',
        'void failure;',
      );
    let adaptedArchive = isPhase2Control(name)
      ? await adaptPublicReleaseSource(archiveSource, 'archive')
      : archiveSource;
    if (isPhase2Control(name)) {
      if (name === 'entry-omit')
        adaptedArchive = adaptedArchive.replace(
          '    refuseRelease([ownership, borrow, lifetime, lifetime.pending], ownership.primary);\n',
          '',
        );
      if (name === 'postawait-omit')
        adaptedArchive = adaptedArchive.replace(
          '    refuseRelease([ownership, borrow, lifetime, lifetime.pending, settled], ownership.primary);\n',
          '',
        );
      if (name === 'membership-omit')
        adaptedArchive = adaptedArchive.replace(
          "    if (borrows.get(borrow) !== lifetime || lifetime.active !== borrow)\n      refuse('original active borrow changed during release');\n",
          '',
        );
      if (name.startsWith('b1-')) {
        adaptedBuilder =
          "import {phase2B1Fault} from 'original-lifetime:entry';\n" +
          adaptedBuilder.replace(
            '  refuseRelease([ownership, retention, retention.lifetime], ownership.primary);',
            '  phase2B1Fault();\n  refuseRelease([ownership, retention, retention.lifetime], ownership.primary);',
          );
        if (name === 'b1-omit')
          adaptedBuilder = adaptedBuilder.replace(
            '  refuseRelease([ownership, retention, retention.lifetime], ownership.primary);\n',
            '',
          );
      }
    }
    if (name === 'omit-archive-drain')
      adaptedArchive = adaptedArchive.replace(
        "if (failures.length > 0)\n      throw new AggregateError(failures, 'source archive borrow settlement failed');",
        'void failures;',
      );
    if (
      name.startsWith('omit-') &&
      adaptedBuilder ===
        builderSource
          .replace(
            creation,
            'new OriginalLifetimeInertConstruction(inputs, artifacts, journal, retention, borrow)',
          )
          .replace(
            'decodeSourceProfilePacket(await construction.construct())',
            'await construction.construct()',
          ) &&
      adaptedArchive === archiveSource
    )
      throw Error('original omission edit absent');
    const ageDrain = '    errors = drain(child.stderr, 8192);';
    if (adaptedArchive.split(ageDrain).length !== 2)
      throw Error('original age drain binding source identity differs');
    adaptedArchive =
      "import {originalAgeOperations} from 'original-lifetime:entry';\n" +
      adaptedArchive.replace(
        ageDrain,
        ageDrain + '\n    originalAgeOperations(child, output, errors);',
      );
    const entry = isPhase2Control(name)
      ? createPhase2LifetimeEntry(directory, name, slots, review.notAfter)
      : createOriginalLifetimeEntry(directory, name, slots);
    const completeBuilderContents =
      adaptedBuilder +
      (isPhase2Control(name)
        ? originalLifetimeInertSource.replace(
            'close(){this.closeCalls++;this.closeEntered.resolve();return this.closed.promise;}',
            'close(){if(this.closing!==undefined)return this.closing;this.closeCalls++;this.closeEntered.resolve();this.closing=this.closed.promise;return this.closing;}',
          )
        : originalLifetimeInertSource) +
      (isPhase2Control(name)
        ? '\nexport function phase2FailedCSet(){return failedConstructions;}'
        : '') +
      (isPhase2Control(name) ? '\noriginalLifetimeProbe.failedCSet=phase2FailedCSet;' : '');
    const completeArchiveContents =
      adaptedArchive +
      '\nexport const originalArchiveProbe={borrow:borrow=>borrows.get(borrow),register,failed:lifetime=>failedBorrowLifetimes.has(lifetime)' +
      (isPhase2Control(name) ? ',remove:borrow=>borrows.delete(borrow)' : '') +
      '};';
    const loaded = new Map<string, string>();
    let phase2NominalLoads = 0;
    const compiled = await Bun.build({
      entrypoints: ['original-lifetime:entry'],
      target: 'bun',
      format: 'esm',
      splitting: false,
      define: {
        SOURCE_STAGEB_REVIEW_LITERAL: JSON.stringify(JSON.stringify(review)),
        SOURCE_STAGEB_ARCHIVE_POLICY_LITERAL: JSON.stringify(archiveBytes),
        SOURCE_STAGEB_FIXTURE_AUTHORITY_LITERAL: JSON.stringify(facilityBytes),
        SOURCE_STAGEB_ROSTER_POLICY_LITERAL: JSON.stringify(proposed.rosterBytes.toString()),
        SOURCE_STAGEB_PRODUCER_EVIDENCE_LITERAL: JSON.stringify(
          proposed.producerBytes.map((bytes) => bytes.toString()),
        ),
        SOURCE_STAGEB_MIGRATION_WORKER_LITERAL: JSON.stringify(
          Buffer.from(proposed.worker.bytes).toString('base64'),
        ),
      },
      plugins: [
        {
          name: 'fixed-original-lifetime-component',
          setup(build) {
            if (isPhase2Control(name)) {
              build.onResolve({ filter: /^stageb:retained-lifetime$/ }, () => ({
                path: 'retained-lifetime',
                namespace: 'phase2-retained',
              }));
              build.onLoad({ filter: /^retained-lifetime$/, namespace: 'phase2-retained' }, () => {
                phase2NominalLoads++;
                return { contents: phase2NominalModuleSource, loader: 'js' };
              });
            }
            build.onLoad({ filter: /.*/, namespace: 'file' }, async (args) => {
              loaded.set(args.path, hash(await fs.readFile(args.path)));
              return undefined;
            });
            build.onResolve({ filter: /^original-lifetime:entry$/ }, () => ({
              path: 'entry',
              namespace: 'original-lifetime',
            }));
            build.onLoad({ filter: /.*/, namespace: 'original-lifetime' }, () => ({
              contents: entry,
              loader: 'ts',
              resolveDir: import.meta.dir,
            }));
            build.onLoad({ filter: /source-stageb-builder\.ts$/ }, () => ({
              contents: completeBuilderContents,
              loader: 'ts',
            }));
            build.onLoad({ filter: /source-stageb-archive-preflight\.ts$/ }, () => ({
              contents: completeArchiveContents,
              loader: 'ts',
            }));
          },
        },
      ],
    });
    if (!compiled.success)
      throw new AggregateError(compiled.logs, 'original component compile failed');
    for (const [path, sha256] of loaded) {
      const normalized = path === packetDirectory + '/clock.mjs' ? '@clock' : path;
      if (recipe.loaded.find((pin) => pin.path === normalized)?.sha256 !== sha256)
        throw Error('original component source outside reviewed closure: ' + normalized);
    }
    checkOriginalControlScope(scope);
    const outputs = compiled.outputs.filter((output) => output.kind === 'entry-point');
    const output = outputs.at(0);
    if (outputs.length !== 1 || output === undefined)
      throw Error('original component entry output absent');
    const bytes = Buffer.from(await output.arrayBuffer());
    let phase2EmittedBindings:
      { nominalLoads: number; classes: number; calls: Record<string, number> } | undefined;
    if (isPhase2Control(name)) {
      const ts = await import('typescript');
      const tree = ts.createSourceFile(
        'phase2-emitted.mjs',
        bytes.toString(),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS,
      );
      const calls: Record<string, number> = {};
      let classes = 0;
      function visit(node: TypeScriptNode): void {
        if (ts.isClassDeclaration(node) && node.name?.text === 'RetainedProbeLifetime') classes++;
        if (ts.isCallExpression(node)) {
          const callee = node.expression.getText(tree);
          if (
            [
              'refuseRelease',
              'buildSourcePrerequisites',
              'inspectRetainedProbeReferences',
            ].includes(callee)
          )
            calls[callee] = (calls[callee] ?? 0) + 1;
        }
        ts.forEachChild(node, visit);
      }
      visit(tree);
      const expectedRefusals = ['entry-omit', 'postawait-omit', 'b1-omit'].includes(name) ? 2 : 3;
      if (
        phase2NominalLoads !== 1 ||
        classes !== 1 ||
        calls['refuseRelease'] !== expectedRefusals ||
        calls['buildSourcePrerequisites'] !== 1 ||
        calls['inspectRetainedProbeReferences'] !== 8
      )
        throw Error('phase2 fresh emitted singleton/call bindings differ');
      phase2EmittedBindings = { nominalLoads: phase2NominalLoads, classes, calls };
    }
    const path = directory + '/component.mjs';
    await fs.writeFile(path, bytes, { mode: 0o600 });
    const scan = new Bun.Transpiler({ loader: 'js', target: 'bun' }).scan(bytes.toString());
    const permittedImports = new Set(recipe.imports);
    const originalPrimitiveImports = new Set([
      'assert',
      'fs/promises',
      'fs',
      'child_process',
      'bun:test',
      'crypto',
      'util/types',
      'bun:ffi',
      'path',
      'os',
    ]);
    if (
      scan.imports.some(
        (binding) =>
          !permittedImports.has(binding.path) || !originalPrimitiveImports.has(binding.path),
      ) ||
      /(?:class|new) SourceFixtureConstruction\b/.test(bytes.toString())
    )
      throw Error('original component native import/constructor closure differs');
    await fs.writeFile(
      directory + '/binding-inventory.json',
      JSON.stringify(
        {
          originalBuilderSha256: hash(builderSource),
          originalArchiveSha256: hash(archiveSource),
          adaptedBuilderSha256: hash(completeBuilderContents),
          adaptedArchiveSha256: hash(completeArchiveContents),
          entrySourceSha256: hash(entry),
          loadedModules: [...loaded].map(([path, sha256]) => ({ path, sha256 })),
          emittedSha256: hash(bytes),
          phase2EmittedBindings,
          imports: scan.imports,
          exports: scan.exports,
          ffiBindings: {
            eagerBindingOnly: ['libc flock', 'libc openat', 'libc renameat'],
            actualCalls: ['same pinned libc clock_gettime(1, owned pointer)'],
            sqliteRuntime: false,
          },
          runtimeChildren: isPhase2Control(name)
            ? [
                'same original component Bun child',
                'one original standard-age preflight descendant joined before fault',
                'one owned inert raw child with original raw readers and independent passive custody',
              ]
            : [
                'same original component Bun child',
                'one original standard-age preflight descendant joined before fault',
              ],
          phase2: isPhase2Control(name)
            ? {
                adaptedConsumer: true,
                rawOwnerSha256: phase2RawOwnerSha256,
                helperOwnerSha256: phase2HelperOwnerSha256,
                rawControlSourceSha256: hash(phase2RawControlSource),
                helperControlSourceSha256: hash(phase2HelperControlSource),
                nominalWithObserverSha256: hash(phase2NominalModuleSource),
                initialIMaximumDurationMs: review.maximumDurationMs,
                initialReviewNotAfter: review.notAfter,
                originalCutoffNs: String(scope.cutoff),
                initialJDeadline:
                  name === 'healthy-initial-short-I'
                    ? 'component pre-I M0/P0/M1/W1 floor/min minus10000ms'
                    : 'original I deadline',
                runtimeExecuted: false,
              }
            : undefined,
          forbiddenRuntime: [
            'actual C constructor',
            'worker',
            'full helper',
            'network',
            'host/provider operations',
          ],
          independentNegativeProtection: [
            'FileHandle.close for original staging/archive descriptors',
            'closeSync for original raw staging descriptor',
            'unlink/rmdir/rm while retained',
            'all subprocess APIs except the one pinned original age invocation',
          ],
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
    controls.push({
      name,
      entry: path,
      sha256: hash(bytes),
      expected: name === 'healthy' ? 'normal-cleanup' : 'retained-emergency',
    });
  }
  const packet = {
    directory: packetDirectory,
    clockPath: packetDirectory + '/clock.mjs',
    enclosingDurationNs: '90000000000',
    controls,
  };
  await fs.writeFile(
    packetDirectory + '/packet.json',
    JSON.stringify(
      {
        ...packet,
        originalBuilderSha256: hash(builderSource),
        originalArchiveSha256: hash(archiveSource),
        fixtureHelperSha256: hash(
          await fs.readFile(import.meta.dir + '/source-stageb-fixture-bootstrap.test.ts'),
        ),
        clockSha256: hash(clock),
        unimplemented: [
          'actual raw/helper post-await negative-only veto',
          'healthy release after expiry',
        ],
        runtimeExecuted: false,
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  return packet;
}

interface OriginalEntryHandshake {
  readonly name: string;
  readonly order: Promise<Record<string, unknown>>;
  readonly observation: Promise<Record<string, unknown>>;
  readonly confirmation: Promise<Record<string, unknown>>;
  readonly wait: <T>(promise: Promise<T>) => Promise<T>;
  readonly observe: () => void;
  readonly end: () => void;
  readonly join: () => Promise<OriginalControlJoin>;
  readonly references: unknown[];
}

/* eslint-disable preserve-caught-error -- Test harness boundary: earliest setup error intentionally remains cause; caught guardian failure remains in AggregateError.errors[1] and original references. */
/** Routes a failed setup observation through the original guardian before rethrowing its primary; no failed frame grants entry authority. */
// Proof: local15 (f9703ff0) omitted observation-race operand -> local reserve/no guardian callbacks; exact restoration -> setup-primary + observe/end/join (local protocol only; no OS/domain proof).
async function awaitOriginalEntryOrder(
  handshake: OriginalEntryHandshake,
): Promise<Record<string, unknown>> {
  const first = await handshake.wait(Promise.race([handshake.order, handshake.observation]));
  handshake.references.push(first);
  if (first['phase'] === 'entry-order') return first;
  if (
    first['phase'] !== 'observation' ||
    first['name'] !== handshake.name ||
    first['passed'] !== false ||
    first['acquisition'] !== 'setup' ||
    typeof first['assertion'] !== 'string'
  )
    throw new Error('original entry observation before ordering is invalid', { cause: first });
  const primary = new Error(first['assertion'], { cause: first });
  handshake.references.push(primary);
  try {
    handshake.observe();
    const confirmed = await handshake.wait(handshake.confirmation);
    handshake.references.push(confirmed);
    if (
      confirmed['phase'] !== 'confirmed' ||
      confirmed['name'] !== handshake.name ||
      confirmed['passed'] !== false ||
      confirmed['acquisition'] !== 'setup' ||
      confirmed['assertion'] !== first['assertion']
    )
      throw new Error('original failed setup confirmation differs', { cause: confirmed });
    handshake.end();
    const joined = await handshake.join();
    handshake.references.push(joined);
    if (!joined.joined || joined.failures.length !== 0 || joined.terminal?.signal !== null)
      throw new Error('original failed setup guardian custody unproved', { cause: joined });
  } catch (failure) {
    handshake.references.push(failure);
    throw new AggregateError([primary, failure], primary.message, { cause: primary });
  }
  throw primary;
}

/* eslint-enable preserve-caught-error */
/** Bounds only durable harness diagnostics; every visited original stays retained even when its snapshot is incomplete. */
function captureOriginalFailure(failure: unknown, originals: unknown[]) {
  const nodes: Record<string, unknown>[] = [];
  const visited = new Map<object, number>();
  const truncated = new Set<string>();
  let remainingText = 1536;
  const text = (value: string, maximum: number) => {
    const clipped = value.slice(0, Math.min(maximum, remainingText));
    remainingText -= clipped.length;
    if (clipped.length !== value.length) truncated.add('text');
    return clipped;
  };
  const own = (value: object, key: PropertyKey): unknown => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) return undefined;
    if (!('value' in descriptor)) {
      truncated.add('accessor');
      return undefined;
    }
    return descriptor.value;
  };
  const visit = (value: unknown, depth: number): number | undefined => {
    originals.push(value);
    if (typeof value === 'object' && value !== null) {
      const previous = visited.get(value);
      if (previous !== undefined) return previous;
    }
    if (depth > 3 || nodes.length >= 8) {
      truncated.add(depth > 3 ? 'depth' : 'count');
      return undefined;
    }
    const id = nodes.length;
    const node: Record<string, unknown> = { id };
    nodes.push(node);
    if (!(value instanceof Error)) {
      node['kind'] = typeof value;
      if (typeof value === 'string') node['message'] = text(value, 192);
      else truncated.add('non-error');
      return id;
    }
    visited.set(value, id);
    node['kind'] = value instanceof AggregateError ? 'AggregateError' : 'Error';
    for (const [key, maximum] of [
      ['name', 48],
      ['message', 192],
      ['stack', 384],
    ] as const) {
      const field = own(value, key);
      if (typeof field === 'string') node[key] = text(field, maximum);
      else if (key === 'stack') truncated.add('stack-unavailable');
    }
    const cause = own(value, 'cause');
    if (cause !== undefined) node['cause'] = visit(cause, depth + 1);
    const errors = own(value, 'errors');
    if (Array.isArray(errors)) {
      const links: (number | undefined)[] = [];
      for (let index = 0; index < Math.min(errors.length, 8); index++)
        links.push(visit(own(errors, String(index)), depth + 1));
      node['errors'] = links;
      if (errors.length > 8) truncated.add('count');
    }
    return id;
  };
  try {
    const root = visit(failure, 0);
    const snapshot = {
      status: truncated.size === 0 ? 'complete' : 'truncated',
      root,
      nodes,
      truncated: [...truncated],
      limits: { depth: 3, nodes: 8, textCodeUnits: 1536, utf8Bytes: 16384 },
    };
    if (Buffer.byteLength(JSON.stringify(snapshot)) > 16384)
      throw new Error('original failure diagnostic byte bound');
    return snapshot;
  } catch (diagnosticFailure) {
    originals.push(failure, diagnosticFailure);
    return {
      status: 'unavailable',
      reason: 'original failure diagnostic observation refused',
      limits: { depth: 3, nodes: 8, textCodeUnits: 1536, utf8Bytes: 16384 },
    };
  }
}

function createOriginalLifetimeEntry(
  directory: string,
  name: string,
  slots: readonly string[],
): string {
  return `
import {strict as assert} from 'node:assert';
import * as fs from 'node:fs/promises';import * as sync from 'node:fs';import * as childProcess from 'node:child_process';import {spyOn} from 'bun:test';
import {readSourceInputs,inspectSourceInputs,closeSourceInputs} from '${import.meta.dir}/source-stageb-inputs.ts';
import {readSourceArtifacts,closeSourceArtifacts} from '${import.meta.dir}/source-stageb-artifacts.ts';
import {createSourceJournal,closeSourceJournal} from '${import.meta.dir}/source-stageb-journal.ts';
import {stageSourceArtifacts,closeSourceStaging,buildSourcePrerequisites,closeSourcePrerequisites,originalLifetimeProbe} from '${import.meta.dir}/source-stageb-builder.ts';
import {preflightSourceArchive,closeSourceArchivePreflight,releaseSourceArchivePreflight,assertSourceArchivePreflight,originalArchiveProbe} from '${import.meta.dir}/source-stageb-archive-preflight.ts';
import {readMonotonicNs} from '${directory}/../clock.mjs';
${captureOriginalFailure.toString()}
${OriginalControlChild.toString()}
const directory=${JSON.stringify(directory)},name=${JSON.stringify(name)};
const cutoffText=process.env.PUNI_ORIGINAL_LIFETIME_CUTOFF_NS;
if(typeof cutoffText!=='string'||!/^\\d{1,19}$/.test(cutoffText))throw Error('original component cutoff absent');
const cutoff=BigInt(cutoffText);const check=()=>{if(readMonotonicNs()>=cutoff)throw Error('original component cutoff exceeded');};check();
const expiry=Promise.withResolvers();const cutoffTimer=setTimeout(()=>expiry.resolve(),Math.max(0,Number((cutoff-readMonotonicNs())/1000000n)));
const references=[];const keeper=setInterval(()=>{},1000);references.push(keeper,directory);
const handshake=Promise.withResolvers(),ended=Promise.withResolvers();let observationPublished=false;let guardianEnding=false;
const guardian=(async()=>{let failure;try{let text='';for await(const bytes of process.stdin){text+=Buffer.from(bytes).toString();if(text.length>64)throw Error('component guardian input bound');if(text==='observe\\n'){handshake.resolve();text='';}else if(text.includes('\\n'))throw Error('component guardian command refused');}if(!observationPublished)throw Error('component guardian EOF before observation');}catch(cause){failure=cause;references.push(cause);}finally{guardianEnding=true;const settled=await joinAge(true);if(!settled){process.exitCode=79;references.push(Error('original age operations/close/EOF remain unproved at guardian termination'));return await new Promise(()=>{});}clearInterval(keeper);clearTimeout(cutoffTimer);}if(failure!==undefined){process.exitCode=76;ended.reject(failure);throw failure;}process.exitCode=name==='healthy'?0:75;ended.resolve();})();
void guardian.catch(failure=>{console.error(String(failure));references.push(failure);});
references.push(guardian,handshake,ended);
let protection=false;let acquisition='setup';let setupStage='inputs';let ageStage='not-entered';let failureSnapshot;let productionAssertion='';let mockRestores=0;const protectedDescriptors=new Set();const protectedCloses=[];const protectedRemovals=[];const retainedMocks=[];const ageChildren=[];const ageFailures=[];let ageAttempts=0;
const originalOpen=fs.open;const openSpy=spyOn(fs,'open').mockImplementation(async(...args)=>{const file=await originalOpen(...args);const descriptor=file.fd;const close=file.close.bind(file);file.close=async()=>{if(protection&&protectedDescriptors.has(descriptor)){protectedCloses.push(descriptor);throw Error('independent component descriptor protection');}return await close();};return file;});retainedMocks.push(openSpy);
for(const operation of ['unlink','rmdir','rm']){const actual=fs[operation];retainedMocks.push(spyOn(fs,operation).mockImplementation(async(...args)=>{if(protection){protectedRemovals.push({operation,path:String(args[0])});throw Error('independent component removal protection');}return await actual(...args);}));}
const actualCloseSync=sync.closeSync;retainedMocks.push(spyOn(sync,'closeSync').mockImplementation(descriptor=>{if(protection&&protectedDescriptors.has(descriptor)){protectedCloses.push(descriptor);throw Error('independent component raw descriptor protection');}return actualCloseSync(descriptor);}));
// Proof: local35 receipt 90b09fe7 observed nested-check omission enter two Node calls versus one restored; zero-delegation omission accepted a fake child versus restored refusal retaining its identity; finally omission stranded the window versus restored fresh invocation. Local fixtures only; no OS/domain proof.
const actualSpawn=childProcess.spawn;const actualBunSpawn=Bun.spawn;let originalSpawnWindow;
// Harness boundary: the pinned synchronous node adapter normalizes these two source-fixed plain tuples; this window is not stack authentication or OS confinement.
function spawnOriginalNode(command,argv,options){
 if(originalSpawnWindow!==undefined)throw Error('original node spawn nested delegation refused');
 const window={available:true};originalSpawnWindow=window;
 try{const child=actualSpawn(command,argv,options);references.push(child);if(window.available)throw Error('original node spawn without synchronous Bun delegation refused');return child;}
 catch(failure){references.push(failure);throw failure;}
 finally{originalSpawnWindow=undefined;}
}
retainedMocks.push(spyOn(childProcess,'spawn').mockImplementation((command,argv,options)=>{ageStage='wrapper-entry';check();if(guardianEnding)throw Error('original age admission after guardian termination refused');if(ageAttempts++!==0||readMonotonicNs()>=cutoff-8000000000n)throw Error('original age admission/cancellation reserve refused');assert.equal(command,'/tmp/puni-age-tool-20261026/verified-v1.3.2/age');assert.deepEqual(argv,['--encrypt','--recipient',inspectSourceInputs(inputs).review.recipient]);assert.deepEqual(options,{cwd:'/tmp/puni-age-tool-20261026/verified-v1.3.2',env:{LANG:'C',LC_ALL:'C'},stdio:['pipe','pipe','pipe']});check();ageStage='spawn-call';const child=spawnOriginalNode(command,argv,options);ageStage='spawn-returned';references.push(child,child.stdin,child.stdout,child.stderr);const owned=new OriginalControlChild(child,readMonotonicNs,cutoff,cutoff-4000000000n,expiry.promise,references,failure=>ageFailures.push(failure),undefined,true);const original={child,owned,joined:undefined,operations:[],operationOutcomes:undefined};ageChildren.push(original);ageStage='registered';references.push(original);return child;}));
export function originalAgeOperations(child,output,errors){const original=ageChildren.find(original=>original.child===child);if(original===undefined||original.operations.length!==0)throw Error('actual age operation owner binding differs');original.operations.push(output,errors);ageStage='operations-bound';references.push(output,errors);for(const operation of original.operations)void operation.catch(failure=>{ageFailures.push(failure);original.owned.cancel();original.owned.continueDiscard();});}
async function joinAge(cancel){for(const original of ageChildren){if(cancel){original.owned.cancel();original.owned.continueDiscard();}const joining=Promise.all([original.owned.join(),Promise.allSettled(original.operations)]);references.push(joining);const joined=await Promise.race([joining,expiry.promise.then(()=>undefined)]);if(joined!==undefined){original.joined=joined[0];original.operationOutcomes=joined[1];references.push(joined);}else references.push(Error('original age operation join exceeded original outer cutoff'));}return ageChildren.every(original=>original.joined?.joined===true&&original.operations.length===2&&original.operationOutcomes?.length===2&&original.operationOutcomes.every(outcome=>outcome.status==='fulfilled'));}
function descendantEvidence(){return {count:ageChildren.length,close:ageChildren.every(original=>original.joined?.terminal!==undefined),stdoutEOF:ageChildren.every(original=>original.joined?.stdout?.eof===true),stderrEOF:ageChildren.every(original=>original.joined?.stderr?.eof===true),operations:ageChildren.map(original=>original.operationOutcomes?.map(outcome=>({status:outcome.status,failure:outcome.status==='rejected'?String(outcome.reason):undefined}))),unproved:ageChildren.some(original=>original.joined?.joined!==true||original.operations.length!==2||original.operationOutcomes?.length!==2||original.operationOutcomes.some(outcome=>outcome.status!=='fulfilled'))};}
function protectionEvidence(){return {enabled:protection,mockRestores,retainedMocks:retainedMocks.length,blockedCloses:[...protectedCloses],blockedRemovals:[...protectedRemovals]};}
function frame(phase,passed){return {phase,passed,name,acquisition,assertion:productionAssertion,setup:{stage:setupStage,ageStage,ageAttempts,registeredAgeChildren:ageChildren.length},failure:failureSnapshot,classification:name==='healthy'?'normal-cleanup':'retained-before-emergency',originalDescriptors,protection:protectionEvidence(),descendant:descendantEvidence(),originalCleanupProved:name==='healthy'&&passed};}
for(const operation of ['spawnSync','exec','execSync','execFile','execFileSync','fork'])retainedMocks.push(spyOn(childProcess,operation).mockImplementation(()=>{throw Error('component subprocess API refused');}));
// Proof: local35 receipt 90b09fe7 observed consume-before-delegate omission reach two native sentinels versus one restored; window-check omission stayed fail-closed with TypeError, restoration recovered the named refusal. Local fixtures only; no OS/domain proof.
retainedMocks.push(spyOn(Bun,'spawn').mockImplementation(function(...args){
 const window=originalSpawnWindow;
 if(window===undefined||!window.available)throw Error('component Bun spawn refused');
 window.available=false;
 try{const child=Reflect.apply(actualBunSpawn,this,args);references.push(child);return child;}
 catch(failure){references.push(failure);throw failure;}
}),spyOn(Bun,'spawnSync').mockImplementation(()=>{throw Error('component Bun sync spawn refused');}));
let inputs,artifacts,journal,staging,archive,token,seam,ownership,archiveLifetime,closing,observedFailure;
let retentionSettled=false,archiveReleased=false,stagingClosed=false,archiveClosed=false;const files=[],journalFiles=[];
const primary=Error('original component construction primary'),dependency=Error('original component dependent settlement rejected');
const identity=descriptor=>{const value=sync.fstatSync(descriptor,{bigint:true});return {descriptor,device:String(value.dev),inode:String(value.ino)};};
let originalDescriptors=[];
function assertHeld(){assert.equal(seam.retention.isActive,true,'B1_ACTIVE');assert.equal(retentionSettled,false);assert.equal(originalArchiveProbe.borrow(seam.borrow),archiveLifetime,'A2_REGISTRY');assert.equal(archiveLifetime.active,seam.borrow,'A2_ACTIVE');assert.equal(archiveReleased,false);assert.equal(stagingClosed,false);assert.equal(archiveClosed,false);for(const original of originalDescriptors)assert.deepEqual(identity(original.descriptor),original);}
try{
 inputs=await readSourceInputs();const inspection=inspectSourceInputs(inputs);references.push(inputs,inspection);
 const descriptors={};for(const slot of ${JSON.stringify(slots)}){const file=await fs.open(directory+'/'+slot,sync.constants.O_RDONLY|sync.constants.O_NOFOLLOW);files.push(file);descriptors[slot]=file.fd;}
 setupStage='artifacts';artifacts=await readSourceArtifacts(inputs,descriptors);references.push(artifacts,files);setupStage='journal';
 const journalDirectory=directory+'/journal-parent/source-stageb-'+inspection.review.nonce;await fs.mkdir(journalDirectory,{mode:448});const parent=await fs.open(directory+'/journal-parent',sync.constants.O_RDONLY|sync.constants.O_DIRECTORY);const child=await fs.open(journalDirectory,sync.constants.O_RDONLY|sync.constants.O_DIRECTORY);journalFiles.push(parent,child);
 journal=await createSourceJournal({parent,directory:child,claim:{format:'source-stageb-journal',version:1,nonce:inspection.review.nonce,implementationSha:inspection.review.implementationSha,workflowSha:inspection.review.workflowSha,sourceSha:inspection.review.sourceSha,inputManifestSha256:inspection.review.inputManifestSha256},deadline:inspection.originalDeadline});references.push(journal,journalFiles);
 setupStage='archive-preflight';archive=await preflightSourceArchive(inputs,journal);setupStage='age-join';assert.equal(ageChildren.length,1);const actualAge=ageChildren[0];assert.equal(await joinAge(false),true);assert.deepEqual(actualAge.joined.terminal,{code:0,signal:null});assert.equal(ageFailures.length,0);check();references.push(archive,ageChildren);
 setupStage='staging';const caller=await fs.open(directory+'/coordinator',sync.constants.O_RDONLY|sync.constants.O_DIRECTORY);try{staging=await stageSourceArtifacts(inputs,artifacts,journal,caller.fd);}finally{await caller.close();}references.push(staging);
 setupStage='construction';const building=buildSourcePrerequisites(inputs,artifacts,staging,journal,archive);void building.catch(()=>{});seam=await originalLifetimeProbe.entered;references.push(seam,building);archiveLifetime=originalArchiveProbe.borrow(seam.borrow);assert.ok(archiveLifetime);references.push(archiveLifetime,seam.borrow,seam.retention);
 const stagingLifetime=originalLifetimeProbe.staging(staging);originalDescriptors=[stagingLifetime.parentFd,stagingLifetime.child,archiveLifetime.tool.parent.fd,archiveLifetime.tool.file.fd].map(identity);for(const original of originalDescriptors)protectedDescriptors.add(original.descriptor);references.push(stagingLifetime,originalDescriptors,retainedMocks);acquisition='original-references';setupStage='acquired';
 protection=name!=='healthy';
 const internal=name==='internal-rejection';const rejectedArchive=name==='archive-rejection'||name==='omit-archive-drain';const rejectedClose=internal||name==='later-rejection'||name==='omit-pre-release'||name==='omit-reachability';
 if(internal)seam.constructing.reject(primary);else seam.constructing.resolve();
 if(internal){await seam.closeEntered.promise;}else{token=await building;const lifetime=originalLifetimeProbe.construction(token);ownership=lifetime.ownership;assert.equal(ownership.construction,seam,'OWNERSHIP_TRANSFER');assert.equal(ownership.borrow,seam.borrow,'OWNERSHIP_TRANSFER');assert.equal(ownership.retention,seam.retention,'OWNERSHIP_TRANSFER');references.push(token,lifetime,ownership);}
 void seam.retention.settled.then(()=>{retentionSettled=true;});void archiveLifetime.released.then(()=>{archiveReleased=true;});
 const stageClose=closeSourceStaging(staging);void stageClose.then(()=>{stagingClosed=true;},()=>{});const archiveClose=closeSourceArchivePreflight(archive);void archiveClose.then(()=>{archiveClosed=true;},()=>{});references.push(stageClose,archiveClose);
 const admitted=Promise.withResolvers();let registered;if(rejectedArchive){registered=originalArchiveProbe.register(archiveLifetime,()=>admitted.promise);references.push(admitted,registered);void registered.catch(()=>{});assert.equal(archiveLifetime.pending.has(admitted.promise),true);}
 closing=internal?building:closeSourcePrerequisites(token);void closing.catch(()=>{});if(!internal)assert.equal(closeSourcePrerequisites(token),closing);await seam.closeEntered.promise;assertHeld();
 if(rejectedClose)seam.closed.reject(dependency);else seam.closed.resolve();
 if(rejectedArchive){while(archiveLifetime.releasing===undefined){check();await Promise.resolve();}assert.equal(releaseSourceArchivePreflight(seam.borrow),archiveLifetime.releasing);await assert.rejects(assertSourceArchivePreflight(inputs,journal,seam.borrow),/release in progress/);assertHeld();admitted.reject(dependency);}
 try{await closing;}catch(failure){observedFailure=failure;}
 check();
 if(name==='healthy'){
  assert.equal(observedFailure,undefined);await stageClose;await archiveClose;assert.equal(retentionSettled,true);assert.equal(archiveReleased,true);assert.equal(stagingClosed,true);assert.equal(archiveClosed,true);assert.equal(seam.closeCalls,1);assert.equal(originalArchiveProbe.borrow(seam.borrow),undefined);assert.deepEqual(await fs.readdir(directory+'/coordinator'),[]);
  await closeSourceJournal(journal);for(const file of journalFiles)if(file.fd>=0)await file.close();await closeSourceArtifacts(artifacts);for(const file of files)await file.close();await closeSourceInputs(inputs);for(const mock of retainedMocks.reverse()){mock.mockRestore();mockRestores++;}
 }else{
  assert.ok(observedFailure);assertHeld();const failureRecord=originalLifetimeProbe.failed().find(record=>record.ownership.construction===seam);assert.ok(failureRecord,'FAILED_LIFETIME_REACHABILITY');ownership=failureRecord.ownership;assert.equal(ownership.borrow,seam.borrow);assert.equal(ownership.retention,seam.retention);assert.equal(originalLifetimeProbe.failedC(seam),true);if(internal){assert.equal(ownership.primary.cause,primary);assert.ok(observedFailure instanceof AggregateError);assert.equal(observedFailure.cause,primary);assert.ok(observedFailure.errors.includes(dependency));}else assert.equal(failureRecord.failure,observedFailure);
  if(rejectedArchive){assert.equal(originalArchiveProbe.failed(archiveLifetime),true);assert.equal(releaseSourceArchivePreflight(seam.borrow),archiveLifetime.releasing);await assert.rejects(archiveLifetime.releasing,failure=>failure instanceof AggregateError&&failure.errors.includes(dependency));}
 }
 console.log(JSON.stringify(frame('observation',true)));observationPublished=true;await handshake.promise;check();if(name!=='healthy')assertHeld();console.log(JSON.stringify(frame('confirmed',true)));await ended.promise;
}catch(failure){references.push(failure,inputs,artifacts,journal,staging,archive,seam,ownership,archiveLifetime,closing,observedFailure);productionAssertion=String(failure?.message??failure);failureSnapshot=captureOriginalFailure(failure,references);await joinAge(true);console.log(JSON.stringify(frame('observation',false)));observationPublished=true;await handshake.promise;console.log(JSON.stringify(frame('confirmed',false)));await ended.promise;process.exitCode=77;}
await guardian;
`;
}

/** Opens one retained scope before any preparation/acquisition and joins every original child on every modeled outcome. */
async function runOriginalLifetimeControl(name: string) {
  if (retainedOriginalLifetimeControls.size >= 27)
    throw Error('finite original component attempt cap reached');
  const references: unknown[] = [];
  retainedOriginalLifetimeControls.add({ name, references });
  let scope: OriginalControlScope | undefined;
  let owned: OriginalControlChild | undefined;
  let primary: { cause: unknown } | undefined;
  let receipt: unknown;
  const phase2DiagnosticFrames: Record<string, unknown>[] = [];
  let phase2DiagnosticReceiptPath: string | undefined;
  try {
    const fs = await import('node:fs/promises');
    const native = await import('node:fs');
    const { createHash } = await import('node:crypto');
    const { spawn } = await import('node:child_process');
    const recipe = await readOriginalReviewedRecipe();
    references.push(recipe);
    if (process.env['PUNI_ORIGINAL_LIFETIME_PACKET'] !== undefined)
      throw Error('historical source-only packet cannot supply an original runtime I');
    const clock = await readOriginalLifetimeClockSource();
    const namespace: unknown = await import(
      'data:text/javascript;base64,' + Buffer.from(clock).toString('base64')
    );
    references.push(clock, namespace);
    if (
      typeof namespace !== 'object' ||
      namespace === null ||
      !('readMonotonicNs' in namespace) ||
      typeof namespace.readMonotonicNs !== 'function' ||
      Object.keys(namespace).join(',') !== 'readMonotonicNs'
    )
      throw Error('original same-clock export refused');
    scope = createOriginalControlScope(namespace.readMonotonicNs as () => bigint);
    references.push(scope);
    const packet = await prepareOriginalLifetimePacket(scope, recipe, name);
    references.push(packet);
    if (isPhase2Control(name))
      phase2DiagnosticReceiptPath = packet.directory + '/' + name + '-failure-receipt.json';
    const control = packet.controls.find((control) => control.name === name);
    if (control === undefined) throw Error('original control absent');
    const bytes = await fs.readFile(control.entry);
    references.push(control, bytes);
    if (createHash('sha256').update(bytes).digest('hex') !== control.sha256)
      throw Error('original emitted receipt binding differs');
    const directory = control.entry.slice(0, control.entry.lastIndexOf('/'));
    scope.roots.push(directory);
    const index = await fs.open(
      directory + '/index',
      native.constants.O_RDONLY | native.constants.O_NOFOLLOW,
    );
    references.push(index);
    const registry = await fs.open(
      directory + '/registry',
      native.constants.O_RDONLY | native.constants.O_DIRECTORY | native.constants.O_NOFOLLOW,
    );
    references.push(registry);
    const root = await fs.open(
      directory,
      native.constants.O_RDONLY | native.constants.O_DIRECTORY | native.constants.O_NOFOLLOW,
    );
    references.push(root);
    const coordinator = await fs.open(
      directory + '/coordinator',
      native.constants.O_RDONLY | native.constants.O_DIRECTORY | native.constants.O_NOFOLLOW,
    );
    references.push(coordinator);
    if (name === 'healthy-initial-short-I') {
      await fs.writeFile(packet.directory + '/' + name + '-candidate.mjs', bytes, { mode: 0o600 });
      await fs.copyFile(
        directory + '/binding-inventory.json',
        packet.directory + '/' + name + '-binding-inventory.json',
      );
    }
    await fs.writeFile(
      packet.directory + '/fresh-emission-receipt.json',
      JSON.stringify(
        {
          classification: 'reviewed-fresh-synthetic-recipe-before-I',
          originalCutoffNs: String(scope.cutoff),
          componentEntry: control.entry,
          componentSha256: control.sha256,
          originalIAcquired: false,
          componentSpawned: false,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
    const observation = Promise.withResolvers<Record<string, unknown>>();
    const confirmation = Promise.withResolvers<Record<string, unknown>>();
    const phase2Order = Promise.withResolvers<Record<string, unknown>>();
    let pending = '';
    let frameCount = 0;
    const parse = (chunk: Uint8Array) => {
      pending += Buffer.from(chunk).toString();
      for (;;) {
        const end = pending.indexOf('\n');
        if (end < 0) break;
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        const frame = JSON.parse(line) as Record<string, unknown>;
        if (isPhase2Control(name)) phase2DiagnosticFrames.push(frame);
        if (frame['phase'] === 'entry-order' && name.startsWith('entry-')) {
          phase2Order.resolve(frame);
          continue;
        }
        if (frameCount++ === 0 && frame['phase'] === 'observation') observation.resolve(frame);
        else if (frameCount === 2 && frame['phase'] === 'confirmed') confirmation.resolve(frame);
        else throw Error('original control frame sequence refused');
      }
    };
    references.push(observation, confirmation, parse);
    checkOriginalControlScope(scope, 5_000_000_000n);
    const child = spawn(process.execPath, ['--no-env-file', control.entry], {
      cwd: directory,
      env: {
        WBS_ENV: 'dev',
        TMPDIR: directory + '/scratch',
        LANG: 'C.UTF-8',
        TZ: 'UTC',
        BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
        PUNI_ORIGINAL_LIFETIME_CUTOFF_NS: String(scope.cutoff),
      },
      stdio: [
        'pipe',
        'pipe',
        'pipe',
        'ignore',
        'ignore',
        'ignore',
        'ignore',
        index.fd,
        registry.fd,
      ],
    });
    references.push(child, child.stdin, child.stdout, child.stderr);
    owned = new OriginalControlChild(
      child,
      scope.readClock,
      scope.cutoff,
      scope.cutoff - 1_000_000_000n,
      scope.expired,
      references,
      (failure) => scope?.fail(failure),
      parse,
      false,
      () => {
        child.stdin?.end();
        return scope !== undefined && scope.readClock() >= scope.cutoff - 1_000_000_000n;
      },
    );
    scope.children.push(owned);
    if (child.stdin === null || child.stdout === null || child.stderr === null)
      throw Error('original control pipe acquisition incomplete');
    const originalScope = scope;
    const wait = async <T>(promise: Promise<T>): Promise<T> =>
      await Promise.race([
        promise,
        originalScope.failed.then((failure) => {
          throw failure;
        }),
        originalScope.expired.then(() => {
          throw Error('original component immutable cutoff');
        }),
      ]);
    if (name.startsWith('entry-')) {
      const originalInput = child.stdin;
      const originalChild = owned;
      const order = await awaitOriginalEntryOrder({
        name,
        order: phase2Order.promise,
        observation: observation.promise,
        confirmation: confirmation.promise,
        wait,
        observe: () => {
          originalInput.write('observe\n');
        },
        end: () => {
          originalInput.end();
        },
        join: () => originalChild.join(),
        references,
      });
      references.push(order);
      if (
        order['name'] !== name ||
        order['originalPending'] !== true ||
        !Array.isArray(order['originalDescriptors']) ||
        order['originalDescriptors'].length !== 4
      )
        throw Error('phase2 original pending ordering frame absent');
      if (owned.terminal.observed || child.pid === undefined)
        throw Error('phase2 ordering child already terminated');
      for (const original of order['originalDescriptors'] as {
        descriptor: number;
        device: string;
        inode: string;
      }[]) {
        if (!Number.isSafeInteger(original.descriptor) || original.descriptor < 0)
          throw Error('phase2 ordering original descriptor malformed');
        const actual = await fs.stat(
          '/proc/' + String(child.pid) + '/fd/' + String(original.descriptor),
          { bigint: true },
        );
        if (String(actual.dev) !== original.device || String(actual.ino) !== original.inode)
          throw Error('phase2 ordering original authority FD changed');
      }
      child.stdin.write('advance\n');
    }
    const held = await wait(observation.promise);
    references.push(held);
    const assertFrame = async (frame: Record<string, unknown>, phase: string) => {
      if (
        frame['phase'] !== phase ||
        frame['name'] !== name ||
        typeof frame['passed'] !== 'boolean' ||
        frame['acquisition'] !== 'original-references' ||
        !Array.isArray(frame['originalDescriptors']) ||
        frame['originalDescriptors'].length !== 4
      )
        throw Error('original control did not reach intended acquisition/phase');
      if (!isOriginalHealthy(name)) {
        const protection = frame['protection'] as Record<string, unknown>;
        if (
          protection['enabled'] !== true ||
          protection['mockRestores'] !== 0 ||
          protection['retainedMocks'] !== 14 ||
          !Array.isArray(protection['blockedCloses']) ||
          !Array.isArray(protection['blockedRemovals'])
        )
          throw Error('independent original protection outcome absent');
        const pid = child.pid;
        if (pid === undefined || owned?.terminal.observed)
          throw Error('original child not alive for independent FD readback');
        const authority = await coordinator.stat({ bigint: true });
        let observedAuthority = false;
        for (const descriptor of frame['originalDescriptors'] as {
          descriptor: number;
          device: string;
          inode: string;
        }[]) {
          if (!Number.isSafeInteger(descriptor.descriptor) || descriptor.descriptor < 0)
            throw Error('original diagnostic descriptor refused');
          const actual = await fs.stat(
            '/proc/' + String(pid) + '/fd/' + String(descriptor.descriptor),
            { bigint: true },
          );
          if (String(actual.dev) !== descriptor.device || String(actual.ino) !== descriptor.inode)
            throw Error('independent original FD changed');
          if (actual.dev === authority.dev && actual.ino === authority.ino)
            observedAuthority = true;
        }
        if (!observedAuthority) throw Error('parent original coordinator FD not observed');
      }
      if (isPhase2Control(name)) {
        const phase2 = frame['phase2'] as Record<string, unknown>;
        const raw = phase2['raw'] as Record<string, unknown>;
        const custody = raw['custody'] as Record<string, unknown>;
        const status = raw['status'] as Record<string, unknown>;
        const terminal = custody['terminal'] as Record<string, unknown>;
        const stdout = custody['stdout'] as Record<string, unknown>;
        const stderr = custody['stderr'] as Record<string, unknown>;
        if (
          raw['stdoutEOF'] !== true ||
          raw['stderrEOF'] !== true ||
          raw['streamsOriginal'] !== true ||
          raw['failures'] !== 0 ||
          status['code'] !== 0 ||
          status['signal'] !== null ||
          custody['joined'] !== true ||
          terminal['code'] !== 0 ||
          terminal['signal'] !== null ||
          stdout['eof'] !== true ||
          stderr['eof'] !== true
        )
          throw Error('phase2 actual raw child/reader evidence absent');
        if (
          name === 'healthy-initial-short-I' &&
          (phase2['normalDomainCleanup'] !== true ||
            phase2['fixtureRemoved'] !== true ||
            (await root.stat()).nlink !== 0)
        )
          throw Error('phase2 normal original fixture cleanup unproved');
      }
      const descendant = frame['descendant'] as Record<string, unknown>;
      if (
        descendant['count'] !== 1 ||
        descendant['close'] !== true ||
        descendant['stdoutEOF'] !== true ||
        descendant['stderrEOF'] !== true ||
        descendant['unproved'] !== false
      )
        throw Error('original age descendant terminal/EOF unproved');
    };
    await assertFrame(held, 'observation');
    child.stdin.write('observe\n');
    const confirmed = await wait(confirmation.promise);
    references.push(confirmed);
    await assertFrame(confirmed, 'confirmed');
    if (confirmed['passed'] !== held['passed'] || confirmed['assertion'] !== held['assertion'])
      throw Error('original guard observation changed across parent interval');
    child.stdin.end();
    const joined = await owned.join();
    references.push(joined);
    receipt = {
      name,
      diagnosticFrames: phase2DiagnosticFrames,
      held,
      confirmed,
      joined,
      parentRootsRetained: scope.roots,
      parentAuthorityDescriptorsRetained: [index.fd, registry.fd, root.fd, coordinator.fd],
      originalCleanupProved: isOriginalHealthy(name) && held['passed'] === true,
      componentCustodyProved: joined.joined,
      expectedOmissionMismatch: isOriginalOmission(name) ? held['assertion'] : undefined,
    };
    if (name === 'healthy-initial-short-I' && held['passed'] === true) {
      await coordinator.close();
      await root.close();
      await registry.close();
      await index.close();
      if ([coordinator, root, registry, index].some((file) => file.fd !== -1))
        throw Error('phase2 original parent descriptors remain open');
    }
    await fs.writeFile(
      name === 'healthy-initial-short-I'
        ? packet.directory + '/' + name + '-receipt.json'
        : directory + '/receipt.json',
      JSON.stringify(receipt, null, 2) + '\n',
      {
        mode: 0o600,
      },
    );
    if (!joined.joined || joined.failures.length !== 0 || joined.terminal?.signal !== null)
      throw Error('original component close and both EOF not proved');
    const intended: Partial<Record<string, readonly string[]>> = {
      'entry-omit': ['PHASE2_ENTRY_REFUSAL_ORDER'],
      'postawait-omit': ['PHASE2_A2_REGISTRY'],
      'b1-omit': ['PHASE2_B1_ACTIVE', 'PHASE2_B1_WAITER'],
      'membership-omit': ['PHASE2_MEMBERSHIP_ACTIVE', 'PHASE2_MEMBERSHIP_WAITER'],
      'helper-omit': ['PHASE2_HELPER_CLEANUP_ENTRY'],
      'inspector-omit': ['PHASE2_HELPER_INSPECTION_CLEANUP_ENTRY'],
      'omit-transfer': ['OWNERSHIP_TRANSFER'],
      'omit-pre-release': ['A2_REGISTRY', 'B1_ACTIVE', 'A2_ACTIVE'],
      'omit-reachability': ['FAILED_LIFETIME_REACHABILITY'],
      'omit-archive-drain': ['A2_REGISTRY', 'B1_ACTIVE', 'A2_ACTIVE'],
    };
    if (
      isOriginalOmission(name) &&
      !intended[name]?.some(
        (label) => typeof held['assertion'] === 'string' && held['assertion'].includes(label),
      )
    )
      throw Error('omission RED did not identify its intended original guard mismatch');
    expect(held['passed']).toBe(true);
    expect(confirmed['passed']).toBe(true);
    expect(joined.terminal.code).toBe(isOriginalHealthy(name) ? 0 : 75);
    return receipt;
  } catch (cause) {
    primary = { cause };
    references.push(primary, receipt);
    if (phase2DiagnosticReceiptPath !== undefined) {
      try {
        await (
          await import('node:fs/promises')
        ).writeFile(
          phase2DiagnosticReceiptPath,
          JSON.stringify(
            {
              name,
              classification: 'failed-control-diagnostics-only',
              frames: phase2DiagnosticFrames,
              failure: String(cause),
              failureDetails: captureOriginalFailure(cause, references),
              originalCutoffNs: scope === undefined ? undefined : String(scope.cutoff),
              authority: 'live originals only; these diagnostics never authorize release',
            },
            null,
            2,
          ) + '\n',
          { mode: 0o600 },
        );
      } catch (diagnosticFailure) {
        references.push(diagnosticFailure);
        primary = {
          cause: new AggregateError(
            [cause, diagnosticFailure],
            'original control and diagnostic persistence failed',
            { cause },
          ),
        };
      }
    }
    scope?.fail(cause);
    owned?.cancel();
  } finally {
    if (scope !== undefined) {
      const joins = await Promise.all(scope.children.map((child) => child.join()));
      references.push(joins);
      if (joins.every((joined) => joined.joined)) clearTimeout(scope.timer);
      else
        references.push(
          Error('retained original component/Git uncertainty; no terminal cleanup claim'),
        );
    }
  }
  throw new AggregateError(
    [primary.cause, ...(scope?.failures ?? [])],
    'original control retained failure',
    { cause: primary.cause },
  );
}

test('original dependent lifetime reviewed custody recipe', async () => {
  const recipe = await readOriginalReviewedRecipe();
  expect(recipe.format).toBe('original-lifetime-reviewed-recipe');
});

for (const name of ['healthy', 'internal-rejection', 'later-rejection', 'archive-rejection'])
  test(`original dependent lifetime component ${name}`, async () => {
    await runOriginalLifetimeControl(name);
  }, 120000);

const originalLifetimeOmission = process.env['PUNI_ORIGINAL_LIFETIME_OMISSION'];
if (originalLifetimeOmission !== undefined)
  test('original dependent lifetime protected omission', async () => {
    if (
      !['omit-transfer', 'omit-pre-release', 'omit-reachability', 'omit-archive-drain'].includes(
        originalLifetimeOmission,
      )
    )
      throw Error('original component omission selector refused');
    await runOriginalLifetimeControl(originalLifetimeOmission);
  }, 120000);

const phase2RawOwnerSha256 = 'e3682ca22575b052141630f9042a4b83ad3ea8c6be76411db19382e52ae14604';
const phase2HelperOwnerSha256 = '348446029c717410796ee6136e5e210d32fa558d1252b2f4b0a8337135ded616';
const phase2RawControlSource =
  "function createRawChildLifetime(cutoffNs,wallNotAfter,cancelOriginal,readNowNs,recordUnproved){\n if(typeof cutoffNs!=='bigint'||!Number.isFinite(wallNotAfter)||typeof readNowNs!=='function'||typeof recordUnproved!=='function')throw Error('raw child original cutoff absent');\n const records=new Map();const operations=new Map();const lifetimeFailures=[];let expired=false;let stopped=false;let timer;let wake;\n const cutoff=new Promise(resolve=>{wake=resolve;});\n function remaining(){try{return Math.min(Number(cutoffNs-readNowNs())/1e6,wallNotAfter-Date.now());}catch(cause){lifetimeFailures.push(cause);recordUnproved(cause);throw cause;}}\n function failure(record,cause){record.failures.push(cause instanceof Error?cause:Error(String(cause)));}\n function settled(record){return record.status!==undefined&&record.stdout.eof&&record.stderr.eof&&record.child.stdout===record.stdout.stream&&record.child.stderr===record.stderr.stream;}\n function signal(child,requested='SIGTERM'){\n  const record=records.get(child);if(record===undefined)throw Error('raw child original reference absent');\n  if(requested!=='SIGTERM'&&requested!=='SIGKILL')throw Error('raw child cancellation signal refused');\n  if(record.status!==undefined||child.exitCode!==null||child.signalCode!==null)return false;\n  if(record.signals.has(requested))return false;record.signals.add(requested);\n  try{return cancelOriginal(child,requested);}catch(cause){failure(record,cause);return false;}\n }\n function cancel(record){if(!settled(record))signal(record.child,'SIGTERM');}\n function expire(){if(expired)return;expired=true;const cause=Error('raw child original cutoff exceeded');lifetimeFailures.push(cause);recordUnproved(cause);for(const record of records.values())if(!settled(record)){failure(record,Error('raw child original cutoff exceeded'));cancel(record);}wake();}\n const allowance=remaining();if(allowance<=0)expire();else timer=setTimeout(expire,Math.max(1,Math.ceil(allowance)));\n function assertForward(){if(stopped||expired||remaining()<=0){expire();throw Error('raw child forward cutoff');}}\n function retain(child,stdoutMaximum,stderrMaximum){\n  if(records.has(child))throw Error('raw child duplicate original reference');\n  const record={child,status:undefined,failures:[],signals:new Set(),stdout:{stream:child.stdout,eof:false,closed:false,bytes:0,overflow:false,readFailure:undefined},stderr:{stream:child.stderr,eof:false,closed:false,bytes:0,overflow:false,readFailure:undefined},finished:undefined,resolve:undefined};\n  record.finished=new Promise(resolve=>{record.resolve=resolve;});records.set(child,record);\n  function completed(){if(settled(record))record.resolve();}\n  child.on('error',cause=>{failure(record,cause);cancel(record);});\n  child.once('close',(code,signalName)=>{record.status={code,signal:signalName};completed();});\n  function drain(pipe,maximum,label){\n   try{\n   if(pipe.stream===null||pipe.stream===undefined){pipe.readFailure=Error('raw child '+label+' reader absent');failure(record,pipe.readFailure);cancel(record);return;}\n   pipe.stream.on('error',cause=>{pipe.readFailure=cause;failure(record,cause);cancel(record);});\n   pipe.stream.once('end',()=>{pipe.eof=true;completed();});\n   pipe.stream.once('close',()=>{pipe.closed=true;});\n   pipe.stream.on('data',chunk=>{\n    try{const length=typeof chunk==='string'?Buffer.byteLength(chunk):chunk.byteLength;if(!Number.isSafeInteger(length)||length<0)throw Error('raw child invalid output chunk');pipe.bytes+=length;\n     if(pipe.bytes>maximum&&!pipe.overflow){pipe.overflow=true;failure(record,Error('raw child '+label+' output bound'));cancel(record);}\n    }catch(cause){pipe.readFailure=cause;failure(record,cause);cancel(record);}\n   });\n   }catch(cause){pipe.readFailure=cause;failure(record,cause);cancel(record);}\n  }\n  drain(record.stdout,stdoutMaximum,'stdout');drain(record.stderr,stderrMaximum,'stderr');\n  if(expired){failure(record,Error('raw child original cutoff exceeded'));cancel(record);}else if(remaining()<=0)expire();return record;\n }\n async function within(promise){let operation=operations.get(promise);if(operation===undefined){operation={promise,phase:'pending',observed:undefined};operations.set(promise,operation);operation.observed=promise.then(value=>{operation.phase='fulfilled';operation.value=value;return operation;},cause=>{operation.phase='rejected';operation.cause=cause;return operation;});}if(remaining()<=0)expire();const observed=await Promise.race([operation.observed,cutoff.then(()=>({phase:'cutoff'}))]);if(remaining()<=0)expire();return expired?{phase:'cutoff',cause:operation.cause}:observed;}\n async function finish(){\n  stopped=true;for(const record of records.values())cancel(record);\n  const all=Promise.all([...records.values()].map(record=>record.finished));\n  if(remaining()<=0)expire();\n  await Promise.race([all,cutoff]);\n  if(remaining()<=0)expire();\n  const isSettled=[...records.values()].every(settled);\n  if(isSettled&&timer!==undefined)clearTimeout(timer);\n  return {settled:isSettled,expired,failures:[...lifetimeFailures,...[...records.values()].flatMap(record=>record.failures)],retained:[...records.values()].filter(record=>!settled(record))};\n }\n function assertRelease(){if(![...records.values()].every(settled))throw Error('raw child settlement retained');if(timer!==undefined)clearTimeout(timer);}\n function snapshot(){return [...records.values()].map(record=>({status:record.status,stdout:{eof:record.stdout.eof,closed:record.stdout.closed,bytes:record.stdout.bytes,overflow:record.stdout.overflow,readFailed:record.stdout.readFailure!==undefined},stderr:{eof:record.stderr.eof,closed:record.stderr.closed,bytes:record.stderr.bytes,overflow:record.stderr.overflow,readFailed:record.stderr.readFailure!==undefined},failures:record.failures.map(cause=>cause.message),signals:[...record.signals]}));}\n return {assertForward,retain,signal,within,finish,assertRelease,snapshot,records,operations};\n}\nfunction createRawAcquisitionLifetime(onUnproved,assertUsable){\n const records=new Map();const failures=[];let blocked;\n function block(cause){if(blocked===undefined)blocked=cause;}\n function retain(original,kind){\n  const record=records.get(original)??{original,kind,descriptor:undefined,failure:undefined,closing:undefined,readProbe:undefined};\n  records.set(original,record);\n  try{\n   if(kind==='file'&&record.descriptor===undefined)record.descriptor=original.fd;\n   const close=original.close.bind(original);record.nativeClose=close;\n   original.close=async(...args)=>{\n    if(blocked!==undefined)throw blocked;assertUsable();\n    try{\n     record.closing=close(...args);await record.closing;\n     if(kind==='file'&&original.fd!==-1)throw Error('raw file close remains unproved');\n     if(kind==='reader'){\n      let closed=false;try{record.readProbe=original.read();await record.readProbe;}catch(cause){if(cause instanceof Error&&'code'in cause&&cause.code==='ERR_DIR_CLOSED')closed=true;else throw cause;}\n      if(!closed)throw Error('raw directory close remains unproved');\n     }\n     records.delete(original);\n    }catch(cause){record.failure=cause;failures.push(cause);throw onUnproved(cause,[record,original]);}\n   };\n  }catch(cause){record.failure=cause;failures.push(cause);throw onUnproved(cause,[record,original]);}\n  return original;\n }\n function assertRelease(){if(records.size!==0)throw Error('raw acquisition settlement retained');}\n return {retainFile:file=>retain(file,'file'),retainReader:reader=>retain(reader,'reader'),assertRelease,records,failures,block,hasRetained:()=>records.size!==0};\n}\nfunction inspectRawRetainedError(original){\n const pending=[{value:original,depth:0,ancestors:new Set()}];const visited=new Set();const references=[];const messages=[];\n function unknown(reason){return {retained:undefined,unsupported:reason,references,messages};}\n while(pending.length!==0){\n  const {value,depth,ancestors}=pending.pop();\n  if(value===undefined)continue;\n  if((typeof value!=='object'&&typeof value!=='function')||value===null)return unknown('non-error record');\n  if(modelIsProxy(value)){references.push(value);return unknown('proxy error record');}\n  if(ancestors.has(value))return unknown('cyclic error record');\n  if(visited.has(value))continue;\n  if(visited.size>=256||depth>32)return unknown('error graph bound');\n  visited.add(value);references.push(value);\n  if(RetainedProbeLifetime.recognizes(value))return {retained:value,unsupported:undefined,references,messages};\n  if(!(value instanceof Error))return unknown('non-error object');\n  const descriptors=Object.getOwnPropertyDescriptors(value);const message=descriptors.message;\n  if(message!==undefined&&(!Object.hasOwn(message,'value')||typeof message.value!=='string'))return unknown('unsupported error message');\n  if(message!==undefined)messages.push(message.value);\n  const nextAncestors=new Set(ancestors);nextAncestors.add(value);\n  const cause=descriptors.cause;\n  if(cause!==undefined){if(!Object.hasOwn(cause,'value'))return unknown('accessor error cause');if(pending.length>=256)return unknown('error graph bound');pending.push({value:cause.value,depth:depth+1,ancestors:nextAncestors});}\n  if(value instanceof AggregateError){\n   const errors=descriptors.errors;if(errors===undefined||!Object.hasOwn(errors,'value'))return unknown('unsupported aggregate errors');\n   const values=errors.value;if(modelIsProxy(values)||!Array.isArray(values))return unknown('unsupported aggregate array');\n   const fields=Object.getOwnPropertyDescriptors(values);const length=fields.length;\n   if(length===undefined||!Object.hasOwn(length,'value')||!Number.isSafeInteger(length.value)||length.value<0||length.value>256)return unknown('aggregate array bound');\n   if(pending.length+length.value>256)return unknown('error graph bound');\n   for(let index=length.value-1;index>=0;index--){const entry=fields[String(index)];if(entry===undefined||!Object.hasOwn(entry,'value'))return unknown('accessor or sparse aggregate entry');pending.push({value:entry.value,depth:depth+1,ancestors:nextAncestors});}\n  }\n }\n return {retained:undefined,unsupported:undefined,references,messages};\n}\nfunction createPhase2RawOwner(){\n const originalFailedConstructions=originalLifetimeProbe.failedCSet();const rawFailureEvents=[];let rawFrameFailure;\n const inspection=inspectSourceInputs(inputs);const entered=readMonotonicNs();const inputCutoff=entered+BigInt(Math.floor((inspection.originalDeadline-performance.now())*1e6));\n const rawLifetime=createRawChildLifetime(cutoff<inputCutoff?cutoff:inputCutoff,inspection.review.notAfter,(child,signal)=>child.kill(signal),readMonotonicNs,cause=>rawFailureEvents.push(cause));\n const rawAcquisitions=createRawAcquisitionLifetime((cause,originals)=>retainRawFailure(cause,originals),assertRawFrameUsable);\n const rawOperations={construction:undefined,close:undefined,token:undefined};const knownChildren=new Set();const restores=retainedMocks;\n const retainedRawReferences=[rawLifetime,rawAcquisitions,rawOperations,rawFailureEvents,knownChildren,restores,inputs,artifacts,staging,journal,archive,originalFailedConstructions,references];\n let joinedOriginalClose;let originalRawSettlement;let afterClose;let closeMemoized=false;\n function retainRawFailure(cause,references=[]){\n  const graph=inspectRawRetainedError(cause);\n  if(rawFrameFailure!==undefined){rawFrameFailure.retain([cause,...references]);return rawFrameFailure;}\n  const retained=graph.retained??new RetainedProbeLifetime(graph.unsupported===undefined?'raw original acquisition remains unproved':'raw error graph remains unproved',[Error(graph.unsupported??'original acquisition failure'),cause],[...retainedRawReferences,...graph.references,...references]);\n  retained.retain([...retainedRawReferences,...references,...rawAcquisitions.records.values(),...rawLifetime.records.values()]);rawFrameFailure=retained;rawAcquisitions.block(retained);return retained;\n }\nfunction assertRawFrameUsable(){if(rawFrameFailure!==undefined)throw rawFrameFailure;if(rawFailureEvents.length!==0)throw retainRawFailure(new AggregateError([...rawFailureEvents],'raw original lifetime is unproved'));if(originalFailedConstructions.size!==0)throw retainRawFailure(Error('original C failure is retained'),[...originalFailedConstructions]);try{rawLifetime.assertForward();}catch(cause){throw retainRawFailure(cause);}}\nfunction refuseRawRelease(originals,primary){\n  const references=[...retainedRawReferences,...originals,...(primary===undefined?[]:[primary,primary.cause])];\n  try{\n   if(rawFrameFailure!==undefined)throw rawFrameFailure;\n   if(primary!==undefined){const graph=inspectRawRetainedError(primary.cause);references.push(primary,...graph.references);if(graph.retained!==undefined||graph.unsupported!==undefined)throw retainRawFailure(primary.cause,references);}\n   const failures=[...rawFailureEvents,...rawAcquisitions.failures];\n   const failedC=[...originalFailedConstructions];references.push(originalFailedConstructions,...failedC);\n   if(failedC.length!==0)failures.push(Error('original C failure is retained'));\n   for(const record of rawLifetime.records.values()){\n    references.push(record,record.child,record.stdout,record.stderr);\n    failures.push(...record.failures);\n    if(record.stdout.readFailure!==undefined)failures.push(record.stdout.readFailure);\n    if(record.stderr.readFailure!==undefined)failures.push(record.stderr.readFailure);\n    if(record.status===undefined||!record.stdout.eof||!record.stderr.eof||record.stdout.overflow||record.stderr.overflow||record.child.stdout!==record.stdout.stream||record.child.stderr!==record.stderr.stream)failures.push(Error('original raw child release remains unproved'));\n   }\n   references.push(...rawAcquisitions.records.values());\n   if(rawAcquisitions.hasRetained())failures.push(Error('original raw acquisition remains retained'));\n   if(failures.length!==0)throw retainRawFailure(new AggregateError(failures,'raw original release dependencies remain unproved'),references);\n  }catch(cause){throw retainRawFailure(cause,references);}\n }\n function closeRawOriginal(){\n  if(joinedOriginalClose!==undefined)return joinedOriginalClose;\n  const original=originalLifetimeProbe.construction(token);\n  if(original===undefined)throw retainRawFailure(Error('original construction ownership absent'),[token]);\n  const construction=original.construction;const ownership=original.ownership;const closing=construction.close();\n  rawOperations.close=closing;\n  joinedOriginalClose=(async()=>{\n   try{\n    const closed=await rawLifetime.within(closing);if(closed.phase!=='fulfilled')throw closed.phase==='rejected'?closed.cause:Error('raw C close original cutoff');\n    afterClose=await inspectSourceJournal(journal);\n    const settlement=await rawLifetime.finish();originalRawSettlement=settlement;if(!settlement.settled||settlement.failures.length!==0)throw new AggregateError(settlement.failures,'raw C child settlement remains unproved');\n    refuseRawRelease([token,original,construction,ownership,closing,settlement]);\n    const first=closeSourcePrerequisites(token);const second=closeSourcePrerequisites(token);closeMemoized=first===second;\n    await first;\n   }catch(cause){throw retainRawFailure(cause,[token,original,construction,ownership,closing]);}\n  })();\n  return joinedOriginalClose;\n }\n return {lifetime:rawLifetime,acquisitions:rawAcquisitions,refuse:refuseRawRelease,failure:()=>rawFrameFailure,references:retainedRawReferences,events:rawFailureEvents,close:closeRawOriginal,settlement:()=>originalRawSettlement,journal:()=>afterClose,memoized:()=>closeMemoized};\n}";
const phase2HelperControlSource =
  "async function runOwnedLowerScope(work, cleanup, references, cutoffNs) {\n  // Proof: C6 undefined omission admitted protected work and two samples; ordinary retained original refs with work/cleanup/publication0 (50f4c30c).\n  if (typeof cutoffNs !== 'bigint') return new RetainedProbeLifetime('original enclosing cutoff absent',[Error('original enclosing cutoff absent')],references());\n  // Proof: C7 separate-invocations shared-array omission failed the second call exact [K] length; ordinary excluded prior W (50f4c30c).\n  const failures = [];\n  // Proof: C7 second/third-clock-work-error lost-primary mutations retained only [K]; ordinary preserved exact [W,K], including an unflattened AggregateError W (50f4c30c).\n  const readNow=()=>{try{return readMonotonicNs();}catch(clockFailure){return new RetainedProbeLifetime('original common clock unproved',[...failures,clockFailure],references());}};\n  // Proof: C7 first-clock nominal-stop omission entered protected work; ordinary [K] stopped work/cleanup/publication (50f4c30c).\n  let now=readNow();if(RetainedProbeLifetime.recognizes(now))return now;\n  // Proof: C7 current-expiry-1 omission crossed protected work; ordinary work0 (50f4c30c); earlier entry proof5da64829 preserved.\n  if (now >= cutoffNs) return new RetainedProbeLifetime('enclosing cutoff expired before lower work', [Error('original enclosing cutoff expired')], references());\n  let evidence;\n  try { evidence = await work(); }\n  catch (failure) {\n    // Proof: omission reached the protected mock-restoration boundary before the held original reader settled; exact restore kept cleanup/restore zero (034e54ff).\n    if (RetainedProbeLifetime.recognizes(failure)) {\n      failure.retain(references());\n      return failure;\n    }\n    failures.push(failure);\n  }\n  // Proof: C7 second-clock-nominal-stop omission entered protected cleanup; ordinary preserved [W,K] before cleanup (50f4c30c).\n  now=readNow();if(RetainedProbeLifetime.recognizes(now))return now;\n  // Proof: C7 current-expiry-2 omission crossed protected cleanup; ordinary cleanup0 (50f4c30c); earlier entry proof5da64829 preserved.\n  if (now >= cutoffNs) return new RetainedProbeLifetime('enclosing cutoff expired before lower cleanup', [...failures, Error('original enclosing cutoff expired')], references());\n  try { await cleanup(); }\n  catch (failure) {\n    return new RetainedProbeLifetime('original lower cleanup remains unproved',\n      [...failures, failure], references());\n  }\n  // Proof: C7 third-clock-nominal-stop omission threw W instead of clock nominal; ordinary preserved [W,K] with publication0 (50f4c30c).\n  now=readNow();if(RetainedProbeLifetime.recognizes(now))return now;\n  // Proof: C7 current-expiry-3 omission published once; ordinary retained with publication0 (50f4c30c); earlier entry proof5da64829 preserved.\n  if (now >= cutoffNs) return new RetainedProbeLifetime('enclosing cutoff expired after lower cleanup', [...failures, Error('original enclosing cutoff expired')], references());\n  if (failures.length !== 0) throw failures[0];\n  return evidence;\n}\nfunction createPhase2HelperHandoff(references,cutoffNs){let helperRetained;const helperOwnership={references};function retainHelperFailure(cause){\n if(helperRetained!==undefined){helperRetained.retain([cause,...references()]);return helperRetained;}\n let graph;\n try{graph=inspectRawRetainedError(cause);}\n catch(inspectionFailure){\n  if(helperRetained!==undefined){helperRetained.retain([cause,inspectionFailure,...references()]);return helperRetained;}\n  helperRetained=new RetainedProbeLifetime('helper original graph inspection remains unproved',[cause,inspectionFailure],[cause,inspectionFailure,...references()]);\n  return helperRetained;\n }\n if(graph.retained===undefined&&graph.unsupported===undefined)return;\n helperRetained=graph.retained??new RetainedProbeLifetime('helper original graph remains unproved',[cause,Error(graph.unsupported)],[...references(),...graph.references]);\n helperRetained.retain([cause,...references(),...graph.references]);return helperRetained;\n}\nasync function preserveHelperWork(work){try{return await work();}catch(cause){throw retainHelperFailure(cause)??cause;}}\nreturn {work:(work,cleanup,omitWrapper)=>runOwnedLowerScope(omitWrapper?work:()=>preserveHelperWork(work),cleanup,references,cutoffNs),retained:()=>helperRetained};}";
const phase2InspectorBoundarySource =
  "try{graph=inspectRawRetainedError(cause);}\n catch(inspectionFailure){\n  if(helperRetained!==undefined){helperRetained.retain([cause,inspectionFailure,...references()]);return helperRetained;}\n  helperRetained=new RetainedProbeLifetime('helper original graph inspection remains unproved',[cause,inspectionFailure],[cause,inspectionFailure,...references()]);\n  return helperRetained;\n }";
const phase2NominalModuleSource =
  "\nconst records = new WeakMap();\nconst retained = new Set();\nexport class RetainedProbeLifetime extends AggregateError {\n  constructor(message, failures, references) {\n    super([...failures], message);\n    records.set(this, [...references]);\n    retained.add(this);\n  }\n  static recognizes(value) { return value instanceof RetainedProbeLifetime && records.has(value); }\n  retain(references) {\n    const original = records.get(this);\n    if (original === undefined) throw Error('foreign retained lifetime refused');\n    original.push(...references);\n  }\n}\n\nexport function inspectRetainedProbeReferences(original) {\n  if (!RetainedProbeLifetime.recognizes(original))\n    throw Error('reference observer requires original nominal');\n  if (!retained.has(original))\n    throw Error('reference observer original strong retention absent');\n  const references = records.get(original);\n  if (references === undefined)\n    throw Error('reference observer original record absent');\n  return Object.freeze([...references]);\n}\n";
async function adaptPublicReleaseSource(
  source: string,
  owner: 'builder' | 'archive',
): Promise<string> {
  const ts = await import('typescript');
  const parsed = ts.createSourceFile(
    owner + '.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  function replace(original: string, before: string, after: string): string {
    if (original.split(before).length !== 2)
      throw Error('public release adaptation anchor differs: ' + before);
    return original.replace(before, after);
  }
  function adapt(name: string, change: (body: string) => string): void {
    const declarations = parsed.statements.filter(
      (node) =>
        (ts.isFunctionDeclaration(node) || ts.isInterfaceDeclaration(node)) &&
        node.name?.text === name,
    );
    const declaration = declarations.at(0);
    if (declarations.length !== 1 || declaration === undefined)
      throw Error('public release adaptation declaration differs: ' + name);
    const original = declaration.getText(parsed);
    source = replace(source, original, change(original));
  }
  if (owner === 'builder') {
    adapt('ConstructionOwnership', (body) =>
      replace(
        body,
        '  construction?: SourceFixtureConstruction;',
        '  readonly refuseRelease: (originals: readonly unknown[], primary?: { cause: unknown }) => void;\n  construction?: SourceFixtureConstruction;',
      ),
    );
    adapt('buildSourcePrerequisites', (body) =>
      replace(
        replace(
          body,
          '  archivePreflight: SourceArchivePreflight,',
          '  archivePreflight: SourceArchivePreflight,\n  refuseRelease: (originals: readonly unknown[], primary?: { cause: unknown }) => void,',
        ),
        'const ownership: ConstructionOwnership = {};',
        'const ownership: ConstructionOwnership = { refuseRelease };',
      ),
    );
    adapt('disposeConstruction', (body) =>
      replace(
        replace(
          body,
          'releaseSourceArchivePreflight(ownership.borrow)',
          'releaseSourceArchivePreflight(ownership.borrow, ownership.refuseRelease, ownership)',
        ),
        'releaseOriginalStaging(ownership.retention)',
        'releaseOriginalStaging(ownership.retention, ownership.refuseRelease, ownership)',
      ),
    );
    adapt('releaseOriginalStaging', (body) =>
      replace(
        replace(
          body,
          'retention: OriginalStagingRetention',
          'retention: OriginalStagingRetention, refuseRelease: (originals: readonly unknown[], primary?: { cause: unknown }) => void, ownership: { primary?: { cause: unknown } }',
        ),
        '  retention.isActive = false;',
        '  refuseRelease([ownership, retention, retention.lifetime], ownership.primary);\n  retention.isActive = false;',
      ),
    );
  } else {
    adapt('releaseSourceArchivePreflight', (body) =>
      replace(
        replace(
          replace(
            body,
            'borrow: SourceArchivePreflightBorrow',
            'borrow: SourceArchivePreflightBorrow, refuseRelease: (originals: readonly unknown[], primary?: { cause: unknown }) => void, ownership: { primary?: { cause: unknown } }',
          ),
          '    const settled = await Promise.allSettled([...lifetime.pending]);',
          '    refuseRelease([ownership, borrow, lifetime, lifetime.pending], ownership.primary);\n    const settled = await Promise.allSettled([...lifetime.pending]);',
        ),
        '    borrows.delete(borrow);',
        '    refuseRelease([ownership, borrow, lifetime, lifetime.pending, settled], ownership.primary);\n    borrows.delete(borrow);',
      ),
    );
  }
  return source;
}
const phase2Names = [
  'entry-ordinary',
  'entry-omit',
  'entry-restored',
  'postawait-ordinary',
  'postawait-omit',
  'postawait-restored',
  'b1-ordinary',
  'b1-omit',
  'b1-restored',
  'membership-ordinary',
  'membership-omit',
  'membership-restored',
  'helper-ordinary',
  'helper-omit',
  'helper-restored',
  'inspector-ordinary',
  'inspector-omit',
  'inspector-restored',
  'healthy-initial-short-I',
] as const;
function isPhase2Control(name: string): boolean {
  return (phase2Names as readonly string[]).includes(name);
}
function isOriginalHealthy(name: string): boolean {
  return name === 'healthy' || name === 'healthy-initial-short-I';
}
function isOriginalOmission(name: string): boolean {
  return name.startsWith('omit-') || name.endsWith('-omit');
}

/** Uses only the existing original component entry/custody infrastructure and fixed source-derived raw procedure. */
function createPhase2LifetimeEntry(
  directory: string,
  name: string,
  slots: readonly string[],
  reviewNotAfter: number,
): string {
  if (!isPhase2Control(name)) throw Error('phase2 finite selector refused');
  let source = createOriginalLifetimeEntry(directory, name, slots);
  let helperControl = phase2HelperControlSource;
  if (name === 'inspector-omit') {
    if (helperControl.split(phase2InspectorBoundarySource).length !== 2)
      throw Error('phase2 inspector omission anchor differs');
    helperControl = helperControl.replace(
      phase2InspectorBoundarySource,
      'graph=inspectRawRetainedError(cause);',
    );
  }
  const replace = (before: string, after: string) => {
    if (source.split(before).length !== 2)
      throw Error('phase2 entry anchor differs: ' + before.slice(0, 100));
    source = source.replace(before, after);
  };
  replace(
    'import {createSourceJournal,closeSourceJournal}',
    'import {createSourceJournal,closeSourceJournal,inspectSourceJournal}',
  );
  replace(
    'import {preflightSourceArchive,closeSourceArchivePreflight,',
    'import {preflightSourceArchive,borrowSourceArchivePreflight,closeSourceArchivePreflight,',
  );
  replace(
    "import {readMonotonicNs} from '",
    "import {isProxy as modelIsProxy} from 'node:util/types';\nimport {RetainedProbeLifetime} from 'stageb:retained-lifetime';\nimport {readMonotonicNs} from '",
  );
  replace(
    "import {RetainedProbeLifetime} from 'stageb:retained-lifetime';",
    "import {RetainedProbeLifetime,inspectRetainedProbeReferences} from 'stageb:retained-lifetime';",
  );
  replace(
    'let inputs,artifacts,journal,staging,archive,token,seam,ownership,archiveLifetime,closing,observedFailure;',
    `let inputs,artifacts,journal,staging,archive,token,seam,ownership,archiveLifetime,closing,observedFailure;
 const phase2Diagnostics=[];let phase2DiagnosticSequence=0;const phase2Comparisons={};
 function phase2Observe(label,samples){const observation={sequence:phase2DiagnosticSequence++,label,...samples};phase2Diagnostics.push(observation);return observation;}
 function phase2Sample(label){const P=performance.now();const M=readMonotonicNs();const W=Date.now();return phase2Observe(label,{P,M:String(M),W,IremainingMs:phase2InitialIInspection===undefined?undefined:phase2InitialIInspection.originalDeadline-P,JremainingMs:phase2InitialJDeadline===undefined?undefined:phase2InitialJDeadline-P,EremainingNs:String(cutoff-M),wallLowerMs:phase2InitialIInspection===undefined?undefined:W-phase2InitialIInspection.review.notBefore,wallUpperMs:phase2InitialIInspection===undefined?undefined:phase2InitialIInspection.review.notAfter-W});}
 function phase2FailureDiagnostics(originals){return {count:originals.length,first:originals.slice(0,16).map((original,index)=>({index,referenceIndex:references.indexOf(original),sameDependency:original===dependency,sameSticky:original===phase2Raw?.failure(),sameObserved:original===observedFailure})),omitted:Math.max(0,originals.length-16)};}
 const phase2RecoveryDescriptors=new Set();let phase2Raw;let phase2BoundaryFile;let phase2BoundaryCalls=0;let phase2CleanupCalls=0;let phase2Ordering;let phase2Primary;let phase2RawChild;let phase2RawCustody;let phase2RawJoin;let phase2RawNativeClose;let phase2InitialJDeadline;let phase2Bracket;let phase2InitialIInspection;let phase2HealthyCleanup=false;let phase2JournalBeforeRelease;let phase2RawSettlement;let phase2Directory;let phase2DirectoryIdentity;let phase2FixtureRemoved=false;let phase2JournalBeforeFault;let phase2JournalAfterCleanup;let phase2B1WaiterCalls=0;let phase2A2WaiterCalls=0;let phase2Delegations=0;let phase2A2DelegationOrder;let phase2B1DelegationOrder;
 const phase2Group=name.split('-')[0];
 const phase2Omission=name.endsWith('-omit');
 const phase2Ordinary=name.endsWith('-ordinary')||name.endsWith('-restored');
 ${phase2RawControlSource}
 ${helperControl}
 export function phase2B1Fault(){phase2BoundaryCalls++;if(phase2BoundaryFile===undefined)throw Error('phase2 B1 original fault descriptor absent');phase2Raw.acquisitions.retainFile(phase2BoundaryFile);}
 async function openPhase2Failure(){
  const original=await fs.open(directory+'/phase2-failed-close',sync.constants.O_CREAT|sync.constants.O_EXCL|sync.constants.O_RDWR,384);references.push(original);const nativeClose=original.close.bind(original);phase2RawNativeClose=nativeClose;original.close=async()=>{throw dependency;};phase2Raw.acquisitions.retainFile(original);protectedDescriptors.add(original.fd);const failure=await original.close().then(()=>{throw Error('phase2 original close fault missing');},cause=>cause);assert.equal(RetainedProbeLifetime.recognizes(failure),true);assert.equal(phase2Raw.failure(),failure);return failure;
 }
 function phase2HeldB1(){assert.equal(seam.retention.isActive,true,'PHASE2_B1_ACTIVE');assert.equal(retentionSettled,false,'PHASE2_B1_WAITER');assert.equal(phase2B1WaiterCalls,0,'PHASE2_B1_ORIGINAL_WAITER_CALLS');}
 function phase2HeldA2(){assert.equal(originalArchiveProbe.borrow(seam.borrow),archiveLifetime,'PHASE2_A2_REGISTRY');assert.equal(archiveLifetime.active,seam.borrow,'PHASE2_A2_ACTIVE');assert.equal(archiveReleased,false,'PHASE2_A2_WAITER');assert.equal(phase2A2WaiterCalls,0,'PHASE2_A2_ORIGINAL_WAITER_CALLS');}
 async function phase2ObserveRejection(promise){let cause;try{await promise;}catch(failure){cause=failure;}assert.ok(cause,'PHASE2_REFUSAL_REQUIRED');return cause;}
 function phase2Evidence(){const record=phase2Raw===undefined?undefined:[...phase2Raw.lifetime.records.values()][0];const custody=phase2RawJoin?.phase==='fulfilled'?phase2RawJoin.value[1]:undefined;const counts=snapshot=>snapshot===undefined?undefined:{dispatches:snapshot.records.filter(record=>record.payload.kind==='dispatch').length,resources:snapshot.resources.length,records:snapshot.records.length};return {diagnostics:{observations:phase2Diagnostics.slice(0,24),observationCount:phase2Diagnostics.length,omittedObservations:Math.max(0,phase2Diagnostics.length-24),comparisons:{...phase2Comparisons},originalState:archiveLifetime===undefined?undefined:{activeSameBorrow:archiveLifetime.active===seam.borrow,borrowRegistrySameLifetime:originalArchiveProbe.borrow(seam.borrow)===archiveLifetime,pendingCount:archiveLifetime.pending.size,A2waiterCalls:phase2A2WaiterCalls,B1waiterCalls:phase2B1WaiterCalls,A2delegationOrder:phase2A2DelegationOrder,B1delegationOrder:phase2B1DelegationOrder,completedDelegations:phase2Delegations,retentionActive:seam.retention.isActive},failedConstructions:originalLifetimeProbe.failed().slice(0,2).map(record=>({sameConstruction:record.ownership.construction===seam,sameBorrow:record.ownership.borrow===seam.borrow,sameRetention:record.ownership.retention===seam.retention,sameFailure:record.failure===observedFailure,sameRawRefusal:record.ownership.refuseRelease===phase2Raw?.refuse})),rawEvents:phase2FailureDiagnostics(phase2Raw?.events??[]),acquisitionFailures:phase2FailureDiagnostics(phase2Raw?.acquisitions.failures??[]),acquisitions:phase2Raw===undefined?[]:[...phase2Raw.acquisitions.records.values()].slice(0,2).map(record=>({kind:record.kind,descriptor:record.descriptor,currentDescriptor:record.original.fd,originalReferenceIndex:references.indexOf(record.original),recordReferenceIndex:references.indexOf(record),closeStarted:record.closing!==undefined,failed:record.failure!==undefined,failureSameDependency:record.failure===dependency})),childHistory:phase2Raw===undefined?[]:phase2Raw.lifetime.snapshot().slice(0,1).map(record=>({...record,failures:record.failures.slice(0,16),failureCount:record.failures.length,omittedFailures:Math.max(0,record.failures.length-16)})),operationCount:phase2Raw?.lifetime.operations.size,operations:phase2Raw===undefined?[]:[...phase2Raw.lifetime.operations.values()].slice(0,4).map(operation=>({phase:operation.phase,originalPromiseReferenceIndex:references.indexOf(operation.promise),causeSameSticky:operation.cause===phase2Raw.failure()})),settlement:phase2RawSettlement===undefined?undefined:{settled:phase2RawSettlement.settled,expired:phase2RawSettlement.expired,failures:phase2FailureDiagnostics(phase2RawSettlement.failures),retained:phase2RawSettlement.retained.length}},group:phase2Group,raw:record===undefined?undefined:{status:record.status,stdoutEOF:record.stdout.eof,stderrEOF:record.stderr.eof,streamsOriginal:record.child.stdout===record.stdout.stream&&record.child.stderr===record.stderr.stream,failures:record.failures.length,custody},rawAcquisitions:phase2Raw===undefined?undefined:{retained:phase2Raw.acquisitions.records.size,failures:phase2Raw.acquisitions.failures.length},initial:phase2Bracket,Ideadline:phase2InitialIInspection?.originalDeadline,journalBeforeFault:counts(phase2JournalBeforeFault),journalAfterCleanup:counts(phase2JournalAfterCleanup),normalDomainCleanup:phase2HealthyCleanup,fixtureRemoved:phase2FixtureRemoved};}
`,
  );
  replace(
    'return {phase,passed,name,acquisition,assertion:productionAssertion,',
    'return {phase,passed,name,acquisition,phase2:phase2Evidence(),assertion:productionAssertion,',
  );
  replace(
    ' inputs=await readSourceInputs();const inspection=inspectSourceInputs(inputs);',
    ` {
  const M0=readMonotonicNs();const P0=performance.now();const M1=readMonotonicNs();const W1=Date.now();const N=${JSON.stringify(reviewNotAfter)};const E=cutoff;
  assert.equal(typeof M0,'bigint');assert.equal(typeof M1,'bigint');assert.ok(M1>=M0,'PHASE2_INITIAL_MONOTONIC_BRACKET');assert.ok(Number.isFinite(P0)&&Number.isFinite(W1)&&Number.isFinite(N),'PHASE2_INITIAL_CLOCK_SAMPLES');
  const remainingMonotonicMs=Number((E-M1)/1000000n);const remainingWallMs=N-W1;assert.ok(remainingMonotonicMs>=60000&&remainingWallMs>=60000,'PHASE2_INITIAL_HEADROOM');
  const remainingMs=Math.min(Math.floor(remainingMonotonicMs),remainingWallMs);if(name==='healthy-initial-short-I')phase2InitialJDeadline=P0+Math.floor(remainingMs)-10000;phase2Bracket={M0:String(M0),P0,M1:String(M1),W1,N,E:String(E),remainingMonotonicMs,remainingWallMs,J0:phase2InitialJDeadline};references.push(phase2Bracket);
 }
 inputs=await readSourceInputs();const inspection=inspectSourceInputs(inputs);phase2InitialIInspection=inspection;
 if(name==='healthy-initial-short-I'){assert.equal(inspection.review.maximumDurationMs,10000);assert.equal(inspection.review.notAfter,${JSON.stringify(reviewNotAfter)});assert.ok(phase2InitialJDeadline-performance.now()>=30000,'PHASE2_FIXED_J0_CLEANUP_RESERVE');}
`,
  );
  replace(
    'deadline:inspection.originalDeadline});references.push(journal,journalFiles);',
    "deadline:name==='healthy-initial-short-I'?phase2InitialJDeadline:inspection.originalDeadline});references.push(journal,journalFiles);",
  );
  replace(" protection=name!=='healthy';", " protection=name!=='healthy-initial-short-I';");
  replace(
    'const building=buildSourcePrerequisites(inputs,artifacts,staging,journal,archive);',
    `phase2Directory=await fs.open(directory,sync.constants.O_RDONLY|sync.constants.O_DIRECTORY|sync.constants.O_NOFOLLOW);phase2DirectoryIdentity=await phase2Directory.stat({bigint:true});references.push(phase2Directory,phase2DirectoryIdentity);phase2JournalBeforeFault=await inspectSourceJournal(journal);assert.equal(phase2JournalBeforeFault.records.filter(record=>record.payload.kind==='dispatch').length,5);assert.equal(phase2JournalBeforeFault.resources.length,2);assert.equal(phase2JournalBeforeFault.records.length,16);references.push(phase2JournalBeforeFault);phase2Raw=createPhase2RawOwner();
 check();assert.ok(readMonotonicNs()<cutoff-8000000000n,'PHASE2_RAW_CHILD_ADMISSION_RESERVE');const actualRawSpawn=spawnOriginalNode(process.execPath,['--no-env-file','-e',"process.stdin.resume();process.stdin.on('end',()=>{});"],{cwd:directory,env:{LANG:'C',LC_ALL:'C',TZ:'UTC',BUN_RUNTIME_TRANSPILER_CACHE_PATH:'0'},stdio:['pipe','pipe','pipe']});references.push(actualRawSpawn,actualRawSpawn.stdin,actualRawSpawn.stdout,actualRawSpawn.stderr);phase2RawChild=actualRawSpawn;
 phase2RawCustody=new OriginalControlChild(actualRawSpawn,readMonotonicNs,cutoff,cutoff-4000000000n,expiry.promise,references,failure=>ageFailures.push(failure),undefined,true);references.push(phase2RawCustody);
 const actualRawRecord=phase2Raw.lifetime.retain(actualRawSpawn,65536,8192);references.push(actualRawRecord);actualRawSpawn.stdin.end();
 phase2RawJoin=await phase2Raw.lifetime.within(Promise.all([actualRawRecord.finished,phase2RawCustody.join()]));assert.equal(phase2RawJoin.phase,'fulfilled');assert.equal(actualRawRecord.status.code,0);assert.equal(actualRawRecord.status.signal,null);assert.equal(actualRawRecord.stdout.eof,true);assert.equal(actualRawRecord.stderr.eof,true);assert.equal(actualRawRecord.failures.length,0);assert.equal(phase2Raw.failure(),undefined);
 if(phase2Group==='b1'){phase2BoundaryFile=await fs.open(directory+'/phase2-b1-boundary',sync.constants.O_CREAT|sync.constants.O_EXCL|sync.constants.O_RDWR,384);references.push(phase2BoundaryFile);protectedDescriptors.add(phase2BoundaryFile.fd);}
 if(phase2Group==='entry'){const retained=await openPhase2Failure();phase2Primary=new AggregateError([retained],'phase2 nested original primary',{cause:retained});references.push(retained,phase2Primary);}
 const building=buildSourcePrerequisites(inputs,artifacts,staging,journal,archive,phase2Raw.refuse);`,
  );
  const start = " const internal=name==='internal-rejection';";
  const stop = " console.log(JSON.stringify(frame('observation',true)));";
  const startIndex = source.indexOf(start),
    stopIndex = source.indexOf(stop);
  if (
    startIndex < 0 ||
    stopIndex < startIndex ||
    source.includes(start, startIndex + 1) ||
    source.includes(stop, stopIndex + 1)
  )
    throw Error('phase2 original outcome block differs');
  const body = `
 const admitted=Promise.withResolvers();let registered;
 const originalB1Waiter=seam.retention.settle;const originalA2Waiter=archiveLifetime.releaseWaiter;assert.equal(typeof originalB1Waiter,'function');assert.equal(typeof originalA2Waiter,'function');references.push(originalB1Waiter,originalA2Waiter);seam.retention.settle=function(...args){phase2B1WaiterCalls++;const delegated=Reflect.apply(originalB1Waiter,this,args);phase2B1DelegationOrder=phase2Delegations++;return delegated;};archiveLifetime.releaseWaiter=function(...args){phase2A2WaiterCalls++;const delegated=Reflect.apply(originalA2Waiter,this,args);phase2A2DelegationOrder=phase2Delegations++;return delegated;};
 if(['entry','postawait','membership','healthy'].includes(phase2Group)){registered=originalArchiveProbe.register(archiveLifetime,()=>admitted.promise);references.push(admitted,registered);void registered.catch(failure=>references.push(failure));assert.equal(archiveLifetime.pending.has(admitted.promise),true);}
 void seam.retention.settled.then(()=>{retentionSettled=true;});void archiveLifetime.released.then(()=>{archiveReleased=true;});
 let stageClose,archiveClose;if(phase2Group!=='healthy'){stageClose=closeSourceStaging(staging);void stageClose.then(()=>{stagingClosed=true;},failure=>references.push(failure));archiveClose=closeSourceArchivePreflight(archive);void archiveClose.then(()=>{archiveClosed=true;},failure=>references.push(failure));references.push(stageClose,archiveClose);}
 if(phase2Group==='entry')seam.constructing.reject(phase2Primary);else seam.constructing.resolve();
 if(phase2Group!=='entry'){token=await building;const lifetime=originalLifetimeProbe.construction(token);ownership=lifetime.ownership;assert.equal(ownership.construction,seam);assert.equal(ownership.borrow,seam.borrow);assert.equal(ownership.retention,seam.retention);assert.equal(ownership.refuseRelease,phase2Raw.refuse,'PHASE2_SAME_RAW_CLOSURE');phase2Comparisons.sameRawClosure=true;references.push(lifetime,ownership,token);}
 if(phase2Group==='healthy'){
  closing=phase2Raw.close();references.push(closing);assert.equal(phase2Raw.close(),closing);await seam.closeEntered.promise;const cClosing=seam.close();phase2Sample('C-settlement-gate-fulfill');seam.closed.resolve();await cClosing;phase2Sample('C-original-fulfilled-observed');while(archiveLifetime.releasing===undefined){check();await Promise.race([closing,new Promise(resolve=>setImmediate(resolve))]);check();}
  phase2Sample('C-J-raw-settlement-observed');phase2JournalBeforeRelease=phase2Raw.journal();phase2RawSettlement=phase2Raw.settlement();references.push(phase2JournalBeforeRelease,phase2RawSettlement,cClosing);assert.ok(phase2JournalBeforeRelease);assert.equal(phase2RawSettlement.settled,true);assert.equal(phase2RawSettlement.expired,false);assert.equal(phase2RawSettlement.failures.length,0);assert.equal(phase2Raw.events.length,0);assert.equal(phase2Raw.acquisitions.records.size,0);assert.equal(phase2Raw.acquisitions.failures.length,0);assert.equal(phase2Raw.failure(),undefined);assert.ok(performance.now()<phase2InitialIInspection.originalDeadline,'PHASE2_HEALTHY_PREEXPIRY_ORIGINAL_SETTLEMENT');assert.equal(phase2Raw.memoized(),true);assert.equal(seam.closeCalls,1);
  const originalRelease=closeSourcePrerequisites(token);references.push(originalRelease);assert.equal(closeSourcePrerequisites(token),originalRelease);assert.equal(archiveLifetime.pending.has(admitted.promise),true);phase2HeldA2();phase2HeldB1();
  while(performance.now()<=phase2InitialIInspection.originalDeadline){check();await new Promise(resolve=>setTimeout(resolve,Math.max(1,Math.ceil(phase2InitialIInspection.originalDeadline-performance.now()))));}
  const gateTime=performance.now();const gateMonotonic=readMonotonicNs();const gateWall=Date.now();phase2Comparisons.gateWallInWindow=gateWall>=phase2InitialIInspection.review.notBefore&&gateWall<phase2InitialIInspection.review.notAfter;phase2Observe('gate-sampled',{P:gateTime,M:String(gateMonotonic),W:gateWall,IremainingMs:phase2InitialIInspection.originalDeadline-gateTime,JremainingMs:phase2InitialJDeadline-gateTime,EremainingNs:String(cutoff-gateMonotonic),wallLowerMs:gateWall-phase2InitialIInspection.review.notBefore,wallUpperMs:phase2InitialIInspection.review.notAfter-gateWall});assert.ok(gateWall>=phase2InitialIInspection.review.notBefore,'PHASE2_HEALTHY_GATE_WALL_LOWER');assert.ok(gateTime<phase2InitialJDeadline-10000&&gateMonotonic<cutoff-10000000000n&&gateWall<phase2InitialIInspection.review.notAfter-10000,'PHASE2_HEALTHY_GATE_RESERVE');assert.equal(phase2Raw.failure(),undefined);assert.equal(phase2Raw.events.length,0);phase2Observe('pre-gate',{P:gateTime,M:String(gateMonotonic),W:gateWall,IremainingMs:phase2InitialIInspection.originalDeadline-gateTime,JremainingMs:phase2InitialJDeadline-gateTime,EremainingNs:String(cutoff-gateMonotonic),wallLowerMs:gateWall-phase2InitialIInspection.review.notBefore,wallUpperMs:phase2InitialIInspection.review.notAfter-gateWall});admitted.resolve();await closing;await Promise.resolve();phase2Sample('A2-post-commit-observed');phase2Sample('B1-post-commit-observed');phase2Comparisons.originalDelegationOrder=phase2A2DelegationOrder===0&&phase2B1DelegationOrder===1;assert.equal(closeSourcePrerequisites(token),originalRelease);assert.equal(phase2Raw.close(),closing);assert.equal(originalArchiveProbe.borrow(seam.borrow),undefined);assert.equal(archiveLifetime.active,undefined);assert.equal(archiveReleased,true);assert.equal(seam.retention.isActive,false);assert.equal(retentionSettled,true);assert.equal(seam.close(),cClosing);assert.equal(seam.closeCalls,1);assert.equal(phase2Raw.failure(),undefined);
  assert.equal(phase2B1WaiterCalls,1,'PHASE2_HEALTHY_B1_ONCE');assert.equal(phase2A2WaiterCalls,1,'PHASE2_HEALTHY_A2_ONCE');assert.throws(()=>inspectSourceInputs(inputs),/deadline|expired/,'PHASE2_HEALTHY_EXPIRED_I_FORWARD_REFUSAL');
  const cleanupTime=performance.now();const cleanupMonotonic=readMonotonicNs();const cleanupWall=Date.now();phase2Observe('pre-cleanup',{P:cleanupTime,M:String(cleanupMonotonic),W:cleanupWall,IremainingMs:phase2InitialIInspection.originalDeadline-cleanupTime,JremainingMs:phase2InitialJDeadline-cleanupTime,EremainingNs:String(cutoff-cleanupMonotonic),wallLowerMs:cleanupWall-phase2InitialIInspection.review.notBefore,wallUpperMs:phase2InitialIInspection.review.notAfter-cleanupWall});phase2Comparisons.cleanupWallInWindow=cleanupWall>=phase2InitialIInspection.review.notBefore&&cleanupWall<phase2InitialIInspection.review.notAfter;assert.ok(cleanupWall>=phase2InitialIInspection.review.notBefore,'PHASE2_HEALTHY_CLEANUP_WALL_LOWER');assert.ok(cleanupTime<phase2InitialJDeadline-8000&&cleanupMonotonic<cutoff-8000000000n&&cleanupWall<phase2InitialIInspection.review.notAfter-8000,'PHASE2_HEALTHY_CLEANUP_RESERVE');
  for(const mock of retainedMocks.reverse()){mock.mockRestore();mockRestores++;}seam.retention.settle=originalB1Waiter;archiveLifetime.releaseWaiter=originalA2Waiter;assert.equal(mockRestores,14,'PHASE2_HEALTHY_INTERCEPTORS_RESTORED');
  stageClose=closeSourceStaging(staging);await stageClose;stagingClosed=true;archiveClose=closeSourceArchivePreflight(archive);await archiveClose;archiveClosed=true;assert.equal(archiveLifetime.closeRequested,true);assert.equal(archiveLifetime.closing,archiveClose);assert.equal(archiveLifetime.active,undefined);assert.equal(archiveLifetime.pending.size,0);assert.equal(archiveLifetime.tool.parent.fd,-1);if(archiveLifetime.tool.file!==undefined)assert.equal(archiveLifetime.tool.file.fd,-1);const priorAgeAttempts=ageAttempts;const priorRawRecords=phase2Raw.lifetime.records.size;await assert.rejects(borrowSourceArchivePreflight(inputs,journal,archive),{message:'source archive preflight borrow refused'},'PHASE2_HEALTHY_CLOSED_ORIGINAL_REBORROW_REFUSAL');assert.equal(archiveLifetime.active,undefined);assert.equal(archiveLifetime.pending.size,0);assert.equal(ageAttempts,priorAgeAttempts);assert.equal(phase2Raw.lifetime.records.size,priorRawRecords);phase2Comparisons.closedOriginalNoAdmission=true;phase2Comparisons.closedOriginalMemoized=archiveLifetime.closing===archiveClose;phase2Comparisons.closedOriginalDescriptors=archiveLifetime.tool.parent.fd===-1&&(archiveLifetime.tool.file===undefined||archiveLifetime.tool.file.fd===-1);phase2Sample('closed-original-reborrow-refused');
  assert.deepEqual(await fs.readdir(directory+'/coordinator'),[]);const cleanupJournal=await inspectSourceJournal(journal);phase2JournalAfterCleanup=cleanupJournal;references.push(cleanupJournal);assert.equal(cleanupJournal.records.filter(record=>record.payload.kind==='dispatch').length,6);assert.equal(cleanupJournal.resources.length,2);assert.equal(cleanupJournal.records.length,19);await closeSourceJournal(journal);for(const file of journalFiles)if(file.fd>=0)await file.close();await closeSourceArtifacts(artifacts);for(const file of files)await file.close();await closeSourceInputs(inputs);assert.ok(originalDescriptors.every(original=>{try{sync.fstatSync(original.descriptor);return false;}catch(cause){if(cause?.code!=='EBADF')throw cause;return true;}}),'PHASE2_HEALTHY_ORIGINAL_DESCRIPTOR_CLEANUP');assert.ok(files.every(file=>file.fd===-1));assert.ok(journalFiles.every(file=>file.fd===-1));const named=await fs.lstat(directory,{bigint:true});assert.equal(named.dev,phase2DirectoryIdentity.dev);assert.equal(named.ino,phase2DirectoryIdentity.ino);await phase2Directory.close();await fs.rm(directory,{recursive:true,force:false});let absent=false;try{await fs.lstat(directory);}catch(cause){if(cause?.code!=='ENOENT')throw cause;absent=true;}assert.equal(absent,true,'PHASE2_HEALTHY_OWN_FIXTURE_REMOVED');phase2FixtureRemoved=true;phase2HealthyCleanup=true;
 }else if(phase2Group==='helper'){
  const originalNominal=await openPhase2Failure();const nested=new AggregateError([originalNominal],'phase2 helper original nested',{cause:originalNominal});
  const cleanup=async()=>{phase2CleanupCalls++;throw Error('independent phase2 cleanup protection');};
  const helper=createPhase2HelperHandoff(()=>[...references,ownership,seam,phase2Raw],cutoff);references.push(helper);const outcome=await helper.work(()=>{throw nested;},cleanup,phase2Omission);
  assert.equal(phase2CleanupCalls,0,'PHASE2_HELPER_CLEANUP_ENTRY');assert.equal(outcome,originalNominal,'PHASE2_HELPER_ORIGINAL_NOMINAL');phase2Comparisons.helperOriginalNominal=outcome===originalNominal;
  const before=inspectRetainedProbeReferences(outcome);assert.ok(Object.isFrozen(before));assert.ok(before.includes(ownership)&&before.includes(seam)&&before.includes(nested),'PHASE2_HELPER_ORIGINAL_REFERENCE_MEMBERSHIP');references.push(before);
  const unsupported=Error('phase2 original unsupported graph');Object.defineProperty(unsupported,'cause',{get(){throw Error('phase2 accessor must not execute');}});references.push(unsupported);
  const unsupportedHelper=createPhase2HelperHandoff(()=>[...references,unsupported,ownership,seam,phase2Raw],cutoff);references.push(unsupportedHelper);const unsupportedOutcome=await unsupportedHelper.work(()=>{throw unsupported;},cleanup,false);assert.equal(RetainedProbeLifetime.recognizes(unsupportedOutcome),true);const unsupportedReferences=inspectRetainedProbeReferences(unsupportedOutcome);assert.ok(unsupportedReferences.includes(unsupported)&&unsupportedReferences.includes(ownership),'PHASE2_HELPER_UNSUPPORTED_REFERENCE_MEMBERSHIP');assert.equal(unsupportedOutcome.errors[0],unsupported);references.push(unsupportedReferences);assert.equal(phase2CleanupCalls,0,'PHASE2_HELPER_UNSUPPORTED_CLEANUP_ENTRY');
  const ordinary=Error('phase2 fully understood ordinary work failure'),protectedCleanup=Error('independent ordinary cleanup boundary protection');let ordinaryCleanupEntries=0;const ordinaryHelper=createPhase2HelperHandoff(()=>[...references,ordinary,ownership,seam,phase2Raw],cutoff);const ordinaryOutcome=await ordinaryHelper.work(()=>{throw ordinary;},async()=>{ordinaryCleanupEntries++;throw protectedCleanup;},false);assert.equal(ordinaryCleanupEntries,1,'PHASE2_HELPER_ORDINARY_WORK_IS_NOT_VETO');assert.equal(ordinaryHelper.retained(),undefined);assert.equal(ordinaryOutcome.errors.length,2);assert.equal(ordinaryOutcome.errors[0],ordinary);assert.equal(ordinaryOutcome.errors[1],protectedCleanup);references.push(ordinaryHelper,ordinaryOutcome,ordinary,protectedCleanup);phase2HeldA2();phase2HeldB1();
 }else if(phase2Group==='inspector'){
  const exception=Error('phase2 original prototype inspection failure');let inspectionCalls=0;const prototype=new Proxy({},{getPrototypeOf(){inspectionCalls++;throw exception;}});const operand=Object.create(prototype);const original=new AggregateError([operand],'phase2 actual throwing original graph');references.push(exception,prototype,operand,original);
  const newOriginals=[];const helper=createPhase2HelperHandoff(()=>[...references,ownership,seam,phase2Raw,...newOriginals],cutoff);references.push(helper);const cleanup=async()=>{phase2CleanupCalls++;throw Error('independent phase2 inspection cleanup protection');};const outcome=await helper.work(()=>{throw original;},cleanup,false);
  assert.equal(phase2CleanupCalls,0,'PHASE2_HELPER_INSPECTION_CLEANUP_ENTRY');assert.equal(RetainedProbeLifetime.recognizes(outcome),true);assert.equal(outcome.errors.length,2);assert.equal(outcome.errors[0],original);assert.equal(outcome.errors[1],exception);assert.equal(inspectionCalls,1);assert.equal(helper.retained(),outcome);
  const before=inspectRetainedProbeReferences(outcome);assert.ok(before.includes(original)&&before.includes(exception)&&before.includes(ownership)&&before.includes(seam),'PHASE2_HELPER_INSPECTOR_REFERENCE_MEMBERSHIP');const nextOriginal={original,seam,ownership};assert.equal(before.includes(nextOriginal),false);newOriginals.push(nextOriginal);const repeated=await helper.work(()=>{throw original;},cleanup,false);assert.equal(repeated,outcome,'PHASE2_HELPER_STICKY_IDENTITY');phase2Comparisons.helperStickyOriginal=repeated===outcome;assert.equal(inspectionCalls,1,'PHASE2_HELPER_STICKY_NO_REINSPECTION');const after=inspectRetainedProbeReferences(repeated);assert.ok(after.includes(nextOriginal)&&after.includes(original)&&after.includes(exception)&&before.every(original=>after.includes(original)),'PHASE2_HELPER_STICKY_NEW_REFERENCE_MEMBERSHIP');assert.equal(before.includes(nextOriginal),false);phase2Comparisons.inspectionPrimaryOriginal=outcome.errors[0]===original;phase2Comparisons.inspectionExceptionOriginal=outcome.errors[1]===exception;phase2Comparisons.inspectionMarkerRetained=after.includes(nextOriginal);phase2Comparisons.inspectionPriorReferencesRetained=before.every(original=>after.includes(original));references.push(before,after,nextOriginal);assert.equal(phase2CleanupCalls,0);phase2HeldA2();phase2HeldB1();
 }else{
  closing=phase2Group==='entry'?building:closeSourcePrerequisites(token);references.push(closing);let releaseState='pending';let releaseFailure;void closing.then(()=>{releaseState='fulfilled';},cause=>{releaseState='rejected';releaseFailure=cause;references.push(cause);});
  await seam.closeEntered.promise;seam.closed.resolve();
  if(phase2Group==='entry'){
   while(archiveLifetime.releasing===undefined){check();await new Promise(resolve=>setImmediate(resolve));check();}
   await Promise.race([closing.then(()=>{},()=>{}),new Promise(resolve=>setImmediate(resolve))]);phase2HeldA2();phase2HeldB1();phase2Ordering=Promise.withResolvers();references.push(phase2Ordering);console.log(JSON.stringify({phase:'entry-order',name,state:releaseState,originalPending:archiveLifetime.pending.has(admitted.promise),originalDescriptors}));await phase2Ordering.promise;
   const observedBeforeGate=releaseState;admitted.resolve();observedFailure=await phase2ObserveRejection(closing);
   assert.equal(observedBeforeGate,'rejected','PHASE2_ENTRY_REFUSAL_ORDER');phase2HeldA2();phase2HeldB1();assert.equal(phase2Raw.failure(),phase2Primary.errors[0],'PHASE2_ENTRY_STICKY_IDENTITY');
   const retainedOwnership=originalLifetimeProbe.failed().find(record=>record.ownership.construction===seam)?.ownership;assert.ok(retainedOwnership);const before=inspectRetainedProbeReferences(phase2Primary.errors[0]);assert.ok(before.includes(phase2Primary)&&before.includes(retainedOwnership),'PHASE2_RAW_ORIGINAL_REFERENCE_MEMBERSHIP');assert.equal(retainedOwnership.construction,seam);assert.equal(retainedOwnership.borrow,seam.borrow);assert.equal(retainedOwnership.retention,seam.retention);assert.equal(retainedOwnership.refuseRelease,phase2Raw.refuse);const recovery=[...phase2Raw.acquisitions.records.values()][0];assert.ok(recovery);phase2RecoveryDescriptors.add(recovery.original.fd);await phase2RawNativeClose();assert.equal(recovery.original.fd,-1);references.push(phase2RawNativeClose,recovery);const repeatedRelease=releaseSourceArchivePreflight(seam.borrow,retainedOwnership.refuseRelease,retainedOwnership);assert.equal(repeatedRelease,archiveLifetime.releasing,'PHASE2_ORIGINAL_MEMOIZED_REFUSAL_AFTER_RECOVERY');await assert.rejects(repeatedRelease,cause=>cause===phase2Primary.errors[0]);phase2HeldA2();phase2HeldB1();const newlySupplied={original:seam,ownership:retainedOwnership};assert.equal(before.includes(newlySupplied),false);let repeated;try{retainedOwnership.refuseRelease([newlySupplied],{cause:phase2Primary});}catch(cause){repeated=cause;}assert.equal(repeated,phase2Primary.errors[0],'PHASE2_STICKY_AFTER_TEST_RECOVERY');const after=inspectRetainedProbeReferences(repeated);phase2Comparisons.stickyAfterRecovery=repeated===phase2Primary.errors[0];phase2Comparisons.markerRetained=after.includes(newlySupplied);phase2Comparisons.priorReferencesRetained=before.every(original=>after.includes(original));assert.ok(after.includes(newlySupplied)&&before.every(original=>after.includes(original)),'PHASE2_RAW_STICKY_NEW_REFERENCE_MEMBERSHIP');assert.equal(before.includes(newlySupplied),false);references.push(before,after,newlySupplied,repeated);
   const failed=originalLifetimeProbe.failed().find(record=>record.ownership.construction===seam);assert.ok(failed);ownership=failed.ownership;assert.equal(ownership.primary.cause,phase2Primary);assert.equal(ownership.borrow,seam.borrow);assert.equal(ownership.retention,seam.retention);assert.ok(observedFailure instanceof AggregateError);assert.equal(observedFailure.cause,phase2Primary);references.push(failed,ownership);
  }else if(phase2Group==='postawait'||phase2Group==='membership'){
   while(archiveLifetime.releasing===undefined){check();await new Promise(resolve=>setImmediate(resolve));check();}assert.equal(archiveLifetime.pending.has(admitted.promise),true);assert.equal(releaseState,'pending');phase2HeldA2();phase2HeldB1();
   if(phase2Group==='postawait')await openPhase2Failure();else assert.equal(originalArchiveProbe.remove(seam.borrow),true);
   admitted.resolve();try{await closing;}catch(cause){observedFailure=cause;references.push(cause);}
   if(phase2Group==='postawait'){phase2HeldA2();phase2HeldB1();assert.equal(observedFailure,phase2Raw.failure(),'PHASE2_POSTAWAIT_NOMINAL_IDENTITY');const retained=inspectRetainedProbeReferences(observedFailure);assert.ok(retained.includes(ownership)&&retained.includes(archiveLifetime),'PHASE2_POSTAWAIT_ORIGINAL_REFERENCE_MEMBERSHIP');references.push(retained);}
   else{assert.equal(archiveLifetime.active,seam.borrow,'PHASE2_MEMBERSHIP_ACTIVE');assert.equal(archiveReleased,false,'PHASE2_MEMBERSHIP_WAITER');assert.equal(originalArchiveProbe.borrow(seam.borrow),undefined);phase2HeldB1();assert.equal(originalArchiveProbe.failed(archiveLifetime),true);assert.ok(observedFailure);}
  }else if(phase2Group==='b1'){
   try{await closing;}catch(cause){observedFailure=cause;references.push(cause);}assert.equal(phase2BoundaryCalls,1,'PHASE2_B1_BOUNDARY_ONCE');assert.equal(originalArchiveProbe.borrow(seam.borrow),undefined);assert.equal(archiveLifetime.active,undefined);await Promise.resolve();assert.equal(archiveReleased,true);assert.equal(phase2A2WaiterCalls,1);phase2HeldB1();assert.equal(observedFailure,phase2Raw.failure(),'PHASE2_B1_NOMINAL_IDENTITY');const retained=inspectRetainedProbeReferences(observedFailure);assert.ok(retained.includes(ownership)&&retained.includes(seam.retention),'PHASE2_B1_ORIGINAL_REFERENCE_MEMBERSHIP');references.push(retained);
  }else throw Error('phase2 group absent');
 }
 check();if(phase2Group!=='healthy'){assert.equal(stagingClosed,false);assert.equal(archiveClosed,false);for(const original of originalDescriptors.filter(original=>phase2Group!=='b1'||original.descriptor===originalDescriptors[0].descriptor||original.descriptor===originalDescriptors[1].descriptor))assert.deepEqual(identity(original.descriptor),original);}
`;
  source = source.slice(0, startIndex) + body + source.slice(stopIndex);
  replace(
    "else if(text.includes('\\n'))throw Error('component guardian command refused');",
    "else if(text==='advance\\n'){if(phase2Ordering===undefined)throw Error('phase2 entry-order handshake absent');phase2Ordering.resolve();text='';}else if(text.includes('\\n'))throw Error('component guardian command refused');",
  );
  replace(
    'clearInterval(keeper);clearTimeout(cutoffTimer);',
    "if(phase2Raw!==undefined){const rawJoined=await phase2RawCustody.join();references.push(rawJoined);if(!rawJoined.joined)throw Error('phase2 actual raw child close/EOF unproved');phase2Raw.lifetime.assertRelease();}clearInterval(keeper);clearTimeout(cutoffTimer);",
  );
  replace(
    'file.close=async()=>{if(protection&&protectedDescriptors.has(descriptor)){protectedCloses.push(descriptor);',
    'file.close=async()=>{if(protection&&protectedDescriptors.has(descriptor)&&!phase2RecoveryDescriptors.has(descriptor)){protectedCloses.push(descriptor);',
  );
  // The original all-authority observer has case-specific postcommit meaning in phase2.
  replace(
    "if(name!=='healthy')assertHeld();",
    "if(phase2Group==='healthy'){assert.equal(phase2HealthyCleanup,true,'PHASE2_HEALTHY_NORMAL_CLEANUP');}else if(phase2Group==='membership'){assert.equal(archiveLifetime.active,seam.borrow,'PHASE2_MEMBERSHIP_ACTIVE');assert.equal(archiveReleased,false,'PHASE2_MEMBERSHIP_WAITER');phase2HeldB1();}else if(phase2Group==='b1')phase2HeldB1();else{phase2HeldA2();phase2HeldB1();}",
  );
  source = source.replaceAll("name==='healthy'", "name==='healthy-initial-short-I'");
  return source;
}

const phase2Selected = process.env['PUNI_ORIGINAL_LIFETIME_PHASE2'];
if (phase2Selected !== undefined)
  test('original dependent lifetime phase2 selected', async () => {
    if (!isPhase2Control(phase2Selected)) throw Error('phase2 selection refused');
    await runOriginalLifetimeControl(phase2Selected);
  }, 120000);
