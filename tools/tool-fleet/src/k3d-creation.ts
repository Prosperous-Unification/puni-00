import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';

import {
  DockerContainerImage,
  DockerImageBinding,
  requireDockerImageFormats,
  requireDockerRuntimeImage,
} from './docker-image-identity';
import { ImageExpectation, ImageIdentity } from './image-identity';
import { K3dHelpers, referenceHelper } from './k3d-helper-images';

/** Existing k3d creation roles; image authority belongs to the selected toolchain. */
export const labHelperRoles = [
  { role: 'serverlb', temporary: false },
  { role: 'tools', temporary: true },
] as const;
/** Preserve the existing k3d helper names and order in each cluster's creation plan. */
export function nameLabHelpers(cluster: string, selection: K3dHelpers) {
  // Proof: Task25c2b helper-name substitution failed independent platform/workers expected-name controls.
  return labHelperRoles.map((helper) => ({
    name: `k3d-${cluster}-${helper.role}`,
    image: referenceHelper(selection[helper.role]),
    ...helper,
  }));
}

const fullId = /^[a-f0-9]{64}$/;
export const CreationEvent = type({
  kind: "'container'|'network'|'volume'",
  action: /^(create|destroy|mount|unmount|connect|disconnect|start|die)$/,
  id: /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,255}$/,
  time: /^[0-9]{1,20}$/,
  name: 'string<=256',
  container: 'string<=64',
  destination: 'string<=4096',
  driver: 'string<=64',
  image: 'string<=512',
  '+': 'reject',
});
export type CreationEvent = typeof CreationEvent.infer;

/** Decode only the fixed Docker projection; labels and nanosecond numbers never enter evidence. */
export function parseCreationEvent(line: string): CreationEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error('Malformed creation event');
  }
  const event = CreationEvent(parsed);
  // Proof: Removing the event-schema refusal failed malformed-event negatives; private inputs never enter diagnostics.
  if (event instanceof type.errors) throw new Error('Malformed creation event');
  return event;
}

