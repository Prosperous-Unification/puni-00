import {
  closeSync,
  constants,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  writeSync,
} from 'node:fs';
import { constants as osConstants } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';

import {
  createOutputs,
  type Diagnostic,
  type Interrupt,
  type Outputs,
  type Sink,
  type Write,
} from '@shared/bun-output';
import { createFailureRedaction, reportFailure } from '@shared/failures';

import { createDevelopmentChannel, type DevelopmentChannel } from './development-channel';
import type { DevelopmentRequest } from './grammar-facade';
import { createJobControl } from './ops/job-control';

/** Captured only by an executable; default inheritance and captured sink ownership are explicit. */
export interface DevelopmentExecutableIO {
  readonly stdin: 0;
  readonly stdout: 1;
  readonly stderr: 2;
  readonly openStdout: () => Sink;
  readonly openStderr: () => Sink;
  readonly recordDiagnosticAttempt: (cause: unknown, outcome: Diagnostic) => void;
  readonly readDiagnosticAttempt: () =>
    { readonly cause: unknown; readonly outcome: Diagnostic } | undefined;
}

/** Synchronous enqueue ports; their owner awaits delivery before leaving admission. */
export interface DevelopmentPreflightOutput {
  readonly stdout: (bytes: string | Uint8Array) => void;
  readonly stderr: (bytes: string | Uint8Array) => void;
}

/** Required caller-owned admission; the provider never imports PUNI's embedded port core. */
export interface DevelopmentContext {
  readonly runtime: string;
  readonly callerDirectory: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly stdout: (bytes: Uint8Array) => void | Promise<void>;
  readonly stderr: (bytes: Uint8Array) => void | Promise<void>;
  readonly preflight: (output: DevelopmentPreflightOutput) => Promise<number>;
  readonly executableIO?: DevelopmentExecutableIO;
}

/** Address only this repository's installed Nx package, never a registry or PATH substitute. */
function readNxEntrypoint(repository: string): string {
  const directory = realpathSync.native(join(repository, 'node_modules/nx'));
  const metadata: unknown = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  if (
    metadata === null ||
    typeof metadata !== 'object' ||
    !('name' in metadata) ||
    metadata.name !== 'nx' ||
    !('bin' in metadata) ||
    metadata.bin === null ||
    typeof metadata.bin !== 'object' ||
    !('nx' in metadata.bin) ||
    typeof metadata.bin.nx !== 'string' ||
    metadata.bin.nx.length === 0 ||
    isAbsolute(metadata.bin.nx)
  )
    throw new Error(
      'development requires the addressed workspace local nx package and relative nx bin',
    );
  const entrypoint = realpathSync.native(join(directory, metadata.bin.nx));
  if (!entrypoint.startsWith(directory + sep) || !statSync(entrypoint).isFile())
    throw new Error('development nx bin is not a regular file inside its installed package');
  return entrypoint;
}

function isSignal(value: unknown): value is NodeJS.Signals {
  return typeof value === 'string' && Object.hasOwn(osConstants.signals, value);
}

/** Native callback spelling and numeric exited projection must agree before a successful join. */
function readNativeStatus(code: number | null, signal: unknown, exited: number): number {
  if (code !== null) {
    if (signal !== null || !Number.isInteger(code) || code < 0 || code > 255 || code !== exited)
      throw new Error('development native exit and numeric status disagree');
    return code;
  }
  if (!isSignal(signal) || exited !== 128 + osConstants.signals[signal])
    throw new Error('development native signal and numeric status disagree');
  return exited;
}

/** This owned session may already be gone; all other signal failures remain failures. */
function signalDevelopment(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch (cause: unknown) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH') return;
    throw cause;
  }
}

