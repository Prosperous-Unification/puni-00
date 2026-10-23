import { readFields, readIdentity } from './managed-cohort';

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
        mounts: container['Mounts'],
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
