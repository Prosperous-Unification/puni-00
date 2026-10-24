import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath } from 'node:fs/promises';
import { request } from 'node:http';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { types } from 'node:util';

import {
  type CandidateRequest,
  checkInert,
  checkProfileSource,
  compareCandidate,
  constructCandidate,
  fingerprint,
  InitRefusal,
  type InvariantContext,
  type InvariantProfile,
  type NativeContainer,
  type NetworkPin,
  parseNativeContainer,
  projectInvariant,
} from './edge-init';
import { readFields, readIdentity } from './managed-cohort';

const INIT_DIAGNOSTIC_REASONS = [
  'candidate-name-mismatch',
  'candidate-preservation-mismatch',
  'candidate-not-inert',
  'candidate-network-active',
  'invariant-context-invalid',
  'invariant-phase-differs',
  'invariant-profile-unavailable',
  'invariant-profile-invalid',
  'invariant-profile-source-invalid',
  'invariant-profile-value-invalid',
  'network-pins-missing',
  'network-roster-invalid',
  'network-roster-differs',
  'network-mode-differs',
  'network-identity-differs',
  'network-pin-differs',
  'network-observation-unstable',
  'unsupported-native-shape',
  'invalid-ordered-env',
  'engine-status-refused',
  'engine-deadline-uncertain',
  'engine-transport-uncertain',
  'engine-response-truncated',
  'engine-read-failed',
  'engine-response-too-large',
  'engine-json-invalid',
  'create-acknowledgement-uncertain',
  'exec-deadline-uncertain',
  'exec-frame-invalid',
  'exec-output-refused',
  'exec-stream-invalid',
  'exec-terminal-unverified',
  'exec-utf8-invalid',
  'deadline-reserve-exhausted',
  'deadline-exhausted',
] as const;
type DiagnosticReason =
  | (typeof INIT_DIAGNOSTIC_REASONS)[number]
  | 'unrecognized-refusal'
  | 'unexpected-failure'
  | 'uninspectable-failure';
export interface InitDiagnostic {
  readonly reason: DiagnosticReason;
  readonly diagnosticSha256: string;
}
type DiagnosticValueType =
  | 'object'
  | 'function'
  | 'string'
  | 'number'
  | 'boolean'
  | 'bigint'
  | 'symbol'
  | 'undefined'
  | 'null';
type DiagnosticMessageKind =
  | 'primitive-string'
  | 'no-message'
  | 'uninspectable'
  | 'absent-message'
  | 'accessor-message'
  | 'data-message'
  | 'non-string-message';
type DiagnosticReasonKind = 'not-refusal' | 'absent-reason' | 'data-reason' | 'accessor-reason';
const initDiagnostics = new WeakMap<InitRefusal, Readonly<InitDiagnostic>>();

/** Exact error identity only; this reads no property/prototype and grants no effect or recovery capability.
 * Lookalikes and publication-failure errors have no record; concurrent catches retain independent identities.
 */
export function readInitDiagnostic(cause: unknown): Readonly<InitDiagnostic> | undefined {
  if ((typeof cause !== 'object' || cause === null) && typeof cause !== 'function')
    return undefined;
  // WeakMap.get reads exact identity only; this cast bridges the narrower key type without inspecting an untrusted object.
  return initDiagnostics.get(cause as InitRefusal);
}
// Proof: proxy-guard removal invoked hostile traps; expanding the prototype bound failed its bounded-inspection negative.
function isDiagnosticRefusal(cause: object): boolean {
  let current: object | null = cause;
  const seen = new Set<object>();
  for (let depth = 0; current !== null && depth < 32; depth++) {
    if (types.isProxy(current) || seen.has(current))
      throw new Error('diagnostic inspection unavailable');
    // Proof: treating the prototype object itself as an instance failed its separate classification regression.
    if (depth > 0 && current === InitRefusal.prototype) return true;
    seen.add(current);
    const parent: unknown = Object.getPrototypeOf(current);
    if (parent !== null && typeof parent !== 'object' && typeof parent !== 'function')
      throw new Error('diagnostic inspection unavailable');
    current = parent;
  }
  if (current !== null) throw new Error('diagnostic inspection unavailable');
  return false;
}
/** v1 hashes a NUL-delimited ASCII header (value type, finite reason, reason kind, message kind, full UTF-16 length, truncation), then at most 8192 code units encoded UTF-16LE.
 * Proof: removing the prefix bound, original-length framing, UTF-16 encoding or frozen record failed fixed-vector/framing/shape tests.
 */
