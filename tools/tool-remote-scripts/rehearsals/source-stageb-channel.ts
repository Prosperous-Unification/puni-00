import type { ChildProcess } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

import {
  advanceSourceSequence,
  decodeSourceChannelReply,
  decodeSourceChannelRequest,
  type SourceChannelRequest,
  type SourceOwnership,
  type SourceProviderChannel,
  type SourceSequence,
} from './source-participant-profile';

const frameLimit = 8 * 2 ** 20;
const transportLimit = 128 * 2 ** 20;

/** Cumulative inbound reads and outbound reservations, including prefixes; no refunds or archive completeness claim. */
export class SourceTransportBudget {
  private charged = 0;

  get bytes(): number {
    return this.charged;
  }

  charge(bytes: number): void {
    // Proof: dropping this bound let an almost-exhausted real write reach its output consumer (raw-budget fault).
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > transportLimit - this.charged)
      throw new Error('source channel raw budget exceeded');
    this.charged += bytes;
  }
}

/** Private framing only; JSON validity and operation authority belong to the existing decoders. */
export function encodeSourceFrame(value: unknown, budget: SourceTransportBudget): Buffer {
  const json: unknown = JSON.stringify(value);
  if (typeof json !== 'string') throw new Error('source channel JSON absent');
  const bytes = Buffer.byteLength(json);
  // Proof: encoder-bound omission wrote oversized JSON to the output consumer instead of refusing.
  if (bytes < 1 || bytes > frameLimit) throw new Error('source channel frame length refused');
  budget.charge(4 + bytes);
  const frame = Buffer.allocUnsafe(4 + bytes);
  frame.writeUInt32BE(bytes);
  frame.write(json, 4);
  return frame;
}

/** Private failure preserves the first exchange error separately from teardown errors. */
export class SourceChannelFailure extends Error {
  constructor(
    readonly primary: unknown,
    readonly cleanup: readonly unknown[],
  ) {
    super('private source channel failed');
  }
}

export interface SourceChannelEndpoints {
  readonly input: Readable;
  readonly output: Writable;
  readonly budget: SourceTransportBudget;
  readonly deadline: number;
  readonly signal?: AbortSignal;
}

function assertDeadline(deadline: number, maximum: number): void {
  // Proof: deadline-validator omission consumed buffered frames under expired, extended and nonfinite bounds.
  if (!Number.isFinite(deadline) || deadline > maximum || deadline <= performance.now())
    throw new Error('source channel deadline refused');
}

/** Owns only supplied open private streams. No descriptor/path/program lookup or stdin fallback exists. */
export class SourceFrameTransport {
  private failure: unknown;
  private failed = false;
  private closed = false;
  private readonly originalDeadline: number;
  private readonly endpointJoined: Promise<void>;
  private inputCloseFailure: { readonly cause: unknown } | undefined;
  private outputCloseFailure: { readonly cause: unknown } | undefined;

  constructor(private readonly endpoints: SourceChannelEndpoints) {
    const deadline = endpoints.deadline;
    assertDeadline(deadline, deadline);
    this.originalDeadline = deadline;
    // Proof: snapshot omission redirected the original write into caller replacement streams/budget.
    this.endpoints = {
      input: endpoints.input,
      output: endpoints.output,
      budget: endpoints.budget,
      signal: endpoints.signal,
      deadline,
    };
    // Proof: omitting either close observation falsely joined the independently held input/output destroy.
    this.endpointJoined = (async () => {
      await Promise.all([
        new Promise<void>((resolve) => {
          this.endpoints.input.once('close', resolve);
        }),
        new Promise<void>((resolve) => {
          this.endpoints.output.once('close', resolve);
        }),
      ]);
    })();
    this.endpoints.input.on('error', (cause: unknown) => {
      // Proof: input error-retention omission lost the delayed destroy cleanup failure.
      this.inputCloseFailure ??= { cause };
      this.fail(cause);
    });
    this.endpoints.output.on('error', (cause: unknown) => {
      // Proof: output error-retention omission lost the delayed destroy cleanup failure.
      this.outputCloseFailure ??= { cause };
      this.fail(cause);
    });
    this.endpoints.signal?.addEventListener('abort', this.abort, { once: true });
    if (this.endpoints.signal?.aborted) this.abort();
  }

