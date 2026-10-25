import { rejects } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import { closeSourceInputs, inspectSourceInputs, readSourceInputs } from './source-stageb-inputs';

test('ordinary import has no trust material and foreign operations cannot admit a lifetime', async () => {
  expect(() => inspectSourceInputs({} as never)).toThrow();
  await rejects(closeSourceInputs({} as never), Error);
  await rejects(readSourceInputs(), Error);
  await rejects(readSourceInputs(), Error);
});

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { closeSync, constants, openSync } from 'node:fs';
import { chmod, link, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { buildSourceBootstrap, type SourceReview } from './source-stageb-bootstrap';

const artifactSlots = [
  'prerequisites',
  'source-tree',
  'dependencies',
  'configuration',
  'startup-manifest',
  'openapi',
  'migration-manifest',
  'installed-authority-manifest',
  'solver-artifacts',
];
function digest(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
/** Actual bounded parent consumer: one exact frame, EOF, then caller joins its child separately. */
async function receiveWitness(output: Readable): Promise<void> {
  let prefix = Buffer.alloc(0);
  let body: Buffer | undefined;
  let used = 0;
  for await (const chunk of output) {
    let bytes = Buffer.from(chunk);
    if (prefix.length < 4) {
      const count = Math.min(4 - prefix.length, bytes.length);
      prefix = Buffer.concat([prefix, bytes.subarray(0, count)]);
      bytes = bytes.subarray(count);
    }
    if (prefix.length === 4 && body === undefined) {
      const length = prefix.readUInt32BE();
      // Proof: parent-body-bound omission accepted a complete 257-byte padded observation.
      if (length < 1 || length > 256) throw Error('component prefix refused');
      body = Buffer.alloc(length);
    }
    if (body !== undefined) {
      // Proof: parent-trailing-fallback clipping accepted trailing bytes and an extra complete frame.
      if (bytes.length > body.length - used) throw Error('component trailing bytes refused');
      body.set(bytes, used);
      used += bytes.length;
    }
  }
  // Proof: parent-truncated-fallback decoded received bytes and accepted a body shorter than its declared prefix.
  if (body === undefined) throw Error('component truncated frame refused');
  if (prefix.length !== 4 || used !== body.length) throw Error('component truncated frame refused');
  const observation: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  if (
    typeof observation !== 'object' ||
    observation === null ||
    Array.isArray(observation) ||
    Object.keys(observation).sort().join() !== 'kind,observation' ||
    !('kind' in observation) ||
    !('observation' in observation) ||
    observation.kind !== 'source-inputs-component' ||
    // Proof: parent-closed-constant omission accepted the measured-shaped counterfeit from the actual inert producer.
    observation.observation !== 'verified-and-closed'
  )
    throw Error('component observation refused');
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'source-inputs-'));
  await chmod(directory, 0o700);
  const identity = await stat(directory, { bigint: true });
  const recipient = `age1${'q'.repeat(58)}`;
  const joins = {
    implementationSha: '1'.repeat(40),
    workflowSha: '2'.repeat(40),
    nonce: '3'.repeat(32),
    sourceSha: '4'.repeat(40),
    recipientFingerprint: digest(recipient),
    fixtureAuthoritySha256: '5'.repeat(64),
    rosterPolicySha256: '6'.repeat(64),
    archivePolicySha256: '7'.repeat(64),
  };
  const index = {
    format: 'source-stageb-inputs',
    version: 1,
    ...joins,
    artifacts: artifactSlots.map((slot) => ({ slot, bytes: 1, sha256: digest('x') })),
  };
  // Intentionally noncanonical whitespace/property order, preserved through actual A1.
  const { artifacts, ...indexFields } = index;
  const manifest = Buffer.from(
    ` \n${JSON.stringify({ artifacts, ...indexFields }, null, 2).replace('source-stageb-inputs', 'source-stageb-inp\\u0075ts')}\n`,
  );
  const now = Date.now();
  const review: SourceReview = {
    format: 'source-stageb-review',
    version: 1,
    ...joins,
    inputManifestSha256: digest(manifest),
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
    notAfter: now + 60000,
    maximumDurationMs: 30000,
  };
  const inputPath = join(directory, 'input.json');
  const bundlePath = join(directory, 'bootstrap.mjs');
  await writeFile(inputPath, manifest, { mode: 0o600 });
  async function assemble(changes: Partial<SourceReview> = {}) {
    const bytes = Buffer.from(JSON.stringify({ ...review, ...changes }));
    const artifact = await buildSourceBootstrap(bytes);
    await writeFile(bundlePath, artifact.bytes, { mode: 0o600 });
    return artifact;
  }
  async function run(program?: string, input = inputPath, registry = directory, preload = false) {
    const scriptPath = join(directory, 'consumer.mjs');
    if (program !== undefined)
      await writeFile(scriptPath, program.replaceAll('BUNDLE_PATH', JSON.stringify(bundlePath)), {
        mode: 0o600,
      });
    const inputFd = openSync(input, constants.O_RDONLY);
    const registryFd = openSync(registry, constants.O_RDONLY | constants.O_DIRECTORY);
    try {
      const arguments_ = preload
        ? ['--preload', scriptPath, bundlePath]
        : [program === undefined ? bundlePath : scriptPath];
      const child = spawn(process.execPath, arguments_, {
        stdio: [
          'ignore',
          'pipe',
          'pipe',
          'ignore',
          'ignore',
          'ignore',
          'pipe',
          inputFd,
          registryFd,
        ],
        env: {
          ...process.env,
          SOURCE_STAGEB_REVIEW_LITERAL: 'untrusted',
          SOURCE_STAGEB_INPUT_HASH: '0'.repeat(64),
        },
      });
      const output = child.stdio.at(6);
      if (!(output instanceof Readable)) throw Error('owned component output absent');
      const control: { timedOut: boolean; failure?: unknown } = { timedOut: false };
      const timer = setTimeout(() => {
        control.timedOut = true;
        try {
          child.kill('SIGKILL');
        } catch (failure) {
          control.failure = failure;
        }
        output.destroy();
      }, 2500);
      try {
        const closed: Promise<unknown[]> = once(child, 'close');
        const witness = receiveWitness(output).then(
          () => ({ ok: true as const }),
          (failure: unknown) => ({ ok: false as const, failure }),
        );
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (chunk) => {
          stdout += String(chunk);
        });
        child.stderr?.on('data', (chunk) => {
          stderr += String(chunk);
        });
        const [settled, observed] = await Promise.all([closed, witness]);
        if (control.failure !== undefined)
          throw new Error('owned component child control failed', { cause: control.failure });
        if (control.timedOut) throw Error('owned component child timed out and was joined');
        return {
          code: settled[0],
          stdout,
          stderr,
          witness: observed,
          // Proof: parent-child-close-status omission accepted a complete frame followed by child exit1.
          accepted: settled[0] === 0 && observed.ok,
        };
      } finally {
        clearTimeout(timer);
      }
    } finally {
      closeSync(inputFd);
      closeSync(registryFd);
    }
  }
  return {
    directory,
    inputPath,
    manifest,
    index,
    review,
    assemble,
    run,
    cleanup: () => rm(directory, { recursive: true }),
  };
}

