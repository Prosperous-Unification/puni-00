import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { join } from 'node:path';

import {
  type MigrationArtifactRow,
  type MigrationFileIdentity,
  migrationScannerProgram,
  scanMigrationArtifact,
} from './dependency-migration-artifact-scanner';
import type { RunDocker } from './docker-deadline';
import { edgeStateDirectory } from './edge-admission';
import {
  assertDependencyOwner,
  assertDependencyOwnerDirectory,
  type DependencyOwner,
  ownerDockerHashed,
} from './edge-ownership';
import type { EnvLayout } from './env';

export interface DependencyMigrationPins {
  version: 1;
  sourceSha: string;
  candidateImage: string;
  candidateImageId: string;
  manifestSha256: string;
}
export interface DependencyMigrationManifest {
  format: 'dependency-migration-artifact';
  version: 1;
  sourceSha: string;
  candidateImage: string;
  candidateImageId: string;
  migrations: readonly MigrationArtifactRow[];
}
const required = [
  '20261022211000_add_external_dependencies',
  '20261022212000_add_cross_project_dependency_activation',
];
const hashContents = (contents: string) => createHash('sha256').update(contents).digest('hex');
function refuseArtifact(): never {
  throw new Error('migration artifact schema or binding differs');
}
// Proof: closed-schema omission made the malformed closed-attribution negative fail (exit 1).
function readFields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  )
    return refuseArtifact();
  // Boundary: object/non-null/array and exact own keys checked above; fields remain unknown.
  return value as Record<string, unknown>;
}
// Proof: pins-attribution omission admitted malformed source/image/ID fields; closed-attribution test failed.
function readText(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) return refuseArtifact();
  return value;
}
/** Closed independent expected attribution; parsing cannot establish historical build provenance. */
export function decodeDependencyMigrationPins(value: unknown): DependencyMigrationPins {
  const fields = readFields(value, [
    'version',
    'sourceSha',
    'candidateImage',
    'candidateImageId',
    'manifestSha256',
  ]);
  if (fields['version'] !== 1) return refuseArtifact();
  return {
    version: 1,
    sourceSha: readText(fields['sourceSha'], /^[a-f0-9]{40}$/),
    candidateImage: readText(
      fields['candidateImage'],
      /^(?:[a-z0-9][a-z0-9._:-]*\/)*wbs-be-01@sha256:[a-f0-9]{64}$/,
    ),
    candidateImageId: readText(fields['candidateImageId'], /^sha256:[a-f0-9]{64}$/),
    manifestSha256: readText(fields['manifestSha256'], /^[a-f0-9]{64}$/),
  };
}
function decodeFile(value: unknown, maximum: number): MigrationFileIdentity {
  const fields = readFields(value, ['size', 'sha256']);
  if (
    typeof fields['size'] !== 'number' ||
    !Number.isSafeInteger(fields['size']) ||
    fields['size'] < 1 ||
    fields['size'] > maximum
  )
    return refuseArtifact();
  return { size: fields['size'], sha256: readText(fields['sha256'], /^[a-f0-9]{64}$/) };
}
/** Shared host/image closed complete identity grammar; preserves exact sorted membership. */
export function decodeMigrationArtifactRows(value: unknown): readonly MigrationArtifactRow[] {
  // Proof: projected-cardinality omission evaluated a row getter at 4097 entries; projected-names boundary test failed.
  if (!Array.isArray(value) || value.length < 1 || value.length > 4096) return refuseArtifact();
  const rows: MigrationArtifactRow[] = [];
  let previous = '';
  let total = 0;
  for (const entry of value) {
    const fields = readFields(entry, ['name', 'migration', 'down', 'snapshot']);
    const name = readText(fields['name'], /^[0-9]{14}_[a-z0-9_]+$/);
    // Proof: independent projected-name-length/stamp/order omissions admitted malformed rows; projected-names test failed.
    if (
      Buffer.byteLength(name) > 160 ||
      name <= previous ||
      name.slice(0, 14) === previous.slice(0, 14)
    )
      return refuseArtifact();
    previous = name;
    const migration = decodeFile(fields['migration'], 8 * 1024 * 1024);
    const down = decodeFile(fields['down'], 8 * 1024 * 1024);
    const snapshot =
      fields['snapshot'] === null ? null : decodeFile(fields['snapshot'], 16 * 1024 * 1024);
    total += migration.size + down.size + (snapshot?.size ?? 0);
    // Proof: projected-total-bound omission admitted nine individually bounded rows; total-projected-bytes test failed.
    if (total > 256 * 1024 * 1024) return refuseArtifact();
    rows.push({ name, migration, down, snapshot });
  }
  // Proof: activation-membership omission admitted a tree missing the activation migration; mandatory-membership test failed.
  if (!required.every((name) => rows.some((row) => row.name === name))) return refuseArtifact();
  return rows;
}
/** Exact canonical bytes reject duplicate keys, unknown fields and alternative encodings. */
export function decodeDependencyMigrationManifest(
  contents: string,
  pins: DependencyMigrationPins,
): DependencyMigrationManifest {
  pins = decodeDependencyMigrationPins(pins);
  // Proof: manifest-byte-bound omission reached JSON.parse on >4MiB input; manifest-digest omission admitted a wrong supplied digest.
  if (
    Buffer.byteLength(contents) > 4 * 1024 * 1024 ||
    hashContents(contents) !== pins.manifestSha256
  )
    return refuseArtifact();
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error('migration artifact manifest JSON is invalid');
  }
  const fields = readFields(parsed, [
    'format',
    'version',
    'sourceSha',
    'candidateImage',
    'candidateImageId',
    'migrations',
  ]);
  if (
    fields['format'] !== 'dependency-migration-artifact' ||
    fields['version'] !== 1 ||
    fields['sourceSha'] !== pins.sourceSha ||
    fields['candidateImage'] !== pins.candidateImage ||
    fields['candidateImageId'] !== pins.candidateImageId
  )
    return refuseArtifact();
  const manifest: DependencyMigrationManifest = {
    format: 'dependency-migration-artifact',
    version: 1,
    sourceSha: pins.sourceSha,
    candidateImage: pins.candidateImage,
    candidateImageId: pins.candidateImageId,
    migrations: decodeMigrationArtifactRows(fields['migrations']),
  };
  // Proof: manifest-canonical omission admitted duplicate keys and noncanonical bytes; canonical-manifest test failed.
  if (JSON.stringify(manifest) + '\n' !== contents) return refuseArtifact();
  return manifest;
}
/**
 * Reads a separately prepared candidate; never approves installed hashes or proves build history.
 * Preparation provenance must come from the independently reviewed build and immutable image.
 */
