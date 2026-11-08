import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { readPublicationEnrollment } from './registry-enrollment';

it('legacy selection requires explicit unmanaged installation; selected missing or malformed state never falls back', async () => {
  expect(
    await readPublicationEnrollment('https://registry.example', {}, () =>
      Promise.resolve().then(() => ({
        schemaVersion: 1,
        managed: [],
      })),
    ),
  ).toBeUndefined();
  expect(
    (
      await rejectionOf(
        readPublicationEnrollment('https://registry.example', {
          REGISTRY_PUBLICATION_ENROLLMENT: '',
        }),
      )
    ).message,
  ).not.toBe('');
  expect(
    (
      await rejectionOf(
        readPublicationEnrollment('https://registry.example', {
          REGISTRY_PUBLICATION_ENROLLMENT: '/absent-enrollment-task5',
        }),
      )
    ).message,
  ).not.toBe('');
  const directory = await scratchAsync('registry-enrollment-');
  try {
    const path = join(directory, 'enrollment.json');
    await writeFile(path, '{}');
    expect(
      (
        await rejectionOf(
          readPublicationEnrollment('https://registry.example', {
            REGISTRY_PUBLICATION_ENROLLMENT: path,
          }),
        )
      ).message,
    ).not.toBe('');
  } finally {
    await rm(directory, { recursive: true });
  }
});

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (cause) {
    if (cause instanceof Error) return cause;
    throw cause;
  }
  throw new Error('Expected refusal');
}

it('refuses a canonical enrollment FIFO before waiting for a writer', async () => {
  const directory = await scratchAsync('registry-enrollment-fifo-');
  const path = join(directory, 'catalog.json');
  const created = Bun.spawnSync(['mkfifo', path]);
  if (created.exitCode !== 0) throw new Error(created.stderr.toString());
  const entry = new URL('./registry-enrollment.ts', import.meta.url).pathname;
  const child = Bun.spawn(
    [
      process.execPath,
      '--eval',
      `
      const { readTrustedEnrollment } = await import(${JSON.stringify(entry)});
      process.stdout.write('entered-parser\\n');
      try {
        await readTrustedEnrollment(process.argv[1]);
        process.stdout.write('ACCEPTED\\n');
        process.exitCode = 3;
      } catch (cause) {
        if (!(cause instanceof Error)) throw cause;
        process.stdout.write('refused:' + cause.message + '\\n');
      }
    `,
      path,
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
  );
  let expired = false;
  const deadline = setTimeout(() => {
    expired = true;
    child.kill('SIGKILL');
  }, 2000);
  try {
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(stdout).toStartWith('entered-parser\n');
    expect(expired).toBe(false);
    expect({ code, stdout, stderr }).toEqual({
      code: 0,
      stdout: 'entered-parser\nrefused:Untrusted registry publication enrollment\n',
      stderr: '',
    });
  } finally {
    clearTimeout(deadline);
    if (child.exitCode === null) child.kill('SIGKILL');
    await child.exited;
    await rm(directory, { recursive: true });
  }
});
