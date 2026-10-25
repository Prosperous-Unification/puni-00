import { rejects } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import { buildSourceBootstrap } from './source-stageb-bootstrap';

test('refuses unresolved review material before producing package bytes', async () => {
  await rejects(buildSourceBootstrap(new TextEncoder().encode('{}')), Error);
});

import { createHash } from 'node:crypto';

import { decodeSourceReview } from './source-stageb-bootstrap';
const recipient = `age1${'q'.repeat(58)}`;
function proposed() {
  return {
    format: 'source-stageb-review',
    version: 1,
    implementationSha: '1'.repeat(40),
    workflowSha: '2'.repeat(40),
    nonce: '3'.repeat(32),
    inputManifestSha256: '4'.repeat(64),
    sourceSha: '5'.repeat(40),
    recipient,
    recipientFingerprint: createHash('sha256').update(recipient).digest('hex'),
    fixtureAuthoritySha256: '6'.repeat(64),
    rosterPolicySha256: '7'.repeat(64),
    archivePolicySha256: '8'.repeat(64),
    registry: { scope: '9'.repeat(32), device: '1', inode: '2', uid: 1000, gid: 1000, mode: 448 },
    notBefore: 1000,
    notAfter: 2000,
    maximumDurationMs: 1000,
  };
}
function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

test('assembly is deterministic and exact changed review bytes change candidate identity without conferring approval', async () => {
  const bytes = encode(proposed());
  const first = await buildSourceBootstrap(bytes);
  const second = await buildSourceBootstrap(bytes);
  expect(first.bytes).toEqual(second.bytes);
  expect(first.sha256).toBe(second.sha256);
  expect(first.maps).toEqual(second.maps);
  const changed = await buildSourceBootstrap(encode({ ...proposed(), nonce: 'a'.repeat(32) }));
  expect(changed.sha256).not.toBe(first.sha256);
  // A synthetic controller retains its approved digest independently of the candidate.
  const approved = first.sha256;
  const admits = (candidate: Uint8Array) =>
    createHash('sha256').update(candidate).digest('hex') === approved;
  expect(admits(first.bytes)).toBe(true);
  expect(admits(changed.bytes)).toBe(false);
  bytes.fill(0);
  expect(first.reviewSha256).toBe(createHash('sha256').update(encode(proposed())).digest('hex'));
});

test('one closed review decoder rejects malformed joins, bounds, extra fields and noncanonical recipient material', async () => {
  for (const changes of [
    { version: 2 },
    { implementationSha: 'a'.repeat(39) },
    { workflowSha: 'A'.repeat(40) },
    { nonce: 'x'.repeat(32) },
    { sourceSha: '' },
    { inputManifestSha256: 'a' },
    { recipientFingerprint: '0'.repeat(64) },
    { recipient: `${recipient}\n` },
    { recipient: `${recipient} ${recipient}` },
    { fixtureAuthoritySha256: '' },
    { rosterPolicySha256: '' },
    { archivePolicySha256: '' },
    { maximumDurationMs: 0 },
    { maximumDurationMs: 600001 },
    { maximumDurationMs: Infinity },
    { notBefore: -1 },
    { notAfter: 1000 },
    { extra: 1 },
    { registry: { ...proposed().registry, mode: 493 } },
    { registry: { ...proposed().registry, inode: '01' } },
    { registry: { ...proposed().registry, device: '18446744073709551616' } },
    { registry: { ...proposed().registry, uid: -1 } },
    { registry: { ...proposed().registry, extra: 1 } },
  ]) {
    const bytes = encode({ ...proposed(), ...changes });
    expect(() => decodeSourceReview(bytes)).toThrow();
    await rejects(buildSourceBootstrap(bytes), Error);
  }
  for (const bytes of [
    new Uint8Array(),
    new Uint8Array([255]),
    new Uint8Array([239, 187, 191, 123, 125]),
    encode('{} trailing'),
    new Uint8Array(16385),
  ]) {
    await rejects(buildSourceBootstrap(bytes), Error);
  }
  expect(() => decodeSourceReview(new Proxy(encode(proposed()), {}))).toThrow();
  await rejects(buildSourceBootstrap(new Proxy(encode(proposed()), {})), Error);
  await rejects(
    buildSourceBootstrap({
      get length() {
        throw Error('getter ran');
      },
    } as never),
    Error,
  );
  const parsed = decodeSourceReview(encode(proposed()));
  expect(Object.isFrozen(parsed)).toBe(true);
  expect(Object.isFrozen(parsed.registry)).toBe(true);
});
