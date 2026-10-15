import { chmodSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { Database } from 'bun:sqlite';
import { afterEach, expect, it } from 'bun:test';

import {
  buildReplayCapabilitiesCommand,
  buildReplayInventoryCommand,
  observeReplayCapabilities,
} from './replay-capability';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function directory() {
  const root = scratchSync('k8s-replay-');
  roots.push(root);
  return root;
}
async function refuse(action: () => Promise<unknown>, message?: string): Promise<void> {
  await action().then(
    () => {
      throw new Error('fixture unexpectedly resolved');
    },
    (cause: unknown) => {
      expect(cause).toBeInstanceOf(Error);
      if (message !== undefined && cause instanceof Error) expect(cause.message).toContain(message);
    },
  );
}
const image = `registry/backend@sha256:${'a'.repeat(64)}`;
async function execute(command: readonly string[], cwd: string, path?: string) {
  const child = Bun.spawn([...command], {
    cwd,
    env: { ...process.env, DB_PATH: path },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    code: await child.exited,
    stdout: await new Response(child.stdout).text(),
    stderr: await new Response(child.stderr).text(),
  };
}

it.each(['forward', 'inverse', 'preconditions', 'empty-map', 'mixed'])(
  'inventories nested %s markers independently with no live blockage table',
  async (side) => {
    const root = directory();
    const path = join(root, 'journal.sqlite');
    const db = new Database(path);
    try {
      db.run(
        'CREATE TABLE __drizzle_migrations (name TEXT); CREATE TABLE command_journal (payload TEXT, inverse TEXT, preconditions TEXT)',
      );
      const plain = { do: 'move' };
      const guarded = { do: 'move', expectedProgress: [] };
      const nested = { do: 'batch', steps: [{ do: 'batch', steps: [guarded] }] };
      const replace = { do: 'replace_blockage' };
      db.run('INSERT INTO command_journal VALUES (?,?,?)', [
        JSON.stringify({
          forward:
            side === 'forward'
              ? nested
              : side === 'mixed'
                ? { do: 'batch', steps: [nested, replace] }
                : plain,
        }),
        JSON.stringify(side === 'inverse' || side === 'mixed' ? nested : plain),
        JSON.stringify(
          side === 'preconditions'
            ? { moveProgress: { parent: [] } }
            : side === 'empty-map' || side === 'mixed'
              ? { moveProgress: {} }
              : {},
        ),
      ]);
      db.run('INSERT INTO command_journal VALUES (?,?,?)', [
        JSON.stringify({ forward: plain }),
        JSON.stringify(plain),
        '{}',
      ]);
      const observed = await execute(buildReplayInventoryCommand(), root, path);
      expect(observed.code).toBe(0);
      expect(JSON.parse(observed.stdout)).toEqual([
        ...(side === 'mixed' ? [{ kind: 'replace_blockage', count: 1 }] : []),
        { kind: 'move_progress_v1', count: 1 },
      ]);
    } finally {
      db.close();
    }
  },
);

it('counts replacement commands in both directions and leaves empty legacy history empty', async () => {
  const root = directory();
  const path = join(root, 'journal.sqlite');
  const db = new Database(path);
  try {
    db.run(
      'CREATE TABLE __drizzle_migrations (name TEXT); CREATE TABLE command_journal (payload TEXT, inverse TEXT, preconditions TEXT)',
    );
    expect((await execute(buildReplayInventoryCommand(), root, path)).stdout).toBe('[]\n');
    const batch = { do: 'batch', steps: [{ do: 'replace_blockage' }] };
    db.run('INSERT INTO command_journal VALUES (?,?,?)', [
      JSON.stringify({ forward: batch }),
      JSON.stringify(batch),
      '{}',
    ]);
    expect(JSON.parse((await execute(buildReplayInventoryCommand(), root, path)).stdout)).toEqual([
      { kind: 'replace_blockage', count: 2 },
    ]);
  } finally {
    db.close();
  }
});

it('refuses missing, unreadable and malformed trusted database state', async () => {
  if (process.getuid?.() === 0) throw new Error('permission proof requires nonprivileged runner');
  const root = directory();
  const path = join(root, 'journal.sqlite');
  expect((await execute(buildReplayInventoryCommand(), root)).code).not.toBe(0);
  expect((await execute(buildReplayInventoryCommand(), root, path)).code).not.toBe(0);
  const db = new Database(path);
  try {
    expect((await execute(buildReplayInventoryCommand(), root, path)).code).not.toBe(0);
    db.run(
      'CREATE TABLE __drizzle_migrations (name TEXT); CREATE TABLE command_journal (payload TEXT, inverse TEXT, preconditions TEXT)',
    );
    db.run('INSERT INTO command_journal VALUES (?,?,?)', [
      '{"forward":{"do":"move"}}',
      '{"do":"move"}',
      '{}',
    ]);
    const malformedCases: readonly (readonly [string, string, string?])[] = [
      ['payload', '{}', 'journal payload is malformed'],
      ['payload', 'null', 'journal payload is malformed'],
      ['inverse', 'null', 'journal command is malformed'],
      ['inverse', '{"do":1}', 'journal command is malformed'],
      ['inverse', '{'],
      ['inverse', '{"do":"future"}'],
      ['inverse', '{"do":"batch","steps":{}}', 'journal batch is malformed'],
      ['preconditions', 'null'],
      ['preconditions', '[]'],
      ['preconditions', '"bad"'],
    ];
    for (const [column, malformed, diagnostic] of malformedCases) {
      db.run(`UPDATE command_journal SET ${column} = ?`, [malformed]);
      const refused = await execute(buildReplayInventoryCommand(), root, path);
      expect(refused.code).not.toBe(0);
      if (diagnostic !== undefined) expect(refused.stderr).toContain(diagnostic);
      db.run('UPDATE command_journal SET payload=?,inverse=?,preconditions=?', [
        '{"forward":{"do":"move"}}',
        '{"do":"move"}',
        '{}',
      ]);
    }
    chmodSync(path, 0o000);
    try {
      expect((await execute(buildReplayInventoryCommand(), root, path)).code).not.toBe(0);
    } finally {
      chmodSync(path, 0o600);
    }
  } finally {
    db.close();
  }
});

it('executes each pinned image own CLI and binds its observation to that exact digest', async () => {
  const root = directory();
  mkdirSync(join(root, 'src'));
  const run = async (pinned: string, command: readonly string[]) => {
    expect(pinned).toBe(image);
    return execute(command, root);
  };
  expect(await observeReplayCapabilities(image, run)).toEqual({ image, capabilities: [] });
  const cli = join(root, 'src/step-blockage-replay-kinds-cli.ts');
  writeFileSync(cli, 'console.log(JSON.stringify(["replace_blockage"]))');
  expect(await observeReplayCapabilities(image, run)).toEqual({
    image,
    capabilities: ['replace_blockage'],
  });
  writeFileSync(cli, 'console.log(JSON.stringify(["replace_blockage", "move_progress_v1"]))');
  expect((await observeReplayCapabilities(image, run)).capabilities).toEqual([
    'replace_blockage',
    'move_progress_v1',
  ]);
  await refuse(() => observeReplayCapabilities('backend:latest', run), 'digest');
});

it('refuses absent source, unreadable source/CLI, dangling and nonregular CLI, failed CLI and malformed output', async () => {
  if (process.getuid?.() === 0) throw new Error('permission proof requires nonprivileged runner');
  const root = directory();
  const source = join(root, 'src');
  const cli = join(source, 'step-blockage-replay-kinds-cli.ts');
  const read = () => observeReplayCapabilities(image, (_image, command) => execute(command, root));
  await refuse(read);
  mkdirSync(source);
  chmodSync(source, 0o000);
  try {
    await refuse(read);
  } finally {
    chmodSync(source, 0o700);
  }
  writeFileSync(cli, 'console.log("[]")');
  for (const mode of [0o100, 0o400]) {
    chmodSync(source, mode);
    try {
      expect((await execute(buildReplayCapabilitiesCommand(), root)).code).toBe(74);
      await refuse(read);
    } finally {
      chmodSync(source, 0o700);
    }
  }
  rmSync(cli);
  symlinkSync('missing.ts', cli);
  await refuse(read);
  rmSync(cli);
  mkdirSync(cli);
  await refuse(read);
  rmSync(cli, { recursive: true });
  for (const contents of [
    'console.log("[]"); process.exit(1)',
    'throw new Error("failed")',
    'console.log("bad")',
    'console.log("{}")',
    'console.log("[1]")',
    'console.log(\'["move_progress_v1","move_progress_v1"]\')',
  ]) {
    writeFileSync(cli, contents);
    await refuse(read);
  }
  chmodSync(cli, 0o000);
  try {
    await refuse(read);
  } finally {
    chmodSync(cli, 0o600);
  }
  expect(buildReplayCapabilitiesCommand()[0]).toBe('sh');
});