test('actual generated fixed entry reads pinned bytes and publishes a permanent durable nonce claim', async () => {
  const owned = await fixture();
  try {
    await owned.assemble();
    const child = await owned.run();
    expect(child.stderr).toBe('');
    expect(child.code).toBe(0);
    expect(child.witness).toEqual({ ok: true });
    const claimPath = join(owned.directory, `source-stageb-${owned.review.nonce}.claim`);
    const claim: unknown = JSON.parse(await readFile(claimPath, 'utf8'));
    expect(claim).toHaveProperty('inputManifestSha256', digest(owned.manifest));
    expect((await stat(claimPath)).mode & 0o777).toBe(0o600);
    const replay = await owned.run();
    expect(replay.code).not.toBe(0);
    expect(replay.witness.ok).toBe(false);
    expect(await readFile(claimPath, 'utf8')).toBe(JSON.stringify(claim));
  } finally {
    await owned.cleanup();
  }
});

test('generated import is inert; original tokens alone can inspect, join and close with one memoized promise', async () => {
  const owned = await fixture();
  try {
    await owned.assemble();
    const child = await owned.run(`
      const rawfs = await import('node:fs'); rawfs.closeSync(6);
      const { readSourceInputs, inspectSourceInputs, assertSourceInputArtifact, closeSourceInputs } = await import(BUNDLE_PATH);
      const foreignModule = await import(BUNDLE_PATH + '?foreign-instance');
      const fs = await import('node:fs');
      if (fs.readdirSync(${JSON.stringify(owned.directory)}).some(name => name.endsWith('.claim'))) throw Error('import claimed');
      const pending = readSourceInputs();
      await readSourceInputs().then(() => { throw Error('duplicate admitted'); }, () => {});
      const token = await pending;
      const original = inspectSourceInputs(token);
      try { foreignModule.inspectSourceInputs(token); throw Error('another module accepted token'); } catch (failure) { if (failure.message === 'another module accepted token') throw failure; }
      await foreignModule.closeSourceInputs(token).then(() => { throw Error('another module closed token'); }, () => {});
      const foreign = [{}, {...token}, JSON.parse(JSON.stringify(token))];
      for (const copy of foreign) {
        try { inspectSourceInputs(copy); throw Error('foreign inspect admitted'); } catch (failure) { if (failure.message === 'foreign inspect admitted') throw failure; }
        try { assertSourceInputArtifact(copy, 'prerequisites', 1, '${digest('x')}'); throw Error('foreign join admitted'); } catch (failure) { if (failure.message === 'foreign join admitted') throw failure; }
        await closeSourceInputs(copy).then(() => { throw Error('foreign close admitted'); }, () => {});
      }
      original.manifestBytes.fill(0); original.reviewBytes.fill(0);
      const current = inspectSourceInputs(token);
      if (new TextDecoder().decode(current.reviewBytes) !== ${JSON.stringify(JSON.stringify(owned.review))}) throw Error('review snapshot changed');
      if (current.reviewSha256 !== '${digest(JSON.stringify(owned.review))}') throw Error('review snapshot hash changed');
      if (new TextDecoder().decode(current.manifestBytes) !== ${JSON.stringify(owned.manifest.toString())}) throw Error('snapshot changed');
      if (current.originalDeadline !== original.originalDeadline) throw Error('deadline renewed');
      assertSourceInputArtifact(token, 'prerequisites', 1, '${digest('x')}');
      try { assertSourceInputArtifact(token, 'prerequisites', 2, '${digest('x')}'); throw Error('wrong size admitted'); } catch (failure) { if (failure.message === 'wrong size admitted') throw failure; }
      for (const [slot, bytes, hash] of [['prerequisites', 0, '${digest('x')}'], ['prerequisites', 17179869185, '${digest('x')}'], ['prerequisites', 1, '0'.repeat(64)], ['unknown', 1, '${digest('x')}']]) { try { assertSourceInputArtifact(token, slot, bytes, hash); throw Error('invalid artifact observed'); } catch (failure) { if (failure.message === 'invalid artifact observed') throw failure; } }
      const closing = closeSourceInputs(token);
      if (closing !== closeSourceInputs(token)) throw Error('close promise changed');
      await closing;
      try { inspectSourceInputs(token); throw Error('closed admitted'); } catch (failure) { if (failure.message === 'closed admitted') throw failure; }
      await readSourceInputs().then(() => { throw Error('second invocation admitted'); }, () => {});
      fs.writeFileSync(${JSON.stringify(join(owned.directory, 'lifetime-assertions'))}, 'original-lifetime-passed');
    `);
    expect(child.stderr).toBe('');
    expect(child.code).toBe(0);
    expect(await readFile(join(owned.directory, 'lifetime-assertions'), 'utf8')).toBe(
      'original-lifetime-passed',
    );
  } finally {
    await owned.cleanup();
  }
});

