import { rejects } from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { activateBlockages, prepareActivation } from './step-blockage-activation';
import { assertNoWriterBarrier, type WriterIntent } from './writer-barrier';

const candidate = `registry/be@sha256:${'a'.repeat(64)}`;
const rollback = `registry/be@sha256:${'b'.repeat(64)}`;
async function assertRefusal(pending: Promise<unknown>, message = '') {
  await rejects(pending, new RegExp(message));
}

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
async function fixture(fault = '') {
  const root = await mkdtemp(join(tmpdir(), 'step-activation-'));
  roots.push(root);
  const writer: WriterIntent = {
    candidate,
    sha: 'release',
    from: 'blue',
    to: 'green',
    outgoingId: 'c'.repeat(64),
    rollback: { containerId: 'c'.repeat(64), image: rollback, imageId: `sha256:${'b'.repeat(64)}` },
    databaseHostPath: '/canonical/wbs.db',
  };
  const events: string[] = [];
  let receipt: unknown;
  const runPinned = (image: string, command: string[]) =>
    Promise.resolve().then(() => {
      events.push(image);
      if (command.includes('src/step-blockage-replay-kinds-cli.ts'))
        return fault === 'capability-number'
          ? '[3,"step_blockage_activation_v1"]'
          : fault === 'capability-malformed'
            ? '{}'
            : fault === 'capability-empty'
              ? '["","step_blockage_activation_v1"]'
              : fault === 'capability-duplicate'
                ? '["step_blockage_activation_v1","step_blockage_activation_v1"]'
                : JSON.stringify(
                    (fault === 'candidate' && image === candidate) ||
                      (fault === 'rollback' && image === rollback)
                      ? []
                      : ['step_blockage_activation_v1'],
                  );
      if (fault === 'inspect-error') throw new Error('inspection unavailable');
      return fault === 'inspect-malformed'
        ? '{}'
        : JSON.stringify({ state: fault === 'enabled' ? 'ENABLED' : 'DISABLED', receipt: null });
    });
  const runDocker = async (args: string[]) => {
    if (args.includes('-e')) {
      const source = args.at(-1);
      if (source === undefined) throw new Error('missing script');
      const matched = /Bun.write\([^,]+,(.*)\)$/.exec(source);
      if (matched?.[1] === undefined) throw new Error('unexpected receipt transfer');
      receipt = JSON.parse(JSON.parse(matched[1]) as string);
      return '';
    }
    const persisted = JSON.parse(
      await readFile(join(root, 'be-writer-activation.json'), 'utf8'),
    ) as { receipt: unknown };
    expect(persisted.receipt).toEqual(receipt);
    events.push(args.includes('activate') ? 'activate' : 'readback');
    if (args.includes('activate')) {
      if (fault === 'commit-uncertain') throw new Error('transport lost after commit');
      return JSON.stringify(
        fault === 'activate-mismatch'
          ? {}
          : fault === 'activate-bare'
            ? receipt
            : fault === 'activate-disabled'
              ? { state: 'DISABLED', receipt }
              : fault === 'activate-extra'
                ? { state: 'ENABLED', receipt, extra: true }
                : { state: 'ENABLED', receipt },
      );
    }
    if (fault === 'readback-unavailable') throw new Error('readback unavailable');
    if (fault === 'readback-bare') return JSON.stringify(receipt);
    if (fault === 'readback-extra')
      return JSON.stringify({ state: 'ENABLED', receipt, extra: true });
    return JSON.stringify({
      state: fault === 'readback-disabled' ? 'DISABLED' : 'ENABLED',
      receipt: fault === 'readback-mismatch' ? {} : receipt,
    });
  };
  let fences = 0;
  const fence = () =>
    Promise.resolve().then(() => {
      fences += 1;
      if (fault === 'fence' && fences === 2) throw new Error('identity changed');
    });
  return { root, writer, events, runPinned, runDocker, fence };
}

