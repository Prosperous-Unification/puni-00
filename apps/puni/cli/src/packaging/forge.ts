import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';

import { createOutputs } from '@shared/bun-output';

import type { Context } from '../execute-command';
import { loadForgeRuntime } from './forge-runtime-loader';
import { verifyPuniSelection } from './selection';

const executingFile = fileURLToPath(import.meta.url);
const CORE_LIMIT = 32 * 1024 * 1024;
type Signal = 'SIGINT' | 'SIGTERM' | 'SIGHUP';
interface Request {
  readonly repository: string;
  readonly terminationLog: string;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
/** Retain one bounded nofollow regular descriptor, including named identity and cleanup failures. */
function readRuntimeFile(path: string, limit: number): Buffer {
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let bytes: Buffer | undefined, primary: { readonly cause: unknown } | undefined;
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size <= 0n || before.size > BigInt(limit))
      throw new Error('Forge runtime requires a bounded regular asset: ' + path);
    const chunks: Buffer[] = [];
    let size = 0;
    while (size <= limit) {
      const chunk = Buffer.alloc(Math.min(65536, limit + 1 - size));
      const count = readSync(descriptor, chunk, 0, chunk.length, null);
      if (count === 0) break;
      chunks.push(chunk.subarray(0, count));
      size += count;
    }
    const after = fstatSync(descriptor, { bigint: true }),
      named = lstatSync(path, { bigint: true });
    if (
      BigInt(size) !== before.size ||
      size > limit ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      after.ctimeNs !== before.ctimeNs ||
      named.dev !== before.dev ||
      named.ino !== before.ino ||
      named.mode !== before.mode
    )
      throw new Error('Forge runtime asset changed during observation: ' + path);
    bytes = Buffer.concat(chunks);
  } catch (cause: unknown) {
    primary = { cause };
  }
  let release: { readonly cause: unknown } | undefined;
  try {
    closeSync(descriptor);
  } catch (cause: unknown) {
    release = { cause };
  }
  if (release !== undefined) {
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, release.cause],
        'Forge runtime read and release failed',
        {
          cause: primary.cause,
        },
      );
    throw release.cause;
  }
  if (primary !== undefined) throw primary.cause;
  if (bytes === undefined) throw new Error('Forge runtime read produced no bytes');
  return bytes;
}
/**
 * Run only the installed hash-bound Forge core. The retained independent selection authenticates
 * every package member before load and each successor; the closed sibling manifest binds the
 * core to that package revision. This operation has no checkout/source/compiler fallback.
 * Native state is the explicit Linux Forge profile; required dynamic data is the selected archive
 * and mounted worktree under their existing verification/restart owners. Trusted publishers must
 * keep files stable: repeated observations are not an atomic snapshot against concurrent writers.
 * Signals use one replaying owner; the core retains actual child/group lifetime. Reusable calls
 * return/throw, while the root executable owns terminal exit after bounded diagnostics.
 */