test('same-owner wrong bytes and same-scope different registry refuse before publication', async () => {
  const owned = await fixture();
  const other = await fixture();
  try {
    await owned.assemble();
    await writeFile(
      other.inputPath,
      JSON.stringify({
        ...owned.index,
        artifacts: owned.index.artifacts.map((artifact, ordinal) =>
          ordinal === 0 ? { ...artifact, bytes: 2 } : artifact,
        ),
      }),
    );
    const wrong = await owned.run(undefined, other.inputPath);
    expect(wrong.code).not.toBe(0);
    expect(wrong.witness.ok).toBe(false);
    const substituted = await owned.run(undefined, owned.inputPath, other.directory);
    expect(substituted.code).not.toBe(0);
    expect(substituted.witness.ok).toBe(false);
    expect((await readdir(owned.directory)).filter((name) => name.endsWith('.claim'))).toEqual([]);
    expect((await readdir(other.directory)).filter((name) => name.endsWith('.claim'))).toEqual([]);
  } finally {
    await owned.cleanup();
    await other.cleanup();
  }
});

test('nonce-only exclusive publication admits at most one concurrent attempt and burns partial claims', async () => {
  const owned = await fixture();
  try {
    await owned.assemble();
    const children = await Promise.all([owned.run(), owned.run()]);
    expect(children.filter((child) => child.code === 0)).toHaveLength(1);
    const claimPath = join(owned.directory, `source-stageb-${owned.review.nonce}.claim`);
    const retained = await readFile(claimPath);
    const changedManifest = Buffer.from(
      JSON.stringify({ ...owned.index, workflowSha: 'a'.repeat(40) }),
    );
    await writeFile(owned.inputPath, changedManifest);
    await owned.assemble({
      workflowSha: 'a'.repeat(40),
      inputManifestSha256: digest(changedManifest),
    });
    const changed = await owned.run();
    expect(changed.code).not.toBe(0);
    expect(await readFile(claimPath)).toEqual(retained);
  } finally {
    await owned.cleanup();
  }
  const partial = await fixture();
  try {
    const claimPath = join(partial.directory, `source-stageb-${partial.review.nonce}.claim`);
    await writeFile(claimPath, '', { mode: 0o600 });
    await partial.assemble();
    const child = await partial.run();
    expect(child.code).not.toBe(0);
    expect(await readFile(claimPath, 'utf8')).toBe('');
  } finally {
    await partial.cleanup();
  }
});

test('closed index refuses every altered binding and nonfixed roster before creating a claim', async () => {
  const owned = await fixture();
  try {
    const variants = [
      ...[
        'implementationSha',
        'workflowSha',
        'nonce',
        'sourceSha',
        'recipientFingerprint',
        'fixtureAuthoritySha256',
        'rosterPolicySha256',
        'archivePolicySha256',
      ].map((name) => ({
        ...owned.index,
        [name]: '0'.repeat(name === 'nonce' ? 32 : name.endsWith('Sha') ? 40 : 64),
      })),
      { ...owned.index, extra: 1 },
      { ...owned.index, artifacts: owned.index.artifacts.slice(1) },
      { ...owned.index, artifacts: [...owned.index.artifacts].reverse() },
      {
        ...owned.index,
        artifacts: owned.index.artifacts.map((artifact, ordinal) =>
          ordinal === 0 ? { ...artifact, bytes: 0 } : artifact,
        ),
      },
      {
        ...owned.index,
        artifacts: owned.index.artifacts.map((artifact, ordinal) =>
          ordinal === 0 ? { ...artifact, bytes: 17179869185 } : artifact,
        ),
      },
      {
        ...owned.index,
        artifacts: owned.index.artifacts.map((artifact, ordinal) =>
          ordinal === 0 ? { ...artifact, sha256: 'a' } : artifact,
        ),
      },
      {
        ...owned.index,
        artifacts: owned.index.artifacts.map((artifact, ordinal) =>
          ordinal === 0 ? { ...artifact, path: '/ignored' } : artifact,
        ),
      },
    ];
    for (const variant of variants) {
      const manifest = Buffer.from(JSON.stringify(variant));
      await writeFile(owned.inputPath, manifest);
      await owned.assemble({ inputManifestSha256: digest(manifest) });
      const child = await owned.run();
      expect(child.code).not.toBe(0);
      expect(child.witness.ok).toBe(false);
      expect((await readdir(owned.directory)).some((name) => name.endsWith('.claim'))).toBe(false);
    }
  } finally {
    await owned.cleanup();
  }
});

test('actual current UID permissions refuse group writable input and wrong registry mode before publication', async () => {
  const owned = await fixture();
  try {
    await owned.assemble();
    await chmod(owned.inputPath, 0o620);
    expect((await owned.run()).code).not.toBe(0);
    await chmod(owned.inputPath, 0o600);
    await chmod(owned.directory, 0o750);
    expect((await owned.run()).code).not.toBe(0);
    await chmod(owned.directory, 0o700);
    expect((await readdir(owned.directory)).some((name) => name.endsWith('.claim'))).toBe(false);
  } finally {
    await chmod(owned.directory, 0o700);
    await owned.cleanup();
  }
});

