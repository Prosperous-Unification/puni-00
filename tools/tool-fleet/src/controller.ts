import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

const digest = /^sha256:[0-9a-f]{64}$/;
const OciIndex = type({
  schemaVersion: '2',
  manifests: type({ digest }).array().atLeastLength(1),
});

export interface CommandOutput {
  readonly exitCode: number;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
}

export type RunCommand = (command: readonly string[]) => CommandOutput;

export interface ControllerBinaryLock {
  readonly url: string;
  readonly sha256: string;
}

export interface ControllerBuildLock {
  /** Reference `docker load` tags the archive with; it lives in index.json, not the manifest. */
  readonly image: string;
  /** Locked manifest digest the build must reproduce. */
  readonly digest: string;
  /** BuildKit daemon image, pinned because layer bytes depend on its version. */
  readonly builder: { readonly name: string; readonly digest: string };
  readonly kubectl: ControllerBinaryLock;
}

const runCommand: RunCommand = (command) => Bun.spawnSync([...command]);
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/**
 * Name of the `docker-container` buildx builder dedicated to one locked BuildKit image. The name
 * carries the image digest, so changing the lock selects a fresh builder instead of reusing one
 * started from the previous image.
 */
export function controllerBuilderName(builder: ControllerBuildLock['builder']): string {
  return `puni-fleet-controller-${builder.digest.replace(/^sha256:/, '').slice(0, 12)}`;
}

/**
 * Select the locked BuildKit builder, creating it when absent. The default `docker` driver cannot
 * export OCI archives without the containerd image store, and its embedded BuildKit follows the
 * host's Docker release; a pinned `docker-container` builder behaves the same on every host.
 * Throws when a builder of that name runs another image or when inspection or creation fails.
 */
function requireBuilder(builder: ControllerBuildLock['builder'], run: RunCommand): string {
  const name = controllerBuilderName(builder);
  const image = `${builder.name}@${builder.digest}`;
  const inspection = run(['docker', 'buildx', 'inspect', name]);
  if (inspection.exitCode === 0) {
    // Proof: removing this guard let controller.test.ts `refuses a builder running another
    // BuildKit image` reach the build with a builder started from an unlocked image.
    if (!decode(inspection.stdout).includes(`image="${image}"`)) {
      throw new Error(
        `buildx builder ${name} does not run ${image}; remove it with \`docker buildx rm ${name}\``,
      );
    }
    return name;
  }
  const inspectError = decode(inspection.stderr);
  // Proof: treating every inspect failure as absence made controller.test.ts `rejects an
  // unreadable builder inspection` try to create a builder over a daemon error.
  if (!inspectError.includes(`no builder "${name}" found`)) {
    throw new Error(`Cannot inspect buildx builder ${name}: ${inspectError}`);
  }
  const creation = run([
    'docker',
    'buildx',
    'create',
    '--name',
    name,
    '--driver',
    'docker-container',
    '--driver-opt',
    `image=${image}`,
  ]);
  if (creation.exitCode !== 0) {
    // Proof: removing this guard made controller.test.ts `rejects a failed builder creation`
    // continue to the build step.
    throw new Error(`Cannot create buildx builder ${name}: ${decode(creation.stderr)}`);
  }
  return name;
}

/**
 * Build the fleet controller with the locked BuildKit image and require the emitted OCI manifest
 * to match the identity resolved in the committed toolchain lock. `SOURCE_DATE_EPOCH=0` with
 * `rewrite-timestamp=true` clamps image and layer timestamps, and provenance and SBOM
 * attestations are disabled, so a fresh build without layer cache reproduces the digest. The
 * archive index names `lock.image`, so `docker load` tags it and a containerd image store resolves
 * `image@digest` in {@link resolveController}.
 */
export async function buildController(
  root: string,
  lock: ControllerBuildLock,
  run: RunCommand = runCommand,
): Promise<void> {
  const destination = join(root, 'dist/tool-fleet/controller.oci');
  await mkdir(join(root, 'dist/tool-fleet'), { recursive: true });
  const builder = requireBuilder(lock.builder, run);
  const build = run([
    'docker',
    'buildx',
    'build',
    '--builder',
    builder,
    '--provenance=false',
    '--sbom=false',
    '--file',
    join(root, 'infra/controller/Containerfile'),
    '--build-arg',
    'SOURCE_DATE_EPOCH=0',
    '--build-arg',
    `KUBECTL_URL=${lock.kubectl.url}`,
    '--build-arg',
    `KUBECTL_SHA256=${lock.kubectl.sha256}`,
    '--output',
    `type=oci,dest=${destination},name=${lock.image},rewrite-timestamp=true`,
    root,
  ]);
  if (build.exitCode !== 0) {
    // Proof: removing this guard made the injected Docker-exit-42 production
    // boundary negative fail on 2026-09-17.
    throw new Error(`Docker build failed: ${decode(build.stderr)}`);
  }

  const inspection = run(['tar', '-xOf', destination, 'index.json']);
  if (inspection.exitCode !== 0) {
    // Proof: removing this guard made the injected tar-exit-43 production
    // boundary negative fail on 2026-09-17.
    throw new Error(`Cannot inspect controller OCI index: ${decode(inspection.stderr)}`);
  }

  let input: unknown;
  try {
    input = JSON.parse(decode(inspection.stdout));
  } catch (cause) {
    // Proof: removing this contextual guard made the malformed-index
    // production boundary negative fail on 2026-09-17.
    throw new Error('Controller OCI index is not valid JSON', { cause });
  }
  const index = OciIndex(input);
  if (index instanceof type.errors) {
    // Proof: removing this schema guard made the missing-manifests production
    // boundary negative fail on 2026-09-17.
    throw new Error(`Controller OCI index is invalid: ${index.summary}`, { cause: index });
  }
  if (index.manifests.length !== 1 || index.manifests[0]?.digest !== lock.digest) {
    // Proof: removing this guard made the mismatched-manifest production
    // boundary negative fail on 2026-09-17.
    throw new Error('Controller OCI manifest does not match lock');
  }
}
