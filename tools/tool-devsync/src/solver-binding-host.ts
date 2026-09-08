import { decodeSolverSupervisorConfig } from '@wbs/deploy-contract';

import {
  resumeSolverBindingBeforeReset,
  type SolverBinding,
  type SolverBindingTarget,
  type SolverPreparationState,
} from './solver-preparation';

const HOST_INPUT_MAX_BYTES = 256 * 1024;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const DIGEST_PINNED_IMAGE = /^[^\s@]+@sha256:[0-9a-f]{64}$/;

function recordOf(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} root is not an object`);
  }
  return value as Record<string, unknown>;
}

function jsonOf(bytes: Uint8Array, label: string): unknown {
  if (bytes.byteLength === 0 || bytes.byteLength > HOST_INPUT_MAX_BYTES) {
    throw new Error(`${label} must contain 1 through ${String(HOST_INPUT_MAX_BYTES)} bytes`);
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8 JSON: ${String(error)}`, { cause: error });
  }
}

/** Extracts the one host-owned publish credential without logging its value. */
export function registryPasswordFromEnv(bytes: Uint8Array): string {
  if (bytes.byteLength === 0 || bytes.byteLength > HOST_INPUT_MAX_BYTES) {
    throw new Error(
      `registry environment must contain 1 through ${String(HOST_INPUT_MAX_BYTES)} bytes`,
    );
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`registry environment is not valid UTF-8: ${String(error)}`, { cause: error });
  }
  const matches = text
    .split('\n')
    .filter((line) => line.startsWith('REGISTRY_PASS='))
    .map((line) => line.slice('REGISTRY_PASS='.length));
  if (matches.length === 0) throw new Error('REGISTRY_PASS is missing from the host environment');
  if (matches.length > 1) throw new Error('REGISTRY_PASS has duplicate host environment entries');
  const password = matches[0];
  if (password === '') {
    throw new Error('REGISTRY_PASS is empty in the host environment');
  }
  return password;
}

/** Validates the one-tier publish manifest before its image reaches host config. */
export function decodePublishedSolverImage(bytes: Uint8Array, sourceSha: string): string {
  if (!COMMIT_SHA.test(sourceSha)) throw new Error('published solver target source SHA is invalid');
  const manifest = recordOf(jsonOf(bytes, 'solver publish manifest'), 'solver publish manifest');
  if (Object.keys(manifest).some((key) => key !== 'be')) {
    throw new Error('solver publish manifest contains a non-backend tier');
  }
  const entry = recordOf(manifest['be'], 'solver publish manifest be entry');
  if (entry['sha'] !== sourceSha) {
    throw new Error('solver publish manifest source SHA does not match target');
  }
  const digest = entry['digest'];
  if (typeof digest !== 'string' || !DIGEST.test(digest)) {
    throw new Error('solver publish manifest digest is invalid');
  }
  const image = entry['image'];
  if (
    typeof image !== 'string' ||
    !DIGEST_PINNED_IMAGE.test(image) ||
    !image.endsWith(`@${digest}`)
  ) {
    throw new Error('solver publish manifest image is not digest-pinned to its returned digest');
  }
  if (typeof entry['ref'] !== 'string' || entry['ref'] === '') {
    throw new Error('solver publish manifest tagged ref is missing');
  }
  return image;
}

export interface InstalledProdImages {
  blueImage: string;
  greenImage: string;
}

export interface TargetSolverBindingConfig extends InstalledProdImages {
  devSolverImage: string;
  devSourceSha: string;
}

export interface TargetSolverBindingDependencies {
  readRegistryEnv(): Promise<Uint8Array>;
  readInstalledConfig(): Promise<Uint8Array>;
  publish(sourceSha: string, registryPassword: string): Promise<Uint8Array>;
  materialize(config: TargetSolverBindingConfig): Promise<void>;
  install(binding: SolverBinding): Promise<void>;
  preflight(binding: SolverBinding): Promise<void>;
  checkpoint(state: SolverPreparationState): Promise<void>;
  reset(sourceSha: string): Promise<void>;
}

/** Preserves both production image rules while the automatic path replaces dev. */
export function decodeInstalledProdImages(bytes: Uint8Array): InstalledProdImages {
  const value = jsonOf(bytes, 'installed solver supervisor config');
  decodeSolverSupervisorConfig(value);
  const config = recordOf(value, 'installed solver supervisor config');
  const images = config['images'];
  if (!Array.isArray(images))
    throw new Error('installed solver supervisor config images is invalid');

  const prodImage = (callerName: 'be-01-blue' | 'be-01-green'): string => {
    const matches = images
      .map((entry) => recordOf(entry, 'installed solver supervisor image rule'))
      .filter((entry) => entry['callerName'] === callerName);
    if (matches.length !== 1) {
      throw new Error(`installed solver supervisor config needs one ${callerName} image rule`);
    }
    const callerImage = matches[0]?.['callerImage'];
    const solverImage = matches[0]?.['solverImage'];
    if (typeof callerImage !== 'string' || callerImage !== solverImage) {
      throw new Error(`installed ${callerName} solver image must equal its caller image`);
    }
    return callerImage;
  };

  return { blueImage: prodImage('be-01-blue'), greenImage: prodImage('be-01-green') };
}

/** Runs the target binding transition after validating preserved host authority. */
export async function prepareTargetSolverBinding(
  target: SolverBindingTarget,
  stateBytes: Uint8Array | undefined,
  dependencies: TargetSolverBindingDependencies,
): Promise<void> {
  const prod = decodeInstalledProdImages(await dependencies.readInstalledConfig());
  await resumeSolverBindingBeforeReset(target, stateBytes, {
    publish: async ({ sourceSha }) => {
      const password = registryPasswordFromEnv(await dependencies.readRegistryEnv());
      return decodePublishedSolverImage(await dependencies.publish(sourceSha, password), sourceSha);
    },
    checkpoint: (state) => dependencies.checkpoint(state),
    materialize: (binding) =>
      dependencies.materialize({
        ...prod,
        devSolverImage: binding.image,
        devSourceSha: binding.sourceSha,
      }),
    install: (binding) => dependencies.install(binding),
    preflight: (binding) => dependencies.preflight(binding),
    reset: (sourceSha) => dependencies.reset(sourceSha),
  });
}
