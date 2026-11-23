import { expect, it } from 'bun:test';

import { parseDashCommand, readDashInvocation, UsageRefusal } from '../cli-parser';

it('parses observational lock status without a caller-selected path', () => {
  expect(parseDashCommand(['ops', 'lock', 'status'])).toEqual({
    command: 'ops',
    words: 'lock status',
  });
});
it('parses lock run with exact payload arguments and explicit queue fields', () => {
  const argv = [
    process.execPath,
    '-e',
    'console.log(process.argv)',
    '',
    '--literal',
    'a b',
    '$(literal)',
    ';literal',
  ];
  expect(
    parseDashCommand([
      'ops',
      'lock',
      'run',
      '--label',
      'lane x',
      '--wait-seconds',
      '7',
      '--poll-seconds',
      '2',
      '--',
      ...argv,
    ]),
  ).toEqual({
    command: 'ops',
    words: 'lock run',
    label: 'lane x',
    waitSeconds: 7,
    pollSeconds: 2,
    argv,
  });
});
it('parses the legacy immediate lock queue defaults', () => {
  expect(parseDashCommand(['ops', 'lock', 'run', '--', process.execPath])).toEqual({
    command: 'ops',
    words: 'lock run',
    label: 'unlabeled',
    waitSeconds: 0,
    pollSeconds: 5,
    argv: [process.execPath],
  });
});
for (const argv of [
  ['ops', 'lock', 'status', 'extra'],
  ['ops', 'lock', 'run', '--'],
  ['ops', 'lock', 'run', '--poll-seconds', '0', '--', process.execPath],
  ['ops', 'lock', 'run', '--lock-path', '/tmp/not-canonical', '--', process.execPath],
])
  it('refuses an unsupported foreground lock invocation ' + JSON.stringify(argv), () => {
    expect(() => parseDashCommand(argv)).toThrow(UsageRefusal);
  });

it('parses the fixed versioned internal holder without an arbitrary payload or mutex operand', () => {
  expect(
    parseDashCommand([
      'ops',
      'lock',
      'hold-internal-v1',
      '--hold-file',
      '/private/hold',
      '--controller-pid',
      '123',
      '--controller-boot',
      '01234567-89ab-cdef-0123-456789abcdef',
      '--controller-start',
      '123456',
      '--label',
      'private lane',
      '--wait-seconds',
      '30',
      '--poll-seconds',
      '2',
    ]),
  ).toEqual({
    command: 'ops',
    words: 'lock hold-internal-v1',
    holdFile: '/private/hold',
    controllerPid: 123,
    controllerBoot: '01234567-89ab-cdef-0123-456789abcdef',
    controllerStart: '123456',
    label: 'private lane',
    waitSeconds: 30,
    pollSeconds: 2,
  });
});
it('keeps the internal holder absent from public lock help', () => {
  let output = '';
  readDashInvocation(['ops', 'lock', '--help'], (text) => {
    output += text;
  });
  expect(output).toContain('status');
  expect(output).toContain('run');
  expect(output).not.toContain('hold-internal-v1');
});
for (const args of [
  ['ops', 'lock', 'hold-internal-v1'],
  [
    'ops',
    'lock',
    'hold-internal-v1',
    '--hold-file',
    '/private/hold',
    '--lock-path',
    '/private/mutex',
  ],
  ['ops', 'lock', 'hold-internal-v1', '--hold-file', '/private/hold', '--', 'arbitrary-program'],
  ['ops', 'lock', 'hold-internal-v2', '--hold-file', '/private/hold'],
])
  it('refuses unsupported private holder operands ' + JSON.stringify(args), () => {
    expect(() => parseDashCommand(args)).toThrow(UsageRefusal);
  });
