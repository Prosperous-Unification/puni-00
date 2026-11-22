import { expect, it } from 'bun:test';

import {
  buildRegistryStatusSshArguments,
  parseRegistryStatusEnrollment,
  renderRegistryStatusPin,
} from './registry-pressure-source-contract';

const wire = Buffer.alloc(51);
wire.writeUInt32BE(11, 0);
wire.write('ssh-ed25519', 4, 'ascii');
wire.writeUInt32BE(32, 15);
wire.fill(7, 19);
const key = encodeKey(wire);
const invalidEnrollment = /^invalid registry status enrollment$/;
const invalidPinPath = /^invalid registry status pin path$/;

function encodeKey(bytes: Buffer): string {
  return 'ssh-ed25519 ' + bytes.toString('base64');
}

function enrollment() {
  return {
    schemaVersion: 1 as const,
    protocol: 'registry-pressure-status/1' as const,
    target: {
      machineId: 'a'.repeat(32),
      registryId: 'platform',
      storageId: 'images',
      registryPath: '/srv/registry',
    },
    peer: { address: '10.1.0.4', port: 22, user: 'puni-registry-status', hostKey: key },
    identity: {
      path: '/run/credentials/registry-status/key',
      sha256: 'b'.repeat(64),
      publicKey: key,
    },
  };
}

function changeWire(offset: number, byte: number): string {
  const bytes = Buffer.from(wire);
  bytes.writeUInt8(byte, offset);
  return encodeKey(bytes);
}

function expectPathRejected(path: string): void {
  const input = enrollment();
  expect(() =>
    parseRegistryStatusEnrollment({ ...input, target: { ...input.target, registryPath: path } }),
  ).toThrow(invalidEnrollment);
  expect(() =>
    parseRegistryStatusEnrollment({ ...input, identity: { ...input.identity, path } }),
  ).toThrow(invalidEnrollment);
  const admitted = parseRegistryStatusEnrollment(input);
  expect(() => buildRegistryStatusSshArguments(admitted, path)).toThrow(invalidPinPath);
}

it('copies enrollment before freezing so caller mutation cannot change the binding', () => {
  const input = enrollment();
  const admitted = parseRegistryStatusEnrollment(input);
  expect(admitted).not.toBe(input);
  expect(admitted.target).not.toBe(input.target);
  expect(admitted.peer).not.toBe(input.peer);
  expect(admitted.identity).not.toBe(input.identity);
  input.target.registryId = 'other';
  input.peer.address = '10.1.0.99';
  input.identity.path = '/other';
  expect(admitted).toEqual(enrollment());
});

it('freezes the enrollment and every nested object', () => {
  const admitted = parseRegistryStatusEnrollment(enrollment());
  expect(Object.isFrozen(admitted)).toBe(true);
  expect(Object.isFrozen(admitted.target)).toBe(true);
  expect(Object.isFrozen(admitted.peer)).toBe(true);
  expect(Object.isFrozen(admitted.identity)).toBe(true);
});

it('renders only the enrolled raw host key under the fixed alias', () => {
  const input = enrollment();
  input.peer.port = 2222;
  input.identity.publicKey = changeWire(50, 2);
  expect(renderRegistryStatusPin(parseRegistryStatusEnrollment(input))).toBe(
    'puni-registry-pressure-source ' + key + '\n',
  );
});

it('emits exactly the restricted argv and fixed SSH command', () => {
  const input = enrollment();
  input.peer.port = 2222;
  const admitted = parseRegistryStatusEnrollment(input);
  expect(buildRegistryStatusSshArguments(admitted, '/run/registry-status/known_hosts')).toEqual([
    '/usr/bin/ssh',
    '-F',
    '/dev/null',
    '-T',
    '-n',
    '-o',
    'BatchMode=yes',
    '-o',
    'IdentitiesOnly=yes',
    '-o',
    'IdentityAgent=none',
    '-o',
    'AddKeysToAgent=no',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'UserKnownHostsFile=/run/registry-status/known_hosts',
    '-o',
    'GlobalKnownHostsFile=/dev/null',
    '-o',
    'HostKeyAlias=puni-registry-pressure-source',
    '-o',
    'CheckHostIP=no',
    '-o',
    'VerifyHostKeyDNS=no',
    '-o',
    'UpdateHostKeys=no',
    '-o',
    'HostKeyAlgorithms=ssh-ed25519',
    '-o',
    'PubkeyAcceptedAlgorithms=ssh-ed25519',
    '-o',
    'PreferredAuthentications=publickey',
    '-o',
    'PasswordAuthentication=no',
    '-o',
    'KbdInteractiveAuthentication=no',
    '-o',
    'GSSAPIAuthentication=no',
    '-o',
    'HostbasedAuthentication=no',
    '-o',
    'ProxyCommand=none',
    '-o',
    'ProxyJump=none',
    '-o',
    'CanonicalizeHostname=no',
    '-o',
    'ControlMaster=no',
    '-o',
    'ControlPersist=no',
    '-o',
    'ControlPath=none',
    '-o',
    'ForwardAgent=no',
    '-o',
    'ClearAllForwardings=yes',
    '-o',
    'PermitLocalCommand=no',
    '-o',
    'KnownHostsCommand=none',
    '-o',
    'NumberOfPasswordPrompts=0',
    '-o',
    'ConnectionAttempts=1',
    '-o',
    'ConnectTimeout=3',
    '-i',
    '/run/credentials/registry-status/key',
    '-p',
    '2222',
    '--',
    'puni-registry-status@10.1.0.4',
    'registry-pressure-status-v1',
  ]);
});