/** Extract the pinned v5.9.0 creator response; discard private configuration and diagnostic lines. */
export function parseCreatorLine(
  line: string,
  names: readonly string[],
): { name: string; id: string } | undefined {
  const match =
    /^time="[0-9T:+Z.-]+" level=debug msg="Created container ([a-zA-Z0-9_.-]+) \(ID: ([^)]+)\)"$/.exec(
      line,
    );
  if (!match) {
    if (/^time="[0-9T:+Z.-]+" level=debug msg="Created container /.test(line))
      throw new Error('Malformed k3d creator response');
    return undefined;
  }
  const name = match[1];
  const id = match[2];
  // Proof: Removing full-ID validation failed the forged creator-response negative.
  if (!fullId.test(id) || !names.includes(name)) throw new Error('Unexpected k3d creator response');
  return { name, id };
}

const Mount = type({
  kind: "'volume'|'bind'|'tmpfs'",
  name: 'string',
  driver: 'string',
  source: 'string',
  destination: 'string>0',
  rw: 'boolean',
  '+': 'reject',
});
export const ContainerObservation = type({
  id: fullId,
  name: 'string>0',
  image: /^sha256:[a-f0-9]{64}$/,
  configuredImage: 'string>0',
  networkIds: type(fullId).array(),
  mounts: Mount.array(),
  '+': 'reject',
});
export type ContainerObservation = typeof ContainerObservation.infer;
export const VolumeObservation = type({
  name: 'string>0',
  driver: 'string>0',
  mountpoint: 'string>0',
  createdAt: 'string>0',
  consumers: type(fullId).array(),
  '+': 'reject',
});
const ExpectedCreator = type({
  name: 'string>0',
  image: 'string>0',
  role: "'registry'|'server'|'agent'|'serverlb'|'tools'",
  temporary: 'boolean',
  '+': 'reject',
});
export const HistoricalCreationPlan = type({
  endpoint: /^unix:\/\/\/[^\s]+$/,
  daemonId: 'string>0',
  profile: "'app'|'platform'|'fleet'",
  network: 'string>0',
  expected: ExpectedCreator.array().atLeastLength(1),
  binds: type({ source: 'string>0', destination: 'string>0', '+': 'reject' }).array(),
  '+': 'reject',
});
export const EffectiveCreationPlan = HistoricalCreationPlan.merge({
  '+': 'reject',
  schemaVersion: '2',
  helpers: K3dHelpers,
  expected: ExpectedCreator.merge({ '+': 'reject', configId: /^sha256:[a-f0-9]{64}$/ })
    .array()
    .atLeastLength(1),
});
export type EffectiveCreationPlan = typeof EffectiveCreationPlan.infer;
export const ImageCreationPlan = HistoricalCreationPlan.merge({
  '+': 'reject',
  schemaVersion: '3',
  helpers: K3dHelpers,
  expected: ExpectedCreator.merge({
    '+': 'reject',
    imageIdentity: ImageExpectation,
    imageBinding: DockerImageBinding,
  })
    .array()
    .atLeastLength(1),
});
export type ImageCreationPlan = typeof ImageCreationPlan.infer;
export const ImageContainerObservation = ContainerObservation.merge({
  '+': 'reject',
  schemaVersion: '3',
  imageIdentity: ImageIdentity,
  imageBinding: DockerContainerImage,
});
export type ImageContainerObservation = typeof ImageContainerObservation.infer;
export const CreationPlan = HistoricalCreationPlan.or(EffectiveCreationPlan).or(ImageCreationPlan);
export type CreationPlan = typeof CreationPlan.infer;
const Creator = type({ name: 'string>0', id: fullId, '+': 'reject' });
export const HistoricalCreationClosure = type({
  plan: HistoricalCreationPlan,
  creators: Creator.array(),
  snapshots: ContainerObservation.array(),
  events: CreationEvent.array(),
  volumes: VolumeObservation.array(),
  network: { id: fullId, name: 'string>0', peers: type(fullId).array(), '+': 'reject' },
  '+': 'reject',
});
export const EffectiveCreationClosure = HistoricalCreationClosure.merge({
  '+': 'reject',
  schemaVersion: '2',
  plan: EffectiveCreationPlan,
  transients: ContainerObservation.array(),
});
export const ImageCreationClosure = HistoricalCreationClosure.merge({
  '+': 'reject',
  schemaVersion: '3',
  plan: ImageCreationPlan,
  snapshots: ImageContainerObservation.array(),
  transients: ImageContainerObservation.array(),
});
export const CreationClosure =
  HistoricalCreationClosure.or(EffectiveCreationClosure).or(ImageCreationClosure);
export type CreationClosure = typeof CreationClosure.infer;

const sameSet = (left: readonly string[], right: readonly string[]): boolean =>
  new Set(left).size === left.length &&
  new Set(right).size === right.length &&
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

/**
 * Close independently returned IDs against required events and complete exact-ID inspections.
 * Events corroborate transitions, never the initiating client. Volume locators are retained associations,
 * never deletion authority. Exclusive mutation of this attempt's namespace is a cooperative precondition.
 */
function closeHistoricalCreation(input: unknown): {
  containers: ContainerObservation[];
  volumes: (typeof VolumeObservation.infer)[];
} {
  const closure = HistoricalCreationClosure(input);
  if (closure instanceof type.errors) throw new Error('Malformed creation closure');
  const { plan, creators, snapshots, events, volumes, network } = closure;
  if (
    !sameSet(
      [...new Set(creators.map((creator) => creator.name))],
      plan.expected.map((expected) => expected.name),
    ) ||
    new Set(creators.map((creator) => creator.id)).size !== creators.length
  )
    throw new Error('Missing or conflicting creator IDs');
  const permanentNames = plan.expected
    .filter((expected) => !expected.temporary)
    .map((expected) => expected.name);
  if (
    !sameSet(
      snapshots.map((snapshot) => snapshot.id),
      creators
        .filter((creator) => permanentNames.includes(creator.name))
        .map((creator) => creator.id),
    )
  )
    throw new Error('Missing or conflicting exact-ID observations');
  const hasEvent = (
    kind: CreationEvent['kind'],
    action: CreationEvent['action'],
    id: string,
    container?: string,
    destination?: string,
  ) =>
    events.some(
      (event) =>
        event.kind === kind &&
        event.action === action &&
        event.id === id &&
        (container === undefined || event.container === container) &&
        (destination === undefined || event.destination === destination),
    );
  if (network.name !== plan.network || !hasEvent('network', 'create', network.id))
    throw new Error('Missing network creation handshake');
  const active: ContainerObservation[] = [];
  const temporaryIds: string[] = [];
  for (const expected of plan.expected) {
    const created = creators.filter((candidate) => candidate.name === expected.name);
    if (!expected.temporary && created.length !== 1)
      throw new Error('Conflicting permanent creator IDs');
    for (const creator of created) {
      if (expected.temporary) {
        const birth = events.find(
          (event) =>
            event.kind === 'container' && event.action === 'create' && event.id === creator.id,
        );
        const death = events.find(
          (event) =>
            event.kind === 'container' && event.action === 'destroy' && event.id === creator.id,
        );
        const mounts = events.filter(
          (event) =>
            event.kind === 'volume' && event.action === 'mount' && event.container === creator.id,
        );
        if (
          expected.role !== 'tools' ||
          birth === undefined ||
          death === undefined ||
          birth.name !== expected.name ||
          birth.image !== expected.image ||
          BigInt(death.time) < BigInt(birth.time) ||
          !mounts.length ||
          mounts.some(
            (mount) =>
              mount.destination !== '/k3d/images' ||
              BigInt(mount.time) < BigInt(birth.time) ||
              BigInt(mount.time) > BigInt(death.time),
          )
        )
          // Proof: Removing this refusal separately completed up without tools create, mount or destroy; all three isolated CLI negatives failed.
          throw new Error('Temporary creator lifecycle remains unknown');
        temporaryIds.push(creator.id);
        continue;
      }
      const observed = snapshots.find((snapshot) => snapshot.id === creator.id);
      if (
        observed?.name !== expected.name ||
        // Proof: Removing the image comparison failed changed-image closure.
        observed.configuredImage !== expected.image ||
        !hasEvent('container', 'create', creator.id)
      )
        throw new Error('Creator identity is not corroborated');
      // Proof: Removing this refusal failed wrong-network closure.
      if (!sameSet(observed.networkIds, [network.id])) throw new Error('Container network differs');
      if (hasEvent('container', 'destroy', creator.id))
        throw new Error('Created container disappeared');
      active.push(observed);
    }
  }
  if (
    !sameSet(
      network.peers,
      active.map((container) => container.id),
    )
  )
    // Proof: Removing the attachment refusal failed the foreign-attachment closure negative.
    throw new Error('Network has unowned or missing attachments');
  const temporaryMounts = events.filter(
    (event) =>
      event.kind === 'volume' && event.action === 'mount' && temporaryIds.includes(event.container),
  );
  const volumeNames = [
    ...new Set([
      ...snapshots.flatMap((snapshot) =>
        snapshot.mounts.filter((mount) => mount.kind === 'volume').map((mount) => mount.name),
      ),
      ...temporaryMounts.map((event) => event.id),
    ]),
  ];
  for (const mount of temporaryMounts)
    if (!hasEvent('volume', 'create', mount.id))
      throw new Error('Temporary volume creation lineage missing');
  if (
    !sameSet(
      volumes.map((volume) => volume.name),
      volumeNames,
    )
  )
    throw new Error('Volume inventory remains unknown');
  for (const observed of snapshots)
    for (const mount of observed.mounts) {
      if (
        mount.kind === 'bind' &&
        !plan.binds.some(
          (bind) => bind.source === mount.source && bind.destination === mount.destination,
        )
      )
        throw new Error('Unexpected bind mount');
      if (mount.kind !== 'volume') continue;
      const volume = volumes.find((candidate) => candidate.name === mount.name);
      if (
        volume?.driver !== mount.driver ||
        volume.mountpoint !== mount.source ||
        // Proof: Removing each create/mount predicate separately failed missing-volume-create and missing-mount.
        !hasEvent('volume', 'create', mount.name) ||
        !hasEvent('volume', 'mount', mount.name, observed.id, mount.destination)
      )
        throw new Error('Volume creation or mount lineage missing');
    }
  for (const volume of volumes) {
    const consumers = active
      .filter((container) =>
        container.mounts.some((mount) => mount.kind === 'volume' && mount.name === volume.name),
      )
      .map((container) => container.id);
    // Proof: Removing this refusal failed foreign-volume-consumer closure.
    if (!sameSet(volume.consumers, consumers))
      throw new Error('Volume has unowned or missing consumers');
    if (hasEvent('volume', 'destroy', volume.name))
      throw new Error('Associated volume disappeared');
  }
  return { containers: active, volumes };
}

/** Forward acceptance requires explicit v3; older evidence retains its original teardown semantics. */
export function closeCreation(input: unknown, purpose: 'forward' | 'teardown' = 'teardown') {
  const closure = CreationClosure.assert(input);
  if (!('schemaVersion' in closure)) {
    if (purpose === 'forward')
      // Proof: Task37 historical-forward bypass let old closure certify forward acceptance; compatibility negative failed.
      throw new Error('Forward creation requires image version 3 evidence');
    return closeHistoricalCreation(closure);
  }
  if (closure.schemaVersion === 3) return closeImageCreation(closure, purpose);
  // Proof: Task44 removing this version refusal made synthetic v2 certify forward acceptance; forward-closure-version failed.
  if (purpose === 'forward') throw new Error('Forward creation requires image version 3 evidence');
  const { plan, transients, snapshots, creators } = closure;
  const temporary = creators.filter((creator) =>
    plan.expected.some((expected) => expected.temporary && expected.name === creator.name),
  );
  if (
    !sameSet(
      transients.map((observed) => observed.id),
      temporary.map((creator) => creator.id),
    )
  )
    // Proof: Task37 transient-set bypass accepted missing/duplicate serial observations; both closure negatives failed.
    throw new Error('Missing or conflicting transient observations');
  for (const observed of [...snapshots, ...transients]) {
    const creator = creators.find((candidate) => candidate.id === observed.id);
    const expected = plan.expected.find((candidate) => candidate.name === creator?.name);
    if (
      observed.name !== expected?.name ||
      observed.configuredImage !== expected.image ||
      observed.image !== expected.configId
    )
      // Proof: Task37 effective-config bypass accepted permanent/transient config substitution; both closure negatives failed.
      throw new Error('Effective creator image identity differs');
    if (expected.role === 'serverlb' || expected.role === 'tools') {
      const selected = plan.helpers[expected.role];
      if (
        expected.image !== referenceHelper(selected) ||
        expected.configId !== selected.configDigest
      )
        // Proof: Task37 helper-plan bypass accepted consistently forged plan/observation config identities; selection negative failed.
        throw new Error('Creation plan helper selection differs');
    }
  }
  const { schemaVersion: _version, helpers: _helpers, expected, ...historicalPlan } = plan;
  return closeObservedLifecycle({
    ...closure,
    plan: { ...historicalPlan, expected: expected.map(({ configId: _config, ...entry }) => entry) },
  });
}

function closeImageCreation(
  closure: typeof ImageCreationClosure.infer,
  purpose: 'forward' | 'teardown',
) {
  const { plan, snapshots, transients, creators } = closure;
  // Proof: Task49 omitting this forward boundary accepted an original3 closure; forward-sealer-provider failed.
  requireDockerImageFormats(
    plan.expected.map((expected) => expected.imageBinding),
    [...snapshots, ...transients].map((observed) => observed.imageBinding),
    purpose,
  );
  const temporaryIds = creators
    .filter((creator) =>
      plan.expected.some((expected) => expected.temporary && expected.name === creator.name),
    )
    .map((creator) => creator.id);
  if (
    !sameSet(
      transients.map((observed) => observed.id),
      temporaryIds,
    )
  )
    // Proof: Task44 removing this set check accepted resealed missing v3 transients; version3-transient-set failed.
    throw new Error('Missing or conflicting transient observations');
  for (const observed of [...snapshots, ...transients]) {
    const creator = creators.find((candidate) => candidate.id === observed.id);
    const expected = plan.expected.find((candidate) => candidate.name === creator?.name);
    if (
      observed.name !== expected?.name ||
      observed.configuredImage !== expected.image ||
      observed.image !== observed.imageIdentity.object.digest ||
      !isDeepStrictEqual(observed.imageIdentity, observed.imageBinding.identity)
    )
      // Proof: Task44 dropping raw-object or neutral-copy equality accepted resealed transient substitutions; container-raw-object/container-identity-copy failed.
      throw new Error('Effective creator image identity differs');
    if (expected.role === 'serverlb' || expected.role === 'tools') {
      const selected = plan.helpers[expected.role];
      const identity = expected.imageIdentity;
      if (
        identity.kind !== 'helper' ||
        expected.image !== referenceHelper(selected) ||
        identity.selection.reference !== expected.image ||
        identity.selection.indexDigest !== selected.indexDigest ||
        identity.selection.manifestDigest !== selected.manifestDigest ||
        identity.selection.configDigest !== selected.configDigest ||
        identity.selection.os !== selected.os ||
        identity.selection.arch !== selected.arch
      )
        throw new Error('Creation plan helper selection differs');
    } else if (expected.imageIdentity.kind !== 'runtime-pin')
      throw new Error('Creation runtime pin expectation differs');
    requireDockerRuntimeImage(
      expected.imageIdentity,
      expected.imageBinding,
      observed.imageBinding,
      plan.daemonId,
    );
  }
  const { schemaVersion: _version, helpers: _helpers, expected, ...historicalPlan } = plan;
  const stripObservation = ({
    schemaVersion: _schema,
    imageIdentity: _identity,
    imageBinding: _binding,
    ...observation
  }: ImageContainerObservation) => observation;
  const closed = closeObservedLifecycle({
    ...closure,
    plan: {
      ...historicalPlan,
      expected: expected.map(
        ({ imageIdentity: _identity, imageBinding: _binding, ...creator }) => creator,
      ),
    },
    snapshots: snapshots.map(stripObservation),
    transients: transients.map(stripObservation),
  });
  return {
    containers: snapshots.filter((snapshot) =>
      closed.containers.some((container) => container.id === snapshot.id),
    ),
    volumes: closed.volumes,
  };
}

function closeObservedLifecycle(
  closure: typeof HistoricalCreationClosure.infer & { transients: ContainerObservation[] },
) {
  const { plan, transients, creators, snapshots, network } = closure;
  for (const observed of transients) {
    if (!sameSet(observed.networkIds, [network.id]))
      // Proof: Task37 transient-network bypass accepted a foreign network; closure negative failed.
      throw new Error('Transient network differs');
    for (const mount of observed.mounts) {
      if (
        mount.kind === 'bind' &&
        plan.binds.some(
          (bind) => bind.source === mount.source && bind.destination === mount.destination,
        )
      )
        continue;
      const volume = closure.volumes.find((candidate) => candidate.name === mount.name);
      if (
        mount.kind !== 'volume' ||
        mount.destination !== '/k3d/images' ||
        volume?.driver !== mount.driver ||
        volume.mountpoint !== mount.source ||
        !closure.events.some(
          (event) =>
            event.kind === 'volume' &&
            event.action === 'mount' &&
            event.container === observed.id &&
            event.id === mount.name &&
            event.destination === mount.destination,
        )
      )
        // Proof: Task37 transient-mount bypass accepted a foreign volume source; closure negative failed.
        throw new Error('Transient mount identity differs');
    }
    const mounted = closure.events.filter(
      (event) =>
        event.kind === 'volume' && event.action === 'mount' && event.container === observed.id,
    );
    if (
      !sameSet(
        mounted.map((event) => event.id),
        observed.mounts.filter((mount) => mount.kind === 'volume').map((mount) => mount.name),
      )
    )
      // Proof: Task37 transient-mount-set bypass accepted an omitted observed mount; closure negative failed.
      throw new Error('Transient mount inventory differs');
  }
  const closed = closeHistoricalCreation({
    plan,
    creators,
    snapshots,
    events: closure.events,
    volumes: closure.volumes,
    network,
  });
  for (const expected of plan.expected.filter((expected) => expected.temporary)) {
    const lives = creators
      .filter((creator) => creator.name === expected.name)
      .map((creator) => {
        const birth = closure.events.find(
          (event) =>
            event.kind === 'container' && event.action === 'create' && event.id === creator.id,
        );
        const death = closure.events.find(
          (event) =>
            event.kind === 'container' && event.action === 'destroy' && event.id === creator.id,
        );
        if (birth === undefined || death === undefined)
          throw new Error('Transient lifecycle missing');
        return { birth: BigInt(birth.time), death: BigInt(death.time) };
      })
      .sort((left, right) => (left.birth < right.birth ? -1 : left.birth > right.birth ? 1 : 0));
    for (let index = 1; index < lives.length; index++) {
      const previous = lives.at(index - 1);
      const current = lives.at(index);
      if (previous === undefined || current === undefined || current.birth < previous.death)
        // Proof: Task37 serial-overlap bypass accepted overlapping tools generations; closure negative failed.
        throw new Error('Transient creator lifecycles overlap');
    }
  }
  return closed;
}

async function consumeLines(
  stream: ReadableStream<Uint8Array>,
  consume: (line: string) => Promise<void>,
): Promise<void> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let pending = '';
  let bytes = 0;
  for await (const chunk of stream) {
    bytes += chunk.byteLength;
    // Proof: Doubling this cap failed bounds-discarded-private-output; no valid later ID can rescue overflow.
    if (bytes > 16 * 1024 * 1024) throw new Error('Creation stream overflow');
    pending += decoder.decode(chunk, { stream: true });
    for (;;) {
      const end = pending.indexOf('\n');
      if (end < 0) break;
      if (end > 256 * 1024) throw new Error('Creation line overflow');
      const line = pending.slice(0, end);
      pending = pending.slice(end + 1);
      await consume(line);
    }
    if (pending.length > 256 * 1024) throw new Error('Creation line overflow');
  }
  pending += decoder.decode();
  if (pending.length) throw new Error('Truncated creation stream');
}

