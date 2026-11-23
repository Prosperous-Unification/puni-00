import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, fstatSync, openSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';

import { dlopen, ptr } from 'bun:ffi';

const mode = process.argv.at(2),
  rootOperand = process.argv.at(3),
  lane = process.argv.at(4),
  scenario = process.argv.at(5);
if (mode === undefined || rootOperand === undefined)
  throw new Error('transport fixture operands missing');
const root = rootOperand;
const SIZE = 2 * 1024 * 1024;
function save(name: string, value: unknown): void {
  writeFileSync(join(root, name), JSON.stringify(value, null, 2));
}
function identity(fd: number): string {
  const file = fstatSync(fd, { bigint: true });
  return String(file.dev) + ':' + String(file.ino);
}
function originalEndpoints(identities: readonly string[]): string[] {
  const inherited: string[] = [];
  for (const name of readdirSync('/proc/self/fd')) {
    try {
      if (identities.includes(identity(Number(name)))) inherited.push(name);
    } catch (cause) {
      if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'EBADF') throw cause;
    }
  }
  return inherited;
}
function endWrite(stream: Writable, bytes?: Uint8Array): Promise<void> {
  return new Promise((resolveWrite, rejectWrite) => {
    stream.end(bytes, (cause?: Error | null) => {
      if (cause == null) resolveWrite();
      else rejectWrite(cause);
    });
  });
}
async function writeChunks(stream: Writable, bytes: Uint8Array): Promise<number> {
  let pressure = 0;
  for (let offset = 0; offset < bytes.byteLength; offset += 65536) {
    await new Promise<void>((resolveWrite, rejectWrite) => {
      const accepted = stream.write(
        bytes.subarray(offset, offset + 65536),
        (cause?: Error | null) => {
          if (cause == null) resolveWrite();
          else rejectWrite(cause);
        },
      );
      if (!accepted) pressure++;
    });
  }
  return pressure;
}
function collect(stream: Readable): Promise<Buffer> {
  return new Promise((resolveRead, rejectRead) => {
    const chunks: Buffer[] = [];
    stream.on('data', (bytes: Buffer) => chunks.push(bytes));
    stream.once('error', rejectRead);
    stream.once('end', () => {
      resolveRead(Buffer.concat(chunks));
    });
  });
}
if (mode === 'payload') {
  const identities: unknown = JSON.parse(process.argv.at(4) ?? 'null');
  if (!Array.isArray(identities) || identities.some((entry: unknown) => typeof entry !== 'string'))
    throw new Error('endpoint identities malformed');
  const inherited: string[] = [];
  for (const name of readdirSync('/proc/self/fd')) {
    if (!/^\d+$/u.test(name)) throw new Error('native descriptor name malformed');
    try {
      if (identities.includes(identity(Number(name)))) inherited.push(name);
    } catch (cause) {
      if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'EBADF') throw cause;
    }
  }
  const stdin = Buffer.from(await Bun.stdin.arrayBuffer()).toString('hex');
  const constructorValue: unknown = Reflect.get(process.env, 'constructor');
  save('payload.json', {
    inheritedOriginalEndpoints: inherited,
    pid: process.pid,
    ppid: process.ppid,
    stdin,
    proto: process.env['__proto__'],
    constructorValue,
  });
  await Bun.write(Bun.stdout, new Uint8Array([0, 1, 254, 255]));
  await Bun.write(Bun.stderr, new Uint8Array([255, 0, 253]));
  process.exitCode = 37;
} else if (mode === 'worker') {
  const endpoints = [identity(3), identity(4), identity(5)] as const;
  const libc = dlopen('libc.so.6', {
    getsockopt: { args: ['i32', 'i32', 'i32', 'ptr', 'ptr'], returns: 'i32' },
    fcntl: { args: ['i32', 'i32', 'i32'], returns: 'i32' },
  });
  const capacity = new Int32Array(1),
    length = new Uint32Array([4]);
  if (libc.symbols.getsockopt(5, 1, 8, ptr(capacity), ptr(length)) !== 0 || capacity[0] <= 0)
    throw new Error('private descriptor is not a measurable native socket');
  const beforeFlags = [3, 4, 5].map((fd) => ({
    fd,
    flags: libc.symbols.fcntl(fd, 3, 0),
    descriptorFlags: libc.symbols.fcntl(fd, 1, 0),
  }));
  const { openGatedDescriptors } = await import('../gated-payload-native');
  const ports = await openGatedDescriptors({ now: () => performance.now() });
  const afterFlags = [3, 4, 5].map((fd) => ({
    fd,
    flags: libc.symbols.fcntl(fd, 3, 0),
    descriptorFlags: libc.symbols.fcntl(fd, 1, 0),
  }));
  const start = Promise.withResolvers<'start' | 'eof'>(),
    done = Promise.withResolvers<undefined>();
  const controlAbort = new AbortController(),
    privateAbort = new AbortController();
  let completion = 37;
  let control = '',
    ended = false;
  const hasEnded = (): boolean => ended;
  const controlReading = (async () => {
    for (;;) {
      const next = await ports.control.read(controlAbort.signal);
      if (next.kind === 'aborted') throw new Error('transport control unexpectedly aborted');
      if (next.kind === 'eof') {
        ended = true;
        start.resolve('eof');
        done.resolve(undefined);
        privateAbort.abort();
        return;
      }
      control += Buffer.from(next.bytes).toString('ascii');
      if (control.startsWith('start\n')) start.resolve('start');
    }
  })();
  void controlReading.catch((cause: unknown) => {
    start.reject(cause);
    done.reject(cause);
  });
  save('worker-ready.json', {
    pid: process.pid,
    endpoints,
    privateReceiveBuffer: capacity[0],
    beforeFlags,
    afterFlags,
  });
  await Bun.sleep(100);
  const environmental = (async () => {
    const chunks: Uint8Array[] = [];
    let count = 0;
    for (;;) {
      const next = await ports.environment.read(privateAbort.signal);
      if (next.kind === 'aborted') return { kind: 'aborted' as const };
      if (next.kind === 'eof') return { kind: 'eof' as const, bytes: Buffer.concat(chunks) };
      count += next.bytes.byteLength;
      if (count > SIZE + 4) throw new Error('transport probe frame exceeded its own bound');
      chunks.push(next.bytes);
    }
  })();
  const first = await start.promise;
  if (first === 'eof') {
    // Characterization cancellation ends the incomplete private read explicitly; no payload exists.
    const cancelled = await environmental;
    if (cancelled.kind !== 'aborted') throw new Error('private pending read did not cancel');
    await controlReading;
    ports.environment.close();
    ports.status.close();
    ports.control.close();
    save('worker.json', { first, payloadStarted: false, allClosed: true });
    save('settled-io.json', { originalEndpointsOpen: originalEndpoints(endpoints) });
    process.exitCode = 125;
  } else {
    const envelope = await environmental;
    if (envelope.kind !== 'eof') throw new Error('private transfer cancelled after start');
    const bytes = envelope.bytes;
    ports.environment.close();
    const privateStillOpen = originalEndpoints([endpoints[2]]);
    if (privateStillOpen.length !== 0)
      throw new Error('original private input remained open before payload');
    if (bytes.byteLength !== SIZE + 4 || bytes.readUInt32BE(0) !== SIZE)
      throw new Error('private transfer length changed');
    save('private-read.json', {
      length: bytes.byteLength,
      digest: createHash('sha256').update(bytes).digest('hex'),
      receiveBuffer: capacity[0],
      eofBeforePayload: true,
    });
    if (scenario === 'write-pressure' || scenario === 'write-cancel') {
      save('status-ready.json', { bytes: SIZE });
      const writerAbort = new AbortController();
      const cancellation =
        scenario === 'write-cancel'
          ? setTimeout(() => {
              writerAbort.abort();
            }, 100)
          : undefined;
      let pressure: number | undefined;
      try {
        pressure = await ports.status.write(
          Buffer.alloc(SIZE, 0x62),
          writerAbort.signal,
          performance.now() + 5000,
        );
      } catch (cause) {
        if (
          scenario !== 'write-cancel' ||
          !(cause instanceof Error) ||
          cause.message !== 'gated status write cancelled'
        )
          throw cause;
        completion = 70;
        save('status-cancelled.json', { kind: 'write-cancelled' });
      } finally {
        if (cancellation !== undefined) clearTimeout(cancellation);
      }
      ports.status.close();
      save('worker.json', {
        outputPressure: pressure,
        payloadStarted: false,
        writeCancelled: scenario === 'write-cancel',
      });
      if (scenario === 'write-pressure') completion = 0;
    } else {
      const native = Promise.withResolvers<{
        code: number | null;
        signal: number | null;
        cause: unknown;
      }>();
      const child = Bun.spawn(
        [
          process.execPath,
          '--no-env-file',
          '--config=/dev/null',
          import.meta.path,
          'payload',
          root,
          JSON.stringify(endpoints),
        ],
        {
          env: Object.fromEntries([
            ['__proto__', 'native-proto-value'],
            ['constructor', 'native-constructor-value'],
          ]),
          stdin: 'inherit',
          stdout: 'inherit',
          stderr: 'inherit',
          onExit(_child, code, signal, cause) {
            native.resolve({ code, signal, cause });
          },
        },
      );
      const [numeric, observed] = await Promise.all([child.exited, native.promise]);
      if (
        observed.cause !== undefined ||
        observed.code !== 37 ||
        observed.signal !== null ||
        numeric !== 37
      )
        throw new Error('direct native payload observation mismatch');
      if (scenario === 'closed-status') {
        save('status-ready.json', { payloadEnded: true });
        while (!(await Bun.file(join(root, 'status-write-gate')).exists())) await Bun.sleep(5);
      }
      try {
        await ports.status.write(
          Buffer.from('37\n'),
          controlAbort.signal,
          performance.now() + 1000,
        );
      } catch (cause) {
        if (
          scenario !== 'closed-status' ||
          !(cause instanceof Error) ||
          !('code' in cause) ||
          cause.code !== 'EPIPE'
        )
          throw cause;
        completion = 70;
        save('status-failed.json', { kind: 'closed-peer', code: 'EPIPE' });
      }
      ports.status.close();
      save('worker.json', {
        payloadStarted: true,
        directChild: child.pid,
        wrapper: process.pid,
        native: { code: observed.code, signal: observed.signal },
        numeric,
        privateClosedBeforePayload: true,
      });
    }
    await done.promise;
    if (!hasEnded() || control !== 'start\ndone\n')
      throw new Error('transport control EOF/half-close mismatch');
    await controlReading;
    ports.control.close();
    save('settled-io.json', { originalEndpointsOpen: originalEndpoints(endpoints) });
    process.exitCode = completion;
  }
} else if (mode === 'controller') {
  const argv = [
    process.execPath,
    '--no-env-file',
    '--config=/dev/null',
    import.meta.path,
    'worker',
    root,
    lane ?? '',
    scenario ?? '',
  ];
  const executable = lane === 'systemd' ? '/usr/bin/systemd-run' : argv.shift();
  if (executable === undefined) throw new Error('transport executable missing');
  if (lane === 'systemd') argv.unshift('--user', '--scope', '--quiet', '--collect', '--');
  const stdin = openSync(join(root, 'stdin.bin'), 'r');
  const child = spawn(executable, argv, {
    stdio: [stdin, 'inherit', 'inherit', 'pipe', 'pipe', 'pipe'],
  });
  closeSync(stdin);
  const terminal = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolveExit, rejectExit) => {
      child.once('error', rejectExit);
      child.once('exit', (code, signal) => {
        resolveExit({ code, signal });
      });
    },
  );
  const control = child.stdio[3],
    status = child.stdio[4];
  const environment: unknown = child.stdio.at(5);
  if (
    !(control instanceof Writable) ||
    !(status instanceof Readable) ||
    !(environment instanceof Writable)
  )
    throw new Error('actual inherited transport pipes missing');
  const failures: unknown[] = [];
  control.on('error', (cause: unknown) => failures.push(cause));
  environment.on('error', (cause: unknown) => failures.push(cause));
  let received: Promise<Buffer>;
  if (scenario === 'closed-status') {
    received = (async () => {
      while (!(await Bun.file(join(root, 'status-ready.json')).exists())) await Bun.sleep(5);
      status.destroy();
      writeFileSync(join(root, 'status-write-gate'), 'release');
      while (!(await Bun.file(join(root, 'status-failed.json')).exists())) await Bun.sleep(5);
      return Buffer.alloc(0);
    })();
  } else if (scenario === 'write-pressure' || scenario === 'write-cancel') {
    status.pause();
    received = (async () => {
      while (
        !(await Bun.file(
          join(root, scenario === 'write-cancel' ? 'status-cancelled.json' : 'status-ready.json'),
        ).exists())
      )
        await Bun.sleep(5);
      if (scenario !== 'write-cancel') await Bun.sleep(100);
      const reading = collect(status);
      status.resume();
      return await reading;
    })();
  } else received = collect(status);
  const frame = Buffer.alloc(SIZE + 4, 0x61);
  frame.writeUInt32BE(SIZE, 0);
  let inputPressure = 0;
  if (scenario === 'cancel-env') {
    await new Promise<void>((resolveWrite, rejectWrite) => {
      environment.write(frame.subarray(0, 1024), (cause?: Error | null) => {
        if (cause == null) resolveWrite();
        else rejectWrite(cause);
      });
    });
    await endWrite(control);
  } else {
    await new Promise<void>((resolveWrite, rejectWrite) => {
      control.write('start\n', (cause?: Error | null) => {
        if (cause == null) resolveWrite();
        else rejectWrite(cause);
      });
    });
    save('controller-state.json', { phase: 'start-written' });
    inputPressure = await writeChunks(environment, frame);
    save('controller-state.json', { phase: 'private-written', inputPressure });
    await endWrite(environment);
    save('controller-state.json', { phase: 'private-ended' });
  }
  const bytes = await received;
  if (scenario !== 'cancel-env') await endWrite(control, Buffer.from('done\n'));
  const exited = await terminal;
  environment.destroy();
  control.destroy();
  status.destroy();
  save('receipt.json', {
    lane,
    scenario,
    leader: exited,
    statusLength: bytes.byteLength,
    status: scenario === 'write-pressure' ? null : bytes.toString('ascii'),
    statusDigest: createHash('sha256').update(bytes).digest('hex'),
    inputPressure,
    writeFailures: failures.length,
  });
  if (
    exited.signal !== null ||
    exited.code !==
      (scenario === 'cancel-env'
        ? 125
        : scenario === 'write-pressure'
          ? 0
          : scenario === 'closed-status' || scenario === 'write-cancel'
            ? 70
            : 37)
  )
    throw new Error('native transport leader failed');
} else throw new Error('unknown transport fixture mode');
