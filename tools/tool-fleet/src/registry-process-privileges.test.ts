import { chmod, mkdir, readFile, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { readRegistryWriters } from './registry-maintenance-writers';
import { completeRegistryOperation } from './registry-operation-completion';
import { requireRejection } from './registry-rejection.fixture';

const safe =
  'Name:\tfixture\nState:\tS (sleeping)\nUid:\t59001\t59001\t59001\t59001\n' +
  'Threads:\t1\nCapInh:\t0000000000000000\nCapPrm:\t0000000000000000\n' +
  'CapEff:\t0000000000000000\nCapBnd:\t000001ffffffffff\n' +
  'CapAmb:\t0000000000000000\nNoNewPrivs:\t1\n';

async function createView(status = safe) {
  const directory = await scratchAsync('registry-process-privileges-');
  const proc = join(directory, 'proc');
  await mkdir(join(proc, 'self'), { recursive: true });
  await mkdir(join(proc, '42/fd'), { recursive: true });
  await mkdir(join(proc, '42/task/42'), { recursive: true });
  await writeFile(join(proc, 'self/mountinfo'), await readFile('/proc/self/mountinfo', 'utf8'));
  await writeFile(join(proc, '42/mountinfo'), '');
  await writeFile(join(proc, '42/maps'), '');
  await writeFile(join(proc, '42/status'), status);
  await symlink('/usr/bin/true', join(proc, '42/exe'));
  await symlink(directory, join(proc, '42/root'));
  await symlink(directory, join(proc, '42/cwd'));
  // A real different audited device keeps modeled proc observations truthful about root/cwd.
  return { proc, storage: '/proc', status: join(proc, '42/status') };
}

test('empty view refuses saved UID zero despite nonzero effective UID', async () => {
  const proof = await createView(
    safe.replace('59001\t59001\t59001\t59001', '59001\t59001\t0\t59001'),
  );
  const refused = await requireRejection(
    readRegistryWriters(proof.storage, '/fixed/registry', proof.proc),
  );
  expect(refused.throwCause).toThrow('writer census is incomplete');
  if (!(refused.cause instanceof Error)) throw new Error('Missing privilege refusal');
  expect(refused.cause.cause).toMatchObject({
    message: 'Empty process mount visibility requires nonzero UIDs',
  });
});

for (const slot of [0, 1, 3]) {
  test(`empty view refuses UID zero in slot ${String(slot)}`, async () => {
    const uids = ['59001', '59001', '59001', '59001'];
    uids[slot] = '0';
    const proof = await createView(safe.replace('59001\t59001\t59001\t59001', uids.join('\t')));
    const refused = await requireRejection(
      readRegistryWriters(proof.storage, '/fixed/registry', proof.proc),
    );
    if (!(refused.cause instanceof Error)) throw new Error('Missing privilege refusal');
    expect(refused.cause.cause).toMatchObject({
      message: 'Empty process mount visibility requires nonzero UIDs',
    });
  });
}

for (const field of ['CapEff', 'CapPrm', 'CapAmb']) {
  test(`empty view refuses retained ${field}`, async () => {
    const proof = await createView(
      safe.replace(`${field}:\t0000000000000000`, `${field}:\t0000000000040000`),
    );
    const refused = await requireRejection(
      readRegistryWriters(proof.storage, '/fixed/registry', proof.proc),
    );
    if (!(refused.cause instanceof Error)) throw new Error('Missing privilege refusal');
    expect(refused.cause.cause).toMatchObject({
      message: `Empty process mount visibility requires zero ${field}`,
    });
  });
}

test('empty view refuses privilege regain when NoNewPrivs is zero', async () => {
  const proof = await createView(safe.replace('NoNewPrivs:\t1', 'NoNewPrivs:\t0'));
  const refused = await requireRejection(
    readRegistryWriters(proof.storage, '/fixed/registry', proof.proc),
  );
  if (!(refused.cause instanceof Error)) throw new Error('Missing privilege refusal');
  expect(refused.cause.cause).toMatchObject({
    message: 'Empty process mount visibility requires NoNewPrivs',
  });
});

for (const field of ['Uid', 'CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb', 'NoNewPrivs']) {
  for (const fault of ['missing', 'duplicate', 'multiline', 'malformed']) {
    test(`empty view refuses ${fault} ${field} evidence`, async () => {
      const line = safe.split('\n').find((line) => line.startsWith(`${field}:`));
      if (line === undefined) throw new Error('Missing fixture privilege field');
      const replacement =
        fault === 'missing'
          ? ''
          : fault === 'duplicate'
            ? `${line}\n${line}`
            : fault === 'multiline'
              ? line.replace(':\t', ':\n')
              : `${field}:\tinvalid`;
      const proof = await createView(safe.replace(line, replacement));
      const refused = await requireRejection(
        readRegistryWriters(proof.storage, '/fixed/registry', proof.proc),
      );
      if (!(refused.cause instanceof Error)) throw new Error('Missing privilege refusal');
      expect(refused.cause.cause).toMatchObject({
        message: `Incomplete empty-view process privilege observation: ${field}`,
      });
    });
  }
}

for (const uid of ['4294967295', '4294967296', '999999999999999999999', '-1', '+1', '1.0', '0x1']) {
  test(`empty view refuses invalid UID ${uid}`, async () => {
    const proof = await createView(
      safe.replace('59001\t59001\t59001\t59001', `59001\t${uid}\t59001\t59001`),
    );
    const refused = await requireRejection(
      readRegistryWriters(proof.storage, '/fixed/registry', proof.proc),
    );
    expect(refused.throwCause).toThrow('writer census is incomplete');
  });
}

for (const uids of ['59001\t59001\t59001', '59001\t59001\t59001\t59001\t59001']) {
  test(`empty view refuses incomplete UID arity ${String(uids.split('\t').length)}`, async () => {
    const proof = await createView(safe.replace('59001\t59001\t59001\t59001', uids));
    const refused = await requireRejection(
      readRegistryWriters(proof.storage, '/fixed/registry', proof.proc),
    );
    expect(refused.throwCause).toThrow('writer census is incomplete');
  });
}

for (const field of ['CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb']) {
  for (const mask of ['0', '00000000000000000', '-000000000000001', '000000000000000g']) {
    test(`empty view refuses malformed capability ${field}/${mask}`, async () => {
      const proof = await createView(
        safe.replace(new RegExp(`${field}:\\t[0-9a-f]+`), `${field}:\t${mask}`),
      );
      const refused = await requireRejection(
        readRegistryWriters(proof.storage, '/fixed/registry', proof.proc),
      );
      if (!(refused.cause instanceof Error)) throw new Error('Missing privilege refusal');
      expect(refused.cause.cause).toMatchObject({
        message: `Incomplete empty-view process privilege observation: ${field}`,
      });
    });
  }
}

test('empty view accepts nonzero inheritable and bounding capabilities under NoNewPrivs', async () => {
  const proof = await createView(
    safe.replace('CapInh:\t0000000000000000', 'CapInh:\t000001ffffffffff'),
  );
  expect(await readRegistryWriters(proof.storage, '/fixed/registry', proof.proc)).toEqual([]);
});

test('empty view accepts distinct nonzero uint32 UIDs including the maximal valid value', async () => {
  const proof = await createView(
    safe.replace('59001\t59001\t59001\t59001', '1\t2147483648\t4294967294\t59001'),
  );
  expect(await readRegistryWriters(proof.storage, '/fixed/registry', proof.proc)).toEqual([]);
});

for (const fault of ['absent', 'unreadable']) {
  test(`empty view refuses ${fault} process status`, async () => {
    const proof = await createView();
    if (fault === 'absent') await unlink(proof.status);
    else await chmod(proof.status, 0);
    await completeRegistryOperation(
      async () => {
        const refused = await requireRejection(
          readRegistryWriters(proof.storage, '/fixed/registry', proof.proc),
        );
        if (!(refused.cause instanceof Error)) throw new Error('Missing privilege refusal');
        expect(refused.cause.cause).toMatchObject({
          code: fault === 'absent' ? 'ENOENT' : 'EACCES',
        });
      },
      () => (fault === 'unreadable' ? chmod(proof.status, 0o600) : Promise.resolve()),
    );
  });
}

test('empty view refuses status beyond its bounded text validation limit', async () => {
  const proof = await createView(safe + 'X'.repeat(1024 * 1024));
  const refused = await requireRejection(
    readRegistryWriters(proof.storage, '/fixed/registry', proof.proc),
  );
  if (!(refused.cause instanceof Error)) throw new Error('Missing privilege refusal');
  expect(refused.cause.cause).toMatchObject({ message: 'Empty-view process status exceeds bound' });
});

test('empty view accepts status at its text validation limit', async () => {
  const proof = await createView(safe + 'X'.repeat(1024 * 1024 - safe.length));
  expect(await readRegistryWriters(proof.storage, '/fixed/registry', proof.proc)).toEqual([]);
});

test('empty view bounds UTF-8 status bytes rather than character count', async () => {
  const proof = await createView(safe + 'é'.repeat(512 * 1024));
  const refused = await requireRejection(
    readRegistryWriters(proof.storage, '/fixed/registry', proof.proc),
  );
  if (!(refused.cause instanceof Error)) throw new Error('Missing privilege refusal');
  expect(refused.cause.cause).toMatchObject({ message: 'Empty-view process status exceeds bound' });
});

test('ordinary nonempty process view does not require an empty-view privilege profile', async () => {
  const proof = await createView();
  await writeFile(join(proof.proc, '42/mountinfo'), await readFile('/proc/self/mountinfo', 'utf8'));
  await unlink(proof.status);
  expect(await readRegistryWriters(proof.storage, '/fixed/registry', proof.proc)).toEqual([]);
});

test('empty view requires privilege evidence before opening isolation paths', async () => {
  const proof = await createView(safe.replace('NoNewPrivs:\t1', 'NoNewPrivs:\t0'));
  await unlink(join(proof.proc, '42/root'));
  const refused = await requireRejection(
    readRegistryWriters(proof.storage, '/fixed/registry', proof.proc),
  );
  if (!(refused.cause instanceof Error)) throw new Error('Missing privilege refusal');
  expect(refused.cause.cause).toMatchObject({
    message: 'Empty process mount visibility requires NoNewPrivs',
  });
});

for (const fault of ['normal', 'uid', 'CapEff', 'CapPrm', 'CapAmb', 'NoNewPrivs']) {
  test(`empty view revalidates final one-task status privilege sample: ${fault}`, async () => {
    const proof = await createView();
    const finalStatus =
      fault === 'uid'
        ? safe.replace('59001', '0')
        : fault === 'NoNewPrivs'
          ? safe.replace('NoNewPrivs:\t1', 'NoNewPrivs:\t0')
          : fault === 'normal'
            ? safe
            : safe.replace(`${fault}:\t0000000000000000`, `${fault}:\t0000000000040000`);
    // Only the second read of this owned fixture's status changes; all path/fd/task observations
    // remain real. Two reads establish the initial/final samples without a separate privilege read.
    const script = `
      import * as filesystem from 'node:fs/promises';
      import { mock } from 'bun:test';
      const original = { ...filesystem };
      const statusPath = ${JSON.stringify(proof.status)};
      let samples = 0;
      await mock.module('node:fs/promises', () => ({
        ...original,
        async readFile(path, ...arguments_) {
          if (path === statusPath && ++samples === 2) return ${JSON.stringify(finalStatus)};
          return await original.readFile(path, ...arguments_);
        },
      }));
      const { readRegistryWriters } = await import(${JSON.stringify(new URL('./registry-maintenance-writers.ts', import.meta.url).href)});
      let completion;
      try {
        completion = { writers: await readRegistryWriters('/proc', '/fixed/registry', ${JSON.stringify(proof.proc)}) };
      } catch (cause) {
        if (!(cause instanceof Error) || !(cause.cause instanceof Error)) throw cause;
        completion = { refused: cause.cause.message };
      }
      console.log(JSON.stringify({ samples, completion }));
    `;
    const child = Bun.spawn([process.execPath, '--eval', script], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(stderr).toBe('');
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      samples: 2,
      completion:
        fault === 'normal'
          ? { writers: [] }
          : {
              refused:
                fault === 'uid'
                  ? 'Empty process mount visibility requires nonzero UIDs'
                  : fault === 'NoNewPrivs'
                    ? 'Empty process mount visibility requires NoNewPrivs'
                    : `Empty process mount visibility requires zero ${fault}`,
            },
    });
  });
}