/** Bound both private debug pipes; retain only direct creator responses, including before a failed exit. */
export async function captureCreator(
  command: readonly string[],
  environment: NodeJS.ProcessEnv,
  names: readonly string[],
  persist: (creator: { name: string; id: string }) => Promise<void>,
  temporaryNames: readonly string[] = [],
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw new Error('Creation witness failed');
  const child = Bun.spawn([...command], {
    env: { ...environment, LOG_COLORS: 'false', LOG_TIMESTAMPS: '' },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 600_000,
    killSignal: 'SIGKILL',
  });
  const stopCreator = () => {
    child.kill('SIGKILL');
  };
  // Proof: Removing abort delivery timed out the active-creator disconnection test at 1 second.
  signal?.addEventListener('abort', stopCreator, { once: true });
  const seen = new Set<string>();
  const consume = async (line: string) => {
    const creator = parseCreatorLine(line, names);
    if (creator === undefined) return;
    if ((!temporaryNames.includes(creator.name) && seen.has(creator.name)) || seen.has(creator.id))
      throw new Error('Duplicate k3d creator response');
    seen.add(creator.name);
    seen.add(creator.id);
    await persist(creator);
  };
  try {
    const pipes = await Promise.allSettled(
      [
        consumeLines(child.stdout, consume),
        consumeLines(child.stderr, () => Promise.resolve()),
      ].map(async (pipe) => {
        try {
          await pipe;
        } catch (cause) {
          child.kill('SIGKILL');
          throw cause;
        }
      }),
    );
    for (const pipe of pipes) if (pipe.status === 'rejected') throw pipe.reason;

    if (signal?.aborted) throw new Error('Creation witness failed; partial evidence retained');
    if ((await child.exited) !== 0)
      throw new Error(
        'k3d creator failed; private diagnostics discarded, partial evidence retained',
      );
    if (names.some((name) => !seen.has(name))) throw new Error('Missing k3d creator response');
  } finally {
    signal?.removeEventListener('abort', stopCreator);
    child.kill();
    await child.exited;
  }
}

