import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';

import { type } from 'arktype';
import { parseAllDocuments } from 'yaml';

import { type DiscoveryCommand, type RunDiscoveryCommand, runDiscoveryCommand } from './discover';
import { readSshTransport, renderRemoteCommandArguments, type SshTransport } from './ssh-transport';

const name = /^[a-zA-Z0-9][a-zA-Z0-9._:/@-]*$/;
const uid = 'string>0';
const sha = /^[a-f0-9]{40}$/;
const hash = /^[a-f0-9]{64}$/;
const ResourcePin = type({
  ownerUID: 'string',
  path: 'string',
  kind: name,
  name,
  namespace: 'string',
  uid: 'string',
  owner: 'string',
  ownerNamespace: 'string',
  requiredRevision: 'string',
  '+': 'reject',
});
const SecretPin = type({ name, namespace: name, uid: 'string', keys: 'string[]', '+': 'reject' });
const ClaimPin = type({
  name,
  namespace: name,
  uid: 'string',
  volume: 'string',
  volumeUID: 'string',
  '+': 'reject',
});
const NodePin = type({
  name,
  uid: 'string',
  machineID: 'string',
  reserveMiB: 'number.integer>=0',
  reserveCPUMilli: 'number.integer>=0',
  futureAdditionalCPUMilli: 'number.integer>=0',
  futureAdditionalMiB: 'number.integer>=0',
  '+': 'reject',
});
const Candidate = type({
  kind: "'Deployment'|'StatefulSet'",
  instance: name,
  namespace: name,
  name,
  node: name,
  memoryMiB: 'number.integer>0',
  cpuMilli: 'number.integer>0',
  storageMiB: 'number.integer>=0',
  ephemeralMiB: 'number.integer>=0',
  claims: type({
    name,
    uid: 'string',
    volume: 'string',
    volumeUID: 'string',
    '+': 'reject',
  }).array(),
  existingPodUID: 'string',
  artifactPath: 'string>0',
  artifactSHA256: hash,
  '+': 'reject',
});
const Request = type({
  schemaVersion: '1',
  candidateRevision: sha,
  fleetId: name,
  targetMarker: name,
  identityUID: 'string',
  context: name,
  controllerContext: name,
  phase: "'inventory'|'cutover'",
  resources: ResourcePin.array(),
  source: { name, uid: 'string', requiredRevision: 'string', '+': 'reject' },
  secrets: SecretPin.array(),
  claims: ClaimPin.array(),
  nodes: NodePin.array(),
  candidate: Candidate.array(),
  docker: {
    host: name,
    node: name,
    retainedContainers: 'string[]',
    retainedVolumes: 'string[]',
    volumePins: type({
      name,
      createdAt: 'string',
      mountpoint: 'string',
      project: 'string',
      '+': 'reject',
    }).array(),
    pins: type({ name, id: 'string', imageID: 'string', project: 'string', '+': 'reject' }).array(),
    '+': 'reject',
  },
  storage: {
    node: name,
    path: 'string',
    storageClass: 'string',
    provisioner: 'string',
    headroomMiB: 'number.integer>=0',
    '+': 'reject',
  },
  rollbackPath: 'string',
  rollbackSHA256: 'string',
  rollbackOperationId: 'string',
  maxAgeMs: 'number.integer>0',
  timeoutMs: 'number.integer>0',
  '+': 'reject',
});
const Identity = type({ name, uid, marker: name, immutable: 'boolean', '+': 'reject' });
const Resource = type({
  kind: name,
  name,
  namespace: 'string',
  uid,
  owner: 'string',
  ownerNamespace: 'string',
  generation: 'number.integer>=0',
  observedGeneration: 'number.integer>=0',
  ready: 'boolean',
  revision: 'string',
  chart: 'string',
  controllerEnabled: 'boolean',
  ownerUID: 'string',
  path: 'string',
  sourceName: 'string',
  dependencies: type({ name, namespace: 'string', '+': 'reject' }).array(),
  '+': 'reject',
});
const Source = type({
  name,
  uid,
  revision: 'string>0',
  ready: 'boolean',
  generation: 'number.integer>=0',
  observedGeneration: 'number.integer>=0',
  '+': 'reject',
});
const Node = type({
  name,
  uid,
  machineID: uid,
  labels: type({ '[string]': 'string' }),
  allocatable: uid,
  allocatableCPU: 'string',
  schedulable: 'boolean',
  pressure: 'string',
  ready: 'boolean',
  '+': 'reject',
});
const Pod = type({
  uid,
  name,
  namespace: name,
  node: 'string',
  phase: 'string>0',
  ready: 'boolean',
  restartableInit: 'boolean',
  requests: 'string[]',
  limits: 'string[]',
  cpuRequests: 'string[]',
  cpuLimits: 'string[]',
  initCPUs: 'string[]',
  initCPULimits: 'string[]',
  overheadCPU: 'string',
  initRequests: 'string[]',
  initLimits: 'string[]',
  overhead: 'string',
  ownerUID: 'string',
  images: 'string[]',
  imageIDs: 'string[]',
  '+': 'reject',
});
const Secret = type({ name, namespace: name, uid, keys: 'string[]', '+': 'reject' });
const Claim = type({
  name,
  namespace: name,
  uid,
  volume: 'string',
  phase: 'string',
  storageClass: 'string',
  requested: 'string',
  capacity: 'string',
  '+': 'reject',
});
const Volume = type({
  name,
  uid,
  claimUID: 'string',
  policy: 'string',
  storageClass: 'string',
  path: 'string',
  nodes: 'string[]',
  '+': 'reject',
});
const StorageClass = type({ name, provisioner: 'string>0', bindingMode: 'string', '+': 'reject' });
const Docker = type({
  filesystem: type({
    state: "'observed'",
    path: 'string>0',
    device: 'string>0',
    availableBytes: 'number.integer>=0',
    totalBytes: 'number.integer>0',
    claimPaths: type({ path: 'string>0', device: 'string>0', '+': 'reject' }).array(),
    '+': 'reject',
  }).or({ state: "'unbound'", '+': 'reject' }),
  machineID: uid,
  containers: type({
    id: uid,
    name,
    memoryBytes: 'number.integer>=0',
    nanoCPUs: 'number.integer>=0',
    cpuQuota: 'number.integer',
    cpuPeriod: 'number.integer>=0',
    running: 'boolean',
    image: 'string>0',
    imageID: 'string>0',
    project: 'string',
    mounts: type({
      source: 'string>0',
      target: 'string>0',
      readOnly: 'boolean',
      '+': 'reject',
    }).array(),
    volumes: 'string[]',
    '+': 'reject',
  }).array(),
  volumes: type({
    name,
    mountpoint: 'string>0',
    createdAt: 'string>0',
    project: 'string',
    device: 'string>0',
    availableBytes: 'number.integer>=0',
    '+': 'reject',
  }).array(),
  '+': 'reject',
});
const Rollback = type({
  operationId: name,
  candidateRevision: sha,
  capturedAt: 'string>0',
  claimUIDs: 'string[]',
  dockerVolumes: 'string[]',
  '+': 'reject',
});

/** Reviewed expectations are never substituted for observed target facts. Inventory may leave pins empty. */
export type ObservabilityPreflightRequest = typeof Request.infer;

/** Safe refusal intentionally has no subprocess body, parser cause, or credential-bearing input. */
export class ObservabilityPreflightRefusal extends Error {
  public constructor(
    public readonly reason: string,
    detail = '',
  ) {
    super(`observability preflight: ${reason}${detail}`);
  }
}

function refusePreflight(reason: string): never {
  throw new ObservabilityPreflightRefusal(reason);
}

function decodeProjection<Output>(schema: type.Any<Output>, input: unknown): Output {
  const parsed = schema(input);
  // Proof: removing this refusal failed `successful Secret projection with unexpected private fields refuses without exposing the body` with its named fault.
  if (parsed instanceof type.errors) refusePreflight('projection-malformed');
  // Boundary: ArkType validated this output; TypeScript cannot reduce generic distillation.
  return parsed as Output;
}

function parseProjectionJSON(source: string): unknown {
  try {
    return JSON.parse(source) as unknown;
  } catch {
    // Proof: forwarding raw parse input failed `Secret malformed diagnostics never expose plaintext or encoded private markers` with its named fault.
    return refusePreflight('projection-malformed');
  }
}

function isFresh(observedAt: string, now: number, maxAgeMs: number): boolean {
  const observed = Date.parse(observedAt);
  return Number.isFinite(observed) && observed <= now && now - observed <= maxAgeMs;
}

/** Decode without exposing supplied request contents in diagnostics. */
export function decodeObservabilityPreflightRequest(input: unknown): ObservabilityPreflightRequest {
  // Proof: removing the clone failed `mutating the caller request during observation cannot rewrite the bound revision`.
  const request = structuredClone(decodeProjection(Request, input));
  // Proof: removing this refusal failed `unbounded freshness budget refuses` with its named fault.
  if (request.maxAgeMs > 60_000 || request.timeoutMs > 30_000) refusePreflight('unbounded-request');
  return request;
}

