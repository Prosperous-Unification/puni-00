import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';

import * as ffi from 'bun:ffi';
import { mock } from 'bun:test';

const fault = process.env['PUNI_PROCESS_FAULT'];
const nativeReadFileSync = fs.readFileSync;
const nativeReaddirSync = fs.readdirSync;
const nativeWriteFile = fsPromises.writeFile;
const nativeRename = fsPromises.rename;
const nativeOpen = fsPromises.open;
const nativeDlopen = ffi.dlopen;
const nativeSpawnSync = Bun.spawnSync;
let vanishPid: number | undefined;
let reusedPid: number | undefined;
let unreadableRecheckPid: number | undefined;
let failedPidfd = false;
let failedRecheck = false;
let failedIdentity = false;
let armedIdentityReads = 0;
let failedSignal = false;
let failedWaitpid = false;
let inventoryReads = 0;
let armedInventory = false;
let failedInventory = false;

if (fault === 'descriptor-cancel-reject') {
  const nativeCancel: unknown = Reflect.get(ReadableStreamDefaultReader.prototype, 'cancel');
  if (typeof nativeCancel !== 'function')
    throw new Error('ReadableStreamDefaultReader.cancel is unavailable to the fault preload');
  ReadableStreamDefaultReader.prototype.cancel = function (reason?: unknown): Promise<void> {
    return (Reflect.apply(nativeCancel, this, [reason]) as Promise<void>).then(() => {
      throw new Error('injected descriptor cancellation failure');
    });
  };
}

if (fault?.startsWith('verdict-') === true) {
  // Test-only Burokrat transport fault in the isolated invocation supervisor.
  Bun.spawnSync = ((...args: Parameters<typeof Bun.spawnSync>) => {
    const invocation = nativeSpawnSync(...args);
    const argv = args[0];
    if (!Array.isArray(argv) || !argv.includes('check')) return invocation;
    const measured = argv.includes('--performance-evidence');
    if (measured !== fault.startsWith('verdict-run-')) return invocation;
    const verdict = JSON.parse((invocation.stdout ?? Buffer.alloc(0)).toString()) as Record<
      string,
      unknown
    >;
    let altered: Record<string, unknown> | string;
    switch (fault) {
      case 'verdict-preflight-empty':
        altered = '';
        break;
      case 'verdict-preflight-malformed':
        altered = '{';
        break;
      case 'verdict-preflight-shape':
        altered = '{}';
        break;
      case 'verdict-run-foreign':
        altered = { ...verdict, candidate: 'b'.repeat(64) };
        break;
      case 'verdict-run-unevaluated':
        altered = {
          ...verdict,
          allowed: false,
          unevaluated: [{ ruleId: 'PERF-THRESHOLD', reason: 'injected missing measurement' }],
        };
        break;
      default:
        throw new Error(`Unknown test-only Burokrat verdict fault: ${fault}`);
    }
    return {
      ...invocation,
      exitCode:
        typeof altered === 'string' ? invocation.exitCode : altered['allowed'] === false ? 1 : 0,
      stdout: Buffer.from(typeof altered === 'string' ? altered : JSON.stringify(altered)),
    };
  }) as typeof Bun.spawnSync;
}

if (fault === 'unresolved-direct') {
  const nativeSpawn = Bun.spawn;
  // Test-only Bun boundary: make the returned direct child's exit promise stay pending.
  Bun.spawn = ((...args: Parameters<typeof Bun.spawn>) => {
    const child = nativeSpawn(...args);
    Object.defineProperty(child, 'exited', { value: new Promise<number>(() => undefined) });
    return child;
  }) as typeof Bun.spawn;
}

if (fault === 'selection-mutate') {
  const nativeSpawn = Bun.spawn;
  let mutated = false;
  // Test-only launch boundary: change the supervisor environment after setup starts.
  Bun.spawn = ((...args: Parameters<typeof Bun.spawn>) => {
    const child = nativeSpawn(...args);
    if (!mutated) {
      mutated = true;
      process.env['CI'] = '0';
      process.env['E2E_PORT_SHIFT'] = '9999';
    }
    return child;
  }) as typeof Bun.spawn;
}

if (fault === 'partial-evidence' || fault === 'inventory-after-run') {
  let injected = false;
  await mock.module('node:fs/promises', () => ({
    ...fsPromises,
    writeFile: (async (path: string, contents: unknown, options?: unknown) => {
      if (fault === 'partial-evidence' && !injected && path.includes('evidence.json')) {
        injected = true;
        await nativeWriteFile(path, '{partial', options as Parameters<typeof nativeWriteFile>[2]);
        throw new Error('injected partial bundle write');
      }
      return nativeWriteFile(
        path,
        contents as string,
        options as Parameters<typeof nativeWriteFile>[2],
      );
    }) as typeof fsPromises.writeFile,
    rename: (async (
      source: Parameters<typeof nativeRename>[0],
      destination: Parameters<typeof nativeRename>[1],
    ) => {
      await nativeRename(source, destination);
      if (fault === 'inventory-after-run' && String(destination).endsWith('/manifest.json'))
        armedInventory = true;
    }) as typeof fsPromises.rename,
  }));
}