export async function createDependencyMigrationManifest(
  preparedDirectory: string,
  expected: Omit<DependencyMigrationPins, 'manifestSha256'>,
): Promise<{ manifest: DependencyMigrationManifest; contents: string; sha256: string }> {
  const pins = decodeDependencyMigrationPins({ ...expected, manifestSha256: '0'.repeat(64) });
  const canonical = realpathSync(preparedDirectory);
  // Proof: prepare-installed-refusal omission approved installed bytes as expected; prepare-installed negative failed.
  if (
    canonical.split('/').includes('dependency-artifacts') ||
    canonical === edgeStateDirectory() ||
    canonical.startsWith(edgeStateDirectory() + '/')
  )
    throw new Error('migration artifact cannot prepare from installed state');
  const scan = await scanMigrationArtifact(preparedDirectory, performance.now() + 120000);
  const manifest: DependencyMigrationManifest = {
    format: 'dependency-migration-artifact',
    version: 1,
    sourceSha: pins.sourceSha,
    candidateImage: pins.candidateImage,
    candidateImageId: pins.candidateImageId,
    migrations: decodeMigrationArtifactRows(scan.migrations),
  };
  const contents = JSON.stringify(manifest) + '\n';
  const sha256 = hashContents(contents);
  decodeDependencyMigrationManifest(contents, { ...pins, manifestSha256: sha256 });
  return { manifest, contents, sha256 };
}

