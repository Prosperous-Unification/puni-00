import { createHash } from 'node:crypto';
import { type BigIntStats, constants } from 'node:fs';
import { type FileHandle, lstat, open, realpath } from 'node:fs/promises';
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
    Object.keys(record).length === fields.length &&
      fields.every((field) => Object.hasOwn(record, field)),
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
  // Proof: deleting exact membership admission failed the real CLI comma-packed omitted-writer fault.
  requireEvidence(
    members.length === WRITER_MEMBERS.length &&
      new Set(members.map((member) => member.member)).size === WRITER_MEMBERS.length &&
      members.every((member) => WRITER_MEMBERS.some((name) => name === member.member)),
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

function identifyFile(file: BigIntStats): string {
  return [file.dev, file.ino, file.size, file.mtimeNs, file.ctimeNs, file.mode].join(':');
}

/**
 * Reads required ordinary files; permissions, missing paths and read failures propagate.
 * When supplied, checkedIdentity binds the descriptor to the caller's earlier containment
 * and alias checks. Standalone manifest reads bind only the local path and descriptor.
 * No executable is invoked.
 */
export async function readWriterBytes(path: string, checkedIdentity?: string): Promise<Uint8Array> {
  const expected = await lstat(path, { bigint: true });
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await file.stat({ bigint: true });
    // Proof: omitting the caller identity admitted the CLI parent swap spanning inner identity checks.
    // Proof: deleting descriptor/path admission admitted the CLI parent swap limited to open.
    requireEvidence(
      identifyFile(expected) === identifyFile(before) &&
        (checkedIdentity === undefined || checkedIdentity === identifyFile(before)),
      'opened observation identity differs',
    );
    // Pinned Bun is 79,500,640 bytes; 128 MiB admits that binary with bounded read headroom.
    // Proof: deleting the size bound admitted matching oversized artifacts in the actual CLI.
    requireEvidence(
      before.isFile() && before.size <= 128n * 1024n * 1024n,
      'required observation is not a bounded regular file',
    );
    const bytes = await file.readFile();
    const after = await file.stat({ bigint: true });
    requireEvidence(
      identifyFile(before) === identifyFile(after) &&
        identifyFile(after) === identifyFile(await lstat(path, { bigint: true })),
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
 * Retains the capture-root descriptor across both passes and resolves every child through
 * retained parent descriptors with nofollow opens. Linux /proc/self/fd is required;
 * missing or inaccessible procfs throws without a pathname fallback.
 * Throws for incomplete, malformed, unreadable, changed or mismatching required evidence.
 */
export async function inspectInstalledWriters(
  root: string,
  value: unknown,
  read: (path: string, checkedIdentity: string) => Promise<Uint8Array> = readWriterBytes,
) {
  const manifest = parseManifest(value);
  const canonicalRoot = await realpath(root);
  const capture = await open(
    canonicalRoot,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const rootStat = await capture.stat({ bigint: true });
    const rootIdentity = `${String(rootStat.dev)}:${String(rootStat.ino)}`;
    const identities = new Map<string, string>();
    const inodePaths = new Map<string, string>();
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
      const parents: FileHandle[] = [];
      try {
        let parent = capture;
        const segments = path.split('/');
        for (const segment of segments.slice(0, -1)) {
          // Linux procfs provides descriptor-relative traversal where Node/Bun expose no openat.
          // Every parent remains open until the read completes; renaming cannot redirect it.
          // Proof: the early parent-swap CLI fault emitted success with pathname traversal or parent O_NOFOLLOW omitted.
          // Proof: pathname fallback admitted the CLI ENOENT/EACCES procfs dependency faults.
          const directory = await open(
            `/proc/self/fd/${String(parent.fd)}/${segment}`,
            constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
          );
          parents.push(directory);
          parent = directory;
        }
        const leaf = path.slice(path.lastIndexOf('/') + 1);
        const anchored = `/proc/self/fd/${String(parent.fd)}/${leaf}`;
        const before = await lstat(anchored, { bigint: true });
        const inode = `${String(before.dev)}:${String(before.ino)}`;
        // Proof: deleting inode alias refusal admitted the actual CLI reviewed/captured hardlink fault.
        requireEvidence(
          !inodePaths.has(inode) || inodePaths.get(inode) === resolved,
          'aliased observation inode',
        );
        inodePaths.set(inode, resolved);
        const identity = identifyFile(before);
        const bytes = await read(anchored, identity);
        const after = await lstat(anchored, { bigint: true });
        const observed = identifyFile(after);
        // Proof: same-byte inode replacement fails the real CLI inode-drift test.
        requireEvidence(
          identity === observed &&
            (!identities.has(resolved) || identities.get(resolved) === identity),
          'observation identity changed',
        );
        identities.set(resolved, identity);
        return hashBytes(bytes);
      } finally {
        for (const parent of parents.reverse()) await parent.close();
      }
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
    const currentRoot = await lstat(canonicalRoot, { bigint: true });
    // Proof: omitting root identity admission made the CLI retained-root replacement emit success.
    requireEvidence(
      rootIdentity === `${String(currentRoot.dev)}:${String(currentRoot.ino)}`,
      'capture root changed during observation',
    );
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
  } finally {
    await capture.close();
  }
}
