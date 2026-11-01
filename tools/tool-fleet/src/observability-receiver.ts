import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';

import { readMemoryMiB } from './observability-capacity';
import { assertCandidatePodResources } from './observability-pod-resources';
import { type PlatformManifest, podSpecOf } from './platform-manifests';

const Labels = type({ 'app.kubernetes.io/name': "'alert-receiver'" });
const Container = type({
  name: "'receiver'",
  image:
    "'docker.io/library/busybox:1.36.1@sha256:73aaf090f3d85aa34ee199857f03fa3a95c8ede2ffd4cc2cdb5b94e566b11662'",
  command: 'string[]',
  env: type({ name: 'string', value: 'string' }).array(),
  ports: type({ name: "'http'", containerPort: '8080' }).array().exactlyLength(1),
  resources: 'unknown',
  securityContext: {
    allowPrivilegeEscalation: 'false',
    readOnlyRootFilesystem: 'true',
    capabilities: { drop: ["'ALL'"] },
  },
  volumeMounts: type({ name: "'scratch'", mountPath: "'/tmp'" }).array().exactlyLength(1),
});
// Proof: Task40 current-role/mount/closed-pod relaxations admitted renamed roles, foreign mounts and extra init roles.
const Pod = type({
  automountServiceAccountToken: 'false',
  securityContext: {
    runAsNonRoot: 'true',
    runAsUser: '1000',
    seccompProfile: { type: "'RuntimeDefault'" },
  },
  containers: Container.array().exactlyLength(1),
  volumes: type({ name: "'scratch'", emptyDir: { sizeLimit: 'string|number' } })
    .array()
    .exactlyLength(1),
}).onDeepUndeclaredKey('reject');
// Proof: Task40 current-owner relaxation accepted an extra replica.
const Deployment = type({
  apiVersion: "'apps/v1'",
  kind: "'Deployment'",
  metadata: { name: "'alert-receiver'", namespace: "'observability'" },
  spec: {
    replicas: '1',
    selector: { matchLabels: Labels },
    template: { metadata: { labels: Labels }, spec: 'unknown' },
  },
}).onDeepUndeclaredKey('reject');
const service = {
  apiVersion: 'v1',
  kind: 'Service',
  metadata: { name: 'alert-receiver', namespace: 'observability' },
  spec: {
    selector: { 'app.kubernetes.io/name': 'alert-receiver' },
    ports: [{ name: 'http', port: 8080, targetPort: 'http' }],
  },
};
const policy = [
  { name: 'RECEIVER_BODY_BYTES', value: '65536' },
  { name: 'RECEIVER_HISTORY_BYTES', value: '8388608' },
  { name: 'RECEIVER_READ_SECONDS', value: '10' },
];
function refuse(): never {
  throw new Error('local receiver candidate differs');
}

/** Require the current local fixture's reviewed writer, input/history policy and candidate storage maps.
 * Throws for absent/malformed/changed source, including a command that stops consuming its policy.
 * The command fingerprint binds its complete executable bytes, not a substring assertion.
 * Historical structural/image decoding remains independent; neither this nor a CGI control certifies runtime fit.
 */
export function assertReceiverCandidate(manifests: readonly PlatformManifest[]): void {
  const selected = manifests.filter(
    (manifest) => manifest.path === 'observability/local/receiver.yaml',
  );
  // Proof: Task40 current-cardinality removal accepted a duplicate owning document.
  if (selected.length !== 2) refuse();
  const workload = Deployment(selected[0].document);
  // Proof: Task40 current-service removal accepted a changed Service endpoint.
  if (workload instanceof type.errors || !isDeepStrictEqual(selected[1].document, service))
    refuse();
  const pod = Pod(podSpecOf(workload));
  if (pod instanceof type.errors) refuse();
  const receiver = pod.containers[0];
  // Proof: Task40 current-resource-reader substitution accepted malformed supplied quantities.
  const resources = assertCandidatePodResources(receiver.resources);
  // Proof: Task40 current-resource-values removal accepted a changed positive ephemeral limit.
  if (
    !isDeepStrictEqual(resources, {
      requests: { cpu: '5m', memory: '8Mi', 'ephemeral-storage': '32Mi' },
      limits: { cpu: '100m', memory: '32Mi', 'ephemeral-storage': '64Mi' },
    })
  )
    refuse();
  // Proof: Task40 current-scratch substitution accepted a wrong scratch capacity.
  if (readMemoryMiB(String(pod.volumes[0].emptyDir.sizeLimit), refuse) !== 32) refuse();
  // Proof: Task40 current-policy removal accepted a changed body limit.
  if (!isDeepStrictEqual(receiver.env, policy)) refuse();
  // Proof: Task40 current-command removal accepted a command that ignored all writer policy.
  if (
    receiver.command.length !== 3 ||
    receiver.command[0] !== 'sh' ||
    receiver.command[1] !== '-c' ||
    createHash('sha256').update(receiver.command[2]).digest('hex') !==
      'acb116fadefbd82953f618548f4721eb74e0406bf1bfb2cfbea9062b51ed9b32'
  )
    refuse();
}
