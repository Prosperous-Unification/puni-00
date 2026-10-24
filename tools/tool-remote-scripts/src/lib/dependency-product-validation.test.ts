import { rejects } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import {
  assertHostCgroupReadback,
  assertHostMappings,
  assertHostStartReadback,
  assertHostStatusReadback,
  assertRoster,
  decodeHostCgroup,
  decodeHostStatus,
  decodeInnerProcess,
  decodePasses,
  inspectInnerProfile,
  readStart,
  updateReceiptHash,
} from './dependency-product-validation';
import { readProductHostProc } from './product-host-proc';

const stamp = '2026-10-24 08:00:00.000000000 +0000';
const stat = (pid: number, start = '100') =>
  `${String(pid)} (owned product) S ${Array.from({ length: 18 }, () => '1').join(' ')} ${start}`;
const status = (pid: number, mapping: string) =>
  `Tgid:\t${String(pid)}\nUid:\t0\t0\t0\t0\nNSpid:\t${mapping}\n`;
const roster = () => [
  {
    pid: 101,
    parent: 1,
    start: '100',
    namespacePid: 1,
    uid: 0,
    uids: [0, 0, 0, 0],
    cgroup: '/docker/owned',
  },
  {
    pid: 102,
    parent: 101,
    start: '100',
    namespacePid: 2,
    uid: 0,
    uids: [0, 0, 0, 0],
    cgroup: '/docker/owned',
  },
];
const proc = (pid: number) => [
  'PROC',
  String(pid),
  stat(pid),
  status(pid, String(pid)),
  Buffer.from(
    `${(pid === 1 ? ['/sbin/docker-init', '--', 'bun', 'run', 'src/main.ts'] : ['bun', 'run', 'src/main.ts']).join('\0')}\0`,
  ).toString('base64'),
  '/app/apps/wbs/be-01',
  pid === 1 ? '/sbin/docker-init' : '/usr/local/bin/bun',
  `2049:${String(pid)}:32|${stamp}|${stamp}`,
  'a'.repeat(64),
  'pid:[1]',
  'net:[2]',
  'mnt:[3]',
];
const header =
  ' sl local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n';
const tcp = (address = '0100007F', port = '0C1C', inode = '123') =>
  `${header}0: ${address}:${port} 00000000:0000 0A 0:0 00:0 0 0 0 ${inode}\n`;
const frames = () =>
  ['before', 'after'].flatMap((label) => [
    ['PASS', label],
    proc(1),
    proc(2),
    ['FD', '2', '3', 'socket:[123]'],
    ['SELF', 'pid:[1]', 'net:[2]', 'mnt:[3]'],
    ['TCP', '4', tcp()],
    ['TCP', '6', header],
    ['ADDR', '1: lo inet 127.0.0.1/8 scope host lo\n'],
  ]);
const native = {
  Path: 'bun',
  Args: ['run', 'src/main.ts'],
  Config: { WorkingDir: '/app/apps/wbs/be-01' },
};
const profile = (receipt = frames(), members = roster()) =>
  inspectInnerProfile(decodePasses(receipt, members)[0], members, 'backend', native);

// Each malformed raw family catches omission of its corresponding production decoder guard.
test('host accepts ordinary mapping and identity maps', () => {
  expect(decodeHostStatus(101, status(101, '101\t1'))).toEqual({
    namespacePid: 1,
    uid: 0,
    uids: [0, 0, 0, 0],
  });
  expect(decodeHostCgroup('0::/docker/owned\n')).toBe('0::/docker/owned');
  expect(() => {
    assertHostMappings('0 0 4294967295\n', '0 0 4294967295\n');
  }).not.toThrow();
  expect(readStart(stat(101), 101)).toBe('100');
  expect(() => {
    assertRoster(roster(), 101);
  }).not.toThrow();
});
for (const [label, contents] of [
  ['depth', status(101, '101')],
  ['nested-depth', status(101, '101\t1\t9')],
  ['root', status(101, '999\t1')],
  ['zero-inner', status(101, '101\t0')],
  ['tgid', status(999, '101\t1')],
  ['missing-uid', status(101, '101\t1').replace(/^Uid:.*\n/m, '')],
  ['uid-count', status(101, '101\t1').replace('0\t0\t0\t0', '0\t0\t0')],
  ['uid-syntax', status(101, '101\t1').replace('0\t0\t0\t0', '0\tx\t0\t0')],
  ['uid-range', status(101, '101\t1').replace('0\t0\t0\t0', '0\t4294967296\t0\t0')],
  ['duplicate', status(101, '101\t1') + 'NSpid:\t101\t1\n'],
] as const)
  test(`host refuses ${label}`, () => {
    expect(() => decodeHostStatus(101, contents)).toThrow();
  });
