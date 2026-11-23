import { closeSync, createReadStream } from 'node:fs';

import { dlopen, FFIType } from 'bun:ffi';

interface PipeKernel {
  create(descriptors: Int32Array): void;
}
let kernel: PipeKernel | undefined;

/** Linux uses the actually probed CLOEXEC pipe; Darwin's POSIX pipe/fcntl backend awaits native qualification. */
function readPipeKernel(): PipeKernel {
  if (kernel !== undefined) return kernel;
  if (process.platform === 'linux') {
    const library = dlopen('libc.so.6', {
      pipe2: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
    });
    kernel = {
      create(descriptors) {
        if (library.symbols.pipe2(descriptors, 0x80000) !== 0)
          throw new Error('development pipe2(O_CLOEXEC) failed');
      },
    };
  } else if (process.platform === 'darwin') {
    const library = dlopen('libSystem.B.dylib', {
      pipe: { args: [FFIType.ptr], returns: FFIType.i32 },
      fcntl: { args: [FFIType.i32, FFIType.i32, FFIType.i32], returns: FFIType.i32 },
    });
    kernel = {
      create(descriptors) {
        if (library.symbols.pipe(descriptors) !== 0)
          throw new Error('development POSIX pipe failed');
        for (const descriptor of descriptors)
          if (library.symbols.fcntl(descriptor, 2, 1) !== 0)
            throw new Error('development pipe F_SETFD(FD_CLOEXEC) failed');
      },
    };
  } else throw new Error('development capture platform is unsupported: ' + process.platform);
  return kernel;
}

/** One physical channel precedes the terminal/file split; reader EOF is not native child exit. */
export interface DevelopmentChannel {
  readonly writer: number;
  readonly stream: ReturnType<typeof createReadStream>;
  closeWriter(): void;
  closeReader(): Promise<void>;
}

/** Raw descriptors stay here until successful stream construction transfers only the read FD. */
function openDevelopmentPipe(): {
  readonly writer: number;
  readonly stream: ReturnType<typeof createReadStream>;
} {
  const descriptors = new Int32Array([-1, -1]);
  try {
    readPipeKernel().create(descriptors);
    const reader = descriptors.at(0),
      writer = descriptors.at(1);
    if (reader === undefined || reader < 0 || writer === undefined || writer < 0)
      throw new Error('development pipe returned invalid descriptors');
    const stream = createReadStream('/dev/null', { fd: reader, autoClose: true });
    return { writer, stream };
  } catch (cause: unknown) {
    const failures: unknown[] = [];
    for (const descriptor of descriptors)
      if (descriptor >= 0) {
        try {
          closeSync(descriptor);
        } catch (closeCause: unknown) {
          failures.push(closeCause);
        }
      }
    if (failures.length > 0)
      throw new AggregateError(
        [cause, ...failures],
        'development pipe acquisition and close failed',
        { cause },
      );
    throw cause;
  }
}

/** Own the writer directly and join the stream's sole physical read-FD owner after destroy. */
export function createDevelopmentChannel(onFailure: (cause: unknown) => void): DevelopmentChannel {
  const { writer, stream } = openDevelopmentPipe();
  stream.on('error', onFailure);
  const closed = Promise.withResolvers<undefined>();
  stream.once('close', () => {
    closed.resolve(undefined);
  });
  let isWriterClosed = false,
    isReaderClosed = false;
  return {
    writer,
    stream,
    closeWriter() {
      if (isWriterClosed) throw new Error('development pipe writer is already closed');
      isWriterClosed = true;
      closeSync(writer);
    },
    async closeReader() {
      if (isReaderClosed) throw new Error('development pipe reader is already closed');
      isReaderClosed = true;
      stream.destroy();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          closed.promise,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              reject(new Error('development pipe stream close is unconfirmed'));
            }, 5000);
          }),
        ]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
  };
}
