import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';
import { parseAllDocuments, parseDocument, stringify } from 'yaml';

import {
  createObservabilityWorkloads,
  observabilityInputs,
  renderObservabilityConfiguration,
} from './observability';
import {
  declareObservabilityAuthority,
  declareObservabilityRoutes,
  declareObservabilitySecrets,
} from './observability-authority';
import {
  createObservabilityProjection,
  type ObservabilityProjectionRelease,
  selectObservabilityProjection,
} from './observability-projection';

const Request = type({
  placement: "'local' | 'production'",
  instances: [
    {
      environment: "'dev'",
      namespace: "'observability-dev'",
      policy: "'development'",
      '+': 'reject',
    },
    {
      environment: "'prod'",
      namespace: "'observability'",
      policy: "'retained-production' | 'disposable-rehearsal'",
      '+': 'reject',
    },
  ],
  '+': 'reject',
});
/** Closed reviewed instance-policy bindings; placement never supplies an implicit app environment or capacity. */
export type ObservabilityCompositionRequest = typeof Request.infer;
type Instance = ObservabilityCompositionRequest['instances'][number];

/** Declared capacity policies, independent of placement and source environment. Only the trust init request has prior measured evidence. */
const capacity = {
  development: { memory: '2Gi', heap: '1g', storage: '10Gi' },
  'disposable-rehearsal': { memory: '2Gi', heap: '1g', storage: '10Gi' },
  'retained-production': { memory: '4Gi', heap: '2g', storage: '100Gi' },
};
const podSecurity = {
  runAsNonRoot: true,
  runAsUser: 1000,
  runAsGroup: 1000,
  fsGroup: 1000,
  seccompProfile: { type: 'RuntimeDefault' },
};
const containerSecurity = {
  allowPrivilegeEscalation: false,
  capabilities: { drop: ['ALL'] },
};
const directory = 'infra/platform/observability';

/** App release identity retains the existing namespace-scoped ECK names and chart release defaults. */
export interface ObservabilityApplicationRelease {
  owner: string;
  chart: 'elasticsearch' | 'kibana';
  roles: ('dev' | 'prod')[];
  manifest: string;
}

/** Typed service-policy override of one existing chart-role owner; the base projection stays independently valid. */
export interface ObservabilityMonitoringRelease {
  baseOwner: string;
  owner: string;
  chart: 'kubePrometheusStack';
  roles: ('dev' | 'prod' | 'platform')[];
  manifest: string;
}
function createMonitoringRelease(
  base: ObservabilityProjectionRelease,
  instance: Instance,
): ObservabilityMonitoringRelease {
  const release = parseDocument(base.manifest);
  const spec = ['spec', 'values', 'alertmanager', 'alertmanagerSpec'];
  release.setIn([...spec, 'storage'], {
    volumeClaimTemplate: {
      spec: {
        storageClassName: 'puni-retain',
        accessModes: ['ReadWriteOnce'],
        resources: { requests: { storage: '1Gi' } },
      },
    },
  });
  release.setIn([...spec, 'persistentVolumeClaimRetentionPolicy'], {
    whenDeleted: 'Retain',
    whenScaled: 'Retain',
  });
  return {
    baseOwner: `${instance.namespace}/kube-prometheus-stack`,
    owner: `${instance.namespace}/kube-prometheus-stack`,
    chart: 'kubePrometheusStack',
    roles: instance.environment === 'dev' ? ['dev'] : ['prod', 'platform'],
    manifest: release.toString(),
  };
}

