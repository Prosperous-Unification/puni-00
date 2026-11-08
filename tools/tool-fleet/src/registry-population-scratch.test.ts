import { chmod, lstat, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { type } from 'arktype';
import { afterEach, expect, test } from 'bun:test';

import { withRegistryPopulationScratch } from './registry-population-scratch.fixture';
import { requireRejection } from './registry-rejection.fixture';
import { readRegistryBytes } from './registry-stream';

const created: string[] = [];
function ownedDirectory(): string {
  const directory = created.at(-1);
  if (directory === undefined) throw new Error('Population callback never received its scratch');
  return directory;
}
async function isAbsent(directory: string): Promise<boolean> {
  try {
    await lstat(directory);
    return false;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return true;
    throw cause;
  }
}
afterEach(async () => {
  for (const directory of created.splice(0)) {
    if (await isAbsent(directory)) continue;
    const metadata = await lstat(directory);
    if (metadata.isDirectory()) await chmod(directory, 0o700);
    await rm(directory, { recursive: true });
  }
});
function requireCompound(cause: unknown, failures: readonly unknown[], original: unknown): void {
  if (!(cause instanceof AggregateError))
    throw new Error('Required compound population failure was lost');
  const members: unknown = cause.errors;
  expect(members).toEqual(failures);
  expect(cause.cause).toBe(original);
}

test('population scratch returns exact result only after removing its actual files', async () => {
  const receipt = { retained: true };
  const returned = await withRegistryPopulationScratch(
    async (directory) => {
      created.push(directory);
      await writeFile(join(directory, 'content'), 'owned');
      return receipt;
    },
    () => {
      throw new Error('Successful publication must not report failure');
    },
  );
  expect(returned).toBe(receipt);
  expect(await isAbsent(ownedDirectory())).toBe(true);
});

for (const [name, failure] of [
  ['error', new Error('private publication')],
  ['aggregate', new AggregateError([new Error('first'), new Error('second')], 'private aggregate')],
  ['undefined', undefined],
  ['null', null],
  ['string', 'private rejection'],
] as const) {
  test(
    'population scratch preserves exact callback rejection and completes reporting/removal: ' +
      name,
    async () => {
      const reportDirectory = await scratchAsync('registry-population-report-');
      const reportPath = join(reportDirectory, 'receipt');
      const refused = await requireRejection(
        withRegistryPopulationScratch(
          async (directory) => {
            created.push(directory);
            await writeFile(join(directory, 'content'), 'owned');
            // Deliberate malformed rejection values verify that undefined is never mistaken for success.
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            return await Promise.reject(failure);
          },
          async (cause) => {
            if (cause !== failure) throw new Error('Reporter received another publication failure');
            await writeFile(reportPath, 'reported');
          },
        ),
      );
      expect(refused.cause).toBe(failure);
      expect(await readFile(reportPath, 'utf8')).toBe('reported');
      expect(await isAbsent(ownedDirectory())).toBe(true);
    },
  );
}

for (const asynchronous of [false, true]) {
  test(
    'population scratch retains publication and required report failure: async=' +
      String(asynchronous),
    async () => {
      const primary = new Error('private operation');
      const reporting = new Error('private reporting');
      const rejection = Promise.reject(reporting);
      const drained = rejection.then(
        () => undefined,
        () => undefined,
      );
      const refused = await requireRejection(
        withRegistryPopulationScratch(
          async (directory) => {
            created.push(directory);
            await writeFile(join(directory, 'content'), 'owned');
            throw primary;
          },
          () => {
            if (asynchronous) return rejection;
            throw reporting;
          },
        ),
      );
      await drained;
      requireCompound(refused.cause, [primary, reporting], primary);
      expect(await isAbsent(ownedDirectory())).toBe(true);
    },
  );
}

for (const fault of ['mode', 'missing', 'file'] as const) {
  for (const operationFails of [false, true]) {
    test(
      'population scratch refuses unsafe/missing cleanup and preserves publication failure: ' +
        fault +
        '/' +
        String(operationFails),
      async () => {
        const primary = new Error('private operation');
        const reportDirectory = await scratchAsync('registry-population-report-');
        const reportPath = join(reportDirectory, 'receipt');
        const refused = await requireRejection(
          withRegistryPopulationScratch(
            async (directory) => {
              created.push(directory);
              await writeFile(join(directory, 'content'), 'owned');
              if (fault === 'mode') await chmod(directory, 0o750);
              else {
                await rm(directory, { recursive: true });
                if (fault === 'file') await writeFile(directory, 'replacement', { mode: 0o700 });
              }
              if (operationFails) throw primary;
              return 'complete';
            },
            async (cause) => {
              if (cause !== primary) throw new Error('Wrong primary reported');
              await writeFile(reportPath, 'reported');
            },
          ),
        );
        let cleanup: unknown = refused.cause;
        if (operationFails) {
          if (!(refused.cause instanceof AggregateError))
            throw new Error('Cleanup hid the publication failure');
          const members: unknown = refused.cause.errors;
          if (!Array.isArray(members) || members.length !== 2)
            throw new Error('Cleanup failed to retain both causes');
          cleanup = members.at(1);
          requireCompound(refused.cause, [primary, cleanup], primary);
          expect(await readFile(reportPath, 'utf8')).toBe('reported');
        }
        expect(cleanup).toBeInstanceOf(Error);
        if (fault === 'missing') expect(cleanup).toMatchObject({ code: 'ENOENT' });
        else {
          expect(await isAbsent(ownedDirectory())).toBe(false);
          if (fault === 'file')
            expect(await readFile(ownedDirectory(), 'utf8')).toBe('replacement');
          else expect(await readFile(join(ownedDirectory(), 'content'), 'utf8')).toBe('owned');
        }
      },
    );
  }
}

test('population scratch keeps ordered operation/report/cleanup failures', async () => {
  const primary = new Error('private operation');
  const reporting = new Error('private reporting');
  const refused = await requireRejection(
    withRegistryPopulationScratch(
      async (directory) => {
        created.push(directory);
        await writeFile(join(directory, 'content'), 'owned');
        await chmod(directory, 0o750);
        throw primary;
      },
      () => {
        throw reporting;
      },
    ),
  );
  if (!(refused.cause instanceof AggregateError))
    throw new Error('Missing three-way completion failure');
  const members: unknown = refused.cause.errors;
  if (!Array.isArray(members) || members.length !== 3)
    throw new Error('Completion dropped a required failure');
  const cleanup: unknown = members.at(2);
  expect(cleanup).toBeInstanceOf(Error);
  requireCompound(refused.cause, [primary, reporting, cleanup], primary);
  expect(await readFile(join(ownedDirectory(), 'content'), 'utf8')).toBe('owned');
});

const Observation = type({
  kind: "'fulfilled'|'rejected'",
  isError: 'boolean',
  code: 'string|null',
  retained: 'boolean',
  marker: 'string|null',
  '+': 'reject',
});
for (const mode of ['uid', 'missing-uid', 'unreadable'] as const) {
  test('population scratch requires observable current ownership metadata: ' + mode, async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        new URL('./registry-population-scratch-observation.fixture.ts', import.meta.url).pathname,
        mode,
      ],
      { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(5000) },
    );
    const [exitCode, output, errors] = await Promise.all([
      child.exited,
      readRegistryBytes(child.stdout, 65536, 'Population observation stdout'),
      readRegistryBytes(child.stderr, 65536, 'Population observation stderr'),
    ]);
    if (exitCode !== 0)
      throw new Error(
        'Isolated population observation failed: ' + new TextDecoder().decode(errors),
      );
    const observed = Observation.assert(JSON.parse(new TextDecoder().decode(output)));
    expect(observed).toEqual({
      kind: 'rejected',
      isError: true,
      code: mode === 'unreadable' ? 'EACCES' : null,
      retained: true,
      marker: 'owned',
    });
  });
}
