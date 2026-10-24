import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath } from 'node:fs/promises';
import { request } from 'node:http';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import {
  type CandidateRequest,
  compareCandidate,
  constructCandidate,
  fingerprint,
  InitRefusal,
  type NativeContainer,
  parseNativeContainer,
} from './edge-init';
import { readFields, readIdentity } from './managed-cohort';

/** Per-service monotonic ceiling retains thirty seconds for bounded readback and publication. */
export class Deadline {
  private readonly expires: number;
  constructor(
    duration: number,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.expires = now() + duration;
  }
  remaining(): number {
    return Math.max(0, this.expires - this.now());
  }
  allocate(budget: number, reserve = 30000): number {
    if (!Number.isSafeInteger(budget) || budget <= 0 || this.remaining() < budget + reserve)
      throw new InitRefusal('deadline-reserve-exhausted');
    return budget;
  }
}

export type TargetKind = 'registry' | 'caddy';
export interface Receipt {
  stage: string;
  target: TargetKind;
  original: string;
  candidate?: string;
  remaining: number;
}

/** Rejects symlink traversal and non-private state before any private bytes are consumed. */
export async function readPrivateFile(path: string): Promise<string> {
  if (!isAbsolute(path) || resolve(path) !== path || (await realpath(path)) !== path)
    throw new InitRefusal('private-file-path-invalid');
  const descriptor = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await descriptor.stat();
    if (
      !metadata.isFile() ||
      metadata.uid !== process.getuid?.() ||
      (metadata.mode & 0o777) !== 0o600 ||
      metadata.size > 1048576
    )
      throw new InitRefusal('private-file-mode-invalid');
    await readdir(dirname(path));
    return await descriptor.readFile('utf8');
  } finally {
    await descriptor.close();
  }
}

