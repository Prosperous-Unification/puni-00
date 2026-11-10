import { Buffer } from 'node:buffer';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';

import type { InstalledRequest } from '../cli-parser';
import { RelativePath } from '../contracts/records';
import { hashBytes } from '../evidence/content-manifest';
import type { LintInterrupt } from '../lint-interrupts';
import { anchorPath } from '../validator-paths';
import { verifyPreparationBase } from './activation';
import { dashCheckRunAuthority } from './check-run-authority';
import { planCheckRuns, readCheckRuns, retainCheckRuns } from './check-runs';
import { captureCommittedSource } from './committed-source';
import { materializeSource } from './materialized-source';
import { reservePreparationDirectory } from './preparation-directory';
import { runPreparationGit } from './preparation-git';
import { readJson, readOperatorFile, readProjects, readSourceFile } from './preparation-inputs';
import { buildPreparationRoles } from './preparation-roles';
import { type PreparationContext, readPreparationSource } from './preparation-source';
import { PreparationFailure, type PreparationOutcome } from './prepare-bun-toolkit';
import { assembleActivation, writeActivationRoles } from './prepared-activation';
import {
  assertPinnedRuntime,
  deriveToolIdentity,
  planRelocationActivation,
  planRelocationChecks,
  readRelocationPolicy,
  type RelocationSources,
} from './relocation-activation';

interface Context extends PreparationContext {
  readonly launch: (entrypoint: string) => readonly string[];
}
const BaseBinding = type({ pilotModuleMapping: type({ candidatePath: RelativePath }) });
/**
 * Prepare current Bun relocation from captured candidate/reviewed bytes and verified base3/4
 * lineage. Historical executable roles are verified but never executed. Build dependencies
 * come only from the authenticated current toolkit, while every new role comes from selected
 * source. Fresh roots, full self-certification and exclusive archive ownership share the
 * toolkit preparer's implementation. Original failures and all primary owned roots remain
 * inspectable; neither interruption nor errors delete partial output.
 */
