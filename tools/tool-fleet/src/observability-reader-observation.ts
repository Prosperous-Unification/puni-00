import { createHash } from 'node:crypto';

import { type } from 'arktype';

import { type DiscoveryCommand, type RunDiscoveryCommand, runDiscoveryCommand } from './discover';
import {
  observabilityProjections,
  ObservabilityResourceProjection,
} from './observability-preflight';
import { assertRetainedReaderConfiguration } from './observability-reader';

// Proof: ignoring undeclared request keys admitted private credentials in the unknown-evidence negative in observability-reader-evidence.test.ts.
const Request = type({
  schemaVersion: '1',
  controllerContext: /^[a-zA-Z0-9][a-zA-Z0-9._:/@-]*$/,
  context: /^[a-zA-Z0-9][a-zA-Z0-9._:/@-]*$/,
  targetMarker: "'platform-local' | 'platform-production'",
  identityUID: 'string>0',
  ownerUID: 'string>0',
  sourceUID: 'string>0',
  sourceRevision: 'string>0',
  configurationUID: 'string>0',
  configurationSHA256: /^[a-f0-9]{64}$/,
  workloadUID: 'string>0',
  templateChecksum: /^[a-f0-9]{64}$/,
  maxAgeMs: '0<number.integer<=60000',
  timeoutMs: '0<number.integer<=30000',
  '+': 'reject',
});
const Identity = type({
  name: 'string',
  namespace: 'string',
  uid: 'string',
  marker: 'string',
  immutable: 'boolean',
  '+': 'reject',
});
const Source = type({
  kind: 'string',
  name: 'string',
  namespace: 'string',
  uid: 'string',
  revision: 'string',
  ready: 'boolean',
  generation: 'number',
  observedGeneration: 'number',
  '+': 'reject',
});

