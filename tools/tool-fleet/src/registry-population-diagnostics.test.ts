import { expect, test } from 'bun:test';

import {
  describeRegistryPopulationFailure,
  observeRegistryPopulationOutput,
  recordRegistryPartialFailure,
} from './registry-population-diagnostics.fixture';

test('classifies the exact nested actual upload and readonly acknowledgement failures without reflecting messages', () => {
  const upload = new Error(
    'Managed registry request failed with HTTP 503: owned injected third-tier failure',
  );
  const acknowledgement = new Error('Unconfirmed live fencing: supervisor acknowledgement missing');
  const failure = new AggregateError(
    [upload, new Error('Live fencing is unconfirmed', { cause: acknowledgement })],
    'private fixture secret',
  );
  expect(describeRegistryPopulationFailure('partial', failure)).toEqual({
    stage: 'partial',
    upstream503: true,
    readonlyAckMissing: true,
    liveFenceUnconfirmed: true,
    truncated: false,
    frames: [],
    framesTruncated: false,
    partial: null,
  });
  expect(JSON.stringify(describeRegistryPopulationFailure('partial', failure))).not.toContain(
    'private fixture secret',
  );
});

test('unrelated or merely similar messages do not certify the known failure category', () => {
  expect(
    describeRegistryPopulationFailure(
      'retained',
      new Error('503 private token missing readonly acknowledgement'),
    ),
  ).toEqual({
    stage: 'retained',
    upstream503: false,
    readonlyAckMissing: false,
    liveFenceUnconfirmed: false,
    truncated: false,
    frames: [],
    framesTruncated: false,
    partial: null,
  });
});

test('cycles terminate and oversized nested failure trees remain visibly incomplete', () => {
  const cyclic = new Error('private cycle');
  cyclic.cause = cyclic;
  expect(describeRegistryPopulationFailure('reopen', cyclic).truncated).toBe(false);
  expect(
    describeRegistryPopulationFailure(
      'partial',
      new AggregateError(
        Array.from({ length: 100 }, () => new Error('private')),
        'private',
      ),
    ).truncated,
  ).toBe(true);
});

const diagnostic: ReturnType<typeof describeRegistryPopulationFailure> = {
  stage: 'partial',
  upstream503: true,
  readonlyAckMissing: false,
  liveFenceUnconfirmed: false,
  truncated: false,
  frames: [],
  framesTruncated: false,
  partial: null,
};
const failureLine = 'task8-population-diagnostic:' + JSON.stringify(diagnostic);
const ownerLine = 'task8-population-owner:' + JSON.stringify({ boundary: 'publication' });
const trailer = 'Native host fixture operation failed';

test('observes exact failed population frames without converting failure into success', () => {
  expect(observeRegistryPopulationOutput(`${failureLine}\n${ownerLine}\n${trailer}\n`)).toEqual({
    bounded: true,
    diagnostic: 'valid',
    owner: 'valid',
    failure: diagnostic,
    boundary: 'publication',
    trailer: true,
    unexpectedLines: false,
  });
});

test('extra private stderr is represented by a flag and is never reflected', () => {
  const observed = observeRegistryPopulationOutput(
    `secret credential\n${failureLine}\n${ownerLine}\n${trailer}\n`,
  );
  expect(observed.failure).toEqual(diagnostic);
  expect(observed.unexpectedLines).toBe(true);
  expect(JSON.stringify(observed)).not.toContain('secret credential');
});

test('before-helper failure exposes only its fixed setup boundary', () => {
  const observed = observeRegistryPopulationOutput(
    'task8-population-owner:{"boundary":"installation"}\n' + trailer,
  );
  expect(observed.diagnostic).toBe('absent');
  expect(observed.failure).toBeNull();
  expect(observed.boundary).toBe('installation');
  expect(observed.owner).toBe('valid');
});

test('no markers stays absent and unobserved private errors stay private', () => {
  const observed = observeRegistryPopulationOutput('private stack\n' + trailer);
  expect(observed.diagnostic).toBe('absent');
  expect(observed.owner).toBe('absent');
  expect(observed.failure).toBeNull();
  expect(observed.boundary).toBeNull();
  expect(observed.unexpectedLines).toBe(true);
  expect(JSON.stringify(observed)).not.toContain('private stack');
});

test('malformed or unknown diagnostic fields never escape the schema', () => {
  for (const body of [
    '{',
    JSON.stringify({ ...diagnostic, token: 'private' }),
    JSON.stringify({ ...diagnostic, stage: 'private' }),
  ]) {
    const observed = observeRegistryPopulationOutput('task8-population-diagnostic:' + body);
    expect(observed.diagnostic).toBe('invalid');
    expect(observed.failure).toBeNull();
    expect(JSON.stringify(observed)).not.toContain('private');
  }
});

