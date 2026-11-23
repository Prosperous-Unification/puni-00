import { Buffer } from 'node:buffer';
import { realpathSync } from 'node:fs';

import { parseOrThrow, type } from '@shared/validation';

import type { InstalledRequest } from '../cli-parser';
import { OpaqueId } from '../contracts/records';
import { hashBytes } from '../evidence/content-manifest';
import type { LintInterrupt } from '../lint-interrupts';
import { AuditStratum } from '../review/audit';
import { anchorPath } from '../validator-paths';
import { dashCheckRunAuthority } from './check-run-authority';
import { planCheckRuns, readCheckRuns, retainCheckRuns } from './check-runs';
import { captureCommittedSource } from './committed-source';
import { reservePreparationDirectory } from './preparation-directory';
import { runPreparationGit } from './preparation-git';
import { readJson, readOperatorFile, readProjects, readSourceFile } from './preparation-inputs';
import { readPreparationNotices } from './preparation-notices';
import { type PreparationContext, readPreparationSource } from './preparation-source';
import { assembleActivation, writeActivationRoles } from './prepared-activation';
import {
  assertPinnedRuntime,
  deriveToolIdentity,
  planRelocationActivation,
  planRelocationChecks,
  readRelocationPolicy,
  type RelocationSources,
} from './relocation-activation';

const AuditStrataFile = type({
  strata: AuditStratum.array(),
  obligations: type({ '[string]': OpaqueId }),
}).onUndeclaredKey('reject');
interface Context extends PreparationContext {
  readonly launch: (entrypoint: string) => readonly string[];
}
interface Archive {
  readonly path: string;
  readonly digest: string;
}
export type PreparationOutcome =
  | {
      readonly kind: 'cancelled';
      readonly status: 130 | 143;
      readonly ownedDirectories: readonly string[];
      readonly archive: string | undefined;
    }
  | {
      readonly kind: 'prepared';
      readonly ownedDirectories: readonly string[];
      readonly versionDirectory: string;
      readonly identity: string;
      readonly archive: Archive;
      readonly report: Uint8Array;
      readonly lines: readonly string[];
    };

/** Every owned partial directory/archive is retained; the original failure remains inspectable. */
export class PreparationFailure extends Error {
  constructor(
    readonly ownedDirectories: readonly string[],
    readonly archive: string | undefined,
    cause: unknown,
  ) {
    super(
      'Bun activation preparation failed; retained directories: ' +
        ownedDirectories.join(', ') +
        (archive === undefined ? '' : '; retained archive: ' + archive),
      { cause },
    );
    this.name = 'PreparationFailure';
  }
}
/**
 * Prepare a first current activation from strict toolkit2 and captured committed candidate/reviewed
 * bytes. Review and audit files are copied before owned awaits; the check ledger and its streams are judged at their later read boundary. Fresh external work and destination roots
 * never merge with prior state; generated roles/checks/scratch stay separate from captured source.
 * The actual Bun launcher must return a complete enforce certificate before any exclusive archive
 * is opened. Native tar uses the same owned child lifecycle and explicit environment; all archive
 * bytes and its descriptor settle before success. Partial roots and archives are never deleted.
 * Caller supplies one interruption broker and authenticated installed toolkit identity. Historical
 * entrypoints/defaults are unchanged. Stable toolkit/Git/runtime metadata remain prerequisites.
 * @throws PreparationFailure retaining original/aggregate causes and every known owned output.
 * Signal registration failure propagates before ownership.
 */