const quoteField = (field: string) => `{{printf "%q" ${field}}}`;
const projectOptionalField = (field: string) =>
  `{{if ${field}}}${quoteField(field)}{{else}}""{{end}}`;
const metadata = `"name":${quoteField('.metadata.name')},"uid":${quoteField('.metadata.uid')}`;
const ownerUID =
  '"ownerUID":"{{range .metadata.ownerReferences}}{{if .controller}}{{.uid}}{{end}}{{end}}"';
const namespace = `"namespace":${projectOptionalField('.metadata.namespace')}`;
const ready =
  '{{ $ready := false }}{{range .status.conditions}}{{if and (or (eq .type "Ready") (eq .type "Established") (eq .type "Available")) (eq .status "True")}}{{$ready = true}}{{end}}{{end}}{{if eq .kind "Namespace"}}{{if eq .status.phase "Active"}}{{$ready = true}}{{end}}{{end}}{{if or (eq .kind "Deployment") (eq .kind "StatefulSet") (eq .kind "ReplicaSet")}}{{$ready = false}}{{if and .spec.replicas .status.readyReplicas}}{{if eq .spec.replicas .status.readyReplicas}}{{$ready = true}}{{end}}{{end}}{{end}}{{if eq .kind "DaemonSet"}}{{$ready = false}}{{if and .status.desiredNumberScheduled .status.numberReady}}{{if eq .status.desiredNumberScheduled .status.numberReady}}{{$ready = true}}{{end}}{{end}}{{end}}{{$ready}}';
const projectList = (body: string) =>
  `[{{range $i,$entry := .items}}{{if $i}},{{end}}${body}{{end}}]`;

/** Closed safe projections used by the production kubectl adapter; Secret values are never selected. */
export const observabilityProjections = {
  storageClasses: projectList(
    `{"name":${quoteField('.metadata.name')},"provisioner":${quoteField('.provisioner')},"bindingMode":${projectOptionalField('.volumeBindingMode')}}`,
  ),
  identity: `{${metadata},"marker":${quoteField('(index .data "cluster-id")')},"immutable":{{if .immutable}}true{{else}}false{{end}}}`,
  source: `{${metadata},"revision":${quoteField('.status.artifact.revision')},"ready":${ready},"generation":{{.metadata.generation}},"observedGeneration":{{if .status.observedGeneration}}{{.status.observedGeneration}}{{else}}0{{end}}}`,
  resources: projectList(
    `{${metadata},${namespace},"kind":${quoteField('.kind')},"owner":{{if and .metadata.labels (index .metadata.labels "kustomize.toolkit.fluxcd.io/name")}}${quoteField('(index .metadata.labels "kustomize.toolkit.fluxcd.io/name")')}{{else if and .metadata.annotations (index .metadata.annotations "meta.helm.sh/release-name")}}{{printf "%q" (printf "helm:%s" (index .metadata.annotations "meta.helm.sh/release-name"))}}{{else}}""{{end}},"ownerNamespace":{{if and .metadata.labels (index .metadata.labels "kustomize.toolkit.fluxcd.io/namespace")}}${quoteField('(index .metadata.labels "kustomize.toolkit.fluxcd.io/namespace")')}{{else}}{{if .metadata.annotations}}${projectOptionalField('(index .metadata.annotations "meta.helm.sh/release-namespace")')}{{else}}""{{end}}{{end}},"generation":{{if .metadata.generation}}{{.metadata.generation}}{{else}}0{{end}},"observedGeneration":{{if .status.observedGeneration}}{{.status.observedGeneration}}{{else}}0{{end}},"ready":${ready},"revision":{{if eq .kind "HelmRelease"}}${projectOptionalField('.status.lastAttemptedRevision')}{{else}}${projectOptionalField('.status.lastAppliedRevision')}{{end}},"path":{{if eq .kind "Kustomization"}}${projectOptionalField('.spec.path')}{{else}}""{{end}},"sourceName":{{if eq .kind "Kustomization"}}${projectOptionalField('.spec.sourceRef.name')}{{else}}""{{end}},"dependencies":[{{$namespace := .metadata.namespace}}{{range $i,$dependency := .spec.dependsOn}}{{if $i}},{{end}}{"name":${quoteField('.name')},"namespace":{{if .namespace}}${quoteField('.namespace')}{{else}}{{printf "%q" $namespace}}{{end}}}{{end}}],"chart":{{if eq .kind "HelmRelease"}}${projectOptionalField('.spec.chart.spec.chart')}{{else}}""{{end}},${ownerUID},"controllerEnabled":{{if eq .kind "HelmRelease"}}{{if eq .spec.chart.spec.chart "eck-operator"}}true{{else if eq .spec.chart.spec.chart "kube-prometheus-stack"}}{{if eq .spec.values.prometheusOperator.enabled false}}false{{else}}true{{end}}{{else}}false{{end}}{{else}}false{{end}}}`,
  ),
  nodes: projectList(
    `{${metadata},"machineID":${quoteField('.status.nodeInfo.machineID')},"labels":{ {{$first := true}}{{range $key,$value := .metadata.labels}}{{if not $first}},{{end}}{{$first = false}}{{printf "%q" $key}}:{{printf "%q" $value}}{{end}} },"allocatable":${quoteField('.status.allocatable.memory')},"allocatableCPU":${projectOptionalField('.status.allocatable.cpu')},"schedulable":{{if .spec.unschedulable}}false{{else}}true{{end}},"pressure":{{$memory := false}}{{$disk := false}}{{$pid := false}}{{range .status.conditions}}{{if eq .status "False"}}{{if eq .type "MemoryPressure"}}{{$memory = true}}{{end}}{{if eq .type "DiskPressure"}}{{$disk = true}}{{end}}{{if eq .type "PIDPressure"}}{{$pid = true}}{{end}}{{end}}{{end}}{{if and $memory $disk $pid}}"clear"{{else}}"unknown-or-pressured"{{end}},"ready":${ready}}`,
  ),
  pods: projectList(
    `{${metadata},${namespace},"node":${projectOptionalField('.spec.nodeName')},"phase":${quoteField('.status.phase')},"ready":${ready},"restartableInit":{{$restartable := false}}{{range .spec.initContainers}}{{if eq .restartPolicy "Always"}}{{$restartable = true}}{{end}}{{end}}{{$restartable}},"requests":[{{range $i,$c := .spec.containers}}{{if $i}},{{end}}${projectOptionalField('.resources.requests.memory')}{{end}}],"limits":[{{range $i,$c := .spec.containers}}{{if $i}},{{end}}${projectOptionalField('.resources.limits.memory')}{{end}}],"cpuRequests":[{{range $i,$c := .spec.containers}}{{if $i}},{{end}}${projectOptionalField('.resources.requests.cpu')}{{end}}],"cpuLimits":[{{range $i,$c := .spec.containers}}{{if $i}},{{end}}${projectOptionalField('.resources.limits.cpu')}{{end}}],"initCPUs":[{{range $i,$c := .spec.initContainers}}{{if $i}},{{end}}{{if .resources.requests.cpu}}${quoteField('.resources.requests.cpu')}{{else}}""{{end}}{{end}}],"initCPULimits":[{{range $i,$c := .spec.initContainers}}{{if $i}},{{end}}${projectOptionalField('.resources.limits.cpu')}{{end}}],"overheadCPU":{{if .spec.overhead.cpu}}${quoteField('.spec.overhead.cpu')}{{else}}"0"{{end}},"initLimits":[{{range $i,$c := .spec.initContainers}}{{if $i}},{{end}}${projectOptionalField('.resources.limits.memory')}{{end}}],"initRequests":[{{range $i,$c := .spec.initContainers}}{{if $i}},{{end}}${projectOptionalField('.resources.requests.memory')}{{end}}],${ownerUID},"images":[{{range $i,$c := .spec.containers}}{{if $i}},{{end}}${quoteField('.image')}{{end}}],"imageIDs":[{{range $i,$c := .status.containerStatuses}}{{if $i}},{{end}}${quoteField('.imageID')}{{end}}],"overhead":{{if .spec.overhead.memory}}${quoteField('.spec.overhead.memory')}{{else}}"0"{{end}}}`,
  ),
  secrets: `{${metadata},${namespace},"keys":[{{$first := true}}{{range $key,$value := .data}}{{if not $first}},{{end}}{{$first = false}}{{printf "%q" $key}}{{end}}]}`,
  claims: projectList(
    `{${metadata},${namespace},"volume":${projectOptionalField('.spec.volumeName')},"phase":${projectOptionalField('.status.phase')},"storageClass":${projectOptionalField('.spec.storageClassName')},"requested":${projectOptionalField('.spec.resources.requests.storage')},"capacity":${projectOptionalField('.status.capacity.storage')}}`,
  ),
  volumes: projectList(
    `{${metadata},"claimUID":${projectOptionalField('.spec.claimRef.uid')},"policy":${quoteField('.spec.persistentVolumeReclaimPolicy')},"storageClass":${projectOptionalField('.spec.storageClassName')},"path":{{if .spec.local.path}}${quoteField('.spec.local.path')}{{else}}${projectOptionalField('.spec.hostPath.path')}{{end}},"nodes":[{{$first := true}}{{range .spec.nodeAffinity.required.nodeSelectorTerms}}{{range .matchExpressions}}{{if eq .key "kubernetes.io/hostname"}}{{range .values}}{{if not $first}},{{end}}{{$first = false}}{{printf "%q" .}}{{end}}{{end}}{{end}}{{end}}]}`,
  ),
};

