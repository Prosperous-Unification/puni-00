import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { inspectInstalledWriters, WRITER_MEMBERS } from './installed-writers';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'installed-writers-'));
  roots.push(root);
  await mkdir(join(root, 'expected'));
  await mkdir(join(root, 'installed'));
  const members = [];
  for (const member of WRITER_MEMBERS) {
    const bytes = `reviewed ${member}`;
    await writeFile(join(root, 'expected', member), bytes);
    await writeFile(join(root, 'installed', member), bytes);
    members.push({
      member,
      origin: 'source',
      hostPath: `/declared/${member}`,
      reviewed: `expected/${member}`,
      installed: `installed/${member}`,
      sha256: new Bun.CryptoHasher('sha256').update(bytes).digest('hex'),
    });
  }
  return {
    root,
    manifest: {
      version: 1,
      sourceSha: 'a'.repeat(40),
      buildSha: 'b'.repeat(40),
      buildId: 'reviewed-build-1',
      members,
    },
  };
}

test('binds reviewed expected bytes and every installed member, always blocked', async () => {
  const { root, manifest } = await fixture();
  const observation = await inspectInstalledWriters(root, manifest);
  expect(observation.activation).toBe('blocked');
  expect(observation.members).toHaveLength(WRITER_MEMBERS.length);
  expect(observation.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(observation)).not.toContain('participantProofSha256');
  expect(observation.unknowns.length).toBeGreaterThan(0);
});

test.each(['prod-swap', 'dev-swap', 'dev-poller', 'shared-launch-authority'])(
  'refuses omitted required %s',
  async (member) => {
    const { root, manifest } = await fixture();
    manifest.members = manifest.members.filter((entry) => entry.member !== member);
    expect(inspectInstalledWriters(root, manifest)).rejects.toThrow('membership');
  },
);

test('refuses malformed manifest and accidental activation authority', async () => {
  const { root, manifest } = await fixture();
  expect(inspectInstalledWriters(root, { ...manifest, activation: 'allowed' })).rejects.toThrow(
    'fields',
  );
  expect(inspectInstalledWriters(root, { ...manifest, sourceSha: 'main' })).rejects.toThrow(
    'identity',
  );
});

test.each([
  'expected/prod-swap',
  'installed/prod-swap',
  'installed/dev-interpreter',
  'installed/shared-restart-authority',
])('refuses hash mismatch or interpreter/authority substitution at %s', async (path) => {
  const { root, manifest } = await fixture();
  await writeFile(join(root, path), 'substitution');
  expect(inspectInstalledWriters(root, manifest)).rejects.toThrow('hash mismatch');
});

test.each(['absent', 'directory'])('refuses %s required observation', async (fault) => {
  const { root, manifest } = await fixture();
  const path = join(root, 'installed/prod-swap');
  await rm(path);
  if (fault === 'directory') await mkdir(path);
  expect(inspectInstalledWriters(root, manifest)).rejects.toThrow();
});

test('refuses changing observations between complete passes', async () => {
  const { root, manifest } = await fixture();
  let reads = 0;
  const read = async (path: string) => {
    const bytes = await Bun.file(path).bytes();
    reads++;
    return reads > WRITER_MEMBERS.length * 2 ? new Uint8Array([1]) : bytes;
  };
  expect(inspectInstalledWriters(root, manifest, read)).rejects.toThrow('changed');
});

