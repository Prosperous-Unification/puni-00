import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';

import { readMemoryMiB } from './observability-capacity';
import { assertCandidatePodResources } from './observability-pod-resources';
import { type PlatformManifest, podSpecOf } from './platform-manifests';

const Identity = type({
  kind: 'string',
  metadata: { name: 'string', namespace: 'string' },
  spec: 'object',
});
const Container = type({ name: 'string', resources: 'unknown' });
const Pod = type({
  containers: Container.array(),
  'initContainers?': Container.array(),
  'ephemeralContainers?': Container.array(),
});
const roles = [
  ['registry/base/registry.yaml', 'Deployment', 'puni-registry', 'registry', 'registry'],
  [
    'observability/prometheus/blackbox-exporter.yaml',
    'Deployment',
    'observability',
    'blackbox-exporter',
    'blackbox-exporter',
  ],
  ['backup/local/object-store.yaml', 'Deployment', 'puni-backup', 'object-store', 'minio'],
  ['backup/local/object-store.yaml', 'Job', 'puni-backup', 'object-store-buckets', 'buckets'],
  ['observability/kibana/objects/job.yaml', 'Job', 'observability', 'kibana-objects', 'apply'],
  [
    'observability/elastic/settings/settings.yaml',
    'Job',
    'observability',
    'elastic-settings',
    'apply',
  ],
  ['backup/elastic/snapshots.yaml', 'Job', 'observability', 'elastic-snapshots', 'apply'],
  ['backup/elastic/snapshots.yaml', 'CronJob', 'observability', 'elastic-snapshot-check', 'apply'],
  [
    'observability/base/signals.yaml',
    'StatefulSet',
    'observability',
    'signal-collector',
    'collector',
  ],
  ['observability/base/signals.yaml', 'StatefulSet', 'observability', 'signal-gateway', 'gateway'],
  ['observability/base/metrics.yaml', 'Deployment', 'observability', 'signal-metrics', 'proxy'],
] as const;
function refuse(): never {
  throw new Error('common candidate native role or scratch differs');
}
/** Require each current owning path and native role, including all app/init maps; no historical inventory policy is changed.
 * Registered roles currently have one app container and no init/ephemeral containers. New roles require review.
 * The bucket's sole existing tmp emptyDir keeps its name and mount; only its positive cap is added.
 */
export function assertCommonNativeResources(manifests: readonly PlatformManifest[]): void {
  for (const [path, kind, namespace, name, container] of roles) {
    const matches = manifests.filter((manifest) => {
      if (manifest.path !== path) return false;
      const identity = Identity(manifest.document);
      return (
        !(identity instanceof type.errors) &&
        identity.kind === kind &&
        identity.metadata.name === name &&
        identity.metadata.namespace === namespace
      );
    });
    // Proof: Task25c3f native-required-role omission admitted duplicate registered source roles through validatePlatform.
    if (matches.length !== 1) refuse();
    const workload = Identity.assert(matches[0].document);
    const pod = Pod(podSpecOf(workload));
    if (pod instanceof type.errors) refuse();
    // Proof: Task25c3f native-role/init/ephemeral bypasses admitted renamed app and bounded unregistered roles.
    if (
      !isDeepStrictEqual(
        pod.containers.map((container) => container.name),
        [container],
      ) ||
      (pod.initContainers !== undefined && pod.initContainers.length !== 0) ||
      (pod.ephemeralContainers !== undefined && pod.ephemeralContainers.length !== 0)
    )
      refuse();
    for (const container of pod.containers) assertCandidatePodResources(container.resources);
    // Proof: Task25c3f scratch-call omission admitted absent scratch through this production checker.
    if (name === 'object-store-buckets') {
      const scratch = type({
        volumes: type({
          name: 'string',
          'emptyDir?': { sizeLimit: 'string|number', '+': 'reject' },
        }).array(),
        containers: type({
          volumeMounts: type({ name: 'string', mountPath: 'string' }).array(),
        }).array(),
      })(pod);
      if (scratch instanceof type.errors) refuse();
      const temporary = scratch.volumes.filter((volume) => volume.name === 'tmp');
      // Proof: Task25c3f scratch-positive/unique bypasses admitted zero caps and duplicate tmp volumes in bucket negatives.
      if (
        temporary.length !== 1 ||
        temporary[0].emptyDir === undefined ||
        readMemoryMiB(String(temporary[0].emptyDir.sizeLimit), refuse) <= 0
      )
        refuse();
      // Proof: Task25c3f scratch-mount omission admitted absent /tmp mounting through this production checker.
      if (
        scratch.containers[0].volumeMounts.filter(
          (mount) => mount.name === 'tmp' && mount.mountPath === '/tmp',
        ).length !== 1
      )
        refuse();
    }
  }
}
