import { closeSync, constants, fstatSync, openSync } from 'node:fs';
import { endianness } from 'node:os';

import { dlopen, FFIType, toArrayBuffer } from 'bun:ffi';

interface Kernel {
  readonly contention: number;
  readonly flock: (descriptor: number, operation: number) => number;
  readonly readDescriptorFlags: (descriptor: number) => number;
  readonly readEpoch: () => bigint;
  readonly readErrno: () => number;
}

const signatures = {
  flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
  fcntl: { args: [FFIType.i32, FFIType.i32, FFIType.i32], returns: FFIType.i32 },
  clock_gettime: { args: [FFIType.i32, FFIType.ptr], returns: FFIType.i32 },
} as const;
let kernel: Kernel | undefined;
// Proof: c29-native-lazy-import; Injected eager load trips the isolated refused-library control during import; actual plain import performs no backend action.; injected fault failed `imports the native adapter without opening a library clock mutex or worker`; restoration passed.

/**
 * Load libc lazily for the supported 64-bit little-endian host ABI. The library stays pinned
 * for this process's lifetime because its function pointers remain in use. Bun's FFI is
 * experimental; the pinned runtime and each platform need native qualification before rollout.
 */
function readKernel(): Kernel {
  if (kernel !== undefined) return kernel;
  // Proof: c29-native-architecture; Controlled host metadata only; not actual32-bit platform qualification.; injected fault failed `refuses architecture before opening a mutex or entering work`; restoration passed.
  // Proof: c29-native-endianness; Controlled host metadata only; not actualbig-endian ABI qualification.; injected fault failed `refuses endianness before opening a mutex or entering work`; restoration passed.
  if ((process.arch !== 'x64' && process.arch !== 'arm64') || endianness() !== 'LE')
    throw new Error('heavy lock requires a supported 64-bit little-endian host ABI');
  const platform = process.platform;
  // Proof: c29-native-platform; Library-loading ordering only; actual Linux cannot load the selected Darwin library after guardremoval.; injected fault failed `refuses platform before opening a mutex or entering work`; restoration passed.
  if (platform !== 'linux' && platform !== 'darwin')
    throw new Error('heavy lock platform is unsupported: ' + platform);
  const library =
    platform === 'linux'
      ? dlopen('libc.so.6', {
          ...signatures,
          __errno_location: { args: [], returns: FFIType.ptr },
        })
      : dlopen('libSystem.B.dylib', {
          ...signatures,
          __error: { args: [], returns: FFIType.ptr },
        });
  function readErrno(): number {
    const pointer =
      '__errno_location' in library.symbols
        ? library.symbols.__errno_location()
        : library.symbols.__error();
    // Proof: c29-native-errno-pointer; Underlying Bun still refuses null with ptr must be a number; proof is explicit boundary diagnostic only.; injected fault failed `refuses controlled native errno-pointer without entering work`; restoration passed.
    if (pointer === null) throw new Error('heavy lock native errno pointer is absent');
    return new DataView(toArrayBuffer(pointer, 0, 4)).getInt32(0, true);
  }
  kernel = {
    contention: platform === 'linux' ? 11 : 35,
    flock: (descriptor, operation) => library.symbols.flock(descriptor, operation),
    readDescriptorFlags: (descriptor) => library.symbols.fcntl(descriptor, 1, 0),
    readErrno,
    readEpoch() {
      // Supported hosts use two signed 64-bit fields for timespec: seconds, nanoseconds.
      const timespec = Buffer.alloc(16);
      // Proof: c29-native-clock-status; Injected clock fills otherwisevalid native timespec then returns failure, isolating status admission.; injected fault failed `refuses controlled realtime clock-error before returning a ticket stamp`; restoration passed.
      if (library.symbols.clock_gettime(0, timespec) !== 0)
        throw new Error('heavy lock realtime clock failed: errno ' + String(readErrno()));
      const seconds = timespec.readBigInt64LE(0),
        nanoseconds = timespec.readBigInt64LE(8);
      // Proof: c29-native-nanoseconds-lower; injected fault failed `refuses controlled realtime nanoseconds-negative before returning a ticket stamp`; restoration passed.
      // Proof: c29-native-nanoseconds-upper; injected fault failed `refuses controlled realtime nanoseconds-large before returning a ticket stamp`; restoration passed.
      if (nanoseconds < 0n || nanoseconds >= 1_000_000_000n)
        throw new Error('heavy lock realtime nanoseconds are malformed');
      return seconds * 1_000_000_000n + nanoseconds;
    },
  };
  return kernel;
}

/**
 * Read a real epoch nanosecond stamp for the existing 19-digit heavy-lock ticket protocol.
 * This is a wall clock, not a monotonic wait budget. No date/Python process or synthetic
 * sub-millisecond digits select queue order. This operation creates no lock or ticket.
 * @throws for unsupported ABI/platform, absent native symbols or unusable clock output.
 */
export function readEpochNanoseconds(): bigint {
  const stamp = readKernel().readEpoch();
  // Proof: c29-native-stamp-width; injected fault failed `refuses controlled realtime stamp-width before returning a ticket stamp`; restoration passed.
  if (!/^[0-9]{19}$/u.test(stamp.toString()))
    throw new Error('heavy lock realtime stamp cannot name a 19-digit epoch ticket');
  return stamp;
}

