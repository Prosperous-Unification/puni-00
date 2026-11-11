import { realpathSync } from 'node:fs';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { hashBytes } from '../evidence/content-manifest';
import type { LintInterrupt, SubscribeLintInterrupts } from '../lint-interrupts';
import type { LintRuntime } from '../lint-runtime';
import { readBuildDependencies } from './build-dependencies';
import { bunToolkitRoles, planBunToolkit } from './bun-release';
import type { CommittedSource } from './committed-source';
import { materializeProtectedSource } from './materialized-source';
import { reserveProtectedDirectory } from './preparation-directory';
import { readOperatorFile } from './preparation-inputs';
import { buildToolkitRoles } from './preparation-roles';
import { type BunToolkit, readBunToolkit } from './toolkit';
import { copyTrustedModules, hashTrustedModules } from './trusted-modules';

interface Context {
  readonly callerDirectory: string;
  readonly sourceDirectory: string;
  readonly installationDirectory: string;
  readonly runtime: LintRuntime;
  readonly subscribeInterrupts: SubscribeLintInterrupts;
}
interface Request {
  readonly tag: string;
  readonly work: string;
  readonly destination: string;
}
type Outcome =
  | {
      readonly kind: 'cancelled';
      readonly status: 130 | 143;
      readonly ownedDirectories: readonly string[];
    }
  | {
      readonly kind: 'built';
      readonly toolkit: BunToolkit;
      readonly ownedDirectories: readonly string[];
    };

/** Every owned partial root is retained, including nested materialization causes. */
export class ToolkitBuildFailure extends Error {
  constructor(
    readonly ownedDirectories: readonly string[],
    cause: unknown,
  ) {
    super('Bun toolkit build failed; retained directories: ' + ownedDirectories.join(', '), {
      cause,
    });
    this.name = 'ToolkitBuildFailure';
  }
}

/**
 * Produce all five current roles and their exact closure in fresh external private roots.
 * Source is already captured; the caller supplies its protected origin and an explicitly trusted
 * stable host installation. This internal build establishes byte identity and usability, not a
 * clean release checkout or publication authority. No package-manager/candidate helper executes.
 * Cancellation and failed IO settle before return; owned roots are retained, never deleted.
 * @throws ToolkitBuildFailure with original/aggregate causes and every known owned root.
 */
