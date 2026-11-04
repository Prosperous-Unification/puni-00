import { type } from 'arktype';

import { withdrawnRegistrySelector } from './registry-maintenance-cluster';
import {
  type RegistryMaintenanceInstallation,
  verifyRegistryHostArtifact,
} from './registry-maintenance-installation';
import {
  type RegistryResourcePin,
  verifyRegistryResource,
} from './registry-maintenance-observation';
import {
  assertRegistryMaintenanceLock,
  awaitMaintenanceChild,
} from './registry-maintenance-process';
import { consumeRegistryStream } from './registry-stream';

const Action = type({ kind: "'stop'", '+': 'reject' })
  .or({ kind: "'withdraw'", '+': 'reject' })
  .or({ kind: "'replicas'", value: '0 | 1', '+': 'reject' })
  .or({ kind: "'service'", withdrawn: 'boolean', '+': 'reject' })
  .or({
    kind: "'owner'",
    suspended: 'boolean',
    requestedAt: 'string <= 1024 | null',
    '+': 'reject',
  });
type Action = typeof Action.infer;

/** Fixed-field mutations carry UID/resourceVersion tests in the same API transaction; arbitrary JSON patch paths are never accepted. */
export function registryMaintenancePatch(
  observation: unknown,
  input: unknown,
  ordinarySelector?: Record<string, string>,
): { op: 'test' | 'add'; path: string; value: unknown }[] {
  const current = type({
    metadata: {
      uid: 'string > 0',
      resourceVersion: 'string > 0',
      'annotations?': 'Record<string, string>',
    },
  }).assert(observation);
  const action = Action.assert(input);
  const patch: { op: 'test' | 'add'; path: string; value: unknown }[] = [
    { op: 'test', path: '/metadata/uid', value: current.metadata.uid },
    { op: 'test', path: '/metadata/resourceVersion', value: current.metadata.resourceVersion },
  ];
  switch (action.kind) {
    case 'stop':
    case 'replicas':
      patch.push({
        op: 'add',
        path: '/spec/replicas',
        value: action.kind === 'stop' ? 0 : action.value,
      });
      break;
    case 'withdraw':
    case 'service': {
      const selector =
        action.kind === 'withdraw' || action.withdrawn
          ? withdrawnRegistrySelector
          : type('Record<string, string>').assert(ordinarySelector);
      if (Object.keys(selector).length === 0) throw new Error('Empty registry service selector');
      patch.push({ op: 'add', path: '/spec/selector', value: selector });
      break;
    }
    case 'owner': {
      const annotations = { ...current.metadata.annotations };
      if (action.requestedAt === null) delete annotations['reconcile.fluxcd.io/requestedAt'];
      else annotations['reconcile.fluxcd.io/requestedAt'] = action.requestedAt;
      patch.push(
        { op: 'add', path: '/spec/suspend', value: action.suspended },
        { op: 'add', path: '/metadata/annotations', value: annotations },
      );
      break;
    }
  }
  return patch;
}

/**
 * Root helper's fixed Kubernetes capability. Every executable/config is installed and hashed,
 * every resource belongs to that installation, mutation fields are a closed union, stdin carries
 * patches, and loader environment is discarded. Native groups retain FD3 and are reaped under
 * the root control signal/deadline before a result is returned. No arbitrary command port exists.
 * Restoration supplies a synchronous freshness guard, called immediately before each native mutation spawn after all awaited observations.
 */