test('exact noncanonical I bytes reach actual A1 and equal JSON re-encoding cannot replace them', async () => {
  const owned = await fixture();
  try {
    await owned.assemble();
    const archiveModule = join(import.meta.dir, 'source-stageb-archive.ts');
    const child = await owned.run(`
      const api = await import(BUNDLE_PATH); const archive = await import(${JSON.stringify(archiveModule)});
      const fs = await import('node:fs'); const token = await api.readSourceInputs();
      try {
        const first = api.inspectSourceInputs(token);
        const binding = { implementationSha: first.review.implementationSha, workflowSha: first.review.workflowSha, nonce: first.review.nonce, inputManifestSha256: first.review.inputManifestSha256, recipientFingerprint: first.review.recipientFingerprint };
        await new Promise(resolve => setTimeout(resolve, 20));
        const collector = archive.createSourceArchive({ binding, deadline: first.originalDeadline });
        archive.appendSourceArchiveMember(collector, { slot: 'input-manifest', ordinal: 0, bytes: first.manifestBytes });
        first.manifestBytes.fill(0); first.reviewBytes.fill(0);
        const inspection = api.inspectSourceInputs(token);
        if (new TextDecoder().decode(inspection.manifestBytes) !== ${JSON.stringify(owned.manifest.toString())}) throw Error('copied bytes leaked');
        archive.finishSourceArchiveSlot(collector, { slot: 'input-manifest', status: 'recorded' });
        for (const slot of ['approval-reference', 'setup', 'journal', 'capture-fd4', 'channel-transcript', 'observer-backend', 'observer-gateway', 'observer-mcp', 'observer-frontend', 'instrument-finalization', 'source-channel-settlement', 'runner-settlement', 'provider-cleanup', 'failures']) archive.finishSourceArchiveSlot(collector, { slot, status: 'unavailable' });
        const serialized = archive.serializeSourceArchive(collector);
        const envelope = JSON.parse(new TextDecoder().decode(serialized.bytes));
        const original = Buffer.from(envelope.members.find(member => member.slot === 'input-manifest').base64, 'base64');
        if (original.toString() !== ${JSON.stringify(owned.manifest.toString())}) throw Error('A1 reencoded input');
        if (envelope.index.members.find(member => member.slot === 'input-manifest').sha256 !== '${digest(owned.manifest)}') throw Error('A1 hash changed');
        const substituted = archive.createSourceArchive({ binding, deadline: inspection.originalDeadline });
        try { archive.appendSourceArchiveMember(substituted, { slot: 'input-manifest', ordinal: 0, bytes: Buffer.from(JSON.stringify(inspection.index)) }); throw Error('reencoding accepted'); } catch (failure) { if (failure.message === 'reencoding accepted') throw failure; }
        fs.writeFileSync(${JSON.stringify(join(owned.directory, 'a1-assertions'))}, 'exact-original-bytes');
      } finally { await api.closeSourceInputs(token); }
    `);
    expect(child.stderr).toBe('');
    expect(child.code).toBe(0);
    expect(await readFile(join(owned.directory, 'a1-assertions'), 'utf8')).toBe(
      'exact-original-bytes',
    );
  } finally {
    await owned.cleanup();
  }
});

test('original I cutoff reaches actual delayed A1 and J consumers without renewing their allowance', async () => {
  const owned = await fixture();
  try {
    await owned.assemble({ maximumDurationMs: 500 });
    const child = await owned.run(`
      const api = await import(BUNDLE_PATH);
      const archive = await import(${JSON.stringify(join(import.meta.dir, 'source-stageb-archive.ts'))});
      const journalApi = await import(${JSON.stringify(join(import.meta.dir, 'source-stageb-journal.ts'))});
      const fsp = await import('node:fs/promises');
      const fs = await import('node:fs');
      const token = await api.readSourceInputs();
      try {
        const inspection = api.inspectSourceInputs(token); const deadline = inspection.originalDeadline;
        await new Promise(resolve => setTimeout(resolve, 30));
        const binding = { implementationSha: inspection.review.implementationSha, workflowSha: inspection.review.workflowSha, nonce: inspection.review.nonce, inputManifestSha256: inspection.review.inputManifestSha256, recipientFingerprint: inspection.review.recipientFingerprint };
        const collector = archive.createSourceArchive({ binding, deadline });
        const parentPath = ${JSON.stringify(join(owned.directory, 'journal-parent'))};
        const journalPath = parentPath + '/source-stageb-' + inspection.review.nonce;
        await fsp.mkdir(parentPath, { mode: 0o700 }); await fsp.mkdir(journalPath, { mode: 0o700 });
        const parent = await fsp.open(parentPath, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
        const directory = await fsp.open(journalPath, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
        const journal = await journalApi.createSourceJournal({ parent, directory, deadline, claim: { format: 'source-stageb-journal', version: 1, nonce: inspection.review.nonce, implementationSha: inspection.review.implementationSha, workflowSha: inspection.review.workflowSha, sourceSha: inspection.review.sourceSha, inputManifestSha256: inspection.review.inputManifestSha256 } });
        await new Promise(resolve => setTimeout(resolve, Math.max(0, deadline - performance.now()) + 20));
        for (const action of [() => api.inspectSourceInputs(token), () => archive.appendSourceArchiveMember(collector, { slot: 'setup', ordinal: 0, bytes: Buffer.from('x') })]) {
          try { action(); throw Error('expired work admitted'); } catch (failure) { if (failure.message === 'expired work admitted') throw failure; }
        }
        let journalFailure;
        try { await journalApi.appendSourceIntent(journal, { operation: 'create', resourceClass: 'file', purpose: 'capture' }); } catch (failure) { journalFailure = failure; }
        if (journalFailure === undefined) throw Error('J expiry admitted');
        await journalApi.closeSourceJournal(journal).then(() => { throw Error('J lost primary'); }, failure => { if (failure !== journalFailure) throw failure; });
        if (parent.fd !== -1 || directory.fd !== -1) throw Error('J descriptors not settled');
        fs.writeFileSync(${JSON.stringify(join(owned.directory, 'cutoff-assertions'))}, 'original-cutoff');
      } finally { await api.closeSourceInputs(token); }
    `);
    expect(child.stderr).toBe('');
    expect(child.code).toBe(0);
    expect(await readFile(join(owned.directory, 'cutoff-assertions'), 'utf8')).toBe(
      'original-cutoff',
    );
  } finally {
    await owned.cleanup();
  }
});

