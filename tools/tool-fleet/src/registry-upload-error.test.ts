import { expect, test } from 'bun:test';

const uuid = 'aabbccdd-1234-4234-8234-aabbccddeeff';
const root =
  '/var/lib/puni-registry/registry/contents/docker/registry/v2/repositories/pressure/full/_uploads/';
const path = root + uuid + '/data';
const messagePrefix = 'Managed registry request failed with HTTP 500: ';
const encode = (detail: unknown) =>
  JSON.stringify({ errors: [{ code: 'UNKNOWN', message: 'unknown error', detail }] });
const physical = { Op: 'write', Path: path, Err: 28 };

for (const operation of ['open', 'write', 'mkdir'] as const) {
  for (const wrapped of [false, true]) {
    test(
      'upload ENOSPC validates selected filesystem ' + operation + ' ' + String(wrapped),
      async () => {
        const { requireRegistryUploadEnospc } = await import('./registry-upload-error.fixture');
        const failure = { ...physical, Op: operation };
        const body = encode(wrapped ? { DriverName: 'filesystem', Enclosed: failure } : failure);
        expect(requireRegistryUploadEnospc(body, uuid)).toEqual({ operation, errno: 28 });
      },
    );
  }
}

for (const [name, detail] of [
  ['errno13', { ...physical, Err: 13 }],
  ['errno5', { ...physical, Err: 5 }],
  ['errno280', { ...physical, Err: 280 }],
  ['string errno', { ...physical, Err: '28' }],
  ['absent errno', { Op: 'write', Path: path }],
  ['foreign operation', { ...physical, Op: 'read' }],
  ['absent operation', { Path: path, Err: 28 }],
  ['absent path', { Op: 'write', Err: 28 }],
  ['foreign upload', { ...physical, Path: root + '00000000-0000-4000-8000-000000000001/data' }],
  ['foreign repository', { ...physical, Path: path.replace('pressure/full', 'foreign/full') }],
  ['foreign root', { ...physical, Path: '/foreign' + path }],
  ['traversal', { ...physical, Path: root + uuid + '/hashstates/../data' }],
  ['double separator', { ...physical, Path: root + uuid + '//data' }],
  ['nul path', { ...physical, Path: path + '\0' }],
  ['oversized path', { ...physical, Path: path + 'x'.repeat(512) }],
  ['extra field', { ...physical, PRIVATE: 'not a syscall error' }],
  ['text only', 'write: no space left on device'],
  ['numeric pattern only', { Err: 28 }],
  ['foreign driver', { DriverName: 's3', Enclosed: physical }],
  ['missing driver', { Enclosed: physical }],
  ['extra driver field', { DriverName: 'filesystem', Enclosed: physical, PRIVATE: true }],
  ['missing enclosed', { DriverName: 'filesystem' }],
] as const) {
  test('upload ENOSPC refuses ' + name, async () => {
    const { requireRegistryUploadEnospc } = await import('./registry-upload-error.fixture');
    expect(() => requireRegistryUploadEnospc(encode(detail), uuid)).toThrow();
  });
}

for (const [name, body] of [
  ['malformed JSON', '{'],
  ['absent errors', '{}'],
  ['absent code', JSON.stringify({ errors: [{ message: 'unknown error', detail: physical }] })],
  ['absent message', JSON.stringify({ errors: [{ code: 'UNKNOWN', detail: physical }] })],
  [
    'extra error field',
    JSON.stringify({
      errors: [{ code: 'UNKNOWN', message: 'unknown error', detail: physical, PRIVATE: true }],
    }),
  ],
  ['null envelope', 'null'],
  ['empty errors', '{"errors":[]}'],
  [
    'extra error',
    JSON.stringify({
      errors: [
        { code: 'UNKNOWN', message: 'unknown error', detail: physical },
        { code: 'UNKNOWN', message: 'unknown error', detail: physical },
      ],
    }),
  ],
  [
    'foreign code',
    JSON.stringify({
      errors: [{ code: 'UNSUPPORTED', message: 'unknown error', detail: physical }],
    }),
  ],
  [
    'foreign message',
    JSON.stringify({ errors: [{ code: 'UNKNOWN', message: 'PRIVATE', detail: physical }] }),
  ],
  ['absent detail', '{"errors":[{"code":"UNKNOWN","message":"unknown error"}]}'],
  [
    'extra envelope field',
    JSON.stringify({
      errors: [{ code: 'UNKNOWN', message: 'unknown error', detail: physical }],
      PRIVATE: true,
    }),
  ],
] as const) {
  test('upload ENOSPC refuses ' + name, async () => {
    const { requireRegistryUploadEnospc } = await import('./registry-upload-error.fixture');
    expect(() => requireRegistryUploadEnospc(body, uuid)).toThrow();
  });
}

test('upload failure receipt validates the same selected filesystem error', async () => {
  const { requireRegistryUploadFailureMessage } = await import('./registry-upload-error.fixture');
  expect(
    requireRegistryUploadFailureMessage(messagePrefix + encode(physical) + '\n', uuid),
  ).toEqual({ operation: 'write', errno: 28 });
});
for (const [name, message] of [
  ['foreign status', messagePrefix.replace('500', '503') + encode(physical)],
  ['foreign origin', 'PRIVATE ' + encode(physical)],
  ['truncated body', messagePrefix + encode(physical).slice(0, -1)],
  [
    'foreign upload',
    messagePrefix +
      encode({ ...physical, Path: root + '00000000-0000-4000-8000-000000000001/data' }),
  ],
  ['unrelated failure', messagePrefix + encode({ ...physical, Err: 13 })],
] as const) {
  test('upload failure receipt refuses ' + name, async () => {
    const { requireRegistryUploadFailureMessage } = await import('./registry-upload-error.fixture');
    expect(() => requireRegistryUploadFailureMessage(message, uuid)).toThrow();
  });
}
