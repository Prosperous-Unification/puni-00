import * as validation from '@shared/validation';
import { expect, it, spyOn } from 'bun:test';

import * as jsonInput from './json-input';
import { decodePreparationRequest, PreparationUsageRefusal } from './preparation-request';

const common = {
  candidateRepository: '../candidate with spaces',
  candidateSha: 'a'.repeat(40),
  reviewRecord: '../operator review.json',
  destination: '../activation',
  work: '../work',
  resourceLane: 'lane.consumer',
  cwdIdentity: 'cwd.consumer',
  checkRuns: '../check-runs',
};
const context = {
  callerDirectory: '/operator with spaces',
  toolkitDirectory: '/trusted/toolkit',
  expectedToolkitIdentity: 'b'.repeat(64),
};
const requests = {
  'prepare-activation': {
    command: 'prepare-activation',
    ...common,
    toolkit: undefined,
    candidatePolicy: 'docs/wiki-policy/policy.json',
    candidateMapping: 'docs/wiki-policy/modules.json',
    auditStrata: '../audit-strata.json',
  },
  'prepare-relocation-activation': {
    command: 'prepare-relocation-activation',
    ...common,
    baseActivation: '../base/activation',
    candidatePolicy: undefined,
    candidateLauncher: undefined,
    validatorEntry: undefined,
  },
} as const;
function encode(request: unknown, extra: Record<string, unknown> = {}): Uint8Array {
  return Buffer.from(JSON.stringify({ version: 1, ...context, request, ...extra }));
}

for (const command of ['prepare-activation', 'prepare-relocation-activation'] as const) {
  it('decodes exact typed ' + command + ' without argv reconstruction', () => {
    expect(decodePreparationRequest(encode(requests[command]), command)).toEqual({
      version: 1,
      ...context,
      request: requests[command],
    });
  });
  it('refuses a request for the other preparation executable role ' + command, () => {
    const other =
      command === 'prepare-activation' ? 'prepare-relocation-activation' : 'prepare-activation';
    expect(() => decodePreparationRequest(encode(requests[other]), command)).toThrow(
      PreparationUsageRefusal,
    );
  });
  it('refuses unknown ' + command + ' request fields without retaining source secrets', () => {
    const bytes = encode({ ...requests[command], secret: 'source-secret-canary' });
    try {
      decodePreparationRequest(bytes, command);
      throw new Error('unknown field was admitted');
    } catch (cause) {
      expect(cause).toBeInstanceOf(PreparationUsageRefusal);
      if (!(cause instanceof PreparationUsageRefusal)) throw cause;
      expect(cause.message).toBe('invalid installed preparation request');
      expect(cause.cause).toBeUndefined();
      expect(cause.status).toBe(64);
    }
  });
}

for (const extra of [
  { version: 2 },
  { callerDirectory: 'relative' },
  { toolkitDirectory: '../candidate' },
  { expectedToolkitIdentity: 'not-a-digest' },
  { secret: 'source-secret-canary' },
]) {
  it('refuses malformed preparation invocation ' + JSON.stringify(extra), () => {
    expect(() =>
      decodePreparationRequest(encode(requests['prepare-activation'], extra), 'prepare-activation'),
    ).toThrow(PreparationUsageRefusal);
  });
}

it('refuses malformed JSON and raw invalid UTF8 before any preparation operation', () => {
  for (const bytes of [Buffer.from('not JSON'), Uint8Array.from([0xff])])
    expect(() => decodePreparationRequest(bytes, 'prepare-activation')).toThrow(
      PreparationUsageRefusal,
    );
});

for (const command of ['prepare-activation', 'prepare-relocation-activation'] as const) {
  for (const [field, value] of Object.entries(requests[command])) {
    if (value === undefined) continue;
    it('requires private ' + command + ' field ' + field, () => {
      const request: Record<string, unknown> = { ...requests[command] };
      Reflect.deleteProperty(request, field);
      expect(() => decodePreparationRequest(encode(request), command)).toThrow(
        PreparationUsageRefusal,
      );
    });
    if (field === 'command') continue;
    for (const invalid of ['', '  ', 'operand\0suffix', 17]) {
      it('refuses private ' + command + ' ' + field + ' operand ' + JSON.stringify(invalid), () => {
        expect(() =>
          decodePreparationRequest(encode({ ...requests[command], [field]: invalid }), command),
        ).toThrow(PreparationUsageRefusal);
      });
    }
  }
}
for (const [command, fields] of [
  ['prepare-activation', ['toolkit']],
  ['prepare-relocation-activation', ['candidatePolicy', 'candidateLauncher', 'validatorEntry']],
] as const) {
  for (const field of fields) {
    for (const invalid of ['', ' ', 'operand\0suffix', 17]) {
      it(
        'refuses private optional ' + command + ' ' + field + ' operand ' + JSON.stringify(invalid),
        () => {
          expect(() =>
            decodePreparationRequest(encode({ ...requests[command], [field]: invalid }), command),
          ).toThrow(PreparationUsageRefusal);
        },
      );
    }
  }
}
for (const field of [
  'version',
  'callerDirectory',
  'toolkitDirectory',
  'expectedToolkitIdentity',
  'request',
]) {
  it('requires private invocation ' + field, () => {
    const selected: Record<string, unknown> = {
      version: 1,
      ...context,
      request: requests['prepare-activation'],
    };
    Reflect.deleteProperty(selected, field);
    expect(() =>
      decodePreparationRequest(Buffer.from(JSON.stringify(selected)), 'prepare-activation'),
    ).toThrow(PreparationUsageRefusal);
  });
}
for (const boundary of ['json', 'schema'] as const) {
  it('preserves unrelated ' + boundary + ' decoder implementation failure identity', () => {
    const failure = new Error('controlled decoder implementation failure');
    const changed =
      boundary === 'json'
        ? spyOn(jsonInput, 'decodeJsonInput').mockImplementation(() => {
            throw failure;
          })
        : spyOn(validation, 'parseSecretsOrThrow').mockImplementation(() => {
            throw failure;
          });
    try {
      let observed: unknown;
      try {
        decodePreparationRequest(encode(requests['prepare-activation']), 'prepare-activation');
      } catch (cause) {
        observed = cause;
      }
      expect(observed).toBe(failure);
    } finally {
      changed.mockRestore();
    }
  });
}