/** Byte-oriented awk-compatible CSI filtering; incomplete/malformed escapes stay literal. */
class CaptureFilter {
  private pending: number[] = [];
  private hasOpenRecord = false;
  constructor(private readonly descriptor: number) {}
  private writeBytes(bytes: readonly number[]): void {
    if (bytes.length === 0) return;
    const chunk = Buffer.from(bytes);
    let offset = 0;
    while (offset < chunk.length) {
      const written = writeSync(this.descriptor, chunk, offset, chunk.length - offset);
      if (written <= 0) throw new Error('development capture write made no progress');
      offset += written;
    }
  }
  write(chunk: Uint8Array): void {
    if (chunk.length > 0) this.hasOpenRecord = chunk.at(-1) !== 10;
    const literal: number[] = [];
    for (const byte of chunk) {
      if (this.pending.length === 0) {
        if (byte === 27) this.pending.push(byte);
        else literal.push(byte);
      } else if (this.pending.length === 1 && byte === 91) this.pending.push(byte);
      else if (
        this.pending.length >= 2 &&
        ((byte >= 48 && byte <= 57) || byte === 59 || byte === 63)
      )
        this.pending.push(byte);
      else if (
        this.pending.length >= 2 &&
        ((byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122))
      )
        this.pending = [];
      else {
        for (const pending of this.pending) literal.push(pending);
        this.pending = [];
        if (byte === 27) this.pending.push(byte);
        else literal.push(byte);
      }
    }
    this.writeBytes(literal);
  }
  finish(): void {
    this.writeBytes(this.pending);
    this.pending = [];
    if (this.hasOpenRecord) this.writeBytes([10]);
  }
}

/**
 * Own one local Nx session through required root preflight, native status, stream EOF and capture.
 * This reusable API never exits/replaces its caller. Callback callers retain pipes; explicit
 * executable descriptors inherit in default mode and captured mode awaits native output. Capture
 * uses one physical merged channel, preserving its order before terminal/file delivery. Darwin's
 * native backend is implemented but unqualified. No escaped-daemon/descendant absence is inferred.
 */