export async function runInstalledForge(request: Request, supplied: Context): Promise<number> {
  const selected = { ...request };
  const context = {
    ...supplied,
    installation: { ...supplied.installation },
    environment: { ...supplied.environment },
  };
  const nativeIO = context.developmentIO === undefined ? undefined : { ...context.developmentIO };
  if (nativeIO === undefined)
    throw new Error('installed Forge requires explicit native diagnostic ownership');
  const recordAttempt = nativeIO.recordDiagnosticAttempt;
  const environment = context.environment;
  function required(name: string): string {
    const value = environment[name];
    if (value === undefined || value === '') throw new Error('Forge requires explicit ' + name);
    return value;
  }
  const observers = new Set<(signal: Signal) => void>();
  let received: Signal | undefined;
  const deliver = (signal: Signal): void => {
    received ??= signal;
    for (const observer of observers) observer(signal);
  };
  const onInt = (): void => {
      deliver('SIGINT');
    },
    onTerm = (): void => {
      deliver('SIGTERM');
    },
    onHup = (): void => {
      deliver('SIGHUP');
    };
  const subscribe = (observer: (signal: Signal) => void): (() => void) => {
    observers.add(observer);
    if (received !== undefined) observer(received);
    return () => {
      observers.delete(observer);
    };
  };
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  process.on('SIGHUP', onHup);
  let outputs: ReturnType<typeof createOutputs> | undefined;
  let primary: { readonly cause: unknown } | undefined;
  const cleanup: unknown[] = [];
  let status: number | undefined;
  try {
    outputs = createOutputs({
      name: 'Forge supervisor',
      stdout: nativeIO.openStdout,
      stderr: nativeIO.openStderr,
      subscribeInterrupts: (observer) =>
        subscribe((signal) => {
          observer(signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM');
        }),
    });
    const ownedOutputs = outputs;
    const selection = {
      bytes: Buffer.from(required('PUNI_SELECTION')),
      sha256: required('PUNI_SELECTION_SHA256'),
      directory: required('PUNI_INSTALLATION_DIRECTORY'),
      entrypoint: required('PUNI_EXECUTABLE'),
    };
    if (
      !isAbsolute(selected.repository) ||
      !isAbsolute(selected.terminationLog) ||
      resolve(selected.terminationLog) !== selected.terminationLog
    )
      throw new Error('Forge requires explicit absolute repository and termination-log placement');
    const repository = realpathSync.native(selected.repository);
    async function report(message: string): Promise<void> {
      let failure: { readonly cause: unknown } | undefined;
      try {
        writeFileSync(selected.terminationLog, message);
      } catch (cause: unknown) {
        failure = { cause };
      }
      const diagnostic = await ownedOutputs.reportDiagnostic(
        Buffer.from('[forge] ' + message + '\n'),
      );
      if (diagnostic.kind === 'abandoned') {
        if (failure !== undefined)
          throw new AggregateError(
            [failure.cause, diagnostic.cause],
            'Forge termination and diagnostic reporting failed',
            { cause: failure.cause },
          );
        throw diagnostic.cause;
      }
      if (failure !== undefined) throw failure.cause;
    }
    const installation = await verifyPuniSelection(
      selection.bytes,
      selection.sha256,
      selection.directory,
    );
    const actualEntrypoint = realpathSync.native(executingFile);
    if (realpathSync.native(context.runtime) !== realpathSync.native(process.execPath))
      throw new Error('Forge child runtime is not the actual observed Bun executable');
    if (
      installation.entrypoint !== actualEntrypoint ||
      installation.entrypoint !== realpathSync.native(selection.entrypoint) ||
      installation.entrypoint !== realpathSync.native(context.installation.entrypoint)
    )
      throw new Error('Forge selection does not identify the actual executing delivered PUNI root');
    const dist = dirname(installation.entrypoint),
      asset = join(dist, 'forge-supervisor.mjs'),
      manifestPath = join(dist, 'forge-supervisor.json');
    const manifestBytes = readRuntimeFile(manifestPath, 65536),
      coreBytes = readRuntimeFile(asset, CORE_LIMIT);
    const manifest: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes),
    );
    const packageManifest: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        readRuntimeFile(join(dist, 'package-manifest.json'), 65536),
      ),
    );
    if (
      !isRecord(manifest) ||
      JSON.stringify(Object.keys(manifest).sort()) !==
        JSON.stringify(['entrypoint', 'format', 'sha256', 'sourceRevision', 'version']) ||
      manifest['format'] !== 'puni-forge-runtime' ||
      manifest['version'] !== 1 ||
      manifest['entrypoint'] !== 'forge-supervisor.mjs' ||
      typeof manifest['sha256'] !== 'string' ||
      !/^[0-9a-f]{64}$/.test(manifest['sha256']) ||
      manifest['sha256'] !== hashBytes(coreBytes) ||
      typeof manifest['sourceRevision'] !== 'string' ||
      !/^[0-9a-f]{40}$/.test(manifest['sourceRevision']) ||
      !isRecord(packageManifest) ||
      packageManifest['sourceRevision'] !== manifest['sourceRevision']
    )
      throw new Error('Forge core manifest differs from the authenticated package runtime');
    const coreHash = manifest['sha256'];
    const namespace = await loadForgeRuntime(coreBytes, coreHash);
    if (
      !isRecord(namespace) ||
      typeof namespace['runForgeSupervisor'] !== 'function' ||
      typeof namespace['createForgeNativeInspection'] !== 'function'
    )
      throw new Error('Forge delivered core lacks its closed runtime exports');
    const inspectNative: unknown = Reflect.apply(
      namespace['createForgeNativeInspection'],
      namespace,
      [],
    );
    if (typeof inspectNative !== 'function')
      throw new Error('Forge native observer returned no inspection');
    const inspectLoadedNative = inspectNative;
    async function inspectExecution(): Promise<boolean> {
      const current = await verifyPuniSelection(
        selection.bytes,
        selection.sha256,
        selection.directory,
      );
      const native: unknown = Reflect.apply(inspectLoadedNative, undefined, []);
      if (typeof native !== 'boolean')
        throw new Error('Forge native observer returned an invalid observation');
      return (
        current.directoryIdentity === installation.directoryIdentity &&
        current.entrypoint === installation.entrypoint &&
        native &&
        hashBytes(readRuntimeFile(manifestPath, 65536)) === hashBytes(manifestBytes) &&
        hashBytes(readRuntimeFile(asset, CORE_LIMIT)) === coreHash
      );
    }
    if (!(await inspectExecution()))
      throw new Error('Forge runtime changed while loading its delivered core');
    const returned: unknown = await Reflect.apply(namespace['runForgeSupervisor'], namespace, [
      repository,
      {
        runtime: context.runtime,
        environment,
        selection,
        subscribeStop: subscribe,
        report,
      },
      { inspect: inspectExecution },
    ]);
    if (
      typeof returned !== 'number' ||
      !Number.isInteger(returned) ||
      returned < 0 ||
      returned > 255
    )
      throw new Error('Forge delivered core returned an invalid controlled status');
    status = returned;
  } catch (cause: unknown) {
    primary = { cause };
  }
  process.off('SIGINT', onInt);
  process.off('SIGTERM', onTerm);
  process.off('SIGHUP', onHup);
  let diagnosticOutcome: Parameters<typeof recordAttempt>[1] | undefined;
  async function reportFailure(
    owner: ReturnType<typeof createOutputs>,
    cause: unknown,
  ): Promise<void> {
    try {
      diagnosticOutcome = await owner.reportDiagnostic(
        Buffer.from(
          'Forge supervision failed: ' +
            inspect(cause, { depth: 5, maxArrayLength: 20, maxStringLength: 4096 }) +
            '\n',
        ),
      );
    } catch (cause: unknown) {
      diagnosticOutcome = { kind: 'abandoned', cause };
    }
    if (diagnosticOutcome.kind === 'abandoned') cleanup.push(diagnosticOutcome.cause);
  }
  if (primary !== undefined && outputs !== undefined) await reportFailure(outputs, primary.cause);
  const hadFailureBeforeRelease = primary !== undefined;
  try {
    outputs?.dispose();
  } catch (cause: unknown) {
    cleanup.push(cause);
  }
  // A fresh bounded owner is allowed only before any original output owner, or after an
  // otherwise successful owner release; never overtake an abandoned existing diagnostic tail.
  if (
    diagnosticOutcome === undefined &&
    (primary !== undefined || cleanup.length !== 0) &&
    (outputs === undefined || !hadFailureBeforeRelease)
  ) {
    let reporter: ReturnType<typeof createOutputs> | undefined;
    const failure =
      primary === undefined
        ? new AggregateError(cleanup, 'Forge supervision cleanup failed')
        : primary.cause;
    try {
      reporter = createOutputs({
        name: 'Forge cleanup diagnostic',
        stdout: nativeIO.openStdout,
        stderr: nativeIO.openStderr,
        subscribeInterrupts: (observer) =>
          subscribe((signal) => {
            observer(signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM');
          }),
      });
      await reportFailure(reporter, failure);
    } catch (cause: unknown) {
      cleanup.push(cause);
      diagnosticOutcome = { kind: 'abandoned', cause };
    }
    try {
      reporter?.dispose();
    } catch (cause: unknown) {
      cleanup.push(cause);
    }
  }
  if (primary !== undefined || cleanup.length !== 0) {
    const failure =
      primary === undefined
        ? new AggregateError(cleanup, 'Forge supervision cleanup failed')
        : cleanup.length === 0
          ? primary.cause
          : new AggregateError(
              [primary.cause, ...cleanup],
              'Forge supervision and diagnostic cleanup failed',
              { cause: primary.cause },
            );
    // Record the final thrown identity after cleanup, retaining the bounded attempt outcome.
    // This does not claim every later release cause was written to the diagnostic sink.
    if (diagnosticOutcome !== undefined) recordAttempt(failure, diagnosticOutcome);
    throw failure;
  }
  if (status === undefined) throw new Error('Forge supervision settled without status');
  return status;
}
