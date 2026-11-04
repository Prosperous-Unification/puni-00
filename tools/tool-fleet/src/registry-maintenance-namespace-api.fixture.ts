import { readFile, writeFile } from 'node:fs/promises';

import { readRegistryBytes } from './registry-stream';

type Fields = Record<string, unknown>;
interface Resource extends Fields {
  apiVersion: string;
  kind: string;
  metadata: Fields & {
    name: string;
    namespace?: string;
    uid: string;
    resourceVersion: string;
    generation: number;
    annotations?: Record<string, string>;
  };
  spec?: Fields;
  status?: Fields;
}

function readFields(input: unknown): Fields {
  // Proof: removing the object guard lets boolean annotations become an empty accepted map.
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error('Fixture JSON object required');
  // Boundary: JSON.parse yields an object with unknown-valued fields after the object/array/null check.
  return input as Fields;
}
function readString(input: unknown): string {
  // Proof: removing string validation admits a numeric Service selector value.
  if (typeof input !== 'string') throw new Error('Fixture string required');
  return input;
}
function readStrings(input: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(readFields(input)).map(([key, value]) => [key, readString(value)]),
  );
}
function readResource(input: unknown): Resource {
  const fields = readFields(input);
  const metadata = readFields(fields['metadata']);
  const generation = metadata['generation'];
  // Proof: the metadata fault becomes accepted when generation validation is removed.
  if (typeof generation !== 'number' || !Number.isInteger(generation))
    throw new Error('Fixture generation required');
  const optional = (name: 'spec' | 'status' | 'data') =>
    fields[name] === undefined ? {} : { [name]: readFields(fields[name]) };
  return {
    ...fields,
    apiVersion: readString(fields['apiVersion']),
    kind: readString(fields['kind']),
    metadata: {
      ...metadata,
      name: readString(metadata['name']),
      uid: readString(metadata['uid']),
      resourceVersion: readString(metadata['resourceVersion']),
      generation,
      ...(metadata['namespace'] === undefined
        ? {}
        : { namespace: readString(metadata['namespace']) }),
      ...(metadata['annotations'] === undefined
        ? {}
        : { annotations: readStrings(metadata['annotations']) }),
    },
    ...optional('spec'),
    ...optional('status'),
    ...optional('data'),
  };
}
function readPatch(input: unknown): { op: 'test' | 'add'; path: string; value: unknown }[] {
  if (!Array.isArray(input)) throw new Error('Fixture patch array required');
  return input.map((entry: unknown) => {
    const fields = readFields(entry);
    if (
      // Proof: removing the exact key check admits an arbitrary patch field.
      Object.keys(fields).sort().join(',') !== 'op,path,value' ||
      (fields['op'] !== 'test' && fields['op'] !== 'add')
    )
      throw new Error('Unexpected fixture patch shape');
    return { op: fields['op'], path: readString(fields['path']), value: fields['value'] };
  });
}

/**
 * Simulate the fixture API with small explicit validators instead of loading the production
 * schema engine for each fake kubectl process. Production resource validation still runs
 * unchanged for every observation. A validated registry Deployment patch ending at zero
 * replicas includes stopSelection with its UID and pre-advance resourceVersion; other
 * selections omit it. The returned changed state is proposed, not yet written.
 */
