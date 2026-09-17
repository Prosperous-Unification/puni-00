import { readFile } from 'node:fs/promises';

import { parseOrThrow, type } from '@shared/validation';

const sha256 = /^[0-9a-f]{64}$/;
const digest = /^sha256:[0-9a-f]{64}$/;

const BinaryLock = type({
  version: 'string>0',
  url: 'string.url',
  sha256,
  os: "'linux'|'darwin'",
  arch: "'amd64'|'arm64'",
  '+': 'reject',
});

const ImageLock = type({ name: 'string>0', digest, '+': 'reject' });

const ChartLock = type({
  version: 'string>0',
  url: 'string.url',
  sha256,
  images: ImageLock.array().atLeastLength(1),
  '+': 'reject',
});

const ToolchainSchema = type({
  schemaVersion: '1',
  supportedHosts: type({
    distribution: "'ubuntu'",
    version: "'24.04'",
    arch: "'amd64'",
    '+': 'reject',
  })
    .array()
    .atLeastLength(1),
  binaries: {
    terraform: BinaryLock,
    k3s: BinaryLock,
    k3d: BinaryLock,
    flux: BinaryLock,
    kubectl: BinaryLock,
    helm: BinaryLock,
    multipass: BinaryLock,
    '+': 'reject',
  },
  terraform: { hcloudProvider: 'string>0', '+': 'reject' },
  controller: {
    image: 'string>0',
    digest,
    python: 'string>0',
    ansibleCore: 'string>0',
    collections: {
      communityGeneral: 'string>0',
      hetznerHcloud: 'string>0',
      kubernetesCore: 'string>0',
      '+': 'reject',
    },
    '+': 'reject',
  },
  charts: {
    hcloudCcm: ChartLock,
    hcloudCsi: ChartLock,
    traefik: ChartLock,
    certManager: ChartLock,
    eckOperator: ChartLock,
    elasticsearch: ChartLock,
    kibana: ChartLock,
    kubePrometheusStack: ChartLock,
    opentelemetryCollector: ChartLock,
    velero: ChartLock,
    '+': 'reject',
  },
  '+': 'reject',
});

export type Toolchain = typeof ToolchainSchema.infer;

/**
 * Read the complete immutable fleet toolchain lock.
 *
 * Missing, unreadable, malformed, incomplete, or extended input throws. The
 * caller may therefore use the returned value without release-channel or
 * architecture fallbacks.
 */
export async function readToolchain(path: string): Promise<Toolchain> {
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (cause) {
    throw new Error(`Cannot read required toolchain at ${path}`, { cause });
  }

  let input: unknown;
  try {
    input = JSON.parse(source);
  } catch (cause) {
    throw new Error(`Required toolchain at ${path} is not valid JSON`, { cause });
  }

  return parseOrThrow(ToolchainSchema, input);
}