export async function createRegistryKubernetes(
  installed: RegistryMaintenanceInstallation,
  descriptor: number,
  signal: AbortSignal,
  beforeMutation?: () => void,
) {
  await assertRegistryMaintenanceLock(installed.journalPath, descriptor, 59001);
  await verifyRegistryHostArtifact(installed.kubernetes);
  await verifyRegistryHostArtifact(installed.managementKubeconfig, true);
  await verifyRegistryHostArtifact(installed.productionKubeconfig, true);
  const management = [
    ...installed.owners,
    ...installed.sources.map((source) => source.resource),
    installed.controller,
  ];
  const production = [
    installed.node,
    installed.service,
    installed.journalPvc,
    installed.journalPv,
    installed.ordinary.pvc,
    installed.ordinary.pv,
    installed.ordinary.guard,
    installed.ordinary.deployment,
    ...(installed.recovery.state === 'enrolled'
      ? [
          installed.recovery.pvc,
          installed.recovery.pv,
          installed.recovery.guard,
          installed.recovery.deployment,
        ]
      : []),
  ];
  const select = (cluster: 'management' | 'production', pin: RegistryResourcePin) => {
    const candidates = cluster === 'management' ? management : production;
    if (!candidates.some((candidate) => JSON.stringify(candidate) === JSON.stringify(pin)))
      throw new Error('Kubernetes resource is outside fixed registry installation');
    const group = pin.apiVersion.includes('/') ? '.' + pin.apiVersion.split('/')[0] : '';
    return [
      ...(pin.namespace === null ? [] : ['--namespace', pin.namespace]),
      pin.kind + group,
      pin.name,
    ];
  };
  const invoke = async (
    cluster: 'management' | 'production',
    args: string[],
    patch?: string,
  ): Promise<unknown> => {
    signal.throwIfAborted();
    const interrupted = new AbortController();
    const deadline = AbortSignal.any([signal, interrupted.signal, AbortSignal.timeout(30000)]);
    const config =
      cluster === 'management' ? installed.managementKubeconfig : installed.productionKubeconfig;
    // Proof: expiry injected during the required resource GET must prevent native PATCH spawn in registry-client-mutation.test.ts.
    if (patch !== undefined) beforeMutation?.();
    // The closure constructs every argv entry from fixed verbs/resources above. No request supplies argv or environment.
    const child = Bun.spawn(
      [
        installed.kubernetes.path,
        'kubectl',
        '--kubeconfig',
        config.path,
        '--request-timeout=15s',
        ...args,
      ],
      {
        env: { PATH: '/usr/bin:/bin', LANG: 'C' },
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe', descriptor],
      },
    );
    const lifetime = awaitMaintenanceChild(child, deadline);
    const bounded = async (
      stream: ReadableStream<Uint8Array>,
      maximum: number,
      retain: boolean,
    ) => {
      const chunks: Uint8Array[] = [];
      try {
        await consumeRegistryStream(stream, maximum, 'Fixed Kubernetes response', (chunk) => {
          if (retain) chunks.push(chunk);
        });
        return Buffer.concat(chunks).toString('utf8');
      } catch (cause) {
        interrupted.abort(cause);
        throw cause;
      }
    };
    const write = (async () => {
      try {
        if (patch !== undefined) {
          await child.stdin.write(patch);
          await child.stdin.flush();
        }
        await child.stdin.end();
      } catch (cause) {
        interrupted.abort(cause);
        throw cause;
      }
    })();
    const outcomes = await Promise.allSettled([
      lifetime,
      bounded(child.stdout, 8 * 1024 ** 2, true),
      bounded(child.stderr, 65536, false),
      write,
    ]);
    for (const outcome of outcomes)
      if (outcome.status === 'rejected')
        throw new Error('Fixed Kubernetes operation failed; effect may require recovery', {
          cause: outcome.reason,
        });
    // Boundary: require the indexed subprocess response even when unchecked-index typing assumes it exists.
    const output = outcomes[1] as (typeof outcomes)[1] | undefined;
    if (output?.status !== 'fulfilled' || typeof output.value !== 'string')
      throw new Error('Missing Kubernetes response');
    return JSON.parse(output.value);
  };
  const read = async (
    cluster: 'management' | 'production',
    pin: RegistryResourcePin,
  ): Promise<unknown> => {
    const args = select(cluster, pin);
    return invoke(cluster, ['get', ...args, '--output=json']);
  };
  return {
    read,
    async patch(
      cluster: 'management' | 'production',
      pin: RegistryResourcePin,
      input: Action,
    ): Promise<void> {
      const action = Action.assert(input);
      const args = select(cluster, pin);
      if (
        (action.kind === 'owner' && !installed.owners.some((owner) => owner.uid === pin.uid)) ||
        (['stop', 'replicas'].includes(action.kind) &&
          ![
            installed.ordinary.deployment.uid,
            ...(installed.recovery.state === 'enrolled' ? [installed.recovery.deployment.uid] : []),
          ].includes(pin.uid)) ||
        (['withdraw', 'service'].includes(action.kind) && pin.uid !== installed.service.uid)
      )
        throw new Error('Fixed mutation does not match installed resource role');
      const current = verifyRegistryResource(pin, await read(cluster, pin));
      const patch = registryMaintenancePatch(current, action, installed.serviceSelector);
      const changed = await invoke(
        cluster,
        ['patch', ...args, '--type=json', '--patch-file=/dev/stdin', '--output=json'],
        JSON.stringify(patch),
      );
      verifyRegistryResource(pin, changed);
    },
    async pods(): Promise<unknown[]> {
      const response = await invoke('production', [
        'get',
        'pods',
        '--all-namespaces',
        '--chunk-size=0',
        '--output=json',
      ]);
      return completeList(response, 'PodList');
    },
    async endpoints(): Promise<unknown[]> {
      const response = await invoke('production', [
        'get',
        'endpointslices.discovery.k8s.io',
        '--namespace',
        'puni-registry',
        '--selector=kubernetes.io/service-name=registry',
        '--chunk-size=0',
        '--output=json',
      ]);
      return completeList(response, 'EndpointSliceList');
    },
  };
}

function completeList(input: unknown, kind: 'PodList' | 'EndpointSliceList'): unknown[] {
  const list = type({
    kind: 'string',
    metadata: { resourceVersion: 'string > 0', 'continue?': 'string' },
    items: 'unknown[]',
  }).assert(input);
  if (list.kind !== kind || (list.metadata.continue !== undefined && list.metadata.continue !== ''))
    throw new Error('Incomplete fixed Kubernetes list response');
  return list.items;
}
