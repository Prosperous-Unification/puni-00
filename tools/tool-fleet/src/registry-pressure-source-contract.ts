import { type } from 'arktype';

export interface RegistryStatusEnrollment {
  readonly schemaVersion: 1;
  readonly protocol: 'registry-pressure-status/1';
  readonly target: Readonly<{
    machineId: string;
    registryId: string;
    storageId: string;
    registryPath: string;
  }>;
  readonly peer: Readonly<{
    address: string;
    port: number;
    user: string;
    hostKey: string;
  }>;
  readonly identity: Readonly<{
    path: string;
    sha256: string;
    publicKey: string;
  }>;
}

export type RegistryStatusReply =
  | { readonly state: 'received'; readonly bytes: Uint8Array }
  | { readonly state: 'invalid-status'; readonly code: 'status-too-large' }
  | { readonly state: 'unavailable'; readonly reason: 'source-timeout'; readonly code: 'deadline' }
  | { readonly state: 'unavailable'; readonly reason: 'source-refused'; readonly code: 'refused' }
  | {
      readonly state: 'unavailable';
      readonly reason: 'source-command-failed';
      readonly code: 'ssh-exit' | 'stderr-too-large';
    };

const alias = 'puni-registry-pressure-source';
const keyPrefix = 'ssh-ed25519 ';
// Proof: Allowing empty identities, 257 code points or C1 controls broke the matching identity tests.
const Identity = /^[\P{Cc}]{1,256}$/u;

// Proof: Relaxing each rule broke the relative, overlong, empty-segment, percent, dot or dot-dot path test.
const Path = type('string').narrow(
  (path) =>
    path.startsWith('/') &&
    path.length <= 256 &&
    path
      .slice(1)
      .split('/')
      .every((segment) => /^[A-Za-z0-9._-]+$/.test(segment) && segment !== '.' && segment !== '..'),
);

