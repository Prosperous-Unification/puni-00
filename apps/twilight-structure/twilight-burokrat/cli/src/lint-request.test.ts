import * as validation from '@shared/validation';
import { describe, expect, it, spyOn } from 'bun:test';

import { readInstalledRequest, UsageRefusal } from './cli-parser';
import { decodeLintRequest, LintUsageRefusal } from './lint-request';

function encodeInput(input: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(input));
}
const request = {
  command: 'lint',
  kind: 'committed',
  repository: '../candidate with spaces',
  revision: 'HEAD~1',
};
const envelope = { version: 1 as const, callerDirectory: '/caller with spaces', request };

describe('installed lint request boundary', () => {
  for (const selection of ['working', 'staged', 'committed'] as const) {
    it(
      'round trips the real installed ' + selection + ' grammar request without argv reparsing',
      () => {
        const parsed = readInstalledRequest('lint', [
          'lint',
          selection,
          '../candidate with spaces',
          'HEAD~1',
        ]);
        expect(decodeLintRequest(encodeInput({ ...envelope, request: parsed }))).toStrictEqual({
          ...envelope,
          request: parsed,
        });
      },
    );
  }

  it('the installed grammar refuses an unsupported selection before operation IO', () => {
    expect(() => readInstalledRequest('lint', ['lint', 'unreviewed', '/absent', 'HEAD'])).toThrow(
      UsageRefusal,
    );
  });

  for (const field of ['version', 'callerDirectory', 'request']) {
    it('requires envelope ' + field, () => {
      const incomplete = { ...envelope };
      Reflect.deleteProperty(incomplete, field);
      expect(() => decodeLintRequest(encodeInput(incomplete))).toThrow(LintUsageRefusal);
    });
  }
  for (const field of Object.keys(request)) {
    it('requires request ' + field, () => {
      const incomplete = { ...request };
      Reflect.deleteProperty(incomplete, field);
      expect(() => decodeLintRequest(encodeInput({ ...envelope, request: incomplete }))).toThrow(
        LintUsageRefusal,
      );
    });
    for (const value of [42, '', ' \t\n ', '\0']) {
      it('refuses invalid request ' + field + ': ' + JSON.stringify(value), () => {
        expect(() =>
          decodeLintRequest(encodeInput({ ...envelope, request: { ...request, [field]: value } })),
        ).toThrow(LintUsageRefusal);
      });
    }
  }

  for (const input of [
    null,
    [],
    42,
    'secret-marker',
    { ...envelope, version: 2 },
    { ...envelope, callerDirectory: 'relative' },
    { ...envelope, callerDirectory: '' },
    { ...envelope, callerDirectory: 42 },
    { ...envelope, callerDirectory: '/caller\0path' },
    { ...envelope, request: null },
    { ...envelope, secret: 'secret-marker' },
    { ...envelope, request: { ...request, secret: 'secret-marker' } },
    { ...envelope, request: { ...request, command: 'lint-ci' } },
    { ...envelope, request: { ...request, kind: 'unreviewed' } },
  ]) {
    it('refuses malformed/unsupported envelope ' + JSON.stringify(input), () => {
      expect(() => decodeLintRequest(encodeInput(input))).toThrow('invalid installed lint request');
    });
  }

  it('refuses malformed JSON and invalid raw UTF-8 without reporting source bytes', () => {
    for (const bytes of [new TextEncoder().encode('{secret-marker'), Uint8Array.of(0xff, 0xfe)]) {
      expect(() => decodeLintRequest(bytes)).toThrow('invalid installed lint request');
    }
    const bytes = encodeInput(envelope);
    const position = new TextDecoder().decode(bytes).indexOf('candidate');
    bytes[position] = 0xff;
    expect(() => decodeLintRequest(bytes)).toThrow('invalid installed lint request');
  });

  it('models usage refusal as64 with a fixed diagnostic and no source-bearing cause', () => {
    try {
      decodeLintRequest(encodeInput({ ...envelope, secret: 'secret-marker' }));
    } catch (cause) {
      expect(cause).toBeInstanceOf(LintUsageRefusal);
      if (!(cause instanceof LintUsageRefusal)) throw cause;
      expect(cause.status).toBe(64);
      expect(cause.message).toBe('invalid installed lint request');
      expect(cause.cause).toBeUndefined();
      return;
    }
    throw new Error('invalid request was admitted');
  });
});

it('does not normalize a trusted lint-schema implementation failure as usage', () => {
  const fault = new Error('injected lint-schema implementation failure');
  const spy = spyOn(validation, 'parseSecretsOrThrow').mockImplementation(() => {
    throw fault;
  });
  try {
    try {
      decodeLintRequest(encodeInput(envelope));
    } catch (cause) {
      expect(cause).toBe(fault);
      return;
    }
    throw new Error('lint implementation failure was swallowed');
  } finally {
    spy.mockRestore();
  }
});

for (const phase of ['schema', 'JSON'] as const) {
  it('preserves an internal TypeError from the lint ' + phase + ' phase', () => {
    const fault = new TypeError('injected internal ' + phase + ' TypeError');
    const source = encodeInput(envelope);
    const spy =
      phase === 'schema'
        ? spyOn(validation, 'parseSecretsOrThrow').mockImplementation(() => {
            throw fault;
          })
        : spyOn(JSON, 'parse').mockImplementation(() => {
            throw fault;
          });
    try {
      try {
        decodeLintRequest(source);
      } catch (cause) {
        expect(cause).toBe(fault);
        return;
      }
      throw new Error('internal TypeError was swallowed');
    } finally {
      spy.mockRestore();
    }
  });
}

it('preserves an unexpected UTF-8 decoder dependency failure', () => {
  const bytes = encodeInput(envelope);
  const fault = new Error('injected decoder implementation failure');
  const decode = spyOn(TextDecoder.prototype, 'decode').mockImplementation(() => {
    throw fault;
  });
  try {
    try {
      decodeLintRequest(bytes);
    } catch (cause) {
      expect(cause).toBe(fault);
      return;
    }
    throw new Error('decoder implementation failure was normalized');
  } finally {
    decode.mockRestore();
  }
});
