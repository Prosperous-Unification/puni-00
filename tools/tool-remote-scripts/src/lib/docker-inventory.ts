import { posix } from 'node:path';

import { readFields, readIdentity, readString } from './managed-cohort';

/**
 * Native Mounts are an unordered destination-keyed set. Validates complete record entries
 * and canonical absolute unique targets, then sorts a fresh array retaining each original
 * mount object and every native field/value. It never normalizes a target or mutates raw input.
 */
export function orderMounts(raw: unknown): Record<string, unknown>[] {
  // Proof: native-array omission admitted an array-like object; the array boundary negative failed.
  if (!Array.isArray(raw)) throw new Error('Docker inventory mounts must be an array');
  const seen = new Set<string>();
  const mounts = raw.map((entry: unknown) => {
    // Proof: native-entry dependency fault skipped record validation; the array-entry negative failed.
    const mount = readFields(entry);
    // Proof: native-own-target omission admitted an inherited destination; the native-entry negative failed.
    if (!Object.hasOwn(mount, 'Destination'))
      throw new Error('Docker inventory mount destination absent');
    const destination = readString(mount['Destination']);
    // Proof: native-target fault admitted relative/noncanonical/NUL targets; identity negatives failed.
    if (
      !destination.startsWith('/') ||
      destination.includes('\0') ||
      posix.resolve(destination) !== destination
    )
      throw new Error('Docker inventory mount destination is not canonical absolute');
    // Proof: native-duplicate fault admitted equal duplicate entries; equal-duplicate identity negative failed.
    if (seen.has(destination)) throw new Error('Docker inventory mount destination duplicated');
    seen.add(destination);
    return { destination, mount };
  });
  // Proof: native-order and native-total-order faults failed all-container/Unicode permutation positives.
  // Native-field-loss and native-raw-mutation faults failed full-field drift and raw-input negatives.
  return mounts
    .sort((left, right) =>
      left.destination < right.destination ? -1 : left.destination > right.destination ? 1 : 0,
    )
    .map(({ mount }) => mount);
}

/** Exact complete membership and effective writable/process identity, excluding volatile telemetry. */
export function identifyInventory(containers: readonly unknown[]): unknown {
  return containers
    .map((raw) => {
      const container = readFields(raw);
      const state = readFields(container['State']);
      return {
        id: readIdentity(container['Id']),
        name: container['Name'],
        image: container['Image'],
        config: container['Config'],
        host: container['HostConfig'],
        // Proof: native-inventory-order omission refused complete-inventory permutations.
        mounts: orderMounts(container['Mounts']),
        networks: readFields(container['NetworkSettings'])['Networks'],
        restarts: container['RestartCount'],
        process: {
          running: state['Running'],
          paused: state['Paused'],
          restarting: state['Restarting'],
          dead: state['Dead'],
          pid: state['Pid'],
          startedAt: state['StartedAt'],
        },
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}
