import { createHash } from 'node:crypto';

import { type } from 'arktype';

import type { PlatformManifest } from './platform-manifests';

const ObjectStoreWorkload = type({
  kind: "'Deployment' | 'Job'",
  spec: {
    template: {
      spec: {
        containers: type({
          command: 'string[]',
          env: 'object[]',
          volumeMounts: 'object[]',
          'readinessProbe?': 'object',
        })
          .array()
          .exactlyLength(1),
        volumes: 'object[]',
      },
    },
  },
});

/**
 * Pin the executable transport contract, including trust mounts and readiness, independently
 * of image/capacity validation. Changes require a new executable refusal proof before repinning.
 */
export function assertBackupTransport(manifests: readonly PlatformManifest[]): void {
  const fingerprints = {
    Deployment: '5ccf0633be09a661e830da29d5f901720d67ed213159d1e7ba5b33093ceae714',
    Job: '6136853647dcbf02d197b82ffc28e7ac2bf30b29c2b505a1919edac801e2680b',
  };
  const seen = new Set<string>();
  for (const manifest of manifests) {
    if (manifest.path !== 'backup/local/object-store.yaml') continue;
    const workload = ObjectStoreWorkload(manifest.document);
    if (workload instanceof type.errors) continue;
    const pod = workload.spec.template.spec;
    const container = pod.containers[0];
    const digest = createHash('sha256')
      .update(
        JSON.stringify([
          container.command,
          container.env,
          container.volumeMounts,
          pod.volumes,
          container.readinessProbe,
        ]),
      )
      .digest('hex');
    // Proof: removing this comparison admitted plaintext mc in validatePlatform (platform.test.ts).
    if (digest !== fingerprints[workload.kind])
      throw new Error(`${workload.kind} object-store TLS contract differs`);
    seen.add(workload.kind);
  }
  // Proof: removing this guard accepted the server with its command absent (platform.test.ts).
  if (seen.size !== 2)
    throw new Error('object-store TLS contract requires server and bucket initializer');
}