for (const [label, values] of [
  ['uid-map', ['0 1000 4294967295', '0 0 4294967295']],
  ['gid-map', ['0 0 4294967295', '0 1000 4294967295']],
] as const)
  test(`host refuses ${label}`, () => {
    expect(() => {
      assertHostMappings(values[0], values[1]);
    }).toThrow();
  });
for (const prefix of ['Uid:', 'NSpid:', 'Tgid:'])
  test(`host readback refuses changed ${prefix}`, () => {
    const first = status(101, '101\t1');
    const last = first
      .split('\n')
      .map((line) => (line.startsWith(prefix) ? `${prefix}\t999` : line))
      .join('\n');
    expect(() => {
      assertHostStatusReadback(first, first);
    }).not.toThrow();
    expect(() => {
      assertHostStatusReadback(first, last);
    }).toThrow();
  });
for (const [label, mutate] of [
  [
    'root',
    (members: ReturnType<typeof roster>) => {
      members[0].namespacePid = 4;
    },
  ],
  [
    'duplicate-host',
    (members: ReturnType<typeof roster>) => {
      members[1].pid = 101;
    },
  ],
  [
    'duplicate-inner',
    (members: ReturnType<typeof roster>) => {
      members[1].namespacePid = 1;
    },
  ],
  [
    'parent',
    (members: ReturnType<typeof roster>) => {
      members[1].parent = 999;
    },
  ],
] as const)
  test(`roster refuses ${label}`, () => {
    const members = roster();
    mutate(members);
    expect(() => {
      assertRoster(members, 101);
    }).toThrow();
  });

test('inner accepts supported application and wrapper', () => {
  expect(profile().application.pid).toBe(2);
  const receipt = frames();
  for (const label of ['before', 'after']) {
    const beginning = receipt.findIndex((frame) => frame[0] === 'PASS' && frame[1] === label);
    const application = proc(3);
    application[4] = Buffer.from('bun\0src/main.ts\0').toString('base64');
    receipt.splice(beginning + 3, 0, application);
    receipt[beginning + 4][1] = '3';
  }
  const members = roster();
  members.push({ ...members[1], pid: 103, parent: 102, namespacePid: 3 });
  expect(profile(receipt, members).application.pid).toBe(3);
});
for (const [label, mutate] of [
  [
    'omitted',
    (receipt: string[][]) => {
      receipt.splice(2, 2);
    },
  ],
  [
    'extra',
    (receipt: string[][]) => {
      receipt.splice(2, 0, proc(3));
    },
  ],
  [
    'duplicate',
    (receipt: string[][]) => {
      receipt[2] = proc(1);
      receipt[3][1] = '1';
    },
  ],
  [
    'unmapped',
    (receipt: string[][]) => {
      receipt[2] = proc(3);
      receipt[3][1] = '3';
    },
  ],
  [
    'start',
    (receipt: string[][]) => {
      receipt[2][2] = stat(2, '101');
    },
  ],
  [
    'uid-tuple',
    (receipt: string[][]) => {
      receipt[2][3] = status(2, '2').replace('0\t0\t0\t0', '1\t0\t0\t0');
    },
  ],
  [
    'uid-effective',
    (receipt: string[][]) => {
      receipt[2][3] = status(2, '2').replace('0\t0\t0\t0', '0\t1\t0\t0');
    },
  ],
  [
    'pidns',
    (receipt: string[][]) => {
      receipt[2][9] = 'pid:[9]';
    },
  ],
  [
    'netns',
    (receipt: string[][]) => {
      receipt[2][10] = 'net:[9]';
    },
  ],
  [
    'mntns',
    (receipt: string[][]) => {
      receipt[2][11] = 'mnt:[9]';
    },
  ],
  [
    'helper',
    (receipt: string[][]) => {
      receipt[2][6] = '/bin/helper';
    },
  ],
  [
    'cwd',
    (receipt: string[][]) => {
      receipt[2][5] = '/changed';
    },
  ],
  [
    'init-argv',
    (receipt: string[][]) => {
      receipt[1][4] = Buffer.from('/sbin/docker-init\0--\0helper\0').toString('base64');
    },
  ],
  [
    'inner-status',
    (receipt: string[][]) => {
      receipt[2][3] = status(2, '102\t2');
    },
  ],
  [
    'inner-uid-range',
    (receipt: string[][]) => {
      receipt[2][3] = status(2, '2').replace('0\t0\t0\t0', '0\t4294967296\t0\t0');
    },
  ],
  [
    'bad-base64',
    (receipt: string[][]) => {
      receipt[2][4] = '!';
    },
  ],
  [
    'argv-absent',
    (receipt: string[][]) => {
      receipt[2][4] = Buffer.from('bun').toString('base64');
    },
  ],
  [
    'executable',
    (receipt: string[][]) => {
      receipt[2][7] = `2049:2:134217729|${stamp}|${stamp}`;
    },
  ],
  [
    'namespace-syntax',
    (receipt: string[][]) => {
      receipt[2][11] = 'mnt:[]';
    },
  ],
] as const)
  test(`inner refuses ${label}`, () => {
    const receipt = frames();
    mutate(receipt);
    expect(() => {
      if (label === 'namespace-syntax') decodeInnerProcess(receipt[2].slice(1), {});
      else if (['inner-status', 'inner-uid-range', 'executable'].includes(label))
        decodePasses(receipt, roster());
      else profile(receipt);
    }).toThrow();
  });