  /** Captured once; later caller mutation of the endpoint record cannot extend any operation. */
  get deadline(): number {
    return this.originalDeadline;
  }

  /** Actual close events only. The channel combines this promise with child join under the same bound. */
  get endpointSettlement(): Promise<void> {
    return this.endpointJoined;
  }

  /** Bounded first error from each owned endpoint, retained independently of the primary wire cause. */
  get endpointFailures(): readonly unknown[] {
    const failures: unknown[] = [];
    if (this.inputCloseFailure !== undefined) failures.push(this.inputCloseFailure.cause);
    if (this.outputCloseFailure !== undefined) failures.push(this.outputCloseFailure.cause);
    return failures;
  }

  // Proof: abort-dispatch omission left buffered IO open; the immediate cancellation consumer failed.
  private readonly abort = () => {
    this.fail(new Error('source channel cancelled'));
  };

  private readonly fail = (cause: unknown) => {
    // Proof: overwriting this first cause replaced the private primary with a later owned-child error.
    if (!this.failed) this.failure = cause;
    this.failed = true;
    this.endpoints.input.destroy();
    this.endpoints.output.destroy();
  };

  refuse(cause: unknown): void {
    this.fail(cause);
  }

  /** Rechecks cancellation, physical closure and the original bound after queued IO completes. */
  assertLive(deadline: number): void {
    if (this.failed) throw this.failure;
    if (this.closed) throw new Error('source channel closed');
    assertDeadline(deadline, this.originalDeadline);
  }

  private async bounded<T>(action: () => Promise<T>, deadline: number): Promise<T> {
    this.assertLive(deadline);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        action(),
        new Promise<never>((_, reject) => {
          // Proof: omitting this timer left the stalled writer IO open at its bound; only the test fallback released it.
          timer = setTimeout(
            () => {
              const cause = new Error('source channel deadline exceeded');
              this.fail(cause);
              reject(cause);
            },
            Math.max(0, deadline - performance.now()),
          );
        }),
      ]);
    } catch (cause) {
      this.fail(cause);
      throw this.failure;
    } finally {
      clearTimeout(timer);
    }
  }

  private async readBytes(length: number, deadline: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let remaining = length;
    while (remaining > 0) {
      this.assertLive(deadline);
      const chunk: unknown = this.endpoints.input.read(
        Math.min(remaining, this.endpoints.input.readableLength || 65536, 65536),
      );
      if (chunk !== null) {
        if (!Buffer.isBuffer(chunk)) throw new Error('source channel requires binary stream');
        this.endpoints.budget.charge(chunk.length);
        chunks.push(chunk);
        remaining -= chunk.length;
        continue;
      }
      if (this.endpoints.input.readableEnded || this.endpoints.input.destroyed)
        throw new Error('source channel truncated frame');
      await this.bounded(
        () =>
          new Promise<void>((resolve, reject) => {
            const input = this.endpoints.input;
            const clean = () => {
              input.off('readable', ready);
              input.off('end', ended);
              input.off('close', ended);
              input.off('error', failed);
            };
            const ready = () => {
              clean();
              resolve();
            };
            const ended = () => {
              clean();
              reject(new Error('source channel truncated frame'));
            };
            const failed = (cause: Error) => {
              clean();
              reject(cause);
            };
            input.once('readable', ready);
            input.once('end', ended);
            input.once('close', ended);
            input.once('error', failed);
          }),
        deadline,
      );
    }
    return Buffer.concat(chunks, length);
  }

  async read(deadline = this.originalDeadline): Promise<unknown> {
    try {
      const prefix = await this.readBytes(4, deadline);
      const length = prefix.readUInt32BE(0);
      // Proof: omitting this bound let the padded oversized request dispatch; wire-length fault failed the zero-body-read consumer case.
      if (length < 1 || length > frameLimit) throw new Error('source channel frame length refused');
      const body = await this.readBytes(length, deadline);
      // Proof: fatal=false returned replacement-character JSON; parse omission returned malformed text, each failing its raw-reader negative.
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    } catch (cause) {
      this.fail(cause);
      throw this.failure;
    }
  }

  async write(value: unknown, deadline = this.originalDeadline): Promise<void> {
    try {
      this.assertLive(deadline);
      const frame = encodeSourceFrame(value, this.endpoints.budget);
      await this.bounded(
        () =>
          new Promise<void>((resolve, reject) => {
            this.endpoints.output.write(frame, (cause) => {
              if (cause) reject(cause);
              else resolve();
            });
          }),
        deadline,
      );
    } catch (cause) {
      this.fail(cause);
      throw this.failure;
    }
  }

  /** Initiates owned-stream destruction idempotently; endpointSettlement, not destroyed flags, proves close. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.endpoints.signal?.removeEventListener('abort', this.abort);
    this.endpoints.input.destroy();
    this.endpoints.output.destroy();
  }

  get primaryFailure(): unknown {
    return this.failure;
  }
}

/** A runner channel validates raw envelopes without replacing the measurement's existing decoder. */
export class SourceStageBChannel implements SourceProviderChannel {
  private sequence = 1;
  private busy = false;
  private terminal = false;
  private closing: Promise<void> | undefined;
  private childClosed = false;
  private childErrorSeen = false;
  private signalling = false;
  private childControlFailure: { readonly cause: unknown } | undefined;
  private readonly joined: Promise<void>;