for (const fault of [
  'input-identity',
  'input-eacces',
  'hold-sync',
  'hold-close',
  'late-open',
  'wall-expiry',
  'file-sync-fault',
  'directory-sync-fault',
  'readback-byte',
  'readback-inode',
  'partial-write',
  'primary-and-close',
] as const) {
  test(`controlled ${fault} joins all admitted IO, returns no token and settles transferred descriptors`, async () => {
    const owned = await fixture();
    try {
      await owned.assemble({
        maximumDurationMs: fault.startsWith('hold-') || fault === 'late-open' ? 150 : 30000,
      });
      const child = await owned.run(`
        const { mock } = await import('bun:test'); const actual = { ...await import('node:fs') };
        const fault = ${JSON.stringify(fault)}; const closed = []; let reader; let writer; let release; let reached;
        const held = new Promise(resolve => { reached = resolve; }); let writes = 0;
        let inputStats = 0; const realNow = Date.now; let expired = false; if (fault === 'wall-expiry') Date.now = () => realNow() + (expired ? 60000 : 0);
        mock.module('node:fs', () => ({ ...actual,
          open(path, flags, mode, callback) { actual.open(path, flags, mode, (failure, fd) => { if (!failure) { if (flags & actual.constants.O_CREAT) writer = fd; else reader = fd; } if (!failure && fault === 'late-open' && fd === writer) { release = () => callback(failure, fd); reached(); } else callback(failure, fd); }); },
          fsync(fd, callback) {
            if ((fault === 'file-sync-fault' && fd !== 8) || (fault === 'directory-sync-fault' && fd === 8) || (fault === 'primary-and-close' && fd === 8)) return callback(Error('controlled-sync-fault'));
            actual.fsync(fd, failure => {
              if (!failure && fault === 'hold-sync' && fd === 8) { release = () => callback(null); reached(); }
              else { if (!failure && fault === 'wall-expiry' && fd === 8) expired = true; callback(failure); }
            });
          },
          close(fd, callback) {
            closed.push(fd);
            actual.close(fd, failure => {
              if (!failure && fault === 'hold-close' && fd === 7) { release = () => callback(null); reached(); }
              else if (fault === 'primary-and-close' && fd === 8) callback(Error('controlled-close-fault'));
              else callback(failure);
            });
          },
          write(fd, bytes, offset, length, position, callback) {
            if (fault === 'partial-write') {
              writes++;
              if (writes > 1) return callback(Error('controlled-partial-write'), 0, bytes);
              return actual.write(fd, bytes, offset, 1, position, callback);
            }
            return actual.write(fd, bytes, offset, length, position, callback);
          },
          read(fd, bytes, offset, length, position, callback) { if (fault === 'input-eacces' && fd === 7) return callback(Object.assign(Error('controlled-input-EACCES'), { code: 'EACCES' }), 0, bytes); actual.read(fd, bytes, offset, length, position, (failure, count, buffer) => { if (!failure && fault === 'readback-byte' && fd === reader && count > 0) bytes[offset] ^= 1; callback(failure, count, buffer); }); },
          fstat(fd, options, callback) { actual.fstat(fd, options, (failure, identity) => { if (fd === 7) inputStats++; if (!failure && ((fault === 'readback-inode' && fd === reader) || (fault === 'input-identity' && fd === 7 && inputStats === 2))) identity.ino += 1n; callback(failure, identity); }); }
        }));
        const api = await import(BUNDLE_PATH); const pending = api.readSourceInputs();
        if (fault.startsWith('hold-') || fault === 'late-open') {
          await held;
          const before = [...closed];
          await api.closeSourceInputs({}).then(() => { throw Error('foreign close admitted'); }, () => {});
          await api.readSourceInputs().then(() => { throw Error('overlap admitted'); }, () => {});
          if (closed.join() !== before.join()) throw Error('foreign call changed ownership');
          if (fault === 'hold-sync') actual.fstatSync(7);
          await new Promise(resolve => setTimeout(resolve, 180)); release();
        }
        let primary;
        try { await pending; } catch (failure) { primary = failure; }
        if (!(primary instanceof AggregateError)) throw Error('failed IO admitted token');
        if (primary.cause !== primary.errors[0]) throw Error('primary cause lost');
        if (fault === 'input-eacces' && primary.errors[0].code !== 'EACCES') throw Error('unreadable cause lost');
        if (fault === 'primary-and-close' && (primary.errors.length !== 2 || primary.errors[0].message !== 'controlled-sync-fault' || primary.errors[1].message !== 'controlled-close-fault')) throw Error('primary/cleanup lost');
        if (closed.filter(fd => fd === 7).length !== 1 || closed.filter(fd => fd === 8).length !== 1 || new Set(closed).size !== closed.length) throw Error('descriptor not closed exactly once');
        await api.readSourceInputs().then(() => { throw Error('retry admitted'); }, () => {});
        if (new Set(closed).size !== closed.length) throw Error('retry closed descriptors');
        actual.writeFileSync(${JSON.stringify(join(owned.directory, 'fault-assertions'))}, 'refused-and-settled');
      `);
      expect(child.stderr).toBe('');
      expect(child.code).toBe(0);
      expect(await readFile(join(owned.directory, 'fault-assertions'), 'utf8')).toBe(
        'refused-and-settled',
      );
      const claimPath = join(owned.directory, `source-stageb-${owned.review.nonce}.claim`);
      if (fault === 'input-identity' || fault === 'input-eacces')
        expect((await readdir(owned.directory)).some((name) => name.endsWith('.claim'))).toBe(
          false,
        );
      else expect((await stat(claimPath)).isFile()).toBe(true);
      if (fault === 'partial-write') expect((await stat(claimPath)).size).toBe(1);
    } finally {
      await owned.cleanup();
    }
  });
}

test('held first positional read survives foreign operations and duplicate entry without descriptor interference', async () => {
  const owned = await fixture();
  try {
    await owned.assemble();
    const child = await owned.run(`
      const { mock } = await import('bun:test'); const actual = { ...await import('node:fs') };
      let release; let reached; const held = new Promise(resolve => { reached = resolve; }); const closed = []; let reads = 0;
      mock.module('node:fs', () => ({ ...actual,
        read(fd, bytes, offset, length, position, callback) { reads++; actual.read(fd, bytes, offset, length, position, (failure, count, buffer) => { if (fd === 7) { release = () => callback(failure, count, buffer); reached(); } else callback(failure, count, buffer); }); },
        close(fd, callback) { closed.push(fd); actual.close(fd, callback); }
      }));
      const api = await import(BUNDLE_PATH); const pending = api.readSourceInputs(); await held;
      for (const copy of [{}, JSON.parse('{}')]) {
        try { api.inspectSourceInputs(copy); throw Error('foreign inspect admitted'); } catch (failure) { if (failure.message === 'foreign inspect admitted') throw failure; }
        await api.closeSourceInputs(copy).then(() => { throw Error('foreign close admitted'); }, () => {});
      }
      let duplicateRefused = false;
      const duplicate = api.readSourceInputs().then(() => { throw Error('overlap admitted'); }, () => { duplicateRefused = true; });
      await new Promise(resolve => setTimeout(resolve, 20));
      if (closed.length !== 0 || reads !== 1 || !duplicateRefused) throw Error('duplicate/foreign IO');
      await duplicate;
      release(); const token = await pending; api.inspectSourceInputs(token);
      api.assertSourceInputArtifact(token, 'source-tree', 1, '${digest('x')}');
      const closing = api.closeSourceInputs(token); if (closing !== api.closeSourceInputs(token)) throw Error('close changed'); await closing;
      if (closed.filter(fd => fd === 7).length !== 1 || closed.filter(fd => fd === 8).length !== 1 || new Set(closed).size !== closed.length) throw Error('close count wrong');
      actual.writeFileSync(${JSON.stringify(join(owned.directory, 'held-assertions'))}, 'first-lifetime-intact');
    `);
    expect(child.stderr).toBe('');
    expect(child.code).toBe(0);
    expect(await readFile(join(owned.directory, 'held-assertions'), 'utf8')).toBe(
      'first-lifetime-intact',
    );
  } finally {
    await owned.cleanup();
  }
});

