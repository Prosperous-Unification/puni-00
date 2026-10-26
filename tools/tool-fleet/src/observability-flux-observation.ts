import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';
import { parseAllDocuments, parseDocument } from 'yaml';

import { readCreationAttempt } from './creation-journal';
import { decodeK3dLabRecord, labNamesOf } from './k3d-lab';
import {
  executeFluxRead,
  type FluxBinding,
  type FluxPacket,
  FluxRefusal,
  readFluxBytes,
  readFluxPacket,
  refuseFlux,
  requireFluxBinding,
  writeFluxReceipt,
} from './observability-flux';
import {
  observabilityProjections,
  ObservabilityResourceProjection,
} from './observability-preflight';

const Target = type({
  labId: /^[a-z0-9](?:[a-z0-9-]{0,14}[a-z0-9])?$/,
  attemptId: /^[0-9a-f-]{36}$/,
  daemonId: 'string>0',
  markerUID: 'string>0',
  sourceUID: 'string>0',
  rootUID: 'string>0',
  timeoutMs: '0<number.integer<=300000',
  '+': 'reject',
});
const Marker = type({
  name: "'puni-cluster-platform-local'",
  namespace: "'kube-system'",
  uid: 'string>0',
  marker: "'platform-local'",
  immutable: 'true',
  labId: 'string>0',
  '+': 'reject',
});
const Source = type({
  kind: "'GitRepository'",
  namespace: "'flux-system'",
  name: "'puni-platform'",
  uid: 'string>0',
  revision: 'string>0',
  ready: 'boolean',
  generation: 'number.integer>0',
  observedGeneration: 'number.integer>=0',
  '+': 'reject',
});
const SourceDetails = type({
  digest: /^sha256:[a-f0-9]{64}$/,
  url: 'string>0',
  commit: /^[a-f0-9]{40}$/,
  secretRef: 'string>0',
  suspended: 'boolean',
  currentReady: 'boolean',
  '+': 'reject',
});
const ResourceState = type({
  uid: 'string>0',
  suspended: 'boolean',
  deleting: 'boolean',
  currentReady: 'boolean',
  health: 'string',
  phase: 'string',
  available: 'number.integer>=0',
  desired: 'number.integer>=0',
  ready: 'number.integer>=0',
  updated: 'number.integer>=0',
  complete: 'boolean',
  '+': 'reject',
});
const Resources = type({
  resources: ObservabilityResourceProjection.array(),
  states: ResourceState.array(),
  '+': 'reject',
});
const q = (field: string) => `{{if ${field}}}{{printf "%q" ${field}}}{{else}}""{{end}}`;
// Keep expressions explicit: these are numeric API fields, never text interpolated into a command.
const number = (field: string) => `{{if ${field}}}{{${field}}}{{else}}0{{end}}`;
const currentReady =
  '{{$generation := .metadata.generation}}{{$ready := false}}{{range .status.conditions}}{{if and (eq .type "Ready") (eq .status "True") (eq .observedGeneration $generation)}}{{$ready = true}}{{end}}{{end}}{{$ready}}';
/** Safe extensions to the existing closed projections; no Secret values, spec env, kubeconfig or diagnostic messages. */
export const fluxProjections = {
  marker: `{"identity":${observabilityProjections.identity},"labId":${q('(index .metadata.labels "puni.dev/lab-id")')}}`,
  source: `{"source":${observabilityProjections.source},"details":{"digest":${q('.status.artifact.digest')},"url":${q('.spec.url')},"commit":${q('.spec.ref.commit')},"secretRef":${q('.spec.secretRef.name')},"suspended":{{if .spec.suspend}}true{{else}}false{{end}},"currentReady":${currentReady}}}`,
  resources: `{"resources":${observabilityProjections.resources},"states":[{{range $i,$entry := .items}}{{if $i}},{{end}}{"uid":${q('.metadata.uid')},"suspended":{{if .spec.suspend}}true{{else}}false{{end}},"deleting":{{if .metadata.deletionTimestamp}}true{{else}}false{{end}},"currentReady":${currentReady},"health":${q('.status.health')},"phase":${q('.status.phase')},"available":${number('.status.availableNodes')},"desired":{{if eq .kind "Elasticsearch"}}${number('.status.availableNodes')}{{else if eq .kind "DaemonSet"}}${number('.status.desiredNumberScheduled')}{{else if or (eq .kind "Kibana") (eq .kind "Prometheus") (eq .kind "Alertmanager")}}${number('.spec.count')}{{else}}${number('.spec.replicas')}{{end}},"ready":{{if eq .kind "DaemonSet"}}${number('.status.numberReady')}{{else}}${number('.status.readyReplicas')}{{end}},"updated":{{if eq .kind "DaemonSet"}}${number('.status.updatedNumberScheduled')}{{else}}${number('.status.updatedReplicas')}{{end}},"complete":{{$complete := false}}{{range .status.conditions}}{{if and (eq .type "Complete") (eq .status "True")}}{{$complete = true}}{{end}}{{end}}{{$complete}}}{{end}}]}`,
};

