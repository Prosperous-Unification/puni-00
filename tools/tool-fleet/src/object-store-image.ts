import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

import type { Toolchain } from './contracts';
import { type CommandOutput, requireBuilder, type RunCommand } from './controller';
import { type ObjectStoreArchive, readObjectStoreArchive } from './object-store-archive';

const sha256 = /^[0-9a-f]{64}$/;
const digest = /^sha256:[0-9a-f]{64}$/;
const SignedBinary = type({
  version: 'string>0',
  url: 'string.url',
  sha256,
  signatureUrl: 'string.url',
  '+': 'reject',
});
const ObjectStoreSchema = type({
  schemaVersion: '1',
  base: /^.+@sha256:[0-9a-f]{64}$/,
  buildx: { version: /^v[0-9]+\.[0-9]+\.[0-9]+$/, url: 'string.url', sha256, '+': 'reject' },
  builder: { name: 'string>0', digest, '+': 'reject' },
  publicKey: 'string>0',
  publicKeySource: 'string.url',
  minio: SignedBinary,
  mc: SignedBinary,
  // Proof: duplicate source image identity resolved when unknown keys were deleted (object-store-image.test.ts).
  '+': 'reject',
});
const OciIndex = type({ schemaVersion: '2', manifests: type({ digest }).array().exactlyLength(1) });
export type ObjectStoreLock = typeof ObjectStoreSchema.infer & {
  readonly image: string;
  readonly digest: string;
};
type Download = (url: string) => Promise<Response>;
/** Synchronous image command; optional stdin carries verified bytes for exact-node imports. */
export type ObjectStoreCommand = (command: readonly string[], input?: Uint8Array) => CommandOutput;
const runCommand: ObjectStoreCommand = (command, input) =>
  Bun.spawnSync([...command], { stdin: input });
const decodeOutput = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/**
 * Import into one disposable k3d server and register its digest reference in the CRI namespace.
 * k3d's direct import preserves the release tag but does not create the repository digest alias.
 * Inspect the exact source target before tagging and the alias target afterward; repeat imports
 * converge through the same verified target. Call for each node before applying local consumers.
 * A strict owned import streams revalidated retained bytes to the supplied creator ID; its
 * caller must revalidate that in-progress ownership on the captured daemon first.
 * @throws When import, source identity, alias registration or alias identity cannot be proved.
 */
export function importObjectStore(
  archive: string,
  lock: Pick<ObjectStoreLock, 'image' | 'digest'>,
  cluster: string,
  node: string,
  k3d: string,
  run: ObjectStoreCommand = runCommand,
  owned?: { readonly archive: ObjectStoreArchive; readonly nodeId: string },
): void {
  const invoke = (command: readonly string[], input?: Uint8Array): string => {
    const execution = run(command, input);
    // Proof: injected import exit 42 was accepted with this guard removed (object-store-import.test.ts).
    if (execution.exitCode !== 0)
      throw new Error(
        `Object store distribution failed: ${command.join(' ')}: ${decodeOutput(execution.stderr)}`,
      );
    return decodeOutput(execution.stdout);
  };
  if (owned !== undefined && !/^[a-f0-9]{64}$/.test(owned.nodeId))
    // Proof: Removing the ID guard reached distribution for a node name; import-ID negative failed.
    throw new Error('Object store import requires a full creator ID');
  if (
    owned !== undefined &&
    (archive !== owned.archive.path ||
      lock.image !== owned.archive.image ||
      lock.digest !== owned.archive.digest)
  )
    // Proof: Removing the receipt comparison reached distribution for a different lock; import-identity negative failed.
    throw new Error('Object store import archive identity differs');
  // Proof: Replacing the creator ID with the node name failed the retained-archive import positive.
  const ctr = ['docker', 'exec', owned?.nodeId ?? node, 'ctr', '-n', 'k8s.io', 'images'];
  const requireTarget = (reference: string): void => {
    const listing = invoke([...ctr, 'ls', `name==${reference}`]);
    const rows = listing
      .trim()
      .split('\n')
      .slice(1)
      .map((line) => line.trim().split(/\s+/));
    // Proof: missing-source and wrong-source/alias targets reached distribution when this guard was removed.
    if (rows.length !== 1 || rows[0]?.[0] !== reference || rows[0]?.[2] !== lock.digest)
      throw new Error(`Object store containerd target differs: ${reference}: ${listing}`);
  };
  if (owned === undefined)
    invoke([k3d, 'image', 'import', archive, '--cluster', cluster, '--mode', 'direct']);
  else
    invoke(
      ['docker', 'exec', '-i', owned.nodeId, 'ctr', '-n', 'k8s.io', 'images', 'import', '-'],
      readObjectStoreArchive(owned.archive),
    );
  requireTarget(lock.image);
  const reference = `${lock.image.replace(/:[^/:]+$/, '')}@${lock.digest}`;
  invoke([...ctr, 'tag', '--force', lock.image, reference]);
  requireTarget(reference);
}

/**
 * Read the required build-input lock; image identity comes only from the toolchain runtime role.
 * Malformed or unavailable trusted state throws.
 */
