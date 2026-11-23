import { closeSync, constants, fstatSync, readSync, writeSync } from 'node:fs';

import type { Monotonic } from '../clock';

export type GateRead =
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array }
  | { readonly kind: 'eof' }
  | { readonly kind: 'aborted' };
export interface GateReader {
  /**
   * Exclusively read one native chunk. No other read/poll/close may overlap; join the
   * operation before closing. Aborted means cancellation without a pending kernel read,
   * never EOF or evidence that native work/writers ended. Native IO failures throw.
   */
  read(signal: AbortSignal): Promise<GateRead>;
  /** One exclusive immediate NONBLOCK observation after async reads join; empty is not EOF. */
  poll(): Exclude<GateRead, { readonly kind: 'aborted' }> | { readonly kind: 'empty' };
  /** One close attempt, only while idle. A thrown close retains uncertainty and is never retried. */
  close(): void;
}
export interface GateWriter {
  /**
   * Exclusively write all bytes, returning the number of native retry/pressure observations.
   * The deadline is an absolute value in the captured Monotonic port's units. Abort/expiry
   * throws without certifying flush, peer/native end or absence of writers. Join before close.
   */
  write(bytes: Uint8Array, signal: AbortSignal, deadline: number): Promise<number>;
  /** One idle close attempt; ambiguous failure throws and must never authorize another close. */
  close(): void;
}
export interface GatedDescriptors {
  readonly control: GateReader;
  readonly status: GateWriter;
  readonly environment: GateReader;
}
function isRetryable(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    'code' in cause &&
    (cause.code === 'EAGAIN' || cause.code === 'EWOULDBLOCK' || cause.code === 'EINTR')
  );
}
interface Descriptor {
  readonly fd: number;
  begin(): void;
  finish(): void;
  close(): void;
}
function ownDescriptor(fd: number): Descriptor {
  let state: 'open' | 'active' | 'closed' | 'failed' = 'open';
  return {
    fd,
    begin() {
      // Proof: removing exclusive admission failed `gated native API overlap` while a real
      // NONBLOCK read was active; its independently aborted read still joined.
      if (state !== 'open') throw new Error('gated descriptor has overlapping or ended ownership');
      state = 'active';
    },
    finish() {
      state = 'open';
    },
    close() {
      // Proof: allowing active close failed `gated native API active-close`; no successful
      // unexpected close was retried by the owner.
      if (state !== 'open')
        throw new Error('gated descriptor cannot close during unresolved ownership');
      // Proof: making the failed-close state reusable produced two native calls in
      // `gated native API ambiguous-close`. The injected error followed a real close;
      // this is compatibility-boundary uncertainty, not a kernel EIO reproduction.
      state = 'failed';
      closeSync(fd);
      state = 'closed';
    },
  };
}
function readDescriptor(descriptor: Descriptor): GateReader {
  return {
    poll() {
      descriptor.begin();
      try {
        const bytes = Buffer.allocUnsafe(65536);
        for (;;) {
          try {
            const count = readSync(descriptor.fd, bytes, 0, bytes.byteLength, null);
            return count === 0
              ? { kind: 'eof' }
              : { kind: 'bytes', bytes: bytes.subarray(0, count) };
          } catch (cause) {
            if (cause instanceof Error && 'code' in cause && cause.code === 'EINTR') continue;
            if (!isRetryable(cause)) throw cause;
            return { kind: 'empty' };
          }
        }
      } finally {
        descriptor.finish();
      }
    },
    // Proof: `gated native API read-abort` distinguishes explicit cancellation from EOF;
    // removing retry handling turns its actual empty-socket EAGAIN into failure. Replacing
    // the nonretryable throw with EOF fails `read-error` under one external EIO projection.
    // These observations do not independently qualify every retry errno or kernel EIO.
    async read(signal) {
      descriptor.begin();
      try {
        const bytes = Buffer.allocUnsafe(65536);
        while (!signal.aborted) {
          try {
            const count = readSync(descriptor.fd, bytes, 0, bytes.byteLength, null);
            return count === 0
              ? { kind: 'eof' }
              : { kind: 'bytes', bytes: bytes.subarray(0, count) };
          } catch (cause) {
            if (!isRetryable(cause)) throw cause;
            await Bun.sleep(5);
          }
        }
        return { kind: 'aborted' };
      } finally {
        descriptor.finish();
      }
    },
    close() {
      descriptor.close();
    },
  };
}
function writeDescriptor(descriptor: Descriptor, now: () => number): GateWriter {
  return {
    async write(bytes, signal, deadline) {
      descriptor.begin();
      let offset = 0,
        pressure = 0;
      try {
        while (offset < bytes.byteLength) {
          // Proof: removing this refusal writes to the real socket in `gated native API
          // write-abort`, which requires the already-aborted operation to refuse.
          if (signal.aborted) throw new Error('gated status write cancelled');
          // Proof: removing expiry writes in `gated native API write-deadline`; its injected
          // Monotonic port equals the absolute deadline. No wall-clock timing claim follows.
          if (now() >= deadline) throw new Error('gated status write exceeded its deadline');
          try {
            const count = writeSync(descriptor.fd, bytes, offset, bytes.byteLength - offset);
            // Proof: `gated native API write-zero` fails when one emulated zero return is
            // accepted; later calls remain native, so no blocking-spin/deadline supplies RED.
            if (count === 0) throw new Error('gated status write made no progress');
            // Proof: the wrong offset delivered219264 bytes instead of2097152 in
            // `gated native API write-pressure`; restored bytes/hash and real pressure agree.
            offset += count;
          } catch (cause) {
            // Proof: removing retry broke the actual2MiB pressured transfer in
            // `gated native API write-pressure`; swallowing one externally projected EIO
            // failed `write-error`. Only the latter is an emulated error, not kernel EIO.
            if (!isRetryable(cause)) throw cause;
            pressure++;
            await Bun.sleep(5);
          }
        }
        return pressure;
      } finally {
        descriptor.finish();
      }
    },
    close() {
      descriptor.close();
    },
  };
}