async function createElasticRelease(
  root: string,
  placement: 'local' | 'production',
  instance: Instance,
): Promise<ObservabilityApplicationRelease> {
  const release = parseDocument(
    await readFile(join(root, directory, 'elastic/base/elasticsearch.yaml'), 'utf8'),
  );
  const values = ['spec', 'values'];
  const node = [...values, 'nodeSets', 0];
  const pod = [...node, 'podTemplate', 'spec'];
  const policy = capacity[instance.policy];
  release.setIn(['metadata', 'namespace'], instance.namespace);
  release.setIn(['spec', 'dependsOn'], [{ name: 'eck-operator', namespace: 'observability' }]);
  release.setIn([...values, 'auth'], {
    fileRealm: [{ secretName: 'signal-health-users' }],
    roles: [{ secretName: 'signal-health-roles' }],
  });
  release.setIn([...pod, 'securityContext'], podSecurity);
  release.setIn([...pod, 'initContainers', 0, 'securityContext'], {
    ...containerSecurity,
    readOnlyRootFilesystem: true,
  });
  release.setIn([...pod, 'volumes', 0, 'emptyDir'], { sizeLimit: '16Mi' });
  release.setIn([...pod, 'containers', 0, 'securityContext'], containerSecurity);
  release.setIn(
    [...pod, 'containers', 0, 'env', 0, 'value'],
    `-Xms${policy.heap} -Xmx${policy.heap}`,
  );
  for (const bound of ['requests', 'limits']) {
    release.setIn([...pod, 'containers', 0, 'resources', bound, 'memory'], policy.memory);
    release.setIn([...pod, 'containers', 0, 'resources', bound, 'ephemeral-storage'], '1Gi');
  }
  release.setIn(
    [...node, 'volumeClaimTemplates', 0, 'spec', 'resources', 'requests', 'storage'],
    policy.storage,
  );
  if (placement === 'local') {
    release.setIn(
      [...node, 'config', 's3.client.default.endpoint'],
      'object-store.puni-backup.svc:9000',
    );
    release.setIn([...pod, 'initContainers', 0, 'env', 0, 'value'], 'system-roots-plus-ca');
  }
  return {
    owner: `${instance.namespace}/elasticsearch`,
    roles: [instance.environment],
    chart: 'elasticsearch',
    manifest: release.toString(),
  };
}

async function createKibanaRelease(
  root: string,
  instance: Instance,
): Promise<ObservabilityApplicationRelease> {
  const release = parseDocument(
    await readFile(join(root, directory, 'kibana/kibana.yaml'), 'utf8'),
  );
  release.setIn(['metadata', 'namespace'], instance.namespace);
  release.setIn(['spec', 'values', 'elasticsearchRef'], {
    name: 'elasticsearch',
    namespace: instance.namespace,
  });
  const pod = ['spec', 'values', 'podTemplate', 'spec'];
  release.setIn([...pod, 'securityContext'], podSecurity);
  release.setIn([...pod, 'containers', 0, 'securityContext'], containerSecurity);
  for (const bound of ['requests', 'limits'])
    release.setIn([...pod, 'containers', 0, 'resources', bound, 'ephemeral-storage'], '1Gi');
  return {
    owner: `${instance.namespace}/kibana`,
    roles: [instance.environment],
    chart: 'kibana',
    manifest: release.toString(),
  };
}

const NativeAPI = type({ apiVersion: "'v1'", kind: "'ConfigMap' | 'Service'" })
  .or({ apiVersion: "'apps/v1'", kind: "'Deployment' | 'StatefulSet'" })
  .or({ apiVersion: "'batch/v1'", kind: "'Job'" })
  .or({ apiVersion: "'monitoring.coreos.com/v1'", kind: "'ServiceMonitor'" })
  .or({ apiVersion: "'networking.k8s.io/v1'", kind: "'NetworkPolicy'" });
// Proof: removing the API intersection admitted missing/foreign API identities in native assembly negatives.
const NativeResource = type({ metadata: { name: 'string>0', namespace: 'string>0' } }).and(
  NativeAPI,
);
const nativeInventory = [
  'StatefulSet:signal-collector',
  'Service:signal-collector',
  'ServiceMonitor:signal-collector',
  'StatefulSet:signal-gateway',
  'Service:signal-gateway',
  'ServiceMonitor:signal-gateway',
  'ConfigMap:signal-metrics',
  'Deployment:signal-metrics',
  'Service:signal-metrics',
  'NetworkPolicy:signal-metrics',
  'Job:elastic-settings',
  'ConfigMap:signal-configuration',
  'ConfigMap:elastic-failure-fields',
  'ConfigMap:kibana-objects',
  'Job:kibana-objects',
].sort();