export async function readObjectStoreLock(
  path: string,
  image: Pick<Toolchain['runtimeImages']['objectStore'], 'name' | 'digest'>,
): Promise<ObjectStoreLock> {
  const lock = ObjectStoreSchema(JSON.parse(await readFile(path, 'utf8')));
  // Proof: incomplete-lock negative resolved when this schema guard was removed.
  if (lock instanceof type.errors) throw new Error(`Object store lock is invalid: ${lock.summary}`);
  return { ...lock, image: image.name, digest: image.digest };
}

/**
 * Verify release bytes and detached minisign signature before they enter the build context.
 * @throws When the binary is unreadable, its checksum differs, or minisign is unavailable or refuses it.
 */
export async function verifyBinary(
  path: string,
  binary: typeof SignedBinary.infer,
  publicKey: string,
  minisign: string,
  run: RunCommand = runCommand,
): Promise<void> {
  const checksum = createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
  // Proof: altered checksum negative resolved with this guard absent (object-store-image.test.ts).
  if (checksum !== binary.sha256) throw new Error(`${binary.version} checksum mismatch`);
  const verification = run([minisign, '-Vm', path, '-x', `${path}.minisig`, '-P', publicKey]);
  // Proof: rejected signature negative resolved with this guard absent (object-store-image.test.ts).
  if (verification.exitCode !== 0) {
    throw new Error(
      `${binary.version} signature verification failed: ${decodeOutput(verification.stderr)}`,
    );
  }
}

async function downloadArtifact(url: string, path: string, download: Download): Promise<void> {
  const response = await download(url);
  // Proof: HTTP 503 negative lost its required refusal with this status guard removed.
  if (!response.ok) throw new Error(`Download ${url} failed: ${String(response.status)}`);
  await writeFile(path, new Uint8Array(await response.arrayBuffer()), { mode: 0o644 });
}

/**
 * Build the local S3 target from authenticated releases and require its locked OCI manifest.
 * Uses the fleet controller's locked BuildKit boundary. SOURCE_DATE_EPOCH, explicit COPY modes,
 * no layer cache, and timestamp rewriting normalize host timestamps and modes. The archive
 * is intended for direct k3d/containerd import; see docs/infra/recovery.md for distribution and proof.
 * @throws When a download, signature, builder, build, index or manifest identity fails verification.
 */
export async function buildObjectStore(
  root: string,
  lock: ObjectStoreLock,
  run: RunCommand = runCommand,
  download: Download = fetch,
): Promise<string> {
  const client = run(['docker', 'buildx', 'version']);
  // Proof: another Buildx client version reached the build when this guard was absent (object-store-image.test.ts).
  if (
    client.exitCode !== 0 ||
    !decodeOutput(client.stdout).split(/\s+/).includes(lock.buildx.version)
  ) {
    throw new Error(
      `Object store requires Buildx ${lock.buildx.version}: ${decodeOutput(client.stdout)}${decodeOutput(client.stderr)}`,
    );
  }
  const directory = join(root, 'dist/tool-fleet/object-store');
  await mkdir(directory, { recursive: true });
  const binaries: readonly ('minio' | 'mc')[] = ['minio', 'mc'];
  for (const name of binaries) {
    const binary = lock[name];
    const path = join(directory, name);
    await downloadArtifact(binary.url, path, download);
    await downloadArtifact(binary.signatureUrl, `${path}.minisig`, download);
    await verifyBinary(path, binary, lock.publicKey, process.env['MINISIGN'] ?? 'minisign', run);
  }
  await copyFile(
    join(root, 'infra/local/object-store/Containerfile'),
    join(directory, 'Containerfile'),
  );
  const archive = join(root, 'dist/tool-fleet/object-store.oci');
  const builder = requireBuilder(lock.builder, run);
  const build = run([
    'docker',
    'buildx',
    'build',
    '--builder',
    builder,
    '--platform',
    'linux/amd64',
    '--no-cache',
    '--provenance=false',
    '--sbom=false',
    '--build-arg',
    'SOURCE_DATE_EPOCH=0',
    '--build-arg',
    `BASE=${lock.base}`,
    '--file',
    join(directory, 'Containerfile'),
    '--output',
    `type=docker,dest=${archive},name=${lock.image},oci-mediatypes=true,rewrite-timestamp=true`,
    directory,
  ]);
  // Proof: Docker exit 42 negative resolved with this guard absent (object-store-image.test.ts).
  if (build.exitCode !== 0)
    throw new Error(`Object store build failed: ${decodeOutput(build.stderr)}`);
  const inspection = run(['tar', '-xOf', archive, 'index.json']);
  // Proof: tar exit 2 negative lost the index-unreadable refusal with this guard removed.
  if (inspection.exitCode !== 0)
    throw new Error(`Object store index unreadable: ${decodeOutput(inspection.stderr)}`);
  const index = OciIndex(JSON.parse(decodeOutput(inspection.stdout)));
  // Proof: empty index negative lost the index-invalid refusal with this guard removed.
  if (index instanceof type.errors) throw new Error(`Object store index invalid: ${index.summary}`);
  // Proof: different manifest negative resolved with this guard absent (object-store-image.test.ts).
  if (index.manifests[0]?.digest !== lock.digest) {
    throw new Error(
      `Object store manifest mismatch: expected ${lock.digest}, received ${index.manifests[0]?.digest}`,
    );
  }
  return archive;
}
