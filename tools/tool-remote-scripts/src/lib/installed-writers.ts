import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';

/** Fixed inventory slots; authority slots contain captured configuration bytes, never authority to act. */
export const WRITER_MEMBERS = [
  'prod-swap',
  'prod-smoke',
  'dev-swap',
  'dev-smoke',
  'dev-poller',
  'dev-loader',
  'dev-interpreter',
  'declared-manual-launcher',
  'declared-bootstrap',
  'declared-configure',
  'shared-launch-authority',
  'shared-restart-authority',
] as const;
interface WriterMember {
  member: string;
  origin: 'source' | 'build';
  hostPath: string;
  reviewed: string;
  installed: string;
  sha256: string;
}
interface WriterManifest {
  version: 1;
  sourceSha: string;
  buildSha: string;
  buildId: string;
  members: WriterMember[];
}

function requireEvidence(predicate: boolean, message: string): asserts predicate {
  if (!predicate) throw new Error(message);
}
function recordOf(value: unknown): Record<string, unknown> {
  requireEvidence(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'expected record',
  );
  // JSON objects enter only through this checked structural boundary.
  return value as Record<string, unknown>;
}
function requireFields(record: Record<string, unknown>, fields: string[]): void {
  requireEvidence(
    Object.keys(record).sort().join(',') === fields.sort().join(','),
    'unexpected manifest fields',
  );
}
function textOf(value: unknown): string {
  requireEvidence(typeof value === 'string' && value.length > 0, 'required string');
  return value;
}
function parseManifest(value: unknown): WriterManifest {
  const manifest = recordOf(value);
  // Proof: injected activation field fails `refuses malformed manifest and accidental activation authority`.
  requireFields(manifest, ['version', 'sourceSha', 'buildSha', 'buildId', 'members']);
  const sourceSha = textOf(manifest['sourceSha']);
  const buildSha = textOf(manifest['buildSha']);
  const buildId = textOf(manifest['buildId']);
  // Proof: removing identity admission failed the malformed-source and real CLI scope faults.
  requireEvidence(
    manifest['version'] === 1 &&
      /^[a-f0-9]{40}$/.test(sourceSha) &&
      /^[a-f0-9]{40}$/.test(buildSha) &&
      /^[\w.-]{1,128}$/.test(buildId),
    'invalid manifest identity',
  );
  requireEvidence(Array.isArray(manifest['members']), 'invalid membership');
  const members = manifest['members'].map((value: unknown): WriterMember => {
    const member = recordOf(value);
    requireFields(member, ['member', 'origin', 'hostPath', 'reviewed', 'installed', 'sha256']);
    const sha256 = textOf(member['sha256']);
    // Proof: digest guard removal failed the real CLI invalid-digest boundary.
    requireEvidence(/^[a-f0-9]{64}$/.test(sha256), 'invalid digest');
    const origin = member['origin'];
    // Proof: origin guard removal admitted the CLI invented-provenance fault.
    requireEvidence(origin === 'source' || origin === 'build', 'invalid source/build provenance');
    const hostPath = textOf(member['hostPath']);
    // Proof: location guard removal admitted the CLI relative-host-path fault.
    requireEvidence(isAbsolute(hostPath), 'invalid declared host location');
    return {
      member: textOf(member['member']),
      origin,
      hostPath,
      reviewed: textOf(member['reviewed']),
      installed: textOf(member['installed']),
      sha256,
    };
  });
  // Proof: omitted prod/dev/poller/authority slots fail the omitted-member production-path tests.
  requireEvidence(
    members
      .map((member) => member.member)
      .sort()
      .join(',') === [...WRITER_MEMBERS].sort().join(','),
    'invalid membership',
  );
  // Proof: path guard removal admitted the same-byte reviewed/installed alias in the real CLI.
  requireEvidence(
    new Set(members.flatMap((member) => [member.reviewed, member.installed])).size ===
      members.length * 2 &&
      new Set(members.map((member) => member.hostPath)).size === members.length,
    'aliased membership paths',
  );
  return { version: 1, sourceSha, buildSha, buildId, members };
}
function hashBytes(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Reads required ordinary files; permissions, missing paths and read failures propagate. No executable is invoked. */
export async function readWriterBytes(path: string): Promise<Uint8Array> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await file.stat({ bigint: true });
    requireEvidence(
      before.isFile() && before.size <= 64n * 1024n * 1024n,
      'required observation is not a bounded regular file',
    );
    const bytes = await file.readFile();
    const after = await file.stat({ bigint: true });
    requireEvidence(
      before.ino === after.ino &&
        before.size === after.size &&
        before.mtimeNs === after.mtimeNs &&
        before.ctimeNs === after.ctimeNs,
      'observation changed during read',
    );
    return bytes;
  } finally {
    await file.close();
  }
}

