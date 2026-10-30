import { rejects } from 'node:assert/strict';

import { expect, spyOn, test } from 'bun:test';

import {
  assertSourceArchivePreflight,
  borrowSourceArchivePreflight,
  closeSourceArchivePreflight,
  preflightSourceArchive,
  releaseSourceArchivePreflight,
} from './source-stageb-archive-preflight';

test('foreign identities cannot cause admission, borrowing, release or close', async () => {
  await rejects(preflightSourceArchive({} as never, {} as never));
  await rejects(borrowSourceArchivePreflight({} as never, {} as never, {} as never));
  await rejects(assertSourceArchivePreflight({} as never, {} as never, {} as never));
  await rejects(releaseSourceArchivePreflight({} as never));
  await rejects(closeSourceArchivePreflight({} as never));
});

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, constants, openSync } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';

import { buildSourceArchiveBootstrap } from './source-stageb-archive-bootstrap';
import type { SourceReview } from './source-stageb-bootstrap';
const toolDirectory = '/tmp/puni-age-tool-20261026/verified-v1.3.2';
const officialAgeHash = 'eb7dd1b518f0a307c99cd97782623c5321da049154b04acd2d98d21aa7bc9b2c';
function digest(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
async function verifyOfficialTools() {
  const parent = await lstat(toolDirectory, { bigint: true });
  expect(parent.isDirectory()).toBe(true);
  expect(await realpath(toolDirectory)).toBe(toolDirectory);
  expect(parent.dev).toBe(66307n);
  expect(parent.ino).toBe(19367919n);
  expect(Number(parent.mode & 4095n)).toBe(448);
  expect(Number(parent.uid)).toBe(1000);
  expect(Number(parent.gid)).toBe(1000);
  for (const [name, size, sha256] of [
    ['age', 6977014, officialAgeHash],
    ['age-keygen', 4051278, '0a0009db842259d6717f7eeb30acb6b90d2a2eb924c6acd0a0db0ca1f1537899'],
  ] as const) {
    const identity = await lstat(`${toolDirectory}/${name}`, { bigint: true });
    expect(identity.isFile()).toBe(true);
    expect(identity.dev).toBe(66307n);
    expect(identity.ino).toBe(name === 'age' ? 19368316n : 19368317n);
    expect(Number(identity.mode & 4095n)).toBe(320);
    expect(identity.nlink).toBe(1n);
    expect(Number(identity.uid)).toBe(1000);
    expect(Number(identity.gid)).toBe(1000);
    expect(Number(identity.size)).toBe(size);
    expect(digest(await readFile(`${toolDirectory}/${name}`))).toBe(sha256);
  }
  return parent;
}
async function runOwned(
  command: string,
  argv: string[],
  cwd: string,
  descriptors: number[] = [],
  input?: Buffer,
) {
  const child = spawn(command, argv, {
    cwd,
    env: { LANG: 'C', LC_ALL: 'C' },
    stdio: ['pipe', 'pipe', 'pipe', 'ignore', 'ignore', 'ignore', 'ignore', ...descriptors],
  });
  if (child.stdin === null || child.stdout === null || child.stderr === null)
    throw Error('owned test pipes absent');
  const closed = new Promise<{ code: number | null; signal: string | null }>((resolve) =>
    child.once('close', (code, signal) => {
      resolve({ code, signal });
    }),
  );
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  let failure: unknown;
  const timer = setTimeout(() => {
    failure = Error('owned test child timed out');
    child.kill('SIGKILL');
  }, 10000);
  child.on('error', (cause) => {
    failure = cause;
  });
  child.stdout.on('data', (chunk: Buffer) => {
    stdout = Buffer.concat([stdout, chunk]);
    if (stdout.length > 131072) {
      failure = Error('test stdout overflow');
      child.kill('SIGKILL');
    }
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = Buffer.concat([stderr, chunk]);
    if (stderr.length > 65536) {
      failure = Error('test stderr overflow');
      child.kill('SIGKILL');
    }
  });
  child.stdin.on('error', (cause) => {
    failure = cause;
  });
  child.stdin.end(input);
  const exit = await closed;
  clearTimeout(timer);
  if (failure !== undefined) throw new Error('owned test child failed', { cause: failure });
  return { ...exit, stdout, stderr };
}
async function fixture(
  recipient: string,
  directory = toolDirectory,
  changedPolicy?: (policy: Record<string, unknown>) => void,
  duration = 30000,
) {
  const scratch = await mkdtemp('/tmp/puni-a2-author-20261026/fixture-');
  try {
    await chmod(scratch, 0o700);
    const registry = `${scratch}/registry`;
    const parentPath = `${scratch}/journal-parent`;
    await mkdir(registry, { mode: 0o700 });
    await mkdir(parentPath, { mode: 0o700 });
    const registryIdentity = await stat(registry, { bigint: true });
    const toolIdentity = await stat(directory, { bigint: true });
    const ageIdentity = await stat(`${directory}/age`, { bigint: true });
    const policy = {
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
        directory,
        directoryIdentity: {
          device: toolIdentity.dev.toString(),
          inode: toolIdentity.ino.toString(),
          uid: Number(toolIdentity.uid),
          gid: Number(toolIdentity.gid),
          mode: 448,
        },
        file: {
          name: 'age',
          bytes: Number(ageIdentity.size),
          sha256: digest(await readFile(`${directory}/age`)),
          uid: Number(ageIdentity.uid),
          gid: Number(ageIdentity.gid),
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
    changedPolicy?.(policy);
    const policyBytes = Buffer.from(`${JSON.stringify(policy)}\n`);
    const joins = {
      implementationSha: '1'.repeat(40),
      workflowSha: '2'.repeat(40),
      nonce: '3'.repeat(32),
      sourceSha: '4'.repeat(40),
      recipientFingerprint: digest(recipient),
      fixtureAuthoritySha256: '5'.repeat(64),
      rosterPolicySha256: '6'.repeat(64),
      archivePolicySha256: digest(policyBytes),
    };
    const manifest = Buffer.from(
      JSON.stringify({
        format: 'source-stageb-inputs',
        version: 1,
        ...joins,
        artifacts: [
          'prerequisites',
          'source-tree',
          'dependencies',
          'configuration',
          'startup-manifest',
          'openapi',
          'migration-manifest',
          'installed-authority-manifest',
          'solver-artifacts',
        ].map((slot) => ({ slot, bytes: 1, sha256: digest('x') })),
      }),
    );
    const review: SourceReview = {
      format: 'source-stageb-review',
      version: 1,
      ...joins,
      recipient,
      inputManifestSha256: digest(manifest),
      registry: {
        scope: '8'.repeat(32),
        device: registryIdentity.dev.toString(),
        inode: registryIdentity.ino.toString(),
        uid: Number(registryIdentity.uid),
        gid: Number(registryIdentity.gid),
        mode: 448,
      },
      notBefore: Date.now() - 1000,
      notAfter: Date.now() + 60000,
      maximumDurationMs: duration,
    };
    const artifact = await buildSourceArchiveBootstrap(
      Buffer.from(JSON.stringify(review)),
      policyBytes,
    );
    const bundle = `${scratch}/bootstrap.mjs`;
    const input = `${scratch}/input.json`;
    const script = `${scratch}/consumer.mjs`;
    await writeFile(bundle, artifact.bytes, { mode: 0o600 });
    await writeFile(input, manifest, { mode: 0o600 });
    const claim = {
      format: 'source-stageb-journal',
      version: 1,
      nonce: joins.nonce,
      implementationSha: joins.implementationSha,
      workflowSha: joins.workflowSha,
      sourceSha: joins.sourceSha,
      inputManifestSha256: review.inputManifestSha256,
    };
    const journalPath = `${parentPath}/source-stageb-${joins.nonce}`;
    await mkdir(journalPath, { mode: 0o700 });
    async function run(
      body: string,
      prelude = '',
      claimChanges: Record<string, unknown> = {},
      expectExpiredCleanup = false,
    ) {
      await writeFile(
        script,
        `import * as api from ${JSON.stringify(bundle)}; import { open, readFile, writeFile, chmod, rename } from 'node:fs/promises'; import { constants } from 'node:fs'; import { strict as assert } from 'node:assert'; import * as rawFs from 'node:fs/promises'; import * as rawChild from 'node:child_process'; import { PassThrough } from 'node:stream'; import { spyOn } from 'bun:test';
${prelude}
const inputs=await api.readSourceInputs();
const journal=await api.createSourceJournal({parent:await open(${JSON.stringify(parentPath)},constants.O_RDONLY|constants.O_DIRECTORY),directory:await open(${JSON.stringify(journalPath)},constants.O_RDONLY|constants.O_DIRECTORY),claim:${JSON.stringify({ ...claim, ...claimChanges })},deadline:api.inspectSourceInputs(inputs).originalDeadline});
try { ${body} } finally { try { if (${String(expectExpiredCleanup)}) await assert.rejects(api.closeSourceJournal(journal), /deadline exceeded/); else await api.closeSourceJournal(journal); } finally { await api.closeSourceInputs(inputs); } }`,
        { mode: 0o600 },
      );
      const inputFd = openSync(input, constants.O_RDONLY);
      const registryFd = openSync(registry, constants.O_RDONLY | constants.O_DIRECTORY);
      try {
        return await runOwned(process.execPath, [script], scratch, [inputFd, registryFd]);
      } finally {
        closeSync(inputFd);
        closeSync(registryFd);
      }
    }
    return {
      scratch,
      bundle,
      registry,
      journalPath,
      policyBytes,
      review,
      run,
      dispose: () => rm(scratch, { recursive: true }),
    };
  } catch (primary) {
    let cleanupFailure: unknown;
    try {
      await rm(scratch, { recursive: true });
    } catch (cleanup) {
      cleanupFailure = cleanup;
    }
    if (cleanupFailure !== undefined)
      throw new AggregateError([primary, cleanupFailure], 'owned fixture setup settlement failed', {
        cause: primary,
      });
    throw primary;
  }
}

test('actual official age pairing and same generated original I/J preflight/borrow/close lifecycle', async () => {
  await verifyOfficialTools();
  const identityDirectory = await mkdtemp('/tmp/puni-a2-author-20261026/identity-');
  await chmod(identityDirectory, 0o700);
  try {
    const key = `${identityDirectory}/identity.txt`;
    const generated = await runOwned(`${toolDirectory}/age-keygen`, ['-o', key], identityDirectory);
    expect(generated.code).toBe(0);
    expect((await stat(key)).mode & 4095).toBe(384);
    const recipientMatch = /Public key: (age1[023456789acdefghjklmnpqrstuvwxyz]{58})/.exec(
      generated.stderr.toString(),
    );
    if (recipientMatch?.[1] === undefined) throw Error('generated public recipient absent');
    const recipient = recipientMatch[1];
    const encrypted = await runOwned(
      `${toolDirectory}/age`,
      ['--encrypt', '--recipient', recipient],
      identityDirectory,
      [],
      Buffer.from('inert pairing fixture\n'),
    );
    expect(encrypted.code).toBe(0);
    const decrypted = await runOwned(
      `${toolDirectory}/age`,
      ['--decrypt', '--identity', key],
      identityDirectory,
      [],
      encrypted.stdout,
    );
    expect(decrypted.code).toBe(0);
    expect(decrypted.stdout.toString()).toBe('inert pairing fixture\n');
    const owned = await fixture(recipient);
    try {
      const observed = await owned.run(`
const original=await api.preflightSourceArchive(inputs,journal);
const snapshot=await api.inspectSourceJournal(journal);
assert.equal(snapshot.resources.length,1); assert.equal(snapshot.resources[0].status,'absence-recorded');
assert.equal(snapshot.resources[0].identity.kind,'helper'); assert.match(snapshot.resources[0].identity.start,/^[1-9][0-9]*$/);
await assert.rejects(api.preflightSourceArchive(inputs,journal));
await assert.rejects(api.borrowSourceArchivePreflight(inputs,journal,{...original}));
const borrow=await api.borrowSourceArchivePreflight(inputs,journal,original);
await assert.rejects(api.borrowSourceArchivePreflight(inputs,journal,original));
await assert.rejects(api.releaseSourceArchivePreflight({...borrow}));
const closing=api.closeSourceArchivePreflight(original); assert.equal(api.closeSourceArchivePreflight(original),closing);
await assert.rejects(api.borrowSourceArchivePreflight(inputs,journal,original));
await api.assertSourceArchivePreflight(inputs,journal,borrow);
let closed=false; closing.then(()=>{closed=true;}); await Bun.sleep(20); assert.equal(closed,false);
await api.releaseSourceArchivePreflight(borrow); await closing;
await assert.rejects(api.assertSourceArchivePreflight(inputs,journal,borrow));
console.log('original-lifecycle-and-standard-age-confirmed');`);
      expect(observed.stderr.toString()).toBe('');
      expect(observed.code).toBe(0);
      expect(observed.stdout.toString()).toContain('original-lifecycle-and-standard-age-confirmed');
    } finally {
      await owned.dispose();
    }
  } finally {
    await rm(identityDirectory, { recursive: true });
  }
}, 20000);

test('actual standard age invalid native recipient refuses and joins without fabricated helper membership', async () => {
  await verifyOfficialTools();
  const owned = await fixture(`age1${'q'.repeat(58)}`);
  try {
    const observed = await owned.run(
      `await assert.rejects(api.preflightSourceArchive(inputs,journal)); const snapshot=await api.inspectSourceJournal(journal); assert.equal(snapshot.phase,'cleanup-only'); for(const resource of snapshot.resources) assert.equal(resource.status,'absence-recorded'); console.log('invalid-recipient-refused-and-settled');`,
    );
    expect(observed.stderr.toString()).toBe('');
    expect(observed.code).toBe(0);
    expect(observed.stdout.toString()).toContain('invalid-recipient-refused-and-settled');
  } finally {
    await owned.dispose();
  }
}, 20000);

test('same original I refuses mismatched actual J first claim before tool or child effects', async () => {
  const joined = await fixture(`age1${'q'.repeat(58)}`);
  try {
    const observed = await joined.run(
      `let refusal;try{await api.preflightSourceArchive(inputs,journal);}catch(error){refusal=error;}assert.equal((await api.inspectSourceJournal(journal)).records.length,1);assert.match(String(refusal),/journal input join refused/);`,
      '',
      { sourceSha: '9'.repeat(40) },
    );
    expect(observed.stderr.toString()).toBe('');
    expect(observed.code).toBe(0);
  } finally {
    await joined.dispose();
  }
});

test('actual preflight consumes policy commitment before interpreting native path', async () => {
  const owned = await fixture(`age1${'q'.repeat(58)}`);
  try {
    const bundle = await readFile(owned.bundle, 'utf8');
    const changedDirectory = toolDirectory.replace('v1.3.2', 'v1.3.3');
    // The unapproved directory edit must be refused before the actual path acquisition boundary.
    expect(bundle.includes(toolDirectory)).toBe(true);
    await writeFile(owned.bundle, bundle.replace(toolDirectory, changedDirectory));
    const observed = await owned.run(
      `let refusal;try{await api.preflightSourceArchive(inputs,journal);}catch(error){refusal=error;}assert.equal(changedPathAcquisitions,0);assert.equal((await api.inspectSourceJournal(journal)).records.length,1);assert.match(String(refusal),/original archive policy join refused/);`,
      `let changedPathAcquisitions=0;const originalOpen=rawFs.open;spyOn(rawFs,'open').mockImplementation(async(...args)=>{if(args[0]===${JSON.stringify(changedDirectory)})changedPathAcquisitions++;return originalOpen(...args);});`,
    );
    expect(observed.stderr.toString()).toBe('');
    expect(observed.code).toBe(0);
  } finally {
    await owned.dispose();
  }
});

for (const [name, field, replacement, expected] of [
  ['parent inode', 'parent-inode', '999999999', 'tool parent refused'],
  ['tool mode', 'file-mode', '0o100700', 'tool file refused'],
  ['tool owner', 'file-uid', '99999', 'tool file refused'],
  ['tool nlink', 'file-nlink', '2', 'tool file refused'],
  ['tool size', 'file-size', '1', 'tool file refused'],
  ['same-byte inode replacement', 'file-inode', '999999999', 'tool identity changed'],
] as const)
  test(`named raw-IO ${name} fault reaches actual preflight guard before create`, async () => {
    const owned = await fixture(`age1${'q'.repeat(58)}`);
    const isParent = field.startsWith('parent');
    const property = field.split('-')[1];
    const path = isParent ? toolDirectory : `${toolDirectory}/age`;
    try {
      const observed = await owned.run(
        field === 'file-inode'
          ? `let refusal;try{await api.preflightSourceArchive(inputs,journal);}catch(error){refusal=error;}const describe=error=>error instanceof AggregateError?[error.message,...error.errors.map(describe)]:error instanceof Error?error.message:String(error);assert.equal((await api.inspectSourceJournal(journal)).records.length,1,JSON.stringify(describe(refusal)));assert.match(String(refusal),/${expected}/);`
          : `await assert.rejects(api.preflightSourceArchive(inputs,journal), /${expected}/); assert.equal((await api.inspectSourceJournal(journal)).records.length,1);`,
        `const originalLstat=rawFs.lstat; spyOn(rawFs,'lstat').mockImplementation(async (...args)=>{const identity=await originalLstat(...args); if(args[0]===${JSON.stringify(path)}) Object.defineProperty(identity,${JSON.stringify(property === 'inode' ? 'ino' : property)},{value:BigInt(${replacement})}); return identity;});`,
      );
      expect(observed.stderr.toString()).toBe('');
      expect(observed.code).toBe(0);
    } finally {
      await owned.dispose();
    }
  });

for (const code of ['ENOENT', 'EACCES'] as const)
  test(`named raw-IO tool ${code} preserves actual acquisition cause and closes parent`, async () => {
    const owned = await fixture(`age1${'q'.repeat(58)}`);
    try {
      const observed = await owned.run(
        `await assert.rejects(api.preflightSourceArchive(inputs,journal), error=>error.code==='${code}'); assert.equal((await api.inspectSourceJournal(journal)).records.length,1); assert.equal(parentSettled,1);`,
        `let parentSettled=0; const originalOpen=rawFs.open; spyOn(rawFs,'open').mockImplementation(async (...args)=>{if(args[0]===${JSON.stringify(`${toolDirectory}/age`)}) throw Object.assign(Error('${code}'),{code:'${code}'}); const file=await originalOpen(...args); if(args[0]===${JSON.stringify(toolDirectory)}) { const close=file.close.bind(file); file.close=async()=>{parentSettled++; await close();}; } return file; });`,
      );
      expect(observed.stderr.toString()).toBe('');
      expect(observed.code).toBe(0);
    } finally {
      await owned.dispose();
    }
  });

test('named raw-IO fast exit cannot invent helper identity or journal membership', async () => {
  const owned = await fixture(`age1${'q'.repeat(58)}`);
  try {
    const observed = await owned.run(
      `await assert.rejects(api.preflightSourceArchive(inputs,journal)); const snapshot=await api.inspectSourceJournal(journal); assert.equal(snapshot.phase,'cleanup-only'); assert.equal(snapshot.resources.length,0); assert.equal(actualClosed,true);`,
      `let actualClosed=false; const originalSpawn=rawChild.spawn; spyOn(rawChild,'spawn').mockImplementation((...args)=>{const child=originalSpawn(...args); const once=child.once.bind(child); child.once=(name,listener)=>name==='spawn' ? (once('close',()=>listener()),child) : once(name,listener); once('close',()=>{actualClosed=true;}); return child;});`,
    );
    expect(observed.stderr.toString()).toBe('');
    expect(observed.code).toBe(0);
  } finally {
    await owned.dispose();
  }
});

test('named raw-IO failed parent stat closes the actual acquired descriptor', async () => {
  const owned = await fixture(`age1${'q'.repeat(58)}`);
  try {
    const observed = await owned.run(
      `await assert.rejects(api.preflightSourceArchive(inputs,journal),/parent-stat-fault/); assert.equal(parentSettled,1);`,
      `let parentSettled=0; const originalOpen=rawFs.open; spyOn(rawFs,'open').mockImplementation(async(...args)=>{const file=await originalOpen(...args); if(args[0]===${JSON.stringify(toolDirectory)}) {file.stat=async()=>{throw Error('parent-stat-fault');}; const close=file.close.bind(file); file.close=async()=>{parentSettled++; await close();}; } return file;});`,
    );
    expect(observed.stderr.toString()).toBe('');
    expect(observed.code).toBe(0);
  } finally {
    await owned.dispose();
  }
});

test('named raw-IO late tool acquisition is joined and both original descriptors close after cutoff', async () => {
  const owned = await fixture(`age1${'q'.repeat(58)}`, toolDirectory, undefined, 150);
  try {
    const observed = await owned.run(
      `await assert.rejects(api.preflightSourceArchive(inputs,journal)); assert.equal(actualAcquired,true); assert.equal(parentSettled,1); assert.equal(fileSettled,1);`,
      `let actualAcquired=false,parentSettled=0,fileSettled=0; const originalOpen=rawFs.open; spyOn(rawFs,'open').mockImplementation(async(...args)=>{const file=await originalOpen(...args); if(args[0]===${JSON.stringify(toolDirectory)}) {const close=file.close.bind(file); file.close=async()=>{parentSettled++; await close();};} if(args[0]===${JSON.stringify(`${toolDirectory}/age`)}) {await Bun.sleep(200); actualAcquired=true; const close=file.close.bind(file); file.close=async()=>{fileSettled++; await close();};} return file;});`,
    );
    expect(observed.stderr.toString()).toBe('');
    expect(observed.code).toBe(0);
  } finally {
    await owned.dispose();
  }
});

async function withRecipient(use: (recipient: string) => Promise<void>) {
  await verifyOfficialTools();
  const directory = await mkdtemp('/tmp/puni-a2-author-20261026/test-identity-');
  await chmod(directory, 0o700);
  try {
    const key = `${directory}/identity.txt`;
    const generated = await runOwned(`${toolDirectory}/age-keygen`, ['-o', key], directory);
    if (generated.code !== 0 || ((await stat(key)).mode & 4095) !== 384)
      throw Error('private generated identity refused');
    const recipient = /Public key: (age1[023456789acdefghjklmnpqrstuvwxyz]{58})/.exec(
      generated.stderr.toString(),
    )?.[1];
    if (recipient === undefined) throw Error('generated public recipient absent');
    await use(recipient);
  } finally {
    await rm(directory, { recursive: true });
  }
}

test('named raw-IO hung drain is destroyed and actual original child joined after cutoff', async () => {
  await withRecipient(async (recipient) => {
    const owned = await fixture(recipient, toolDirectory, undefined, 500);
    try {
      const observed = await owned.run(
        `await assert.rejects(api.preflightSourceArchive(inputs,journal)); assert.equal(actualClosed,true); assert.equal(hung.destroyed,true);`,
        `let actualClosed=false; const hung=new PassThrough(); const originalSpawn=rawChild.spawn; spyOn(rawChild,'spawn').mockImplementation((...args)=>{const child=originalSpawn(...args); child.stdout.resume(); Object.defineProperty(child,'stdout',{value:hung}); child.once('close',()=>{actualClosed=true;}); return child;});`,
        {},
        true,
      );
      expect(observed.stderr.toString()).toBe('');
      expect(observed.code).toBe(0);
    } finally {
      await owned.dispose();
    }
  });
}, 15000);

test('named raw-IO late child spawn notification retains real child and joins after cutoff', async () => {
  await withRecipient(async (recipient) => {
    const owned = await fixture(recipient, toolDirectory, undefined, 500);
    try {
      const observed = await owned.run(
        `await assert.rejects(api.preflightSourceArchive(inputs,journal)); assert.equal(actualClosed,true); assert.equal(delivered,true);`,
        `let actualClosed=false,delivered=false; const originalSpawn=rawChild.spawn; spyOn(rawChild,'spawn').mockImplementation((...args)=>{const child=originalSpawn(...args); const once=child.once.bind(child); child.once=(name,listener)=>name==='spawn' ? (once('spawn',()=>setTimeout(()=>{delivered=true;listener();},700)),child) : once(name,listener); once('close',()=>{actualClosed=true;}); return child;});`,
        {},
        true,
      );
      expect(observed.stderr.toString()).toBe('');
      expect(observed.code).toBe(0);
    } finally {
      await owned.dispose();
    }
  });
}, 15000);

for (const fault of ['nonzero-exit', 'short-input', 'stdout-overflow', 'stderr-overflow'] as const)
  test(`named raw-IO ${fault} never mints and joins original real child`, async () => {
    await withRecipient(async (recipient) => {
      const owned = await fixture(recipient);
      let injection = '';
      if (fault === 'nonzero-exit')
        injection = `const once=child.once.bind(child); child.once=(name,listener)=>name==='close' ? once(name,()=>listener(7,null)) : once(name,listener);`;
      if (fault === 'short-input')
        injection = `const end=child.stdin.end.bind(child.stdin); child.stdin.end=(bytes,callback)=>end(bytes,()=>callback(Error('short-input-fault')));`;
      if (fault === 'stdout-overflow' || fault === 'stderr-overflow') {
        const stream = fault === 'stdout-overflow' ? 'stdout' : 'stderr';
        const count = fault === 'stdout-overflow' ? 65537 : 8193;
        injection = `child.${stream}.resume(); const overflow=new PassThrough(); Object.defineProperty(child,'${stream}',{value:overflow}); setTimeout(()=>overflow.end(Buffer.alloc(${String(count)},65)),20);`;
      }
      try {
        const observed = await owned.run(
          `await assert.rejects(api.preflightSourceArchive(inputs,journal)); assert.equal(actualClosed,true); const snapshot=await api.inspectSourceJournal(journal); assert.ok(snapshot.phase==='cleanup-only'||snapshot.phase==='open'); for(const resource of snapshot.resources) assert.equal(resource.status,'absence-recorded');`,
          `let actualClosed=false; const originalSpawn=rawChild.spawn; spyOn(rawChild,'spawn').mockImplementation((...args)=>{const child=originalSpawn(...args); child.once('close',()=>{actualClosed=true;}); ${injection} return child;});`,
        );
        expect(observed.stderr.toString()).toBe('');
        expect(observed.code).toBe(0);
      } finally {
        await owned.dispose();
      }
    });
  }, 15000);

test('named raw-IO failed acquisition cleanup preserves primary and actual parent close failure', async () => {
  const owned = await fixture(`age1${'q'.repeat(58)}`);
  try {
    const observed = await owned.run(
      `await assert.rejects(api.preflightSourceArchive(inputs,journal),error=>error instanceof AggregateError && error.cause===primaryFault && error.errors[0]===primaryFault && error.errors[1].errors[0]===cleanupFault); assert.equal(parentSettled,true);`,
      `const primaryFault=Error('tool-open-fault'),cleanupFault=Error('parent-close-fault'); let parentSettled=false; const originalOpen=rawFs.open; spyOn(rawFs,'open').mockImplementation(async(...args)=>{if(args[0]===${JSON.stringify(`${toolDirectory}/age`)}) throw primaryFault; const file=await originalOpen(...args); if(args[0]===${JSON.stringify(toolDirectory)}) {const close=file.close.bind(file); file.close=async()=>{await close();parentSettled=true;throw cleanupFault;};} return file;});`,
    );
    expect(observed.stderr.toString()).toBe('');
    expect(observed.code).toBe(0);
  } finally {
    await owned.dispose();
  }
});

test('original release after cutoff settles close without granting a renewed borrow', async () => {
  await withRecipient(async (recipient) => {
    const owned = await fixture(recipient, toolDirectory, undefined, 500);
    try {
      const observed = await owned.run(
        `const original=await api.preflightSourceArchive(inputs,journal); const borrow=await api.borrowSourceArchivePreflight(inputs,journal,original); const closing=api.closeSourceArchivePreflight(original); await Bun.sleep(600); await assert.rejects(api.assertSourceArchivePreflight(inputs,journal,borrow)); await api.releaseSourceArchivePreflight(borrow); await closing; await assert.rejects(api.borrowSourceArchivePreflight(inputs,journal,original));`,
        '',
        {},
        false,
      );
      expect(observed.stderr.toString()).toBe('');
      expect(observed.code).toBe(0);
    } finally {
      await owned.dispose();
    }
  });
}, 15000);

test('named raw-IO cleanup proc read failure still joins the genuine unreaped owned child', async () => {
  await withRecipient(async (recipient) => {
    const owned = await fixture(recipient);
    try {
      const observed = await owned.run(
        `await assert.rejects(api.preflightSourceArchive(inputs,journal)); assert.equal(actualClosed,true); assert.ok(procReads>4);`,
        String.raw`let actualClosed=false,procReads=0; const originalRead=rawFs.readFile; spyOn(rawFs,'readFile').mockImplementation(async(...args)=>{if(typeof args[0]==='string' && /^\/proc\/[0-9]+\/(status|stat)$/.test(args[0]) && ++procReads>4) throw Error('cleanup-proc-read-fault'); return originalRead(...args);}); const originalSpawn=rawChild.spawn; spyOn(rawChild,'spawn').mockImplementation((...args)=>{const child=originalSpawn(...args); child.once('close',()=>{actualClosed=true;}); child.stdin.end=(bytes,callback)=>{queueMicrotask(()=>callback(Error('short-input-fault')));return child.stdin;}; return child;});`,
      );
      expect(observed.stderr.toString()).toBe('');
      expect(observed.code).toBe(0);
    } finally {
      await owned.dispose();
    }
  });
}, 15000);

for (const [phase, ordinal] of [
  ['helper-ack', 3],
  ['write-dispatch', 5],
  ['write-ack', 6],
  ['remove-ack', 9],
] as const)
  test(`named raw-IO expiry during ${phase} joins held J publication and actual child`, async () => {
    await withRecipient(async (recipient) => {
      const owned = await fixture(recipient, toolDirectory, undefined, 500);
      try {
        const observed = await owned.run(
          `await assert.rejects(api.preflightSourceArchive(inputs,journal)); assert.equal(actualClosed,true); assert.equal(publicationSettled,true);`,
          `let actualClosed=false,publicationSettled=false;const originalOpen=rawFs.open;spyOn(rawFs,'open').mockImplementation(async(...args)=>{const file=await originalOpen(...args);if(typeof args[0]==='string' && args[0].endsWith('/${String(ordinal).padStart(8, '0')}.event.json') && (args[1]&3)===1){const sync=file.sync.bind(file);file.sync=async()=>{await Bun.sleep(650);await sync();publicationSettled=true;};}return file;});const originalSpawn=rawChild.spawn;spyOn(rawChild,'spawn').mockImplementation((...args)=>{const child=originalSpawn(...args);child.once('close',()=>{actualClosed=true;});return child;});`,
          {},
          true,
        );
        expect(observed.stderr.toString()).toBe('');
        expect(observed.code).toBe(0);
      } finally {
        await owned.dispose();
      }
    });
  }, 15000);

test('named raw-IO tool hash fault reaches actual preflight hash consumer before create', async () => {
  const owned = await fixture(`age1${'q'.repeat(58)}`);
  try {
    const observed = await owned.run(
      `let refusal;try{await api.preflightSourceArchive(inputs,journal);}catch(error){refusal=error;}assert.equal((await api.inspectSourceJournal(journal)).records.length,1);assert.match(String(refusal),/tool hash refused/);`,
      `const originalOpen=rawFs.open;spyOn(rawFs,'open').mockImplementation(async(...args)=>{const file=await originalOpen(...args);if(args[0]===${JSON.stringify(`${toolDirectory}/age`)}){const read=file.read.bind(file);file.read=async(...readArgs)=>{const observed=await read(...readArgs);if(observed.bytesRead>0) readArgs[0][0]^=1;return observed;};}return file;});`,
    );
    expect(observed.stderr.toString()).toBe('');
    expect(observed.code).toBe(0);
  } finally {
    await owned.dispose();
  }
});

for (const fault of [
  'proc-owner',
  'proc-start-drift',
  'proc-executable-inode',
  'proc-executable-hash',
] as const)
  test(`named raw-IO ${fault} refuses live helper observation and joins real child`, async () => {
    await withRecipient(async (recipient) => {
      const owned = await fixture(recipient);
      let injection = '';
      if (fault === 'proc-owner')
        injection = String.raw`const originalRead=rawFs.readFile;spyOn(rawFs,'readFile').mockImplementation(async(...args)=>{const bytes=await originalRead(...args);return typeof args[0]==='string' && /^\/proc\/[0-9]+\/status$/.test(args[0]) ? bytes.replace(/^Uid:.*$/m,'Uid: 99999 99999 99999 99999') : bytes;});`;
      if (fault === 'proc-start-drift')
        injection = String.raw`let reads=0;const originalRead=rawFs.readFile;spyOn(rawFs,'readFile').mockImplementation(async(...args)=>{const bytes=await originalRead(...args);if(typeof args[0]==='string' && /^\/proc\/[0-9]+\/stat$/.test(args[0]) && ++reads===2){const ending=bytes.lastIndexOf(') ');const fields=bytes.slice(ending+2).split(' ');fields[19]=String(BigInt(fields[19])+1n);return bytes.slice(0,ending+2)+fields.join(' ');}return bytes;});`;
      if (fault.startsWith('proc-executable'))
        injection = String.raw`const originalOpen=rawFs.open;spyOn(rawFs,'open').mockImplementation(async(...args)=>{const file=await originalOpen(...args);if(typeof args[0]==='string' && /^\/proc\/[0-9]+\/exe$/.test(args[0])){${fault === 'proc-executable-inode' ? `const stat=file.stat.bind(file);file.stat=async(...statArgs)=>{const identity=await stat(...statArgs);Object.defineProperty(identity,'ino',{value:999999999n});return identity;};` : `const read=file.read.bind(file);file.read=async(...readArgs)=>{const observed=await read(...readArgs);if(observed.bytesRead>0)readArgs[0][0]^=1;return observed;};`}}return file;});`;
      try {
        const observed = await owned.run(
          `await assert.rejects(api.preflightSourceArchive(inputs,journal));assert.equal(actualClosed,true);const snapshot=await api.inspectSourceJournal(journal);assert.equal(snapshot.resources.length,0);assert.equal(snapshot.phase,'cleanup-only');`,
          `let actualClosed=false;const originalSpawn=rawChild.spawn;spyOn(rawChild,'spawn').mockImplementation((...args)=>{const child=originalSpawn(...args);child.once('close',()=>{actualClosed=true;});return child;});${injection}`,
        );
        expect(observed.stderr.toString()).toBe('');
        expect(observed.code).toBe(0);
      } finally {
        await owned.dispose();
      }
    });
  }, 15000);

test('original borrowed consumer rejects tool drift then restores healthy use without foreign interference', async () => {
  await withRecipient(async (recipient) => {
    const owned = await fixture(recipient);
    try {
      const observed = await owned.run(
        `const original=await api.preflightSourceArchive(inputs,journal);await assert.rejects(api.borrowSourceArchivePreflight({...inputs},journal,original));await assert.rejects(api.borrowSourceArchivePreflight(inputs,{...journal},original));const borrow=await api.borrowSourceArchivePreflight(inputs,journal,original);await assert.rejects(api.assertSourceArchivePreflight({...inputs},journal,borrow));await assert.rejects(api.assertSourceArchivePreflight(inputs,{...journal},borrow));await assert.rejects(api.closeSourceArchivePreflight({...original}));const foreign=await import(${JSON.stringify(owned.bundle + '?other-closure')});await assert.rejects(foreign.borrowSourceArchivePreflight(inputs,journal,original));drift=true;await assert.rejects(api.assertSourceArchivePreflight(inputs,journal,borrow),/tool identity changed/);drift=false;await api.assertSourceArchivePreflight(inputs,journal,borrow);await api.releaseSourceArchivePreflight(borrow);await api.closeSourceArchivePreflight(original);`,
        `let drift=false;const originalLstat=rawFs.lstat;spyOn(rawFs,'lstat').mockImplementation(async(...args)=>{const identity=await originalLstat(...args);if(drift&&args[0]===${JSON.stringify(`${toolDirectory}/age`)})Object.defineProperty(identity,'ino',{value:999999999n});return identity;});`,
      );
      expect(observed.stderr.toString()).toBe('');
      expect(observed.code).toBe(0);
    } finally {
      await owned.dispose();
    }
  });
}, 15000);

test('fixed assembly consumes exact review-policy digest and bounded ordinary byte inputs', async () => {
  const owned = await fixture(`age1${'q'.repeat(58)}`);
  try {
    const reviewBytes = Buffer.from(JSON.stringify(owned.review));
    await rejects(
      buildSourceArchiveBootstrap(
        Buffer.from(JSON.stringify({ ...owned.review, archivePolicySha256: '0'.repeat(64) })),
        owned.policyBytes,
      ),
      /policy join refused/,
    );
    await rejects(
      buildSourceArchiveBootstrap(reviewBytes, Buffer.from(`${owned.policyBytes.toString()} `)),
      /policy join refused/,
    );
    await rejects(
      buildSourceArchiveBootstrap(Buffer.alloc(16385), owned.policyBytes),
      /byte bound/,
    );
    await rejects(
      buildSourceArchiveBootstrap(reviewBytes, new Proxy(owned.policyBytes, {})),
      /bytes refused/,
    );
    const decorated = Uint8Array.from(reviewBytes);
    Object.defineProperty(decorated, 'extra', { value: 1 });
    await rejects(buildSourceArchiveBootstrap(decorated, owned.policyBytes), /properties refused/);
    const emitted = await buildSourceArchiveBootstrap(reviewBytes, owned.policyBytes);
    expect(emitted.archivePolicySha256).toBe(digest(owned.policyBytes));
    expect(emitted.sha256).toBe(digest(emitted.bytes));
    const scan = new Bun.Transpiler({ loader: 'js', target: 'bun' }).scan(emitted.bytes);
    expect(scan.exports.includes('decodeSourceArchivePolicy')).toBe(false);
    expect(scan.exports.includes('preflightSourceArchive')).toBe(true);
  } finally {
    await owned.dispose();
  }
});

test('named raw-IO overflow during helper acknowledgement joins J transition before retiring actual helper', async () => {
  await withRecipient(async (recipient) => {
    const owned = await fixture(recipient);
    try {
      const observed = await owned.run(
        `await assert.rejects(api.preflightSourceArchive(inputs,journal));assert.equal(actualClosed,true);assert.equal(publicationSettled,true);const snapshot=await api.inspectSourceJournal(journal);assert.equal(snapshot.resources.length,1);assert.equal(snapshot.resources[0].status,'absence-recorded');assert.ok(snapshot.records.some(record=>record.payload?.operation==='stop-join'));`,
        `let actualClosed=false,publicationSettled=false;const originalOpen=rawFs.open;spyOn(rawFs,'open').mockImplementation(async(...args)=>{const file=await originalOpen(...args);if(typeof args[0]==='string'&&args[0].endsWith('/00000003.event.json')&&(args[1]&3)===1){const sync=file.sync.bind(file);file.sync=async()=>{overflow.end(Buffer.alloc(8193));await Bun.sleep(60);await sync();publicationSettled=true;};}return file;});let overflow;const originalSpawn=rawChild.spawn;spyOn(rawChild,'spawn').mockImplementation((...args)=>{const child=originalSpawn(...args);child.once('close',()=>{actualClosed=true;});child.stderr.resume();overflow=new PassThrough();Object.defineProperty(child,'stderr',{value:overflow});return child;});`,
      );
      expect(observed.stderr.toString()).toBe('');
      expect(observed.code).toBe(0);
    } finally {
      await owned.dispose();
    }
  });
}, 15000);

test('named raw-IO executable readback failure preserves primary and original proc descriptor close failure', async () => {
  await withRecipient(async (recipient) => {
    const owned = await fixture(recipient);
    try {
      const observed = await owned.run(
        `let refusal;try{await api.preflightSourceArchive(inputs,journal);}catch(error){refusal=error;}const failures=[];function collect(error){failures.push(error);if(error instanceof AggregateError)for(const nested of error.errors)collect(nested);if(error?.cause!==undefined)collect(error.cause);}collect(refusal);assert.ok(failures.some(error=>error?.message==='source archive preflight child executable hash refused'));assert.ok(failures.includes(closeFault));assert.equal(procClosed,true);`,
        String.raw`const closeFault=Error('proc-close-fault');let procClosed=false;const originalOpen=rawFs.open;spyOn(rawFs,'open').mockImplementation(async(...args)=>{const file=await originalOpen(...args);if(typeof args[0]==='string'&&/^\/proc\/[0-9]+\/exe$/.test(args[0])){const read=file.read.bind(file);file.read=async(...readArgs)=>{const observed=await read(...readArgs);if(observed.bytesRead>0)readArgs[0][0]^=1;return observed;};const close=file.close.bind(file);file.close=async()=>{await close();procClosed=true;throw closeFault;};}return file;});`,
      );
      expect(observed.stderr.toString()).toBe('');
      expect(observed.code).toBe(0);
    } finally {
      await owned.dispose();
    }
  });
}, 15000);

test('named compiler-output models cannot emit failed duplicate or unexpected fixed packages', async () => {
  const owned = await fixture(`age1${'q'.repeat(58)}`);
  const review = Buffer.from(JSON.stringify(owned.review));
  try {
    const build = Bun.build.bind(Bun);
    for (const fault of ['failed', 'duplicate-entry', 'duplicate-map'] as const) {
      const spy = spyOn(Bun, 'build').mockImplementation(async (options) => {
        const compiled = await build(options);
        if (fault === 'failed') return { ...compiled, success: false };
        const additions = compiled.outputs.filter(
          (output) => output.kind === (fault === 'duplicate-entry' ? 'entry-point' : 'sourcemap'),
        );
        return { ...compiled, outputs: [...compiled.outputs, ...additions] };
      });
      try {
        await rejects(
          buildSourceArchiveBootstrap(review, owned.policyBytes),
          fault === 'failed'
            ? /compilation failed/
            : fault === 'duplicate-entry'
              ? /output refused/
              : /maps refused/,
        );
      } finally {
        spy.mockRestore();
      }
    }
    const scanner = new Bun.Transpiler({ loader: 'js', target: 'bun' });
    const scan = scanner.scan.bind(scanner);
    for (const fault of ['extra-export', 'unexpected-import'] as const) {
      const spy = spyOn(Bun.Transpiler.prototype, 'scan').mockImplementation(function (
        this: Bun.Transpiler,
        ...args
      ) {
        const scanned = scan(...args);
        return fault === 'extra-export'
          ? { ...scanned, exports: [...scanned.exports, 'unexpected'] }
          : {
              ...scanned,
              imports: [
                ...scanned.imports,
                { path: 'node:net', kind: 'import-statement' as const },
              ],
            };
      });
      try {
        await rejects(
          buildSourceArchiveBootstrap(review, owned.policyBytes),
          fault === 'extra-export' ? /exports refused/ : /dependency refused/,
        );
      } finally {
        spy.mockRestore();
      }
    }
  } finally {
    await owned.dispose();
  }
});

test('named monotonic entry delay cannot extend the fixed preflight operation cutoff', async () => {
  const owned = await fixture(`age1${'q'.repeat(58)}`, toolDirectory, undefined, 60000);
  try {
    const observed = await owned.run(
      `let calls=0,clock=1100;spyOn(performance,'now').mockImplementation(()=>++calls===1?1000:clock);const originalOpen=rawFs.open;spyOn(rawFs,'open').mockImplementation(async(...args)=>{const file=await originalOpen(...args);if(args[0]===${JSON.stringify(`${toolDirectory}/age`)}){const read=file.read.bind(file);file.read=async(...readArgs)=>{const observed=await read(...readArgs);clock=31050;return observed;};}return file;});await assert.rejects(api.preflightSourceArchive(inputs,journal));assert.equal((await api.inspectSourceJournal(journal)).records.length,1);`,
    );
    expect(observed.stderr.toString()).toBe('');
    expect(observed.code).toBe(0);
  } finally {
    await owned.dispose();
  }
});
