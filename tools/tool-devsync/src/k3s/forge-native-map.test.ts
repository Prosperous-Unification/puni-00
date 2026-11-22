import { readFileSync } from 'node:fs';

import { expect, it } from 'bun:test';

import { createForgeNativeInspection } from './forge-native';
import { readNativeMapping } from './forge-native-map';

it('reads actual Linux map records including anonymous trailing separators', () => {
  const lines = readFileSync('/proc/self/maps', 'utf8').trimEnd().split('\n');
  expect(lines.length).toBeGreaterThan(0);
  const observed = lines.map((line) => ({ line, mapping: readNativeMapping(line) }));
  expect(
    observed.some(({ line, mapping }) => mapping.encodedPath === undefined && line.endsWith(' ')),
  ).toBe(true);
  expect(
    observed.some(
      ({ mapping }) =>
        mapping.permissions.includes('x') && mapping.encodedPath?.startsWith('/') === true,
    ),
  ).toBe(true);
});

it('preserves anonymous and named map identity without consuming pathname spaces', () => {
  expect(readNativeMapping('06853000-06a0d000 rw-p 00000000 00:00 0 ')).toEqual({
    permissions: 'rw-p',
    inode: '0',
    encodedPath: undefined,
  });
  expect(readNativeMapping('06853000-06a0d000 rw-p 00000000 00:00 0    ')).toEqual({
    permissions: 'rw-p',
    inode: '0',
    encodedPath: undefined,
  });
  expect(readNativeMapping('06853000-06a0d000 rw-p 00000000 00:00 0')).toEqual({
    permissions: 'rw-p',
    inode: '0',
    encodedPath: undefined,
  });
  expect(
    readNativeMapping('06853000-06a0d000 r-xp 00000000 00:01 9007199254740993 /native library.so '),
  ).toEqual({ permissions: 'r-xp', inode: '9007199254740993', encodedPath: '/native library.so ' });
  expect(
    readNativeMapping('06853000-06a0d000 r-xp 00000000 00:01 7 /native\\040library.so'),
  ).toEqual({ permissions: 'r-xp', inode: '7', encodedPath: '/native\\040library.so' });
});

it('refuses malformed native map records at the production decoder', () => {
  for (const line of [
    '',
    ' ',
    '06853000-06a0d000 r-zp 00000000 00:00 0 ',
    '06853000-06a0d000 rw-p missing 00:00 0 ',
    '06853000-06a0d000 rw-p 00000000 invalid 0 ',
    '06853000-06a0d000 rw-p 00000000 00:00 invalid ',
    '06853000 rw-p 00000000 00:00 0 ',
  ])
    expect(() => readNativeMapping(line), line).toThrow(
      'Forge native map observation is malformed',
    );
});

it('creates and rechecks the actual mapped native executable observation', () => {
  const inspect = createForgeNativeInspection();
  expect(inspect()).toBe(true);
}, 30000);
