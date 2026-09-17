import { readFile } from 'node:fs/promises';

import { type } from 'arktype';

// Proof: replacing this checksum expression with an accepting expression made
// the invalid-checksum production-reader negative fail on 2026-09-17.
const sha256 = /^[0-9a-f]{64}$/;
const digest = /^sha256:[0-9a-f]{64}$/;
// Proof: replacing this exact-version expression with /.+/ made the release
// channel production-reader negative fail on 2026-09-17.
const exactVersion = /^v?\d+\.\d+\.\d+(?:[+-][0-9A-Za-z.-]+)?$/;

const BinaryLock = type({
  version: exactVersion,
  url: 'string.url',
  sha256,
  // Proof: widening these literals to Darwin/arm64 made the unsupported
  // platform production-reader negative fail on 2026-09-17.
  os: "'linux'",
  arch: "'amd64'",
  '+': 'reject',
});

const ImageLock = type({ role: 'string>0', name: 'string>0', digest, '+': 'reject' });

const ChartLock = type({
  version: exactVersion,
  url: 'string.url',
  sha256,
  images: ImageLock.array().atLeastLength(1),
  disabledComponents: 'string[]',
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
    // Proof: making k3s optional made the missing-lock production-reader
    // negative fail on 2026-09-17.
    k3s: BinaryLock,
    k3d: BinaryLock,
    flux: BinaryLock,
    kubectl: BinaryLock,
    helm: BinaryLock,
    multipass: BinaryLock,
    '+': 'reject',
  },
  terraform: {
    hcloudProvider: {
      version: exactVersion,
      source: "'registry.terraform.io/hetznercloud/hcloud'",
      url: 'string.url',
      sha256,
      os: "'linux'",
      arch: "'amd64'",
      '+': 'reject',
    },
    '+': 'reject',
  },
  runtimeImages: { k3dNode: ImageLock, '+': 'reject' },
  controller: {
    image: 'string>0',
    digest,
    python: exactVersion,
    ansibleCore: exactVersion,
    collections: {
      communityGeneral: exactVersion,
      hetznerHcloud: exactVersion,
      kubernetesCore: exactVersion,
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
  // Proof: removing this root exactness guard made the unknown-key
  // production-reader negative fail on 2026-09-17.
  '+': 'reject',
});

export type Toolchain = typeof ToolchainSchema.infer;

function parseToolchain(input: unknown): Toolchain {
  const toolchain = ToolchainSchema(input);
  if (toolchain instanceof type.errors) {
    throw new Error(`Toolchain validation failed: ${toolchain.summary}`, { cause: toolchain });
  }
  return toolchain;
}

const requiredImageRoles = {
  hcloudCcm: ['controller'],
  hcloudCsi: [
    'controller',
    'csiAttacher',
    'csiNodeDriverRegistrar',
    'csiProvisioner',
    'csiResizer',
    'livenessProbe',
  ],
  traefik: ['controller'],
  certManager: ['acmeSolver', 'caInjector', 'controller', 'startupApiCheck', 'webhook'],
  eckOperator: ['operator'],
  elasticsearch: ['node'],
  kibana: ['node'],
  kubePrometheusStack: [
    'admissionWebhook',
    'admissionWebhookCertgen',
    'alertmanager',
    'configReloader',
    'kubeStateMetrics',
    'nodeExporter',
    'operator',
    'prometheus',
  ],
  opentelemetryCollector: ['collector'],
  velero: ['server'],
} as const satisfies Record<keyof Toolchain['charts'], readonly string[]>;

function assertCompleteImageLocks(toolchain: Toolchain): void {
  const chartNames = [
    'hcloudCcm',
    'hcloudCsi',
    'traefik',
    'certManager',
    'eckOperator',
    'elasticsearch',
    'kibana',
    'kubePrometheusStack',
    'opentelemetryCollector',
    'velero',
  ] as const satisfies readonly (keyof Toolchain['charts'])[];
  for (const chartName of chartNames) {
    const chart = toolchain.charts[chartName];
    const expectedRoles = [...requiredImageRoles[chartName]].sort();
    const actualRoles = chart.images.map(({ role }) => role).sort();
    if (
      actualRoles.length !== expectedRoles.length ||
      actualRoles.some((role, position) => role !== expectedRoles[position])
    ) {
      // Proof: replacing this element comparison with newline joins let one
      // role hide a missing role; the production reader negative failed on
      // 2026-09-17.
      throw new Error(`${chartName} image roles must be exactly: ${expectedRoles.join(', ')}`);
    }
  }
}

/**
 * Read the complete immutable fleet toolchain lock.
 *
 * Missing, unreadable, malformed, incomplete, extended, inexact, or
 * unsupported-platform input throws. The caller may use the returned value
 * without release-channel or architecture fallback.
 */
export async function readToolchain(path: string): Promise<Toolchain> {
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (cause) {
    // Proof: reading without this contextual guard made the absent/unreadable
    // production-reader negative fail on 2026-09-17.
    throw new Error(`Cannot read required toolchain at ${path}`, { cause });
  }

  let input: unknown;
  try {
    input = JSON.parse(source);
  } catch (cause) {
    // Proof: parsing without this contextual guard made the malformed-state
    // production-reader negative fail on 2026-09-17.
    throw new Error(`Required toolchain at ${path} is not valid JSON`, { cause });
  }

  // Proof: accepting unknown keys or a missing k3s lock made their production
  // reader negatives fail on 2026-09-17; exact parsing restored both failures.
  const toolchain = parseToolchain(input);
  assertCompleteImageLocks(toolchain);
  return toolchain;
}