test('requires independently capable candidate and rollback before durable activation intent', async () => {
  const f = await fixture();
  const receipt = await prepareActivation(f.writer, f.runPinned);
  expect(f.events).toEqual([candidate, rollback, candidate]);
  expect(receipt).toMatchObject({
    protocol: 'step-blockage-activation',
    version: 1,
    candidateImage: candidate,
    rollbackImage: rollback,
    databaseIdentity: '/canonical/wbs.db',
  });
});
for (const fault of [
  'candidate',
  'rollback',
  'capability-number',
  'capability-malformed',
  'capability-empty',
  'capability-duplicate',
  'inspect-error',
  'inspect-malformed',
  'enabled',
]) {
  test(`refuses ${fault} before intent or mutation`, async () => {
    const f = await fixture(fault);
    await assertRefusal(
      prepareActivation(f.writer, f.runPinned),
      fault.startsWith('capability') || fault === 'candidate' || fault === 'rollback'
        ? 'activation requires step_blockage_activation_v1'
        : fault === 'inspect-error'
          ? 'inspection unavailable'
          : 'previously deployed DISABLED',
    );
    await assertNoWriterBarrier(f.root);
    expect(f.events).not.toContain('activate');
  });
}
test('refuses first installation without a capable predecessor', async () => {
  const f = await fixture();
  f.writer.rollback = null;
  await assertRefusal(
    prepareActivation(f.writer, f.runPinned),
    'activation requires a capable rollback image',
  );
  expect(f.events).toEqual([]);
});
test('durably records exact attempt before activation and requires separate committed inspection', async () => {
  const f = await fixture();
  const receipt = await prepareActivation(f.writer, f.runPinned);
  await activateBlockages(f.root, f.writer, receipt, 'd'.repeat(64), f.fence, f.runDocker);
  expect(f.events.slice(-2)).toEqual(['activate', 'readback']);
  expect(
    JSON.parse(await readFile(join(f.root, 'be-writer-activation.json'), 'utf8')),
  ).toMatchObject({ writer: f.writer, receipt, maintenanceId: 'd'.repeat(64) });
  await assertRefusal(assertNoWriterBarrier(f.root), 'activation');
});
for (const fault of [
  'commit-uncertain',
  'activate-mismatch',
  'activate-bare',
  'activate-disabled',
  'activate-extra',
  'readback-bare',
  'readback-extra',
  'readback-unavailable',
  'readback-disabled',
  'readback-mismatch',
  'fence',
]) {
  test(`retains activation intent and refuses completion on ${fault}`, async () => {
    const f = await fixture(fault);
    const receipt = await prepareActivation(f.writer, f.runPinned);
    await assertRefusal(
      activateBlockages(f.root, f.writer, receipt, 'd'.repeat(64), f.fence, f.runDocker),
    );
    expect(
      (
        JSON.parse(await readFile(join(f.root, 'be-writer-activation.json'), 'utf8')) as {
          receipt: unknown;
        }
      ).receipt,
    ).toEqual(receipt);
    await assertRefusal(assertNoWriterBarrier(f.root), 'activation');
  });
}

test('refuses missing canonical database identity before observation', async () => {
  const f = await fixture();
  delete f.writer.databaseHostPath;
  await assertRefusal(prepareActivation(f.writer, f.runPinned), 'database');
  expect(f.events).toEqual([]);
});
for (const fault of ['absent', 'corrupt', 'unreadable']) {
  test(`refuses ${fault} durable intent before image-local execution`, async () => {
    const f = await fixture();
    const receipt = await prepareActivation(f.writer, f.runPinned);
    const publish = async (path: string) => {
      if (fault === 'absent') return;
      if (fault === 'unreadable') throw new Error('EACCES durable intent');
      await writeFile(path, '{}');
    };
    let commands = 0;
    const runDocker = () =>
      Promise.resolve().then(() => {
        commands += 1;
        return JSON.stringify({ state: 'ENABLED', receipt });
      });
    await assertRefusal(
      activateBlockages(f.root, f.writer, receipt, 'd'.repeat(64), f.fence, runDocker, publish),
      fault === 'absent'
        ? 'ENOENT'
        : fault === 'unreadable'
          ? 'EACCES'
          : 'durable intent readback differs',
    );
    expect(commands).toBe(0);
  });
}

