import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Socket } from 'node:net';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { mock } from 'bun:test';

import { isGatedPayloadCommand, parseDashCommand } from '../../cli-parser';
import { monotonicClock } from '../../clock';
import * as nativeDescriptors from '../gated-payload-native';
import * as protocol from '../gated-payload-protocol';

const [role, rootOperand, scenario] = Array.from({ length: 3 }, (_, index) =>
  process.argv.at(index + 2),
);
if (rootOperand === undefined || scenario === undefined) throw new Error('missing oracle operands');
const root = rootOperand;
const mark = (name: string, value: unknown) => {
  writeFileSync(join(root, name), JSON.stringify(value));
};
async function wait(name: string): Promise<void> {
  while (!existsSync(join(root, name))) await Bun.sleep(2);
}
if (role === 'payload') {
  const counts = { SIGHUP: 0, SIGINT: 0, SIGTERM: 0 };
  for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => {
      counts[signal]++;
      mark('signal-counts.json', counts);
    });
  const constructorValue: unknown = Reflect.get(process.env, 'constructor');
  mark('payload-ready.json', {
    pid: process.pid,
    ppid: process.ppid,
    privateHash: createHash('sha256')
      .update(process.env['PRIVATE_CANARY'] ?? '')
      .digest('hex'),
    proto: process.env['__proto__'] ?? null,
    constructor: typeof constructorValue === 'string' ? constructorValue : null,
  });
  if (scenario.startsWith('death-during') || scenario.startsWith('count-'))
    await wait('release-payload');
  process.exitCode = 37;
} else if (role === 'helper') {
  if (scenario === 'joint-no-env-eof') {
    const open = nativeDescriptors.openGatedDescriptors;
    let received = 0;
    await mock.module('../gated-payload-native', () => ({
      ...nativeDescriptors,
      async openGatedDescriptors(...arguments_: Parameters<typeof open>) {
        const owned = await open(...arguments_);
        return {
          ...owned,
          environment: {
            ...owned.environment,
            async read(signal: AbortSignal) {
              if (received !== 0) {
                const metadata: unknown = JSON.parse(
                  readFileSync(join(root, 'joint-frame-metadata.json'), 'utf8'),
                );
                if (
                  typeof metadata !== 'object' ||
                  metadata === null ||
                  !('length' in metadata) ||
                  typeof metadata.length !== 'number'
                )
                  throw new Error('joint frame length missing');
                if (received === metadata.length) mark('joint-awaiting-environment-eof', true);
              }
              const observation = await owned.environment.read(signal);
              if (observation.kind === 'bytes') received += observation.bytes.byteLength;
              return observation;
            },
          },
        };
      },
    }));
  }
  if (scenario === 'joint-no-start') {
    const nativeSpawn = Bun.spawn;
    Object.defineProperty(Bun, 'spawn', {
      value(
        argv: readonly string[],
        options: Bun.Spawn.SpawnOptions<'inherit', 'inherit', 'inherit'>,
      ) {
        const child = nativeSpawn([...argv], options);
        mark('joint-native-spawn.json', { pid: child.pid });
        return child;
      },
    });
  }
  if (scenario === 'env-over-limit') {
    const Bytes = Uint8Array;
    Object.defineProperty(globalThis, 'Uint8Array', {
      value: new Proxy(Bytes, {
        construct(target, arguments_, constructor) {
          const length: unknown = arguments_[0];
          if (typeof length === 'number' && length > 8388608)
            mark('oversized-body-allocation.json', { length });
          const allocation: unknown = Reflect.construct(target, arguments_, constructor);
          if (!(allocation instanceof Bytes)) throw new Error('unexpected byte allocation');
          return allocation;
        },
      }),
    });
  }
  if (scenario === 'ambiguous-close') {
    const open = nativeDescriptors.openGatedDescriptors;
    let attempts = 0;
    await mock.module('../gated-payload-native', () => ({
      ...nativeDescriptors,
      async openGatedDescriptors(...arguments_: Parameters<typeof open>) {
        const owned = await open(...arguments_);
        return {
          ...owned,
          environment: {
            ...owned.environment,
            close() {
              attempts++;
              owned.environment.close();
              mark('ambiguous-close-attempts.json', { attempts });
              throw new Error('controlled ambiguity after actual close');
            },
          },
        };
      },
    }));
  }
  if (scenario.startsWith('count-')) {
    const nativeSpawn = Bun.spawn;
    const attempts: string[] = [];
    Object.defineProperty(Bun, 'spawn', {
      value(
        argv: readonly string[],
        options: Bun.Spawn.SpawnOptions<'inherit', 'inherit', 'inherit'>,
      ) {
        const child = nativeSpawn([...argv], options);
        return new Proxy(child, {
          get(target, key) {
            if (key === 'kill')
              return (signal?: number | NodeJS.Signals) => {
                attempts.push(String(signal));
                mark('helper-forward-attempts.json', { attempts });
                target.kill(signal);
              };
            const value: unknown = Reflect.get(target, key, target);
            return value;
          },
        });
      },
    });
  }
  if (scenario.startsWith('env-') || scenario === 'joint-no-start') {
    const decode = protocol.decodeGatedEnvironment;
    const ProtocolFailure = protocol.GatedProtocolFailure;
    await mock.module('../gated-payload-protocol', () => ({
      ...protocol,
      decodeGatedEnvironment(body: Uint8Array) {
        try {
          const values = decode(body);
          if (scenario === 'joint-no-start') mark('joint-environment-decoded', true);
          mark('decode-stage.json', { kind: 'accepted' });
          return values;
        } catch (cause) {
          mark('decode-stage.json', {
            kind: 'refused',
            // The actual decoder owns redaction; no bytes or parse excerpts are persisted.
            reason:
              cause instanceof ProtocolFailure ? cause.message : 'unexpected boundary failure',
          });
          throw cause;
        }
      },
    }));
  }
  if (scenario === 'environment-ownership') {
    const nativeSpawn = Bun.spawn;
    Object.defineProperty(Bun, 'spawn', {
      value(
        argv: readonly string[],
        options: Bun.Spawn.SpawnOptions<'inherit', 'inherit', 'inherit'>,
      ) {
        mark('helper-environment-observed.json', {
          hasPrivate: Object.hasOwn(process.env, 'PRIVATE_CANARY'),
          hasProto: Object.hasOwn(process.env, '__proto__'),
          hasConstructor: Object.hasOwn(process.env, 'constructor'),
        });
        return nativeSpawn([...argv], options);
      },
    });
  }
  if (scenario === 'diagnostic-stall') {
    let writes = 0,
      unrefs = 0,
      flushes = 0;
    Object.defineProperty(Bun.stderr, 'writer', {
      value: () => ({
        write(bytes: Uint8Array) {
          writes++;
          mark('diagnostic-sink.json', {
            writes,
            unrefs,
            flushes,
            canonical:
              new TextDecoder().decode(bytes) ===
              'error: gated payload ownership or private protocol failed\n',
          });
          return new Promise<number>(() => undefined);
        },
        flush() {
          flushes++;
          return 0;
        },
        unref() {
          unrefs++;
          mark('diagnostic-abandoned.json', { writes, unrefs, flushes });
        },
      }),
    });
  }
  const request = parseDashCommand([
    'ops',
    'job',
    'payload-internal-v1',
    '--',
    process.execPath,
    '--no-env-file',
    '--config=/dev/null',
    import.meta.path,
    'payload',
    root,
    scenario,
  ]);
  if (!isGatedPayloadCommand(request)) throw new Error('invalid oracle request');
  const { runGatedPayload } = await import('../gated-payload');
  // The actual operation is observed through then; no pending top-level await owns its life.
  void runGatedPayload(request, { callerDirectory: root, monotonic: monotonicClock() }).then(
    (status) => {
      mark('helper-completed.json', { status });
      process.exitCode = status;
    },
    (cause: unknown) => {
      mark('helper-completed.json', { failed: cause instanceof AggregateError });
      process.exitCode = 125;
    },
  );
} else if (role === 'controller') {
  const launch = createLaunch(process.execPath, import.meta.path);
  const helper = spawn(launch[0] ?? '', [...launch.slice(1), 'helper', root, scenario], {
    cwd: root,
    env: { PATH: process.env['PATH'] },
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe', 'pipe'],
  });
  type NativeObservation =
    { kind: 'pending' } | { kind: 'ended'; code: number | null; signal: NodeJS.Signals | null };
  let nativeObservation: NativeObservation = { kind: 'pending' };
  const ending = once(helper, 'exit');
  helper.once('exit', (code: number | null, signal: NodeJS.Signals | null) => {
    nativeObservation = { kind: 'ended', code, signal };
    mark('helper-native-exit.json', nativeObservation);
  });
  function readNativeObservation(): NativeObservation {
    return nativeObservation;
  }
  const control = helper.stdio.at(3),
    status = helper.stdio.at(4),
    environment = helper.stdio.at(5);
  if (
    !(control instanceof Socket) ||
    !(status instanceof Socket) ||
    !(environment instanceof Socket)
  )
    throw new Error('oracle descriptors absent');
  if (helper.pid === undefined || helper.stderr === null) throw new Error('oracle helper absent');
  const helperPid = helper.pid;
  const statusEnded = once(status, 'end');
  let statusText = '',
    diagnostic = '';
  let signalAcknowledgement:
    'not-started' | 'pending' | 'sent' | 'skipped-native-ended' | 'native-ended-during-write' =
    'not-started';
  const signalControlFailures: Error[] = [];
  function isBrokenPipe(cause: unknown): boolean {
    return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'EPIPE';
  }
  status.on('data', (bytes: Buffer) => {
    statusText += bytes.toString('utf8');
  });
  helper.stderr.on('data', (bytes: Buffer) => {
    diagnostic += bytes.toString('utf8');
  });
  // Observe EPIPE without an unhandled stream error; the fault's native end remains separate.
  control.on('error', (cause: Error) => {
    mark('control-error.json', { message: cause.message });
    if (scenario.startsWith('count-')) {
      signalControlFailures.push(cause);
      if (
        !isBrokenPipe(cause) ||
        (signalAcknowledgement !== 'pending' &&
          signalAcknowledgement !== 'native-ended-during-write')
      )
        throw cause;
    }
  });
  environment.on('error', (cause: Error) => {
    mark('environment-error.json', { message: cause.message });
  });
  mark('helper-started.json', { pid: helperPid });
  if (scenario === 'death-before-start') {
    mark('kill-controller', { phase: 'before-start' });
    await new Promise<void>(() => undefined);
  }
  const privateValue = randomBytes(32).toString('hex');
  let envelope: unknown = [1, [['PATH', process.env['PATH'] ?? '']]];
  if (scenario === 'environment-ownership')
    envelope = [
      1,
      [
        ['PATH', process.env['PATH'] ?? ''],
        ['PRIVATE_CANARY', privateValue],
        ['__proto__', 'own-proto'],
        ['constructor', 'own-constructor'],
      ],
    ];
  const invalid: Record<string, unknown> = {
    'env-tuple-object': {},
    'env-tuple-arity': [1, [], 0],
    'env-version': [2, []],
    'env-entries-object': [1, {}],
    'env-entry-object': [1, [{}]],
    'env-entry-arity': [1, [['NAME', '', 'extra']]],
    'env-name-type': [1, [[1, '']]],
    'env-value-type': [1, [['NAME', 1]]],
    'env-name-empty': [1, [['', '']]],
    'env-name-equal': [1, [['A=B', '']]],
    'env-name-nul': [1, [['A\0B', '']]],
    'env-value-nul': [1, [['NAME', 'A\0B']]],
    'env-duplicate': [
      1,
      [
        ['NAME', 'one'],
        ['NAME', 'two'],
      ],
    ],
    'diagnostic-stall': [1, [['NAME', 1]]],
  };
  if (Object.hasOwn(invalid, scenario)) envelope = invalid[scenario];
  if (scenario === 'env-count-stage') envelope = [1, Array.from({ length: 1048577 }, () => [])];
  let body = new TextEncoder().encode(JSON.stringify(envelope));
  if (scenario === 'env-utf8') body = new Uint8Array([0xff]);
  if (scenario === 'env-json') body = new TextEncoder().encode('[');
  let frame = new Uint8Array(body.byteLength + 4);
  new DataView(frame.buffer).setUint32(0, body.byteLength, false);
  frame.set(body, 4);
  if (scenario === 'env-over-limit') {
    frame = new Uint8Array(4);
    new DataView(frame.buffer).setUint32(0, 8388609, false);
  }
  if (scenario === 'env-zero') frame = new Uint8Array(4);
  if (scenario === 'env-partial-header') frame = frame.subarray(0, 3);
  if (scenario === 'env-partial-body') frame = frame.subarray(0, frame.byteLength - 1);
  if (scenario === 'env-trailing') {
    const extended = new Uint8Array(frame.byteLength + 1);
    extended.set(frame);
    frame = extended;
  }
  const write = (socket: Socket, bytes: Uint8Array | string) =>
    new Promise<void>((resolve, reject) => {
      socket.write(bytes, (cause) => {
        if (cause) reject(cause);
        else resolve();
      });
    });
  if (scenario === 'joint-no-env-eof')
    mark('joint-frame-metadata.json', { length: frame.byteLength });
  await write(environment, frame);
  if (scenario !== 'joint-no-env-eof') environment.end();
  if (scenario === 'joint-no-start') {
    await wait('joint-environment-decoded');
    await Bun.sleep(80);
    mark('before-start.json', {
      payloadAbsent: !existsSync(join(root, 'payload-ready.json')),
      nativeSpawned: existsSync(join(root, 'joint-native-spawn.json')),
      pending: helper.exitCode === null,
      statusText,
    });
  }
  const controls: Record<string, string> = {
    'control-crlf': 'start\r\n',
    'control-space': ' start\n',
    'control-partial': 'star',
    'control-overlong': 'startx\n',
    'control-duplicate-start': 'start\nstart\n',
  };
  await write(control, controls[scenario] ?? 'start\n');
  if (scenario === 'joint-no-env-eof') {
    while (
      !existsSync(join(root, 'joint-awaiting-environment-eof')) &&
      !existsSync(join(root, 'payload-ready.json'))
    )
      await Bun.sleep(2);
    mark('before-environment-eof.json', {
      payloadAbsent: !existsSync(join(root, 'payload-ready.json')),
      pending: helper.exitCode === null,
      statusText,
    });
    environment.end();
  }
  const refusal =
    scenario.startsWith('env-') ||
    scenario.startsWith('control-') ||
    scenario === 'diagnostic-stall' ||
    scenario === 'ambiguous-close';
  if (scenario === 'control-partial') control.end();
  if (scenario === 'death-during-child' || scenario.startsWith('count-')) {
    await wait('payload-ready.json');
    if (scenario === 'death-during-child') {
      mark('kill-controller', { phase: 'during-child' });
      await new Promise<void>(() => undefined);
    }
    const signal = scenario.endsWith('HUP')
      ? 'SIGHUP'
      : scenario.endsWith('INT')
        ? 'SIGINT'
        : 'SIGTERM';
    process.kill(scenario.startsWith('count-wrapper') ? helperPid : -helperPid, signal);
    await Bun.sleep(120);
    mark('count-observation.json', {
      counts: existsSync(join(root, 'signal-counts.json'))
        ? (JSON.parse(readFileSync(join(root, 'signal-counts.json'), 'utf8')) as unknown)
        : {},
      helperPending: readNativeObservation().kind === 'pending',
      native: readNativeObservation(),
      statusText,
    });
    mark('release-payload', true);
  }
  await statusEnded;
  if (refusal) control.end();
  if (scenario === 'ambiguous-close') {
    await Bun.sleep(80);
    mark('ambiguous-before-cleanup.json', {
      helperPending: helper.exitCode === null,
      operationPending: !existsSync(join(root, 'helper-completed.json')),
    });
    if (helper.exitCode === null) helper.kill('SIGKILL');
  }
  if (scenario === 'death-after-status') {
    mark('kill-controller', { phase: 'after-status', statusText });
    await new Promise<void>(() => undefined);
  }
  if (!refusal) {
    await Bun.sleep(30);
    if (scenario.startsWith('count-')) {
      const beforeAcknowledgement = readNativeObservation();
      mark('signal-before-ack.json', beforeAcknowledgement);
      mark('before-ack.json', {
        pending: beforeAcknowledgement.kind === 'pending',
        statusText,
      });
      if (beforeAcknowledgement.kind === 'ended') signalAcknowledgement = 'skipped-native-ended';
      else {
        signalAcknowledgement = 'pending';
        try {
          await write(control, 'done\n');
          signalAcknowledgement = 'sent';
        } catch (cause) {
          if (!isBrokenPipe(cause)) throw cause;
          // EPIPE only describes this signal-case write. The registered native event must join.
          await ending;
          signalAcknowledgement = 'native-ended-during-write';
          mark('signal-ack-epipe.json', { kind: 'EPIPE', native: readNativeObservation() });
        }
      }
      const controlFailure = signalControlFailures.at(0);
      if (controlFailure !== undefined && signalAcknowledgement !== 'native-ended-during-write')
        throw controlFailure;
      mark('signal-acknowledgement.json', { kind: signalAcknowledgement });
    } else {
      mark('before-ack.json', { pending: helper.exitCode === null, statusText });
      if (helper.exitCode === null)
        await write(control, scenario === 'duplicate-done' ? 'done\ndone\n' : 'done\n');
    }
    control.end();
  }
  const ended: unknown = await ending;
  if (!Array.isArray(ended)) throw new Error('oracle native ending absent');
  const code: unknown = ended[0],
    signal: unknown = ended[1];
  mark('oracle-receipt.json', {
    code,
    signal,
    statusText,
    diagnosticCount:
      diagnostic.split('error: gated payload ownership or private protocol failed\n').length - 1,
    diagnosticCanonical:
      diagnostic === '' ||
      diagnostic === 'error: gated payload ownership or private protocol failed\n',
    payloadAbsent: !existsSync(join(root, 'payload-ready.json')),
    privateHash: createHash('sha256').update(privateValue).digest('hex'),
    frameHash: createHash('sha256').update(frame).digest('hex'),
    frameLength: frame.byteLength,
  });
} else throw new Error('unknown oracle role');