test('duplicate diagnostic or owner markers certify neither competing value', () => {
  const observed = observeRegistryPopulationOutput(
    `${failureLine}\n${failureLine}\n${ownerLine}\n${ownerLine}`,
  );
  expect(observed.diagnostic).toBe('duplicate');
  expect(observed.owner).toBe('duplicate');
  expect(observed.failure).toBeNull();
  expect(observed.boundary).toBeNull();
});

test('unknown owner boundary and additional fields remain invalid', () => {
  for (const body of [
    '{"boundary":"private"}',
    '{"boundary":"publication","token":"private"}',
    '{',
  ]) {
    const observed = observeRegistryPopulationOutput('task8-population-owner:' + body);
    expect(observed.owner).toBe('invalid');
    expect(observed.boundary).toBeNull();
    expect(JSON.stringify(observed)).not.toContain('private');
  }
});

test('oversized bytes or line count do not parse even an otherwise valid marker', () => {
  for (const output of [
    failureLine + '\n' + 'x'.repeat(16384),
    failureLine + '\n' + '\n'.repeat(128),
  ]) {
    const observed = observeRegistryPopulationOutput(output);
    expect(observed.bounded).toBe(false);
    expect(observed.failure).toBeNull();
    expect(observed.boundary).toBeNull();
  }
});

const bundlePath = '/usr/local/libexec/puni-registry-maintenance/proof.js';
const frame = (
  line: number,
  column: number,
): ReturnType<typeof describeRegistryPopulationFailure>['frames'][number] => ({
  file: 'fixture-bundle',
  line,
  column,
});
const withStack = (message: string, lines: string[]) => {
  const failure = new Error(message);
  failure.stack = `Error: ${message}\n${lines.join('\n')}`;
  return failure;
};

test('reports only the first exact bundle code frame per bounded Error node', () => {
  const inner = withStack('private nested', [`    at ${bundlePath}:456:7`]);
  const outer = withStack('private outer', [
    `    at secretFunction (${bundlePath}:123:4)`,
    `    at ${bundlePath}:999:9`,
  ]);
  outer.cause = inner;
  const observed = describeRegistryPopulationFailure('partial', outer);
  expect(observed.frames).toEqual([frame(123, 4), frame(456, 7)]);
  expect(observed.framesTruncated).toBe(false);
  expect(JSON.stringify(observed)).not.toMatch(/private|secretFunction|usr\/local/);
});

test('message-embedded forged matching frames are not interpreted as code frames', () => {
  const message = `private\n    at forged (${bundlePath}:123:4)`;
  const observed = describeRegistryPopulationFailure(
    'partial',
    withStack(message, [`    at actual (${bundlePath}:456:7)`]),
  );
  expect(observed.frames).toEqual([frame(456, 7)]);
  expect(JSON.stringify(observed)).not.toContain('private');
});

test('unknown paths, suffix spoofs, malformed numbers and unknown stack headers yield no location', () => {
  for (const location of [
    `/tmp${bundlePath}:123:4`,
    `${bundlePath}.evil:123:4`,
    `${bundlePath}:0:4`,
    `${bundlePath}:1:-1`,
    `${bundlePath}:1000000:1`,
    `${bundlePath}:1:2 trailing`,
  ]) {
    expect(
      describeRegistryPopulationFailure('partial', withStack('private', [`    at ${location}`]))
        .frames,
    ).toEqual([]);
  }
  const failure = new Error('private');
  failure.stack = `unknown header\n    at ${bundlePath}:123:4`;
  expect(describeRegistryPopulationFailure('partial', failure).frames).toEqual([]);
  expect(
    describeRegistryPopulationFailure('partial', { stack: `    at ${bundlePath}:123:4` }).frames,
  ).toEqual([]);
});

test('stack byte, line and aggregate frame bounds are visible without leaking partial oversized stacks', () => {
  for (const stack of [
    withStack('private', [`    at ${bundlePath}:123:4`, 'x'.repeat(16384)]),
    withStack('private', [
      `    at ${bundlePath}:123:4`,
      ...Array.from({ length: 128 }, () => 'unknown'),
    ]),
  ]) {
    const observed = describeRegistryPopulationFailure('partial', stack);
    expect(observed.frames).toEqual([]);
    expect(observed.framesTruncated).toBe(true);
  }
  const nested = Array.from({ length: 10 }, (_, index) =>
    withStack('private', [`    at ${bundlePath}:${String(index + 1)}:2`]),
  );
  const observed = describeRegistryPopulationFailure(
    'partial',
    new AggregateError(nested, 'private'),
  );
  expect(observed.frames).toHaveLength(8);
  expect(observed.framesTruncated).toBe(true);
});

