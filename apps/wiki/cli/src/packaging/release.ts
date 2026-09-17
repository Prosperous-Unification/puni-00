import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';

const PackageName = 'twilight-bureaucrat';
const ReleaseTag = /^twilight-bureaucrat-v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const CommitIdentity = /^[0-9a-f]{40}$/;
const Digest = /^[0-9a-f]{64}$/;
const requiredMembers = [
  'package/package.json',
  'package/dist/bin.mjs',
  'package/dist/package-manifest.json',
  'package/dist/toolkit/SHA256SUMS',
  'package/dist/toolkit/launcher.sh',
  'package/dist/toolkit/prepare-activation.mjs',
  'package/dist/toolkit/prepare-relocation-activation.mjs',
  'package/dist/toolkit/snapshotter.ts',
  'package/dist/toolkit/toolkit.json',
  'package/dist/toolkit/validator.mjs',
] as const;

export type RegistryVersionState = 'absent' | 'present';

export interface PackageReleaseRequest {
  readonly record: string;
  readonly repository: string;
  readonly tag: string;
  readonly tarball: string;
}

export interface PackageReleaseRecord {
  readonly schemaVersion: 1;
  readonly packageName: typeof PackageName;
  readonly version: string;
  readonly tag: string;
  readonly sourceRevision: string;
  readonly tarball: string;
  readonly sha256: string;
  readonly integrity: string;
}

type RegistryLookup = (
  packageName: typeof PackageName,
  version: string,
) => Promise<RegistryVersionState>;

function run(command: string[], cwd: string, subject: string): Uint8Array {
  const invocation = Bun.spawnSync(command, { cwd, stderr: 'pipe', stdout: 'pipe' });
  if (invocation.exitCode !== 0) {
    throw new Error(`${subject}: ${invocation.stderr.toString('utf8').trim()}`);
  }
  return invocation.stdout;
}

function gitText(repository: string, argv: string[], subject: string): string {
  return new TextDecoder()
    .decode(run(['git', '-C', repository, ...argv], repository, subject))
    .trim();
}

function resolveTag(repository: string, tag: string): string {
  const invocation = Bun.spawnSync(
    [
      'git',
      '-C',
      repository,
      'rev-parse',
      '--verify',
      '--end-of-options',
      `refs/tags/${tag}^{commit}`,
    ],
    { stderr: 'pipe', stdout: 'pipe' },
  );
  // Proof: requesting an uncreated but well-formed tag made the production planner fail this
  // watched negative before it could associate package bytes with an invented release.
  if (invocation.exitCode !== 0) throw new Error(`release tag is unknown: ${tag}`);
  const revision = invocation.stdout.toString('utf8').trim();
  return revision;
}

function tarText(tarball: string, member: string): string {
  return new TextDecoder().decode(
    run(['tar', '-xOzf', tarball, member], '.', `cannot read package asset ${member}`),
  );
}

