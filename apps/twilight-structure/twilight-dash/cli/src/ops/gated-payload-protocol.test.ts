import { expect, it } from 'bun:test';

import {
  decodeGatedEnvironment,
  encodeGatedEnvironment,
  parseGatedStatus,
} from './gated-payload-protocol';

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
it('keeps the complete private environment as own values without prototype setter loss', () => {
  const environment = Object.fromEntries([
    ['__proto__', 'private prototype value'],
    ['constructor', 'private constructor value'],
    ['PWD', ''],
    ['SHLVL', '7'],
    ['_', 'literal _'],
    ['unicode 名', ' ü\n" '],
  ]);
  const frame = encodeGatedEnvironment(environment);
  const restored = decodeGatedEnvironment(frame.subarray(4));
  expect(Object.entries(restored)).toEqual(Object.entries(environment));
  expect(Object.getPrototypeOf(restored)).toBe(Object.prototype);
  expect(Object.hasOwn(restored, '__proto__')).toBe(true);
  expect(new DataView(frame.buffer, frame.byteOffset, 4).getUint32(0, false)).toBe(
    frame.byteLength - 4,
  );
});
it('omits only supplied undefined entries and preserves absent PWD SHLVL and underscore', () => {
  const frame = encodeGatedEnvironment({ GIVEN: '', MISSING: undefined });
  expect(Object.entries(decodeGatedEnvironment(frame.subarray(4)))).toEqual([['GIVEN', '']]);
});
for (const invalid of [
  null,
  {},
  [2, []],
  [1],
  [1, [], 'secret'],
  [1, {}],
  [1, [null]],
  [1, [['name']]],
  [1, [['name', 'value', 'secret']]],
  [1, [['', 'value']]],
  [1, [['a=b', 'value']]],
  [1, [['a\0b', 'value']]],
  [1, [['name', 'bad\0value']]],
  [1, [['name', 1]]],
  [
    1,
    [
      ['name', 'first'],
      ['name', 'second'],
    ],
  ],
])
  it(
    'refuses the closed private environment schema without including private values ' +
      JSON.stringify(invalid).slice(0, 25),
    () => {
      expect(() => decodeGatedEnvironment(bytes(invalid))).toThrow();
    },
  );
it('redacts malformed JSON excerpts and refuses fatal UTF8 and BOM bytes', () => {
  const secret = 'DO_NOT_REPORT_THIS_VALUE';
  let message: string | undefined;
  try {
    decodeGatedEnvironment(new TextEncoder().encode('[1,[["name","' + secret + '"], BROKEN]]'));
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    message = cause.message;
  }
  expect(message).toBeDefined();
  expect(message).not.toContain(secret);
  expect(() => decodeGatedEnvironment(new Uint8Array([255]))).toThrow();
  expect(() =>
    decodeGatedEnvironment(new Uint8Array([239, 187, 191, ...bytes([1, []])])),
  ).toThrow();
});
it('refuses encoded private input beyond8MiB instead of allocating or launching a helper', () => {
  expect(() => encodeGatedEnvironment({ SECRET: 'x'.repeat(8388608) })).toThrow();
  expect(() => decodeGatedEnvironment(new Uint8Array(8388609))).toThrow();
});
for (const [wire, expected] of [
  ['0\n', 0],
  ['37\n', 37],
  ['255\n', 255],
] as const)
  it('accepts canonical private payload status ' + String(expected), () => {
    expect(parseGatedStatus(new TextEncoder().encode(wire))).toEqual({
      kind: 'status',
      status: expected,
    });
  });
it('classifies missing status distinctly from malformed frames', () => {
  expect(parseGatedStatus(new Uint8Array())).toEqual({ kind: 'absent' });
});
for (const wire of [
  '00\n',
  '256\n',
  '999\n',
  '-1\n',
  ' 0\n',
  '0\r\n',
  '0',
  '0\n0\n',
  '0\ntrailing',
])
  it('refuses a malformed private status without numeric fallback ' + JSON.stringify(wire), () => {
    expect(parseGatedStatus(new TextEncoder().encode(wire))).toEqual({ kind: 'invalid' });
  });
