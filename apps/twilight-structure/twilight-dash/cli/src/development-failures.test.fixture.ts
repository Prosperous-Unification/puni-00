import {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type DevelopmentContext, runDevelopment } from './development';

const mode = process.argv[2];
if (mode !== 'delivery' && mode !== 'late-sink') throw new Error('unknown closed fixture mode');
if (process.platform !== 'linux') throw new Error('these first owner controls require Linux');
const root = mkdtempSync(join(tmpdir(), 'puni dev defect '));
const repository = join(root, 'repository');
const packageDirectory = join(repository, 'node_modules/nx');
mkdirSync(join(packageDirectory, 'dist/bin'), { recursive: true });
writeFileSync(
  join(packageDirectory, 'package.json'),
  JSON.stringify({ name: 'nx', type: 'commonjs', bin: { nx: './dist/bin/nx.js' } }),
);
writeFileSync(join(repository, 'package.json'), '{"private":true}\n');
const record = join(root, 'nx.json');
writeFileSync(
  join(packageDirectory, 'dist/bin/nx.js'),
  [
    'const fs=require("node:fs");',
    'const path=process.env.PUNI_DEV_RECORD;',
    'const state={pid:process.pid,phase:"ready",argv:process.argv.slice(2)};',
    'const publish=()=>{fs.writeFileSync(path+".next",JSON.stringify(state));fs.renameSync(path+".next",path)};',
    'publish();fs.writeSync(1,Buffer.from("LATE-CAPTURE"+String.fromCharCode(10)));',
    'setTimeout(()=>{state.phase="finished";publish();process.exit(0)},Number(process.env.PUNI_DEV_HOLD_MS));',
  ].join('\n'),
);
const originalKill = process.kill.bind(process);
const ownedDescriptors: number[] = [];
let knownPid: number | undefined;
let primary: { readonly cause: unknown } | undefined;
const cleanupCauses: unknown[] = [];
let report: unknown;
let operation: Promise<number> | undefined;
const operationState = { hasSettled: false };
const sink = Promise.withResolvers<undefined>();
let isSinkPending = false;
let preflights = 0;
function isCallbackPending(): boolean {
  return isSinkPending;
}
function createContext(holdMs: number, log?: string): DevelopmentContext {
  const environment: Record<string, string> = {
    PUNI_DEV_RECORD: record,
    PUNI_DEV_HOLD_MS: String(holdMs),
  };
  if (log !== undefined) environment['WBS_DEV_LOG'] = log;
  return {
    runtime: process.execPath,
    callerDirectory: repository,
    environment,
    preflight: () => {
      preflights++;
      return Promise.resolve(0);
    },
    stdout: () => {
      return undefined;
    },
    stderr: () => {
      return undefined;
    },
  };
}
async function waitForReady(): Promise<number> {
  for (let count = 0; count < 150; count++) {
    if (existsSync(record)) {
      const observed: unknown = JSON.parse(readFileSync(record, 'utf8'));
      if (
        observed === null ||
        typeof observed !== 'object' ||
        !('pid' in observed) ||
        typeof observed.pid !== 'number' ||
        !Number.isSafeInteger(observed.pid) ||
        observed.pid <= 0 ||
        !('phase' in observed)
      )
        throw new Error('controlled Nx ready record is malformed');
      knownPid = observed.pid;
      return observed.pid;
    }
    if (operationState.hasSettled)
      throw new Error('development operation ended before controlled Nx ready');
    await Bun.sleep(10);
  }
  throw new Error('controlled Nx ready deadline exceeded');
}
function containsIdentity(cause: unknown, expected: unknown): boolean {
  const pending: unknown[] = [cause],
    seen = new Set<Error>();
  for (const selected of pending) {
    if (selected === expected) return true;
    if (selected instanceof Error && !seen.has(selected)) {
      seen.add(selected);
      if (selected instanceof AggregateError) {
        const causes: readonly unknown[] = selected.errors;
        pending.push(...causes);
      }
      if ('cause' in selected) pending.push(selected.cause);
    }
  }
  return false;
}
function messages(cause: unknown): string[] {
  const pending: unknown[] = [cause],
    seen = new Set<Error>(),
    collected: string[] = [];
  for (const selected of pending)
    if (selected instanceof Error && !seen.has(selected)) {
      seen.add(selected);
      collected.push(selected.message);
      if (selected instanceof AggregateError) {
        const causes: readonly unknown[] = selected.errors;
        pending.push(...causes);
      }
      if ('cause' in selected) pending.push(selected.cause);
    }
  return collected;
}
function readOwnedCaptureDescriptor(path: string): number {
  const matches: number[] = [];
  for (const name of readdirSync('/proc/self/fd')) {
    if (!/^[0-9]+$/u.test(name)) continue;
    let selected: string;
    try {
      selected = readlinkSync('/proc/self/fd/' + name);
    } catch (cause: unknown) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') continue;
      throw cause;
    }
    if (selected === path) matches.push(Number(name));
  }
  const descriptor = matches.at(0);
  if (matches.length !== 1 || descriptor === undefined)
    throw new Error('actual pending capture must own exactly one identifiable descriptor');
  return descriptor;
}
function assertDescriptorClosed(descriptor: number): void {
  try {
    fstatSync(descriptor);
  } catch (cause: unknown) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'EBADF') return;
    throw cause;
  }
  throw new Error('capture descriptor did not close after reported expiry');
}
try {
  // Real unchanged API/Bun/local-Nx positive before either modeled dependency break.
  const baseline = await runDevelopment(
    { command: 'dev', repository, localSolver: false },
    createContext(20),
  );
  if (baseline !== 0 || preflights !== 1) throw new Error('real development baseline failed');
  const baselineRecord: unknown = JSON.parse(readFileSync(record, 'utf8'));
  if (
    baselineRecord === null ||
    typeof baselineRecord !== 'object' ||
    !('phase' in baselineRecord) ||
    baselineRecord.phase !== 'finished'
  )
    throw new Error('baseline native program did not publish finished');
  rmSync(record);
  const signalFailure = new Error('controlled actual group-signal delivery failed');
  let signalAttempts = 0;
  let captureDescriptor: number | undefined;
  const capturePath = join(root, 'capture.log');
  const context = createContext(13000, mode === 'late-sink' ? capturePath : undefined);
  const selected: DevelopmentContext =
    mode === 'late-sink'
      ? {
          ...context,
          stdout: (bytes) => {
            if (bytes.length === 0) throw new Error('pending sink received empty payload');
            isSinkPending = true;
            return sink.promise;
          },
        }
      : context;
  process.kill = (pid, signal) => {
    if (mode === 'delivery' && knownPid !== undefined && pid === -knownPid && signal === 'SIGINT') {
      signalAttempts++;
      throw signalFailure;
    }
    return originalKill(pid, signal);
  };
  operation = runDevelopment({ command: 'dev', repository, localSolver: false }, selected);
  void operation.then(
    () => {
      operationState.hasSettled = true;
    },
    () => {
      operationState.hasSettled = true;
    },
  );
  await waitForReady();
  if (mode === 'late-sink') {
    for (let count = 0; !isCallbackPending() && count < 150; count++) await Bun.sleep(10);
    if (!isCallbackPending()) throw new Error('actual merged callback never became pending');
    captureDescriptor = readOwnedCaptureDescriptor(capturePath);
  }
  const started = performance.now();
  originalKill(process.pid, mode === 'delivery' ? 'SIGINT' : 'SIGTERM');
  let caught: { readonly cause: unknown } | undefined;
  let returned: number | undefined;
  try {
    returned = await operation;
  } catch (cause: unknown) {
    caught = { cause };
  }
  const elapsedMs = performance.now() - started;
  if (mode === 'delivery') {
    report = {
      mode,
      baseline,
      preflights,
      readyPid: knownPid,
      signalAttempts,
      returned: returned ?? null,
      rejected: caught !== undefined,
      retainedExactSignalFailure:
        caught !== undefined && containsIdentity(caught.cause, signalFailure),
      elapsedMs,
      messages: caught === undefined ? [] : messages(caught.cause),
    };
  } else {
    if (
      caught === undefined ||
      !messages(caught.cause).some((message) => message.includes('unconfirmed'))
    )
      throw new Error('pending callback did not reach explicit unconfirmed-owner expiry');
    if (captureDescriptor === undefined)
      throw new Error('pending capture descriptor was not retained');
    assertDescriptorClosed(captureDescriptor);
    const reusedPath = join(root, 'reused-descriptor.log');
    let reused = false;
    for (let count = 0; count < 512; count++) {
      const descriptor = openSync(reusedPath, 'a');
      ownedDescriptors.push(descriptor);
      if (descriptor === captureDescriptor) {
        reused = true;
        break;
      }
      if (descriptor > captureDescriptor)
        throw new Error('capture FD was reacquired elsewhere before the reuse premise');
    }
    if (!reused) throw new Error('could not establish exact owned FD reuse');
    sink.resolve(undefined);
    await sink.promise;
    await Bun.sleep(50);
    const lateBytes = readFileSync(reusedPath);
    report = {
      mode,
      baseline,
      preflights,
      readyPid: knownPid,
      sinkActuallyPending: isSinkPending,
      explicitUnconfirmedExpiry: true,
      captureDescriptor,
      exactOwnedFDReuse: reused,
      elapsedMs,
      lateHex: lateBytes.toString('hex'),
      messages: messages(caught.cause),
    };
  }
} catch (cause: unknown) {
  primary = { cause };
}
process.kill = originalKill;
sink.resolve(undefined);
if (operation !== undefined && !operationState.hasSettled) {
  try {
    originalKill(process.pid, 'SIGTERM');
  } catch (cause: unknown) {
    cleanupCauses.push(cause);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('fixture operation remains unconfirmed; retained ' + root));
        }, 16000);
      }),
    ]);
  } catch (cause: unknown) {
    cleanupCauses.push(cause);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
for (const descriptor of ownedDescriptors) {
  try {
    closeSync(descriptor);
  } catch (cause: unknown) {
    cleanupCauses.push(cause);
  }
}
const pidToObserve = knownPid;
let nativeGone = pidToObserve === undefined;
if (pidToObserve !== undefined) {
  for (let count = 0; count < 1600; count++) {
    try {
      originalKill(pidToObserve, 0);
    } catch (cause: unknown) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH') {
        nativeGone = true;
        break;
      }
      cleanupCauses.push(cause);
      break;
    }
    await Bun.sleep(10);
  }
}
if (nativeGone && operationState.hasSettled) {
  try {
    rmSync(root, { recursive: true });
  } catch (cause: unknown) {
    cleanupCauses.push(cause);
  }
} else cleanupCauses.push(new Error('fixture/native ownership unconfirmed; retained ' + root));
if (primary !== undefined && cleanupCauses.length > 0)
  throw new AggregateError(
    [primary.cause, ...cleanupCauses],
    'controlled development failure and cleanup failed',
    { cause: primary.cause },
  );
if (primary !== undefined) throw primary.cause;
if (cleanupCauses.length > 0)
  throw new AggregateError(cleanupCauses, 'controlled development cleanup failed');
console.log(JSON.stringify(report));