export function respondRegistryFixture(
  args: string[],
  serialized: string,
  mutation?: unknown,
): {
  response: unknown;
  changed: string | null;
  stopSelection?: { uid: string; resourceVersion: string };
} {
  // Proof: removing the kubeconfig allowlist admits the arbitrary-config negative.
  if (
    args[0] !== 'kubectl' ||
    args[1] !== '--kubeconfig' ||
    ![
      '/etc/puni/registry-maintenance-management.kubeconfig',
      '/etc/puni/registry-maintenance-production.kubeconfig',
    ].includes(args[2] ?? '') ||
    args[3] !== '--request-timeout=15s'
  )
    throw new Error('Unexpected fixture API boundary');
  const verb = args[4];
  // Proof: removing this guard admits delete with an otherwise valid bounded patch.
  if (verb !== 'get' && verb !== 'patch') throw new Error('Unexpected fixture API verb');
  const selected = args.slice(5);
  if (
    JSON.stringify(selected) ===
    JSON.stringify(['pods', '--all-namespaces', '--chunk-size=0', '--output=json'])
  )
    return {
      response: { kind: 'PodList', metadata: { resourceVersion: '1', continue: '' }, items: [] },
      changed: null,
    };
  if (
    JSON.stringify(selected) ===
    JSON.stringify([
      'endpointslices.discovery.k8s.io',
      '--namespace',
      'puni-registry',
      '--selector=kubernetes.io/service-name=registry',
      '--chunk-size=0',
      '--output=json',
    ])
  )
    return {
      response: {
        kind: 'EndpointSliceList',
        metadata: { resourceVersion: '1', continue: '' },
        items: [],
      },
      changed: null,
    };
  const namespace = selected[0] === '--namespace' ? selected[1] : undefined;
  const offset = namespace === undefined ? 0 : 2;
  const kind = selected[offset]?.split('.')[0];
  const name = selected[offset + 1];
  const tail = selected.slice(offset + 2);
  // Proof: removing exact option matching admits an extra command option.
  if (
    JSON.stringify(tail) !==
    JSON.stringify(
      verb === 'get'
        ? ['--output=json']
        : ['--type=json', '--patch-file=/dev/stdin', '--output=json'],
    )
  )
    throw new Error('Unexpected fixture API command options');
  // Proof: removing the bound admits a valid oversized resource document (not malformed JSON).
  if (Buffer.byteLength(serialized) > 1024 ** 2) throw new Error('Fixture resource bound');
  const state = readFields(JSON.parse(serialized));
  // Proof: removing the exact state shape admits an extra top-level field.
  if (Object.keys(state).join(',') !== 'resources' || !Array.isArray(state['resources']))
    throw new Error('Unexpected fixture state shape');
  // Proof: bypassing complete validation admits an invalid unselected resource at the end of the census.
  const resources = state['resources'].map((entry: unknown) => readResource(entry));
  // Proof: independent name and namespace predicate removals admit the foreign-resource negatives.
  const resource = resources.find(
    (current) =>
      current.kind === kind &&
      current.metadata.name === name &&
      current.metadata.namespace === namespace,
  );
  if (resource === undefined) throw new Error('Missing exact fixture resource');
  if (verb === 'get') return { response: resource, changed: null };
  const patch = readPatch(mutation);
  // Proof: independent UID and revision predicate removals admit their mismatched patch negatives.
  if (
    patch.length < 3 ||
    patch[0]?.op !== 'test' ||
    patch[0].path !== '/metadata/uid' ||
    patch[0].value !== resource.metadata.uid ||
    patch[1]?.op !== 'test' ||
    patch[1].path !== '/metadata/resourceVersion' ||
    patch[1].value !== resource.metadata.resourceVersion
  )
    throw new Error('Fixture API patch lacks matching UID/revision preconditions');
  for (const operation of patch.slice(2)) {
    // Proof: removing this guard admits a test operation in the mutation portion.
    if (operation.op !== 'add' || resource.spec === undefined)
      throw new Error('Unexpected fixture mutation');
    if (operation.path === '/metadata/annotations' && kind === 'Kustomization')
      resource.metadata.annotations = readStrings(operation.value);
    else if (operation.path === '/spec/suspend' && kind === 'Kustomization') {
      // Proof: removing boolean validation stores the string true as suspension.
      if (typeof operation.value !== 'boolean')
        throw new Error('Fixture suspension must be boolean');
      resource.spec['suspend'] = operation.value;
    } else if (
      operation.path === '/spec/replicas' &&
      kind === 'Deployment' &&
      name === 'registry'
    ) {
      // Proof: removing replica validation accepts a second replica.
      if (operation.value !== 0 && operation.value !== 1)
        throw new Error('Fixture replicas must be zero or one');
      resource.spec['replicas'] = operation.value;
    } else if (operation.path === '/spec/selector' && kind === 'Service' && name === 'registry')
      resource.spec['selector'] = readStrings(operation.value);
    // Proof: removing this refusal silently accepts a sourceRef mutation.
    else throw new Error('Unexpected fixture mutation field');
  }
  // Proof (actual fixture parser): removing the zero-replica predicate forwards a restore-one patch; advancing the captured revision changes the required old revision.
  const stopSelection =
    kind === 'Deployment' && name === 'registry' && resource.spec?.['replicas'] === 0
      ? { uid: resource.metadata.uid, resourceVersion: resource.metadata.resourceVersion }
      : undefined;
  resource.metadata.generation++;
  resource.metadata.resourceVersion = String(Number(resource.metadata.resourceVersion) + 1);
  if (kind === 'Kustomization')
    resource.status = {
      ...resource.status,
      lastHandledReconcileAt: resource.metadata.annotations?.['reconcile.fluxcd.io/requestedAt'],
    };
  if (kind === 'Deployment')
    resource.status = {
      observedGeneration: resource.metadata.generation,
      readyReplicas: resource.spec?.['replicas'],
      availableReplicas: resource.spec?.['replicas'],
    };
  return {
    response: resource,
    changed: JSON.stringify({ resources }),
    ...(stopSelection === undefined ? {} : { stopSelection }),
  };
}