/** Native config absence guard precedes Bun startup, using only independently required BusyBox. */
export function migrationNativePreflight(): string {
  // Proof: native-exact-env omission passed shell-added environment to Bun; exact-env subprocess assertion failed.
  // Proof: native-config-absence omission let global/dangling/root config reach Bun; native global negative failed.
  // Proof: native-runtime-identity omission executed a setuid runtime placeholder; effective-identity negative failed.
  // Proof: native-passwd-identity omission admitted duplicate UID rows; native ambiguous negative failed.
  // Proof: native-inaccessible-metadata omission misclassified inaccessible home as absence; metadata negative failed.
  // Proof: fixed-cwd omission let the actual scanner run from /app; native cwd negative failed.
  return `exec 2>/dev/null
set -eu
[ "$PWD" = / ] || exit 71
[ -f /usr/local/bin/bun ] && [ -x /usr/local/bin/bun ] && [ ! -u /usr/local/bin/bun ] && [ ! -g /usr/local/bin/bun ] || exit 76
uid=$(/bin/busybox id -u)
home=$(/bin/busybox awk -F: -v uid="$uid" '$3 == uid { if(NF != 7) exit 1; count++; home=$6 } END { if(count != 1 || home !~ /^\\//) exit 1; print home }' /etc/passwd)
case "$home" in *[!a-zA-Z0-9_./-]*|*//*|*/./*|*/../*|*/.|*/..) exit 72;; esac
[ "$home" = / ] || [ "\${home%/}" = "$home" ] || exit 72
check_directory() {
  [ -d "$1" ] && [ ! -L "$1" ] && [ -r "$1" ] && [ -x "$1" ] || exit 73
}
check_absent() {
  check_directory "$1"
  listing=$(/bin/busybox ls -A "$1") || exit 74
  case "
$listing
" in *"
$2
"*) exit 75;; esac
}
check_directory /
current=
oldifs=$IFS
IFS=/
for component in $home; do
  [ -n "$component" ] || continue
  current=$current/$component
  check_directory "$current"
done
IFS=$oldifs
check_absent "$home" .bunfig.toml
check_absent / bunfig.toml
check_absent / .bunfig.toml
exec /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 /usr/local/bin/bun --no-env-file -e "$1"`;
}