/** Hash-only exclusive append chain. Each acknowledged publication was fsynced and read back. */
export class PrivateReceipts {
  private previous: string | null = null;
  private sequence = 0;
  private constructor(
    readonly directory: string,
    private readonly attempt: string,
  ) {}
  static async create(path: string, attempt: string): Promise<PrivateReceipts> {
    if (
      !/^[a-z0-9-]{1,64}$/.test(attempt) ||
      !isAbsolute(path) ||
      resolve(path) !== path ||
      (await realpath(dirname(path))) !== dirname(path)
    )
      throw new InitRefusal('receipt-path-invalid');
    await mkdir(path, { mode: 0o700 });
    const metadata = await lstat(path);
    if (
      !metadata.isDirectory() ||
      metadata.isSymbolicLink() ||
      metadata.uid !== process.getuid?.() ||
      (metadata.mode & 0o777) !== 0o700
    )
      throw new InitRefusal('receipt-mode-invalid');
    return new PrivateReceipts(path, attempt);
  }
  async publish(receipt: Receipt): Promise<string> {
    const path = join(this.directory, `${String(this.sequence).padStart(4, '0')}.json`);
    const publication = { attempt: this.attempt, previous: this.previous, ...receipt };
    const bytes = JSON.stringify(publication);
    const descriptor = await open(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await descriptor.writeFile(bytes);
      await descriptor.sync();
    } finally {
      await descriptor.close();
    }
    const directory = await open(
      this.directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    const readback = await readPrivateFile(path);
    if (readback !== bytes) throw new InitRefusal('receipt-readback-mismatch');
    this.previous = fingerprint(publication);
    this.sequence++;
    return this.previous;
  }
}

/** Internal local socket injection is for owned native fixtures and Unix-socket tests only; CLI has no override. */
export class EngineTransport {
  private readonly ids: Set<string>;
  constructor(
    private readonly socket: string,
    ids: readonly string[],
    private readonly nonce: string,
  ) {
    this.ids = new Set(ids.map(readIdentity));
    if (!/^[a-z0-9-]{1,64}$/.test(nonce)) throw new InitRefusal('attempt-invalid');
  }
  private select(id: string): string {
    readIdentity(id);
    if (!this.ids.has(id)) throw new InitRefusal('unselected-container');
    return `/containers/${id}`;
  }
  private async call(
    method: 'GET' | 'POST' | 'DELETE',
    route: string,
    timeout: number,
    expected: number,
    body?: unknown,
  ): Promise<unknown> {
    if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new InitRefusal('deadline-exhausted');
    const bytes = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolveResponse, reject) => {
      const fail = (reason: string) => {
        reject(new InitRefusal(reason));
      };
      const client = request(
        {
          socketPath: this.socket,
          method,
          path: `/v1.52${route}`,
          headers:
            bytes === undefined
              ? {}
              : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bytes) },
        },
        (response) => {
          const chunks: Buffer[] = [];
          let length = 0;
          response.on('data', (chunk: Buffer) => {
            length += chunk.length;
            if (length > 4 * 1048576) {
              client.destroy();
              fail('engine-response-too-large');
              return;
            }
            chunks.push(chunk);
          });
          response.on('aborted', () => {
            fail('engine-response-truncated');
          });
          response.on('error', () => {
            fail('engine-read-failed');
          });
          response.on('end', () => {
            if (response.statusCode !== expected) {
              fail('engine-status-refused');
              return;
            }
            if (length === 0) {
              resolveResponse(null);
              return;
            }
            try {
              resolveResponse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
              fail('engine-json-invalid');
            }
          });
        },
      );
      const timer = setTimeout(() => {
        client.destroy();
        fail('engine-deadline-uncertain');
      }, timeout);
      client.on('close', () => {
        clearTimeout(timer);
      });
      client.on('error', () => {
        fail('engine-transport-uncertain');
      });
      if (bytes !== undefined) client.write(bytes);
      client.end();
    });
  }
  async inspect(id: string, timeout: number): Promise<NativeContainer> {
    return parseNativeContainer(await this.call('GET', `${this.select(id)}/json`, timeout, 200));
  }
  async create(kind: TargetKind, candidate: CandidateRequest, timeout: number): Promise<string> {
    const name = `wbs-init-${this.nonce}-${kind}`;
    const reply = readFields(
      await this.call('POST', `/containers/create?name=${name}`, timeout, 201, {
        ...candidate.Config,
        HostConfig: candidate.HostConfig,
        NetworkingConfig: candidate.NetworkingConfig,
      }),
    );
    const id = readIdentity(reply['Id']);
    this.ids.add(id);
    if (
      !Array.isArray(reply['Warnings']) ||
      reply['Warnings'].length !== 0 ||
      Object.keys(reply).some((key) => !['Id', 'Warnings'].includes(key))
    )
      throw new InitRefusal('create-acknowledgement-uncertain');
    return id;
  }
  async stop(id: string, timeout: number): Promise<void> {
    await this.call('POST', `${this.select(id)}/stop?t=-1`, timeout, 204);
  }
  async rename(id: string, name: string, timeout: number): Promise<void> {
    if (
      ![
        'wbs-registry-1',
        'wbs-caddy-1',
        `wbs-init-${this.nonce}-registry-original`,
        `wbs-init-${this.nonce}-caddy-original`,
      ].includes(name)
    )
      throw new InitRefusal('unselected-name');
    await this.call('POST', `${this.select(id)}/rename?name=${name}`, timeout, 204);
  }
  async start(id: string, timeout: number): Promise<void> {
    await this.call('POST', `${this.select(id)}/start`, timeout, 204);
  }
  async remove(id: string, timeout: number): Promise<void> {
    await this.call('DELETE', `${this.select(id)}?v=false&force=false`, timeout, 204);
  }
}

/** Production always binds the canonical Engine socket, independently of Docker contexts or environment. */
export async function createLocalEngine(
  ids: readonly string[],
  nonce: string,
): Promise<EngineTransport> {
  const socket = '/var/run/docker.sock';
  const canonical = await realpath(socket);
  if (
    (canonical !== '/run/docker.sock' && canonical !== socket) ||
    !(await lstat(canonical)).isSocket()
  )
    throw new InitRefusal('canonical-engine-socket-invalid');
  return new EngineTransport(canonical, ids, nonce);
}

export interface SelectedTarget {
  kind: TargetKind;
  original: NativeContainer;
}
export interface AdoptionSelection {
  nonce: string;
  targets: readonly [SelectedTarget, SelectedTarget];
}
export interface HostObserver {
  admit(deadline: Deadline): Promise<void>;
  original(target: SelectedTarget, observed: NativeContainer, deadline: Deadline): Promise<void>;
  inert(target: SelectedTarget, observed: NativeContainer, deadline: Deadline): Promise<void>;
  stopped(target: SelectedTarget, observed: NativeContainer, deadline: Deadline): Promise<void>;
  running(target: SelectedTarget, observed: NativeContainer, deadline: Deadline): Promise<void>;
  health(kind: TargetKind, id: string, deadline: Deadline): Promise<void>;
  combined(deadline: Deadline): Promise<void>;
  absent(id: string, deadline: Deadline): Promise<void>;
}
type Effects = Pick<EngineTransport, 'inspect' | 'create' | 'stop' | 'rename' | 'start' | 'remove'>;
type ReceiptWriter = Pick<PrivateReceipts, 'publish'>;
interface MonotonicClock {
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
}