const input = enrollment();
it.each([
  ['top-level', { ...input, command: 'other' }],
  ['target', { ...input, target: { ...input.target, other: true } }],
  ['peer', { ...input, peer: { ...input.peer, options: '-F other' } }],
  ['identity', { ...input, identity: { ...input.identity, other: true } }],
  ['symbol', { ...input, [Symbol('extra')]: true }],
])('rejects an unknown %s enrollment field', (_field, enrollment) => {
  expect(() => parseRegistryStatusEnrollment(enrollment)).toThrow(invalidEnrollment);
});

it('admits an exact enrollment decoded from JSON', () => {
  const decoded: unknown = JSON.parse(JSON.stringify(input));
  expect(parseRegistryStatusEnrollment(decoded)).toEqual(input);
});

const sections = ['enrollment', 'target', 'peer', 'identity'] as const;
const prototypeFields = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'];
it.each(sections.flatMap((section) => prototypeFields.map((field) => [section, field] as const)))(
  'rejects an unknown own JSON field at %s named %s',
  (section, field) => {
    const tagged =
      section === 'enrollment'
        ? { ...input, [field]: {} }
        : { ...input, [section]: { ...input[section], [field]: {} } };
    const decoded: unknown = JSON.parse(JSON.stringify(tagged));
    expect(() => parseRegistryStatusEnrollment(decoded)).toThrow(invalidEnrollment);
  },
);

it.each([
  ['absent enrollment', undefined],
  ['array enrollment', []],
  ['absent target', { ...input, target: undefined }],
  ['non-object peer', { ...input, peer: true }],
  ['absent credential path', { ...input, identity: { ...input.identity, path: undefined } }],
  ['wrong machine ID type', { ...input, target: { ...input.target, machineId: 123 } }],
  ['wrong port type', { ...input, peer: { ...input.peer, port: '22' } }],
])('rejects %s with a fixed diagnostic', (_case, enrollment) => {
  expect(() => parseRegistryStatusEnrollment(enrollment)).toThrow(invalidEnrollment);
});

it.each([
  ['schema version', { ...input, schemaVersion: 2 }],
  ['protocol version', { ...input, protocol: 'registry-pressure-status/2' }],
])('rejects the wrong %s', (_field, enrollment) => {
  expect(() => parseRegistryStatusEnrollment(enrollment)).toThrow(invalidEnrollment);
});

it.each([
  ['empty', ''],
  ['overlong ASCII', 'x'.repeat(257)],
  ['overlong astral', '😀'.repeat(257)],
  ['overlong UTF-16', '😀'.repeat(257) + 'x'],
  ['NUL', 'a\0b'],
  ['newline', 'a\nb'],
  ['DEL', 'a\x7fb'],
  ['C1 control', 'a\u0085b'],
])('rejects %s registry and storage identities', (_case, identity) => {
  expect(() =>
    parseRegistryStatusEnrollment({ ...input, target: { ...input.target, registryId: identity } }),
  ).toThrow(invalidEnrollment);
  expect(() =>
    parseRegistryStatusEnrollment({ ...input, target: { ...input.target, storageId: identity } }),
  ).toThrow(invalidEnrollment);
});

it('admits one code point and 256 astral code points as registry or storage identities', () => {
  const target = { ...input.target, registryId: '界', storageId: '😀'.repeat(256) };
  expect(parseRegistryStatusEnrollment({ ...input, target }).target).toEqual(target);
});

it.each(['a'.repeat(31), 'a'.repeat(33), 'A'.repeat(32), 'g'.repeat(32), 'a'.repeat(32) + '\n'])(
  'rejects malformed machine ID %j',
  (machineId) => {
    expect(() =>
      parseRegistryStatusEnrollment({ ...input, target: { ...input.target, machineId } }),
    ).toThrow(invalidEnrollment);
  },
);