async function runCli(root: string, manifest: unknown, preload?: string) {
  const path = join(root, 'manifest.json');
  await writeFile(path, JSON.stringify(manifest));
  const cli = join(import.meta.dir, '../inspect-installed-writers.ts');
  const child = Bun.spawn(
    [process.execPath, ...(preload ? ['--preload', preload] : []), cli, path, root],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

test('real CLI emits only a blocked inventory and no adoption authority', async () => {
  const { root, manifest } = await fixture();
  const execution = await runCli(root, manifest);
  expect(execution.exitCode).toBe(0);
  const observation: unknown = JSON.parse(execution.stdout);
  expect(observation).toHaveProperty('activation', 'blocked');
  expect(observation).toHaveProperty('scope', 'local-supplied-capture');
  expect(observation).not.toHaveProperty('participantProofSha256');
  expect(observation).not.toHaveProperty('adopted');
});

test.each([
  'member',
  'environment',
  'hash',
  'interpreter',
  'activation',
  'malformed',
  'absent',
  'unreadable',
])('real CLI refuses %s fault without observation output', async (fault) => {
  const { root, manifest } = await fixture();
  if (fault === 'member') manifest.members.pop();
  if (fault === 'environment')
    manifest.members = manifest.members.filter((member) => !member.member.startsWith('dev-'));
  if (fault === 'hash') await writeFile(join(root, 'installed/prod-swap'), 'drift');
  if (fault === 'interpreter')
    await writeFile(join(root, 'installed/dev-interpreter'), 'replacement');
  if (fault === 'absent') await rm(join(root, 'installed/prod-swap'));
  if (fault === 'unreadable') {
    const { chmod } = await import('node:fs/promises');
    await chmod(join(root, 'installed/prod-swap'), 0);
  }
  const input =
    fault === 'activation'
      ? { ...manifest, activation: 'allowed' }
      : fault === 'malformed'
        ? { ...manifest, buildSha: 'main' }
        : manifest;
  const execution = await runCli(root, input);
  expect(execution.exitCode).not.toBe(0);
  expect(execution.stdout).toBe('');
});

test.each(['bytes', 'inode', 'manifest'])(
  'real CLI refuses %s drift after its first complete observation pass',
  async (fault) => {
    const { root, manifest } = await fixture();
    const preload = join(root, 'drift.ts');
    await writeFile(
      preload,
      `
import { mock } from 'bun:test';
import * as fs from 'node:fs/promises';
const originalOpen = fs.open;
const originalWrite = fs.writeFile;
const originalRename = fs.rename;
let reads = 0;
mock.module('node:fs/promises', () => ({ ...fs, open: async (...args) => {
  const file = await originalOpen(...args);
  const originalRead = file.readFile.bind(file);
  file.readFile = async (...options) => {
    const bytes = await originalRead(...options);
    reads++;
    if (reads === ${String(WRITER_MEMBERS.length * 2 + 1)}) {
      await originalWrite(${JSON.stringify(join(root, 'replacement'))}, ${JSON.stringify(fault === 'manifest' ? `${JSON.stringify(manifest)}\n` : fault === 'bytes' ? 'between-pass drift' : 'reviewed prod-swap')});
      await originalRename(${JSON.stringify(join(root, 'replacement'))}, ${JSON.stringify(join(root, fault === 'manifest' ? 'manifest.json' : 'installed/prod-swap'))});
    }
    return bytes;
  };
  return file;
} }));
`,
    );
    const execution = await runCli(root, manifest, preload);
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stdout).toBe('');
    expect(execution.stderr).toContain('changed');
  },
);

test.each([
  'duplicate',
  'alias',
  'normalized-alias',
  'host-alias',
  'traversal',
  'symlink',
  'provenance',
  'digest',
  'host-path',
  'scope',
])('real CLI refuses invalid %s boundary', async (fault) => {
  const { root, manifest } = await fixture();
  const first = manifest.members[0];
  const second = manifest.members[1];
  if (fault === 'duplicate') first.member = second.member;
  if (fault === 'alias') first.installed = first.reviewed;
  if (fault === 'normalized-alias') first.installed = `./${first.reviewed}`;
  if (fault === 'host-alias') first.hostPath = second.hostPath;
  if (fault === 'traversal')
    first.installed = `../${String(root.split('/').at(-1))}/installed/prod-swap`;
  if (fault === 'symlink') {
    const { symlink } = await import('node:fs/promises');
    await symlink(join(root, 'expected'), join(root, 'linked'));
    first.installed = 'linked/prod-swap';
  }
  if (fault === 'provenance') first.origin = 'invented';
  if (fault === 'digest') first.sha256 = 'invalid';
  if (fault === 'host-path') first.hostPath = 'relative';
  const execution = await runCli(root, fault === 'scope' ? { ...manifest, version: 2 } : manifest);
  expect(execution.exitCode).not.toBe(0);
  expect(execution.stdout).toBe('');
  if (fault === 'digest') expect(execution.stderr).toContain('invalid digest');
});