test('output schema rejects unknown file enums and nonpositive, oversized or excessive numeric locations', () => {
  for (const frames of [
    [{ file: 'private-path', line: 1, column: 2 }],
    [frame(0, 2)],
    [frame(1, 1000000)],
    Array.from({ length: 9 }, () => frame(1, 2)),
  ]) {
    const observed = observeRegistryPopulationOutput(
      'task8-population-diagnostic:' + JSON.stringify({ ...diagnostic, frames }),
    );
    expect(observed.diagnostic).toBe('invalid');
    expect(observed.failure).toBeNull();
    expect(JSON.stringify(observed)).not.toContain('private-path');
  }
});

const partialObservation = {
  thirdLayerPut: true,
  patchAccepted: true,
  injected503: true,
  evidence: 'present' as const,
  stagingPhase: 'writing' as const,
  uploadId: 'valid' as const,
  storedManifests: 2 as const,
};

test('partial fixture observation preserves the exact error and copies only its bounded internal snapshot', () => {
  const failure = new Error('private failure');
  const observed = { ...partialObservation };
  recordRegistryPartialFailure(failure, observed);
  observed.injected503 = false;
  expect(describeRegistryPopulationFailure('partial', failure).partial).toEqual(partialObservation);
  expect(failure.message).toBe('private failure');
  expect(describeRegistryPopulationFailure('partial', new Error('other')).partial).toBeNull();
  expect(JSON.stringify(describeRegistryPopulationFailure('partial', failure))).not.toContain(
    'private failure',
  );
});

test('partial observations survive bounded cause traversal without interpreting non-Error values', () => {
  const failure = new Error('private inner');
  recordRegistryPartialFailure(failure, partialObservation);
  expect(
    describeRegistryPopulationFailure('partial', new Error('outer', { cause: failure })).partial,
  ).toEqual(partialObservation);
  const unknown = { message: 'private', partial: partialObservation };
  recordRegistryPartialFailure(unknown, partialObservation);
  expect(describeRegistryPopulationFailure('partial', unknown).partial).toBeNull();
});

test('partial diagnostic schema refuses unknown fields, phases, UUID values and unbounded counts', () => {
  for (const partial of [
    { ...partialObservation, token: 'private' },
    { ...partialObservation, evidence: 'private' },
    { ...partialObservation, thirdLayerPut: 'private' },
    { ...partialObservation, stagingPhase: 'private' },
    { ...partialObservation, uploadId: '00000000-0000-4000-8000-000000000001' },
    { ...partialObservation, storedManifests: 4 },
  ]) {
    const observed = observeRegistryPopulationOutput(
      'task8-population-diagnostic:' + JSON.stringify({ ...diagnostic, partial }),
    );
    expect(observed.diagnostic).toBe('invalid');
    expect(observed.failure).toBeNull();
    expect(JSON.stringify(observed)).not.toContain('private');
  }
});

for (const stackFrame of [
  '    at restore (/usr/local/libexec/puni-registry-maintenance/backup-worker.js:123:45)',
  '    at /usr/local/libexec/puni-registry-maintenance/backup-worker.js:123:45',
])
  test(
    'fixed backup worker bundle alias retains bounded numeric frame ' + stackFrame.slice(7, 14),
    () => {
      const failure = new Error('private restore details');
      failure.stack = failure.name + ': ' + failure.message + '\n' + stackFrame;
      const observed = describeRegistryPopulationFailure('retained', failure);
      expect(observed.frames).toEqual([frame(123, 45)]);
      expect(JSON.stringify(observed)).not.toContain('private');
    },
  );

test('backup worker alias still excludes forged headings and path suffixes', () => {
  const alias = '/usr/local/libexec/puni-registry-maintenance/backup-worker.js';
  const failure = new Error('private\n    at forged (' + alias + ':123:45)');
  failure.stack = failure.name + ': ' + failure.message + '\n    at actual (/other/worker.js:8:9)';
  expect(describeRegistryPopulationFailure('retained', failure).frames).toEqual([]);
  for (const path of [
    alias + '.extra',
    '/other' + alias,
    alias.replace('backup-worker', 'backup-worker-copy'),
  ]) {
    const unknown = new Error('private');
    unknown.stack = unknown.name + ': ' + unknown.message + '\n    at wrong (' + path + ':123:45)';
    expect(describeRegistryPopulationFailure('retained', unknown).frames).toEqual([]);
  }
});
