import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

import {
  consumeCreationAttempt,
  createCreationAttempt,
  executeCreationAttempt,
  readCreationAttempt,
  transitionCreationAttempt,
} from './creation-journal';

const identity = {
  labId: 'f9',
  attemptId: 'cdd167d5-f9b2-4b94-9200-776445bf8b19',
  daemonId: 'daemon-1',
};
async function directory(): Promise<string> {
  const path = await scratchAsync('fleet-creation-');
  await chmod(path, 0o700);
  return path;
}
async function requireRefusal(
  operation: Promise<unknown>,
  expected: string | RegExp,
): Promise<void> {
  const refusal = await operation.then(
    () => {
      throw new Error('Expected operation to refuse');
    },
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
  if (typeof expected === 'string') expect(String(refusal)).toContain(expected);
  else expect(String(refusal)).toMatch(expected);
}

const filename = (path: string) => join(path, `${identity.attemptId}.json`);

describe('creation attempt lifecycle', () => {
  it('returns creation completion only after durable ready state', async () => {
    const path = await directory();
    const completion = await executeCreationAttempt(path, identity, () =>
      Promise.resolve('created'),
    );
    expect(completion).toBe('created');
    expect((await readCreationAttempt(path, identity)).state).toBe('ready');
  });
  it('runs creation only after durable reservation and records success or failure', async () => {
    const path = await directory();
    await executeCreationAttempt(path, identity, async () => {
      expect((await readCreationAttempt(path, identity)).state).toBe('creating');
    });
    expect((await readCreationAttempt(path, identity)).state).toBe('ready');
    let touched = false;
    await requireRefusal(
      executeCreationAttempt(path, identity, () => {
        touched = true;
        return Promise.resolve();
      }),
      'EEXIST',
    );
    expect(touched).toBe(false);
    const failed = { ...identity, attemptId: 'a615b445-583b-4b25-9e4b-0660be0e1153' };
    await requireRefusal(
      executeCreationAttempt(path, failed, () => Promise.reject(new Error('creation failed'))),
      'creation failed',
    );
    expect((await readCreationAttempt(path, failed)).state).toBe('failed');
  });

  it('refuses a public journal directory before consuming state', async () => {
    const path = await directory();
    await createCreationAttempt(path, identity);
    await chmod(path, 0o755);
    await requireRefusal(consumeCreationAttempt(path, identity), 'directory must be owner-only');
  });

  it('creates owner-only durable state and refuses an occupied attempt', async () => {
    const path = await directory();
    await createCreationAttempt(path, identity);
    expect((await stat(filename(path))).mode & 0o777).toBe(0o600);
    expect((await readCreationAttempt(path, identity)).state).toBe('creating');
    await requireRefusal(createCreationAttempt(path, identity), 'EEXIST');
    expect((await readCreationAttempt(path, identity)).state).toBe('creating');
  });

  it('keeps concurrent attempts isolated and serializes one attempt', async () => {
    const path = await directory();
    const other = { ...identity, attemptId: 'a615b445-583b-4b25-9e4b-0660be0e1153' };
    await Promise.all([createCreationAttempt(path, identity), createCreationAttempt(path, other)]);
    await transitionCreationAttempt(path, identity, 'ready');
    expect((await readCreationAttempt(path, other)).state).toBe('creating');
    await requireRefusal(transitionCreationAttempt(path, identity, 'failed'), 'terminal');
    expect((await readCreationAttempt(path, identity)).state).toBe('ready');
    await mkdir(`${filename(path)}.lock`, { mode: 0o700 });
    await transitionCreationAttempt(path, other, 'failed');
    await requireRefusal(transitionCreationAttempt(path, identity, 'failed'), 'EEXIST');
  });

  for (const fault of [
    'absent',
    'unreadable',
    'malformed',
    'extra field',
    'wrong attempt',
    'wrong daemon',
    'wrong lab',
    'symlink',
    'public mode',
  ]) {
    it(`refuses ${fault} at the consuming lifecycle boundary`, async () => {
      const path = await directory();
      await createCreationAttempt(path, identity);
      let expected = /creation journal/;
      let selected = identity;
      switch (fault) {
        case 'absent':
          selected = { ...identity, attemptId: 'a615b445-583b-4b25-9e4b-0660be0e1153' };
          expected = /ENOENT/;
          break;
        case 'unreadable':
          await chmod(filename(path), 0);
          expected = /owner-only|EACCES/;
          break;
        case 'malformed':
          await writeFile(filename(path), '{');
          break;
        case 'extra field':
          await writeFile(
            filename(path),
            JSON.stringify({
              ...JSON.parse(await readFile(filename(path), 'utf8')),
              foreign: true,
            }),
          );
          break;
        case 'wrong attempt':
          await writeFile(
            filename(path),
            JSON.stringify({
              ...JSON.parse(await readFile(filename(path), 'utf8')),
              attemptId: 'a615b445-583b-4b25-9e4b-0660be0e1153',
            }),
          );
          expected = /journal identity does not match/;
          break;
        case 'wrong lab':
          selected = { ...identity, labId: 'other' };
          expected = /journal identity does not match/;
          break;
        case 'wrong daemon':
          selected = { ...identity, daemonId: 'daemon-2' };
          expected = /journal identity does not match/;
          break;
        case 'symlink': {
          const { rename, symlink } = await import('node:fs/promises');
          await rename(filename(path), `${filename(path)}.saved`);
          await symlink(`${filename(path)}.saved`, filename(path));
          expected = /ELOOP/;
          break;
        }
        case 'public mode':
          await chmod(filename(path), 0o644);
          expected = /owner-only/;
          break;
      }
      await requireRefusal(consumeCreationAttempt(path, selected), expected);
    });
  }

  it('refuses deletion even for a valid journal until the identity executor exists', async () => {
    const path = await directory();
    await createCreationAttempt(path, identity);
    await requireRefusal(consumeCreationAttempt(path, identity), 'identity executor is disabled');
    expect((await readCreationAttempt(path, identity)).state).toBe('creating');
  });

  it('rejects invalid identity before creating filesystem state', async () => {
    const path = await directory();
    for (const invalid of [
      { ...identity, attemptId: '../escape' },
      { ...identity, daemonId: '' },
      { ...identity, labId: '../escape' },
    ]) {
      await requireRefusal(createCreationAttempt(path, invalid), 'identity');
      await requireRefusal(consumeCreationAttempt(path, invalid), 'identity');
    }
  });
});

for (const boundary of ['file', 'directory']) {
  it(`refuses creation before callback when ${boundary} synchronization fails`, async () => {
    const path = await directory();
    const script = `
      import * as filesystem from 'node:fs/promises';
      import { mock } from 'bun:test';
      const openFile = filesystem.open;
      mock.module('node:fs/promises', () => ({
        ...filesystem,
        open: async (...arguments_) => {
          const descriptor = await openFile(...arguments_);
          const isDirectory = (await descriptor.stat()).isDirectory();
          return new Proxy(descriptor, { get(target, key) {
            if (key === 'sync' && isDirectory === ${JSON.stringify(boundary === 'directory')}) {
              return async () => { throw new Error('injected ${boundary} sync failure'); };
            }
            const property = Reflect.get(target, key);
            return typeof property === 'function' ? property.bind(target) : property;
          }});
        },
      }));
      const { executeCreationAttempt } = await import(${JSON.stringify(join(import.meta.dir, 'creation-journal.ts'))});
      try {
        await executeCreationAttempt(${JSON.stringify(path)}, ${JSON.stringify(identity)}, () => {
          console.log('CREATION CALLBACK RAN');
          return Promise.resolve();
        });
        throw new Error('synchronization fault was ignored');
      } catch (cause) {
        if (!(cause instanceof Error) || !cause.message.includes('injected ${boundary} sync failure')) throw cause;
        console.log('refused synchronization fault');
      }
    `;
    const invocation = Bun.spawn([process.execPath, '--eval', script], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(invocation.stdout).text(),
      new Response(invocation.stderr).text(),
      invocation.exited,
    ]);
    expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
    expect(stdout).toContain('refused synchronization fault');
    expect(stdout).not.toContain('CREATION CALLBACK RAN');
  });
}
