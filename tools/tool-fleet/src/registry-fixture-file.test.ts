import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { pinFixtureFile, writeFixtureFile } from './registry-fixture-file';

const contents = 'fixture-password\n';
const expectedSha256 = '72cf7b2f62578a706c5c80be2c79446dfdf0f1f9c14b33fd577b9a68b85d6a22';

test('fixture file writer pins exact written bytes and requested mode', async () => {
  const directory = await scratchAsync('registry-fixture-file-');
  const path = join(directory, 'nested/credential');
  const artifact = await writeFixtureFile(path, contents, 0o600);
  expect(artifact).toEqual({ path, sha256: expectedSha256 });
  expect(await readFile(path, 'utf8')).toBe(contents);
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  const configuration = await writeFixtureFile(
    join(directory, 'backup.json'),
    JSON.stringify({
      password: artifact,
    }),
  );
  expect(JSON.parse(await readFile(configuration.path, 'utf8'))).toEqual({ password: artifact });
  expect((await stat(configuration.path)).mode & 0o777).toBe(0o644);
  expect(configuration).toEqual(await pinFixtureFile(configuration.path));
});

test('fixture pins reflect actual current file bytes, not an earlier input', async () => {
  const directory = await scratchAsync('registry-fixture-pin-');
  const path = join(directory, 'credential');
  await writeFixtureFile(path, contents, 0o600);
  await writeFile(path, 'changed\n');
  expect(await pinFixtureFile(path)).toEqual({
    path,
    sha256: '7f8b1dfc466b6249f06cbe55c9174df2578e7754da793fded244ef5cba2a38f1',
  });
});

test('fixture writer refuses an occupied path without replacing its bytes', async () => {
  const directory = await scratchAsync('registry-fixture-exclusive-');
  const path = join(directory, 'retained');
  await writeFixtureFile(path, contents, 0o600);
  const refusal = await writeFixtureFile(path, 'replacement', 0o600).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(await readFile(path, 'utf8')).toBe(contents);
  expect(refusal).toMatchObject({ code: 'EEXIST' });
});

test('fixture pin refuses missing required file bytes', async () => {
  const directory = await scratchAsync('registry-fixture-absent-');
  const refusal = await pinFixtureFile(join(directory, 'absent')).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(refusal).toMatchObject({ code: 'ENOENT' });
});
