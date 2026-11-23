import { createOutputs } from '@shared/bun-output';

import type { GatedPayloadCommand } from '../cli-parser';
import type { Monotonic } from '../clock';
import { type GateReader, openGatedDescriptors } from './gated-payload-native';
import {
  decodeGatedEnvironment,
  GATED_ENVIRONMENT_BYTES,
  GatedProtocolFailure,
} from './gated-payload-protocol';
import { readTermination } from './native-exit';

interface PayloadContext {
  readonly callerDirectory: string;
  readonly monotonic: Monotonic;
}
type Phase = 'starting' | 'running' | 'acknowledgement';

/** Read exactly one length-delimited private frame and honest EOF, with bounded allocation. */
async function readEnvironment(
  reader: GateReader,
  signal: AbortSignal,
): Promise<Record<string, string>> {
  const header = new Uint8Array(4);
  let headerLength = 0,
    body: Uint8Array | undefined,
    bodyLength = 0;
  for (;;) {
    const next = await reader.read(signal);
    if (next.kind === 'aborted') throw new GatedProtocolFailure('gated payload: startup cancelled');
    if (next.kind === 'eof') {
      if (bodyLength !== body?.byteLength)
        throw new GatedProtocolFailure('gated payload: incomplete environment frame');
      return decodeGatedEnvironment(body);
    }
    let offset = 0;
    if (headerLength < 4) {
      const count = Math.min(4 - headerLength, next.bytes.byteLength);
      header.set(next.bytes.subarray(0, count), headerLength);
      headerLength += count;
      offset += count;
      if (headerLength === 4) {
        const length = new DataView(header.buffer).getUint32(0, false);
        // Proof: removing the bound allocates an oversized body in `gated proof oracle
        // env-over-limit`. Incomplete-frame refusal still prevents admission: allocation
        // policy only, not independent payload-execution authority.
        if (length > GATED_ENVIRONMENT_BYTES)
          throw new GatedProtocolFailure(
            'gated payload: private environment exceeds its byte limit',
          );
        body = new Uint8Array(length);
      }
    }
    if (body !== undefined) {
      const count = next.bytes.byteLength - offset;
      if (count > body.byteLength - bodyLength)
        throw new GatedProtocolFailure('gated payload: trailing environment bytes');
      body.set(next.bytes.subarray(offset), bodyLength);
      bodyLength += count;
    }
  }
}

/**
 * Execute only the FD5 snapshot after both startup inputs qualify. The wrapper owns its
 * native direct child and stays alive through status delivery and controller acknowledgement;
 * direct-child termination does not certify descendant or systemd-container settlement.
 * Unknown native termination deliberately retains a referenced owner and signal listeners.
 * @see ../../docs/gated-payload-proof.md
 * @returns The qualified payload status, or125 after a known protocol/startup refusal and
 * settled owned IO. Missing native authority or an ambiguous required close stays pending
 * with one bounded redacted diagnostic; this is never a synthetic payload end.
 * @throws Required diagnostic/output settlement failures after native/descriptor ownership
 * permits retirement; simultaneous causes are retained. Private environment bytes are redacted.
 */