function checkStopped(observed: NativeContainer): void {
  if (
    observed.state['Running'] !== false ||
    observed.state['Paused'] !== false ||
    observed.state['Restarting'] !== false ||
    observed.state['Pid'] !== 0
  )
    throw new InitRefusal('original-not-stopped');
}
function checkInert(observed: NativeContainer): void {
  checkStopped(observed);
  if (
    observed.state['Status'] !== 'created' ||
    observed.state['StartedAt'] !== '0001-01-01T00:00:00Z' ||
    observed.state['FinishedAt'] !== '0001-01-01T00:00:00Z' ||
    observed.restartCount !== 0 ||
    observed.sandboxId !== '' ||
    observed.sandboxKey !== '' ||
    Object.values(readFields(observed.ports)).some((bindings) => bindings !== null)
  )
    throw new InitRefusal('candidate-not-inert');
  for (const network of Object.values(observed.networks)) {
    const endpoint = readFields(network);
    if (
      endpoint['EndpointID'] !== '' ||
      endpoint['IPAddress'] !== '' ||
      endpoint['GlobalIPv6Address'] !== ''
    )
      throw new InitRefusal('candidate-network-active');
  }
}
function checkRunning(observed: NativeContainer): string {
  if (
    observed.state['Status'] !== 'running' ||
    observed.state['Running'] !== true ||
    observed.state['Paused'] !== false ||
    observed.state['Restarting'] !== false ||
    observed.state['Dead'] !== false ||
    typeof observed.state['Pid'] !== 'number' ||
    observed.state['Pid'] <= 0 ||
    observed.restartCount !== 0
  )
    throw new InitRefusal('candidate-not-stably-running');
  return fingerprint({ pid: observed.state['Pid'], startedAt: observed.state['StartedAt'] });
}
function checkOriginal(target: SelectedTarget, observed: NativeContainer): void {
  if (fingerprint(target.original) !== fingerprint(observed))
    throw new InitRefusal('original-identity-changed');
  checkRunning(observed);
}

/**
 * Closed registry → Caddy transition. Effects are never retried or compensated.
 * Observer ports perform independent host/probe proofs; only the production constructor can supply them to the CLI.
 */
