import { expect, test } from 'bun:test';

import { decodeKey, encodeKey } from './identity-key';

test('private keys preserve exact UTF-16 strings without narrowing domain constraints', () => {
  for (const identity of [
    '\ud800',
    '\ud801',
    '\udc00',
    '\ufffd',
    '\\ud800',
    '\0',
    '🪁',
    '',
    'x'.repeat(4096),
  ]) {
    expect(encodeKey(identity)).toBe(JSON.stringify(identity));
    expect(decodeKey(encodeKey(identity))).toBe(identity);
  }
});

test('private keys refuse noncanonical JSON and non-string values', () => {
  for (const physical of [
    'null',
    '1',
    '{}',
    '[]',
    '"\\u0061"',
    ' "a"',
    '"a"\n',
    '"\\ud83e\\ude81"',
    'broken',
  ])
    expect(() => decodeKey(physical)).toThrow();
});