/**
 * Compares a separately reviewed source/build manifest with an offline installed-file capture.
 * Two complete passes detect observed drift, not atomic host quiescence. Unknown host launch,
 * restart and process authority always blocks activation, including perfectly matching bytes.
 * Throws for incomplete, malformed, unreadable, changed or mismatching required evidence.
 */
export async function inspectInstalledWriters(
  root: string,
  value: unknown,
  read: (path: string) => Promise<Uint8Array> = readWriterBytes,
) {
  const manifest = parseManifest(value);
  const canonicalRoot = await realpath(root);
  const identities = new Map<string, string>();
  async function readMember(path: string): Promise<string> {
    // Proof: guard removal admitted traversal resolving to the unchanged captured file in the CLI.
    requireEvidence(
      !isAbsolute(path) &&
        path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
      'invalid relative observation path',
    );
    const resolved = resolve(canonicalRoot, path);
    // Proof: guard removal admitted an identical-byte file through a symlink parent in the CLI.
    requireEvidence(
      resolved.startsWith(`${canonicalRoot}${sep}`) && (await realpath(resolved)) === resolved,
      'observation path escapes root or uses symlink',
    );
    const before = await lstat(resolved, { bigint: true });
    const identity = [
      before.dev,
      before.ino,
      before.size,
      before.mtimeNs,
      before.ctimeNs,
      before.mode,
    ].join(':');
    const bytes = await read(resolved);
    const after = await lstat(resolved, { bigint: true });
    const observed = [
      after.dev,
      after.ino,
      after.size,
      after.mtimeNs,
      after.ctimeNs,
      after.mode,
    ].join(':');
    // Proof: same-byte inode replacement fails the real CLI inode-drift test.
    requireEvidence(
      identity === observed && (!identities.has(resolved) || identities.get(resolved) === identity),
      'observation identity changed',
    );
    identities.set(resolved, identity);
    return hashBytes(bytes);
  }
  const first = [];
  for (const member of manifest.members) {
    const reviewedSha256 = await readMember(member.reviewed);
    const installedSha256 = await readMember(member.installed);
    // Proof: reviewed-byte, installed-byte, interpreter and restart substitutions fail hash mismatch tests.
    requireEvidence(
      reviewedSha256 === member.sha256 && installedSha256 === member.sha256,
      `hash mismatch: ${member.member}`,
    );
    first.push({ ...member, expectedSha256: member.sha256, reviewedSha256, installedSha256 });
  }
  for (const [index, member] of manifest.members.entries()) {
    // Proof: injected second-pass drift fails `refuses changing observations between complete passes`.
    requireEvidence(
      (await readMember(member.reviewed)) === first[index]?.reviewedSha256 &&
        (await readMember(member.installed)) === first[index]?.installedSha256,
      'observation changed between passes',
    );
  }
  return {
    version: 1 as const,
    kind: 'installed-writer-file-inventory' as const,
    // Proof: an allowed-activation mutation failed both library and actual CLI success assertions.
    activation: 'blocked' as const,
    sourceSha: manifest.sourceSha,
    buildSha: manifest.buildSha,
    buildId: manifest.buildId,
    scope: 'local-supplied-capture' as const,
    manifestSha256: hashBytes(JSON.stringify(manifest)),
    members: first,
    unknowns: [
      'Host solver supervisor bundle, config, runtime and systemd unit are unsupported restart surfaces; installer shared-edge admission is unverified',
      'Cron bytes do not prove installed crontab or absence of duplicate timers; unit bytes do not prove loaded units, drop-ins, transient units or MainPID; Compose bytes do not prove Docker configuration/restart policy',
      'Declared manual launcher/bootstrap/configure copies do not establish canonical installed locations',
      'Capture freshness and host attribution are unverified',
      'Effective cron/systemd/Docker/manual launch and restart authority is unverified',
      'Prior and running executors, interpreter selection, process drain and continuous exclusion are unverified',
      'No exclusive-store or complete host-authority claim',
    ],
  };
}
