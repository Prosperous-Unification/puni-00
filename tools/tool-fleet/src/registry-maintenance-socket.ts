import { closeSync } from 'node:fs';

import { dlopen, ptr, read as memory } from 'bun:ffi';

const maximumPacket = 32768;
const align = (bytes: number) => Math.ceil(bytes / 8) * 8;

function nativeSocket() {
  if (process.platform !== 'linux' || process.arch !== 'x64')
    throw new Error('Maintenance descriptor transport requires pinned Linux amd64 ABI');
  return dlopen('libc.so.6', {
    socketpair: { args: ['i32', 'i32', 'i32', 'ptr'], returns: 'i32' },
    setsockopt: { args: ['i32', 'i32', 'i32', 'ptr', 'i32'], returns: 'i32' },
    getsockopt: { args: ['i32', 'i32', 'i32', 'ptr', 'ptr'], returns: 'i32' },
    sendmsg: { args: ['i32', 'ptr', 'i32'], returns: 'i64' },
    recvmsg: { args: ['i32', 'ptr', 'i32'], returns: 'i64' },
    __errno_location: { args: [], returns: 'ptr' },
  });
}
type Native = ReturnType<typeof nativeSocket>;

function errno(native: Native): number {
  const address = native.symbols.__errno_location();
  if (address === null) throw new Error('Missing native errno');
  return memory.i32(address);
}
function header(payload: Buffer, control: Buffer) {
  // Fixed Linux amd64 msghdr/iovec layout. Owned buffers remain live for each synchronous syscall.
  const vector = Buffer.alloc(16);
  vector.writeBigUInt64LE(BigInt(ptr(payload)), 0);
  vector.writeBigUInt64LE(BigInt(payload.length), 8);
  const message = Buffer.alloc(56);
  message.writeBigUInt64LE(BigInt(ptr(vector)), 16);
  message.writeBigUInt64LE(1n, 24);
  message.writeBigUInt64LE(BigInt(ptr(control)), 32);
  message.writeBigUInt64LE(BigInt(control.length), 40);
  return { vector, message };
}

export interface MaintenancePacket {
  bytes: Buffer;
  credentials: { pid: number; uid: number; gid: number };
  descriptors: number[];
}

/**
 * Private per-invocation Unix sequenced packets. SO_PASSCRED authenticates each CURRENT sender;
 * socketpair creation credentials cannot authenticate a post-sudo root process. Received rights
 * are close-on-exec and owned by the successful caller; every refused packet closes all rights.
 * This is native IPC only, with no command, pathname, listener or journal authority of its own.
 */
export class MaintenanceSocket {
  private closed = false;
  private readonly native = nativeSocket();

  constructor(readonly descriptor: number) {
    const value = new Int32Array(1);
    const length = new Int32Array([4]);
    try {
      for (const [option, expected] of [
        [3, 5],
        [39, 1],
      ]) {
        length[0] = 4;
        if (
          this.native.symbols.getsockopt(descriptor, 1, option, value, length) !== 0 ||
          value[0] !== expected ||
          length[0] !== 4
        )
          throw new Error('Maintenance input is not a direct Unix sequenced socket');
      }
      value[0] = 1;
      if (this.native.symbols.setsockopt(descriptor, 1, 16, value, 4) !== 0)
        throw new Error('Cannot require kernel maintenance credentials');
    } catch (cause) {
      this.native.close();
      throw cause;
    }
  }

  async send(
    bytes: Buffer,
    descriptors: readonly number[] = [],
    signal = AbortSignal.timeout(10000),
  ): Promise<void> {
    if (
      bytes.length === 0 ||
      bytes.length > maximumPacket ||
      descriptors.length > 253 ||
      descriptors.some((descriptor) => !Number.isSafeInteger(descriptor) || descriptor < 0)
    )
      throw new Error('Maintenance packet exceeds fixed bounds');
    const control = Buffer.alloc(descriptors.length === 0 ? 8 : align(16 + 4 * descriptors.length));
    if (descriptors.length > 0) {
      control.writeBigUInt64LE(BigInt(16 + 4 * descriptors.length), 0);
      control.writeInt32LE(1, 8);
      control.writeInt32LE(1, 12);
      descriptors.forEach((descriptor, index) => control.writeInt32LE(descriptor, 16 + index * 4));
    }
    const layout = header(bytes, control);
    if (descriptors.length === 0) layout.message.writeBigUInt64LE(0n, 40);
    for (;;) {
      signal.throwIfAborted();
      if (this.closed) throw new Error('Maintenance channel is closed');
      const sent = Number(
        this.native.symbols.sendmsg(this.descriptor, layout.message, 0x40 | 0x4000),
      );
      if (sent === bytes.length) return;
      const code = errno(this.native);
      if (sent !== -1 || (code !== 11 && code !== 4))
        throw new Error('Maintenance packet delivery failed');
      await Bun.sleep(5);
    }
  }