  constructor(
    private readonly transport: SourceFrameTransport,
    private readonly owned: SourceOwnership,
    private readonly child: ChildProcess,
    private readonly deadline: number,
  ) {
    // Proof: maximum-bound omission accepted a channel constructor extending the transport cleanup deadline.
    assertDeadline(deadline, transport.deadline);
    // Proof: listener omission made the owned child's error event throw outside the private failure boundary.
    child.on('error', this.observeChildError);
    this.joined = new Promise<void>((resolve) => {
      child.once('close', () => {
        this.childClosed = true;
        resolve();
      });
    });
  }

  private readonly observeChildError = (cause: unknown): void => {
    const first = !this.childErrorSeen;
    this.childErrorSeen = true;
    this.terminal = true;
    this.transport.refuse(cause);
    if (this.signalling || this.closing !== undefined) this.childControlFailure ??= { cause };
    if (first && !this.signalling && !this.childClosed) this.signalChild('SIGKILL');
  };

  private signalChild(signal: 'SIGTERM' | 'SIGKILL'): void {
    this.signalling = true;
    try {
      this.child.kill(signal);
    } catch (cause) {
      // Proof: omitting this catch let a controlled owned-child kill throw over its first private error.
      this.childControlFailure ??= { cause };
      this.observeChildError(cause);
    } finally {
      this.signalling = false;
    }
  }

  async exchange(request: SourceChannelRequest, deadline: number): Promise<unknown> {
    // Proof: gate omission lost the terminal-error classification in the wrong-sequence child case; destroyed IO still refused, so this is not independent unsafe-success proof.
    if (this.terminal || this.closing !== undefined) throw new Error('source channel terminal');
    // Proof: removing overlap admission issued a second transport write while the first exchange remained pending.
    if (this.busy) {
      this.terminal = true;
      const cause = new Error('source channel overlapping exchange');
      this.transport.refuse(cause);
      throw cause;
    }
    this.busy = true;
    try {
      assertDeadline(deadline, this.deadline);
      // Proof: call-site omission wrote a wrong-nonce request; the zero-write consumer failed.
      const checked = decodeSourceChannelRequest(request, this.owned.nonce, this.sequence);
      await this.transport.write(checked, deadline);
      const reply = await this.transport.read(deadline);
      // Proof: omitting this post-read check let a completed real reply escape after concurrent overlap poisoned the channel.
      this.assertCurrent(deadline);
      // Proof: omitting this decoder accepted the wrong-sequence inert child reply; the expected rejection failed.
      decodeSourceChannelReply(reply, checked, this.owned);
      this.sequence++;
      return reply;
    } catch (cause) {
      this.terminal = true;
      this.transport.refuse(cause);
      if (!this.childClosed) this.signalChild('SIGKILL');
      throw cause;
    } finally {
      this.busy = false;
    }
  }

  private assertCurrent(deadline: number): void {
    if (this.terminal || this.closing !== undefined) throw new Error('source channel terminal');
    this.transport.assertLive(deadline);
  }