const Configuration = type({ metadata: { name: 'string' }, data: 'Record<string, string>' });
const WorkloadVolumes = type({
  spec: {
    template: {
      spec: {
        volumes: type({ name: 'string', 'configMap?': { name: 'string' } }).array(),
      },
    },
  },
});
const configurationReferences: Partial<Record<string, Record<string, string>>> = {
  'StatefulSet:signal-collector': { configuration: 'signal-configuration' },
  'StatefulSet:signal-gateway': { configuration: 'signal-configuration' },
  'Deployment:signal-metrics': { configuration: 'signal-metrics' },
  'Job:elastic-settings': {
    settings: 'signal-configuration',
    'failure-fields': 'elastic-failure-fields',
  },
  'Job:kibana-objects': { objects: 'kibana-objects' },
};
function addressConfiguration(name: string, files: Record<string, string>): string {
  const content = JSON.stringify(
    Object.keys(files)
      .sort()
      .map((filename) => [filename, files[filename]]),
  );
  return `${name}-${createHash('sha256').update(content).digest('hex')}`;
}

/** This assembly's complete native identity/API closure; the later full renderer also covers all Helm output. */
export function assertObservabilityAssemblyResources(source: string, namespace: string): void {
  const manifests = parseAllDocuments(source).map((document) => {
    // Proof: accepting duplicate YAML keys lost the malformed-YAML diagnostic in native assembly validation.
    if (document.errors.length) throw new Error('Malformed service assembly YAML');
    const manifest = NativeResource.assert(document.toJSON());
    // Proof: removing namespace equality admitted a production namespace in the dev native assembly.
    if (manifest.metadata.namespace !== namespace)
      throw new Error('Service assembly namespace differs');
    return manifest;
  });
  const names: Record<string, string> = {};
  const identities = manifests
    .map((manifest) => {
      if (manifest.kind !== 'ConfigMap') return `${manifest.kind}:${manifest.metadata.name}`;
      const configuration = Configuration.assert(manifest);
      const base = configuration.metadata.name.slice(0, -65);
      // Proof: removing the content-address guard admitted altered payload under a stale ConfigMap name.
      if (configuration.metadata.name !== addressConfiguration(base, configuration.data))
        throw new Error('Service configuration content identity differs');
      names[base] = configuration.metadata.name;
      return `ConfigMap:${base}`;
    })
    .sort();
  // Proof: removing exact inventory equality admitted missing and duplicate native resources.
  if (!isDeepStrictEqual(identities, nativeInventory))
    throw new Error('Service assembly resource closure differs');
  for (const manifest of manifests) {
    const references = configurationReferences[`${manifest.kind}:${manifest.metadata.name}`];
    if (!references) continue;
    const volumes = WorkloadVolumes.assert(manifest).spec.template.spec.volumes;
    const actual = volumes
      .flatMap((volume) => (volume.configMap ? [[volume.name, volume.configMap.name]] : []))
      .sort();
    const expected = Object.entries(references)
      .map(([volume, base]) => [volume, names[base]])
      .sort();
    // Proof: removing exact reference comparison admitted missing/foreign/duplicate references; arrays retain multiplicity.
    if (!isDeepStrictEqual(actual, expected))
      throw new Error('Service configuration reference differs');
    if (manifest.kind === 'Job') {
      const metadata = type({ metadata: { 'annotations?': 'Record<string, string>' } }).assert(
        manifest,
      ).metadata;
      // Proof: removing this policy guard admitted an immutable Job without Flux force replacement.
      if (metadata.annotations?.['kustomize.toolkit.fluxcd.io/force'] !== 'enabled')
        throw new Error('Service immutable Job refresh policy differs');
    }
  }
}

function encodeResources(manifests: object[], namespace: string): string {
  const documents = manifests.map((manifest) => parseDocument(stringify(manifest)));
  const names: Record<string, string> = {};
  for (const document of documents) {
    if (document.get('kind') !== 'ConfigMap') continue;
    const configuration = Configuration.assert(document.toJSON());
    names[configuration.metadata.name] = addressConfiguration(
      configuration.metadata.name,
      configuration.data,
    );
    document.setIn(['metadata', 'name'], names[configuration.metadata.name]);
  }
  for (const document of documents) {
    if (!['StatefulSet', 'Deployment', 'Job'].includes(String(document.get('kind')))) continue;
    const volumes = WorkloadVolumes.assert(document.toJSON()).spec.template.spec.volumes;
    for (const [index, volume] of volumes.entries()) {
      if (volume.configMap)
        document.setIn(
          ['spec', 'template', 'spec', 'volumes', index, 'configMap', 'name'],
          names[volume.configMap.name],
        );
    }
  }
  const source = documents.map((document) => document.toString()).join('---\n');
  assertObservabilityAssemblyResources(source, namespace);
  return source;
}