it.each(['a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64), 'a'.repeat(64) + '\n'])(
  'rejects malformed credential digest %j',
  (sha256) => {
    expect(() =>
      parseRegistryStatusEnrollment({ ...input, identity: { ...input.identity, sha256 } }),
    ).toThrow(invalidEnrollment);
  },
);

it.each([
  'root',
  '',
  'Root',
  '-option',
  '9registry',
  'status@other',
  'status host',
  'status\n',
  'status.example',
  'x'.repeat(33),
])('rejects disallowed principal %j', (user) => {
  expect(() => parseRegistryStatusEnrollment({ ...input, peer: { ...input.peer, user } })).toThrow(
    invalidEnrollment,
  );
});

it.each(['_', 'r' + 'a'.repeat(28) + '1-_'])('admits canonical principal %j', (user) => {
  expect(parseRegistryStatusEnrollment({ ...input, peer: { ...input.peer, user } }).peer.user).toBe(
    user,
  );
});

it.each([
  '0.0.0.0',
  '9.255.255.255',
  '11.0.0.0',
  '100.64.0.1',
  '127.0.0.1',
  '169.254.1.1',
  '172.15.255.255',
  '172.32.0.0',
  '192.167.255.255',
  '192.169.0.0',
  '203.0.113.4',
  '224.0.0.1',
  '240.0.0.1',
  '255.255.255.255',
  '::1',
  '::ffff:10.1.0.4',
  'registry.example',
  '010.1.0.4',
  '10.01.0.4',
  '10.1.0.04',
  '10.256.0.4',
  '10.1.0.-4',
  '10.1.0.+4',
  '10.1.0.4\n',
  '10.1.0.4 ',
  '10.1.0',
  '10.1..4',
  '10.1.0.4.5',
  '10.0000.0.4',
  '10.' + '1'.repeat(40) + '.0.4',
])('rejects noncanonical or nonprivate address %j', (address) => {
  expect(() =>
    parseRegistryStatusEnrollment({ ...input, peer: { ...input.peer, address } }),
  ).toThrow(invalidEnrollment);
});

it.each([
  '10.0.0.0',
  '10.255.255.255',
  '172.16.0.0',
  '172.31.255.255',
  '192.168.0.0',
  '192.168.255.255',
])('admits private address boundary %j', (address) => {
  expect(
    parseRegistryStatusEnrollment({ ...input, peer: { ...input.peer, address } }).peer.address,
  ).toBe(address);
});

it.each([0, 65536, 1.5, NaN, Infinity])('rejects invalid port %j', (port) => {
  expect(() => parseRegistryStatusEnrollment({ ...input, peer: { ...input.peer, port } })).toThrow(
    invalidEnrollment,
  );
});

it.each([1, 65535])('admits port boundary %d', (port) => {
  const admitted = parseRegistryStatusEnrollment({ ...input, peer: { ...input.peer, port } });
  expect(admitted.peer.port).toBe(port);
  expect(buildRegistryStatusSshArguments(admitted, '/pin').slice(-5, -3)).toEqual([
    '-p',
    String(port),
  ]);
});

it.each([
  ['wrong text algorithm', key.replace('ssh-ed25519', 'ssh-ed25518')],
  ['wrong SSH algorithm length', changeWire(3, 10)],
  ['wrong SSH algorithm name', changeWire(4, 0x72)],
  ['high-bit SSH algorithm byte', changeWire(4, 0xf3)],
  ['wrong SSH payload length', changeWire(18, 31)],
  ['short SSH wire', encodeKey(wire.subarray(0, 50))],
  ['extra SSH wire byte', encodeKey(Buffer.concat([wire, Buffer.from([7])]))],
  ['padding', key + '='],
  ['base64 alphabet', key.slice(0, -1) + '-'],
  ['comment', key + ' example'],
  ['newline', key + '\n'],
])('rejects %s for both enrolled public keys', (_case, publicKey) => {
  expect(() =>
    parseRegistryStatusEnrollment({ ...input, peer: { ...input.peer, hostKey: publicKey } }),
  ).toThrow(invalidEnrollment);
  expect(() =>
    parseRegistryStatusEnrollment({ ...input, identity: { ...input.identity, publicKey } }),
  ).toThrow(invalidEnrollment);
});

it.each([
  ['empty', ''],
  ['relative', 'run/key'],
  ['root', '/'],
  ['empty segment', '/run//key'],
  ['trailing segment', '/run/key/'],
  ['current directory segment', '/run/./key'],
  ['parent directory segment', '/run/../key'],
  ['overlong', '/' + 'a'.repeat(256)],
  ['non-ASCII', '/run/clé'],
  ['whitespace', '/run/key name'],
  ['newline', '/run/key\n'],
  ['NUL', '/run/k\0ey'],
  ['OpenSSH expansion', '/run/%h'],
  ['OpenSSH environment expansion', '/run/$' + '{HOME}'],
])('rejects %s paths for registry, identity, and pin', (_case, path) => {
  expectPathRejected(path);
});

it('admits canonical ASCII paths of up to 256 bytes for registry, identity, and pin', () => {
  const registryPath = '/srv/.registry-00/images_v1';
  const path = '/' + 'a'.repeat(255);
  const admitted = parseRegistryStatusEnrollment({
    ...input,
    target: { ...input.target, registryPath },
    identity: { ...input.identity, path },
  });
  expect(admitted.target.registryPath).toBe(registryPath);
  expect(admitted.identity.path).toBe(path);
  expect(buildRegistryStatusSshArguments(admitted, path)).toContain('UserKnownHostsFile=' + path);
});