const dockerScript = `import json,subprocess,pathlib,os

def run(argv):
 p=subprocess.run(argv,check=True,capture_output=True,text=True,timeout=10)
 return p.stdout

ids=run(['docker','ps','-aq']).split()
containers=[]
for identity in ids:
 projected=run(['docker','inspect','--format','{"id":{{json .Id}},"name":{{json .Name}},"memoryBytes":{{json .HostConfig.Memory}},"nanoCPUs":{{json .HostConfig.NanoCpus}},"cpuQuota":{{json .HostConfig.CpuQuota}},"cpuPeriod":{{json .HostConfig.CpuPeriod}},"running":{{json .State.Running}},"image":{{json .Config.Image}},"imageID":{{json .Image}},"project":{{if .Config.Labels}}{{json (index .Config.Labels "com.docker.compose.project")}}{{else}}""{{end}},"mounts":[{{range $i,$m := .Mounts}}{{if $i}},{{end}}{"source":{{json $m.Source}},"target":{{json $m.Destination}},"readOnly":{{not $m.RW}}}{{end}}],"volumes":[{{range $i,$m := .Mounts}}{{if $i}},{{end}}{"type":{{json $m.Type}},"name":{{json $m.Name}}}{{end}}]}',identity])
 container=json.loads(projected)
 container['name']=container['name'].removeprefix('/')
 if container['project'] is None: container['project']=''
 container['volumes']=[mount['name'] for mount in container['volumes'] if mount['type']=='volume']
 containers.append(container)
volumes=[]
for volume in run(['docker','volume','ls','-q']).split():
 volume_projection=json.loads(run(['docker','volume','inspect','--format','{"name":{{json .Name}},"mountpoint":{{json .Mountpoint}},"createdAt":{{json .CreatedAt}},"project":{{if .Labels}}{{json (index .Labels "com.docker.compose.project")}}{{else}}""{{end}}}',volume]))
 if volume_projection['project'] is None: volume_projection['project']=''
 volume_projection['device']=str(os.stat(volume_projection['mountpoint']).st_dev)
 fs=os.statvfs(volume_projection['mountpoint'])
 volume_projection['availableBytes']=fs.f_bavail*fs.f_frsize
 volumes.append(volume_projection)
binding=json.loads(__STORAGE_BINDING__)
filesystem={'state':'unbound'}
if binding['path']:
 fs=os.statvfs(binding['path'])
 filesystem={'state':'observed','path':binding['path'],'device':str(os.stat(binding['path']).st_dev),'availableBytes':fs.f_bavail*fs.f_frsize,'totalBytes':fs.f_blocks*fs.f_frsize,'claimPaths':[{'path':path,'device':str(os.stat(path).st_dev)} for path in binding['claimPaths']]}
print(json.dumps({'filesystem':filesystem,'machineID':pathlib.Path('/etc/machine-id').read_text().strip(),'containers':containers,'volumes':volumes}))`;

/** Fixed read-only Docker projection; no Env, credentials, mounts' contents or arbitrary remote command. */
export function buildObservabilityDockerCommand(
  transport: SshTransport,
  host: string,
  timeoutMs: number,
  storage: { readonly path: string; readonly claimPaths: readonly string[] },
): DiscoveryCommand {
  const program = Buffer.from(
    dockerScript.replace('__STORAGE_BINDING__', JSON.stringify(JSON.stringify(storage))),
  ).toString('base64');
  return {
    source: `ssh-facts:${host}`,
    executable: 'ssh',
    arguments: renderRemoteCommandArguments(
      transport,
      host,
      `python3 -c 'import base64; exec(base64.b64decode("${program}"))'`,
      Math.max(1, Math.ceil(timeoutMs / 1000)),
    ),
    timeoutMs,
  };
}

function readMemoryMiB(quantity: string): number {
  const match = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|K|M|G|T)?$/.exec(quantity);
  // Proof: removing this refusal failed `unknown memory quantity refuses` with its named fault.
  if (match === null) refusePreflight('memory-unknown');
  const factors: Record<string, number> = {
    '': 1 / 1048576,
    Ki: 1 / 1024,
    Mi: 1,
    Gi: 1024,
    Ti: 1048576,
    K: 1000 / 1048576,
    M: 1000000 / 1048576,
    G: 1000000000 / 1048576,
    T: 1000000000000 / 1048576,
  };
  const memory = Number(match[1]) * factors[match.at(2) ?? ''];
  // Proof: removing this refusal failed `overflowing memory quantity refuses` with its named fault.
  if (!Number.isFinite(memory)) refusePreflight('memory-unknown');
  return memory;
}

function computePodMemoryMiB(pod: typeof Pod.infer): number {
  if (
    pod.requests.length === 0 ||
    pod.requests.length !== pod.limits.length ||
    pod.initRequests.length !== pod.initLimits.length
  )
    // Proof: removing this refusal failed `unknown current memory bounds refuse` with its named fault.
    refusePreflight('memory-unknown');
  const readPeak = (request: string, limit: string): number => {
    const bound = readMemoryMiB(limit);
    // Proof: removing this refusal failed `unbounded current memory limit refuses` with its named fault.
    if (bound <= 0) refusePreflight('memory-unknown');
    return Math.max(readMemoryMiB(request), bound);
  };
  return (
    Math.max(
      pod.requests.reduce((sum, request, index) => sum + readPeak(request, pod.limits[index]), 0),
      ...pod.initRequests.map((request, index) => readPeak(request, pod.initLimits[index])),
      0,
    ) + readMemoryMiB(pod.overhead)
  );
}

function readCPUMilli(quantity: string): number {
  const match = /^(\d+(?:\.\d+)?)(m|u|n)?$/.exec(quantity);
  // Proof: removing this refusal failed `unknown node CPU refuses` with its named fault.
  if (match === null) refusePreflight('cpu-unknown');
  const multiplier =
    match[2] === 'm' ? 1 : match[2] === 'u' ? 0.001 : match[2] === 'n' ? 0.000001 : 1000;
  const cpu = Number(match[1]) * multiplier;
  // Proof: removing this refusal failed `overflowing CPU quantity refuses` with its named fault.
  if (!Number.isFinite(cpu)) refusePreflight('cpu-unknown');
  return cpu;
}

function computePodCPUMilli(pod: typeof Pod.infer): number {
  // Proof: removing this refusal failed `unsupported restartable init resource shape refuses` with its named fault.
  if (pod.restartableInit) refusePreflight('pod-resource-shape-unsupported');
  if (
    pod.cpuRequests.length !== pod.cpuLimits.length ||
    pod.initCPUs.length !== pod.initCPULimits.length
  )
    // Proof: removing this refusal failed `unknown CPU array alignment refuses` with its named fault.
    refusePreflight('cpu-unknown');
  // Limits prove a finite bound, while scheduler admission uses requests under CPU overcommit.
  pod.cpuLimits.forEach(readCPUMilli);
  pod.initCPULimits.forEach(readCPUMilli);
  return (
    Math.max(
      pod.cpuRequests.reduce((sum, quantity) => sum + readCPUMilli(quantity), 0),
      ...pod.initCPUs.map(readCPUMilli),
      0,
    ) + readCPUMilli(pod.overheadCPU)
  );
}

function computeDockerCPUMilli(container: (typeof Docker.infer.containers)[number]): number {
  if (container.nanoCPUs > 0) return container.nanoCPUs / 1_000_000;
  if (container.cpuQuota > 0 && container.cpuPeriod > 0)
    return (container.cpuQuota / container.cpuPeriod) * 1000;
  // Proof: removing this refusal failed `unbounded retained Docker CPU refuses` with its named fault.
  return refusePreflight('docker-cpu-unbounded');
}

