import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, sep } from 'node:path';

import {
  buildLocalPuniAssets,
  buildPuniAssets,
  captureCommittedSource,
  captureWorkingSource,
  readBuildFile,
  readBuildSource,
  readCapturedBuildFile,
  readWorkingBuildSource,
  ToolkitBuildFailure,
} from '@puni/burokrat/packaging';

import { createPackageMetadata } from './metadata';

export { captureWorkingSource };

interface Request {
  readonly repository: string;
  readonly revision: string;
  readonly installationDirectory: string;
  readonly work: string;
  readonly destination: string;
}
interface Context {
  readonly callerDirectory: string;
  readonly runtime: Parameters<typeof captureCommittedSource>[1]['runtime'];
  readonly subscribeInterrupts: Parameters<typeof captureCommittedSource>[1]['subscribeInterrupts'];
}
const documentation = [
  ['README.md', 'apps/puni/cli/README.md'],
  ['LICENSE', 'apps/puni/cli/LICENSE'],
  ['NOTICE', 'apps/puni/cli/NOTICE'],
] as const;
function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Assemble a local package from one explicit commit and independently admitted installation.
 * The caller owns diagnostic/terminal lifetime. One interruption subscription spans capture,
 * required-program production and metadata delivery; original and release failures outrank late
 * cancellation. Metadata has no install hooks, and documentation comes from the same capture.
 * Native package placement derives from the delivered toolkit, including relative operands.
 * Every failed write retains package/work roots. No clean-release/publication claim follows.
 */
export function buildPackage(request: Request, context: Context) {
  return assemblePackage({ kind: 'committed', request }, context);
}

/**
 * Assemble local development assets from exact tracked/nonignored working bytes and modes.
 * The real base remains a reference, while the complete working identity is delivered through
 * toolkit, profile, assets and selection. The committed package path retains its own admission;
 * both paths share the same source materializer, compiler, package layout and retained owners.
 */
export function buildWorkingPackage(request: Omit<Request, 'revision'>, context: Context) {
  return assemblePackage({ kind: 'working', request }, context);
}