for (const [label, mutate] of [
  [
    'host-cgroup',
    (members: ReturnType<typeof roster>) => {
      members[1].cgroup = '/foreign';
    },
  ],
  [
    'host-root-uid',
    (members: ReturnType<typeof roster>) => {
      members[1].uids = [1, 0, 0, 0];
    },
  ],
] as const)
  test(`inner refuses ${label}`, () => {
    const members = roster();
    mutate(members);
    expect(() => profile(frames(), members)).toThrow();
  });
for (const [label, mutate] of [
  [
    'no-fd',
    (receipt: string[][]) => {
      receipt[3][3] = 'socket:[999]';
    },
  ],
  [
    'init-owner',
    (receipt: string[][]) => {
      receipt.splice(2, 0, ['FD', '1', '3', 'socket:[123]']);
      receipt.splice(4, 1);
    },
  ],
  [
    'duplicate-fd',
    (receipt: string[][]) => {
      receipt.splice(4, 0, ['FD', '2', '4', 'socket:[123]']);
    },
  ],
  [
    'shared-owner',
    (receipt: string[][]) => {
      receipt.splice(2, 0, ['FD', '1', '3', 'socket:[123]']);
    },
  ],
  [
    'foreign-listener',
    (receipt: string[][]) => {
      receipt[5][2] += tcp('0100007F', '0C1C', '999').split('\n')[1] + '\n';
    },
  ],
  [
    'competing-listener',
    (receipt: string[][]) => {
      receipt[5][2] += tcp('0100007F', '0C1C', '123').split('\n')[1] + '\n';
    },
  ],
  [
    'wrong-port',
    (receipt: string[][]) => {
      receipt[5][2] = tcp('0100007F', '0C80');
    },
  ],
  [
    'nonlocal',
    (receipt: string[][]) => {
      receipt[5][2] = tcp('0200007F');
    },
  ],
  [
    'missing-family',
    (receipt: string[][]) => {
      receipt[5][2] = tcp('00000000');
      receipt[7][1] = '1: lo inet6 ::1/128 scope host lo\n';
    },
  ],
  [
    'address-alias',
    (receipt: string[][]) => {
      receipt[7][1] = '1: lo inet localhost/8 scope host lo\n';
    },
  ],
  [
    'address-scope',
    (receipt: string[][]) => {
      receipt[7][1] = '1: lo inet6 fe80::1%lo/64 scope link lo\n';
    },
  ],
  [
    'address-mapped',
    (receipt: string[][]) => {
      receipt[7][1] = '1: lo inet6 ::ffff:127.0.0.1/128 scope host lo\n';
    },
  ],
  [
    'address-noncanonical',
    (receipt: string[][]) => {
      receipt[7][1] = '1: lo inet6 0:0:0:0:0:0:0:1/128 scope host lo\n';
      receipt[5][2] = header;
      receipt[6][2] = tcp('00000000000000000000000001000000');
    },
  ],
] as const)
  test(`listener refuses ${label}`, () => {
    const receipt = frames();
    mutate(receipt);
    expect(() => profile(receipt)).toThrow();
  });
