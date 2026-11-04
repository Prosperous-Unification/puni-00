import { realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';

import { type } from 'arktype';

// Proof: removing absolute-path or node-type validation makes the actual stopped-action relative/malformed-node tests accept unsafe evidence.
const Pod = type({
  metadata: { namespace: 'string > 0' },
  spec: {
    'nodeName?': 'string > 0',
    'volumes?': type({
      name: 'string > 0',
      'ephemeral?': 'unknown',
      'persistentVolumeClaim?': { claimName: 'string > 0' },
      'hostPath?': { path: type('string > 0').narrow(isAbsolute) },
    }).array(),
  },
});

function parseRegistryPodVolumes(input: unknown[], claims: readonly string[], node: string | null) {
  const pods = Pod.array().assert(input);
  let claimsStorage = false;
  const hostPaths: string[] = [];
  const unresolvedVolumes: string[] = [];
  for (const pod of pods) {
    if (pod.spec.volumes === undefined) continue;
    for (const volume of pod.spec.volumes) {
      // Proof: removing namespace/name selection fails the retained-PVC identity test; removing PVC retention lets the stopped-action recovery-claim test reopen.
      if (volume.persistentVolumeClaim !== undefined) {
        if (
          pod.metadata.namespace === 'puni-registry' &&
          claims.includes(volume.persistentVolumeClaim.claimName)
        )
          claimsStorage = true;
        else if (node !== null && (pod.spec.nodeName === undefined || pod.spec.nodeName === node))
          unresolvedVolumes.push(
            'PVC ' + pod.metadata.namespace + '/' + volume.persistentVolumeClaim.claimName,
          );
      }
      // Proof: omitting generic ephemeral claim collection lets the actual stopped-action ephemeral-claim test verify writer absence.
      if (
        volume.ephemeral !== undefined &&
        node !== null &&
        (pod.spec.nodeName === undefined || pod.spec.nodeName === node)
      )
        unresolvedVolumes.push('ephemeral volume ' + pod.metadata.namespace + '/' + volume.name);
      // Proof: removing the assigned-node filter fails other-node; excluding unscheduled pods lets unscheduled-alias pass the actual stopped action.
      if (
        volume.hostPath !== undefined &&
        (node === null || pod.spec.nodeName === undefined || pod.spec.nodeName === node)
      )
        hostPaths.push(volume.hostPath.path);
    }
  }
  return { claimsStorage, hostPaths, unresolvedVolumes };
}

function overlapsRegistryPath(source: string, paths: readonly string[]): boolean {
  return paths.some(
    (path) =>
      path === source ||
      path.startsWith(`${source === '/' ? '' : source}/`) ||
      source.startsWith(path + '/'),
  );
}

/** Classify literal PVC/path declarations only. False does not prove writer absence: aliases require {@link registryPodsUseStorage}'s filesystem observations. */
export function registryPodsDeclareStorage(
  input: unknown[],
  claims: readonly string[],
  paths: readonly string[],
): boolean {
  const declared = parseRegistryPodVolumes(input, claims, null);
  return (
    declared.claimsStorage || declared.hostPaths.some((path) => overlapsRegistryPath(path, paths))
  );
}

/**
 * A pending or unscheduled pod can become a writer after the process census. Resolve every
 * relevant nonliteral hostPath with kernel device/inode identity. The supplied paths are
 * installed dedicated registry filesystem views, verified by the root action's mount audit;
 * any hostPath on those devices can write or consume their bounded capacity. Ancestor inode
 * identities also catch bind/magic/symlink aliases of parents, including a host root exposed
 * from another pathname. Paths assigned to another node are never resolved on this machine.
 * Missing/unreadable store or hostPath metadata refuses the audit; it never means unrelated.
 * Unrecognized PVCs and generic ephemeral claims on this node or unscheduled pods refuse:
 * another PV could expose
 * the same filesystem. Their backing paths are not part of this fixed installation's evidence.
 * This is a fresh observation, not a lock against a privileged operator changing node mounts.
 */
export async function registryPodsUseStorage(
  input: unknown[],
  claims: readonly string[],
  paths: readonly [string, ...string[]],
  node: string,
): Promise<boolean> {
  const declared = parseRegistryPodVolumes(input, claims, node);
  if (
    declared.claimsStorage ||
    declared.hostPaths.some((path) => overlapsRegistryPath(path, paths))
  )
    return true;
  // Proof: removing this refusal lets the actual stopped-action unresolved-claim test verify writer absence.
  if (declared.unresolvedVolumes.length > 0)
    throw new Error(
      'Registry writer exclusion lacks backing-path evidence for ' +
        declared.unresolvedVolumes.join(', '),
    );
  if (declared.hostPaths.length === 0) return false;
  const devices = new Set<bigint>();
  const ancestors = new Set<string>();
  for (const path of paths) {
    // Proof: absent storage rejects in the identity test; swallowing denied store metadata fails the actual stopped-action unreadable-store test.
    const canonical = await realpath(path);
    const observed = await stat(canonical, { bigint: true });
    // Proof: removing this check accepts a real file as storage in the file-used-as-store identity test.
    if (!observed.isDirectory()) throw new Error('Registry pod writer scope is not a directory');
    devices.add(observed.dev);
    let parent = dirname(canonical);
    for (;;) {
      // Proof: swallowing denied ancestor metadata lets the actual stopped-action unreadable-ancestor test verify writer absence.
      const ancestor = await stat(parent, { bigint: true });
      ancestors.add(`${String(ancestor.dev)}:${String(ancestor.ino)}`);
      const next = dirname(parent);
      if (next === parent) break;
      parent = next;
    }
  }
  for (const path of declared.hostPaths) {
    // Proof: swallowing ENOENT/EACCES lets the actual stopped-action missing/unreadable tests verify writer absence.
    const observed = await stat(path, { bigint: true });
    // Proof: removing device identity fails the stopped-action alias test; removing ancestor identity fails the different-device host-root identity test.
    if (
      devices.has(observed.dev) ||
      ancestors.has(`${String(observed.dev)}:${String(observed.ino)}`)
    )
      return true;
  }
  return false;
}