if (
  fault === 'descriptor-stderr-open' ||
  fault === 'descriptor-output-close' ||
  fault === 'descriptor-output-close-rename' ||
  fault?.startsWith('descriptor-failure-') === true
) {
  await mock.module('node:fs/promises', () => ({
    ...fsPromises,
    rename: (async (...args: Parameters<typeof nativeRename>) => {
      if (
        fault === 'descriptor-output-close-rename' &&
        String(args[1]).endsWith('/ordinary-services.stderr')
      )
        throw new Error('injected descriptor stderr rename failure');
      return nativeRename(...args);
    }) as typeof fsPromises.rename,
    open: (async (...args: Parameters<typeof nativeOpen>) => {
      const path = String(args[0]);
      if (fault === 'descriptor-stderr-open' && path.includes('ordinary-services.stderr.'))
        throw new Error('injected descriptor stderr open failure');
      const artifact = await nativeOpen(...args);
      if (fault === 'descriptor-stderr-open' && path.includes('ordinary-services.json.')) {
        const nativeClose = artifact.close.bind(artifact);
        artifact.close = async () => {
          await nativeClose();
          await nativeWriteFile(
            `${path.slice(0, path.lastIndexOf('/'))}/descriptor-stdout-closed`,
            'yes',
          );
        };
      }
      if (
        (fault === 'descriptor-output-close' ||
          fault === 'descriptor-output-close-rename' ||
          fault.startsWith('descriptor-failure-')) &&
        path.includes('ordinary-services.json.')
      ) {
        const nativeClose = artifact.close.bind(artifact);
        artifact.close = async () => {
          await nativeClose();
          if (fault === 'descriptor-failure-depth') {
            let nested: Error = new Error('deep failure');
            for (let depth = 0; depth < 17; depth++)
              nested = new Error('nested failure', { cause: nested });
            throw nested;
          }
          if (fault === 'descriptor-failure-cycle') {
            const cycle = new Error('cyclic failure');
            Object.defineProperty(cycle, 'cause', { value: cycle });
            throw cycle;
          }
          if (fault === 'descriptor-failure-entries')
            throw new AggregateError(Array.from({ length: 65 }, () => new Error('entry')));
          if (fault === 'descriptor-failure-utf8-bytes') throw new Error('字'.repeat(100_000));
          throw new Error('injected descriptor stdout close failure');
        };
      }
      return artifact;
    }) as typeof fsPromises.open,
  }));
}