test('genuine close failure is memoized and foreign close cannot retry a recycled descriptor', async () => {
  const owned = await fixture();
  try {
    await owned.assemble();
    const child = await owned.run(`
      const { mock } = await import('bun:test'); const actual = { ...await import('node:fs') }; let closes = 0;
      const injected = Error('controlled-close-failure');
      mock.module('node:fs', () => ({ ...actual, close(fd, callback) { if (fd === 8) closes++; actual.close(fd, failure => callback(fd === 8 ? injected : failure)); } }));
      const api = await import(BUNDLE_PATH); const token = await api.readSourceInputs();
      const closing = api.closeSourceInputs(token);
      if (api.closeSourceInputs(token) !== closing) throw Error('failed close promise changed');
      let retained; try { await closing; } catch (failure) { retained = failure; }
      if (!(retained instanceof AggregateError) || retained.errors[0] !== injected) throw Error('cleanup failure lost');
      await api.closeSourceInputs({}).then(() => { throw Error('foreign close admitted'); }, () => {});
      if (api.closeSourceInputs(token) !== closing || closes !== 1) throw Error('close retried');
      actual.writeFileSync(${JSON.stringify(join(owned.directory, 'close-assertions'))}, 'failed-close-memoized');
    `);
    expect(child.stderr).toBe('');
    expect(child.code).toBe(0);
    expect(await readFile(join(owned.directory, 'close-assertions'), 'utf8')).toBe(
      'failed-close-memoized',
    );
  } finally {
    await owned.cleanup();
  }
});

for (const missing of [7, 8] as const) {
  test(`actual missing FD${String(missing)} refuses admission and duplicate entry does no further IO`, async () => {
    const owned = await fixture();
    try {
      await owned.assemble();
      const child = await owned.run(`
        const fs = await import('node:fs'); const api = await import(BUNDLE_PATH); fs.closeSync(${String(missing)});
        let primary; try { await api.readSourceInputs(); } catch (failure) { primary = failure; }
        if (!(primary instanceof AggregateError)) throw Error('missing descriptor admitted');
        const code = primary.errors[0].code;
        if (code !== ${missing === 7 ? "'ENOENT'" : "'EBADF'"}) throw Error('missing descriptor error lost');
        await api.readSourceInputs().then(() => { throw Error('failed invocation retried'); }, () => {});
        fs.writeFileSync(${JSON.stringify(join(owned.directory, 'missing-assertions'))}, 'missing-refused');
      `);
      expect(child.stderr).toBe('');
      expect(child.code).toBe(0);
      expect(await readFile(join(owned.directory, 'missing-assertions'), 'utf8')).toBe(
        'missing-refused',
      );
      expect((await readdir(owned.directory)).some((name) => name.endsWith('.claim'))).toBe(false);
    } finally {
      await owned.cleanup();
    }
  });
}

test('actual non-root unreadable input is EACCES at open and is distinct from missing input', async () => {
  const owned = await fixture();
  try {
    if (process.geteuid?.() === 0) throw Error('actual EACCES proof requires current non-root UID');
    await chmod(owned.inputPath, 0o000);
    let unreadable: unknown;
    try {
      openSync(owned.inputPath, constants.O_RDONLY);
    } catch (failure) {
      unreadable = failure;
    }
    expect(unreadable).toHaveProperty('code', 'EACCES');
    let absent: unknown;
    try {
      openSync(join(owned.directory, 'absent'), constants.O_RDONLY);
    } catch (failure) {
      absent = failure;
    }
    expect(absent).toHaveProperty('code', 'ENOENT');
  } finally {
    await chmod(owned.inputPath, 0o600);
    await owned.cleanup();
  }
});

function frame(body: Uint8Array): Buffer {
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(body.length);
  return Buffer.concat([prefix, body]);
}
test('actual parent refuses malformed component frames, counterfeit stdout and nonzero child settlement', async () => {
  const owned = await fixture();
  try {
    const valid = frame(
      Buffer.from('{"kind":"source-inputs-component","observation":"verified-and-closed"}'),
    );
    const oversized = Buffer.alloc(4);
    oversized.writeUInt32BE(257);
    const declaredLonger = Buffer.from(valid);
    declaredLonger.writeUInt32BE(valid.length - 3);
    for (const wire of [
      Buffer.alloc(0),
      valid.subarray(0, 2),
      valid.subarray(0, valid.length - 1),
      declaredLonger,
      oversized,
      frame(
        Buffer.from(
          '{"kind":"source-inputs-component","observation":"verified-and-closed"}'.padEnd(257, ' '),
        ),
      ),
      Buffer.concat([valid, Buffer.from([0])]),
      Buffer.concat([valid, valid]),
      frame(Buffer.from([255])),
      frame(Buffer.from('{}')),
      frame(
        Buffer.from(
          '{"kind":"source-inputs-component","observation":"verified-and-closed","extra":1}',
        ),
      ),
      frame(Buffer.from('{"kind":"source-inputs-component","observation":"measured"}')),
    ]) {
      const child = await owned.run(
        `const fs = await import('node:fs'); fs.writeSync(6, Buffer.from('${wire.toString('hex')}', 'hex')); fs.closeSync(6);`,
      );
      expect(child.code).toBe(0);
      expect(child.accepted).toBe(false);
    }
    const counterfeit = await owned.run(`console.log(${JSON.stringify(valid.toString('hex'))});`);
    expect(counterfeit.code).toBe(0);
    expect(counterfeit.accepted).toBe(false);
    const failed = await owned.run(
      `const fs = await import('node:fs'); fs.writeSync(6, Buffer.from('${valid.toString('hex')}', 'hex')); fs.closeSync(6); process.exitCode = 1;`,
    );
    expect(failed.witness.ok).toBe(true);
    expect(failed.code).toBe(1);
    expect(failed.accepted).toBe(false);
    const legitimate = await owned.run(
      `const fs = await import('node:fs'); fs.writeSync(6, Buffer.from('${valid.toString('hex')}', 'hex')); fs.closeSync(6);`,
    );
    expect(legitimate.accepted).toBe(true);
  } finally {
    await owned.cleanup();
  }
});