async function readRollback(request: ObservabilityPreflightRequest, now: number) {
  let source: string;
  try {
    source = await readFile(request.rollbackPath, 'utf8');
  } catch (failure) {
    if (
      typeof failure === 'object' &&
      failure !== null &&
      'code' in failure &&
      failure.code === 'ENOENT'
    )
      // Proof: removing this refusal failed `missing rollback receipt refuses` with its named fault.
      refusePreflight('rollback-missing');
    // Proof: removing this refusal failed `unreadable rollback receipt differs` with its named fault.
    return refusePreflight('rollback-unreadable');
  }
  let receipt: typeof Rollback.infer;
  try {
    receipt = decodeProjection(Rollback, parseProjectionJSON(source));
  } catch {
    // Proof: removing this refusal failed `malformed rollback receipt differs` with its named fault.
    return refusePreflight('rollback-malformed');
  }
  // Proof: removing this refusal failed `stale rollback receipt refuses` with its named fault.
  if (!isFresh(receipt.capturedAt, now, request.maxAgeMs)) refusePreflight('rollback-stale');
  if (
    receipt.candidateRevision !== request.candidateRevision ||
    request.claims.some((claim) => !receipt.claimUIDs.includes(claim.uid)) ||
    request.docker.retainedVolumes.some((volume) => !receipt.dockerVolumes.includes(volume))
  )
    // Proof: removing this refusal failed `wrong rollback ownership refuses` with its named fault.
    refusePreflight('rollback-mismatch');
  if (((await stat(request.rollbackPath)).mode & 0o077) !== 0)
    // Proof: removing this refusal failed `rollback group readable refuses` with its named fault.
    refusePreflight('rollback-permissions');
  const sha256 = createHash('sha256').update(source).digest('hex');
  if (receipt.operationId !== request.rollbackOperationId || sha256 !== request.rollbackSHA256)
    // Proof: removing this refusal failed `changed rollback bytes refuse the reviewed receipt digest` with its named fault.
    refusePreflight('rollback-digest-mismatch');
  return { ...receipt, sha256 };
}

async function readCandidateCosts(
  candidate: typeof Candidate.infer,
  storageClass: string,
  retained: readonly (typeof ClaimPin.infer)[],
  node: typeof Node.infer | undefined,
  bindingMode: string | undefined,
): Promise<{
  readonly requiredClaims: readonly { readonly name: string; readonly requestedMiB: number }[];
  readonly replicas: number;
  readonly images: readonly string[];
}> {
  let source: string;
  try {
    source = await readFile(candidate.artifactPath, 'utf8');
  } catch (failure) {
    if (
      typeof failure === 'object' &&
      failure !== null &&
      'code' in failure &&
      failure.code === 'ENOENT'
    )
      // Proof: removing this refusal failed `missing candidate artifact differs from unreadable candidate state` with its named fault.
      refusePreflight('candidate-missing');
    // Proof: removing this refusal failed `unreadable candidate artifact refuses` with its named fault.
    return refusePreflight('candidate-unreadable');
  }
  if (createHash('sha256').update(source).digest('hex') !== candidate.artifactSHA256)
    // Proof: removing this refusal failed `candidate artifact drift refuses` with its named fault.
    refusePreflight('candidate-digest-mismatch');
  // Source artifacts are already rendered Pod/Deployment/StatefulSet workloads, never free-form budgets.
  const StorageClaim = type({
    metadata: { name, namespace: name },
    kind: "'PersistentVolumeClaim'",
    spec: { storageClassName: name, resources: { requests: { storage: 'string>0' } } },
  });
  const VolumeTemplate = type({
    metadata: { name },
    spec: { storageClassName: name, resources: { requests: { storage: 'string>0' } } },
  });
  const Workload = type({
    kind: "'Deployment'|'StatefulSet'",
    metadata: { name, namespace: name },
    spec: {
      replicas: 'number.integer>0',
      'volumeClaimTemplates?': VolumeTemplate.array(),
      template: {
        spec: {
          'nodeName?': name,
          'nodeSelector?': type({ '[string]': 'string' }),
          'affinity?': {
            'nodeAffinity?': {
              'requiredDuringSchedulingIgnoredDuringExecution?': {
                nodeSelectorTerms: type({
                  'matchExpressions?': type({
                    key: name,
                    operator: 'string',
                    values: 'string[]',
                  }).array(),
                  'matchFields?': 'unknown',
                }).array(),
              },
            },
            'podAffinity?': {
              'requiredDuringSchedulingIgnoredDuringExecution?': 'unknown',
              'preferredDuringSchedulingIgnoredDuringExecution?': 'unknown',
            },
            'podAntiAffinity?': {
              'requiredDuringSchedulingIgnoredDuringExecution?': 'unknown',
              'preferredDuringSchedulingIgnoredDuringExecution?': 'unknown',
            },
          },
          'volumes?': type({
            name,
            'persistentVolumeClaim?': { claimName: name },
            'hostPath?': { path: 'string' },
            'emptyDir?': { 'sizeLimit?': 'string', 'medium?': 'string' },
          }).array(),
          containers: type({
            image: 'string>0',
            'securityContext?': { 'readOnlyRootFilesystem?': 'boolean' },
            resources: {
              requests: { memory: 'string>0', cpu: 'string>0', 'ephemeral-storage?': 'string' },
              limits: { memory: 'string>0', cpu: 'string>0', 'ephemeral-storage?': 'string' },
            },
          }).array(),
          'initContainers?': type({
            'restartPolicy?': "'Always'",
            image: 'string>0',
            'securityContext?': { 'readOnlyRootFilesystem?': 'boolean' },
            resources: {
              requests: { memory: 'string>0', cpu: 'string>0', 'ephemeral-storage?': 'string' },
              limits: { memory: 'string>0', cpu: 'string>0', 'ephemeral-storage?': 'string' },
            },
          }).array(),
        },
      },
    },
  });
  let documents: unknown[];
  try {
    documents = parseAllDocuments(source).map((document): unknown => {
      // Proof: removing this refusal failed `malformed candidate YAML refuses` with its named fault.
      if (document.errors.length !== 0) refusePreflight('candidate-malformed');
      const decoded: unknown = document.toJSON();
      return decoded;
    });
  } catch {
    // Proof: removing this refusal failed `malformed candidate YAML refuses` with its named fault.
    return refusePreflight('candidate-malformed');
  }
  const Ancillary = type({ kind: "'ConfigMap'|'Service'", metadata: { name, namespace: name } });
  const artifacts = documents.map((document) =>
    decodeProjection(Workload.or(StorageClaim).or(Ancillary), document),
  );
  const workloads = artifacts.filter(
    (document) => document.kind === 'Deployment' || document.kind === 'StatefulSet',
  );
  const storageClaims = artifacts.filter((document) => document.kind === 'PersistentVolumeClaim');
  const workload = workloads.find(
    (entry) =>
      entry.metadata.name === candidate.name && entry.metadata.namespace === candidate.namespace,
  );
  if (
    workload?.kind !== candidate.kind ||
    node?.name !== candidate.node ||
    (workload.spec.template.spec.nodeName !== undefined &&
      workload.spec.template.spec.nodeName !== candidate.node)
  )
    // Proof: removing this refusal failed `missing candidate node pin refuses` with its named fault.
    refusePreflight('candidate-binding-mismatch');
  const spec = workload.spec.template.spec;
  const requiredAffinity =
    spec.affinity?.nodeAffinity?.requiredDuringSchedulingIgnoredDuringExecution;
  if (
    spec.affinity?.podAffinity?.requiredDuringSchedulingIgnoredDuringExecution !== undefined ||
    spec.affinity?.podAntiAffinity?.requiredDuringSchedulingIgnoredDuringExecution !== undefined ||
    requiredAffinity?.nodeSelectorTerms.some(
      (term) =>
        term.matchFields !== undefined ||
        term.matchExpressions?.some((expression) => expression.operator !== 'In'),
    )
  )
    // Proof: removing this refusal failed `unknown required affinity semantics refuse instead of guessing placement` with its named fault.
    refusePreflight('candidate-placement-unsupported');
  if (
    spec.nodeName === undefined &&
    (spec.nodeSelector === undefined || Object.keys(spec.nodeSelector).length === 0) &&
    requiredAffinity === undefined
  )
    // Proof: removing this refusal failed `unconstrained source placement cannot become observed node evidence` with its named fault.
    refusePreflight('candidate-placement-unknown');
  if (
    (spec.nodeSelector !== undefined &&
      Object.entries(spec.nodeSelector).some(([key, value]) => node.labels[key] !== value)) ||
    (requiredAffinity !== undefined &&
      !requiredAffinity.nodeSelectorTerms.some(
        (term) =>
          term.matchExpressions !== undefined &&
          term.matchExpressions.length > 0 &&
          term.matchExpressions.every((expression) => {
            const label = Object.entries(node.labels).find(([key]) => key === expression.key)?.[1];
            return label !== undefined && expression.values.includes(label);
          }),
      ))
  )
    // Proof: removing this refusal failed `source selector must match actual node labels` with its named fault.
    refusePreflight('candidate-placement-mismatch');
  const hasClaims =
    (workload.spec.volumeClaimTemplates?.length ?? 0) > 0 ||
    spec.volumes?.some((volume) => volume.persistentVolumeClaim !== undefined);
  if (spec.nodeName !== undefined && hasClaims && bindingMode === 'WaitForFirstConsumer')
    // Proof: removing this refusal failed `nodeName cannot bypass WaitForFirstConsumer for a selected new PVC` with its named fault.
    refusePreflight('candidate-placement-bypasses-scheduler');
  if (spec.initContainers?.some((container) => container.restartPolicy === 'Always'))
    // Proof: removing this refusal failed `source restartable init accounting is refused instead of underestimated` with its named fault.
    refusePreflight('candidate-resource-shape-unsupported');
  const readPeak = (container: (typeof spec.containers)[number]) =>
    Math.max(
      readMemoryMiB(container.resources.requests.memory),
      readMemoryMiB(container.resources.limits.memory),
    );
  let memory =
    workload.spec.replicas *
    Math.max(
      spec.containers.reduce((sum, container) => sum + readPeak(container), 0),
      ...(spec.initContainers ?? []).map(readPeak),
      0,
    );

  const readContainerCPU = (container: (typeof spec.containers)[number]) =>
    readCPUMilli(container.resources.requests.cpu);
  const cpu =
    workload.spec.replicas *
    Math.max(
      spec.containers.reduce((sum, container) => sum + readContainerCPU(container), 0),
      ...(spec.initContainers ?? []).map(readContainerCPU),
      0,
    );
  // Proof: removing this refusal failed `tiny declared CPU cannot override source artifact` with its named fault.
  if (cpu !== candidate.cpuMilli) refusePreflight('candidate-cpu-mismatch');
  // Limits are required evidence, but normal Kubernetes CPU overcommit remains admissible.
  for (const container of [...spec.containers, ...(spec.initContainers ?? [])])
    readCPUMilli(container.resources.limits.cpu);
  const readEphemeralPeak = (container: (typeof spec.containers)[number]) => {
    const limit = container.resources.limits['ephemeral-storage'];
    if (limit === undefined) {
      if (container.securityContext?.readOnlyRootFilesystem === true) return 0;
      // Proof: removing this refusal failed `unbounded writable source filesystem refuses` with its named fault.
      return refusePreflight('candidate-ephemeral-unbounded');
    }
    const allowance = readMemoryMiB(limit);
    const request = container.resources.requests['ephemeral-storage'];
    if (allowance <= 0 || (request !== undefined && readMemoryMiB(request) > allowance))
      // Proof: removing this refusal failed `zero ephemeral limit cannot mean a bounded writable allowance` with its named fault.
      refusePreflight('candidate-ephemeral-unbounded');
    return allowance;
  };
  const writablePeak = Math.max(
    spec.containers.reduce((sum, container) => sum + readEphemeralPeak(container), 0),
    ...(spec.initContainers ?? []).map(readEphemeralPeak),
    0,
  );
  let memoryEmptyDirMiB = 0;
  let diskEmptyDirMiB = 0;
  let storageMiB = 0;
  const requiredClaims: { name: string; requestedMiB: number }[] = [];
  const seenClaims = new Set<string>();
  for (const volume of spec.volumes ?? []) {
    if (volume.hostPath !== undefined)
      // Proof: removing this refusal failed `unbound candidate hostPath refuses` with its named fault.
      refusePreflight('candidate-storage-unknown');
    if (volume.emptyDir !== undefined) {
      // Proof: removing this refusal failed `source emptyDir without sizeLimit remains a concrete blocker` with its named fault.
      if (volume.emptyDir.sizeLimit === undefined) refusePreflight('candidate-emptydir-unbounded');
      const allowance = readMemoryMiB(volume.emptyDir.sizeLimit);
      if (
        allowance <= 0 ||
        (volume.emptyDir.medium !== undefined && !['', 'Memory'].includes(volume.emptyDir.medium))
      )
        // Proof: removing this refusal failed `unsupported scratch medium refuses a guessed storage dimension` with its named fault.
        refusePreflight('candidate-emptydir-unbounded');
      if (volume.emptyDir.medium === 'Memory') memoryEmptyDirMiB += allowance;
      else diskEmptyDirMiB += allowance;
    }
    if (volume.persistentVolumeClaim === undefined) continue;
    const claimName = volume.persistentVolumeClaim.claimName;
    if (seenClaims.has(claimName)) continue;
    seenClaims.add(claimName);
    if (
      retained.some((claim) => claim.name === claimName && claim.namespace === candidate.namespace)
    )
      // Proof: removing this refusal failed `retained history cannot be writable-mounted by the new runtime` with its named fault.
      refusePreflight('retained-store-dual-mount');
    const claim = storageClaims.find(
      (entry) =>
        entry.metadata.name === claimName && entry.metadata.namespace === candidate.namespace,
    );
    // Proof: removing this refusal failed `missing candidate PVC source cannot be costed as empty storage` with its named fault.
    if (claim?.spec.storageClassName !== storageClass) refusePreflight('candidate-storage-unknown');
    const requestedMiB = readMemoryMiB(claim.spec.resources.requests.storage);
    storageMiB += requestedMiB;
    requiredClaims.push({ name: claimName, requestedMiB });
  }
  for (const claim of workload.spec.volumeClaimTemplates ?? []) {
    // Proof: removing this refusal failed `StatefulSet template storage demand requires its exact selected storage class` with its named fault.
    if (claim.spec.storageClassName !== storageClass) refusePreflight('candidate-storage-unknown');
    const requestedMiB = readMemoryMiB(claim.spec.resources.requests.storage);
    storageMiB += workload.spec.replicas * requestedMiB;
    for (let ordinal = 0; ordinal < workload.spec.replicas; ordinal += 1)
      requiredClaims.push({
        name: `${claim.metadata.name}-${candidate.name}-${String(ordinal)}`,
        requestedMiB,
      });
  }
  memory = Math.max(memory, workload.spec.replicas * memoryEmptyDirMiB);
  // Proof: removing this refusal failed `tiny caller cost cannot override rendered workload requests` with its named fault.
  if (memory !== candidate.memoryMiB) refusePreflight('candidate-budget-mismatch');
  const ephemeralMiB = workload.spec.replicas * Math.max(writablePeak, diskEmptyDirMiB);
  // Proof: removing this refusal failed `small caller ephemeral allowance cannot replace bounded source scratch demand` with its named fault.
  if (ephemeralMiB !== candidate.ephemeralMiB) refusePreflight('candidate-ephemeral-mismatch');
  // Proof: removing this refusal failed `declared storage cost cannot replace selected artifact` with its named fault.
  if (storageMiB !== candidate.storageMiB) refusePreflight('candidate-storage-mismatch');
  if (candidate.claims.some((pin) => !requiredClaims.some((claim) => claim.name === pin.name)))
    // Proof: removing this refusal failed `unused selected PVC pins refuse` with its named fault.
    refusePreflight('candidate-storage-pin-unused');
  return {
    requiredClaims,
    replicas: workload.spec.replicas,
    images: spec.containers.map((container) => container.image),
  };
}