const Owned = type({
  name: 'string',
  namespace: 'string',
  uid: 'string',
  owner: 'string',
  ownerNamespace: 'string',
});
const Configuration = Owned.and({ configuration: 'string' }).onUndeclaredKey('reject');
const Workload = Owned.and({
  generation: 'number.integer>=1',
  observedGeneration: 'number.integer>=1',
  desired: 'number.integer>=1',
  ready: 'number.integer>=0',
  updated: 'number.integer>=0',
  checksum: 'string',
  configuration: 'string',
}).onUndeclaredKey('reject');
const quote = (field: string) => `{{printf "%q" ${field}}}`;
const owned = `"name":${quote('.metadata.name')},"namespace":${quote('.metadata.namespace')},"uid":${quote('.metadata.uid')},"owner":${quote('(index .metadata.annotations "meta.helm.sh/release-name")')},"ownerNamespace":${quote('(index .metadata.annotations "meta.helm.sh/release-namespace")')}`;
/** Fixed read-only projections. No Secret bodies or arbitrary operator command enters this interface. */
export const retainedReaderProjections = {
  configuration: `{${owned},"configuration":${quote('(index .data "relay")')}}`,
  // Proof: changing the chart volume name to opentelemetry-collector-config made actual pinned kubectl return an empty configuration reference in observability-reader-native.test.ts.
  workload: `{${owned},"generation":{{.metadata.generation}},"observedGeneration":{{.status.observedGeneration}},"desired":{{.status.desiredNumberScheduled}},"ready":{{.status.numberReady}},"updated":{{.status.updatedNumberScheduled}},"checksum":${quote('(index .spec.template.metadata.annotations "checksum/config")')},"configuration":"{{range .spec.template.spec.volumes}}{{if eq .name "opentelemetry-collector-configmap"}}{{.configMap.name}}{{end}}{{end}}"}`,
};
function refuse(category: string): never {
  throw new Error(`Retained reader prerequisite ${category}`);
}
function decode<Output>(schema: type.Any<Output>, input: unknown): Output {
  const parsed = schema(input);
  if (parsed instanceof type.errors) refuse('malformed');
  // Boundary: ArkType validated Output; TypeScript cannot reduce generic distillation.
  return parsed as Output;
}
/** Observe only explicitly authorized context and pinned ownership/source/configuration. This certifies installed source, never loaded config, record rejection or activation. */
export async function validateRetainedReaderPrerequisite(
  input: unknown,
  options: { run?: RunDiscoveryCommand; now?: () => Date } = {},
) {
  const request = structuredClone(decode(Request, input));
  const run = options.run ?? runDiscoveryCommand;
  const now = options.now ?? (() => new Date());
  const observedAt: string[] = [];
  async function read(
    name: string,
    resource: string,
    arguments_: string[],
    projection: string,
  ): Promise<unknown> {
    const command: DiscoveryCommand = {
      source: `observability-kubernetes:${name}`,
      executable: 'kubectl',
      arguments: [
        '--context',
        ['source', 'owner'].includes(name) ? request.controllerContext : request.context,
        `--request-timeout=${String(request.timeoutMs)}ms`,
        'get',
        resource,
        ...arguments_,
        '-o',
        `go-template=${projection}`,
      ],
      timeoutMs: request.timeoutMs,
    };
    let response;
    try {
      response = await run(command);
    } catch {
      return refuse('command-unavailable');
    }
    if (response.exitCode !== 0) refuse('command-failed');
    const timestamp = Date.parse(response.observedAt),
      current = now().getTime();
    // Proof: removing this boundary admitted future evidence in the production observation negative.
    if (
      !Number.isFinite(timestamp) ||
      timestamp > current ||
      current - timestamp > request.maxAgeMs
    )
      refuse('stale');
    observedAt.push(response.observedAt);
    try {
      return JSON.parse(response.stdout) as unknown;
    } catch {
      return refuse('malformed');
    }
  }
  const identity = decode(
    Identity,
    await read(
      'identity',
      'configmap',
      [`puni-cluster-${request.targetMarker}`, '-n', 'kube-system'],
      observabilityProjections.identity,
    ),
  );
  // Proof: removing this identity/readiness guard admitted the independent target evidence fault in observability-reader-evidence.test.ts.
  if (
    identity.uid !== request.identityUID ||
    identity.name !== `puni-cluster-${request.targetMarker}` ||
    identity.namespace !== 'kube-system' ||
    identity.marker !== request.targetMarker ||
    !identity.immutable
  )
    refuse('target-mismatch');
  const source = decode(
    Source,
    await read(
      'source',
      'gitrepository',
      ['puni-platform', '-n', 'flux-system'],
      observabilityProjections.source,
    ),
  );
  // Proof: removing this identity/readiness guard admitted the independent source evidence fault in observability-reader-evidence.test.ts.
  if (
    source.uid !== request.sourceUID ||
    source.kind !== 'GitRepository' ||
    source.name !== 'puni-platform' ||
    source.namespace !== 'flux-system' ||
    source.revision !== request.sourceRevision ||
    !source.ready ||
    source.generation !== source.observedGeneration
  )
    refuse('source-mismatch');
  // Proof: changing this closed projection to ignore extra keys admitted PRIVATE-MARKER in the private-projection negative.
  const owners = decode(
    ObservabilityResourceProjection.array(),
    await read(
      'owner',
      'helmreleases',
      ['-n', 'observability', '--field-selector=metadata.name=otel-collector'],
      observabilityProjections.resources,
    ),
  );
  if (owners.length !== 1) refuse('owner-mismatch');
  const owner = owners[0];
  // Proof: removing this identity/readiness guard admitted the independent owner evidence fault in observability-reader-evidence.test.ts.
  if (
    owner.uid !== request.ownerUID ||
    owner.kind !== 'HelmRelease' ||
    owner.name !== 'otel-collector' ||
    owner.namespace !== 'observability' ||
    !owner.ready ||
    owner.generation !== owner.observedGeneration ||
    owner.revision !== '0.173.1' ||
    owner.sourceKind !== 'GitRepository' ||
    owner.sourceName !== 'puni-platform' ||
    owner.sourceNamespace !== 'flux-system' ||
    owner.releaseName !== 'otel-collector' ||
    owner.releaseNamespace !== 'observability'
  )
    refuse('owner-mismatch');
  const configuration = decode(
    Configuration,
    await read(
      'configuration',
      'configmap',
      ['otel-collector-agent', '-n', 'observability'],
      retainedReaderProjections.configuration,
    ),
  );
  // Proof: removing this identity/readiness guard admitted the independent configuration evidence fault in observability-reader-evidence.test.ts.
  if (
    configuration.uid !== request.configurationUID ||
    configuration.name !== 'otel-collector-agent' ||
    configuration.namespace !== 'observability' ||
    configuration.owner !== 'otel-collector' ||
    configuration.ownerNamespace !== 'observability' ||
    createHash('sha256').update(configuration.configuration).digest('hex') !==
      request.configurationSHA256
  )
    refuse('configuration-mismatch');
  assertRetainedReaderConfiguration(configuration.configuration);
  const workload = decode(
    Workload,
    await read(
      'workload',
      'daemonset',
      ['otel-collector-agent', '-n', 'observability'],
      retainedReaderProjections.workload,
    ),
  );
  // Proof: removing this identity/readiness guard admitted the independent workload evidence fault in observability-reader-evidence.test.ts.
  if (
    workload.uid !== request.workloadUID ||
    workload.name !== 'otel-collector-agent' ||
    workload.namespace !== 'observability' ||
    workload.owner !== 'otel-collector' ||
    workload.ownerNamespace !== 'observability' ||
    workload.generation !== workload.observedGeneration ||
    workload.ready !== workload.desired ||
    workload.updated !== workload.desired ||
    workload.checksum !== request.templateChecksum ||
    workload.configuration !== configuration.name
  )
    refuse('workload-mismatch');
  if (observedAt.some((timestamp) => now().getTime() - Date.parse(timestamp) > request.maxAgeMs))
    refuse('stale');
  return {
    scope: 'retained-reader-observed-source' as const,
    context: request.context,
    targetMarker: request.targetMarker,
    ownerUID: request.ownerUID,
    configurationSHA256: request.configurationSHA256,
    observedAt,
    observedSourcePrerequisite: true as const,
    effectiveReaderVerified: false as const,
    activationReady: false as const,
  };
}