export async function runInitAdoption(
  selection: AdoptionSelection,
  engine: Effects,
  observer: HostObserver,
  receipts: ReceiptWriter,
  clock: MonotonicClock = {
    now: () => performance.now(),
    sleep: (milliseconds) => Bun.sleep(milliseconds),
  },
): Promise<void> {
  const [registry, caddy] = selection.targets;
  if (
    registry.kind !== 'registry' ||
    caddy.kind !== 'caddy' ||
    registry.original.id === caddy.original.id ||
    registry.original.name !== '/wbs-registry-1' ||
    caddy.original.name !== '/wbs-caddy-1'
  )
    throw new InitRefusal('closed-target-roster-invalid');
  const replacements: { target: SelectedTarget; candidate: string; originalName: string }[] = [];
  let phase = 'before-create';
  let active = registry;
  let candidate: string | undefined;
  let deadline = new Deadline(120000, clock.now);
  const publish = async (stage: string) =>
    receipts.publish({
      stage,
      target: active.kind,
      original: active.original.id,
      ...(candidate === undefined ? {} : { candidate }),
      remaining: Math.floor(deadline.remaining()),
    });
  const effect = async <Value>(
    stage: string,
    budget: number,
    action: (timeout: number) => Promise<Value>,
  ) => {
    const timeout = deadline.allocate(budget);
    await observer.admit(deadline);
    await publish(stage);
    // Admission and durable publication consume the same ceiling; a delayed write never admits an expired transition.
    deadline.allocate(budget);
    return await action(timeout);
  };
  try {
    await observer.admit(deadline);
    for (const target of selection.targets) {
      const observed = await engine.inspect(target.original.id, deadline.allocate(10000));
      checkOriginal(target, observed);
      await observer.original(target, observed, deadline);
      await observer.health(target.kind, observed.id, deadline);
    }
    for (const target of selection.targets) {
      active = target;
      candidate = undefined;
      phase = 'before-create';
      deadline = new Deadline(300000, clock.now);
      const before = await engine.inspect(target.original.id, deadline.allocate(10000));
      checkOriginal(target, before);
      await observer.original(target, before, deadline);
      candidate = await effect('create-intended', 20000, (timeout) =>
        engine.create(target.kind, constructCandidate(before), timeout),
      );
      if (candidate === before.id) throw new InitRefusal('candidate-id-invalid');
      phase = 'candidate-inert';
      await publish('created');
      const replacement = await engine.inspect(candidate, deadline.allocate(10000));
      compareCandidate(before, replacement);
      checkInert(replacement);
      if (replacement.name !== `/wbs-init-${selection.nonce}-${target.kind}`)
        throw new InitRefusal('candidate-name-mismatch');
      await observer.inert(target, replacement, deadline);
      const original = await engine.inspect(before.id, deadline.allocate(10000));
      checkOriginal(target, original);
      await observer.original(target, original, deadline);
      await observer.health(target.kind, original.id, deadline);
      await publish('candidate-verified');
      phase = 'stop-uncertain';
      await effect('stop-intended', 30000, (timeout) => engine.stop(before.id, timeout));
      const stopped = await engine.inspect(before.id, deadline.allocate(10000));
      checkStopped(stopped);
      await observer.stopped(target, stopped, deadline);
      phase = 'original-stopped';
      await publish('original-stopped');
      const retainedName = `wbs-init-${selection.nonce}-${target.kind}-original`;
      phase = 'rename-uncertain';
      await effect('rename-original-intended', 10000, (timeout) =>
        engine.rename(before.id, retainedName, timeout),
      );
      const retained = await engine.inspect(before.id, deadline.allocate(10000));
      checkStopped(retained);
      if (retained.name !== `/${retainedName}`) throw new InitRefusal('original-rename-unverified');
      const candidateId = candidate;
      await effect('rename-candidate-intended', 10000, (timeout) =>
        engine.rename(candidateId, before.name.slice(1), timeout),
      );
      const renamed = await engine.inspect(candidateId, deadline.allocate(10000));
      checkInert(renamed);
      compareCandidate(before, renamed);
      if (renamed.name !== before.name) throw new InitRefusal('candidate-rename-unverified');
      phase = 'start-uncertain';
      await effect('start-intended', 20000, (timeout) => engine.start(candidateId, timeout));
      phase = 'candidate-running-unhealthy';
      let identity: string | undefined;
      const firstRound = clock.now();
      for (let round = 0; round < 3; round++) {
        const running = await engine.inspect(candidateId, deadline.allocate(10000));
        compareCandidate(before, running);
        const current = checkRunning(running);
        if (identity !== undefined && identity !== current)
          throw new InitRefusal('candidate-process-changed');
        identity = current;
        await observer.running(target, running, deadline);
        const retained = await engine.inspect(before.id, deadline.allocate(10000));
        checkStopped(retained);
        await observer.stopped(target, retained, deadline);
        await observer.health(target.kind, candidateId, deadline);
        if (round < 2) {
          deadline.allocate(5000);
          await clock.sleep(5000);
        }
      }
      if (clock.now() - firstRound < 10000) throw new InitRefusal('health-window-too-short');
      phase = 'healthy-original-retained';
      await publish('healthy');
      replacements.push({ target, candidate: candidateId, originalName: retainedName });
    }
    deadline = new Deadline(120000, clock.now);
    await observer.combined(deadline);
    await publish('retention-point');
    for (const replacement of replacements) {
      active = replacement.target;
      candidate = replacement.candidate;
      const retained = await engine.inspect(active.original.id, deadline.allocate(10000));
      checkStopped(retained);
      if (
        retained.name !== `/${replacement.originalName}` ||
        fingerprint(retained.config) !== fingerprint(active.original.config) ||
        fingerprint(retained.host) !== fingerprint(active.original.host) ||
        retained.image !== active.original.image
      )
        throw new InitRefusal('retained-original-changed');
      await observer.stopped(active, retained, deadline);
      phase = 'removal-uncertain';
      await effect('remove-intended', 10000, (timeout) =>
        engine.remove(active.original.id, timeout),
      );
      await observer.absent(active.original.id, deadline);
      await publish('original-absent');
    }
    await observer.combined(deadline);
    await publish('complete');
  } catch {
    // No raw transport/host cause reaches public diagnostics or hash-only receipts.
    try {
      await publish(phase);
    } catch {
      // Proof: omitted boundary exposed SECRET from a persistently failing receipt writer in the real finite sequence.
      throw new InitRefusal(`${phase}-receipt-publication-failed`);
    }
    throw new InitRefusal(phase);
  }
}