/**
 * Adopt the three inherited Linux socket endpoints with exclusive close ownership. Nonblocking
 * reads/writes leave no kernel read pending across cancellation; callers join operations before
 * closing. CLOEXEC keeps these original endpoints private while payload IO0/1/2 stays native.
 * @see ../../docs/gated-payload-proof.md
 * @throws Missing/non-socket descriptors, unsupported native loading, flag/IO/close failures.
 */
export async function openGatedDescriptors(monotonic: Monotonic): Promise<GatedDescriptors> {
  const now = monotonic.now.bind(monotonic);
  // Proof: bypassing this check admitted `gated native API unsupported` under an external
  // platform projection on Linux/Bun; it does not qualify another operating system.
  if (process.platform !== 'linux') throw new Error('gated descriptors require qualified Linux');
  const { dlopen, FFIType } = await import('bun:ffi');
  const library = dlopen('libc.so.6', {
    fcntl: { args: [FFIType.i32, FFIType.i32, FFIType.i32], returns: FFIType.i32 },
  });
  for (const fd of [3, 4, 5]) {
    // Proof: removing socket admission accepts an actual regular inherited FD3 in
    // `gated native API nonsocket`.
    if (!fstatSync(fd).isSocket())
      throw new Error('gated descriptor must be an inherited native socket');
    // Proof: separately substituting -1 for F_GETFL, F_GETFD, F_SETFL and F_SETFD fails
    // `gated native API admit` from opened to refused. These are dependency-return
    // projections, not kernel-failure or sole-CLOEXEC endpoint-privacy proofs.
    const flags = library.symbols.fcntl(fd, 3, 0),
      descriptorFlags = library.symbols.fcntl(fd, 1, 0);
    if (flags < 0 || descriptorFlags < 0) throw new Error('cannot inspect gated descriptor flags');
    if (
      library.symbols.fcntl(fd, 4, flags | constants.O_NONBLOCK) !== 0 ||
      library.symbols.fcntl(fd, 2, descriptorFlags | 1) !== 0
    )
      throw new Error('cannot protect gated descriptor flags');
  }
  return {
    control: readDescriptor(ownDescriptor(3)),
    status: writeDescriptor(ownDescriptor(4), now),
    environment: readDescriptor(ownDescriptor(5)),
  };
}