/**
 * Read one bounded patch and the fixed synthetic state as root. Only the exact pressure
 * workload requires the private Unix stop receipt for a validated zero-replica selection.
 * The proposed revision remains local until that receipt validates; only then is the fixed
 * state written and response printed. Bootstrap receipts prove no pressure effect. Other
 * existing fixture modes retain their original simulated scheduler behavior.
 */
async function main(): Promise<void> {
  if (process.getuid?.() !== 0) throw new Error('Fixture API requires root guardian');
  const args = process.argv.slice(2);
  const path = '/root/task8-fixture/kubernetes.json';
  const mutation: unknown =
    args[4] === 'patch'
      ? JSON.parse(
          new TextDecoder().decode(
            await readRegistryBytes(Bun.stdin.stream(), 4096, 'Fixture API patch'),
          ),
        )
      : undefined;
  const reply = respondRegistryFixture(args, await readFile(path, 'utf8'), mutation);
  // Proof (modeled Unix): omitting this required call accepts a missing endpoint; removing exact mode selection invokes it for the existing index fixture.
  if (
    reply.stopSelection !== undefined &&
    (await readFile('/proc/1/cmdline', 'utf8')) ===
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0'
  ) {
    // Proof (modeled deadline): omission needs independent50ms fetch/body rescues; the requested10s deadline is scheduled at5ms.
    const signal = AbortSignal.timeout(10000);
    const stopped = await fetch('http://localhost/stop', {
      unix: '/root/task8-fixture/pressure-stop.sock',
      method: 'POST',
      // Proof (modeled fetch): omitting the selected signal requires the independent50ms connection rescue.
      body: JSON.stringify(reply.stopSelection),
      signal,
    });
    const bytes = await readRegistryBytes(
      // Proof (modeled response): removing explicit body cancellation requires the independent50ms stream rescue.
      stopped.body === null ? null : stopped.body.pipeThrough(new TransformStream(), { signal }),
      // Proof (modeled response): increasing this bound accepts oversized valid receipt JSON.
      4096,
      'Fixed pressure stop response',
    );
    // Proof (modeled response): omission accepts status500 carrying an otherwise valid receipt.
    if (stopped.status !== 200) throw new Error('Fixed pressure stop refused');
    const stoppedFields = readFields(JSON.parse(new TextDecoder().decode(bytes)));
    if (stoppedFields['scope'] === 'bootstrap') {
      // Proof (modeled response): omission accepts extra bootstrap fields.
      if (Object.keys(stoppedFields).join(',') !== 'scope')
        throw new Error('Malformed bootstrap stop response');
      // Proof (modeled response): omitting this compound boundary accepts extra selected fields or groupAbsent:false.
    } else if (
      Object.keys(stoppedFields).sort().join(',') !==
        'allocation,exitCode,groupAbsent,instanceSha256,pid,requestSha256,scope,signal,stage,startTicks' ||
      stoppedFields['scope'] !== 'pressure' ||
      stoppedFields['allocation'] !== 'ENOSPC' ||
      (stoppedFields['stage'] !== 'open' && stoppedFields['stage'] !== 'write') ||
      typeof stoppedFields['pid'] !== 'number' ||
      !Number.isSafeInteger(stoppedFields['pid']) ||
      stoppedFields['pid'] <= 1 ||
      stoppedFields['pid'] > 2147483647 ||
      !/^[1-9][0-9]{0,19}$/.test(readString(stoppedFields['startTicks'])) ||
      !/^[a-f0-9]{64}$/.test(readString(stoppedFields['instanceSha256'])) ||
      !/^[a-f0-9]{64}$/.test(readString(stoppedFields['requestSha256'])) ||
      stoppedFields['groupAbsent'] !== true ||
      !(
        (stoppedFields['exitCode'] === 143 && stoppedFields['signal'] === 'SIGTERM') ||
        (stoppedFields['exitCode'] === 0 && stoppedFields['signal'] === null)
      )
    )
      throw new Error('Malformed selected pressure stop response');
  }
  // Proof (modeled file/Unix): moving this write before the stop advances the state-file revision despite a missing endpoint, or before held closure.
  if (reply.changed !== null) await writeFile(path, reply.changed, { mode: 0o600 });
  console.log(JSON.stringify(reply.response));
}

if (import.meta.main) await main();