/**
 * Hold an actual nonblocking exclusive flock until the awaited operation settles, then close
 * its descriptor before returning to caller cleanup. Contention is explicit and never enters
 * work. The mutex is appended/created without truncation, replacement or unlink; callers must
 * keep its trusted pathname namespace stable. This primitive owns no queue, record, signals
 * or descendant cleanup. A higher-level owner must settle protected work before it returns.
 * Bun-created descriptors must already be close-on-exec; unexpected native/descriptor state
 * throws. The native library stays process-owned. Callback and close failures are preserved.
 */
export async function holdLock<T>(
  path: string,
  work: () => Promise<T>,
): Promise<{ readonly kind: 'busy' } | { readonly kind: 'owned'; readonly value: T }> {
  // Proof: c29-native-backend-before-open; One reorder fault moves native admission after descriptor acquisition; no mutexmayexist on unsupported backend.; injected fault failed `refuses platform before opening a mutex or entering work` and 3 additional named controls; restoration passed.
  const native = readKernel();
  // NONBLOCK prevents a malformed FIFO operand from hanging before its regular-file check.
  const descriptor = openSync(
    path,
    // Proof: c29-native-open-nonblocking; Actual isolated writer-side FIFO opener blocks without NONBLOCK; parent observes controlled SIGKILL status instead ofnormalrefusal, not a Bun testtimeout.; injected fault failed `refuses a readerless FIFO before native open can block`; restoration passed.
    // Proof: c29-native-preserve-inode-bytes; Unsafe truncating-open fault proves the existing mutex bytes remain intact.; injected fault failed `never removes or replaces an existing canonical mutex inode or its bytes`; restoration passed.
    constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NONBLOCK,
    0o600,
  );
  // Proof: c29-native-backend-before-open; One reorder fault moves native admission after descriptor acquisition; no mutexmayexist on unsupported backend.; injected fault failed `refuses platform before opening a mutex or entering work` and 3 additional named controls; restoration passed.
  async function runWork() {
    // Proof: c29-native-regular-file; A ready native FIFO reader reaches the regular-file guard; readerless open refusal is separate.; injected fault failed `refuses a ready FIFO at the regular-file boundary without entering work`; restoration passed.
    if (!fstatSync(descriptor).isFile()) throw new Error('heavy lock mutex must be a regular file');
    const flags = native.readDescriptorFlags(descriptor);
    // Proof: c29-native-flags-status; injected fault failed `refuses controlled native flags-error without entering work`; restoration passed.
    if (flags < 0)
      throw new Error('heavy lock descriptor flags failed: errno ' + String(native.readErrno()));
    // Proof: c29-native-cloexec; Actual bit is cleared on the opened descriptor before admission; generic child FD absence alone doesnot prove this guard.; injected fault failed `refuses an actual descriptor whose close-on-exec bit was cleared before admission`; restoration passed.
    if ((flags & 1) !== 1) throw new Error('heavy lock mutex descriptor must close on exec');
    const acquired = native.flock(descriptor, 2 | 4);
    // Proof: c29-native-flock-error-status; Native error classification only: removed branch later refuses invalid status, without specific errno context.; injected fault failed `refuses controlled native flock-error without entering work`; restoration passed.
    if (acquired === -1) {
      const errno = native.readErrno();
      // Proof: c29-native-contention; Unknown native errno must not degrade to the modeled busy outcome.; injected fault failed `refuses controlled native flock-error without entering work`; restoration passed.
      if (errno === native.contention) return { kind: 'busy' as const };
      throw new Error('heavy lock native flock failed: errno ' + String(errno));
    }
    // Proof: c29-native-flock-status; injected fault failed `refuses controlled native flock-status without entering work`; restoration passed.
    if (acquired !== 0) throw new Error('heavy lock native flock returned an invalid status');
    // Proof: c29-native-await-work; First actual RED is in-process independent descriptor acquisition returning owned/Promise instead ofbusy; the later external-peer assertion is not reached.; injected fault failed `holds the actual inode through awaited work and admits the next independent process only after close`; restoration passed.
    return { kind: 'owned' as const, value: await work() };
  }
  const settled = await runWork().then(
    (value) => ({ kind: 'fulfilled' as const, value }),
    (cause: unknown) => ({ kind: 'rejected' as const, cause }),
  );
  let release: { readonly cause: unknown } | undefined;
  try {
    // Proof: c29-native-close; Original callback failure may remain; actual independent peer must acquire before caller returns.; injected fault failed `preserves the operation failure and closes its kernel lock before returning it`; restoration passed.
    closeSync(descriptor);
  } catch (cause) {
    release = { cause };
  }
  if (settled.kind === 'rejected') {
    if (release !== undefined)
      throw new AggregateError(
        // Proof: c29-native-paired-causes; Injected close executes real close before throwing; failed-close alone does not prove actual release.; injected fault failed `preserves paired operation and close failure identity after the real descriptor closes`; restoration passed.
        [settled.cause, release.cause],
        'heavy lock operation and descriptor close failed',
      );
    // Proof: c29-native-original-failure; injected fault failed `preserves the operation failure and closes its kernel lock before returning it`; restoration passed.
    throw settled.cause;
  }
  // Proof: c29-native-close-failure; Injected close executes real close before throwing; exact release-failure identity must survive.; injected fault failed `preserves close-only failure identity after the real descriptor closes`; restoration passed.
  if (release !== undefined) throw release.cause;
  return settled.value;
}
