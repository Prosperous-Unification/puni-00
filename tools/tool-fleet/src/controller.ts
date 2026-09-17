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

const runCommand: RunCommand = (command) => Bun.spawnSync([...command]);
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/**
 * Build the fleet controller and require the emitted OCI manifest to match the
 * identity resolved in the committed toolchain lock.
 */
export async function buildController(
  root: string,
  expectedDigest: string,
  run: RunCommand = runCommand,
  kubectl?: ControllerBinaryLock,
): Promise<void> {
  const destination = join(root, 'dist/tool-fleet/controller.oci');
  await mkdir(join(root, 'dist/tool-fleet'), { recursive: true });
  const build = run([
    'docker',
    'buildx',
    'build',
    '--file',
    join(root, 'infra/controller/Containerfile'),
    ...(kubectl === undefined
      ? []
      : [
          '--build-arg',
          `KUBECTL_URL=${kubectl.url}`,
          '--build-arg',
          `KUBECTL_SHA256=${kubectl.sha256}`,
        ]),
    '--output',
    `type=oci,dest=${destination}`,
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
  if (index.manifests.length !== 1 || index.manifests[0]?.digest !== expectedDigest) {
    // Proof: removing this guard made the mismatched-manifest production
    // boundary negative fail on 2026-09-17.
    throw new Error('Controller OCI manifest does not match lock');
  }
}
