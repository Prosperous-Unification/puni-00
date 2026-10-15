/** Private resolved Compose snapshot identity retained across a stopped-writer transition. */
export interface BackendSnapshot {
  path: string;
  sha256: string;
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('maintenance configuration is malformed');
  return Object.fromEntries(Object.keys(value).map((key) => [key, Reflect.get(value, key)]));
}
const ENTRYPOINT = ['bun', '-e', 'setInterval(() => {}, 60000)'];

/** Freeze the effective image/service working directory into both derived snapshots. */
export function backendWorkingDirectory(
  application: string,
  name: string,
  imageDirectory: string,
): string {
  const config = record(JSON.parse(application));
  const services = record(config['services']);
  const service = record(services[name]);
  const directory = service['working_dir'] === undefined ? imageDirectory : service['working_dir'];
  // Proof: removing effective-workdir validation admitted null/traversal metadata; the working-directory negative failed.
  if (
    typeof directory !== 'string' ||
    !/^\/[A-Za-z0-9_./-]+$/.test(directory) ||
    directory.split('/').includes('..')
  )
    throw new Error('backend effective working directory is missing or malformed');
  return JSON.stringify({
    ...config,
    services: { ...services, [name]: { ...service, working_dir: directory } },
  });
}

/** Derive an inert service from the same validated application configuration and digest. */
export function maintenanceConfig(application: string, name: string): string {
  const config = record(JSON.parse(application));
  const services = record(config['services']);
  const service = record(services[name]);
  return JSON.stringify({
    ...config,
    services: {
      ...services,
      [name]: {
        ...service,
        // Proof: inherited app entrypoint/command/health/restart negatives fail with these overrides removed.
        entrypoint: ENTRYPOINT,
        command: [],
        healthcheck: { disable: true },
        restart: 'no',
        init: true,
      },
    },
  });
}

/** Exact-ID, immutable-image and inert effective configuration proof before each maintenance CLI. */
export function assertMaintenanceContainer(
  output: string,
  identity: string,
  imageId: string,
  snapshot: string,
  name: string,
): void {
  const container = record(JSON.parse(output));
  const state = record(container['State']);
  const config = record(container['Config']);
  const host = record(container['HostConfig']);
  const expected = record(record(record(JSON.parse(snapshot))['services'])[name]);
  const refusal = (condition: boolean): void => {
    if (condition)
      throw new Error('maintenance container identity or effective configuration differs');
  };
  // Proof: omitting each ID/image/state/namespace/entrypoint/cmd/health/restart/env/mount/workdir/port check admitted its drift negative; watched maintenance logs record each failure.
  refusal(
    !/^[a-f0-9]{64}$/.test(identity) ||
      !/^sha256:[a-f0-9]{64}$/.test(imageId) ||
      container['Id'] !== identity ||
      container['Image'] !== imageId ||
      config['Image'] !== expected['image'] ||
      state['Running'] !== true ||
      state['Paused'] !== false ||
      state['Restarting'] !== false ||
      host['Init'] !== true ||
      host['PidMode'] !== '' ||
      host['Privileged'] !== false ||
      !(
        host['CapAdd'] === null ||
        (Array.isArray(host['CapAdd']) && host['CapAdd'].length === 0)
      ) ||
      JSON.stringify(config['Entrypoint']) !== JSON.stringify(ENTRYPOINT) ||
      !(config['Cmd'] === null || JSON.stringify(config['Cmd']) === '[]') ||
      JSON.stringify(record(config['Healthcheck'])['Test']) !== '["NONE"]' ||
      record(host['RestartPolicy'])['Name'] !== 'no',
  );
  if (expected['working_dir'] !== undefined)
    refusal(config['WorkingDir'] !== expected['working_dir']);
  const ports = host['PortBindings'];
  refusal(!(ports === null || Object.keys(record(ports)).length === 0));
  const environment = config['Env'];
  if (
    !Array.isArray(environment) ||
    environment.some((entry: unknown) => typeof entry !== 'string')
  )
    throw new Error('maintenance environment is malformed');
  for (const [key, value] of Object.entries(record(expected['environment'])))
    refusal(typeof value !== 'string' || !environment.includes(`${key}=${value}`));
  const volumes = expected['volumes'];
  const mounts = container['Mounts'];
  if (!Array.isArray(volumes) || !Array.isArray(mounts))
    throw new Error('maintenance mounts are malformed');
  refusal(volumes.length !== mounts.length);
  for (const rawVolume of volumes) {
    const volume = record(rawVolume);
    const candidates = mounts
      .map(record)
      .filter((mount) => mount['Destination'] === volume['target']);
    const mounted = candidates.at(0);
    refusal(
      candidates.length !== 1 ||
        mounted === undefined ||
        mounted['Type'] !== volume['type'] ||
        mounted['Source'] !== volume['source'] ||
        mounted['RW'] !== (volume['read_only'] !== true),
    );
  }
}