/**
 * Start the bounded safe Docker event projection before direct creation. A healthy pipe alone is
 * insufficient: requireNetwork must observe the exact returned network-create identity.
 */
export function startCreationWitness(
  command: readonly string[],
  environment: NodeJS.ProcessEnv,
  persist: (event: CreationEvent) => Promise<void>,
) {
  const child = Bun.spawn([...command], {
    env: environment,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 900_000,
    killSignal: 'SIGKILL',
  });
  const abort = new AbortController();
  const events: CreationEvent[] = [];
  let failure: Error | undefined;
  let closing = false;
  const retainFailure = async (pending: Promise<unknown>): Promise<void> => {
    try {
      await pending;
    } catch (cause) {
      failure ??= cause instanceof Error ? cause : new Error('Docker event reader failed');
      abort.abort();
      child.kill();
    }
  };
  const reading = Promise.all(
    [
      consumeLines(child.stdout, async (line) => {
        const event = parseCreationEvent(line);
        if (events.length >= 4096) throw new Error('Creation event overflow');
        await persist(event);
        events.push(event);
      }),
      consumeLines(child.stderr, () =>
        Promise.reject(new Error('Docker event reader diagnostic failure')),
      ),
      child.exited.then(() => {
        if (!closing) throw new Error('Docker event stream disconnected');
      }),
    ].map(retainFailure),
  );
  const check = () => {
    if (failure !== undefined) throw failure;
    if (!closing && child.exitCode !== null) throw new Error('Docker event stream disconnected');
  };
  return {
    signal: abort.signal,
    events,
    check,
    async requireNetwork(id: string, timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        check();
        if (
          events.some(
            (event) => event.kind === 'network' && event.action === 'create' && event.id === id,
          )
        )
          return;
        if (Date.now() >= deadline)
          throw new Error('Network creation handshake missed its deadline');
        await Bun.sleep(10);
      }
    },
    async stop() {
      closing = true;
      child.kill();
      await reading;
    },
  };
}