// Proof: Allowing three octets, a nonprivate address, octet 256 or leading zeroes broke the address tests.
const Address = type(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/).narrow(
  (address) =>
    /^(?:10\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(address) &&
    address.split('.').every((octet) => Number(octet) <= 255 && String(Number(octet)) === octet),
);

// Proof: Widening the envelope broke the text algorithm, alphabet and short/extra wire byte tests.
/** Exactly 68 standard-base64 characters without padding encode 51 bytes. */
const PublicKey = type(/^ssh-ed25519 [A-Za-z0-9+/]{68}$/).narrow((key) => {
  const wire = Buffer.from(key.slice(keyPrefix.length), 'base64');
  // Proof: Omitting a length or the algorithm name broke the corresponding wire test.
  // ASCII decoding dropped a high bit and broke the high-bit SSH algorithm byte test.
  return (
    wire.readUInt32BE(0) === 11 &&
    wire.toString('latin1', 4, 15) === 'ssh-ed25519' &&
    wire.readUInt32BE(15) === 32
  );
});

const Enrollment = type({
  // Proof: Admitting another schema or protocol version broke the matching version tests.
  schemaVersion: '1',
  protocol: "'registry-pressure-status/1'",
  target: {
    // Proof: Admitting uppercase, shorter or numeric machine IDs broke the matching tests.
    machineId: /^[a-f0-9]{32}$/,
    registryId: Identity,
    // Proof: Accepting arbitrary strings broke the C1 storage identity and relative registry path tests.
    storageId: Identity,
    registryPath: Path,
  },
  peer: {
    address: Address,
    // Proof: Relaxing the bounds or integrality broke the port 0, 65536 or 1.5 test.
    port: type('number.integer').atLeast(1).atMost(65535),
    // Proof: Relaxing the principal rules broke the root and -option tests.
    user: type(/^[a-z_][a-z0-9_-]{0,31}$/).narrow((user) => user !== 'root'),
    // Proof: Accepting a raw string broke the malformed host key test.
    hostKey: PublicKey,
  },
  identity: {
    // Proof: Accepting raw strings broke the relative identity path and malformed client key tests.
    path: Path,
    // Proof: Admitting uppercase or shorter digests broke the malformed credential digest tests.
    sha256: /^[a-f0-9]{64}$/,
    publicKey: PublicKey,
  },
});

const Keys = {
  enrollment: Enrollment.keyof(),
  target: Enrollment.get('target').keyof(),
  peer: Enrollment.get('peer').keyof(),
  identity: Enrollment.get('identity').keyof(),
};

/** Checks every own key against declared schema keys independently of inherited names. */
function hasOnlyKeys(input: object, keys: { allows(key: PropertyKey): boolean }): boolean {
  // Proof: Allowing inherited names broke all 16 JSON field tests. Enumerating only strings
  // broke the unknown symbol enrollment field test.
  return Reflect.ownKeys(input).every((key) => keys.allows(key));
}

/** Returns an immutable copy of an exact trusted JSON enrollment. Throws on malformed input. */
export function parseRegistryStatusEnrollment(input: unknown): RegistryStatusEnrollment {
  const admitted = Enrollment(input);
  // Proof: Exposing the ArkType diagnostic broke the wrong protocol version test.
  if (admitted instanceof type.errors) throw new Error('invalid registry status enrollment');

  const { schemaVersion, protocol, target, peer, identity } = admitted;
  // Proof: Omitting any one guard broke its JSON and ordinary unknown-field tests.
  if (
    !hasOnlyKeys(admitted, Keys.enrollment) ||
    !hasOnlyKeys(target, Keys.target) ||
    !hasOnlyKeys(peer, Keys.peer) ||
    !hasOnlyKeys(identity, Keys.identity)
  ) {
    // Proof: Including field names in the diagnostic broke the enrollment __proto__ test.
    throw new Error('invalid registry status enrollment');
  }
  // Proof: Reusing any nested input or omitting any freeze broke the copy or freeze test.
  return Object.freeze({
    schemaVersion,
    protocol,
    target: Object.freeze({
      machineId: target.machineId,
      registryId: target.registryId,
      storageId: target.storageId,
      registryPath: target.registryPath,
    }),
    peer: Object.freeze({
      address: peer.address,
      port: peer.port,
      user: peer.user,
      hostKey: peer.hostKey,
    }),
    identity: Object.freeze({
      path: identity.path,
      sha256: identity.sha256,
      publicKey: identity.publicKey,
    }),
  });
}

/** Renders the one known-hosts line for the admitted host key at any enrolled port. */
export function renderRegistryStatusPin(enrollment: RegistryStatusEnrollment): string {
  // Proof: Changing the alias or key, or omitting the newline, broke the fixed pin-line test.
  return `${alias} ${enrollment.peer.hostKey}\n`;
}

/** Builds the fixed status command from an admitted enrollment and throws on an invalid pin path. */
export function buildRegistryStatusSshArguments(
  enrollment: RegistryStatusEnrollment,
  pinPath: string,
): readonly string[] {
  // Proof: Removing this guard broke the OpenSSH expansion path test at the pin assertion.
  if (!Path.allows(pinPath)) throw new Error('invalid registry status pin path');

  // Proof: Independently removing each of the 31 options broke the exact restricted argv test.
  const options = [
    'BatchMode=yes',
    'IdentitiesOnly=yes',
    'IdentityAgent=none',
    'AddKeysToAgent=no',
    'StrictHostKeyChecking=yes',
    `UserKnownHostsFile=${pinPath}`,
    'GlobalKnownHostsFile=/dev/null',
    `HostKeyAlias=${alias}`,
    'CheckHostIP=no',
    'VerifyHostKeyDNS=no',
    'UpdateHostKeys=no',
    'HostKeyAlgorithms=ssh-ed25519',
    'PubkeyAcceptedAlgorithms=ssh-ed25519',
    'PreferredAuthentications=publickey',
    'PasswordAuthentication=no',
    'KbdInteractiveAuthentication=no',
    'GSSAPIAuthentication=no',
    'HostbasedAuthentication=no',
    'ProxyCommand=none',
    'ProxyJump=none',
    'CanonicalizeHostname=no',
    'ControlMaster=no',
    'ControlPersist=no',
    'ControlPath=none',
    'ForwardAgent=no',
    'ClearAllForwardings=yes',
    'PermitLocalCommand=no',
    'KnownHostsCommand=none',
    'NumberOfPasswordPrompts=0',
    'ConnectionAttempts=1',
    'ConnectTimeout=3',
  ];

  // Proof: Substituting the executable, target or verb, or dropping any fixed argv group,
  // broke the exact restricted argv test.
  return [
    '/usr/bin/ssh',
    '-F',
    '/dev/null',
    '-T',
    '-n',
    ...options.flatMap((option) => ['-o', option]),
    '-i',
    enrollment.identity.path,
    '-p',
    String(enrollment.peer.port),
    '--',
    `${enrollment.peer.user}@${enrollment.peer.address}`,
    'registry-pressure-status-v1',
  ];
}
