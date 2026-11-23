import { expect, it } from 'bun:test';

import { readTermination } from './native-exit';

for (const [name, code, signal, status] of [
  ['exit zero', 0, null, 0],
  ['exit37', 37, null, 37],
  ['exit255', 255, null, 255],
  ['named TERM', null, 'SIGTERM', 143],
  ['numeric TERM', null, 15, 143],
  ['named INT', null, 'SIGINT', 130],
] as const)
  it('confirms one complete native identity: ' + name, () => {
    expect(readTermination(code, signal)).toEqual({ kind: 'confirmed', status });
  });

for (const [name, code, signal] of [
  ['nonnumeric exit code', '37', null],
  ['negative exit code', -1, null],
  ['fractional exit code', 1.5, null],
  ['oversized exit code', 256, null],
  ['NaN exit code', Number.NaN, null],
  ['infinite exit code', Number.POSITIVE_INFINITY, null],
  ['missing exit code', undefined, null],
  ['both fields missing', null, null],
  ['two simultaneous native identities', 37, 'SIGTERM'],
  ['signal with zero exit code', 0, 15],
  ['signal without explicit absent code', undefined, 'SIGTERM'],
  ['numeric signal zero', null, 0],
  ['negative numeric signal', null, -1],
  ['fractional numeric signal', null, 1.5],
  ['oversized numeric signal', null, 128],
  ['NaN numeric signal', null, Number.NaN],
  ['unknown signal name', null, 'SIG_UNKNOWN'],
  ['numeric signal text', null, '15'],
  ['missing signal field', 37, undefined],
  ['nonprimitive signal field', null, {}],
] as const)
  it('refuses to confirm ' + name, () => {
    expect(readTermination(code, signal).kind).toBe('unconfirmed');
  });