interface ExpectedResource {
  kind: string;
  namespace: string;
  name: string;
  owner: string;
  path?: string;
  chart?: string;
  version?: string;
  sourceName?: string;
  sourceKind?: string;
  sourceNamespace?: string;
  replicas?: number;
  dependencies?: { name: string; namespace: string }[];
}
const Document = type({
  kind: 'string',
  metadata: { name: 'string', 'namespace?': 'string' },
  'spec?': 'unknown',
});
const Stage = type({
  'dependsOn?': type({ name: 'string', 'namespace?': 'string' }).array(),
  path: 'string',
  sourceRef: { kind: 'string', name: 'string', 'namespace?': 'string' },
});
const Helm = type({
  chart: {
    spec: {
      chart: 'string',
      version: 'string',
      sourceRef: { kind: 'string', name: 'string', namespace: 'string' },
    },
  },
});
function key(resource: { kind: string; namespace: string; name: string }) {
  return `${resource.kind}:${resource.namespace}:${resource.name}`;
}
/** Derive stage, native and Helm expectations from verified packet bytes; runtime children stay separate observations. */
function expectResources(packet: FluxPacket): ExpectedResource[] {
  const { receipt, files } = readFluxPacket(packet);
  function readManifest(path: string): string {
    const bytes = files.get(path);
    if (bytes === undefined) return refuseFlux('packet-file-absent');
    return bytes.toString();
  }
  const expected: ExpectedResource[] = [
    {
      kind: 'Kustomization',
      namespace: 'flux-system',
      name: 'puni-cluster',
      owner: '',
      dependencies: [],
      path: './infra/clusters/platform/local',
      sourceName: 'puni-platform',
      sourceKind: 'GitRepository',
      sourceNamespace: 'flux-system',
    },
  ];
  for (const stage of receipt.stages) {
    const manifest = parseDocument(
      readManifest(`infra/clusters/platform/local/${stage}.yaml`),
    ).toJSON() as unknown;
    const document = Document.assert(manifest);
    const spec = Stage.assert(document.spec);
    expected.push({
      kind: 'Kustomization',
      namespace: 'flux-system',
      name: stage,
      owner: 'puni-cluster',
      dependencies: (spec.dependsOn ?? []).map((dependency) => ({
        name: dependency.name,
        namespace: dependency.namespace ?? 'flux-system',
      })),
      path: spec.path,
      sourceName: spec.sourceRef.name,
      sourceKind: spec.sourceRef.kind,
      sourceNamespace: spec.sourceRef.namespace ?? 'flux-system',
    });
  }
  for (const owner of receipt.helmOwners) {
    const manifest = parseDocument(
      readManifest(`infra/platform/observability/rehearsal/releases/${owner}.yaml`),
    ).toJSON() as unknown;
    const document = Document.assert(manifest);
    const spec = Helm.assert(document.spec).chart.spec;
    expected.push({
      kind: 'HelmRelease',
      namespace: document.metadata.namespace ?? '',
      name: document.metadata.name,
      owner: 'observability',
      chart: spec.chart,
      version: spec.version,
      sourceName: spec.sourceRef.name,
      sourceKind: spec.sourceRef.kind,
      sourceNamespace: spec.sourceRef.namespace,
    });
  }
  for (const namespace of ['observability', 'observability-dev']) {
    const bytes = files.get(`infra/platform/observability/rehearsal/${namespace}-native.yaml`);
    if (bytes === undefined) return refuseFlux('packet-native-absent');
    for (const manifest of parseAllDocuments(bytes.toString())) {
      const document = Document.assert(manifest.toJSON() as unknown);
      if (['Deployment', 'StatefulSet', 'Job'].includes(document.kind)) {
        const spec = type({ 'replicas?': 'number.integer>0' }).assert(document.spec);
        expected.push({
          kind: document.kind,
          namespace,
          name: document.metadata.name,
          owner: 'observability',
          ...(document.kind === 'Job' ? {} : { replicas: spec.replicas ?? 1 }),
        });
      }
    }
    for (const [kind, name] of [
      ['Elasticsearch', 'elasticsearch'],
      ['Kibana', 'kibana'],
      ['Prometheus', 'kps-prometheus'],
      ['Alertmanager', 'kps-alertmanager'],
    ])
      expected.push({ kind, name, namespace, owner: 'helm', replicas: 1 });
  }
  for (const [kind, name, owner] of [
    ['StatefulSet', 'elastic-operator', 'eck-operator'],
    ['Deployment', 'kps-operator', 'prometheus-controller'],
    ['DaemonSet', 'otel-collector-agent', 'otel-collector'],
    ['Deployment', 'kube-prometheus-stack-kube-state-metrics', 'kube-prometheus-stack'],
    ['DaemonSet', 'kube-prometheus-stack-prometheus-node-exporter', 'kube-prometheus-stack'],
  ])
    expected.push({ kind, name, namespace: 'observability', owner: `helm:${owner}` });
  return expected;
}