export async function buildBunToolkit(
  source: CommittedSource,
  request: Request,
  context: Context,
): Promise<Outcome> {
  const selected = { ...request },
    callerDirectory = context.callerDirectory,
    sourceDirectory = context.sourceDirectory,
    installationDirectory = context.installationDirectory,
    runtimeDirectory = context.runtime.directory,
    subscribeInterrupts = context.subscribeInterrupts;
  const ownedDirectories: string[] = [];
  let first: LintInterrupt | undefined;
  const unsubscribe = subscribeInterrupts((signal) => {
    // Proof: c27-producer-first; injected fault failed `retains the first terminal producer cancellation after complete delivery and subscription release`; restoration passed.
    first ??= signal;
  });
  const readCancellation = (): Extract<Outcome, { kind: 'cancelled' }> | undefined =>
    first === undefined
      ? undefined
      : {
          kind: 'cancelled',
          status: first === 'SIGINT' ? 130 : 143,
          ownedDirectories: [...ownedDirectories],
        };
  async function produce(): Promise<Outcome> {
    const prior = readCancellation();
    // Proof: c27-producer-prior; injected fault failed `returns producer prior cancellation before absent authority and output IO`; restoration passed.
    if (prior !== undefined) return prior;
    const snapshot = source.readSnapshot();
    // Proof: c27-producer-committed; ordering/diagnostic: noncommitted selection otherwise reaches absent installation refusal; injected fault failed `refuses a noncommitted source selection before producer authority and output IO`; restoration passed.
    if (snapshot.selection.kind !== 'committed')
      throw new Error('toolkit producer requires a committed source capture');
    const sourceRevision = snapshot.selection.revision;
    const dependencies = readBuildDependencies(source, installationDirectory);
    const protectedPaths = [
      realpathSync.native(sourceDirectory),
      realpathSync.native(runtimeDirectory),
      realpathSync.native(process.execPath),
      // Proof: c27s-producer-protect-installation; one independently physical authority target removed; all other protection targets retained; injected fault failed `independently protects producer native installation authority before output ownership`; restoration passed.
      // Proof: c27s-producer-protect-closure; one independently physical authority target removed; all other protection targets retained; injected fault failed `independently protects producer native closure authority before output ownership`; restoration passed.
      ...dependencies.protectedPaths,
    ];
    async function reserve(destination: string): Promise<string | undefined> {
      let position: number | undefined;
      const reservation = await reserveProtectedDirectory(destination, {
        callerDirectory,
        protectedPaths,
        otherDirectories: ownedDirectories,
        readCancellation,
        recordOwnership(directory) {
          if (position === undefined) {
            position = ownedDirectories.length;
            ownedDirectories.push(directory);
          } else ownedDirectories[position] = directory;
        },
      });
      return reservation.kind === 'cancelled' ? undefined : reservation.directory;
    }
    const work = await reserve(selected.work);
    if (work === undefined) {
      const cancellation = readCancellation();
      // Proof: c27-producer-owner-work; injected fault failed `refuses producer work dependency cancellation without the owning broker`; restoration passed.
      if (cancellation === undefined)
        throw new Error('toolkit work reservation stopped without cancellation');
      return cancellation;
    }
    const destination = await reserve(selected.destination);
    if (destination === undefined) {
      const cancellation = readCancellation();
      // Proof: c27-producer-owner-destination; injected fault failed `refuses producer destination dependency cancellation without the owning broker`; restoration passed.
      if (cancellation === undefined)
        throw new Error('toolkit destination reservation stopped without cancellation');
      return cancellation;
    }
    const materialized = await materializeProtectedSource(source, join(work, 'source'), {
      callerDirectory,
      protectedPaths,
      subscribeInterrupts,
    });
    if (materialized.kind === 'cancelled') {
      const cancellation = readCancellation();
      // Proof: c27-producer-owner-materialization; injected fault failed `refuses producer materialization dependency cancellation without the owning broker`; restoration passed.
      if (cancellation === undefined)
        throw new Error('toolkit materialization stopped without owner cancellation');
      return cancellation;
    }
    const provider = 'apps/twilight-structure/twilight-burokrat/cli/src/';
    const built = await buildToolkitRoles(source, {
      materializedDirectory: materialized.directory,
      dependencies,
      subscribeInterrupts,
      entries: {
        'launcher.mjs': provider + 'lint-cli.ts',
        'snapshotter.ts': provider + 'policy/snapshot-validator.ts',
        'validator.mjs': provider + 'cli.ts',
        'prepare-activation.mjs': provider + 'policy/prepare-activation-entry.ts',
        'prepare-relocation-activation.mjs': provider + 'policy/prepare-relocation-entry.ts',
      },
    });
    if (built.kind === 'cancelled') {
      const cancellation = readCancellation();
      // Proof: c27-producer-owner-roles; injected fault failed `refuses producer roles dependency cancellation without the owning broker`; restoration passed.
      if (cancellation === undefined)
        throw new Error('toolkit role build stopped without owner cancellation');
      return cancellation;
    }
    const beforeCopy = readCancellation();
    // Proof: c27-producer-before-copy; injected fault failed `retains producer roots after cancellation following actual settled role building`; restoration passed.
    if (beforeCopy !== undefined) return beforeCopy;
    const closure = join(destination, 'trusted-node-modules');
    copyTrustedModules(closure, join(materialized.directory, 'node_modules'), dependencies.names);
    const identity = hashTrustedModules(closure);
    // Proof: c27-producer-closure-copy; injected fault failed `refuses delivery closure drift after the authenticated build copy settles`; restoration passed.
    if (identity !== dependencies.identity)
      throw new Error('toolkit delivery dependency copy differs from admitted closure');
    const plan = planBunToolkit({
      tag: selected.tag,
      sourceRevision,
      bunVersion: dependencies.bunVersion,
      roleBytes: built.roleBytes,
      trustedNodeModules: dependencies.names,
      trustedNodeModulesIdentity: identity,
    });
    const files = [
      ...bunToolkitRoles.map((role) => ({
        path: role,
        bytes: built.roleBytes[role],
        executable:
          role === 'launcher.mjs' ||
          role === 'prepare-activation.mjs' ||
          role === 'prepare-relocation-activation.mjs',
      })),
      ...built.notices.map((notice) => ({ ...notice, executable: false })),
      { path: 'toolkit.json', bytes: plan.descriptor, executable: false },
      { path: 'SHA256SUMS', bytes: plan.checksums, executable: false },
    ];
    const directories = new Set<string>([destination]);
    for (const file of files) {
      const cancellation = readCancellation();
      // Proof: c27s-producer-file-cancel; injected fault failed `retains producer cancellation recorded by settled delivered launcher.mjs before later delivery or success`; restoration passed.
      if (cancellation !== undefined) return cancellation;
      const path = join(destination, file.path),
        parent = dirname(path);
      if (!directories.has(parent)) {
        await mkdir(parent, { recursive: true, mode: 0o700 });
        directories.add(parent);
      }
      await writeFile(path, file.bytes, { flag: 'wx', mode: 0o600 });
      await chmod(path, file.executable ? 0o555 : 0o444);
      // Proof: c27-delivered-file-readback; six actual changed/omitted license, notice and checksum controls returned built before readback and passed after restoration.
      // Proof: c27-producer-file-readback; injected fault failed `refuses changed delivered licenses/typescript-preparation/LICENSE.txt before claiming a built toolkit` and 2 additional named controls; restoration passed.
      if (hashBytes(readOperatorFile(path)) !== hashBytes(file.bytes))
        throw new Error('delivered toolkit file differs from planned bytes: ' + file.path);
    }
    const cancellation = readCancellation();
    // Proof: c27s-producer-final-cancel; ordering before fallible next-stage verification after recorded cancellation; injected fault failed `stops producer before fallible final verification after last delivered-file cancellation`; restoration passed.
    if (cancellation !== undefined) return cancellation;
    const toolkit = readBunToolkit(destination);
    // Proof: c27-delivered-toolkit-identity; substituting a self-consistent descriptor during native write settlement returned success before this comparison; the focused test passed after restoration.
    // Proof: c27-producer-delivered-identity; injected fault failed `refuses a self-consistent delivered toolkit descriptor substituted after its earlier readback`; restoration passed.
    if (toolkit.digest !== hashBytes(plan.descriptor))
      throw new Error('delivered toolkit identity differs from planned bytes');
    return { kind: 'built', toolkit, ownedDirectories: [...ownedDirectories] };
  }
  const settled = await produce().then(
    (value) => ({ kind: 'fulfilled' as const, value }),
    (cause: unknown) => ({ kind: 'rejected' as const, cause }),
  );
  let release: { cause: unknown } | undefined;
  try {
    unsubscribe();
  } catch (cause) {
    release = { cause };
  }
  if (settled.kind === 'rejected')
    throw new ToolkitBuildFailure(
      [...ownedDirectories],
      release === undefined
        ? settled.cause
        : new AggregateError(
            [settled.cause, release.cause],
            'toolkit build and interruption release failed',
            { cause: release.cause },
          ),
    );
  // Proof: c27-producer-release; injected fault failed `preserves producer release failure over cancellation with build failure false`; restoration passed.
  if (release !== undefined) throw new ToolkitBuildFailure([...ownedDirectories], release.cause);
  // Proof: c27-producer-terminal; injected fault failed `retains the first terminal producer cancellation after complete delivery and subscription release`; restoration passed.
  return readCancellation() ?? settled.value;
}
