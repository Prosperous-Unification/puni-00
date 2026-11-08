import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';

import type { DockerContainer } from './registry-docker-consumers';

/** Disposable native CLI responses; Docker itself is not substituted into the proof claims. */
export async function dockerOwnershipFixture() {
  const root = await scratchAsync('docker-ownership-');
  const machineId = (await readFile('/etc/machine-id', 'utf8')).trim();
  const environments: {
    owner: string;
    product: string;
    environment: string;
    target: string;
    root: string;
    prefix: string;
    project: string;
    containers: { name: string; service: string }[];
  }[] = [];
  for (const environment of ['a', 'b']) {
    const path = join(root, environment);
    await mkdir(join(path, 'compose'), { recursive: true });
    await mkdir(join(path, 'state'));
    await writeFile(join(path, 'base.yml'), 'services: {}\n');
    environments.push({
      owner: `operator-${environment}`,
      product: 'wbs',
      environment,
      target: `compose:${path}`,
      root: path,
      prefix: `${environment}-`,
      project: `fixture-${environment}`,
      containers: ['be', 'gw', 'fe'].flatMap((tier) =>
        ['blue', 'green'].map((color) => ({
          name: `${environment}-${tier}-01-${color}`,
          service: `${environment}-${tier}-01-${color}`,
        })),
      ),
    });
  }
  const catalog = { schemaVersion: 1, registryId: 'proof', machineId, environments };
  const inventory = join(root, 'containers.json');
  const routes = join(root, 'routing.json');
  await writeFile(inventory, '[]');
  await writeFile(
    routes,
    JSON.stringify({ apps: { http: { servers: { srv0: { routes: [] } } } } }),
  );
  const script = `#!/usr/bin/python3\nimport json,sys\nwith open(${JSON.stringify(inventory)}) as source: containers=json.load(source)\nif sys.argv[1]=='ps': print('\\n'.join(container['name'][1:] for container in containers))\nelif sys.argv[1]=='inspect': print(json.dumps(next(container for container in containers if container['name']=='/'+sys.argv[-1])))\nelif sys.argv[1]=='exec':\n with open(${JSON.stringify(routes)}) as source: print(source.read())\nelse: sys.exit(22)\n`;
  const executable = join(root, 'docker');
  await writeFile(executable, script, { mode: 0o700 });
  const docker = { path: executable, sha256: createHash('sha256').update(script).digest('hex') };
  const host = {
    machineId,
    catalog: {
      path: join(root, 'ownership.json'),
      sha256: createHash('sha256').update(JSON.stringify(catalog)).digest('hex'),
    },
  };
  const global = { registryId: 'proof', registryUrl: 'https://registry.test', docker, host };
  const source = (name: string) => {
    const environment = environments.find((environment) => environment.environment === name);
    if (environment === undefined) throw new Error('Unknown fixture environment');
    return {
      scope: {
        registryId: 'proof',
        owner: environment.owner,
        product: 'wbs',
        environment: name,
        target: environment.target,
      },
      host,
      docker,
      root: environment.root,
      prefix: environment.prefix,
      siteAddress: `${name}.test`,
      edgeContainer: 'edge',
      registryUrl: 'https://registry.test',
    };
  };
  const container = (
    environment: string,
    tier: string,
    color: string,
    image: string,
    running: boolean,
  ): DockerContainer => {
    const owner = environments.find((candidate) => candidate.environment === environment);
    if (owner === undefined) throw new Error('Unknown fixture container owner');
    const name = `${environment}-${tier}-01-${color}`;
    return {
      name: `/${name}`,
      image,
      running,
      health: running ? 'healthy' : 'absent',
      labels: {
        'com.docker.compose.project': owner.project,
        'com.docker.compose.service': name,
        'com.docker.compose.project.working_dir': owner.root,
      },
    };
  };
  const set = async (containers: DockerContainer[]) => {
    await writeFile(inventory, JSON.stringify(containers));
    await writeFile(
      routes,
      JSON.stringify({
        apps: {
          http: {
            servers: {
              srv0: {
                routes: containers
                  .filter((container) => container.running)
                  .map((container) => ({
                    match: [{ host: [`${container.name.slice(1, 2)}.test`] }],
                    handle: [
                      {
                        handler: 'reverse_proxy',
                        upstreams: [
                          {
                            dial: `${container.name.slice(1)}:${container.name.includes('-be-') ? '3100' : container.name.includes('-gw-') ? '3200' : '80'}`,
                          },
                        ],
                      },
                    ],
                  })),
              },
            },
          },
        },
      }),
    );
  };
  return {
    root,
    catalog,
    global,
    host,
    source,
    container,
    set,
    read: () => Promise.resolve(catalog),
  };
}