/**
 * Observe a pre-existing attributed disposable lab only. Journal/label/name matches establish read-only
 * provenance, not creation ownership. No apply, reconcile annotation, Secret read, or capacity mutation runs.
 * A single deadline bounds all reads/retries; a matching controller alone cannot satisfy the source graph.
 */
export async function observeFluxReconciliation(
  root: string,
  packet: FluxPacket,
  binding: FluxBinding,
  input: unknown,
  receiptPath: string,
  execute: typeof executeFluxRead = executeFluxRead,
) {
  requireFluxBinding(binding, packet);
  const target = Target(input);
  if (target instanceof type.errors) return refuseFlux('target-malformed');
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + target.timeoutMs;
  const operation = {
    schemaVersion: 1,
    operationId: randomUUID(),
    scope: 'read-only-observability-reconciliation',
    startedAt,
    binding,
    target,
    resourceOwnership: 'unproven',
    capacityAdmission: 'unobserved',
    bootstrapHandoffExecuted: false,
    runtimeAcceptance: false,
    liveBinding: false,
  };
  try {
    const state = join(root, '.puni/fleet-labs/k3d', target.labId);
    const lab = decodeK3dLabRecord((await readFluxBytes(join(state, 'lab.json'))).toString());
    const selected = lab.clusters.find((candidate) => candidate.role === 'platform');
    if (selected === undefined) return refuseFlux('target-mismatch');
    const cluster = selected;
    if (
      lab.labId !== target.labId ||
      lab.profile === 'app' ||
      cluster.name !== labNamesOf(target.labId).platform ||
      cluster.context !== `k3d-${cluster.name}` ||
      cluster.clusterId !== 'platform-local'
    )
      return refuseFlux('target-mismatch');
    // Proof: bypassing the existing journal read let an absent creation attempt reach an observed receipt.
    const journal = await readCreationAttempt(
      join(root, '.puni/fleet-labs/k3d/.attempts', target.labId),
      { labId: target.labId, attemptId: target.attemptId, daemonId: target.daemonId },
    );
    if (journal.state !== 'ready') return refuseFlux('target-journal-unready');
    const daemon = (await execute(['docker', 'info', '--format', '{{.ID}}'], deadline))
      .toString()
      .trim();
    // Proof: removing the comparison accepted the foreign-daemon observation.
    if (daemon !== target.daemonId) return refuseFlux('target-daemon-mismatch');
    await readFluxBytes(cluster.kubeconfig);
    async function kubernetes(
      resource: string,
      projection: string,
      namespace?: string,
    ): Promise<unknown> {
      const bytes = await execute(
        [
          join(readFluxPacket(packet).tools, 'kubectl'),
          '--kubeconfig',
          cluster.kubeconfig,
          '--context',
          cluster.context,
          `--request-timeout=${String(Math.max(1, deadline - Date.now()))}ms`,
          'get',
          resource,
          ...(namespace === undefined ? ['--all-namespaces'] : ['--namespace', namespace]),
          '-o',
          `go-template=${projection}`,
        ],
        deadline,
      );
      try {
        return JSON.parse(bytes.toString()) as unknown;
      } catch {
        return refuseFlux('observation-malformed');
      }
    }
    const markerEnvelope = type({ identity: 'object', labId: 'string', '+': 'reject' })(
      await kubernetes(
        'configmap/puni-cluster-platform-local',
        fluxProjections.marker,
        'kube-system',
      ),
    );
    if (markerEnvelope instanceof type.errors) return refuseFlux('target-mismatch');
    const marker = Marker({ ...markerEnvelope.identity, labId: markerEnvelope.labId });
    // Proof: removing this check accepted the platform-production marker as the disposable target.
    if (
      marker instanceof type.errors ||
      marker.uid !== target.markerUID ||
      marker.labId !== target.labId
    )
      return refuseFlux('target-mismatch');
    const expected = expectResources(packet);
    let pending = 'reconciliation-unready';
    const initialUIDs = new Map<string, string>();
    while (Date.now() < deadline) {
      const envelope = type({ source: Source, details: SourceDetails, '+': 'reject' })(
        await kubernetes(
          'gitrepository.source.toolkit.fluxcd.io/puni-platform',
          fluxProjections.source,
          'flux-system',
        ),
      );
      if (envelope instanceof type.errors) return refuseFlux('source-observation-malformed');
      const source = envelope.source;
      const details = envelope.details;
      // Proof: bypassing binding identity accepted the observed foreign repository URL.
      if (
        source.uid !== target.sourceUID ||
        details.commit !== binding.artifactCommit ||
        createHash('sha256').update(details.url).digest('hex') !==
          binding.repositoryIdentitySHA256 ||
        details.secretRef !== 'puni-platform-auth'
      )
        return refuseFlux('source-observation-mismatch');
      const revision = source.revision;
      const resources = Resources(
        await kubernetes(
          'kustomizations.kustomize.toolkit.fluxcd.io,helmreleases.helm.toolkit.fluxcd.io,deployments.apps,statefulsets.apps,daemonsets.apps,jobs.batch,elasticsearches.elasticsearch.k8s.elastic.co,kibanas.kibana.k8s.elastic.co,prometheuses.monitoring.coreos.com,alertmanagers.monitoring.coreos.com',
          fluxProjections.resources,
        ),
      );
      if (resources instanceof type.errors) return refuseFlux('resource-observation-malformed');
      const indexed = new Map(resources.resources.map((resource) => [key(resource), resource]));
      const states = new Map(resources.states.map((status) => [status.uid, status]));
      if (indexed.size !== resources.resources.length || states.size !== resources.states.length)
        return refuseFlux('resource-observation-duplicate');
      const observed: typeof resources.resources = [];
      // Proof: bypassing current source readiness accepted stale generation and stale Ready-condition fixtures.
      const sourcePending =
        !source.ready ||
        !details.currentReady ||
        details.suspended ||
        source.generation !== source.observedGeneration ||
        !new RegExp(`^(?:[^@]+@)?sha1:${binding.artifactCommit}$`).test(revision)
          ? 'source-unready-or-stale'
          : '';
      pending = sourcePending;
      for (const required of expected) {
        const resource = indexed.get(key(required));
        const status = resource === undefined ? undefined : states.get(resource.uid);
        if (resource === undefined || status === undefined) {
          pending = 'resource-absent';
          continue;
        }
        observed.push(resource);
        // Proof: removing the root UID check accepted a replacement root.
        if (required.name === 'puni-cluster' && resource.uid !== target.rootUID)
          return refuseFlux('root-uid-mismatch');
        // Proof: bypassing current resource state accepted the suspended stage.
        if (
          status.deleting ||
          status.suspended ||
          (required.kind !== 'Job' && resource.generation !== resource.observedGeneration)
        ) {
          pending = 'resource-unready-or-stale';
          continue;
        }
        if (required.kind === 'Kustomization' || required.kind === 'HelmRelease') {
          // Proof: bypassing this graph/ready boundary accepted the foreign native Helm source.
          if (
            !resource.ready ||
            !status.currentReady ||
            resource.owner !== required.owner ||
            (required.owner !== '' && resource.ownerNamespace !== 'flux-system') ||
            resource.sourceKind !== required.sourceKind ||
            resource.sourceName !== required.sourceName ||
            resource.sourceNamespace !== required.sourceNamespace
          ) {
            pending = 'reconciliation-owner-or-readiness-mismatch';
            continue;
          }
          // Proof: removing this refusal accepted an applied stage revision different from the fetched source.
          if (
            required.kind === 'Kustomization' &&
            (resource.path !== required.path ||
              resource.revision !== revision ||
              !isDeepStrictEqual(resource.dependencies, required.dependencies))
          )
            pending = 'stage-revision-or-path-mismatch';
          // Proof: removing this refusal accepted attempted chart version in place of deployed history.
          if (
            required.kind === 'HelmRelease' &&
            (resource.chart !== required.chart ||
              resource.revision !== required.version ||
              resource.releaseName === '' ||
              resource.releaseNamespace !== required.namespace)
          )
            pending = 'helm-history-mismatch';
        } else {
          if (
            required.owner === 'observability' &&
            (resource.owner !== 'observability' || resource.ownerNamespace !== 'flux-system')
          )
            pending = 'workload-owner-mismatch';
          if (required.owner.startsWith('helm')) {
            const releaseName =
              required.owner === 'helm'
                ? required.kind === 'Elasticsearch'
                  ? 'elasticsearch'
                  : required.kind === 'Kibana'
                    ? 'kibana'
                    : 'kube-prometheus-stack'
                : required.owner.slice(5);
            const release = indexed.get(`HelmRelease:${required.namespace}:${releaseName}`);
            if (
              release === undefined ||
              resource.owner !== `helm:${release.releaseName}` ||
              resource.ownerNamespace !== release.releaseNamespace
            )
              pending = 'workload-owner-mismatch';
          }
          if (required.kind === 'Elasticsearch' || required.kind === 'Kibana') {
            // Proof: bypassing ECK health accepted a red Elasticsearch fixture.
            if (status.health !== 'green' || status.available < (required.replicas ?? 1))
              pending = 'eck-unready';
          } else if (required.kind === 'Job') {
            if (!status.complete) pending = 'job-incomplete';
            // Proof: bypassing workload readiness accepted an unready signal collector.
          } else if (
            !resource.ready ||
            (['Deployment', 'StatefulSet', 'DaemonSet'].includes(required.kind) &&
              (status.desired <= 0 ||
                status.ready !== status.desired ||
                status.updated !== status.desired ||
                (required.replicas !== undefined && status.desired !== required.replicas)))
          )
            pending = 'workload-unready';
          if (['Elasticsearch', 'Kibana', 'Prometheus', 'Alertmanager'].includes(required.kind)) {
            const children = resources.resources.filter(
              (child) =>
                child.ownerUID === resource.uid &&
                ['StatefulSet', 'Deployment'].includes(child.kind),
            );
            // Proof: bypassing child readiness accepted an unready controller-created StatefulSet.
            if (
              children.length === 0 ||
              children.some((child) => {
                const childState = states.get(child.uid);
                return (
                  childState === undefined ||
                  childState.deleting ||
                  child.generation !== child.observedGeneration ||
                  !child.ready ||
                  childState.desired <= 0 ||
                  childState.ready !== childState.desired ||
                  childState.updated !== childState.desired
                );
              })
            )
              pending = 'controller-child-unready';
            observed.push(...children);
          }
        }
      }
      for (const resource of observed) {
        const prior = initialUIDs.get(key(resource));
        // Proof: removing replacement refusal lost its distinct category and waited until source-stale refusal.
        if (prior !== undefined && prior !== resource.uid)
          return refuseFlux('resource-identity-changed');
        initialUIDs.set(key(resource), resource.uid);
      }
      if (sourcePending !== '') pending = sourcePending;
      if (pending === '') {
        const sourceAgain = await kubernetes(
          'gitrepository.source.toolkit.fluxcd.io/puni-platform',
          fluxProjections.source,
          'flux-system',
        );
        const markerAgain = await kubernetes(
          'configmap/puni-cluster-platform-local',
          fluxProjections.marker,
          'kube-system',
        );
        const daemonAgain = (await execute(['docker', 'info', '--format', '{{.ID}}'], deadline))
          .toString()
          .trim();
        // Proof: removing the final reread comparison accepted a changed source artifact digest.
        if (
          !isDeepStrictEqual(sourceAgain, envelope) ||
          !isDeepStrictEqual(markerAgain, markerEnvelope) ||
          daemonAgain !== daemon
        )
          return refuseFlux('observation-changed');
        if (Date.now() >= deadline) return refuseFlux('deadline-expired');
        const receipt = {
          ...operation,
          completedAt: new Date().toISOString(),
          status: 'observed',
          marker,
          cluster: { name: cluster.name, context: cluster.context },
          daemonId: daemon,
          source: { ...source, digest: details.digest },
          resources: observed,
          conditions: resources.states.filter((status) =>
            observed.some((resource) => resource.uid === status.uid),
          ),
          acceptance: 'source-and-reconciliation-observation-only',
        };
        await writeFluxReceipt(receiptPath, receipt);
        return receipt;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(100, Math.max(0, deadline - Date.now()))),
      );
    }
    return refuseFlux(pending);
  } catch (failure) {
    const reason = failure instanceof FluxRefusal ? failure.message : 'observation-refused';
    if (reason !== 'receipt-occupied')
      await writeFluxReceipt(receiptPath, {
        ...operation,
        completedAt: new Date().toISOString(),
        status: 'refused',
        reason,
      });
    return refuseFlux(reason);
  }
}