test('parent expiry refuses a valid buffered frame and joins only its exact held child', async () => {
  const owned = await fixture();
  try {
    const valid = frame(
      Buffer.from('{"kind":"source-inputs-component","observation":"verified-and-closed"}'),
    );
    await rejects(
      owned.run(
        `const fs = await import('node:fs'); fs.writeSync(6, Buffer.from('${valid.toString('hex')}', 'hex')); await new Promise(() => {}); setInterval(() => {}, 1000);`,
      ),
      new RegExp('timed out and was joined'),
    );
  } finally {
    await owned.cleanup();
  }
});

for (const fault of [
  'missing-output',
  'regular-output',
  'input-close-failure',
  'input-held-close',
  'write-failure',
  'close-failure',
  'held-close',
  'replaced-before-write',
  'replaced-before-close',
] as const) {
  test(`fixed main ${fault} cannot satisfy parent frame plus successful child settlement`, async () => {
    const owned = await fixture();
    try {
      await owned.assemble({
        maximumDurationMs: fault === 'held-close' || fault === 'input-held-close' ? 150 : 30000,
      });
      const marker = join(owned.directory, 'output-fault-assertions');
      const replacement = join(owned.directory, 'replacement');
      const attempts = join(owned.directory, 'forbidden-close-attempts');
      await writeFile(replacement, 'foreign-retained', { mode: 0o600 });
      const child = await owned.run(
        `
        const { mock } = await import('bun:test'); const actual = { ...await import('node:fs') };
        const fault = ${JSON.stringify(fault)}; let outputStats = 0; let swapped = false; let forbiddenCloseAttempts = 0; let frameWriteCompleted = false;
        function replace() {
          actual.closeSync(6);
          for (let attempt = 0; attempt < 7; attempt++) { const fd = actual.openSync(${JSON.stringify(replacement)}, actual.constants.O_RDWR); if (fd === 6) { swapped = true; return; } if (fd > 6) throw Error('controlled replacement skipped FD6'); }
          throw Error('controlled replacement did not occupy FD6');
        }
        if (fault === 'missing-output') actual.closeSync(6);
        if (fault === 'regular-output') replace();
        mock.module('node:fs', () => ({ ...actual,
          fstat(fd, options, callback) {
            if (fd === 6) {
              outputStats++;
              if (fault === 'replaced-before-write' && outputStats === 2) replace();
            }
            actual.fstat(fd, options, callback);
          },
          write(fd, bytes, offset, length, position, callback) {
            if (fd === 6 && length > 0 && fault === 'write-failure') return callback(Error('controlled-output-write-fault'), 0, bytes);
            actual.write(fd, bytes, offset, length, position, (failure, count, buffer) => {
              if (!failure && fd === 6 && length > 0 && count === length) { frameWriteCompleted = true; if (fault === 'replaced-before-close') replace(); }
              callback(failure, count, buffer);
            });
          },
          close(fd, callback) {
            if (fd === 6 && swapped) {
              forbiddenCloseAttempts++; actual.appendFileSync(${JSON.stringify(attempts)}, 'forbidden-close-attempt\\n', { mode: 0o600 });
              return callback(Error('foreign-output-close-attempted'));
            }
            actual.close(fd, failure => {
              if ((fd === 6 && fault === 'held-close') || (fd === 8 && fault === 'input-held-close')) setTimeout(() => callback(failure), 180);
              else if (fd === 8 && fault === 'input-close-failure') callback(Error('controlled-input-close-fault'));
              else if (fd === 6 && fault === 'close-failure') callback(Error('controlled-output-close-fault'));
              else callback(failure);
            });
          }
        }));
        process.once('exit', () => {
          let replacementOpen = false; let replacementUnchanged = false;
          if (swapped) {
            const identity = actual.fstatSync(6);
            replacementOpen = identity.isFile();
            replacementUnchanged = actual.readFileSync(6, 'utf8') === 'foreign-retained';
          }
          actual.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ replacementInstalled: swapped, forbiddenCloseAttempts, frameWriteCompleted, replacementOpen, replacementUnchanged }));
        });
      `,
        owned.inputPath,
        owned.directory,
        true,
      );
      expect(child.code).not.toBe(0);
      expect(child.accepted).toBe(false);
      const audit: unknown = JSON.parse(await readFile(marker, 'utf8'));
      if (
        fault === 'regular-output' ||
        fault === 'replaced-before-write' ||
        fault === 'replaced-before-close'
      ) {
        expect(audit).toHaveProperty('replacementInstalled', true);
        expect(audit).toHaveProperty('replacementOpen', true);
        expect(audit).toHaveProperty('replacementUnchanged', true);
      }
      if (fault === 'replaced-before-close') {
        expect(audit).toHaveProperty('frameWriteCompleted', true);
        expect(child.witness.ok).toBe(true);
      }
      // Proof: round1 cleanup identity omission returned count1 after installation/open/unchanged/frame preconditions above passed.
      expect(audit).toHaveProperty('forbiddenCloseAttempts', 0);
      expect((await readdir(owned.directory)).includes('forbidden-close-attempts')).toBe(false);
      if (fault === 'missing-output' || fault === 'regular-output') {
        expect((await readdir(owned.directory)).some((name) => name.endsWith('.claim'))).toBe(
          false,
        );
      } else {
        expect((await readdir(owned.directory)).some((name) => name.endsWith('.claim'))).toBe(true);
      }
      expect(await readFile(replacement, 'utf8')).toBe('foreign-retained');
    } finally {
      await owned.cleanup();
    }
  });
}