async function createInstance(
  root: string,
  placement: 'local' | 'production',
  instance: Instance,
  monitoringBase: ObservabilityProjectionRelease,
) {
  const inputs = observabilityInputs(placement, instance);
  const configuration = renderObservabilityConfiguration(root, inputs);
  const native: object[] = await createObservabilityWorkloads(root, instance.namespace);
  const configMap = (name: string, files: Record<string, string>) => ({
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name, namespace: instance.namespace },
    data: files,
  });
  native.push(configMap('signal-configuration', configuration));
  native.push(
    configMap('elastic-failure-fields', {
      'failure-fields.json': await readFile(
        join(root, directory, 'elastic/settings/failure-fields.json'),
        'utf8',
      ),
    }),
  );
  const setup = parseDocument(
    await readFile(join(root, directory, 'kibana/objects/job.yaml'), 'utf8'),
  );
  setup.setIn(['metadata', 'namespace'], instance.namespace);
  // Bind the single endpoint assignment; every remaining setup-program byte is shared with the retained source.
  // Proof: replacing this read with cached bytes lost distinct ENOENT and EACCES production refusals.
  const program = await readFile(join(root, directory, 'kibana/objects/apply.sh'), 'utf8');
  const assignment = 'url=https://kibana-kb-http.observability.svc:5601\n';
  // Proof: removing the single-assignment guard admitted both absent and duplicate UI endpoint assignments.
  if (program.split(assignment).length !== 2) throw new Error('Kibana setup URL binding differs');
  native.push(
    configMap('kibana-objects', {
      'apply.sh': program.replace(
        assignment,
        `url=https://kibana-kb-http.${instance.namespace}.svc:5601\n`,
      ),
      'objects.ndjson': await readFile(
        join(root, directory, 'kibana/objects/objects.ndjson'),
        'utf8',
      ),
    }),
  );
  native.push(type('object').assert(setup.toJSON()));
  return {
    ...instance,
    capacity: {
      ...capacity[instance.policy],
      alertmanagerStorage: '1Gi',
      alertmanagerClaim: 'new-unbound-unmeasured',
      trustScratch: '16Mi',
      elasticEphemeral: '1Gi',
      kibanaEphemeral: '1Gi',
      evidence:
        'declared bounds; S3 init 128Mi request previously measured; operator pods unverified',
    },
    retention: inputs.retention,
    monitoring: createMonitoringRelease(monitoringBase, instance),
    releases: [
      await createElasticRelease(root, placement, instance),
      await createKibanaRelease(root, instance),
    ],
    native: encodeResources(native, instance.namespace),
    requiredSecrets: declareObservabilitySecrets(placement),
    authority: declareObservabilityAuthority(instance),
    routes: declareObservabilityRoutes(instance),
  };
}