/**
 * Read one safe inventory using the existing bounded process contract. Inventory mode allows first
 * discovery without UID pins; cutover mode demands pins, source-bound workload costs, retained
 * history and fresh rollback evidence. Prerequisite readiness is not route promotion authorization.
 * All subprocess and projection failures are sanitized before they cross this boundary.
 */
export async function preflightObservability(
  input: unknown,
  options: {
    readonly transport: SshTransport;
    readonly run?: RunDiscoveryCommand;
    readonly now?: () => Date;
  },
) {
  const request = decodeObservabilityPreflightRequest(input);
  const run = options.run ?? runDiscoveryCommand;
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const provenance: { source: string; observedAt: string; executable: string }[] = [];
  async function execute(command: DiscoveryCommand): Promise<string> {
    let response;
    try {
      response = await run(command);
    } catch {
      // Proof: removing this refusal failed `required command absence refuses with a safe transport failure category` with its named fault.
      return refusePreflight('command-unavailable-or-timeout');
    }
    // Proof: forwarding raw failed stdout/stderr failed `Secret failure diagnostics never expose plaintext or encoded private markers`.
    if (response.exitCode !== 0)
      throw new ObservabilityPreflightRefusal(
        'command-failed',
        ` source=${command.source} exit=${String(response.exitCode)}`,
      );
    if (!isFresh(response.observedAt, now().getTime(), request.maxAgeMs))
      // Proof: removing this refusal failed `stale capacity refuses` with its named fault.
      refusePreflight('source-stale');
    provenance.push({
      source: command.source,
      executable: command.executable,
      observedAt: response.observedAt,
    });
    return response.stdout;
  }
  async function kubernetes(
    context: string,
    resource: string,
    projection: string,
    extra: readonly string[] = [],
  ): Promise<unknown> {
    const stdout = await execute({
      source: `observability-kubernetes:${context}/${resource}`,
      executable: 'kubectl',
      arguments: [
        '--context',
        context,
        `--request-timeout=${String(request.timeoutMs)}ms`,
        'get',
        resource,
        ...extra,
        '-o',
        `go-template=${projection}`,
      ],
      timeoutMs: request.timeoutMs,
    });
    return parseProjectionJSON(stdout);
  }
  for (const context of new Set([request.context, request.controllerContext])) {
    const contexts = await execute({
      source: `observability-kubernetes:${context}/contexts`,
      executable: 'kubectl',
      arguments: ['config', 'get-contexts', '-o', 'name'],
      timeoutMs: request.timeoutMs,
    });
    // Proof: removing this refusal failed `missing context refuses` with its named fault.
    if (!contexts.split('\n').includes(context)) refusePreflight('context-unavailable');
  }
  const identity = decodeProjection(
    Identity,
    await kubernetes(request.context, 'configmap', observabilityProjections.identity, [
      'puni-cluster-identity',
      '-n',
      'flux-system',
    ]),
  );
  if (
    identity.marker !== request.targetMarker ||
    (request.phase === 'cutover' && identity.uid !== request.identityUID)
  )
    // Proof: removing this refusal failed `wrong cluster marker refuses` with its named fault.
    refusePreflight('target-mismatch');
  const source = decodeProjection(
    Source,
    await kubernetes(request.controllerContext, 'gitrepository', observabilityProjections.source, [
      request.source.name,
      '-n',
      'flux-system',
    ]),
  );
  const targetResources = decodeProjection(
    Resource.array(),
    await kubernetes(
      request.context,
      'namespaces,customresourcedefinitions',
      observabilityProjections.resources,
    ),
  );
  const fluxResources = decodeProjection(
    Resource.array(),
    await kubernetes(
      request.controllerContext,
      'kustomizations.kustomize.toolkit.fluxcd.io',
      observabilityProjections.resources,
      ['-A'],
    ),
  );
  const workloads = decodeProjection(
    Resource.array(),
    await kubernetes(
      request.context,
      'deployments.apps,statefulsets.apps,daemonsets.apps,replicasets.apps,elasticsearches.elasticsearch.k8s.elastic.co,kibanas.kibana.k8s.elastic.co,helmreleases.helm.toolkit.fluxcd.io',
      observabilityProjections.resources,
      ['-A'],
    ),
  );
  const resources = [...targetResources, ...fluxResources, ...workloads];
  const nodes = decodeProjection(
    Node.array(),
    await kubernetes(request.context, 'nodes', observabilityProjections.nodes),
  );
  const pods = decodeProjection(
    Pod.array(),
    await kubernetes(request.context, 'pods', observabilityProjections.pods, ['-A']),
  );
  const claims = decodeProjection(
    Claim.array(),
    await kubernetes(request.context, 'persistentvolumeclaims', observabilityProjections.claims, [
      '-A',
    ]),
  );
  const volumes = decodeProjection(
    Volume.array(),
    await kubernetes(request.context, 'persistentvolumes', observabilityProjections.volumes),
  );
  const secrets = [];
  for (const secret of request.secrets)
    secrets.push(
      decodeProjection(
        Secret,
        await kubernetes(request.context, 'secret', observabilityProjections.secrets, [
          secret.name,
          '-n',
          secret.namespace,
        ]),
      ),
    );
  const storageClasses = decodeProjection(
    StorageClass.array(),
    await kubernetes(request.context, 'storageclasses', observabilityProjections.storageClasses),
  );
  const docker = decodeProjection(
    Docker,
    parseProjectionJSON(
      await execute(
        buildObservabilityDockerCommand(options.transport, request.docker.host, request.timeoutMs, {
          path: request.storage.path,
          claimPaths: volumes
            .filter(
              (volume) =>
                request.claims.some((claim) => claim.volumeUID === volume.uid) ||
                request.candidate.some((candidate) =>
                  candidate.claims.some((claim) => claim.volumeUID === volume.uid),
                ),
            )
            .map((volume) => volume.path),
        }),
      ),
    ),
  );
  const observed = {
    identity,
    source,
    resources,
    nodes,
    pods,
    claims,
    volumes,
    secrets,
    storageClasses,
    docker,
  };
  // Proof: removing this refusal failed `inventory cannot finish after its aggregate freshness window` with its named fault.
  if (!isFresh(startedAt, now().getTime(), request.maxAgeMs)) refusePreflight('inventory-stale');
  if (request.phase === 'inventory')
    return {
      schemaVersion: 1,
      candidateRevision: request.candidateRevision,
      requestSHA256: createHash('sha256').update(JSON.stringify(request)).digest('hex'),
      fleetId: request.fleetId,
      targetMarker: identity.marker,
      startedAt,
      completedAt: now().toISOString(),
      inventoryComplete: true,
      migrationReady: false,
      blockers: ['review-required'],
      capacityDimensions: {
        memory: 'unassessed',
        cpu: 'unobserved',
        storage: 'retained-identities-only',
      },
      promotionAuthorized: false,
      observed,
      provenance,
      capacity: [],
    };
  if (
    request.resources.length === 0 ||
    request.nodes.length === 0 ||
    request.candidate.length === 0 ||
    request.secrets.length === 0 ||
    request.claims.length === 0 ||
    request.docker.retainedContainers.length === 0 ||
    request.docker.retainedVolumes.length === 0
  )
    // Proof: removing this refusal failed `empty reviewed pins refuse readiness` with its named fault.
    refusePreflight('review-pins-required');
  for (const chart of ['eck-operator', 'kube-prometheus-stack']) {
    const owners = resources.filter(
      (entry) => entry.kind === 'HelmRelease' && entry.chart === chart && entry.controllerEnabled,
    );
    // Proof: removing this refusal failed `duplicate cluster controller refuses` with its named fault.
    if (owners.length !== 1) refusePreflight('controller-owner-conflict');
    if (!request.resources.some((pin) => pin.uid === owners[0].uid))
      // Proof: removing this refusal failed `unreviewed controller refuses` with its named fault.
      refusePreflight('controller-owner-unreviewed');
  }
  for (const crd of resources.filter(
    (entry) =>
      entry.kind === 'CustomResourceDefinition' &&
      /(?:k8s\.elastic\.co|monitoring\.coreos\.com)$/.test(entry.name),
  )) {
    if (!request.resources.some((pin) => pin.uid === crd.uid))
      // Proof: removing this refusal failed `unreviewed relevant CRD refuses` with its named fault.
      refusePreflight('controller-owner-unreviewed');
  }
  if (
    request.candidate.some((candidate) =>
      request.candidate.some(
        (other) => other.instance !== candidate.instance && other.namespace === candidate.namespace,
      ),
    )
  )
    // Proof: removing this refusal failed `separate instances cannot share their selected namespace` with its named fault.
    refusePreflight('instance-namespace-conflict');
  const selected = request.candidate.map((entry) => `${entry.namespace}/${entry.name}`);
  // Proof: removing this refusal failed `duplicate selected workload refuses` with its named fault.
  if (new Set(selected).size !== selected.length) refusePreflight('duplicate-selection');
  if (
    source.uid !== request.source.uid ||
    source.revision !== request.source.requiredRevision ||
    !source.ready ||
    source.generation !== source.observedGeneration
  )
    // Proof: removing this refusal failed `source revision drift refuses` with its named fault.
    refusePreflight('source-mismatch');
  function resolveOwner(
    resource: typeof Resource.infer,
    seen = new Set<string>(),
  ): { readonly owner: string; readonly namespace: string } | undefined {
    // Proof: removing cycle detection failed `cyclic controller UID ownership refuses without traversing indefinitely`.
    if (seen.has(resource.uid)) return undefined;
    seen.add(resource.uid);
    if (resource.owner !== '' && resource.ownerNamespace !== '')
      return { owner: resource.owner, namespace: resource.ownerNamespace };
    const parent = resources.find((entry) => entry.uid === resource.ownerUID);
    return parent === undefined ? undefined : resolveOwner(parent, seen);
  }
  function requireDependencies(resource: typeof Resource.infer, seen = new Set<string>()): void {
    // Proof: removing this refusal failed `cyclic Flux dependency graph refuses` with its named fault.
    if (seen.has(resource.uid)) refusePreflight('dependency-cycle');
    seen.add(resource.uid);
    // Proof: removing this refusal failed `observed Flux sourceRef cannot drift from the pinned Git source` with its named fault.
    if (resource.sourceName !== request.source.name) refusePreflight('source-mismatch');
    for (const edge of resource.dependencies) {
      const dependency = resources.find(
        (entry) =>
          entry.kind === 'Kustomization' &&
          entry.name === edge.name &&
          entry.namespace === edge.namespace,
      );
      if (
        dependency === undefined ||
        !dependency.ready ||
        dependency.generation !== dependency.observedGeneration
      )
        // Proof: removing this refusal failed `actual Flux dependency absent from inventory refuses` with its named fault.
        refusePreflight('dependency-unready');
      if (!request.resources.some((pin) => pin.uid === dependency.uid))
        // Proof: removing this refusal failed `actual Flux dependency cannot be omitted from reviewed UID pins` with its named fault.
        refusePreflight('dependency-unreviewed');
      requireDependencies(dependency, new Set(seen));
    }
  }
  for (const pin of request.resources) {
    const actual = resources.find(
      (entry) =>
        entry.kind === pin.kind && entry.name === pin.name && entry.namespace === pin.namespace,
    );
    const owner = actual === undefined ? undefined : resolveOwner(actual);
    if (
      actual === undefined ||
      pin.uid === '' ||
      pin.owner === '' ||
      pin.ownerNamespace === '' ||
      actual.uid !== pin.uid ||
      actual.ownerUID !== pin.ownerUID ||
      owner?.owner !== pin.owner ||
      owner.namespace !== pin.ownerNamespace
    )
      // Proof: removing this refusal failed `unknown owner refuses` with its named fault.
      refusePreflight('ownership-mismatch');
    if (actual.kind === 'Kustomization') {
      // Proof: removing this refusal failed `observed Flux path cannot drift from the reviewed graph` with its named fault.
      if (actual.path !== pin.path) refusePreflight('source-mismatch');
      requireDependencies(actual);
    }
    if (
      !actual.ready ||
      (!['Namespace', 'CustomResourceDefinition'].includes(actual.kind) &&
        actual.generation !== actual.observedGeneration) ||
      (pin.requiredRevision !== '' && actual.revision !== pin.requiredRevision)
    )
      // Proof: removing this refusal failed `unready dependency refuses migration` with its named fault.
      refusePreflight('dependency-unready');
  }
  const selectedClaims: {
    candidate: typeof Candidate.infer;
    requiredClaims: readonly { name: string; requestedMiB: number }[];
    replicas: number;
    images: readonly string[];
  }[] = [];
  for (const candidate of request.candidate) {
    if (
      !request.resources.some(
        (entry) => entry.kind === 'Namespace' && entry.name === candidate.namespace,
      )
    )
      // Proof: removing this refusal failed `candidate namespace requires a reviewed UID pin` with its named fault.
      refusePreflight('namespace-pin-required');
    selectedClaims.push({
      candidate,
      ...(await readCandidateCosts(
        candidate,
        request.storage.storageClass,
        request.claims,
        nodes.find((node) => node.name === candidate.node),
        storageClasses.find((entry) => entry.name === request.storage.storageClass)?.bindingMode,
      )),
    });
  }
  for (const secret of request.secrets) {
    const actual = secrets.find(
      (entry) => entry.name === secret.name && entry.namespace === secret.namespace,
    );
    if (
      actual?.uid !== secret.uid ||
      secret.keys.length === 0 ||
      secret.keys.some((key) => !actual.keys.includes(key))
    )
      // Proof: removing this refusal failed `missing required Secret key refuses` with its named fault.
      refusePreflight('secret-mismatch');
  }
  for (const claim of request.claims) {
    const actual = claims.find(
      (entry) => entry.name === claim.name && entry.namespace === claim.namespace,
    );
    const volume = volumes.find((entry) => entry.name === claim.volume);
    if (
      actual?.uid !== claim.uid ||
      volume === undefined ||
      actual.volume !== claim.volume ||
      actual.phase !== 'Bound' ||
      volume.uid !== claim.volumeUID ||
      volume.claimUID !== claim.uid ||
      volume.policy !== 'Retain'
    )
      // Proof: removing this refusal failed `wrong retained PV policy refuses` with its named fault.
      refusePreflight('retained-claim-mismatch');
  }
  const dockerNode = nodes.find((entry) => entry.name === request.docker.node);
  // Proof: removing this refusal failed `wrong Docker machine identity refuses` with its named fault.
  if (dockerNode?.machineID !== docker.machineID) refusePreflight('docker-node-mismatch');
  if (
    request.docker.retainedContainers.some(
      (container) => !docker.containers.some((entry) => entry.name === container),
    ) ||
    request.docker.retainedVolumes.some(
      (volume) => !docker.volumes.some((entry) => entry.name === volume),
    )
  )
    // Proof: removing this refusal failed `missing retained Docker volume refuses` with its named fault.
    refusePreflight('docker-retention-mismatch');
  for (const retainedName of request.docker.retainedContainers) {
    const pin = request.docker.pins.find((entry) => entry.name === retainedName);
    const container = docker.containers.find((entry) => entry.name === retainedName);
    if (
      pin === undefined ||
      pin.project === '' ||
      container?.id !== pin.id ||
      container.imageID !== pin.imageID ||
      container.project !== pin.project
    )
      // Proof: removing this refusal failed `unknown retained Docker ownership refuses` with its named fault.
      refusePreflight('docker-ownership-mismatch');
  }
  if (
    request.docker.retainedVolumes.some(
      (volume) =>
        !docker.containers.some(
          (container) =>
            request.docker.retainedContainers.includes(container.name) &&
            container.volumes.includes(volume),
        ),
    )
  )
    // Proof: removing this refusal failed `missing retained volume attachment refuses` with its named fault.
    refusePreflight('docker-retention-mismatch');
  for (const retainedName of request.docker.retainedVolumes) {
    const pin = request.docker.volumePins.find((entry) => entry.name === retainedName);
    const volume = docker.volumes.find((entry) => entry.name === retainedName);
    if (
      pin === undefined ||
      pin.project === '' ||
      volume?.createdAt !== pin.createdAt ||
      volume.mountpoint !== pin.mountpoint ||
      volume.project !== pin.project
    )
      // Proof: removing this refusal failed `recreated retained Docker volume refuses its changed immutable receipt identity` with its named fault.
      refusePreflight('docker-volume-ownership-mismatch');
  }
  const rollback = await readRollback(request, now().getTime());
  const capacity = request.nodes.map((pin) => {
    const node = nodes.find((entry) => entry.name === pin.name);
    if (
      node?.uid !== pin.uid ||
      node.machineID !== pin.machineID ||
      !node.ready ||
      !node.schedulable ||
      node.pressure !== 'clear'
    )
      // Proof: removing this refusal failed `unready current node refuses` with its named fault.
      refusePreflight('node-mismatch');
    const current = pods.filter(
      (pod) => pod.node === pin.name && !['Succeeded', 'Failed'].includes(pod.phase),
    );
    let additions = 0;
    let additionalCPUMilli = 0;
    for (const candidate of request.candidate.filter((entry) => entry.node === pin.name)) {
      if (candidate.existingPodUID === '') {
        additions += candidate.memoryMiB;
        additionalCPUMilli += candidate.cpuMilli;
      } else {
        const pod = current.find((entry) => entry.uid === candidate.existingPodUID);
        const controller = resources.find(
          (entry) =>
            entry.kind === candidate.kind &&
            entry.name === candidate.name &&
            entry.namespace === candidate.namespace,
        );
        const parent = resources.find(
          (entry) => entry.uid === pod?.ownerUID && entry.kind === 'ReplicaSet',
        );
        const controllerUID = parent === undefined ? pod?.ownerUID : parent.ownerUID;
        if (
          controller === undefined ||
          !request.resources.some((entry) => entry.uid === controller.uid) ||
          controller.uid !== controllerUID ||
          pod?.namespace !== candidate.namespace ||
          !pod.name.startsWith(candidate.name + '-') ||
          computePodMemoryMiB(pod) !== candidate.memoryMiB ||
          computePodCPUMilli(pod) !== candidate.cpuMilli
        )
          // Proof: removing this refusal failed `foreign pod controller cannot suppress candidate capacity` with its named fault.
          refusePreflight('existing-workload-mismatch');
      }
    }
    const retained =
      pin.name === request.docker.node
        ? docker.containers.filter(
            (entry) => entry.running || request.docker.retainedContainers.includes(entry.name),
          )
        : [];
    // Proof: removing this refusal failed `unbounded Docker memory refuses` with its named fault.
    if (retained.some((entry) => entry.memoryBytes <= 0)) refusePreflight('docker-unbounded');
    const requiredMiB =
      current.reduce((sum, pod) => sum + computePodMemoryMiB(pod), 0) +
      additions +
      retained.reduce((sum, container) => sum + container.memoryBytes / 1048576, 0) +
      pin.reserveMiB;
    const allocatableMiB = readMemoryMiB(node.allocatable);
    const allocatableCPUMilli = readCPUMilli(node.allocatableCPU);
    const requiredCPUMilli =
      current.reduce((sum, pod) => sum + computePodCPUMilli(pod), 0) +
      additionalCPUMilli +
      retained.reduce((sum, container) => sum + computeDockerCPUMilli(container), 0) +
      pin.reserveCPUMilli;
    // Proof: removing this refusal failed `CPU coexistence deficit refuses` with its named fault.
    if (requiredCPUMilli > allocatableCPUMilli) refusePreflight('cpu-capacity-exceeded');
    // Proof: removing this refusal failed `candidate plus retained stack exceeds capacity` with its named fault.
    if (requiredMiB > allocatableMiB) refusePreflight('capacity-exceeded');
    return {
      node: pin.name,
      allocatableMiB,
      requiredMiB,
      additionalCandidateMiB: additions,
      allocatableCPUMilli,
      requiredCPUMilli,
      additionalCPUMilli,
      futureCPUAllowanceFits:
        requiredCPUMilli + pin.futureAdditionalCPUMilli <= allocatableCPUMilli,
      futureAdditionalMiB: pin.futureAdditionalMiB,
      futureAllowanceFits: requiredMiB + pin.futureAdditionalMiB <= allocatableMiB,
    };
  });
  if (
    request.candidate.some((entry) => !request.nodes.some((node) => node.name === entry.node)) ||
    !request.nodes.some((entry) => entry.name === request.docker.node)
  )
    // Proof: removing this refusal failed `every selected candidate node must have current capacity evidence` with its named fault.
    refusePreflight('capacity-scope-mismatch');
  // Proof: removing this refusal failed `cutover assessment cannot age past freshness after inventory reads complete` with its named fault.
  if (!isFresh(startedAt, now().getTime(), request.maxAgeMs)) refusePreflight('inventory-stale');
  if (
    request.nodes.length !== 1 ||
    request.storage.node !== request.docker.node ||
    request.storage.node !== request.nodes[0].name
  )
    // Proof: removing this refusal failed `capacity node scope cannot omit coexistence` with its named fault.
    refusePreflight('capacity-scope-mismatch');
  if (request.storage.path === '' || docker.filesystem.state !== 'observed')
    // Proof: removing this refusal failed `unknown external storage binding refuses` with its named fault.
    refusePreflight('storage-binding-required');
  const filesystem = docker.filesystem;
  const storageClass = storageClasses.find((entry) => entry.name === request.storage.storageClass);
  if (
    storageClass?.provisioner !== request.storage.provisioner ||
    storageClass.provisioner !== 'rancher.io/local-path' ||
    filesystem.path !== request.storage.path
  )
    // Proof: removing this refusal failed `unbound storage class refuses` with its named fault.
    refusePreflight('storage-binding-mismatch');
  for (const pin of request.claims) {
    const claim = claims.find((entry) => entry.uid === pin.uid);
    const volume = volumes.find((entry) => entry.uid === pin.volumeUID);
    if (
      claim === undefined ||
      volume === undefined ||
      claim.storageClass !== storageClass.name ||
      volume.storageClass !== storageClass.name ||
      readMemoryMiB(claim.capacity) < readMemoryMiB(claim.requested)
    )
      // Proof: removing this refusal failed `wrong PVC capacity refuses` with its named fault.
      refusePreflight('storage-claim-capacity-mismatch');
    if (
      !volume.path.startsWith(request.storage.path + '/') ||
      !volume.nodes.includes(request.storage.node) ||
      filesystem.claimPaths.find((entry) => entry.path === volume.path)?.device !==
        filesystem.device
    )
      // Proof: removing this refusal failed `wrong PV filesystem device refuses` with its named fault.
      refusePreflight('storage-filesystem-mismatch');
  }
  const storageRequiredMiB =
    request.candidate
      .filter((entry) => entry.existingPodUID === '')
      .reduce((sum, entry) => sum + entry.storageMiB + entry.ephemeralMiB, 0) +
    request.storage.headroomMiB;
  if (
    storageRequiredMiB * 1048576 > filesystem.availableBytes ||
    docker.volumes.some(
      (volume) =>
        request.docker.retainedVolumes.includes(volume.name) &&
        volume.availableBytes < request.storage.headroomMiB * 1048576,
    )
  )
    // Proof: removing this refusal failed `filesystem free-space deficit refuses` with its named fault.
    refusePreflight('storage-capacity-exceeded');
  const storage = {
    path: filesystem.path,
    device: filesystem.device,
    availableMiB: filesystem.availableBytes / 1048576,
    requiredMiB: storageRequiredMiB,
    headroomMiB: request.storage.headroomMiB,
  };
  const blockers: string[] = [];
  for (const { candidate, requiredClaims } of selectedClaims) {
    for (const required of requiredClaims) {
      const pin = candidate.claims.find((claim) => claim.name === required.name);
      const claim = claims.find(
        (entry) => entry.namespace === candidate.namespace && entry.name === required.name,
      );
      const volume = volumes.find((entry) => entry.name === pin?.volume);
      if (
        pin === undefined ||
        claim?.uid !== pin.uid ||
        claim.phase !== 'Bound' ||
        claim.volume !== pin.volume ||
        claim.storageClass !== storageClass.name ||
        readMemoryMiB(claim.capacity) < required.requestedMiB ||
        volume?.uid !== pin.volumeUID ||
        volume.claimUID !== pin.uid ||
        volume.policy !== 'Retain'
      ) {
        // Proof: dropping this blocker failed `new PVC absent from the observed target remains a migration blocker`.
        blockers.push('candidate-storage-unready-or-unreviewed');
        continue;
      }
      if (
        !volume.path.startsWith(request.storage.path + '/') ||
        !volume.nodes.includes(request.storage.node) ||
        filesystem.claimPaths.find((entry) => entry.path === volume.path)?.device !==
          filesystem.device
      )
        // Proof: removing this refusal failed `selected new PVC must bind the observed local filesystem device` with its named fault.
        refusePreflight('storage-filesystem-mismatch');
    }
  }
  for (const { candidate, replicas, images } of selectedClaims) {
    const actual = resources.find(
      (entry) =>
        entry.kind === candidate.kind &&
        entry.name === candidate.name &&
        entry.namespace === candidate.namespace,
    );
    // Proof: dropping this blocker failed `absent selected candidate cannot certify migration despite complete inventory`.
    if (actual === undefined) blockers.push('candidate-unobserved');
    else if (
      !actual.ready ||
      actual.generation !== actual.observedGeneration ||
      !request.resources.some((entry) => entry.uid === actual.uid)
    )
      blockers.push('candidate-unready-or-unreviewed');
    if (actual !== undefined) {
      const owned = pods.filter((pod) => {
        const parent = resources.find(
          (entry) => entry.uid === pod.ownerUID && entry.kind === 'ReplicaSet',
        );
        const controllerUID = parent === undefined ? pod.ownerUID : parent.ownerUID;
        return (
          controllerUID === actual.uid &&
          pod.namespace === candidate.namespace &&
          !['Succeeded', 'Failed'].includes(pod.phase)
        );
      });
      if (
        owned.length < replicas ||
        owned.some(
          (pod) =>
            pod.node !== candidate.node ||
            !pod.ready ||
            pod.images.length !== images.length ||
            !images.every((image) => pod.images.includes(image)) ||
            pod.imageIDs.length !== images.length ||
            pod.imageIDs.some((imageID) => imageID === ''),
        )
      )
        // Proof: dropping this blocker failed `owned pod scheduled elsewhere cannot certify selected placement`.
        blockers.push('candidate-placement-unobserved-or-unready');
    }
  }
  return {
    schemaVersion: 1,
    candidateRevision: request.candidateRevision,
    requestSHA256: createHash('sha256').update(JSON.stringify(request)).digest('hex'),
    fleetId: request.fleetId,
    targetMarker: identity.marker,
    startedAt,
    completedAt: now().toISOString(),
    inventoryComplete: true,
    migrationReady: blockers.length === 0,
    capacityDimensions: {
      memory: 'assessed',
      cpu: 'assessed',
      storage: 'assessed',
    },
    readinessScope: 'preflight-prerequisites-only',
    selection: request.candidate,
    futureScope:
      'declared planning allowances; second-instance admission requires its own selected artifacts',
    capacityBasis:
      'Kubernetes CPU requests plus finite Docker CPU bounds; observed and selected memory request/limit peaks; new storage demand plus headroom against observed free bytes',
    promotionAuthorized: false,
    blockers,
    observed,
    provenance,
    capacity,
    storage,
    rollback,
  };
}

