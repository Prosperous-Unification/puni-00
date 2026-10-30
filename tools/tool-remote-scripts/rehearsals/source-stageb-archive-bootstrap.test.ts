import { rejects } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import { buildSourceArchiveBootstrap } from './source-stageb-archive-bootstrap';

test('assembly refuses missing review and archive policy without native effects', async () => {
  await rejects(buildSourceArchiveBootstrap(new Uint8Array(), new Uint8Array()));
});

import { decodeSourceArchivePolicy } from './source-stageb-archive-preflight';
const proposedPolicy = {
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
    directory: '/tmp/finite-proposed-tool',
    directoryIdentity: { device: '1', inode: '2', uid: 1000, gid: 1000, mode: 448 },
    file: { name: 'age', bytes: 10, sha256: 'a'.repeat(64), uid: 1000, gid: 1000, mode: 320 },
    release: 'v1.3.2',
  },
  preflight: {
    plaintext: 'source-stageb-age-preflight-v1\n',
    stdoutBytes: 65536,
    stderrBytes: 8192,
    maximumDurationMs: 30000,
  },
} as const;
function encoded(value: unknown): Uint8Array {
  return Buffer.from(`${JSON.stringify(value)}\n`);
}

test('closed canonical archive policy admits only the exact bounded fixed format', () => {
  expect(decodeSourceArchivePolicy(encoded(proposedPolicy))).toEqual(proposedPolicy);
  for (const changed of [
    { ...proposedPolicy, extra: true },
    { ...proposedPolicy, version: 2 },
    { ...proposedPolicy, encryption: 'ambient' },
    { ...proposedPolicy, container: { ...proposedPolicy.container, maximumBytes: 134217729 } },
    { ...proposedPolicy, container: { ...proposedPolicy.container, membership: 'dynamic' } },
    { ...proposedPolicy, tool: { ...proposedPolicy.tool, directory: '/' } },
    { ...proposedPolicy, tool: { ...proposedPolicy.tool, directory: '/tmp/../tmp/tool' } },
    { ...proposedPolicy, tool: { ...proposedPolicy.tool, directory: '/tmp/\0tool' } },
    { ...proposedPolicy, tool: { ...proposedPolicy.tool, directory: `/${'x'.repeat(4096)}` } },
    {
      ...proposedPolicy,
      tool: {
        ...proposedPolicy.tool,
        directoryIdentity: {
          ...proposedPolicy.tool.directoryIdentity,
          device: '18446744073709551616',
        },
      },
    },
    {
      ...proposedPolicy,
      tool: {
        ...proposedPolicy.tool,
        directoryIdentity: { ...proposedPolicy.tool.directoryIdentity, inode: '01' },
      },
    },
    {
      ...proposedPolicy,
      tool: { ...proposedPolicy.tool, file: { ...proposedPolicy.tool.file, name: 'other' } },
    },
    {
      ...proposedPolicy,
      tool: { ...proposedPolicy.tool, file: { ...proposedPolicy.tool.file, bytes: 0 } },
    },
    {
      ...proposedPolicy,
      tool: { ...proposedPolicy.tool, file: { ...proposedPolicy.tool.file, sha256: 'a' } },
    },
    { ...proposedPolicy, preflight: { ...proposedPolicy.preflight, maximumDurationMs: 30001 } },
    { ...proposedPolicy, preflight: { ...proposedPolicy.preflight, stdoutBytes: 65537 } },
    { ...proposedPolicy, preflight: { ...proposedPolicy.preflight, stderrBytes: 8193 } },
  ])
    expect(() => decodeSourceArchivePolicy(encoded(changed))).toThrow();
  for (const bytes of [
    Buffer.from(JSON.stringify(proposedPolicy)),
    Buffer.from(` ${JSON.stringify(proposedPolicy)}\n`),
    Buffer.from('\ufeff{}'),
    Buffer.from([255]),
    Buffer.alloc(16385, 32),
  ])
    expect(() => decodeSourceArchivePolicy(bytes)).toThrow();
});
