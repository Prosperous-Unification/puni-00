import * as filesystem from 'node:fs';

import { mock } from 'bun:test';

import type { ObservationStateConfig } from './observation-state';

const configurationPath = process.argv.at(2);
const foreignAncestor = process.argv.at(3);
const kind = process.argv.at(4) ?? 'ancestor';
if (configurationPath === undefined || foreignAncestor === undefined)
  throw new Error('ancestor fixture arguments absent');

const originalLstat = filesystem.lstatSync.bind(filesystem);
const originalFstat = filesystem.fstatSync.bind(filesystem);
const originalReadlink = filesystem.readlinkSync.bind(filesystem);
const withForeignOwner = (entry: NonNullable<ReturnType<typeof originalLstat>>) =>
  new Proxy(entry, {
    get: (target, property, receiver) =>
      property === 'uid' ? 7777 : (Reflect.get(target, property, receiver) as unknown),
  });
await mock.module('node:fs', () => ({
  ...filesystem,
  lstatSync: (path: string) => {
    const entry = originalLstat(path);
    return kind === 'ancestor' && path === foreignAncestor ? withForeignOwner(entry) : entry;
  },
  fstatSync: (descriptor: number) => {
    const entry = originalFstat(descriptor);
    return kind === 'lock' &&
      originalReadlink(`/proc/self/fd/${String(descriptor)}`) === foreignAncestor
      ? withForeignOwner(entry)
      : entry;
  },
}));

const { initializeObservationState } = await import('./observation-state');
const serialized = JSON.parse(filesystem.readFileSync(configurationPath, 'utf8')) as Omit<
  ObservationStateConfig,
  'clock'
>;
try {
  const outcome = await initializeObservationState({ ...serialized, clock: () => 1000 });
  process.stdout.write(JSON.stringify({ outcome }));
} catch (cause) {
  process.stdout.write(JSON.stringify({ error: String(cause) }));
}
