import { AsyncLocalStorage } from 'node:async_hooks';
import { realpath } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';

export const dockerEnvironment = new AsyncLocalStorage<NodeJS.ProcessEnv>();

/** Freeze a local Docker transport for every k3d/Docker subprocess; remote capacity is unsupported. */
export function bindDockerEnvironment(
  endpoint: string,
  source: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  if (!/^unix:\/\/\/[^\s]+$/.test(endpoint))
    throw new Error('Creation evidence requires a local Unix Docker endpoint');
  const environment = Object.fromEntries(
    Object.entries(source).filter(
      ([name]) =>
        ![
          'DOCKER_CONTEXT',
          'DOCKER_TLS_VERIFY',
          'DOCKER_CERT_PATH',
          'DOCKER_TLS',
          'DOCKER_API_VERSION',
        ].includes(name),
    ),
  );
  environment['DOCKER_HOST'] = endpoint;
  return environment;
}

/** Recheck the captured daemon before each lifecycle operation; endpoint reuse grants no authority. */
export async function requireCapturedDaemon(
  expected: string,
  execute: (arguments_: readonly string[]) => Promise<string>,
): Promise<void> {
  if ((await execute(['info', '--format', '{{.ID}}'])).trim() !== expected)
    // Proof: Removing daemon comparison failed the changed-daemon consuming negative.
    throw new Error('Docker daemon identity changed');
}

/** Resolve context once; a remote endpoint cannot be compared with this host's memory/filesystem admission. */
export async function captureDockerEndpoint(
  execute: (arguments_: readonly string[]) => Promise<string>,
): Promise<string> {
  const explicit = process.env['DOCKER_CONTEXT'];
  const endpoint = explicit
    ? (
        await execute(['context', 'inspect', explicit, '--format', '{{.Endpoints.docker.Host}}'])
      ).trim()
    : (process.env['DOCKER_HOST'] ??
      (await execute(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])).trim());
  bindDockerEnvironment(endpoint, {});
  return `unix://${await realpath(endpoint.slice('unix://'.length))}`;
}

import { join } from 'node:path';

import { type } from 'arktype';

import type { CreationIdentity } from './creation-journal';
import { requireIdentity } from './creation-journal';
import { readCreationOperation } from './creation-receipts';
import {
  appendResource,
  readResourceFile,
  readResources,
  reserveResources,
  sealResources,
} from './creation-resources';
import {
  captureCreator,
  closeCreation,
  ContainerObservation,
  CreationClosure,
  CreationPlan,
  startCreationWitness,
  VolumeObservation,
} from './k3d-creation';

const fullId = /^[a-f0-9]{64}$/;
type Docker = (arguments_: readonly string[]) => Promise<string>;
const Binding = type({
  schemaVersion: '1',
  labId: 'string',
  attemptId: 'string',
  daemonId: 'string',
  endpoint: /^unix:\/\/\/[^\s]+$/,
  profile: "'app'|'platform'|'fleet'",
  '+': 'reject',
});
const Completion = type({ schemaVersion: '1', sha256: fullId, '+': 'reject' });
const ContainerProjection = type({
  id: fullId,
  name: 'string',
  image: /^sha256:[a-f0-9]{64}$/,
  configuredImage: 'string',
  networks: 'Record<string, unknown>',
  mounts: type({
    Type: "'volume'|'bind'|'tmpfs'",
    'Name?': 'string',
    'Driver?': 'string',
    Source: 'string',
    Destination: 'string',
    RW: 'boolean',
  }).array(),
});