/** Safe receipt shared with the production observability packet. */
export type ObservabilityPreflightReceipt = Awaited<ReturnType<typeof preflightObservability>>;

/** Exclusively create an owner-only receipt. Failures never overwrite an earlier operation. */
export async function runObservabilityPreflight(argv: readonly string[]): Promise<void> {
  if (
    argv.length !== 6 ||
    argv[0] !== '--request' ||
    argv[2] !== '--output' ||
    argv[4] !== '--ssh-transport'
  )
    // Proof: removing this refusal failed `CLI rejects unreviewed argument shapes before reading any target` with its named fault.
    refusePreflight('usage: --request <path> --output <new-path> --ssh-transport <path>');
  let source: string;
  try {
    source = await readFile(argv[1], 'utf8');
  } catch (failure) {
    if (
      typeof failure === 'object' &&
      failure !== null &&
      'code' in failure &&
      failure.code === 'ENOENT'
    )
      // Proof: removing this refusal failed `missing reviewed request differs` with its named fault.
      refusePreflight('request-missing');
    // Proof: removing this refusal failed `unreadable reviewed request differs` with its named fault.
    return refusePreflight('request-unreadable');
  }
  let input: unknown;
  try {
    input = parseProjectionJSON(source);
  } catch {
    // Proof: removing this refusal failed `malformed reviewed request differs` with its named fault.
    return refusePreflight('request-malformed');
  }
  const request = decodeObservabilityPreflightRequest(input);
  const transport = await readSshTransport(argv[5], process.env, [request.docker.host]);
  const receipt = await preflightObservability(request, { transport });
  try {
    await writeFile(argv[3], `${JSON.stringify(receipt, undefined, 2)}\n`, {
      // Proof: replacing wx with w failed `occupied output preserves prior receipt`.
      flag: 'wx',
      mode: 0o600,
    });
  } catch {
    // Proof: replacing exclusive creation with ordinary write failed `occupied output preserves prior receipt` with its named fault.
    return refusePreflight('receipt-create-failed');
  }
  console.log(
    `observability preflight: inventory complete; migration ${receipt.migrationReady ? 'prerequisites ready' : 'blocked'}`,
  );
}