export async function prepareBunToolkit(
  request: InstalledRequest<'prepare-activation'>,
  context: Context,
): Promise<PreparationOutcome> {
  // Proof: prep-request-copy; its recorded production-source fault failed `captures request and runtime authority before the first broker callback can mutate aliases` and passed after restoration.
  const selected = { ...request };
  const captured: Context = {
    callerDirectory: context.callerDirectory,
    toolkitDirectory: context.toolkitDirectory,
    expectedToolkitIdentity: context.expectedToolkitIdentity,
    runtime: {
      directory: context.runtime.directory,
      // Proof: prep-environment-copy; its recorded production-source fault failed `captures request and runtime authority before the first broker callback can mutate aliases` and passed after restoration.
      environment: { ...context.runtime.environment },
    },
    subscribeInterrupts: context.subscribeInterrupts,
    launch: context.launch,
  };
  const ownedDirectories: string[] = [];
  let archivePath: string | undefined;
  let first: LintInterrupt | undefined;
  const unsubscribe = captured.subscribeInterrupts((signal) => {
    // Proof: prep-first-reason; its recorded production-source fault failed `cancels the actual tar group and closes the retained archive before returning first reason` and passed after restoration.
    first ??= signal;
  });
  const readCancellation = (): Extract<PreparationOutcome, { kind: 'cancelled' }> | undefined =>
    first === undefined
      ? undefined
      : {
          kind: 'cancelled',
          // Proof: prep-cancel-status; its recorded production-source fault failed `cancels the actual tar group and closes the retained archive before returning first reason` and passed after restoration.
          status: first === 'SIGINT' ? 130 : 143,
          ownedDirectories: [...ownedDirectories],
          archive: archivePath,
        };
  async function prepareActivation(): Promise<PreparationOutcome> {
    const prior = readCancellation();
    // Proof: prep-prior-cancel; its recorded production-source fault failed `returns prior preparation cancellation before reading absent source and leaves no outputs` and passed after restoration.
    if (prior !== undefined) return prior;
    const review = readJson(
      readOperatorFile(anchorPath(selected.reviewRecord, captured.callerDirectory)),
    );
    const strata = parseOrThrow(
      AuditStrataFile,
      readJson(readOperatorFile(anchorPath(selected.auditStrata, captured.callerDirectory))),
    );
    const selection = await readPreparationSource(
      { candidateRepository: selected.candidateRepository, candidateSha: selected.candidateSha },
      {
        ...captured,
        toolkitDirectory:
          selected.toolkit === undefined
            ? captured.toolkitDirectory
            : anchorPath(selected.toolkit, captured.callerDirectory),
      },
    );
    if (selection.kind === 'cancelled') {
      const cancelled = readCancellation();
      // Proof: prep-source-cancel-owner; its recorded production-source fault failed `refuses source dependency cancellation without the owning broker` and passed after restoration.
      if (cancelled === undefined)
        throw new Error('source cancellation missing from preparation broker');
      return cancelled;
    }
    const environment: Readonly<Record<string, string | undefined>> = selection.runtime.environment;
    const path = environment['PATH'];
    // Proof: prep-required-path; its recorded production-source fault failed `refuses invalid selected preparation path authority before output reservation` and passed after restoration.
    if (path === undefined) throw new Error('trusted preparation PATH is absent');
    const gitContext = {
      repository: selection.candidateDirectory,
      runtime: selection.runtime,
      subscribeInterrupts: captured.subscribeInterrupts,
    };
    const candidate = await captureCommittedSource(selection.sourceRevision, gitContext);
    if (candidate.kind === 'cancelled') {
      const cancelled = readCancellation();
      // Proof: prep-capture-cancel-owner; its recorded production-source fault failed `refuses capture dependency cancellation without the owning broker` and passed after restoration.
      if (cancelled === undefined)
        throw new Error('capture cancellation missing from preparation broker');
      return cancelled;
    }
    const source = candidate.source,
      sha = selection.sourceRevision,
      toolkit = selection.toolkit;
    // Proof: c27-normal-notice-delivery; injected fault failed `delivers derived pinned compiler notices in a normal prepared archive without trusting adjacent files`; restoration passed.
    const notices = readPreparationNotices(toolkit).notices;
    assertPinnedRuntime(
      Bun.version,
      new TextDecoder('utf-8', { fatal: true }).decode(readSourceFile(source, '.bun-version')),
    );
    const policyBytes = readSourceFile(source, selected.candidatePolicy),
      policy = readRelocationPolicy(policyBytes);
    const reviewed = await captureCommittedSource(policy.pilot.sourceRevision, gitContext);
    if (reviewed.kind === 'cancelled') {
      const cancelled = readCancellation();
      // Proof: prep-reviewed-capture-cancel-owner; its recorded production-source fault failed `refuses reviewed capture dependency cancellation without the owning broker` and passed after restoration.
      if (cancelled === undefined)
        throw new Error('reviewed capture cancellation missing from preparation broker');
      return cancelled;
    }
    const sources: RelocationSources = {
      base: {
        kind: 'toolkit',
        validatorIdentity: hashBytes(toolkit.roleBytes['validator.mjs']),
        strata: strata.strata,
        obligationStrata: strata.obligations,
      },
      candidate: {
        sha,
        tree: source.readSnapshot(),
        reviewed: reviewed.source.readSnapshot(),
        policyBytes,
        mappingBytes: readSourceFile(source, selected.candidateMapping),
        mappingPath: selected.candidateMapping,
        declarations: (policy.relationshipRequest?.declarationPaths ?? []).map((path) => ({
          path,
          bytes: readSourceFile(source, path),
        })),
        validatorIdentity: hashBytes(toolkit.roleBytes['validator.mjs']),
      },
    };
    const checks = planRelocationChecks(sources),
      projects = readProjects(source);
    const judged = readCheckRuns(
      // Proof: prep-check-directory-native; its recorded production-source fault failed `selects native check-run directory authority through alias parent components` and passed after restoration.
      realpathSync.native(anchorPath(selected.checkRuns, captured.callerDirectory)),
      planCheckRuns(sha, checks, projects),
      dashCheckRunAuthority,
    );
    const epoch = await runPreparationGit(['show', '--no-patch', '--format=%ct', sha], gitContext);
    if (epoch.kind === 'cancelled') {
      const cancelled = readCancellation();
      // Proof: prep-epoch-cancel-owner; its recorded production-source fault failed `refuses epoch dependency cancellation without the owning broker` and passed after restoration.
      if (cancelled === undefined)
        throw new Error('epoch cancellation missing from preparation broker');
      return cancelled;
    }
    // Proof: prep-epoch-status; its recorded production-source fault failed `refuses invalid selected preparation status authority before output reservation` and passed after restoration.
    if (epoch.status !== 0)
      throw new Error(
        'cannot read candidate committer time: ' + Buffer.from(epoch.stderr).toString(),
      );
    // Proof: prep-epoch-utf8; its recorded production-source fault failed `refuses invalid selected preparation utf8 authority before output reservation` and passed after restoration.
    const committerEpoch = new TextDecoder('utf-8', { fatal: true })
      .decode(epoch.stdout)
      .replace(/\n$/u, '');
    // Proof: prep-epoch-grammar; its recorded production-source fault failed `refuses invalid selected preparation grammar authority before output reservation` and passed after restoration.
    if (!/^(0|[1-9][0-9]*)$/u.test(committerEpoch))
      throw new Error('candidate committer time is malformed');
    const ready = selection;
    async function reserveDirectory(destination: string): Promise<string | undefined> {
      let position: number | undefined;
      const reservation = await reservePreparationDirectory(destination, {
        callerDirectory: captured.callerDirectory,
        selection: ready,
        readCancellation,
        otherDirectories: ownedDirectories,
        recordOwnership: (directory) => {
          if (position === undefined) {
            position = ownedDirectories.length;
            ownedDirectories.push(directory);
          } else ownedDirectories[position] = directory;
        },
      });
      return reservation.kind === 'cancelled' ? undefined : reservation.directory;
    }
    const work = await reserveDirectory(selected.work);
    if (work === undefined) {
      const cancelled = readCancellation();
      if (cancelled === undefined) throw new Error('work reservation stopped without cancellation');
      return cancelled;
    }
    const afterWork = readCancellation();
    // Proof: prep-after-work-cancel; its recorded production-source fault failed `stops preparation immediately after cancellation during work reservation` and passed after restoration.
    if (afterWork !== undefined) return afterWork;
    const runs = retainCheckRuns(judged, work);
    const plan = planRelocationActivation(sources, runs, review, {
      resourceLane: selected.resourceLane,
      cwdIdentity: selected.cwdIdentity,
      toolIdentity: deriveToolIdentity(readSourceFile(source, 'package.json'), Bun.version),
    });
    const executables = {
      launcher: toolkit.roleBytes['launcher.mjs'],
      snapshotter: toolkit.roleBytes['snapshotter.ts'],
      validator: toolkit.roleBytes['validator.mjs'],
    };
    const roleSources = writeActivationRoles(plan, executables, work);
    const destination = await reserveDirectory(selected.destination);
    if (destination === undefined) {
      const cancelled = readCancellation();
      if (cancelled === undefined)
        throw new Error('activation reservation stopped without cancellation');
      return cancelled;
    }
    const afterDestination = readCancellation();
    // Proof: prep-after-destination-cancel; its recorded production-source fault failed `stops preparation immediately after cancellation during destination reservation` and passed after restoration.
    if (afterDestination !== undefined) return afterDestination;
    const assembled = await assembleActivation(
      {
        candidateDirectory: selection.candidateDirectory,
        sha,
        work,
        destination,
        plan,
        roleSources,
        launcherBytes: executables.launcher,
        toolkit,
        committerEpoch,
        heading: 'toolkit activation',
        notices,
      },
      {
        callerDirectory: captured.callerDirectory,
        runtime: selection.runtime,
        path,
        launch: captured.launch,
        subscribeInterrupts: captured.subscribeInterrupts,
        readCancellation,
        recordArchive: (path) => {
          archivePath = path;
        },
      },
    );
    if (assembled.kind === 'cancelled')
      return { ...assembled, ownedDirectories: [...ownedDirectories], archive: archivePath };
    return { ...assembled, ownedDirectories: [...ownedDirectories] };
  }
  const settled = await prepareActivation().then(
    (value) => ({ kind: 'fulfilled' as const, value }),
    (cause: unknown) => ({ kind: 'rejected' as const, cause }),
  );
  let release: { cause: unknown } | undefined;
  try {
    // Proof: prep-release; its recorded production-source fault failed `preserves release failure after prior cancellation instead of reporting controlled success` and passed after restoration.
    unsubscribe();
  } catch (cause) {
    release = { cause };
  }
  if (settled.kind === 'rejected') {
    const cause =
      // Proof: prep-reject-both-causes; its recorded production-source fault failed `retains both preparation and terminal release causes without converting them to cancellation` and passed after restoration.
      release === undefined
        ? settled.cause
        : new AggregateError(
            [settled.cause, release.cause],
            'preparation and interruption release failed',
            { cause: release.cause },
          );
    // Proof: prep-reject-before-cancel; its recorded production-source fault failed `retains both preparation and terminal release causes without converting them to cancellation` and passed after restoration.
    throw new PreparationFailure([...ownedDirectories], archivePath, cause);
  }
  // Proof: prep-release-failure; its recorded production-source fault failed `preserves release failure after prior cancellation instead of reporting controlled success` and passed after restoration.
  if (release !== undefined)
    throw new PreparationFailure([...ownedDirectories], archivePath, release.cause);
  // Proof: prep-terminal-cancel; its recorded production-source fault failed `honors cancellation delivered during terminal subscription release after archive settlement` and passed after restoration.
  return readCancellation() ?? settled.value;
}