/** Inspect only safe fields by full ID; never let Docker's fallback name lookup replace identity. */
export async function inspectCreatedContainer(
  id: string,
  docker: Docker,
): Promise<ContainerObservation> {
  const projection = ContainerProjection.assert(
    JSON.parse(
      await docker([
        'container',
        'inspect',
        id,
        '--format',
        '{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"configuredImage":{{json .Config.Image}},"networks":{{json .NetworkSettings.Networks}},"mounts":{{json .Mounts}}}',
      ]),
    ),
  );
  if (projection.id !== id) throw new Error('Docker container identity changed');
  const networkIds = Object.values(projection.networks).map(
    (network) => type({ NetworkID: fullId }).assert(network).NetworkID,
  );
  return ContainerObservation.assert({
    id,
    name: projection.name.replace(/^\//, ''),
    image: projection.image,
    configuredImage: projection.configuredImage,
    networkIds,
    mounts: projection.mounts.map((mount) => ({
      kind: mount.Type,
      name: mount.Type === 'volume' ? type('string>0').assert(mount.Name) : '',
      driver: mount.Type === 'volume' ? type('string>0').assert(mount.Driver) : '',
      source: mount.Source,
      destination: mount.Destination,
      rw: mount.RW,
    })),
  });
}

async function inspectNetwork(id: string, docker: Docker) {
  const network = type({ id: fullId, name: 'string', peers: 'Record<string,unknown>' }).assert(
    JSON.parse(
      await docker([
        'network',
        'inspect',
        id,
        '--format',
        '{"id":{{json .Id}},"name":{{json .Name}},"peers":{{json .Containers}}}',
      ]),
    ),
  );
  if (network.id !== id) throw new Error('Docker network identity changed');
  return { id, name: network.name, peers: Object.keys(network.peers).sort() };
}
async function inspectVolume(name: string, docker: Docker) {
  const volume = type({
    name: 'string',
    driver: 'string',
    mountpoint: 'string',
    createdAt: 'string',
  }).assert(
    JSON.parse(
      await docker([
        'volume',
        'inspect',
        name,
        '--format',
        '{"name":{{json .Name}},"driver":{{json .Driver}},"mountpoint":{{json .Mountpoint}},"createdAt":{{json .CreatedAt}}}',
      ]),
    ),
  );
  if (volume.name !== name) throw new Error('Docker volume locator changed');
  const consumers = (
    await docker(['ps', '--all', '--quiet', '--no-trunc', '--filter', `volume=${name}`])
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .sort();
  return VolumeObservation.assert({ ...volume, consumers });
}
const attribute = (name: string) =>
  `{{with index .Actor.Attributes "${name}"}}{{json .}}{{else}}""{{end}}`;
const eventProjection = `{"kind":{{json .Type}},"action":{{json .Action}},"id":{{json .Actor.ID}},"time":"{{.TimeNano}}","name":${attribute('name')},"container":${attribute('container')},"destination":${attribute('destination')},"driver":${attribute('driver')},"image":${attribute('image')}}`;

/**
 * Attach evidence to the existing up lifecycle. No creator or cleanup lives here: the caller
 * supplies direct returned IDs and invokes its existing pinned k3d command through capture.
 * All partial records survive errors. Temporary tools have creator/event evidence only.
 */
export async function createResourceWitness(
  directory: string,
  state: string,
  identity: CreationIdentity,
  input: CreationPlan,
  docker: Docker,
  eventCommand?: readonly string[],
) {
  const plan = CreationPlan.assert(input);
  if (plan.daemonId !== identity.daemonId) throw new Error('Creation plan daemon identity changed');
  const path = await reserveResources(directory, identity);
  await appendResource(path, 'plan', plan);
  await appendResource(state, 'creation-binding', {
    schemaVersion: 1,
    ...identity,
    endpoint: plan.endpoint,
    profile: plan.profile,
  });
  const creators: { name: string; id: string }[] = [];
  let networkId: string | undefined;
  let eventIndex = 0;
  const environment = dockerEnvironment.getStore() ?? process.env;
  const command = eventCommand ?? [
    'docker',
    'events',
    '--since',
    String(Math.floor(Date.now() / 1000)),
    ...['container', 'network', 'volume'].flatMap((kind) => ['--filter', `type=${kind}`]),
    ...['create', 'destroy', 'mount', 'unmount', 'connect', 'disconnect', 'start', 'die'].flatMap(
      (action) => ['--filter', `event=${action}`],
    ),
    '--format',
    eventProjection,
  ];
  const witness = startCreationWitness(command, environment, async (event) => {
    // Unrelated events retain only this closed projection; no arbitrary Actor attribute is read.
    await appendResource(path, `event-${String(++eventIndex).padStart(6, '0')}`, event);
  });
  const saveCreator = async (creator: { name: string; id: string }) => {
    witness.check();
    if (creators.some((previous) => previous.id === creator.id))
      throw new Error('Duplicate creator ID');
    await appendResource(path, `creator-${String(creators.length).padStart(4, '0')}`, creator);
    creators.push(creator);
  };
  return {
    path,
    async acceptNetwork(id: string, timeoutMs?: number) {
      await appendResource(path, 'network', { id: type(fullId).assert(id) });
      networkId = id;
      // Proof: Removing this wait reached registry creation without a network event; missing-handshake caller failed.
      await witness.requireNetwork(id, timeoutMs);
    },
    async acceptRegistry(id: string) {
      if (networkId === undefined) throw new Error('Network handshake is unresolved');
      await witness.requireNetwork(networkId);
      const registry = plan.expected.find((expected) => expected.role === 'registry');
      if (registry === undefined) throw new Error('Registry creation plan missing');
      await saveCreator({ name: registry.name, id: type(fullId).assert(id) });
    },
    async capture(
      command: readonly string[],
      names: readonly string[],
      extraEnvironment: NodeJS.ProcessEnv,
    ) {
      if (networkId === undefined) throw new Error('Network handshake is unresolved');
      await witness.requireNetwork(networkId);
      await requireCapturedDaemon(identity.daemonId, docker);
      await captureCreator(
        command,
        bindDockerEnvironment(plan.endpoint, { ...environment, ...extraEnvironment }),
        names,
        saveCreator,
        plan.expected.filter((expected) => expected.temporary).map((expected) => expected.name),
        // Proof: omitted signal let the existing k3d caller create a late resource after stream loss; caller negative failed.
        witness.signal,
      );
      witness.check();
    },
    check: witness.check,
    stop: () => witness.stop(),
    async close() {
      witness.check();
      if (networkId === undefined) throw new Error('Network identity unresolved');
      await requireCapturedDaemon(identity.daemonId, docker);
      const snapshots: ContainerObservation[] = [];
      for (const creator of creators) {
        const expected = plan.expected.find((candidate) => candidate.name === creator.name);
        if (expected === undefined) throw new Error('Unexpected creator');
        if (!expected.temporary) snapshots.push(await inspectCreatedContainer(creator.id, docker));
      }
      const temporaryIds = creators
        .filter((creator) =>
          plan.expected.some((expected) => expected.name === creator.name && expected.temporary),
        )
        .map((creator) => creator.id);
      const currentIds = (await docker(['ps', '--all', '--quiet', '--no-trunc']))
        .trim()
        .split('\n');
      if (temporaryIds.some((id) => currentIds.includes(id)))
        throw new Error('Temporary tools lifecycle did not finish');
      const volumeNames = [
        ...new Set([
          ...snapshots.flatMap((snapshot) =>
            snapshot.mounts.filter((mount) => mount.kind === 'volume').map((mount) => mount.name),
          ),
          ...witness.events
            .filter(
              (event) =>
                event.kind === 'volume' &&
                event.action === 'mount' &&
                temporaryIds.includes(event.container),
            )
            .map((event) => event.id),
        ]),
      ];
      const volumes = [];
      for (const name of volumeNames) volumes.push(await inspectVolume(name, docker));
      const network = await inspectNetwork(networkId, docker);
      witness.check();
      await witness.stop();
      witness.check();
      const closure = { plan, creators, snapshots, events: witness.events, volumes, network };
      closeCreation(closure);
      await appendResource(path, 'closure', closure);
      const sha256 = await sealResources(path);
      await appendResource(state, 'creation-complete', { schemaVersion: 1, sha256 });
      return { sha256, closure };
    },
  };
}

/** Read the strict consumer contract. Missing, changed, partial or legacy evidence never downgrades. */
export async function readLabCreationResources(
  directory: string,
  state: string,
  labId: string,
  profile: string,
) {
  const binding = Binding.assert(
    JSON.parse(await readResourceFile(join(state, 'creation-binding.json'))),
  );
  const identity = requireIdentity({
    labId: binding.labId,
    attemptId: binding.attemptId,
    daemonId: binding.daemonId,
  });
  if (binding.labId !== labId || binding.profile !== profile)
    throw new Error('Lab resource binding differs');
  const completion = Completion.assert(
    JSON.parse(await readResourceFile(join(state, 'creation-complete.json'))),
  );
  const entries = await readResources(directory, identity, completion.sha256);
  const closures = entries.filter((entry) => CreationClosure.allows(entry));
  if (closures.length !== 1) throw new Error('Complete resource closure missing');
  const closure = CreationClosure.assert(closures[0]);
  if (
    closure.plan.endpoint !== binding.endpoint ||
    closure.plan.daemonId !== binding.daemonId ||
    closure.plan.profile !== profile
  )
    throw new Error('Resource closure binding differs');
  const closed = closeCreation(closure);
  const network = await readCreationOperation(directory, identity, 'network');
  const registry = await readCreationOperation(directory, identity, 'registry');
  if (
    network.state !== 'created' ||
    registry.state !== 'created' ||
    network.dockerId !== closure.network.id ||
    !closure.creators.some(
      (creator) => creator.id === registry.dockerId && creator.name === registry.name,
    )
  )
    throw new Error('Direct creation receipts differ');
  return { binding, closure, ...closed };
}

/** Docker enumerates mount maps in varying order; retain and compare every field as an unordered attachment set. */
function canonicalContainer(container: ContainerObservation): ContainerObservation {
  return {
    ...container,
    networkIds: [...container.networkIds].sort(),
    mounts: [...container.mounts].sort((left, right) =>
      left.destination.localeCompare(right.destination),
    ),
  };
}

/** Revalidate the complete attachment set before the existing down path removes anything. */
export async function inspectResourceTeardown(
  evidence: Awaited<ReturnType<typeof readLabCreationResources>>,
  endpoint: string,
  docker: Docker,
): Promise<void> {
  if (endpoint !== evidence.binding.endpoint) throw new Error('Docker endpoint changed');
  await requireCapturedDaemon(evidence.binding.daemonId, docker);
  const network = await inspectNetwork(evidence.closure.network.id, docker);
  if (JSON.stringify(network) !== JSON.stringify(evidence.closure.network))
    // Proof: Removing this comparison accepted an unrelated endpoint without shared volumes; foreign-network caller failed.
    throw new Error('Network attachments changed');
  for (const container of evidence.containers) {
    const observed = await inspectCreatedContainer(container.id, docker);
    if (!isDeepStrictEqual(canonicalContainer(observed), canonicalContainer(container)))
      // Proof: Removing comparison accepted a replaced image; order-only real refusal and permutation RED/GREEN prove canonicalization retains the complete set.
      throw new Error('Container identity or attachments changed');
  }
  for (const volume of evidence.volumes) {
    const observed = await inspectVolume(volume.name, docker);
    if (JSON.stringify(observed) !== JSON.stringify(volume))
      throw new Error('Volume identity or attachments changed');
  }
  const currentIds = (await docker(['ps', '--all', '--quiet', '--no-trunc'])).trim().split('\n');
  const active = new Set(evidence.containers.map((container) => container.id));
  if (
    evidence.closure.creators.some(
      (creator) => !active.has(creator.id) && currentIds.includes(creator.id),
    )
  )
    throw new Error('Temporary creator identity reappeared');
}

/** Stop an already inspected owned container with bounded explicit signals; report any SIGKILL escalation. */
export async function stopRecordedContainer(
  id: string,
  docker: Docker,
  graceMs = 15_000,
): Promise<{ forced: boolean; exitCode: number }> {
  const inspect = async () =>
    type({ running: 'boolean', exitCode: 'number.integer', '+': 'reject' }).assert(
      JSON.parse(
        await docker([
          'container',
          'inspect',
          id,
          '--format',
          '{"running":{{json .State.Running}},"exitCode":{{json .State.ExitCode}}}',
        ]),
      ),
    );
  let status = await inspect();
  let forced = false;
  if (status.running) {
    await docker(['kill', '--signal', 'SIGTERM', id]);
    const deadline = Date.now() + graceMs;
    while (status.running && Date.now() < deadline) {
      await Bun.sleep(Math.min(100, graceMs));
      status = await inspect();
    }
    if (status.running) {
      forced = true;
      await docker(['kill', '--signal', 'SIGKILL', id]);
      const deadline = Date.now() + 5000;
      do {
        await Bun.sleep(100);
        status = await inspect();
      } while (status.running && Date.now() < deadline);
      if (status.running) throw new Error('Owned container did not stop within the deadline');
    }
  }
  return { forced, exitCode: status.exitCode };
}
