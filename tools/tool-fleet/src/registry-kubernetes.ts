import { type } from 'arktype';

import { platformReleases } from './platform-releases';

const Container = type({ name: 'string > 0', image: 'string > 0' });
const Pod = type({
  containers: Container.array().atLeastLength(1),
  'initContainers?': Container.array(),
  'ephemeralContainers?': Container.array(),
  'volumes?': type({ name: 'string > 0', 'image?': { reference: 'string > 0' } }).array(),
});
const Template = type({ spec: Pod });
const Workload = type({ template: Template });
const CronJob = type({ jobTemplate: { spec: Workload } });
const Resource = type({
  apiVersion: 'string > 0',
  kind: 'string > 0',
  metadata: { name: 'string > 0' },
  'spec?': 'unknown',
});
const nonImageKinds = new Set([
  'v1/Namespace',
  'v1/Event',
  'v1/Endpoints',
  'discovery.k8s.io/v1/EndpointSlice',
  'events.k8s.io/v1/Event',
  'coordination.k8s.io/v1/Lease',
  'v1/Service',
  'v1/ServiceAccount',
  'v1/Secret',
  'v1/ConfigMap',
  'v1/PersistentVolume',
  'v1/PersistentVolumeClaim',
  'v1/ResourceQuota',
  'v1/LimitRange',
  'rbac.authorization.k8s.io/v1/Role',
  'rbac.authorization.k8s.io/v1/RoleBinding',
  'rbac.authorization.k8s.io/v1/ClusterRole',
  'rbac.authorization.k8s.io/v1/ClusterRoleBinding',
  'networking.k8s.io/v1/NetworkPolicy',
  'networking.k8s.io/v1/Ingress',
  'networking.k8s.io/v1/IngressClass',
  'storage.k8s.io/v1/StorageClass',
  'storage.k8s.io/v1/CSIDriver',
  'policy/v1/PodDisruptionBudget',
  'autoscaling/v2/HorizontalPodAutoscaler',
  'source.toolkit.fluxcd.io/v1/GitRepository',
  'source.toolkit.fluxcd.io/v1/HelmRepository',
  'source.toolkit.fluxcd.io/v1/OCIRepository',
]);

/**
 * Decode effective images from the supported Kubernetes resource contracts, independent of
 * replica count or Pod phase. Helm values use the exact locked release decoders. Unknown
 * custom controllers and Flux transformations require their owning adapter, never omission.
 */
export function kubernetesImageReferences(input: unknown): string[] {
  const resources = Resource.array()(input);
  if (resources instanceof type.errors) throw new Error('Malformed Kubernetes consumer resources');
  const images: string[] = [];
  for (const resource of resources) {
    const identity = `${resource.apiVersion}/${resource.kind}`;
    if (nonImageKinds.has(identity)) continue;
    if (identity === 'helm.toolkit.fluxcd.io/v2/HelmRelease') {
      const release = platformReleases.find((release) => release.name === resource.metadata.name);
      if (release === undefined) throw new Error('Unknown image-selecting Helm release');
      const spec = type({
        values: 'unknown',
        chart: {
          spec: {
            chart: 'string > 0',
            version: 'string > 0',
            sourceRef: {
              kind: "'GitRepository'",
              name: "'puni-platform'",
              namespace: "'flux-system'",
              '+': 'reject',
            },
            '+': 'reject',
          },
          '+': 'reject',
        },
        'valuesFrom?': 'unknown',
        'postRenderers?': 'unknown',
        'chartRef?': 'unknown',
      })(resource.spec);
      if (spec instanceof type.errors) throw new Error('Malformed Helm values');
      // Proof: registry-kubernetes's Helm override test accepted valuesFrom and postRenderers before this guard.
      if (
        spec.valuesFrom !== undefined ||
        spec.postRenderers !== undefined ||
        spec.chartRef !== undefined ||
        spec.chart.spec.chart !== `./infra/platform/${release.chart}` ||
        !release.chart.endsWith(`-${spec.chart.spec.version}.tgz`)
      )
        throw new Error('Unsupported Helm source or image transformation');
      images.push(...Object.values(release.imageReferences(spec.values)));
      continue;
    }
    let pod: unknown;
    if (identity === 'v1/Pod') pod = resource.spec;
    else if (
      [
        'apps/v1/Deployment',
        'apps/v1/StatefulSet',
        'apps/v1/DaemonSet',
        'apps/v1/ReplicaSet',
        'v1/ReplicationController',
        'batch/v1/Job',
      ].includes(identity)
    ) {
      const workload = Workload(resource.spec);
      if (workload instanceof type.errors) throw new Error('Malformed workload pod template');
      pod = workload.template.spec;
    } else if (identity === 'batch/v1/CronJob') {
      const cronjob = CronJob(resource.spec);
      if (cronjob instanceof type.errors) throw new Error('Malformed CronJob pod template');
      pod = cronjob.jobTemplate.spec.template.spec;
    } else throw new Error(`Unknown image-selecting resource ${identity}`);
    const parsed = Pod(pod);
    if (parsed instanceof type.errors) throw new Error('Malformed Kubernetes pod images');
    images.push(...parsed.containers.map((container) => container.image));
    for (const container of parsed.initContainers ?? []) images.push(container.image);
    for (const container of parsed.ephemeralContainers ?? []) images.push(container.image);
    for (const volume of parsed.volumes ?? [])
      if (volume.image !== undefined) images.push(volume.image.reference);
  }
  return [...new Set(images)];
}

/** Discovery may avoid reading these explicitly modeled non-image resources, including Secrets. */
export function isNonImageKubernetesResource(apiVersion: string, kind: string): boolean {
  return nonImageKinds.has(`${apiVersion}/${kind}`);
}