export async function runDevelopment(
  request: DevelopmentRequest,
  context: DevelopmentContext,
): Promise<number> {
  const selected = { ...request },
    environment = { ...context.environment };
  const callerDirectory = context.callerDirectory,
    runtime = context.runtime;
  const writeStdout = context.stdout,
    writeStderr = context.stderr,
    preflight = context.preflight;
  const executableIO = context.executableIO === undefined ? undefined : { ...context.executableIO };
  const control = createJobControl();
  const retention = setInterval(() => undefined, 1000);
  let child: Bun.Subprocess | undefined;
  let channel: DevelopmentChannel | undefined;
  let isWriterClosed = false;
  let capture: { readonly descriptor: number; readonly filter: CaptureFilter } | undefined;
  let primary: { readonly cause: unknown } | undefined;
  const failures: unknown[] = [];
  let nativeOutputs: Outputs | undefined;
  let hasCancelledOutput = false;
  const outputObservers = new Set<(signal: Interrupt) => void>();
  let escalation: ReturnType<typeof setTimeout> | undefined;
  let settlement: ReturnType<typeof setTimeout> | undefined;
  const expired = Promise.withResolvers<never>();
  void expired.promise.catch(() => undefined);
  let interruptions = 0;
  const requestedSignals = new Set<NodeJS.Signals>();
  let isOperationClosed = false;
  let nativeSettlement: Promise<unknown> | undefined;
  let operationSettlement: Promise<unknown> | undefined;
  function readPrimaryFailure(): { readonly cause: unknown } | undefined {
    return primary;
  }
  function isDevelopmentClosed(): boolean {
    return isOperationClosed;
  }
  function retainFailure(cause: unknown): void {
    if (primary === undefined) primary = { cause };
    else if (primary.cause !== cause && !failures.includes(cause)) failures.push(cause);
  }
  function hasOutputCancellation(): boolean {
    return hasCancelledOutput;
  }
  function readOutputInterruption(): Interrupt | undefined {
    const received = control.received();
    if (received === null) return undefined;
    return received.kind === 'native' && received.signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM';
  }
  function notifyOutputInterruption(): void {
    const signal = readOutputInterruption();
    if (signal === undefined) return;
    for (const observer of outputObservers) {
      try {
        observer(signal);
      } catch (cause: unknown) {
        observeFailure(cause);
      }
    }
  }
  function subscribeOutputs(observer: (signal: Interrupt) => void): () => void {
    outputObservers.add(observer);
    const received = readOutputInterruption();
    if (received !== undefined) observer(received);
    return () => {
      outputObservers.delete(observer);
    };
  }
  async function deliverOutput(channel: 'stdout' | 'stderr', bytes: Uint8Array): Promise<Write> {
    if (nativeOutputs !== undefined) {
      // Proof: `actual root executable drains captured three-MiB binary output to a deliberately
      // slow pipe reader` reached native0/finished producer, then terminal3145758 failed with
      //1977296 bytes through the old unawaited Node bridge.
      // This boundary awaits native write and flush; callback-only APIs remain separate.
      const delivery = await nativeOutputs[channel](bytes);
      if (delivery.kind === 'cancelled') hasCancelledOutput = true;
      return delivery;
    }
    await (channel === 'stdout' ? writeStdout : writeStderr)(bytes);
    return { kind: 'written' };
  }
  function requestTermination(signal: NodeJS.Signals): void {
    const launched = child;
    if (launched === undefined) return;
    // Proof: the owned group-SIGINT Error in `development owner retains bounded delivery
    // failure without losing custody` preserved exact cause/attempt/rejection, then failed
    // elapsed<8000 at13004.469ms before timers were armed ahead of delivery. This owns that
    // delivery-failure premise, not every cleanup deadline or signal interleaving.
    escalation ??= setTimeout(() => {
      try {
        signalDevelopment(launched.pid, 'SIGKILL');
        requestedSignals.add('SIGKILL');
      } catch (cause: unknown) {
        observeFailure(cause);
      }
    }, 5000);
    settlement ??= setTimeout(() => {
      expired.reject(
        new Error(
          'development native/EOF cleanup is unconfirmed for session ' + String(launched.pid),
        ),
      );
    }, 10000);
    signalDevelopment(launched.pid, signal);
    requestedSignals.add(signal);
  }
  function observeFailure(cause: unknown): void {
    retainFailure(cause);
    if (nativeOutputs !== undefined) {
      try {
        nativeOutputs.failWrites(cause);
      } catch (writeCause: unknown) {
        retainFailure(writeCause);
      }
    }
    try {
      if (!isOperationClosed) requestTermination('SIGTERM');
    } catch (signalCause: unknown) {
      retainFailure(signalCause);
    }
  }
  function readInterruptionStatus(): 129 | 130 | 143 | undefined {
    const received = control.received();
    if (received === null) return undefined;
    return received.kind === 'external'
      ? 130
      : received.signal === 'SIGHUP'
        ? 129
        : received.signal === 'SIGINT'
          ? 130
          : 143;
  }
  let status = 1;
  control.signal.addEventListener('abort', notifyOutputInterruption);
  try {
    if (executableIO !== undefined)
      nativeOutputs = createOutputs({
        name: 'development executable',
        stdout: executableIO.openStdout,
        stderr: executableIO.openStderr,
        subscribeInterrupts: subscribeOutputs,
      });
    const before = readInterruptionStatus();
    if (before !== undefined) status = before;
    else {
      let admissionDelivery: Promise<undefined> = Promise.resolve(undefined);
      function enqueueAdmission(channel: 'stdout' | 'stderr', chunk: string | Uint8Array): void {
        const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk);
        admissionDelivery = admissionDelivery.then(async () => {
          if (!isDevelopmentClosed() && readPrimaryFailure() === undefined)
            await deliverOutput(channel, bytes);
          return undefined;
        });
        void admissionDelivery.catch(observeFailure);
      }
      let admitted: number | undefined;
      try {
        admitted = await preflight({
          stdout: (bytes) => {
            enqueueAdmission('stdout', bytes);
          },
          stderr: (bytes) => {
            enqueueAdmission('stderr', bytes);
          },
        });
      } catch (cause: unknown) {
        observeFailure(cause);
      }
      try {
        await admissionDelivery;
      } catch (cause: unknown) {
        observeFailure(cause);
      }
      const admissionFailure = readPrimaryFailure();
      if (admissionFailure !== undefined) throw admissionFailure.cause;
      if (
        typeof admitted !== 'number' ||
        !Number.isInteger(admitted) ||
        admitted < 0 ||
        admitted > 255
      )
        throw new Error('development required preflight returned an invalid status');
      const after = readInterruptionStatus();
      if (after !== undefined) status = after;
      else if (admitted !== 0) {
        // Proof: P1 omitted this refusal: the real occupied-IPv4 owner passed its busy diagnostic
        // then returned0 versus1 (fault13expects); before/after passed16each. Whole busy verdict
        // only: later nonlaunch/listener-survival tails and other statuses were unreached.
        status = admitted;
      } else {
        const repository = realpathSync.native(resolve(callerDirectory, selected.repository));
        if (!statSync(repository).isDirectory())
          throw new Error('development repository is not a directory');
        const entrypoint = readNxEntrypoint(repository);
        if (!isAbsolute(runtime)) throw new Error('development Bun runtime must be absolute');
        const executable = realpathSync.native(runtime);
        if (!statSync(executable).isFile())
          throw new Error('development Bun runtime is not a regular file');
        const log = environment['WBS_DEV_LOG'];
        if (log !== undefined && log !== '') {
          const destination = isAbsolute(log) ? log : callerDirectory + sep + log;
          mkdirSync(dirname(destination), { recursive: true });
          const descriptor = openSync(
            destination,
            constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NONBLOCK,
            0o666,
          );
          capture = { descriptor, filter: new CaptureFilter(descriptor) };
          if (!fstatSync(descriptor).isFile())
            throw new Error('development capture destination is not a regular file');
          channel = createDevelopmentChannel(observeFailure);
        }
        const variables: Record<string, string> = Object.fromEntries(
          Object.entries(environment).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
          ),
        );
        const native = Promise.withResolvers<{
          readonly code: number | null;
          readonly signal: unknown;
          readonly failure: unknown;
        }>();
        if (primary !== undefined) throw primary.cause;
        const cancelled = readInterruptionStatus();
        if (cancelled !== undefined) status = cancelled;
        else {
          const launched = Bun.spawn(
            [
              executable,
              '--no-env-file',
              '--config=/dev/null',
              entrypoint,
              'run-many',
              '-t',
              selected.localSolver ? 'serve-local-solver' : 'serve',
              '--projects=wbs-be-01,wbs-gw-01,wbs-fe-01,wbs-mcp-01',
            ],
            {
              cwd: repository,
              env: variables,
              stdin: executableIO === undefined ? 'inherit' : executableIO.stdin,
              stdout:
                channel === undefined
                  ? executableIO === undefined
                    ? 'pipe'
                    : executableIO.stdout
                  : channel.writer,
              stderr:
                channel === undefined
                  ? executableIO === undefined
                    ? 'pipe'
                    : executableIO.stderr
                  : channel.writer,
              detached: true,
              onExit(_child, code, signal, failure) {
                native.resolve({ code, signal, failure });
              },
            },
          );
          child = launched;
          const terminal = Promise.all([native.promise, launched.exited]);
          nativeSettlement = terminal;
          void terminal.catch(observeFailure);
          control.setRecipient((signal) => {
            if (isOperationClosed) return;
            notifyOutputInterruption();
            interruptions += 1;
            requestTermination(signal);
            if (interruptions > 1) {
              signalDevelopment(launched.pid, 'SIGKILL');
              requestedSignals.add('SIGKILL');
            }
          });
          async function consume(
            stream: ReadableStream<Uint8Array>,
            write: (bytes: Uint8Array) => Promise<Write>,
          ): Promise<void> {
            try {
              for await (const bytes of stream) {
                if (primary === undefined) {
                  try {
                    await write(bytes);
                  } catch (cause: unknown) {
                    observeFailure(cause);
                  }
                }
              }
            } catch (cause: unknown) {
              observeFailure(cause);
            }
          }
          const streams: Promise<void>[] = [];
          if (channel === undefined && executableIO !== undefined) {
            // Proof: actual-root PTY owner reached exact line/one signal and its preceding
            // Root130/native-null checks, then the whole record had tty[true,false,false]
            // versus alltrue. This is that default source-root case, not every descriptor mode.
            // Explicit inherited IO has no root-owned readable EOF to invent.
          } else if (channel === undefined) {
            if (
              !(launched.stdout instanceof ReadableStream) ||
              !(launched.stderr instanceof ReadableStream)
            )
              throw new Error('development child streams are absent');
            streams.push(
              consume(launched.stdout, (bytes) => deliverOutput('stdout', bytes)),
              consume(launched.stderr, (bytes) => deliverOutput('stderr', bytes)),
            );
          } else {
            const merged = channel.stream;
            const output = capture;
            if (output === undefined)
              throw new Error('development merged channel lost its capture owner');
            streams.push(
              (async () => {
                try {
                  for await (const chunk of merged) {
                    const bytes: unknown = chunk;
                    if (!Buffer.isBuffer(bytes))
                      throw new Error('development capture reader produced nonbinary bytes');
                    if (readPrimaryFailure() === undefined) {
                      try {
                        const delivery = await deliverOutput('stdout', bytes);
                        // Proof: `development owner retains bounded late-sink failure without
                        // losing custody` reached pending callback/expiry/closed FD/exact owned
                        // reuse, then failed lateHex empty with LATE-CAPTURE+LF. This whole fence
                        // owns that callback-resolution premise, not each conjunct independently
                        // or a stalled native kernel sink.
                        if (
                          delivery.kind === 'written' &&
                          !isDevelopmentClosed() &&
                          readPrimaryFailure() === undefined
                        )
                          output.filter.write(bytes);
                      } catch (cause: unknown) {
                        observeFailure(cause);
                      }
                    }
                  }
                } catch (cause: unknown) {
                  observeFailure(cause);
                }
              })(),
            );
          }
          const joined = Promise.all([terminal, Promise.all(streams)]);
          operationSettlement = joined;
          if (channel !== undefined) {
            isWriterClosed = true;
            channel.closeWriter();
          }
          // The rejected join stays observed if the bounded cleanup refusal wins.
          void joined.catch(() => undefined);
          const observations = await Promise.race([joined, expired.promise]);
          const [nativeExit, exited] = observations[0];
          if (nativeExit.failure !== undefined && nativeExit.failure !== null)
            throw new Error('development native callback failed', { cause: nativeExit.failure });
          status = readNativeStatus(nativeExit.code, nativeExit.signal, exited);
          if (
            !hasOutputCancellation() &&
            readPrimaryFailure() === undefined &&
            capture !== undefined
          )
            capture.filter.finish();
          const interrupted = readInterruptionStatus();
          if (
            interrupted !== undefined &&
            (status === 0 ||
              (isSignal(nativeExit.signal) && requestedSignals.has(nativeExit.signal)))
          )
            status = interrupted;
        }
      }
    }
  } catch (cause: unknown) {
    observeFailure(cause);
  }
  if (primary !== undefined && child !== undefined) {
    try {
      await Promise.race([
        operationSettlement ?? nativeSettlement ?? child.exited,
        expired.promise,
      ]);
    } catch (cause: unknown) {
      if (primary.cause !== cause && !failures.includes(cause)) failures.push(cause);
    }
  }
  isOperationClosed = true;
  if (escalation !== undefined) clearTimeout(escalation);
  if (settlement !== undefined) clearTimeout(settlement);
  if (channel !== undefined) {
    if (!isWriterClosed) {
      try {
        channel.closeWriter();
      } catch (cause: unknown) {
        observeFailure(cause);
      }
    }
    try {
      await channel.closeReader();
    } catch (cause: unknown) {
      observeFailure(cause);
    }
  }
  if (capture !== undefined) {
    try {
      closeSync(capture.descriptor);
    } catch (cause: unknown) {
      observeFailure(cause);
    }
  }
  const finalInterruption = readInterruptionStatus();
  if (status === 0 && finalInterruption !== undefined) status = finalInterruption;
  try {
    control.throwIfFailed();
  } catch (cause: unknown) {
    observeFailure(cause);
  }
  let hasDiagnosticAttempt = false;
  function hasAttemptedDiagnostic(): boolean {
    return hasDiagnosticAttempt;
  }
  let diagnosticOutcome: Diagnostic | undefined;
  async function reportNativeFailure(output: Outputs): Promise<void> {
    const failure = readPrimaryFailure();
    if (failure === undefined || hasDiagnosticAttempt) return;
    hasDiagnosticAttempt = true;
    const cause =
      failures.length === 0
        ? failure.cause
        : new AggregateError(
            [failure.cause, ...failures],
            'development operation and cleanup failed',
            { cause: failure.cause },
          );
    try {
      const reporting = reportFailure(cause, {
        redact: createFailureRedaction([]),
        context: { purpose: 'development' },
      });
      diagnosticOutcome = await output.reportDiagnostic(
        Buffer.from(
          JSON.stringify(reporting.reported ? reporting.reports.diagnostic : reporting) + '\n',
        ),
      );
    } catch (reportCause: unknown) {
      diagnosticOutcome = { kind: 'abandoned', cause: reportCause };
    }
    if (diagnosticOutcome.kind === 'abandoned') retainFailure(diagnosticOutcome.cause);
  }
  if (nativeOutputs !== undefined) await reportNativeFailure(nativeOutputs);
  // Retire the actual control while its existing output owner can still report retirement failure.
  try {
    control.close();
  } catch (cause: unknown) {
    retainFailure(cause);
  }
  if (nativeOutputs !== undefined) await reportNativeFailure(nativeOutputs);
  const hadFailureBeforeOutputRelease = readPrimaryFailure() !== undefined;
  if (nativeOutputs !== undefined) {
    try {
      nativeOutputs.dispose();
    } catch (cause: unknown) {
      retainFailure(cause);
    }
  }
  // A fresh bounded reporter is permitted only with no original owner, or after otherwise
  // successful written/flush settlement. Never overtake an abandoned/cancelled native tail.
  if (
    !hasAttemptedDiagnostic() &&
    readPrimaryFailure() !== undefined &&
    executableIO !== undefined &&
    (nativeOutputs === undefined || (!hadFailureBeforeOutputRelease && !hasOutputCancellation()))
  ) {
    let reporter: Outputs | undefined;
    try {
      reporter = createOutputs({
        name: 'development cleanup diagnostic',
        stdout: executableIO.openStdout,
        stderr: executableIO.openStderr,
        subscribeInterrupts: subscribeOutputs,
      });
      await reportNativeFailure(reporter);
    } catch (cause: unknown) {
      retainFailure(cause);
    }
    if (reporter !== undefined) {
      try {
        reporter.dispose();
      } catch (cause: unknown) {
        retainFailure(cause);
      }
    }
  }
  control.signal.removeEventListener('abort', notifyOutputInterruption);
  outputObservers.clear();
  clearInterval(retention);
  if (primary !== undefined) {
    const cause =
      failures.length === 0
        ? primary.cause
        : new AggregateError(
            [primary.cause, ...failures],
            'development operation and cleanup failed',
            { cause: primary.cause },
          );
    if (executableIO !== undefined && diagnosticOutcome !== undefined)
      executableIO.recordDiagnosticAttempt(cause, diagnosticOutcome);
    throw cause;
  }
  return status;
}