function tarMembers(tarball: string): Set<string> {
  return new Set(
    new TextDecoder()
      .decode(run(['tar', '-tzf', tarball], '.', 'cannot list package tarball'))
      .split('\n')
      .filter((member) => member.length > 0)
      .map((member) => member.replace(/^\.\//, '')),
  );
}

function readObject(text: string, subject: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    throw new Error(`${subject} is malformed`, { cause });
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${subject} is not an object`);
  }
  return value as Record<string, unknown>;
}

function integrity(bytes: Uint8Array): string {
  return `sha512-${new Bun.CryptoHasher('sha512').update(bytes).digest('base64')}`;
}

function parseRecord(text: string): PackageReleaseRecord {
  const value = readObject(text, 'package release record');
  // Proof: a transferred `{}` record reached filename comparison when this schema boundary was
  // disabled; the malformed-record negative then failed instead of naming invalid fields.
  if (
    value['schemaVersion'] !== 1 ||
    value['packageName'] !== PackageName ||
    typeof value['version'] !== 'string' ||
    typeof value['tag'] !== 'string' ||
    typeof value['sourceRevision'] !== 'string' ||
    !CommitIdentity.test(value['sourceRevision']) ||
    typeof value['tarball'] !== 'string' ||
    typeof value['sha256'] !== 'string' ||
    !Digest.test(value['sha256']) ||
    typeof value['integrity'] !== 'string' ||
    !value['integrity'].startsWith('sha512-')
  ) {
    throw new Error('package release record has invalid fields');
  }
  return value as unknown as PackageReleaseRecord;
}

/** Bind a clean tagged checkout and an accepted package tarball into the cross-job release record. */
export async function preparePackageRelease(
  request: PackageReleaseRequest,
  registryVersion: RegistryLookup,
): Promise<PackageReleaseRecord> {
  const repository = realpathSync(resolve(request.repository));
  const match = ReleaseTag.exec(request.tag);
  // Proof: both `twilight-bureaucrat-v1` and the legacy `wiki-v0.1.0` reached tag resolution when
  // this syntax boundary was disabled; the watched malformed-tag cases then failed.
  if (match === null) throw new Error(`release tag is malformed: ${request.tag}`);
  const version = `${match[1]}.${match[2]}.${match[3]}`;
  const sourceRevision = resolveTag(repository, request.tag);
  const head = gitText(repository, ['rev-parse', 'HEAD'], 'cannot resolve release HEAD');
  // Proof: committing after the tag made the production planner accept an older source identity
  // until this equality check was restored; the misplaced-tag negative then failed.
  if (sourceRevision !== head) {
    throw new Error(`release tag is not at HEAD: ${sourceRevision} != ${head}`);
  }
  const dirty = gitText(repository, ['status', '--porcelain'], 'cannot read release status')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => line.slice(3));
  // Proof: adding `untracked.txt` made the production planner resolve a complete tagged artifact
  // until this check refused the first path; the watched negative fails if this branch is removed.
  if (dirty.length > 0)
    throw new Error(`release checkout is dirty: ${dirty.slice(0, 3).join(', ')}`);

  const sourceManifest = readObject(
    readFileSync(join(repository, 'apps/wiki/cli/package.json'), 'utf8'),
    'source package manifest',
  );
  // Proof: tagging the same commit as `twilight-bureaucrat-v0.2.0` let a 0.1.0 tarball reach the
  // registry lookup until this join refused the tag and source-manifest versions.
  if (sourceManifest['name'] !== PackageName || sourceManifest['version'] !== version) {
    throw new Error(
      `release tag version differs from source package: ${version} != ${String(sourceManifest['version'])}`,
    );
  }

  const tarball = realpathSync(resolve(request.tarball));
  const members = tarMembers(tarball);
  for (const member of requiredMembers) {
    // Proof: omitting `package/dist/toolkit/toolkit.json` made the acceptance tar eligible until
    // this production tar listing named the missing trusted asset.
    if (!members.has(member)) throw new Error(`package asset is absent: ${member}`);
  }
  if (
    ![...members].some((member) => member.startsWith('package/dist/toolkit/trusted-node-modules/'))
  ) {
    // Proof: omitting the trusted compiler closure made an otherwise complete package eligible
    // until the incomplete-closure negative watched this prefix boundary.
    throw new Error('package asset is absent: package/dist/toolkit/trusted-node-modules/');
  }
  const packedManifest = readObject(tarText(tarball, 'package/package.json'), 'packed manifest');
  // Proof: packing version 0.2.0 under the 0.1.0 source tag advanced to registry lookup until the
  // packed-coordinate join was restored; the packed-version negative then failed.
  if (packedManifest['name'] !== PackageName || packedManifest['version'] !== version) {
    throw new Error(
      `packed package identity differs from release tag: ${String(packedManifest['name'])}@${String(packedManifest['version'])}`,
    );
  }
  const identity = readObject(
    tarText(tarball, 'package/dist/package-manifest.json'),
    'packed package identity',
  );
  // Proof: replacing the packed source revision with forty `b` bytes made the wrong commit
  // eligible until this identity join was restored; the source-drift negative then failed.
  if (identity['packageVersion'] !== version || identity['sourceRevision'] !== sourceRevision) {
    throw new Error('packed package identity differs from tagged source');
  }

  // Proof: returning `present` made a fully valid tagged tarball eligible for a second publication
  // until this boundary refused the immutable registry coordinate.
  if ((await registryVersion(PackageName, version)) === 'present') {
    throw new Error(`registry version already exists: ${PackageName}@${version}`);
  }
  // Proof: pre-creating the transfer record let a later preparation overwrite its reviewed bytes
  // until this refusal was restored; the occupied-record negative then failed.
  if (existsSync(request.record))
    throw new Error(`package release record already exists: ${request.record}`);
  const bytes = readFileSync(tarball);
  const record: PackageReleaseRecord = {
    schemaVersion: 1,
    packageName: PackageName,
    version,
    tag: request.tag,
    sourceRevision,
    tarball: basename(tarball),
    sha256: hashBytes(bytes),
    integrity: integrity(bytes),
  };
  writeFileSync(request.record, serializeCanonical(record), { flag: 'wx' });
  return record;
}

/** Verify that the publish job received exactly the package accepted by the preparation job. */
export function verifyPackageRelease(
  recordPath: string,
  tarballPath: string,
): PackageReleaseRecord {
  const record = parseRecord(readFileSync(recordPath, 'utf8'));
  const tarball = realpathSync(resolve(tarballPath));
  // Proof: copying unchanged bytes under another filename let the publish boundary select an
  // unrecorded artifact name until this comparison was restored.
  if (basename(tarball) !== record.tarball)
    throw new Error('transferred package name differs from release record');
  const bytes = readFileSync(tarball);
  // Proof: appending one byte after preparation made this verifier accept changed publish bytes
  // until the digest comparison was restored; the watched transfer negative then failed.
  if (hashBytes(bytes) !== record.sha256 || integrity(bytes) !== record.integrity) {
    throw new Error('transferred package digest differs from release record');
  }
  return record;
}