for (const [label, address, family, local, want] of [
  ['ipv4', '0100007F', '4', 'inet 127.0.0.1/8', '127.0.0.1'],
  ['ipv4-wildcard', '00000000', '4', 'inet 127.0.0.1/8', '0.0.0.0'],
  ['ipv6', '00000000000000000000000001000000', '6', 'inet6 ::1/128', '::1'],
  ['ipv6-wildcard', '00000000000000000000000000000000', '6', 'inet6 ::1/128', '::'],
] as const)
  test(`listener accepts ${label}`, () => {
    const receipt = frames();
    receipt[5][2] = family === '4' ? tcp(address) : header;
    receipt[6][2] = family === '6' ? tcp(address) : header;
    receipt[7][1] = `1: lo ${local} scope host lo\n`;
    expect(profile(receipt).owned[0]?.address).toBe(want);
  });

test('receipt hash binds every NUL-framed token with identical session and frame count', () => {
  const receipt = frames();
  expect(profile(receipt).application.pid).toBe(2);
  const tokens = [
    'SESSION',
    'nonce',
    '70001',
    '70001',
    '70001',
    '80001',
    ...receipt.flat(),
    'DONE',
    'nonce',
    '2',
  ];
  const hash = createHash('sha256');
  for (const token of tokens) updateReceiptHash(hash, token);
  const expected = createHash('sha256')
    .update(Buffer.from(tokens.join('\0') + '\0'))
    .digest('hex');
  expect(hash.digest('hex')).toBe(expected);
  const changedReceipt = frames();
  for (const frame of changedReceipt)
    if (frame[0] === 'PROC' && frame[1] === '2') frame[7] = `2049:999:32|${stamp}|${stamp}`;
  expect(profile(changedReceipt).application.executable.inode).toBe('999');
  const changed = [
    'SESSION',
    'nonce',
    '70001',
    '70001',
    '70001',
    '80001',
    ...changedReceipt.flat(),
    'DONE',
    'nonce',
    '2',
  ];
  expect(changed.length).toBe(tokens.length);
  const second = createHash('sha256');
  for (const token of changed) updateReceiptHash(second, token);
  expect(second.digest('hex')).not.toBe(expected);
});