  async receive(signal: AbortSignal): Promise<MaintenancePacket | null> {
    const bytes = Buffer.alloc(maximumPacket);
    const control = Buffer.alloc(256);
    const layout = header(bytes, control);
    for (;;) {
      signal.throwIfAborted();
      if (this.closed) throw new Error('Maintenance channel is closed');
      layout.message.writeBigUInt64LE(BigInt(control.length), 40);
      layout.message.writeInt32LE(0, 48);
      const received = Number(
        this.native.symbols.recvmsg(this.descriptor, layout.message, 0x40 | 0x40000000),
      );
      if (received === -1) {
        const code = errno(this.native);
        if (code !== 11 && code !== 4) throw new Error('Maintenance packet receive failed');
        await Bun.sleep(5);
        continue;
      }
      if (received === 0 && layout.message.readBigUInt64LE(40) === 0n) return null;
      const descriptors: number[] = [];
      let credentials: MaintenancePacket['credentials'] | undefined;
      try {
        const used = Number(layout.message.readBigUInt64LE(40));
        if (used > control.length) throw new Error('Invalid maintenance ancillary extent');
        for (let offset = 0; offset + 16 <= used;) {
          const size = Number(control.readBigUInt64LE(offset));
          if (size < 16 || offset + size > used || control.readInt32LE(offset + 8) !== 1)
            throw new Error('Invalid maintenance ancillary framing');
          const kind = control.readInt32LE(offset + 12);
          if (kind === 1) {
            if ((size - 16) % 4 !== 0) throw new Error('Invalid maintenance descriptor framing');
            for (let index = offset + 16; index < offset + size; index += 4)
              descriptors.push(control.readInt32LE(index));
          } else if (kind === 2 && size === 28 && credentials === undefined) {
            credentials = {
              pid: control.readInt32LE(offset + 16),
              uid: control.readUInt32LE(offset + 20),
              gid: control.readUInt32LE(offset + 24),
            };
          } else throw new Error('Unexpected maintenance ancillary field');
          offset += align(size);
        }
        // Proof: native SCM_RIGHTS truncation receives many actual FDs; refusal closes every delivered descriptor.
        if (
          (layout.message.readInt32LE(48) & (0x8 | 0x20)) !== 0 ||
          received === 0 ||
          received > maximumPacket ||
          credentials === undefined ||
          credentials.pid < 1
        )
          throw new Error('Truncated or unauthenticated maintenance packet');
        return { bytes: bytes.subarray(0, received), credentials, descriptors };
      } catch (cause) {
        for (const descriptor of descriptors) closeSync(descriptor);
        throw cause;
      }
    }
  }

  /** Close only this endpoint; queued/received lock descriptions are never explicitly unlocked. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      closeSync(this.descriptor);
    } finally {
      this.native.close();
    }
  }
}

/** Create only an unnamed private pair; both endpoints request current-message credentials before the first packet can be queued. */
export function createMaintenanceSocketPair(): {
  parent: MaintenanceSocket;
  helper: MaintenanceSocket;
} {
  const native = nativeSocket();
  const descriptors = new Int32Array(2);
  try {
    if (native.symbols.socketpair(1, 5 | 0x80000 | 0x800, 0, descriptors) !== 0)
      throw new Error('Cannot create private maintenance socketpair');
  } finally {
    native.close();
  }
  try {
    return {
      parent: new MaintenanceSocket(descriptors[0]),
      helper: new MaintenanceSocket(descriptors[1]),
    };
  } catch (cause) {
    for (const descriptor of descriptors) closeSync(descriptor);
    throw cause;
  }
}
