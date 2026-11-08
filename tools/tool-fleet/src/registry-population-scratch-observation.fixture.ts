import * as filesystem from 'node:fs/promises';
import { join } from 'node:path';

import { mock } from 'bun:test';

import { withRegistryPopulationScratch } from './registry-population-scratch.fixture';

const mode = process.argv.at(2);
if (mode !== 'uid' && mode !== 'missing-uid' && mode !== 'unreadable')
  throw new Error('Unknown isolated population metadata case');
const original = { ...filesystem };
const descriptor = Object.getOwnPropertyDescriptor(process, 'getuid');
const getuid = process.getuid;
if (descriptor === undefined || typeof getuid !== 'function')
  throw new Error('Required native UID observation is unavailable');
const unreadable = Object.assign(new Error('private metadata refusal'), { code: 'EACCES' });
let directory: string | undefined;
if (mode === 'unreadable') {
  await mock.module('node:fs/promises', () => ({
    ...original,
    async lstat(path: string) {
      const metadata = await original.lstat(path);
      if (path === directory) throw unreadable;
      return metadata;
    },
  }));
}
let completion: { kind: 'fulfilled' } | { kind: 'rejected'; cause: unknown };
try {
  await withRegistryPopulationScratch(
    async (owned) => {
      directory = owned;
      await original.writeFile(join(owned, 'content'), 'owned');
      if (mode === 'uid')
        Object.defineProperty(process, 'getuid', { ...descriptor, value: () => getuid() + 1 });
      if (mode === 'missing-uid')
        Object.defineProperty(process, 'getuid', { ...descriptor, value: undefined });
      return 'complete';
    },
    () => {
      throw new Error('Successful operation must not report failure');
    },
  );
  completion = { kind: 'fulfilled' };
} catch (cause) {
  completion = { kind: 'rejected', cause };
} finally {
  Object.defineProperty(process, 'getuid', descriptor);
}
if (directory === undefined) throw new Error('Population operation never received scratch');
let retained = true;
try {
  await original.lstat(directory);
} catch (cause) {
  if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT') throw cause;
  retained = false;
}
const marker = retained ? await original.readFile(join(directory, 'content'), 'utf8') : null;
if (retained) await original.rm(directory, { recursive: true });
const failure = completion.kind === 'rejected' ? completion.cause : undefined;
console.log(
  JSON.stringify({
    kind: completion.kind,
    isError: failure instanceof Error,
    code:
      failure instanceof Error && 'code' in failure && typeof failure.code === 'string'
        ? failure.code
        : null,
    retained,
    marker,
  }),
);