test('raw reader distinguishes missing and unreadable required state and enforces byte bound', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'product-proc-proof-'));
  try {
    await rejects(readProductHostProc(join(directory, 'absent'), 100, performance.now() + 1000), {
      code: 'ENOENT',
    });
    await rejects(readProductHostProc(directory, 100, performance.now() + 1000), {
      code: 'EISDIR',
    });
    const path = join(directory, 'status');
    await writeFile(path, status(101, '101\t1'));
    expect(await readProductHostProc(path, 65536, performance.now() + 1000)).toContain('NSpid:');
    await rejects(readProductHostProc(path, 8, performance.now() + 1000), /bound exceeded/);
    await writeFile(path, Buffer.from([0xff]));
    await rejects(readProductHostProc(path, 100, performance.now() + 1000));
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('host refuses malformed cgroup and changed cgroup readback', () => {
  expect(() => decodeHostCgroup('1:cpu:/owned')).toThrow('cgroup unsupported');
  expect(() => {
    assertHostCgroupReadback('0::/owned', '0::/owned\n');
  }).not.toThrow();
  expect(() => {
    assertHostCgroupReadback('0::/owned', '0::/foreign');
  }).toThrow('cgroup readback');
});
for (const final of [false, true])
  test(`host start readback refuses drift final=${String(final)}`, () => {
    expect(() => {
      assertHostStartReadback('100', stat(101), 101, final);
    }).not.toThrow();
    expect(() => {
      assertHostStartReadback('100', stat(101, '101'), 101, final);
    }).toThrow('PID readback');
  });
for (const [label, contents] of [
  ['missing', ''],
  ['pid', stat(999)],
  ['state', stat(101).replace(') S ', ') Z ')],
  ['zero-start', stat(101, '0')],
] as const)
  test(`host stat refuses ${label}`, () => {
    expect(() => readStart(contents, 101)).toThrow('stat malformed');
  });

test('inner refuses uniformly joined nonroot UID and unsupported wrapper', () => {
  const members = roster();
  members[1].uids = [1, 0, 0, 0];
  const receipt = frames();
  for (const frame of receipt)
    if (frame[0] === 'PROC' && frame[1] === '2')
      frame[3] = status(2, '2').replace('0\t0\t0\t0', '1\t0\t0\t0');
  expect(() => profile(receipt, members)).toThrow('host/inner process join');
  const wrapped = frames();
  for (const label of ['before', 'after']) {
    const beginning = wrapped.findIndex((frame) => frame[0] === 'PASS' && frame[1] === label);
    const helper = proc(3);
    helper[6] = '/bin/helper';
    wrapped.splice(beginning + 4, 0, helper);
  }
  const three = roster();
  three.push({ ...three[1], pid: 103, parent: 102, namespacePid: 3 });
  expect(() => profile(wrapped, three)).toThrow('wrapper profile');
});

test('inner effective UID join refuses independently of the tuple join', () => {
  const members = roster();
  members[1].uid = 1;
  expect(() => profile(frames(), members)).toThrow('host/inner process join');
});
test('listener refuses shared inode across distinct address families', () => {
  const receipt = frames();
  receipt[6][2] = tcp('00000000000000000000000001000000');
  receipt[7][1] += '1: lo inet6 ::1/128 scope host lo\n';
  expect(() => profile(receipt)).toThrow('inode ambiguous');
});
test('listener refuses two independently owned sockets in the same family', () => {
  const receipt = frames();
  receipt[5][2] += tcp('0100007F', '0C1C', '124').split('\n')[1] + '\n';
  receipt.splice(4, 0, ['FD', '2', '4', 'socket:[124]']);
  expect(() => profile(receipt)).toThrow('listener set unsupported');
});

test('inner decoder refuses oversized and missing required proc fields', () => {
  const healthy = proc(2).slice(1);
  expect(decodeInnerProcess(healthy, {}).pid).toBe(2);
  expect(() => decodeInnerProcess(healthy.slice(1), {})).toThrow('receipt malformed');
  const oversized = [...healthy];
  oversized[2] = 'X'.repeat(65537);
  expect(() => decodeInnerProcess(oversized, {})).toThrow('bound exceeded');
  const binary = [...healthy];
  binary[3] = Buffer.alloc(1024 * 1024 + 1).toString('base64');
  expect(() => decodeInnerProcess(binary, {})).toThrow('binary receipt');
});

test('listener refuses a wrapper-owned socket with the actual direct application present', () => {
  const receipt = frames();
  for (const label of ['before', 'after']) {
    const beginning = receipt.findIndex((frame) => frame[0] === 'PASS' && frame[1] === label);
    const application = proc(3);
    application[4] = Buffer.from('bun\0src/main.ts\0').toString('base64');
    receipt.splice(beginning + 4, 0, application);
  }
  const members = roster();
  members.push({ ...members[1], pid: 103, parent: 102, namespacePid: 3 });
  expect(() => profile(receipt, members)).toThrow('wrapper profile');
});
test('listener refuses IPv6 wildcard without a local IPv6 address', () => {
  const receipt = frames();
  receipt[5][2] = header;
  receipt[6][2] = tcp('00000000000000000000000000000000');
  expect(() => profile(receipt)).toThrow('no local family address');
});
