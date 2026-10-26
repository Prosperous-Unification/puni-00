import { type } from 'arktype';

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
export const CreationPlan = type({
  endpoint: /^unix:\/\/\/[^\s]+$/,
  daemonId: 'string>0',
  profile: "'app'|'platform'|'fleet'",
  network: 'string>0',
  expected: type({
    name: 'string>0',
    image: 'string>0',
    role: "'registry'|'server'|'agent'|'serverlb'|'tools'",
    temporary: 'boolean',
    '+': 'reject',
  })
    .array()
    .atLeastLength(1),
  binds: type({ source: 'string>0', destination: 'string>0', '+': 'reject' }).array(),
  '+': 'reject',
});
export type CreationPlan = typeof CreationPlan.infer;
const Creator = type({ name: 'string>0', id: fullId, '+': 'reject' });
export const CreationClosure = type({
  plan: CreationPlan,
  creators: Creator.array(),
  snapshots: ContainerObservation.array(),
  events: CreationEvent.array(),
  volumes: VolumeObservation.array(),
  network: { id: fullId, name: 'string>0', peers: type(fullId).array(), '+': 'reject' },
  '+': 'reject',
});
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
export function closeCreation(input: unknown): {
  containers: ContainerObservation[];
  volumes: (typeof VolumeObservation.infer)[];
} {
  const closure = CreationClosure(input);
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