export async function runGatedPayload(
  command: GatedPayloadCommand,
  context: PayloadContext,
): Promise<number> {
  const argv = [...command.argv],
    cwd = context.callerDirectory,
    now = context.monotonic.now.bind(context.monotonic);
  // Proof: unreferencing this owner failed `native authority observation missing-callback`
  // with a real child and an externally withheld callback. Numeric status is not native end.
  const retained = setInterval(() => undefined, 1000);
  const outputs = createOutputs({
    name: 'gated payload',
    stdout: () => Bun.stdout.writer(),
    stderr: () => Bun.stderr.writer(),
    subscribeInterrupts: () => () => undefined,
  });
  let diagnostic: Promise<void> | undefined;
  let callbackAbsenceTimer: ReturnType<typeof setTimeout> | undefined;
  const diagnosticFailures: unknown[] = [];
  const uncertainCloses: unknown[] = [];
  function diagnose(): Promise<void> {
    diagnostic ??= (async () => {
      try {
        const delivery = await outputs.reportDiagnostic(
          new TextEncoder().encode('error: gated payload ownership or private protocol failed\n'),
        );
        // Proof: discarding abandonment returned status125 instead of failure in
        // `gated proof oracle diagnostic-stall`, using a deliberately pending FileSink
        // capability. This is not real kernel backpressure.
        if (delivery.kind === 'abandoned') diagnosticFailures.push(delivery.cause);
      } catch (cause) {
        diagnosticFailures.push(cause);
      }
    })();
    return diagnostic;
  }
  const startup = new AbortController(),
    start = Promise.withResolvers<undefined>(),
    eof = Promise.withResolvers<undefined>();
  let phase: Phase = 'starting',
    hasStart = false,
    hasDone = false,
    hasKill = false,
    hasEof = false,
    fault = false,
    pending = '';
  let epoch = new AbortController(),
    pump: Promise<void> = Promise.resolve();
  let requestKill: (() => void) | undefined;
  // Observe an early signal rejection while descriptors load; execute still awaits the original promise.
  void start.promise.catch(() => undefined);
  function hasFault(): boolean {
    return fault;
  }
  function isControlEnded(): boolean {
    return hasEof;
  }
  function refuse(): void {
    fault = true;
    if (phase === 'starting') {
      startup.abort();
      start.reject(new GatedProtocolFailure('gated payload: invalid startup control'));
    }
  }
  const interrupt = () => {
    if (phase === 'starting') refuse();
  };
  // Proof: separate handler removals produced actual HUP/INT/TERM native signal death
  // in the matching `gated proof oracle count-group-*` cases; the new HUPv2 does not
  // qualify excluded old23. Adding child.kill forwarding failed its explicit invocation
  // sentinel in count-group-TERM; signal coalescing is not assumed away.
  for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM'] as const) process.on(signal, interrupt);
  const timer = setTimeout(() => {
    if (phase === 'starting') refuse();
  }, 15000);
  let descriptors: Awaited<ReturnType<typeof openGatedDescriptors>> | undefined;
  let environmentCloseAttempted = false,
    statusCloseAttempted = false;
  function wasEnvironmentCloseAttempted(): boolean {
    return environmentCloseAttempted;
  }
  function wasStatusCloseAttempted(): boolean {
    return statusCloseAttempted;
  }
  // Proof: compound byte/trim relaxation admitted the leading-space input in
  // `gated proof oracle control-space`; this is not independent credit for each word arm.
  // Removing the one-start/one-done gates separately failed `control-duplicate-start` and
  // `duplicate-done`; phase relaxation failed `native gated payload early-done`.
  function consume(bytes: Uint8Array): void {
    for (const byte of bytes) {
      if (fault) continue;
      if (byte !== 10) {
        if (byte < 97 || byte > 122 || pending.length >= 5) {
          refuse();
          continue;
        }
        pending += String.fromCharCode(byte);
        continue;
      }
      const line = pending;
      pending = '';
      if (line === 'start' && !hasStart && phase === 'starting') {
        hasStart = true;
        start.resolve(undefined);
      } else if (line === 'done' && !hasDone && phase === 'acknowledgement') hasDone = true;
      // Proof: removing kill admission returned125 instead of137 in private retained-child
      // kill running. Removing the one-kill latch separately admitted duplicate-running137
      // and duplicate-late37 instead of125; allowing post-done kill admitted37 instead of125.
      // Accepting startup kill admitted a real child37 instead of125 in each early-* case.
      else if (
        line === 'kill' &&
        hasStart &&
        !hasKill &&
        !hasDone &&
        phase !== 'starting' &&
        requestKill !== undefined
      ) {
        hasKill = true;
        requestKill();
      } else refuse();
    }
  }
  function observeEof(): void {
    hasEof = true;
    if (pending !== '') refuse();
    if (phase === 'starting') refuse();
    eof.resolve(undefined);
  }
  async function readControl(reader: GateReader, signal: AbortSignal): Promise<void> {
    try {
      while (!hasEof) {
        const next = await reader.read(signal);
        if (next.kind === 'aborted') return;
        if (next.kind === 'eof') {
          observeEof();
          return;
        }
        consume(next.bytes);
      }
    } catch {
      refuse();
      await diagnose();
    }
  }
  async function pauseControl(): Promise<void> {
    epoch.abort();
    await pump;
  }
  function resumeControl(reader: GateReader): void {
    epoch = new AbortController();
    pump = readControl(reader, epoch.signal);
  }
  // Proof: omitting the final poll accepts a known queued pre-transition frame in the
  // `native gated payload queued-before-transition`. The exclusive observed phase is not
  // cross-FD atomicity or wall-clock peer-send-before-EOF ordering.
  function drainControl(reader: GateReader, allowsKillPrefix = false): void {
    while (!hasEof) {
      const next = reader.poll();
      if (next.kind === 'empty') break;
      if (next.kind === 'eof') {
        observeEof();
        break;
      }
      consume(next.bytes);
      if (fault) break;
    }
    // Proof: removing this narrow post-native prefix allowance returned125 instead of37
    // in private retained-child kill prefix-kill; prefix-other and prefix-truncated still125.
    if (
      pending !== '' &&
      !(
        allowsKillPrefix &&
        hasStart &&
        !hasKill &&
        !hasDone &&
        phase !== 'starting' &&
        requestKill !== undefined &&
        'kill'.startsWith(pending)
      )
    )
      refuse();
  }
  async function execute(): Promise<number> {
    try {
      descriptors = await openGatedDescriptors({ now });
      const owned = descriptors;
      resumeControl(owned.control);
      const environment = readEnvironment(owned.environment, startup.signal);
      let values: Record<string, string>;
      try {
        // Proof: bypassing either join separately admits a payload before start or FD5
        // EOF in `gated proof oracle joint-no-start` / `joint-no-env-eof`.
        [, values] = await Promise.all([start.promise, environment]);
      } catch (cause) {
        startup.abort();
        await environment.then(
          () => undefined,
          () => undefined,
        );
        throw cause;
      }
      await pauseControl();
      drainControl(owned.control);
      if (startup.signal.aborted || hasFault() || isControlEnded())
        throw new GatedProtocolFailure('gated payload: startup refused');
      environmentCloseAttempted = true;
      try {
        owned.environment.close();
      } catch (cause) {
        uncertainCloses.push(cause);
        throw cause;
      }
      clearTimeout(timer);
      phase = 'running';
      const native = Promise.withResolvers<number>();
      let nativeQualified = false;
      function hasNativeAuthority(): boolean {
        return nativeQualified;
      }
      let child: Bun.Subprocess | undefined;
      try {
        // Proof: restoring the decoded map into helper process.env fails the named helper
        // observer in `gated proof oracle environment-ownership`; only booleans/hashes
        // are recorded. No complete-key, /proc or log-leak privacy inference follows.
        child = Bun.spawn(argv, {
          cwd,
          env: values,
          // Proof: separate stdin/stdout ignore substitutions remove the0002ff30 binary
          // echo in `native gated payload healthy`, each with fresh source bundles. These do not
          // independently establish private-endpoint inheritance or installed artifacts.
          stdin: 'inherit',
          stdout: 'inherit',
          stderr: 'inherit',
          // Proof: detaching the payload leaves its TERM count empty in
          // `gated proof oracle count-group-TERM`; direct-group membership only.
          detached: false,
          onExit(_child, code, signal, cause) {
            const termination = readTermination(code, signal);
            // Proof: accepting callback errors or invalid native fields separately
            // failed their `native authority observation` cases. External callback
            // projections cannot turn absent native authority into a payload end.
            if (cause !== undefined || termination.kind !== 'confirmed') {
              void diagnose().then(
                () => undefined,
                (failure: unknown) => {
                  diagnosticFailures.push(failure);
                },
              );
              return;
            }
            nativeQualified = true;
            clearTimeout(callbackAbsenceTimer);
            native.resolve(termination.status);
          },
        });
      } catch (cause) {
        if (
          cause instanceof Error &&
          'code' in cause &&
          (cause.code === 'ENOENT' || cause.code === 'EACCES' || cause.code === 'ENOEXEC')
        )
          native.resolve(cause.code === 'ENOENT' ? 127 : 126);
        else {
          await diagnose();
          return await new Promise<number>(() => undefined);
        }
        // No native child exists for these qualified executable refusals.
      }
      const spawned = child;
      // Proof: removing the native-qualified no-op invoked the original kill after actual
      // native37 in private retained-child kill late; its zero-kill assertion failed.
      requestKill = () => {
        // The retained native child is the sole target. A first late request never signals again.
        if (spawned !== undefined && !hasNativeAuthority()) spawned.kill('SIGKILL');
      };
      resumeControl(owned.control);
      // Proof: skipping concurrent numeric-rejection or missing-callback diagnosis
      // separately fails the matching native authority observers; a later genuine
      // callback is the independent control, not a diagnostic or ordinary runtime deadline.
      const numeric =
        child === undefined
          ? Promise.resolve({ kind: 'absent' as const })
          : child.exited.then(
              (status) => {
                if (!hasNativeAuthority())
                  callbackAbsenceTimer = setTimeout(() => {
                    if (!hasNativeAuthority()) void diagnose();
                  }, 1000);
                return { kind: 'numeric' as const, status };
              },
              () => {
                void diagnose();
                return { kind: 'failed' as const };
              },
            );
      // Proof: racing controller EOF with native end completed the helper while its real
      // payload was held in `gated proof oracle death-during-child` after controller
      // SIGKILL. External adopted-family cleanup does not supply product settlement.
      const status = await native.promise;
      let numericTimer: ReturnType<typeof setTimeout> | undefined;
      const sampled = await Promise.race([
        numeric,
        new Promise<{ readonly kind: 'pending' }>((resolveTimeout) => {
          numericTimer = setTimeout(() => {
            resolveTimeout({ kind: 'pending' });
          }, 1000);
        }),
      ]);
      // Proof: leaving this timer referenced changed status-to-native-exit latency
      // from about40ms to1004ms in the timer-release source-bundle control. This is
      // observed timer latency, not a guaranteed timing or resource-authority bound.
      clearTimeout(numericTimer);
      // Proof: dropping numeric correspondence or its required projection separately
      // emitted37 instead of125 in the named native authority numeric controls.
      if (sampled.kind !== 'absent' && (sampled.kind !== 'numeric' || sampled.status !== status))
        refuse();
      await pauseControl();
      drainControl(owned.control, true);
      resumeControl(owned.control);
      if (!hasFault()) {
        try {
          await owned.status.write(
            new TextEncoder().encode(String(status) + '\n'),
            new AbortController().signal,
            now() + 1000,
          );
        } catch {
          refuse();
          await diagnose();
        }
      }
      await pauseControl();
      drainControl(owned.control, true);
      // The joined reader's final NONBLOCK observation defines this phase boundary. FD3 and
      // FD4 are separate syscalls; this does not certify when the peer sent a concurrent frame.
      statusCloseAttempted = true;
      owned.status.close();
      phase = 'acknowledgement';
      resumeControl(owned.control);
      // Proof: skipping this join ended the real keeper before acknowledgement in
      // `gated proof oracle joint-no-start`; status EOF alone grants no retirement.
      await eof.promise;
      await pauseControl();
      if (hasFault()) {
        await diagnose();
        return 125;
      }
      return status;
    } catch {
      await diagnose();
      // A failed transport observation after spawn is not controller permission to retire.
      if (phase !== 'starting') return await new Promise<number>(() => undefined);
      return 125;
    }
  }
  const outcome = await execute().then(
    (status) => ({ kind: 'ended' as const, status }),
    (cause: unknown) => ({ kind: 'failed' as const, cause }),
  );
  startup.abort();
  epoch.abort();
  const failures: unknown[] = [...uncertainCloses];
  try {
    await pump;
  } catch (cause) {
    failures.push(cause);
  }
  if (descriptors !== undefined) {
    for (const [closed, descriptor] of [
      [wasEnvironmentCloseAttempted(), descriptors.environment],
      [wasStatusCloseAttempted(), descriptors.status],
      [false, descriptors.control],
    ] as const) {
      if (!closed) {
        try {
          descriptor.close();
        } catch (cause) {
          failures.push(cause);
        }
      }
    }
  }
  // Proof: bypassing uncertainty retention made helper/operation nonpending in
  // `gated proof oracle ambiguous-close` after one real close plus an injected
  // compatibility error. Its healthy cleanup SIGKILL is not normal helper settlement.
  if (failures.length !== 0) {
    await diagnose();
    await new Promise<void>(() => undefined);
  }
  if (diagnostic !== undefined) await diagnostic;
  clearTimeout(callbackAbsenceTimer);
  clearTimeout(timer);
  clearInterval(retained);
  for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM'] as const) process.off(signal, interrupt);
  try {
    outputs.dispose();
  } catch (cause) {
    diagnosticFailures.push(cause);
  }
  if (outcome.kind === 'failed') {
    if (diagnosticFailures.length === 0) throw outcome.cause;
    throw new AggregateError(
      [outcome.cause, ...diagnosticFailures],
      'gated payload settlement or diagnostic failed',
    );
  }
  if (diagnosticFailures.length !== 0)
    throw new AggregateError(diagnosticFailures, 'gated diagnostic failed');
  return outcome.status;
}
