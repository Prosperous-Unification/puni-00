import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import {
  managedImageReferences,
  readRegistrySource,
  readTrustedEnrollment,
  runRegistryProcess,
  serveRegistryReader,
  withRegistryExecutable,
} from '@tools/registry-publication';
import { type } from 'arktype';

const Text = type('string > 0');
const Path = Text.narrow(isAbsolute);
const Hash = /^[a-f0-9]{64}$/;
const Pin = type({ path: Path, sha256: Hash, '+': 'reject' });
export const DockerHost = type({ machineId: /^[a-f0-9]{32}$/, catalog: Pin, '+': 'reject' });
export const DockerScope = type({
  registryId: Text,
  owner: Text,
  product: Text,
  environment: Text,
  target: Text,
  '+': 'reject',
});
const Environment = type({
  owner: Text,
  product: Text,
  environment: Text,
  target: Text,
  root: Path,
  prefix: 'string',
  project: Text,
  containers: type({ name: Text, service: Text, '+': 'reject' }).array().atLeastLength(1),
  '+': 'reject',
});
const Catalog = type({
  schemaVersion: '1',
  registryId: Text,
  machineId: /^[a-f0-9]{32}$/,
  environments: Environment.array().atLeastLength(1),
  '+': 'reject',
});
const Input = type({
  registryId: Text,
  registryUrl: Text,
  docker: Pin,
  host: DockerHost,
  '+': 'reject',
});
const Snapshot = type({
  name: Text,
  image: Text,
  running: 'boolean',
  health: Text,
  labels: type('object').or('null'),
  '+': 'reject',
});
export type DockerContainer = typeof Snapshot.infer;
export type DockerOwnership = typeof Catalog.infer;

/** Read the complete root-owned host mapping and actual machine identity before projecting environment ownership. */
export async function readDockerOwnership(
  input: unknown,
  read: typeof readTrustedEnrollment = readTrustedEnrollment,
) {
  const configuration = Input(input);
  if (configuration instanceof type.errors)
    throw new Error('Malformed Docker host source configuration');
  const raw = await read(configuration.host.catalog.path);
  if (
    createHash('sha256').update(JSON.stringify(raw)).digest('hex') !==
    configuration.host.catalog.sha256
  )
    throw new Error('Docker host ownership catalog digest differs');
  const catalog = Catalog(raw);
  const machine = (await readRegistrySource('/etc/machine-id', 128)).text.trim();
  if (
    catalog instanceof type.errors ||
    catalog.registryId !== configuration.registryId ||
    catalog.machineId !== configuration.host.machineId ||
    machine !== configuration.host.machineId
  )
    throw new Error('Docker host ownership registry or machine identity differs');
  const containers = new Set<string>();
  const environments = new Set<string>();
  const roots = new Set<string>();
  for (const environment of catalog.environments) {
    if (
      environment.target !== `compose:${environment.root}` ||
      (await realpath(environment.root)) !== environment.root ||
      environments.has(environment.environment) ||
      roots.has(environment.root)
    )
      throw new Error('Ambiguous Docker environment ownership');
    environments.add(environment.environment);
    roots.add(environment.root);
    for (const tier of ['be', 'gw', 'fe'])
      for (const color of ['blue', 'green'])
        if (
          !environment.containers.some(
            (container) =>
              container.name === `${environment.prefix}${tier}-01-${color}` &&
              container.service === `${environment.prefix}${tier}-01-${color}`,
          )
        )
          throw new Error('Docker catalog omits configured Compose consumers');
    for (const container of environment.containers) {
      if (containers.has(container.name)) throw new Error('Ambiguous Docker container ownership');
      containers.add(container.name);
    }
  }
  return { configuration, catalog };
}
/** Enumerate all containers, including stopped/unrecognized names; every managed reference must have exact trusted label ownership. */
export async function scanDockerConsumers(
  input: unknown,
  read: typeof readTrustedEnrollment = readTrustedEnrollment,
) {
  const { configuration, catalog } = await readDockerOwnership(input, read);
  return withRegistryExecutable(configuration.docker, async (executable, cwd) => {
    const run = (args: string[]) => runRegistryProcess([executable, ...args], cwd);
    const names = (await run(['ps', '-a', '--format', '{{.Names}}']))
      .trim()
      .split('\n')
      .filter(Boolean);
    if (names.length > 1024 || new Set(names).size !== names.length)
      throw new Error('Docker source inventory exceeds capacity or repeats names');
    const containers = new Map<string, DockerContainer>();
    const owners = new Map<string, string>();
    const references: { repository: string; digest: string }[] = [];
    const revisions = [JSON.stringify(catalog)];
    for (const name of names) {
      const raw = await run([
        'inspect',
        '--format',
        '{"name":{{json .Name}},"image":{{json .Config.Image}},"running":{{json .State.Running}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}"absent"{{end}},"labels":{{json .Config.Labels}}}',
        name,
      ]);
      const snapshot = Snapshot(JSON.parse(raw) as unknown);
      if (snapshot instanceof type.errors || snapshot.name !== `/${name}`)
        throw new Error('Malformed or foreign Docker container observation');
      containers.set(name, snapshot);
      revisions.push(raw);
      const managed = managedImageReferences([snapshot.image], configuration.registryUrl);
      references.push(...managed);
      const matches = catalog.environments.flatMap((environment) =>
        environment.containers
          .filter((container) => container.name === name)
          .map((container) => ({ environment, container })),
      );
      if (matches.length === 0) {
        if (managed.length !== 0)
          throw new Error('Unmapped managed Docker container prevents complete ownership');
        continue;
      }
      if (matches.length !== 1) throw new Error('Ambiguous Docker container owner');
      const { environment, container } = matches[0];
      const labels = type({
        'com.docker.compose.project': Text,
        'com.docker.compose.service': Text,
        'com.docker.compose.project.working_dir': Path,
      })(snapshot.labels);
      // Proof: removing project equality admits foreign labels in the same-host consumer test.
      if (
        labels instanceof type.errors ||
        labels['com.docker.compose.project'] !== environment.project ||
        labels['com.docker.compose.service'] !== container.service ||
        labels['com.docker.compose.project.working_dir'] !== environment.root
      )
        throw new Error(
          'Docker container labels differ from trusted project/service/root ownership',
        );
      owners.set(name, environment.environment);
    }
    return {
      catalog,
      containers,
      owners,
      references,
      sourceRevision: `sha256:${createHash('sha256').update(JSON.stringify(revisions)).digest('hex')}`,
    };
  });
}
/** Registry-scope census is always retained alongside environment projections; it never supplies first-install history. */
export async function readDockerConsumers(input: unknown) {
  const observed = await scanDockerConsumers(input);
  return { references: observed.references, sourceRevision: observed.sourceRevision };
}
if (import.meta.main) await serveRegistryReader(readDockerConsumers);