function frameInitDiagnostic(
  reason: DiagnosticReason,
  valueType: DiagnosticValueType,
  messageKind: DiagnosticMessageKind,
  message: string,
  reasonKind: DiagnosticReasonKind = 'not-refusal',
): Readonly<InitDiagnostic> {
  const header = `init-diagnostic-v1\0${valueType}\0${reason}\0${reasonKind}\0${messageKind}\0${String(message.length)}\0${message.length > 8192 ? 'truncated' : 'complete'}\0`;
  return Object.freeze({
    reason,
    diagnosticSha256: createHash('sha256')
      .update(header, 'utf8')
      .update(message.slice(0, 8192), 'utf16le')
      .digest('hex'),
  });
}
/** Optional private projection retains no raw cause, invokes no application getter/serializer and cannot replace a public operation outcome.
 * Loss of inspection is explicit; raw input exists only transiently while hashing the bounded own-data message.
 * Proof: arbitrary reason passthrough and direct getter reads failed the privacy/accessor negatives; raw stored message failed exact record shape.
 */
function projectInitDiagnostic(cause: unknown): Readonly<InitDiagnostic> {
  const type = cause === null ? 'null' : typeof cause;
  try {
    if (typeof cause === 'string')
      return frameInitDiagnostic('unexpected-failure', type, 'primitive-string', cause);
    if ((typeof cause !== 'object' || cause === null) && typeof cause !== 'function')
      return frameInitDiagnostic('unexpected-failure', type, 'no-message', '');
    if (types.isProxy(cause))
      return frameInitDiagnostic('uninspectable-failure', type, 'uninspectable', '');
    let reason: DiagnosticReason = 'unexpected-failure';
    let reasonSource: DiagnosticReasonKind = 'not-refusal';
    if (isDiagnosticRefusal(cause)) {
      const descriptor = Object.getOwnPropertyDescriptor(cause, 'reason');
      reasonSource =
        descriptor === undefined
          ? 'absent-reason'
          : Object.hasOwn(descriptor, 'value')
            ? 'data-reason'
            : 'accessor-reason';
      const value: unknown =
        descriptor !== undefined && Object.hasOwn(descriptor, 'value')
          ? descriptor.value
          : undefined;
      const known = INIT_DIAGNOSTIC_REASONS.find((expected) => expected === value);
      reason = known ?? 'unrecognized-refusal';
    }
    const descriptor = Object.getOwnPropertyDescriptor(cause, 'message');
    if (descriptor === undefined)
      return frameInitDiagnostic(reason, type, 'absent-message', '', reasonSource);
    if (!Object.hasOwn(descriptor, 'value'))
      return frameInitDiagnostic(reason, type, 'accessor-message', '', reasonSource);
    const message: unknown = descriptor.value;
    return typeof message === 'string'
      ? frameInitDiagnostic(reason, type, 'data-message', message, reasonSource)
      : frameInitDiagnostic(reason, type, 'non-string-message', '', reasonSource);
  } catch {
    return frameInitDiagnostic('uninspectable-failure', type, 'uninspectable', '');
  }
}

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

export interface CaddyReadBinding {
  invariantContext?: InvariantContext;
  id: string;
  originalId: string;
  candidateId: string | null;
  nonce: string;
  name: '/wbs-caddy-1';
  invariantSha256: string;
}