for (const args of [
  ['be', '--activate-step-blockage'],
  ['gw', '--execute', '--activate-step-blockage'],
  ['be,gw', '--execute', '--activate-step-blockage'],
  ['be', '--execute', '--preflight', '--activate-step-blockage'],
  ['be', '--execute', '--check-backend-recovery', '--activate-step-blockage'],
]) {
  test(`activation CLI refuses incompatible invocation ${args.join(' ')}`, () => {
    const child = Bun.spawnSync(
      [process.execPath, new URL('../swap.ts', import.meta.url).pathname, ...args],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(child.exitCode).toBe(1);
    expect(new TextDecoder().decode(child.stderr)).toContain(
      '--activate-step-blockage requires only be with --execute',
    );
  });
}

test('runs generated transfer and actual image-local CLI through activation and exact inspection', async () => {
  const f = await fixture();
  const database = join(f.root, 'wbs.db');
  const backend = new URL('../../../../apps/wbs/be-01/', import.meta.url).pathname;
  const { Database } = await import('bun:sqlite');
  const sqlite = new Database(database);
  try {
    sqlite.run(
      'CREATE TABLE __drizzle_migrations (name TEXT NOT NULL); CREATE TABLE step_blockage (id INTEGER)',
    );
    for (const migration of [
      '20261014140000_add_step_blockage_activation',
      '20261015100000_add_step_blockage_activation_receipt',
    ]) {
      sqlite.run(await readFile(join(backend, 'drizzle', migration, 'migration.sql'), 'utf8'));
      sqlite.run('INSERT INTO __drizzle_migrations VALUES (?)', [migration]);
    }
  } finally {
    sqlite.close();
  }
  const run = (command: string[]) => {
    const child = Bun.spawnSync([process.execPath, ...command.slice(1)], {
      cwd: backend,
      env: { ...process.env, DB_PATH: database },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (child.exitCode !== 0) throw new Error(child.stderr.toString());
    return Promise.resolve(child.stdout.toString());
  };
  const receipt = await prepareActivation(f.writer, (_image, command) => run(command));
  const transferred: string[] = [];
  try {
    await activateBlockages(f.root, f.writer, receipt, 'd'.repeat(64), f.fence, (args) => {
      if (args.includes('activate')) {
        const path = args.at(-1);
        if (path === undefined) throw new Error('missing transferred receipt');
        transferred.push(path);
      }
      return run(args.slice(2));
    });
    expect(
      JSON.parse(await run(['bun', 'src/step-blockage-activation-cli.ts', 'inspect'])),
    ).toEqual({ state: 'ENABLED', receipt });
  } finally {
    for (const path of transferred) await rm(path);
  }
}, 30_000);

test('late durable publication after budget expiry retains intent and never continues image-local execution', async () => {
  const f = await fixture();
  const receipt = await prepareActivation(f.writer, f.runPinned);
  let finish: (() => void) | undefined;
  const delayed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let publication: Promise<void> | undefined;
  const publish = (path: string, contents: string) => {
    publication = delayed.then(() => writeFile(path, contents));
    return publication;
  };
  let commands = 0;
  const runDocker = () => {
    commands += 1;
    return Promise.resolve('');
  };
  await assertRefusal(
    activateBlockages(
      f.root,
      f.writer,
      receipt,
      'd'.repeat(64),
      f.fence,
      runDocker,
      publish,
      performance.now() + 10,
    ),
    'deadline exceeded',
  );
  if (finish === undefined) throw new Error('fixture missing late publication');
  finish();
  if (publication === undefined) throw new Error('fixture missing publication completion');
  await publication;
  expect(commands).toBe(0);
  await assertRefusal(assertNoWriterBarrier(f.root), 'activation');
});
