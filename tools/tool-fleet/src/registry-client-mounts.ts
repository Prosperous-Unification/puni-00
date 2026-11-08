import { constants } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import { posix } from 'node:path';

import { completeRegistryOperation } from './registry-operation-completion';

export interface RegistryClientMount {
  readonly id: string;
  readonly parentId: string;
  readonly path: string;
  readonly writable: boolean;
}

type MountObservation =
  | { readonly state: 'visible'; readonly mount: RegistryClientMount }
  | { readonly state: 'covered'; readonly covering: RegistryClientMount };

function decodeMount(path: string): string {
  const decoded = path.replace(/\\(040|011|012|134)/g, (_escape: string, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8)),
  );
  if (!decoded.startsWith('/') || posix.normalize(decoded) !== decoded || decoded.includes('\0'))
    throw new Error('Invalid client namespace mount path');
  return decoded;
}

/** Read kernel mount identities and per-mount access modes; reject malformed or duplicate identities. */
export async function readRegistryClientMounts(): Promise<RegistryClientMount[]> {
  const mounts = (await readFile('/proc/self/mountinfo', 'utf8'))
    .trim()
    .split('\n')
    .map((line) => {
      const fields = line.split(' ');
      if (fields.length < 10 || !/^[1-9]\d*$/.test(fields[0]) || !/^[1-9]\d*$/.test(fields[1]))
        throw new Error('Malformed client namespace mount identity');
      const options = fields[5].split(',');
      if (options.includes('ro') === options.includes('rw'))
        throw new Error('Malformed client namespace mount access mode');
      return {
        id: fields[0],
        parentId: fields[1],
        path: decodeMount(fields[4]),
        writable: options.includes('rw'),
      };
    });
  if (new Set(mounts.map((mount) => mount.id)).size !== mounts.length)
    throw new Error('Duplicate client namespace mount identity');
  return mounts;
}

function ancestors(
  mount: RegistryClientMount,
  mounts: readonly RegistryClientMount[],
): Set<string> {
  const identities = new Set([mount.id]);
  let current = mount;
  for (;;) {
    const parent = mounts.find((candidate) => candidate.id === current.parentId);
    if (parent === undefined) {
      if (current.path !== '/') throw new Error('Missing client mount parent identity');
      return identities;
    }
    if (identities.has(parent.id)) throw new Error('Cyclic client mount parent identity');
    identities.add(parent.id);
    current = parent;
  }
}

async function descriptorMount(
  path: string,
  mounts: readonly RegistryClientMount[],
): Promise<RegistryClientMount> {
  // Linux O_PATH pins protected proc/device mountpoints without reading or opening the underlying device.
  const descriptor = await open(path, 0x200000 | constants.O_NOFOLLOW);
  return completeRegistryOperation(
    async () => {
      const identity = /^mnt_id:\s+([1-9]\d*)$/m.exec(
        await readFile(`/proc/self/fdinfo/${String(descriptor.fd)}`, 'utf8'),
      );
      if (identity === null) throw new Error('Missing client mount descriptor identity');
      const selected = mounts.filter((mount) => mount.id === identity[1]);
      if (selected.length !== 1)
        throw new Error('Unknown or ambiguous client mount descriptor identity');
      return selected[0];
    },
    () => descriptor.close(),
  );
}

/**
 * Observe the active mount through a held O_PATH descriptor. Kernel mountinfo also lists mounts
 * hidden below later ancestor overlays. Missing paths are covered only when the nearest existing
 * ancestor resolves to a different covering mount, outside the expected mount's parent lineage.
 * Permission/I/O errors, a missing mountpoint within its own lineage, and unknown IDs remain fatal.
 */
export async function observeRegistryClientMount(
  mount: RegistryClientMount,
  mounts: readonly RegistryClientMount[],
): Promise<MountObservation> {
  const lineage = ancestors(mount, mounts);
  let path = mount.path;
  for (;;) {
    let visible: RegistryClientMount;
    try {
      visible = await descriptorMount(path, mounts);
    } catch (cause) {
      if (
        !(cause instanceof Error) ||
        !('code' in cause) ||
        (cause.code !== 'ENOENT' && cause.code !== 'ENOTDIR') ||
        path === '/'
      )
        throw cause;
      path = posix.dirname(path);
      continue;
    }
    if (visible.id === mount.id && path === mount.path) return { state: 'visible', mount: visible };
    // Proof: absent mountpoint inside its own parent is incorrectly marked covered without the lineage predicate.
    if (
      lineage.has(visible.id) ||
      !(
        mount.path === visible.path ||
        mount.path.startsWith(visible.path === '/' ? '/' : visible.path + '/')
      )
    )
      throw new Error('Client mountpoint is not covered by a different visible mount', {
        cause: { expected: mount, observed: visible, resolvedPath: path, lineage: [...lineage] },
      });
    return { state: 'covered', covering: visible };
  }
}