function readManifest(pathname: string, deadline: number, retained?: number[]): string {
  // Proof: installed-manifest-byte-bound omission reached readSync on >4MiB metadata; installed-manifest bound test failed.
  const before = lstatSync(pathname);
  if (
    !before.isFile() ||
    before.nlink !== 1 ||
    ![0o600, 0o644].includes(before.mode & 0o7777) ||
    before.size < 1 ||
    before.size > 4 * 1024 * 1024
  )
    throw new Error('migration manifest file is unsafe');
  const descriptor = openSync(
    pathname,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  retained?.push(descriptor);
  try {
    const signature = (stat: typeof before) =>
      `${String(stat.dev)}:${String(stat.ino)}:${String(stat.size)}:${String(stat.mtimeMs)}:${String(stat.ctimeMs)}:${String(stat.mode)}:${String(stat.nlink)}`;
    const identity = signature(before);
    const buffer = Buffer.alloc(64 * 1024);
    const chunks: Buffer[] = [];
    let size = 0;
    for (;;) {
      if (performance.now() >= deadline) throw new Error('migration artifact deadline exceeded');
      const length = readSync(descriptor, buffer, 0, buffer.length, null);
      if (length === 0) break;
      size += length;
      if (size > before.size) throw new Error('migration manifest grew');
      chunks.push(Buffer.from(buffer.subarray(0, length)));
    }
    if (
      size !== before.size ||
      signature(fstatSync(descriptor)) !== identity ||
      signature(lstatSync(pathname)) !== identity
    )
      throw new Error('migration manifest changed');
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
  } finally {
    if (retained === undefined) closeSync(descriptor);
  }
}

/** Fresh read-only owner-bound installed/image comparison. Evidence cannot authorize activation. */
export async function observeDependencyMigrationArtifact(
  owner: DependencyOwner,
  layouts: { readonly prod: EnvLayout; readonly dev: EnvLayout },
  pins: DependencyMigrationPins,
  runDocker: RunDocker,
  deadline: number,
) {
  pins = decodeDependencyMigrationPins(pins);
  // Proof: observer-deadline omission accepted a 121-second entry budget; deadline negative failed.
  if (
    !Number.isFinite(deadline) ||
    deadline <= performance.now() ||
    deadline - performance.now() > 120000
  )
    throw new Error('migration observer deadline outside bounds');
  const state = edgeStateDirectory();
  const assertOwner = async () => {
    if (layouts.prod.env !== 'prod' || layouts.dev.env !== 'dev')
      throw new Error('migration observer requires joint layouts');
    // Proof: owner-source omission admitted coherently pinned foreign SHA; source negative failed.
    await assertDependencyOwner(owner, layouts.prod, pins.sourceSha);
    // Proof: joint-dev-layout omission admitted a foreign dev network; layout negative failed.
    await assertDependencyOwner(owner, layouts.dev, pins.sourceSha);
    await assertDependencyOwnerDirectory(owner, layouts.prod, state);
  };
  await assertOwner();
  // Retain each fixed parent descriptor across all image observations.
  const descriptors: number[] = [];
  let retained: Awaited<ReturnType<typeof scanMigrationArtifact>> | undefined;
  const anchors: { path: string; descriptor: number; dev: number; ino: number }[] = [];
  try {
    if (realpathSync(state) !== state) throw new Error('migration state is not canonical');
    let anchored = '/';
    for (const [index, component] of [
      ...state.split('/').filter(Boolean),
      'dependency-artifacts',
      pins.manifestSha256,
    ].entries()) {
      const pathname = join(anchored, component);
      const before = lstatSync(pathname);
      // Proof: installed-parent-modes omission admitted a world-writable artifact envelope; unsafe-root negative failed.
      if (
        !before.isDirectory() ||
        (index >= state.split('/').filter(Boolean).length - 1 &&
          ![0o700, 0o755].includes(before.mode & 0o7777))
      )
        throw new Error('migration artifact parent is unsafe');
      const descriptor = openSync(
        pathname,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
      descriptors.push(descriptor);
      const after = fstatSync(descriptor);
      if (before.dev !== after.dev || before.ino !== after.ino)
        throw new Error('migration parent changed');
      anchors.push({ path: pathname, descriptor, dev: before.dev, ino: before.ino });
      anchored = `/proc/self/fd/${String(descriptor)}`;
    }
    if (
      JSON.stringify(readdirSync(anchored).sort()) !== JSON.stringify(['drizzle', 'manifest.json'])
    )
      throw new Error('migration artifact envelope membership differs');
    const manifestPath = join(anchored, 'manifest.json');
    const manifestIdentity = lstatSync(manifestPath);
    // Proof: manifest-descriptor-retention omission left no original manifest FD during the gated image call; retention assertion failed.
    const contents = readManifest(manifestPath, deadline, descriptors);
    const manifest = decodeDependencyMigrationManifest(contents, pins);
    // Scanner requires canonical ordinary pathname; retained parent handles are independently rechecked.
    const directory = join(state, 'dependency-artifacts', pins.manifestSha256, 'drizzle');
    // Proof: retained-scan-descriptors omission closed the initial tree during a gated image call; live FD-count assertion failed.
    const first = await scanMigrationArtifact(directory, deadline, true);
    retained = first;
    // Proof: installed-comparison omission admitted independently mismatching installed SQL; initial-file negative failed.
    if (
      JSON.stringify(decodeMigrationArtifactRows(first.migrations)) !==
      JSON.stringify(manifest.migrations)
    )
      throw new Error('installed migration artifact differs');
    const docker = ownerDockerHashed(owner, layouts.prod, runDocker);
    const callDocker = async (args: string[]) => {
      try {
        const response = await runMigrationDocker(args, docker, deadline);
        // Proof: response-byte-bound omission dispatched >4MiB to JSON.parse; response-limit boundary assertion failed.
        if (Buffer.byteLength(response) > 4 * 1024 * 1024) throw new Error('response bound');
        return response;
      } catch {
        // Proof: docker-error-secrecy omission exposed PRIVATE_SENTINEL; secret negative failed.
        throw new Error(
          args[0] === 'run'
            ? `migration read-only image probe failed; purpose=dependency-migration-artifact image=${pins.candidateImageId} operationSha256=${hashContents(JSON.stringify(args))}; CLI settled; container cleanup unverified; retain owner intent`
            : 'migration image observation failed',
        );
      }
    };
    const resolveImage = async () => {
      if (
        (
          await callDocker(['image', 'inspect', '--format', '{{.Id}}', pins.candidateImage])
        ).trim() !== pins.candidateImageId
      )
        throw new Error('migration candidate image identity differs');
    };
    await resolveImage();
    // Proof: independent docker-fixed-workdir/network-none/read-only/immutable-image omissions failed the exact transport boundary assertion.
    const response = await callDocker([
      'run',
      '--rm',
      '--pull',
      'never',
      '--network',
      'none',
      '--read-only',
      '--workdir',
      '/',
      '--entrypoint',
      '/usr/bin/env',
      pins.candidateImageId,
      '-i',
      'PATH=/usr/local/bin:/usr/bin:/bin',
      'BUN_RUNTIME_TRANSPILER_CACHE_PATH=0',
      '/bin/busybox',
      'sh',
      '-c',
      migrationNativePreflight(),
      'migration-artifact',
      migrationScannerProgram(),
    ]);
    let projection: unknown;
    try {
      projection = JSON.parse(response);
    } catch {
      // Proof: parser-error-secrecy omission exposed PRIVATE_SENTINEL; json negative failed.
      throw new Error('migration image projection JSON is invalid');
    }
    // Proof: image-comparison omission admitted changed forward hashes from the independent image; image-hash negative failed.
    const imageRows = decodeMigrationArtifactRows(projection);
    if (
      response !== JSON.stringify(imageRows) + '\n' ||
      JSON.stringify(imageRows) !== JSON.stringify(manifest.migrations)
    )
      throw new Error('migration image artifact differs');
    // Proof: second-image-resolution omission admitted a changed immutable reference on reread; second-image negative failed.
    await resolveImage();
    const freshManifestIdentity = lstatSync(manifestPath);
    // Proof: manifest-inode omission admitted a same-byte manifest replacement; manifest negative failed.
    if (
      freshManifestIdentity.dev !== manifestIdentity.dev ||
      freshManifestIdentity.ino !== manifestIdentity.ino ||
      freshManifestIdentity.mtimeMs !== manifestIdentity.mtimeMs ||
      freshManifestIdentity.ctimeMs !== manifestIdentity.ctimeMs ||
      JSON.stringify(readdirSync(anchored).sort()) !== JSON.stringify(['drizzle', 'manifest.json'])
    )
      throw new Error('migration manifest identity changed');
    first.verify();
    const second = await scanMigrationArtifact(directory, deadline);
    // Proof: fresh-installed-comparison plus redundant retained verify omission admitted changed SQL; file negative failed.
    if (
      JSON.stringify(first) !== JSON.stringify(second) ||
      readManifest(manifestPath, deadline) !== contents
    )
      throw new Error('installed migration artifact changed');
    for (const anchor of anchors) {
      const actual = lstatSync(anchor.path);
      const retained = fstatSync(anchor.descriptor);
      if (
        actual.dev !== anchor.dev ||
        actual.ino !== anchor.ino ||
        retained.dev !== anchor.dev ||
        retained.ino !== anchor.ino
      )
        throw new Error('migration parent identity changed');
    }
    await assertOwner();
    if (performance.now() >= deadline) throw new Error('migration artifact deadline exceeded');
    return {
      format: 'dependency-migration-artifact-observation' as const,
      version: 1 as const,
      activation: 'blocked' as const,
      sourceSha: pins.sourceSha,
      manifestSha256: pins.manifestSha256,
      candidateImage: pins.candidateImage,
      candidateImageId: pins.candidateImageId,
      migrations: manifest.migrations.map((row) => ({
        name: row.name,
        hash: row.migration.sha256,
        downHash: row.down.sha256,
      })),
    };
  } finally {
    retained?.close();
    for (const descriptor of descriptors.reverse()) closeSync(descriptor);
  }
}

/**
 * Abort and await transport/owner settlement before returning. RunDocker must honor abort
 * and settle its killed CLI child; daemon probe absence remains unverified on failure.
 */
async function runMigrationDocker(
  args: string[],
  runDocker: RunDocker,
  deadline: number,
): Promise<string> {
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw new Error('migration image deadline exceeded');
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, remaining);
  try {
    // Proof: abort-settlement-race substituted runDockerBefore; gated cleanup remained pending when observer returned, failing the settlement assertion.
    const response = await runDocker(args, controller.signal);
    if (controller.signal.aborted || performance.now() >= deadline)
      throw new Error('migration image deadline exceeded');
    return response;
  } finally {
    clearTimeout(timer);
  }
}