  /** Owns the exact supplied child only; exhausted cleanup time is failure, never a joined claim. */
  closeAndJoin(deadline: number): Promise<void> {
    if (this.closing !== undefined) return this.closing;
    this.terminal = true;
    // Proof: replacing settlement with a resolved promise left the inert owned child unsettled; its test-only fallback reaped it after the join assertion failed.
    this.closing = this.settle(deadline);
    return this.closing;
  }

  private async settle(deadline: number): Promise<void> {
    this.transport.close();
    const failures: unknown[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      assertDeadline(deadline, this.deadline);
      if (!this.childClosed) this.signalChild('SIGTERM');
      await Promise.race([
        // Proof: omitting endpoint settlement returned joined while an independent destroy was still pending.
        Promise.all([this.joined, this.transport.endpointSettlement]),
        new Promise<never>((_, reject) => {
          // Proof: timer omission returned only after the test-owned late release; the timely-unproved oracle failed.
          timer = setTimeout(
            () => {
              reject(new Error('source channel owned join deadline exceeded'));
            },
            Math.max(0, deadline - performance.now()),
          );
        }),
      ]);
      // Proof: omitting this check accepted actual completed joins after the selected logical deadline.
      assertDeadline(deadline, this.deadline);
    } catch (cause) {
      failures.push(cause);
      if (!this.childClosed) this.signalChild('SIGKILL');
    } finally {
      clearTimeout(timer);
    }
    // Proof: report omission returned success despite either independently delayed endpoint destroy error.
    failures.push(...this.transport.endpointFailures);
    if (this.childControlFailure !== undefined) failures.push(this.childControlFailure.cause);
    if (failures.length > 0)
      throw new SourceChannelFailure(this.transport.primaryFailure, failures);
  }
}

/** Provider framing boundary; only a decoded request can be passed to a future fixed handler. */
export class SourceProviderSession {
  private sequence = 1;
  private pending: SourceChannelRequest | undefined;
  private phase: SourceSequence = 'cold';
  private nextPhase: SourceSequence | undefined;
  private busy = false;
  private terminal = false;

  constructor(
    private readonly transport: SourceFrameTransport,
    private readonly owned: SourceOwnership,
  ) {}

  private assertCurrent(deadline: number): void {
    if (this.terminal) throw new Error('source provider terminal');
    // Proof: omission accepted a completed request after transport poisoning and committed a completed reply after its shorter deadline.
    this.transport.assertLive(deadline);
  }

  async request(deadline: number): Promise<SourceChannelRequest> {
    try {
      // Proof: overlap-gate omission started a second transport read while the first request remained pending.
      if (this.terminal || this.busy || this.pending !== undefined)
        throw new Error('source provider overlapping or terminal request');
      this.busy = true;
      const raw = await this.transport.read(deadline);
      // Proof: omission exposed a completed real request after another request terminally poisoned its queued continuation.
      this.assertCurrent(deadline);
      // Proof: call-site omission exposed a wrong-nonce request to the consumer.
      const request = decodeSourceChannelRequest(raw, this.owned.nonce, this.sequence);
      // Proof: lifecycle omission exposed a repeated acknowledge after the first successful acknowledgement.
      this.nextPhase = advanceSourceSequence(this.phase, request.operation);
      this.pending = request;
      return request;
    } catch (cause) {
      this.terminal = true;
      this.transport.refuse(cause);
      throw cause;
    } finally {
      this.busy = false;
    }
  }

  async reply(reply: unknown, deadline: number): Promise<void> {
    try {
      if (this.terminal || this.busy || this.pending === undefined)
        throw new Error('source provider reply without request');
      this.busy = true;
      // Proof: call-site omission wrote a wrong-correlated provider reply instead of refusing before output.
      const checked = decodeSourceChannelReply(reply, this.pending, this.owned);
      await this.transport.write(reply, deadline);
      // Proof: omission committed phase after completed real output was terminally poisoned by an overlapping reply.
      this.assertCurrent(deadline);
      if (checked.status !== 'refused') {
        if (this.nextPhase === undefined) throw new Error('source provider phase absent');
        this.phase = this.nextPhase;
      }
      this.sequence++;
      this.pending = undefined;
      this.nextPhase = undefined;
    } catch (cause) {
      this.terminal = true;
      this.transport.refuse(cause);
      throw cause;
    } finally {
      this.busy = false;
    }
  }
}