test('actual read-only pipe on fixed FD6 fails zero-byte preflight before claiming the nonce', async () => {
  const owned = await fixture();
  const inputFd = openSync(owned.inputPath, constants.O_RDONLY);
  const registryFd = openSync(owned.directory, constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    await owned.assemble();
    // The shell's finite pipeline creates a real read-only FIFO; a Node stdio socket is duplex.
    const child = spawn(
      '/bin/bash',
      [
        '-c',
        'printf x | "$@" 6<&0',
        'synthetic-readonly-fifo',
        process.execPath,
        join(owned.directory, 'bootstrap.mjs'),
      ],
      {
        stdio: [
          'ignore',
          'pipe',
          'pipe',
          'ignore',
          'ignore',
          'ignore',
          'ignore',
          inputFd,
          registryFd,
        ],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 2500);
    try {
      const settlement: unknown[] = await once(child, 'close');
      const code = settlement.at(0);
      expect(code).not.toBe(0);
    } finally {
      clearTimeout(timer);
    }
    expect(stderr).toContain('EBADF');
    expect(stdout).toBe('');
    expect((await readdir(owned.directory)).some((name) => name.endsWith('.claim'))).toBe(false);
  } finally {
    closeSync(inputFd);
    closeSync(registryFd);
    await owned.cleanup();
  }
});

test('synthetic controller refuses a changed otherwise valid candidate before invoking its entry', async () => {
  const owned = await fixture();
  try {
    const approved = await owned.assemble();
    const fixedApprovedDigest = approved.sha256;
    const unapproved = await owned.assemble({ maximumDurationMs: 30001 });
    let launches = 0;
    async function executeCandidate(bytes: Uint8Array) {
      if (digest(bytes) !== fixedApprovedDigest)
        throw Error('synthetic controller unapproved candidate');
      launches++;
      return owned.run();
    }
    await rejects(
      executeCandidate(unapproved.bytes),
      new RegExp('synthetic controller unapproved candidate'),
    );
    expect(launches).toBe(0);
    expect((await readdir(owned.directory)).some((name) => name.endsWith('.claim'))).toBe(false);
    await owned.assemble();
    const admitted = await executeCandidate(approved.bytes);
    expect(admitted.accepted).toBe(true);
    expect(launches).toBe(1);
  } finally {
    await owned.cleanup();
  }
});

test('controlled corrupted embedded review is refused by actual main before input claim', async () => {
  const owned = await fixture();
  try {
    const artifact = await owned.assemble();
    const source = new TextDecoder().decode(artifact.bytes);
    const original = '"format":"source-stageb-review"';
    if (source.split(original).length !== 2) throw Error('embedded fault target is not unique');
    const corrupted = source.replace(original, '"format":"source-stageb-corrupted"');
    await writeFile(join(owned.directory, 'bootstrap.mjs'), corrupted, { mode: 0o600 });
    const child = await owned.run();
    expect(child.code).not.toBe(0);
    expect(child.accepted).toBe(false);
    expect(child.stderr).toContain('source inputs review version refused');
    expect((await readdir(owned.directory)).some((name) => name.endsWith('.claim'))).toBe(false);
  } finally {
    await owned.cleanup();
  }
});

test('actual embedded recipient fingerprint mismatch refuses before claim independently of index joins', async () => {
  const owned = await fixture();
  try {
    const artifact = await owned.assemble();
    const source = new TextDecoder().decode(artifact.bytes);
    if (source.split(owned.review.recipient).length !== 2)
      throw Error('recipient fault target is not unique');
    const changed = source.replace(owned.review.recipient, `age1${'p'.repeat(58)}`);
    await writeFile(join(owned.directory, 'bootstrap.mjs'), changed, { mode: 0o600 });
    const child = await owned.run();
    expect(child.code).not.toBe(0);
    expect(child.accepted).toBe(false);
    expect(child.stderr).toContain('source inputs recipient fingerprint refused');
    expect((await readdir(owned.directory)).some((name) => name.endsWith('.claim'))).toBe(false);
  } finally {
    await owned.cleanup();
  }
});

for (const boundary of ['readwrite', 'hardlinked'] as const) {
  test(`actual ${boundary} FD7 refuses before nonce publication`, async () => {
    const owned = await fixture();
    try {
      await owned.assemble();
      if (boundary === 'hardlinked')
        await link(owned.inputPath, join(owned.directory, 'input-alias'));
      const preload =
        boundary === 'readwrite'
          ? `
        const fs = await import('node:fs'); fs.closeSync(7); let replaced = false;
        for (let attempt = 0; attempt < 8; attempt++) { const fd = fs.openSync(${JSON.stringify(owned.inputPath)}, fs.constants.O_RDWR); if (fd === 7) { replaced = true; break; } if (fd > 7) throw Error('FD7 replacement skipped'); }
        if (!replaced) throw Error('FD7 replacement missing');
      `
          : undefined;
      const child = await owned.run(
        preload,
        owned.inputPath,
        owned.directory,
        boundary === 'readwrite',
      );
      expect(child.code).not.toBe(0);
      expect(child.accepted).toBe(false);
      expect(child.stderr).toContain(
        boundary === 'readwrite' ? 'readonly input required' : 'file refused',
      );
      expect((await readdir(owned.directory)).some((name) => name.endsWith('.claim'))).toBe(false);
    } finally {
      await owned.cleanup();
    }
  });
}

test('nonce collision survives a coherent workflow and exact manifest hash change', async () => {
  const owned = await fixture();
  try {
    await owned.assemble();
    expect((await owned.run()).accepted).toBe(true);
    const before = (await readdir(owned.directory)).filter((name) => name.endsWith('.claim'));
    expect(before).toHaveLength(1);
    const claimName = before.at(0);
    if (claimName === undefined) throw Error('original claim missing');
    const retained = await readFile(join(owned.directory, claimName));
    const changedManifest = Buffer.from(
      JSON.stringify({ ...owned.index, workflowSha: 'a'.repeat(40) }),
    );
    await writeFile(owned.inputPath, changedManifest);
    await owned.assemble({
      workflowSha: 'a'.repeat(40),
      inputManifestSha256: digest(changedManifest),
    });
    const repeated = await owned.run();
    expect(repeated.code).not.toBe(0);
    expect(repeated.accepted).toBe(false);
    expect((await readdir(owned.directory)).filter((name) => name.endsWith('.claim'))).toEqual(
      before,
    );
    expect(await readFile(join(owned.directory, claimName))).toEqual(retained);
  } finally {
    await owned.cleanup();
  }
});