/** Additive assembly only: no active Flux entry, credential body, live binding or controller adoption is produced. */
export async function createObservabilityComposition(root: string, input: unknown) {
  // Proof: bypassing the closed request decoder admitted an invented observed UID as source authority.
  const request = Request(input);
  // Proof: forwarding the schema summary exposed the synthetic private request marker.
  if (request instanceof type.errors) throw new Error('Invalid observability composition request');
  // Proof: removing this placement/policy guard admitted disposable prod capacity on production placement.
  if (request.placement === 'production' && request.instances[1].policy === 'disposable-rehearsal')
    throw new Error('Rehearsal capacity cannot weaken the production candidate');
  const projection = await createObservabilityProjection(root, {
    placement: request.placement,
    instances: request.instances.map(({ environment, namespace }) => ({ environment, namespace })),
  });
  const reader = parseDocument(projection.releases[4].manifest);
  const excludes = ['spec', 'values', 'alternateConfig', 'receivers', 'filelog', 'exclude'];
  const existing = type({
    spec: { values: { alternateConfig: { receivers: { filelog: { exclude: 'string[]' } } } } },
  }).assert(reader.toJSON()).spec.values.alternateConfig.receivers.filelog.exclude;
  reader.setIn(excludes, [...existing, '/var/log/pods/observability-dev_*/*/*.log']);
  reader.setIn(
    [
      'spec',
      'values',
      'alternateConfig',
      'processors',
      'filter/platform-only',
      'logs',
      'log_record',
    ],
    [
      'resource.attributes["deployment.environment.name"] != nil',
      'resource.attributes["k8s.namespace.name"] == "observability-dev"',
    ],
  );
  const prerequisites = [
    {
      kind: 'controller-ownership',
      owner: 'observability/eck-operator',
      verified: false,
      requirement: 'observed single controller owner and ready watched namespaces',
    },
    {
      kind: 'controller-ownership',
      owner: 'observability/prometheus-controller',
      verified: false,
      requirement: 'observed ownership and reviewed handover; no automatic adoption',
    },
    {
      kind: 'retained-reader-exclusion',
      owner: 'observability/otel-collector',
      verified: false,
      requirement:
        'verify actual retained reader path exclusion and k8s.namespace.name rejection for observability-dev before dev namespace activation',
    },
  ];
  return {
    scope: 'service-source-assembly' as const,
    request,
    projection,
    instances: await Promise.all(
      request.instances.map((instance, index) =>
        createInstance(root, request.placement, instance, projection.releases[index + 2]),
      ),
    ),
    retainedReader: {
      owner: 'observability/otel-collector',
      desiredManifest: reader.toString(),
      applied: false as const,
    },
    prerequisites,
    securityConformant: false as const,
    wholeRenderParity: false as const,
    runtimeRehearsal: false as const,
    liveBinding: false as const,
    claimsBound: false as const,
    controllerHandoverExecuted: false as const,
    activationReady: false as const,
    remainingSourceValidation: [
      'namespaced discovery and five selectors',
      'default-deny and explicit required flows',
      'retained reader runtime prerequisite',
      'full pinned render/API closure and exact placement comparison',
    ],
    runtimeBlockers: [
      'effective TLS/query role authority',
      'external observer and retained Docker Grafana routes',
      'actual operator pod admission and bounded generated init/scratch',
      'current-node hostPath cost support',
      'observed ownership, claims and capacity',
    ],
  };
}
export type ObservabilityComposition = Awaited<ReturnType<typeof createObservabilityComposition>>;

/** Regenerate the complete assembly from independently validated source inputs; altered/omitted authored fields refuse. */
export async function assertObservabilityComposition(
  root: string,
  candidate: ObservabilityComposition,
): Promise<void> {
  const expected = await createObservabilityComposition(root, candidate.request);
  // Proof: removing complete equality admitted altered APIs, seccomp, claims, queues, retention, query grants, trust, prerequisites and completion claims.
  if (!isDeepStrictEqual(candidate, expected))
    throw new Error('Observability composition differs from source contract');
}

/** Selection remains a reviewable source packet; retained-reader readiness blocks dev without starting production services. */
export function selectObservabilityComposition(
  candidate: ObservabilityComposition,
  selection: readonly string[],
) {
  for (const instance of candidate.instances) {
    const owner = `${instance.namespace}/kube-prometheus-stack`;
    const bases = candidate.projection.releases.filter((release) => release.owner === owner);
    // Proof: removing this binding guard admitted foreign owner/base, duplicate base and changed monitoring override.
    if (
      bases.length !== 1 ||
      bases[0].chart !== 'kubePrometheusStack' ||
      !isDeepStrictEqual(instance.monitoring, createMonitoringRelease(bases[0], instance))
    )
      throw new Error('Service monitoring base owner or exact override differs');
  }
  const selected = selectObservabilityProjection(candidate.projection, selection);
  const instances = candidate.instances.filter((instance) =>
    selection.includes(instance.environment),
  );
  const releases: (
    | ObservabilityProjectionRelease
    | ObservabilityApplicationRelease
    | ObservabilityMonitoringRelease
  )[] = [
    ...selected.releases.map((release) => {
      const instance = instances.find((entry) => entry.monitoring.baseOwner === release.owner);
      if (instance) return instance.monitoring;
      return release.owner === candidate.retainedReader.owner
        ? { ...release, manifest: candidate.retainedReader.desiredManifest }
        : release;
    }),
    ...instances.flatMap((instance) => instance.releases),
  ];
  // Proof: removing this closure guard admitted duplicate controller prerequisites after substitution.
  if (new Set(releases.map((release) => release.owner)).size !== releases.length)
    throw new Error('Duplicate service release owner');
  return {
    scope: candidate.scope,
    instances,
    releases,
    prerequisites: candidate.prerequisites,
    activationReady: false as const,
    securityConformant: false as const,
    wholeRenderParity: false as const,
  };
}