await mock.module('node:fs', () => ({
  ...fs,
  readdirSync: ((path: string, ...argumentsAfterPath: unknown[]) => {
    if (fault === 'inventory-on-stop' && path === '/proc' && ++inventoryReads === 4)
      throw new Error('injected /proc inventory ambiguity');
    if (fault === 'inventory-after-run' && path === '/proc' && armedInventory && !failedInventory) {
      failedInventory = true;
      throw new Error('injected post-run inventory ambiguity');
    }
    return (nativeReaddirSync as (...args: unknown[]) => unknown)(path, ...argumentsAfterPath);
  }) as typeof fs.readdirSync,
  readFileSync: ((path: string, ...argumentsAfterPath: unknown[]) => {
    if (fault === 'pidfd-vanish' && path === `/proc/${String(vanishPid)}/stat`) {
      vanishPid = undefined;
      const missing = new Error('injected /proc exit');
      Object.assign(missing, { code: 'ENOENT' });
      throw missing;
    }
    if (fault === 'direct-reuse' && path === `/proc/${String(vanishPid)}/stat`) {
      reusedPid = vanishPid;
      vanishPid = undefined;
      const missing = new Error('injected direct-child exit before pidfd identity');
      Object.assign(missing, { code: 'ENOENT' });
      throw missing;
    }
    if (fault === 'pidfd-recheck-error' && path === `/proc/${String(unreadableRecheckPid)}/stat`) {
      unreadableRecheckPid = undefined;
      const unreadable = new Error('injected pidfd identity recheck EACCES');
      Object.assign(unreadable, { code: 'EACCES' });
      throw unreadable;
    }
    const selectedIdentityPath = path === `/proc/${process.env['PUNI_MUTATE_PID'] ?? '-'}/stat`;
    if (
      fault === 'ancestry-cycle' &&
      path === `/proc/${process.env['PUNI_CYCLE_PID'] ?? '-'}/stat`
    ) {
      const source = (nativeReadFileSync as (...args: unknown[]) => string)(
        path,
        ...argumentsAfterPath,
      );
      const end = source.lastIndexOf(')');
      const fields = source
        .slice(end + 2)
        .trim()
        .split(/\s+/);
      fields[1] = process.env['PUNI_CYCLE_PID'] ?? '-1';
      return `${source.slice(0, end + 2)}${fields.join(' ')}\n`;
    }
    if (selectedIdentityPath && fault === 'owned-root-reuse') {
      const source = (nativeReadFileSync as (...args: unknown[]) => string)(
        path,
        ...argumentsAfterPath,
      );
      const end = source.lastIndexOf(')');
      const fields = source
        .slice(end + 2)
        .trim()
        .split(/\s+/);
      fields[19] = String(BigInt(fields[19]) + 1n);
      return `${source.slice(0, end + 2)}${fields.join(' ')}\n`;
    }
    if (
      selectedIdentityPath &&
      (fault === 'identity-reused' || fault === 'signal-identity-reused')
    ) {
      armedIdentityReads += 1;
    }
    if (fault === 'direct-reuse' && path === `/proc/${String(reusedPid)}/stat`) {
      const source = (nativeReadFileSync as (...args: unknown[]) => string)(
        path,
        ...argumentsAfterPath,
      );
      const end = source.lastIndexOf(')');
      const fields = source
        .slice(end + 2)
        .trim()
        .split(/\s+/);
      fields[19] = String(BigInt(fields[19]) + 1n);
      return `${source.slice(0, end + 2)}${fields.join(' ')}\n`;
    }
    if (
      selectedIdentityPath &&
      !failedIdentity &&
      ((fault === 'identity-reused' && armedIdentityReads === 1) ||
        (fault === 'signal-identity-reused' && armedIdentityReads === 2))
    ) {
      failedIdentity = true;
      const source = (nativeReadFileSync as (...args: unknown[]) => string)(
        path,
        ...argumentsAfterPath,
      );
      const end = source.lastIndexOf(')');
      const fields = source
        .slice(end + 2)
        .trim()
        .split(/\s+/);
      fields[19] = String(BigInt(fields[19]) + 1n);
      return `${source.slice(0, end + 2)}${fields.join(' ')}\n`;
    }
    // Test-only native dependency boundary: preserve Node's overloads after the injected read.
    return (nativeReadFileSync as (...args: unknown[]) => unknown)(path, ...argumentsAfterPath);
  }) as typeof fs.readFileSync,
}));

await mock.module('bun:ffi', () => ({
  ...ffi,
  dlopen: ((library: string, symbols: Record<string, unknown>) => {
    const native = nativeDlopen(library, symbols as Parameters<typeof nativeDlopen>[1]);
    if (library !== 'libc.so.6' || !('syscall' in native.symbols)) return native;
    const syscall = native.symbols['syscall'] as unknown as (...args: number[]) => bigint;
    const waitpid = native.symbols['waitpid'] as unknown as (
      pid: number,
      status: ffi.Pointer,
      options: number,
    ) => number;
    return {
      ...native,
      symbols: {
        ...native.symbols,
        prctl: (...args: number[]) => {
          if (fault === 'subreaper-denied' && args[0] === 36) return -1;
          return (native.symbols['prctl'] as unknown as (...nativeArgs: number[]) => number)(
            ...args,
          );
        },
        syscall: (...args: number[]) => {
          if (fault === 'pidfd-probe-denied' && args[0] === 434 && args[1] === process.pid)
            return -1n;
          if (fault === 'signal-probe-denied' && args[0] === 424 && args[2] === 0) return -1n;
          if (
            (fault === 'pidfd-vanish' || fault === 'direct-reuse') &&
            args[0] === 434 &&
            args[1] !== process.pid &&
            !failedPidfd
          ) {
            failedPidfd = true;
            vanishPid = args[1];
            return -1n;
          }
          if (
            fault === 'pidfd-recheck-error' &&
            args[0] === 434 &&
            args[1] !== process.pid &&
            !failedRecheck
          ) {
            const descriptor = syscall(...args);
            if (descriptor >= 0) {
              failedRecheck = true;
              unreadableRecheckPid = args[1];
            }
            return descriptor;
          }
          if (fault === 'first-signal' && args[0] === 424 && args[2] !== 0 && !failedSignal) {
            failedSignal = true;
            return -1n;
          }
          return syscall(...args);
        },
        waitpid: (pid: number, status: ffi.Pointer, options: number) => {
          if (fault === 'waitpid-zero' && !failedWaitpid) {
            failedWaitpid = true;
            return 0;
          }
          if (fault === 'waitpid-echild' && !failedWaitpid) {
            failedWaitpid = true;
            return waitpid(2_147_483_647, status, options);
          }
          return waitpid(pid, status, options);
        },
      },
    };
  }) as typeof ffi.dlopen,
}));