async function assemblePackage(
  capture:
    | { readonly kind: 'committed'; readonly request: Request }
    | { readonly kind: 'working'; readonly request: Omit<Request, 'revision'> },
  context: Context,
) {
  // Proof: c28-assembly-input-capture; injected fault failed `captures package request caller and runtime fields before subscription aliases mutate`; restoration passed.
  const selected =
      capture.kind === 'committed'
        ? { ...capture.request, kind: 'committed' as const }
        : { ...capture.request, kind: 'working' as const },
    callerDirectory = context.callerDirectory;
  const captureContext = {
    repository: selected.repository,
    // Proof: c28-assembly-runtime-capture; injected fault failed `captures package request caller and runtime fields before subscription aliases mutate`; restoration passed.
    runtime: { ...context.runtime, environment: { ...context.runtime.environment } },
    subscribeInterrupts: context.subscribeInterrupts,
  };
  const ownedDirectories: string[] = [];
  let first: 'SIGINT' | 'SIGTERM' | undefined;
  const unsubscribe = captureContext.subscribeInterrupts((signal) => {
    // Proof: c28-assembly-first; injected fault failed `retains first terminal package cancellation delivered during subscription release`; restoration passed.
    first ??= signal;
  });
  const cancellation = () =>
    first === undefined
      ? undefined
      : {
          kind: 'cancelled' as const,
          status: first === 'SIGINT' ? (130 as const) : (143 as const),
          ownedDirectories: [...ownedDirectories],
        };
  async function assemble() {
    const prior = cancellation();
    // Proof: c28-assembly-prior-cancel; injected fault failed `returns prior package cancellation before malformed revision or absent authority IO`; restoration passed.
    if (prior !== undefined) return prior;
    // Proof: c28-assembly-early-revision; Ordering control asserts Git marker absent before checking the early grammar diagnostic.; injected fault failed `refuses malformed package revision before any Git query capture install read or output`; restoration passed.
    if (selected.kind === 'committed' && !/^[0-9a-f]{40}$/u.test(selected.revision))
      throw new Error('PUNI package revision must be a full commit identity');
    const caller = realpathSync.native(callerDirectory);
    // Proof: c28-assembly-preflight-wire; Preflight wiring/order; otherwise the absent installation is read and loses supported-Git admission.; injected fault failed `requires supported Git before source capture install reads or package output`; restoration passed.
    const selection =
      selected.kind === 'committed'
        ? await readBuildSource(
            { repository: selected.repository, revision: selected.revision },
            { ...captureContext, callerDirectory: caller },
          )
        : await readWorkingBuildSource(
            { repository: selected.repository },
            { ...captureContext, callerDirectory: caller },
          );
    if (selection.kind === 'cancelled') {
      const interrupted = cancellation();
      // Proof: c28-assembly-owner-preflight; May produce a later TypeError or undefined outcome; exact assertion establishes controlled-owner refusal, not successful IO admission.; injected fault failed `refuses preflight cancellation without the owning package broker`; restoration passed.
      if (interrupted === undefined)
        throw new Error('PUNI package source selection stopped without owning interruption');
      return interrupted;
    }
    const installationDirectory = realpathSync.native(
      // Proof: c28-assembly-native-install; injected fault failed `packs and installs the captured PUNI package outside its checkout with protected startup and all three providers`; restoration passed.
      isAbsolute(selected.installationDirectory)
        ? selected.installationDirectory
        : caller + (caller.endsWith(sep) ? '' : sep) + selected.installationDirectory,
    );
    const captured = await (async () => {
      const sourceContext = {
        ...captureContext,
        // Proof: c28-assembly-capture-root; Relative interior caller/runtime distinction in actual capture, not a cleanliness/release claim.; injected fault failed `packs and installs the captured PUNI package outside its checkout with protected startup and all three providers`; restoration passed.
        repository: selection.directory,
      };
      if (selected.kind === 'working') {
        const observed = await captureWorkingSource(sourceContext);
        return observed.kind === 'cancelled'
          ? observed
          : { kind: 'working' as const, source: observed.source };
      }
      const observed = await captureCommittedSource(selected.revision, sourceContext);
      return observed.kind === 'cancelled'
        ? observed
        : { kind: 'committed' as const, source: observed.source };
    })();
    if (captured.kind === 'cancelled') {
      const interrupted = cancellation();
      // Proof: c28-assembly-owner-capture; May produce a later TypeError or undefined outcome; exact assertion establishes controlled-owner refusal, not successful IO admission.; injected fault failed `refuses capture cancellation without the owning package broker`; restoration passed.
      if (interrupted === undefined)
        throw new Error('PUNI package capture stopped without owning interruption');
      return interrupted;
    }
    const beforeDocuments = cancellation();
    if (beforeDocuments !== undefined) return beforeDocuments;
    const documents = documentation.map(([path, sourcePath]) => ({
      path,
      bytes: readCapturedBuildFile(captured.source, sourcePath),
    }));
    const produceAssets =
      captured.kind === 'committed'
        ? buildPuniAssets.bind(undefined, captured.source)
        : buildLocalPuniAssets.bind(undefined, captured.source);
    const built = await produceAssets(
      { work: selected.work, destination: selected.destination },
      {
        callerDirectory,
        // Proof: c28-assembly-protect-root; Actual absolute interior operand with sibling output must remain protected; capture still uses actual root.; injected fault failed `packs and installs the captured PUNI package outside its checkout with protected startup and all three providers`; restoration passed.
        sourceDirectory: selection.directory,
        installationDirectory,
        runtime: captureContext.runtime,
        subscribeInterrupts: captureContext.subscribeInterrupts,
      },
    );
    // Proof: c28-assembly-owned-assets; injected fault failed `stops metadata delivery after producer cancellation while retaining its owned roots`; restoration passed.
    ownedDirectories.push(...built.ownedDirectories);
    if (built.kind === 'cancelled') {
      const interrupted = cancellation();
      // Proof: c28-assembly-owner-assets; May produce a later TypeError or undefined outcome; exact assertion establishes controlled-owner refusal, not successful IO admission.; injected fault failed `refuses assets cancellation without the owning package broker`; restoration passed.
      if (interrupted === undefined)
        throw new Error('PUNI package assets stopped without owning interruption');
      return interrupted;
    }
    const packageDirectory = dirname(dirname(built.toolkit.directory));
    const metadata = createPackageMetadata(Bun.version);
    for (const file of [{ path: 'package.json', bytes: metadata }, ...documents]) {
      const interrupted = cancellation();
      // Proof: c28-assembly-before-files; injected fault failed `stops metadata delivery after producer cancellation while retaining its owned roots` and 1 additional named controls; restoration passed.
      if (interrupted !== undefined) return interrupted;
      const path = join(packageDirectory, file.path);
      await writeFile(path, file.bytes, { flag: 'wx', mode: 0o444 });
      // Proof: c28-assembly-file-readback; injected fault failed `refuses broken package.json readback and retains package and work ownership` and 3 additional named controls; restoration passed.
      if (hashBytes(readBuildFile(path)) !== hashBytes(file.bytes))
        throw new Error('PUNI package file differs from captured/planned bytes: ' + file.path);
    }
    return cancellation() ?? built;
  }
  const settled = await assemble().then(
    (value) => ({ kind: 'fulfilled' as const, value }),
    (cause: unknown) => ({ kind: 'rejected' as const, cause }),
  );
  let release: { cause: unknown } | undefined;
  try {
    unsubscribe();
  } catch (cause) {
    release = { cause };
  }
  if (settled.kind === 'rejected') {
    const retained =
      settled.cause instanceof ToolkitBuildFailure
        ? // Proof: c28-assembly-nested-retention; injected fault failed `preserves producer-release failures and all retained package roots`; restoration passed.
          [...new Set([...ownedDirectories, ...settled.cause.ownedDirectories])]
        : [...ownedDirectories];
    throw new ToolkitBuildFailure(
      retained,
      release === undefined
        ? settled.cause
        : new AggregateError(
            // Proof: c28-assembly-paired-causes; injected fault failed `preserves both failures and all retained package roots`; restoration passed.
            [settled.cause, release.cause],
            'PUNI package assembly and release failed',
          ),
    );
  }
  // Proof: c28-assembly-release-failure; injected fault failed `preserves release failures and all retained package roots`; restoration passed.
  if (release !== undefined) throw new ToolkitBuildFailure([...ownedDirectories], release.cause);
  // Proof: c28-assembly-terminal; injected fault failed `retains first terminal package cancellation delivered during subscription release`; restoration passed.
  return cancellation() ?? settled.value;
}