export async function prepareBunRelocation(
  request: InstalledRequest<'prepare-relocation-activation'>,
  context: Context,
): Promise<PreparationOutcome> {
  // Proof: c26-relocation-request; injected fault failed `captures request and runtime authority before the first broker callback can mutate aliases`; the same named test(s) passed after restoration.
  const selected = { ...request };
  const captured: Context = {
    callerDirectory: context.callerDirectory,
    toolkitDirectory: context.toolkitDirectory,
    expectedToolkitIdentity: context.expectedToolkitIdentity,
    runtime: {
      directory: context.runtime.directory,
      // Proof: c26-relocation-runtime; injected fault failed `captures request and runtime authority before the first broker callback can mutate aliases`; the same named test(s) passed after restoration.
      environment: { ...context.runtime.environment },
    },
    launch: context.launch,
    subscribeInterrupts: context.subscribeInterrupts,
  };
  const ownedDirectories: string[] = [];
  let archivePath: string | undefined, first: LintInterrupt | undefined;
  const unsubscribe = captured.subscribeInterrupts((signal) => {
    // Proof: c26-relocation-first-reason; injected fault failed `honors first relocation cancellation during outer release after archive settlement`; the same named test(s) passed after restoration.
    first ??= signal;
  });
  const readCancellation = (): Extract<PreparationOutcome, { kind: 'cancelled' }> | undefined =>
    first === undefined
      ? undefined
      : {
          kind: 'cancelled',
          // Proof: c26-relocation-status; injected fault failed `returns prior relocation cancellation before reading absent candidate base and operator inputs`; the same named test(s) passed after restoration.
          status: first === 'SIGINT' ? 130 : 143,
          ownedDirectories: [...ownedDirectories],
          archive: archivePath,
        };
  function requireCancellation(
    subject: string,
  ): Extract<PreparationOutcome, { kind: 'cancelled' }> {
    const cancelled = readCancellation();
    // Proof: c26-relocation-cancel-owner; injected fault failed `refuses relocation source dependency cancellation without the owning broker`; `refuses relocation capture dependency cancellation without the owning broker`; `refuses relocation reviewed capture dependency cancellation without the owning broker`; `refuses relocation epoch dependency cancellation without the owning broker`; `refuses relocation materialization dependency cancellation without the owning broker`; `refuses relocation build dependency cancellation without the owning broker`; the same named test(s) passed after restoration.
    if (cancelled === undefined)
      throw new Error(subject + ' cancellation missing from preparation broker');
    return cancelled;
  }
  async function prepareRelocation(): Promise<PreparationOutcome> {
    const prior = readCancellation();
    // Proof: c26-relocation-prior; injected fault failed `returns prior relocation cancellation before reading absent candidate base and operator inputs`; the same named test(s) passed after restoration.
    if (prior !== undefined) return prior;
    const review = readJson(
      readOperatorFile(anchorPath(selected.reviewRecord, captured.callerDirectory)),
    );
    const selection = await readPreparationSource(
      { candidateRepository: selected.candidateRepository, candidateSha: selected.candidateSha },
      captured,
    );
    if (selection.kind === 'cancelled') return requireCancellation('relocation source');
    const environment: Readonly<Record<string, string | undefined>> = selection.runtime.environment,
      path = environment['PATH'];
    // Proof: c26-relocation-path; injected fault failed `refuses invalid selected relocation path authority before output reservation`; the same named test(s) passed after restoration.
    if (path === undefined) throw new Error('trusted preparation PATH is absent');
    const baseDirectory = realpathSync.native(
      anchorPath(selected.baseActivation, captured.callerDirectory),
    );
    const base = verifyPreparationBase(baseDirectory, selection.candidateDirectory);
    const readRole = (role: keyof typeof base.manifest.roles) =>
      readOperatorFile(join(base.directory, base.manifest.roles[role]));
    const binding = parseOrThrow(BaseBinding, readJson(readRole('ciBinding'))),
      mappingPath = binding.pilotModuleMapping.candidatePath;
    const basePolicy = readRole('policy'),
      baseMapping = readRole('mapping'),
      baseAuthority = readRole('authority');
    const gitContext = {
      repository: selection.candidateDirectory,
      runtime: selection.runtime,
      subscribeInterrupts: captured.subscribeInterrupts,
    };
    const candidate = await captureCommittedSource(selection.sourceRevision, gitContext);
    if (candidate.kind === 'cancelled') return requireCancellation('relocation capture');
    const source = candidate.source,
      sha = selection.sourceRevision,
      toolkit = selection.toolkit;
    assertPinnedRuntime(
      Bun.version,
      new TextDecoder('utf-8', { fatal: true }).decode(readSourceFile(source, '.bun-version')),
    );
    const policyBytes = readSourceFile(
        source,
        selected.candidatePolicy ?? 'docs/wiki-policy/bootstrap-policy.json',
      ),
      policy = readRelocationPolicy(policyBytes);
    const reviewed = await captureCommittedSource(policy.pilot.sourceRevision, gitContext);
    if (reviewed.kind === 'cancelled') return requireCancellation('relocation reviewed capture');
    const epoch = await runPreparationGit(['show', '--no-patch', '--format=%ct', sha], gitContext);
    if (epoch.kind === 'cancelled') return requireCancellation('relocation epoch');
    // Proof: c26-relocation-epoch-status; injected fault failed `refuses invalid selected relocation status authority before output reservation`; the same named test(s) passed after restoration.
    if (epoch.status !== 0)
      throw new Error(
        'cannot read candidate committer time: ' + Buffer.from(epoch.stderr).toString(),
      );
    // Proof: c26-relocation-epoch-utf8; injected fault failed `refuses invalid selected relocation utf8 authority before output reservation`; the same named test(s) passed after restoration.
    const committerEpoch = new TextDecoder('utf-8', { fatal: true })
      .decode(epoch.stdout)
      .replace(/\n$/u, '');
    // Proof: c26-relocation-epoch-grammar; injected fault failed `refuses invalid selected relocation grammar authority before output reservation`; the same named test(s) passed after restoration.
    if (!/^(0|[1-9][0-9]*)$/u.test(committerEpoch))
      throw new Error('candidate committer time is malformed');
    const ready = selection;
    async function reserveDirectory(destination: string): Promise<string | undefined> {
      let position: number | undefined;
      const reserved = await reservePreparationDirectory(destination, {
        callerDirectory: captured.callerDirectory,
        selection: ready,
        readCancellation,
        otherDirectories: [base.directory, ...ownedDirectories],
        recordOwnership: (directory) => {
          if (position === undefined) {
            position = ownedDirectories.length;
            ownedDirectories.push(directory);
          } else ownedDirectories[position] = directory;
        },
      });
      return reserved.kind === 'cancelled' ? undefined : reserved.directory;
    }
    const work = await reserveDirectory(selected.work);
    if (work === undefined) return requireCancellation('relocation work');
    const materialized = await materializeSource(source, join(work, 'candidate-source'), {
      callerDirectory: captured.callerDirectory,
      selection,
      subscribeInterrupts: captured.subscribeInterrupts,
    });
    if (materialized.kind === 'cancelled') return requireCancellation('relocation materialization');
    const entry =
      selected.validatorEntry ?? 'apps/twilight-structure/twilight-burokrat/cli/src/cli.ts';
    const executables = await buildPreparationRoles(source, {
      materializedDirectory: materialized.directory,
      toolkit,
      validatorEntry: entry,
      launcherEntry:
        selected.candidateLauncher ??
        'apps/twilight-structure/twilight-burokrat/cli/src/lint-cli.ts',
      subscribeInterrupts: captured.subscribeInterrupts,
    });
    if (executables.kind === 'cancelled') return requireCancellation('relocation build');
    const sources: RelocationSources = {
      base: {
        kind: 'base',
        policyBytes: basePolicy,
        mappingBytes: baseMapping,
        authorityBytes: baseAuthority,
        validatorIdentity: base.manifest.validatorIdentity,
        validatorEntry: entry,
      },
      candidate: {
        sha,
        tree: source.readSnapshot(),
        reviewed: reviewed.source.readSnapshot(),
        policyBytes,
        mappingBytes: readSourceFile(source, mappingPath),
        mappingPath,
        declarations: (policy.relationshipRequest?.declarationPaths ?? []).map((path) => ({
          path,
          bytes: readSourceFile(source, path),
        })),
        validatorIdentity: hashBytes(executables.validator),
      },
    };
    const checks = planRelocationChecks(sources),
      projects = readProjects(source);
    const runs = retainCheckRuns(
      readCheckRuns(
        realpathSync.native(anchorPath(selected.checkRuns, captured.callerDirectory)),
        planCheckRuns(sha, checks, projects),
        dashCheckRunAuthority,
      ),
      work,
    );
    const plan = planRelocationActivation(sources, runs, review, {
      resourceLane: selected.resourceLane,
      cwdIdentity: selected.cwdIdentity,
      toolIdentity: deriveToolIdentity(readSourceFile(source, 'package.json'), Bun.version),
    });
    const roleSources = writeActivationRoles(plan, executables, work);
    const destination = await reserveDirectory(selected.destination);
    if (destination === undefined) return requireCancellation('relocation activation');
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
        heading: 'relocation activation',
        // Proof: c26-relocation-notice-forward; injected fault failed `delivers the prepared compiler license and modification notice inside the relocation archive`; the same named test(s) passed after restoration.
        notices: executables.notices,
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
    return {
      ...assembled,
      ownedDirectories: [...ownedDirectories],
      lines: [
        ...assembled.lines,
        'base activation: ' + base.manifest.sourceRevision + ' ' + base.identity,
      ],
    };
  }
  const settled = await prepareRelocation().then(
    (value) => ({ kind: 'fulfilled' as const, value }),
    (cause: unknown) => ({ kind: 'rejected' as const, cause }),
  );
  let release: { cause: unknown } | undefined;
  try {
    // Proof: c26-relocation-release; injected fault failed `preserves relocation subscription release failure after prior cancellation`; the same named test(s) passed after restoration.
    unsubscribe();
  } catch (cause) {
    release = { cause };
  }
  if (settled.kind === 'rejected') {
    const cause =
      release === undefined
        ? settled.cause
        : new AggregateError(
            // Proof: c26-relocation-both-causes; injected fault failed `preserves relocation input and release failures together ahead of interruption`; the same named test(s) passed after restoration.
            [settled.cause, release.cause],
            'relocation preparation and release failed',
            { cause: release.cause },
          );
    // Proof: c26-relocation-error-before-cancel; injected fault failed `preserves relocation input and release failures together ahead of interruption`; the same named test(s) passed after restoration.
    throw new PreparationFailure([...ownedDirectories], archivePath, cause);
  }
  // Proof: c26-relocation-release-failure; injected fault failed `preserves relocation subscription release failure after prior cancellation`; the same named test(s) passed after restoration.
  if (release !== undefined)
    throw new PreparationFailure([...ownedDirectories], archivePath, release.cause);
  // Proof: c26-relocation-terminal; injected fault failed `honors first relocation cancellation during outer release after archive settlement`; the same named test(s) passed after restoration.
  return readCancellation() ?? settled.value;
}