/** Internal local socket injection is for owned native fixtures and Unix-socket tests only; CLI has no override. */
export class EngineTransport {
  private readonly ids: Set<string>;
  private readonly originals: ReadonlySet<string>;
  private readonly originalCaddyId: string | undefined;
  private readonly readIds = new Set<string>();
  private readonly caddyIds = new Set<string>();
  constructor(
    private readonly socket: string,
    ids: readonly string[],
    private readonly nonce: string,
    private readonly namespace: 'production' | 'owned-fixture' = 'production',
  ) {
    this.ids = new Set(ids.map(readIdentity));
    this.originals = new Set(this.ids);
    const caddy = ids.at(1);
    this.originalCaddyId = caddy;
    if (caddy !== undefined) this.caddyIds.add(caddy);
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
    raw = false,
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
            if (raw) {
              resolveResponse(Buffer.concat(chunks));
              return;
            }
            if (length === 0) {
              resolveResponse(null);
              return;
            }
            try {
              resolveResponse(
                JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))),
              );
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
  async version(timeout: number): Promise<unknown> {
    return this.call('GET', '/version', timeout, 200);
  }
  async info(timeout: number): Promise<unknown> {
    return this.call('GET', '/info', timeout, 200);
  }
  async image(id: string, timeout: number): Promise<unknown> {
    if (!/^sha256:[a-f0-9]{64}$/.test(id)) throw new InitRefusal('image-id-invalid');
    return this.call('GET', `/images/${id}/json`, timeout, 200);
  }
  async network(id: string, timeout: number): Promise<unknown> {
    return this.call('GET', `/networks/${readIdentity(id)}`, timeout, 200);
  }
  /** Resolves one independently pinned Docker name through the local daemon without expanding mutation membership.
   * Proof: syntax omission dispatched invalid names and failed the zero-dispatch name regression.
   */
  async networkByName(name: string, timeout: number): Promise<unknown> {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,254}$/.test(name))
      throw new InitRefusal('network-name-invalid');
    return this.call('GET', '/networks/' + encodeURIComponent(name), timeout, 200);
  }
  async volume(name: string, timeout: number): Promise<unknown> {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,254}$/.test(name))
      throw new InitRefusal('volume-name-invalid');
    return this.call('GET', `/volumes/${name}`, timeout, 200);
  }
  async inventory(timeout: number): Promise<unknown[]> {
    const listing = await this.call('GET', '/containers/json?all=1', timeout, 200);
    if (!Array.isArray(listing) || listing.length > 65536)
      throw new InitRefusal('container-list-invalid');
    const entries: unknown[] = listing;
    this.readIds.clear();
    for (const raw of entries) this.readIds.add(readIdentity(readFields(raw)['Id']));
    return entries;
  }
  async inspectListed(id: string, timeout: number): Promise<NativeContainer> {
    if (!this.readIds.has(readIdentity(id))) throw new InitRefusal('unlisted-container');
    return parseNativeContainer(await this.call('GET', `/containers/${id}/json`, timeout, 200));
  }
  async resolveCandidate(kind: TargetKind, timeout: number): Promise<NativeContainer> {
    const name = `wbs-init-${this.nonce}-${kind}`;
    const observed = parseNativeContainer(
      await this.call('GET', `/containers/${name}/json`, timeout, 200),
    );
    if (observed.name !== `/${name}`) throw new InitRefusal('reserved-name-mismatch');
    return observed;
  }
  async inspectAbsent(id: string, timeout: number): Promise<boolean> {
    this.select(id);
    await this.inventory(timeout);
    // Complete native listing supplies absence without converting an arbitrary transport error to 404.
    return !this.readIds.has(readIdentity(id)) && this.ids.has(id);
  }
  async execCaddy(id: string, command: 'adapt' | 'live', timeout: number): Promise<string> {
    this.select(id);
    // Proof: Caddy-roster omission reached a registry Exec request; the real Unix-socket discovery test failed.
    if (!this.caddyIds.has(id) || !['adapt', 'live'].includes(command))
      throw new InitRefusal('unselected-caddy-exec');
    return this.runCaddyExec(id, command, timeout);
  }
  private async runCaddyExec(
    id: string,
    command: 'adapt' | 'live',
    timeout: number,
  ): Promise<string> {
    const expires = performance.now() + timeout;
    const remaining = () => {
      const milliseconds = Math.floor(expires - performance.now());
      if (milliseconds <= 0) throw new InitRefusal('exec-deadline-uncertain');
      return milliseconds;
    };
    const reply = readFields(
      await this.call('POST', `/containers/${id}/exec`, remaining(), 201, {
        AttachStdin: false,
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        Privileged: false,
        Cmd:
          command === 'adapt'
            ? ['caddy', 'adapt', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile']
            : ['wget', '-qO-', 'http://127.0.0.1:2019/config/'],
      }),
    );
    const exec = readIdentity(reply['Id']);
    const stream = await this.call(
      'POST',
      `/exec/${exec}/start`,
      remaining(),
      200,
      { Detach: false, Tty: false },
      true,
    );
    if (!Buffer.isBuffer(stream)) throw new InitRefusal('exec-stream-invalid');
    const chunks: Buffer[] = [];
    for (let offset = 0; offset < stream.length;) {
      if (
        stream.length - offset < 8 ||
        stream[offset + 1] !== 0 ||
        stream[offset + 2] !== 0 ||
        stream[offset + 3] !== 0
      )
        throw new InitRefusal('exec-frame-invalid');
      const channel = stream[offset];
      const length = stream.readUInt32BE(offset + 4);
      // Proof: stderr admission omission made the secret-output Exec negative succeed; its test failed.
      if (
        ![1, 2].includes(channel) ||
        length > stream.length - offset - 8 ||
        (channel === 2 && length > 0)
      )
        throw new InitRefusal('exec-output-refused');
      if (channel === 1) chunks.push(stream.subarray(offset + 8, offset + 8 + length));
      offset += 8 + length;
    }
    const terminal = readFields(await this.call('GET', `/exec/${exec}/json`, remaining(), 200));
    // Proof: terminal-running and container-binding omissions each made its real Exec negative succeed.
    if (
      terminal['ID'] !== exec ||
      terminal['ContainerID'] !== id ||
      terminal['Running'] !== false ||
      terminal['ExitCode'] !== 0
    )
      throw new InitRefusal('exec-terminal-unverified');
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    } catch {
      throw new InitRefusal('exec-utf8-invalid');
    }
  }
  /** Fixed read-only Exec for receipt-bound serving Caddy; never enrolls a listed ID for effects or ordinary Exec. */
  async observeCaddyListed(
    binding: CaddyReadBinding,
    command: 'adapt' | 'live',
    timeout: number,
  ): Promise<string> {
    const fields = readFields(binding);
    const keys = Object.keys(fields);
    // Proof: closed-binding omission admitted the extra-field Unix-socket negative.
    if (
      keys.length !== (Object.hasOwn(fields, 'invariantContext') ? 7 : 6) ||
      keys.some(
        (key) =>
          ![
            'id',
            'originalId',
            'candidateId',
            'nonce',
            'name',
            'invariantSha256',
            'invariantContext',
          ].includes(key),
      )
    )
      throw new InitRefusal('caddy-read-binding-invalid');
    const context = binding.invariantContext;
    if (
      context !== undefined &&
      (context.owner.id !== binding.id ||
        context.owner.phase !== 'running' ||
        (binding.id === binding.originalId
          ? context.owner.role !== 'original'
          : context.owner.role !== 'replacement' ||
            context.owner.originalId !== binding.originalId))
    )
      throw new InitRefusal('caddy-read-binding-invalid');
    readIdentity(binding.id);
    readIdentity(binding.originalId);
    if (binding.candidateId !== null) readIdentity(binding.candidateId);
    // Proof: attempt-binding omission allowed another nonce to issue the fixed Exec in its selected negative.
    if (
      this.originalCaddyId === undefined ||
      binding.originalId !== this.originalCaddyId ||
      binding.nonce !== this.nonce ||
      fields['name'] !== '/wbs-caddy-1' ||
      (binding.candidateId !== null && this.originals.has(binding.candidateId)) ||
      (binding.id !== this.originalCaddyId && binding.id !== binding.candidateId) ||
      typeof binding.invariantSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(binding.invariantSha256) ||
      !['adapt', 'live'].includes(command)
    )
      throw new InitRefusal('caddy-read-binding-invalid');
    // Proof: budget admission omission admitted the over-ceiling observation negative.
    if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 10000)
      throw new InitRefusal('caddy-read-budget-invalid');
    const selected = { ...binding };
    const expires = performance.now() + timeout;
    const remaining = () => {
      const milliseconds = Math.floor(expires - performance.now());
      if (milliseconds <= 0) throw new InitRefusal('caddy-read-deadline-uncertain');
      return milliseconds;
    };
    // Proof: replacing the remaining budget with a fresh timeout admitted the delayed seven-read negative.
    // Injecting roster promotion here made the post-read mutation refusal negative fail.
    const before = await this.observeCaddyIdentity(selected, remaining);
    const output = await this.runCaddyExec(selected.id, command, remaining());
    const after = await this.observeCaddyIdentity(selected, remaining);
    // Proof: omission admitted a changed PID after Exec in the real Unix-socket observation test.
    if (after !== before) throw new InitRefusal('caddy-read-process-changed');
    remaining();
    return output;
  }
  private async observeCaddyIdentity(
    binding: CaddyReadBinding,
    remaining: () => number,
  ): Promise<string> {
    const listing = await this.inventory(remaining());
    const ids = new Set<string>();
    const owners: string[] = [];
    for (const raw of listing) {
      const fields = readFields(raw),
        id = readIdentity(fields['Id']),
        names: unknown = fields['Names'];
      // Proof: duplicate-ID and canonical-owner omissions separately admitted their ambiguous-inventory negatives.
      if (
        ids.has(id) ||
        !Array.isArray(names) ||
        names.some((name: unknown) => typeof name !== 'string')
      )
        throw new InitRefusal('caddy-read-inventory-ambiguous');
      ids.add(id);
      if (names.includes(binding.name)) owners.push(id);
    }
    if (owners.length !== 1 || owners[0] !== binding.id)
      throw new InitRefusal('caddy-read-name-unbound');
    const observed = await this.inspectListed(binding.id, remaining());
    // Proof: full-ID, name, role and immutable-hash omissions separately admitted their selected native readback negatives.
    if (
      observed.id !== binding.id ||
      observed.name !== binding.name ||
      readFields(observed.config['Labels'])['com.docker.compose.service'] !== 'caddy' ||
      // Proof: omitting the declared profile admitted an unknown-profile read through the actual Unix-socket boundary.
      fingerprint(projectInvariant(observed, binding.invariantContext)) !== binding.invariantSha256
    )
      throw new InitRefusal('caddy-read-invariant-differs');
    // Proof: replacing the running-state check with an unchecked identity admitted the paused-container negative.
    return checkRunning(observed);
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
    if (kind === 'caddy') this.caddyIds.add(id);
    if (
      (reply['Warnings'] !== null &&
        (!Array.isArray(reply['Warnings']) || reply['Warnings'].length !== 0)) ||
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
        ...(this.namespace === 'production'
          ? ['wbs-registry-1', 'wbs-caddy-1']
          : [`wbs-init-${this.nonce}-registry-fixture`, `wbs-init-${this.nonce}-caddy-fixture`]),
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
  networks?: readonly NetworkPin[];
}
export interface AdoptionSelection {
  nonce: string;
  targets: readonly [SelectedTarget, SelectedTarget];
  namespace?: 'production' | 'owned-fixture';
  invariantProfile?: InvariantProfile;
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
type Effects = Pick<
  EngineTransport,
  'inspect' | 'create' | 'stop' | 'rename' | 'start' | 'remove' | 'network' | 'networkByName'
>;
type ReceiptWriter = Pick<PrivateReceipts, 'publish'>;
interface MonotonicClock {
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
}

/** Fresh ID and exact-name network reads bind pinned configuration and inactive candidate membership to a stable native observation.
 * Proof: omitting either read admitted its wrong-owner/config response; ID/Name omissions admitted independently hash-consistent wrong owners.
 * Configuration, either membership check, fresh readback and stable snapshot omissions each failed their real Unix-socket regressions.
 */
export async function observeNetworks(
  engine: Pick<EngineTransport, 'inspect' | 'network' | 'networkByName'>,
  observed: NativeContainer,
  context: InvariantContext,
  deadline: Deadline,
): Promise<void> {
  projectInvariant(observed, context);
  const before = snapshot(observed);
  for (const pin of context.networks) {
    const byId = await engine.network(pin.id, deadline.allocate(10000));
    const byName = await engine.networkByName(pin.name, deadline.allocate(10000));
    for (const response of [byId, byName]) {
      const fields = readFields(response),
        { Containers, ...configuration } = fields;
      if (
        fields['Id'] !== pin.id ||
        fields['Name'] !== pin.name ||
        fingerprint(configuration) !== pin.sha256
      )
        throw new InitRefusal('network-pin-differs');
      const members = readFields(Containers);
      if (
        context.owner.role === 'replacement' &&
        context.owner.phase === 'never-started' &&
        Object.hasOwn(members, context.owner.id)
      )
        throw new InitRefusal('candidate-network-active');
    }
  }
  const after = await engine.inspect(context.owner.id, deadline.allocate(10000));
  projectInvariant(after, context);
  function snapshot(container: NativeContainer): string {
    return fingerprint({
      id: container.id,
      name: container.name,
      image: container.image,
      config: container.config,
      host: container.host,
      mounts: container.mounts,
      networks: container.networks,
      sandboxId: container.sandboxId,
      sandboxKey: container.sandboxKey,
      ports: container.ports,
      restartCount: container.restartCount,
      state: Object.fromEntries(
        ['Status', 'Running', 'Paused', 'Restarting', 'Dead', 'Pid', 'StartedAt', 'FinishedAt'].map(
          (key) => [key, container.state[key]],
        ),
      ),
    });
  }
  if (before !== snapshot(after)) throw new InitRefusal('network-observation-unstable');
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
  const fixture = selection.namespace === 'owned-fixture';
  for (const target of selection.targets) {
    checkProfileSource(target.original, selection.invariantProfile);
    if (selection.invariantProfile !== undefined) {
      if (target.networks === undefined) throw new InitRefusal('network-pins-missing');
      projectInvariant(target.original, {
        profile: selection.invariantProfile,
        owner: { role: 'original', id: target.original.id, phase: 'running' },
        networks: target.networks,
      });
    }
  }
  const contextFor = (
    target: SelectedTarget,
    id: string,
    phase: 'never-started' | 'running',
  ): InvariantContext | undefined => {
    if (selection.invariantProfile === undefined) return undefined;
    if (target.networks === undefined) throw new InitRefusal('network-pins-missing');
    return {
      profile: selection.invariantProfile,
      owner: { role: 'replacement', id, originalId: target.original.id, phase },
      networks: target.networks,
    };
  };
  if (
    registry.kind !== 'registry' ||
    caddy.kind !== 'caddy' ||
    registry.original.id === caddy.original.id ||
    registry.original.name !==
      (fixture ? `/wbs-init-${selection.nonce}-registry-fixture` : '/wbs-registry-1') ||
    caddy.original.name !==
      (fixture ? `/wbs-init-${selection.nonce}-caddy-fixture` : '/wbs-caddy-1') ||
    (fixture &&
      selection.targets.some(
        (target) =>
          readFields(target.original.config['Labels'])['club.bulletpoints.edge-init-fixture'] !==
          selection.nonce,
      ))
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
      // Proof: omitting owner-context propagation failed the blank-endpoint finite-sequence positive.
      if (replacement.name !== `/wbs-init-${selection.nonce}-${target.kind}`)
        throw new InitRefusal('candidate-name-mismatch');
      const createdContext = contextFor(target, candidate, 'never-started');
      compareCandidate(before, replacement, createdContext);
      checkInert(replacement);
      // Proof: omitting this fresh observation let the native-shaped modeled operation stop with active candidate membership.
      if (createdContext !== undefined)
        await observeNetworks(engine, replacement, createdContext, deadline);
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
      const renamedContext = contextFor(target, candidateId, 'never-started');
      compareCandidate(before, renamed, renamedContext);
      if (renamed.name !== before.name) throw new InitRefusal('candidate-rename-unverified');
      if (renamedContext !== undefined)
        await observeNetworks(engine, renamed, renamedContext, deadline);
      phase = 'start-uncertain';
      await effect('start-intended', 20000, (timeout) => engine.start(candidateId, timeout));
      phase = 'candidate-running-unhealthy';
      let identity: string | undefined;
      const firstRound = clock.now();
      for (let round = 0; round < 3; round++) {
        const running = await engine.inspect(candidateId, deadline.allocate(10000));
        const runningContext = contextFor(target, candidateId, 'running');
        compareCandidate(before, running, runningContext);
        if (runningContext !== undefined)
          await observeNetworks(engine, running, runningContext, deadline);
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
  } catch (cause) {
    // No raw transport/host cause reaches public diagnostics or hash-only receipts.
    try {
      await publish(phase);
    } catch {
      // Proof: omitted boundary exposed SECRET from a persistently failing receipt writer in the real finite sequence.
      throw new InitRefusal(`${phase}-receipt-publication-failed`);
    }
    const refusal = new InitRefusal(phase);
    // Proof: omitted registration and phase-only projection lost actual inner reasons; raw cause/message attachment failed public error privacy.
    // Failure publication precedes this optional capture; moving capture into its failure path failed metadata-absence proof.
    initDiagnostics.set(refusal, projectInitDiagnostic(cause));
    throw refusal;
  }
}
