import { Buffer } from 'node:buffer';
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';

import type { InstalledRequest } from '../cli-parser';
import { OpaqueId } from '../contracts/records';
import { hashBytes } from '../evidence/content-manifest';
import { runLintChild } from '../lint-child';
import type { LintInterrupt } from '../lint-interrupts';
import { extractNxRelationshipsFromSource } from '../relationships/nx-core';
import { AuditStratum } from '../review/audit';
import { anchorPath } from '../validator-paths';
import { prepareBunActivation, selectActivation } from './activation';
import { dashCheckRunAuthority } from './check-run-authority';
import { planCheckRuns, readCheckRuns, retainCheckRuns } from './check-runs';
import { captureCommittedSource, type CommittedSource } from './committed-source';
import { reservePreparationDirectory } from './preparation-directory';
import { runPreparationGit } from './preparation-git';
import { type PreparationContext, readPreparationSource } from './preparation-source';
import { checkPreparedActivation } from './prepared-self-check';
import {
  assertPinnedRuntime,
  deriveToolIdentity,
  planRelocationActivation,
  planRelocationChecks,
  readRelocationPolicy,
  type RelocationSources,
} from './relocation-activation';
import { copyTrustedModules, hashTrustedModules } from './trusted-modules';

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
function readOperatorFile(path: string): Uint8Array {
  // Proof: prep-operator-regular; its recorded production-source fault failed `refuses a native FIFO review input within the bounded subprocess`; `refuses a native FIFO audit input within the bounded subprocess` and passed after restoration.
  if (!statSync(path).isFile())
    throw new Error('preparation operator input must be a regular file: ' + path);
  return readFileSync(path);
}
// Proof: prep-json-utf8; its recorded production-source fault failed `preserves review fatal UTF8 decoding instead of replacement JSON parsing`; `preserves audit fatal UTF8 decoding instead of replacement JSON parsing` and passed after restoration.
function readJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}
function readSourceFile(source: CommittedSource, path: string): Uint8Array {
  const entry = source.readSnapshot().entries.find((entry) => entry.path === path);
  // Proof: prep-captured-regular; its recorded production-source fault failed `refuses a captured symlink nx configuration before output reservation` and passed after restoration.
  if (entry === undefined || (entry.mode !== '100644' && entry.mode !== '100755'))
    throw new Error('preparation input must be a captured regular file: ' + path);
  return source.readFile(path);
}
function readProjects(source: CommittedSource) {
  const entries = source.readSnapshot().entries;
  readSourceFile(source, 'nx.json');
  return extractNxRelationshipsFromSource({
    projectPaths: () =>
      entries
        .filter(
          (entry) =>
            (entry.mode === '100644' || entry.mode === '100755') &&
            entry.path.split('/').at(-1) === 'project.json' &&
            !entry.path
              .split('/')
              .some((component) => component === '.git' || component === 'node_modules'),
        )
        .map((entry) => entry.path)
        .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))),
    read: (path) => readSourceFile(source, path),
  }).relationships.projects;
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
    const roles = join(work, 'roles');
    mkdirSync(roles, { mode: 0o700 });
    const writeRole = (name: string, bytes: Uint8Array) => {
      const path = join(roles, name);
      writeFileSync(path, bytes, { flag: 'wx', mode: 0o444 });
      return path;
    };
    const roleSources = {
      authority: writeRole('authority.json', plan.roles.authority),
      ciBinding: writeRole('ci-binding.json', plan.roles.ciBinding),
      evidence: writeRole('evidence.json', plan.roles.evidence),
      launcher: writeRole('launcher.mjs', toolkit.roleBytes['launcher.mjs']),
      localBinding: writeRole('local-binding.json', plan.roles.localBinding),
      mapping: writeRole('mapping.json', plan.roles.mapping),
      policy: writeRole('policy.json', plan.roles.policy),
      reviewReceipt: writeRole('review-receipt.json', plan.roles.reviewReceipt),
      snapshotter: writeRole('snapshotter.ts', toolkit.roleBytes['snapshotter.ts']),
      validator: writeRole('validator.mjs', toolkit.roleBytes['validator.mjs']),
    };
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
    const prepared = prepareBunActivation({
      candidateRepository: selection.candidateDirectory,
      destination: join(destination, 'activation-' + sha),
      roleSources,
      sourceRevision: sha,
      policyIdentity: plan.identities.policy,
      mappingIdentity: plan.identities.mapping,
      validatorIdentity: plan.identities.validator,
      reviewReceiptIdentity: plan.identities.reviewReceipt,
    });
    selectActivation(destination, prepared.directory, prepared.identity);
    const launcher = join(destination, 'bootstrap-launcher.mjs');
    writeFileSync(launcher, toolkit.roleBytes['launcher.mjs'], { flag: 'wx', mode: 0o555 });
    writeFileSync(join(destination, 'launcher-path'), 'bootstrap-launcher.mjs\n', {
      flag: 'wx',
      mode: 0o444,
    });
    writeFileSync(join(destination, 'active-v1'), 'tool-wiki-active-v1\n', {
      flag: 'wx',
      mode: 0o444,
    });
    writeFileSync(join(destination, 'toolkit-release'), toolkit.tag + ' ' + toolkit.digest + '\n', {
      flag: 'wx',
      mode: 0o444,
    });
    const closure = join(destination, 'trusted-node-modules');
    copyTrustedModules(
      closure,
      join(toolkit.directory, 'trusted-node-modules'),
      toolkit.trustedNodeModules,
    );
    if (
      // Proof: prep-closure-identity; its recorded production-source fault failed `refuses copied closure drift before launching self-certification` and passed after restoration.
      hashTrustedModules(closure) !==
      hashTrustedModules(join(toolkit.directory, 'trusted-node-modules'))
    )
      throw new Error('copied activation closure differs from selected toolkit');
    // Proof: prep-bootstrap-identity; its recorded production-source fault failed `refuses changed written bootstrap bytes before launching self-certification` and passed after restoration.
    if (hashBytes(readFileSync(launcher)) !== hashBytes(toolkit.roleBytes['launcher.mjs']))
      throw new Error('written bootstrap differs from selected toolkit');
    const scratch = join(work, 'scratch');
    mkdirSync(scratch, { mode: 0o700 });
    const certification = await checkPreparedActivation({
      launcher,
      callerDirectory: captured.callerDirectory,
      lookup: { directory: selection.runtime.directory, path },
      activationRoot: destination,
      scratchDirectory: scratch,
      repository: selection.candidateDirectory,
      revision: sha,
      launch: captured.launch,
      subscribeInterrupts: captured.subscribeInterrupts,
    });
    if (certification.kind === 'cancelled') {
      const cancelled = readCancellation();
      // Proof: prep-self-check-cancel-owner; its recorded production-source fault failed `refuses self-check dependency cancellation without the owning broker` and passed after restoration.
      if (cancelled === undefined)
        throw new Error('self-check cancellation missing from preparation broker');
      return cancelled;
    }
    const afterCertificate = readCancellation();
    // Proof: prep-after-certificate-cancel; its recorded production-source fault failed `does not reserve an archive after cancellation during completed self-check release` and passed after restoration.
    if (afterCertificate !== undefined) return afterCertificate;
    // Proof: prep-current-archive-name; its recorded production-source fault failed `reports only the current PUNI archive namespace` and passed after restoration.
    const proposed = join(work, 'puni-activation-' + sha.slice(0, 8) + '.tar');
    // Proof: prep-archive-exclusive; its recorded production-source fault failed `refuses an occupied archive without replacing its sentinel` and passed after restoration.
    const descriptor = await open(proposed, 'wx', 0o600);
    // Proof: prep-archive-ownership; its recorded production-source fault failed `retains actual archive ownership and write failure after descriptor settlement` and passed after restoration.
    archivePath = proposed;
    let failure: { cause: unknown } | undefined;
    try {
      // The existing child owner replays prior cancellation before spawning.
      const errors: Uint8Array[] = [];
      const archived = await runLintChild({
        argv: [
          'tar',
          '--create',
          '--sort=name',
          '--owner=0',
          '--group=0',
          '--numeric-owner',
          '--mtime=@' + committerEpoch,
          '--directory',
          destination,
          '--file',
          '-',
          '.',
        ],
        directory: selection.runtime.directory,
        environment: selection.runtime.environment,
        stage: 'preparation archive',
        stdin: undefined,
        stdout: () => ({ kind: 'written' }),
        stderr: (bytes) => {
          // Proof: prep-tar-diagnostics; its recorded production-source fault failed `retains failed native tar diagnostics and its closed empty archive` and passed after restoration.
          errors.push(bytes.slice());
          return { kind: 'written' };
        },
        subscribeInterrupts: captured.subscribeInterrupts,
      });
      // Proof: prep-archive-cancel-owner; its recorded production-source fault failed `refuses archive dependency cancellation without the owning broker` and passed after restoration.
      if (archived.kind === 'cancelled' && readCancellation() === undefined)
        throw new Error('archive cancellation missing from preparation broker');
      if (archived.kind === 'exited') {
        // Proof: prep-tar-status; its recorded production-source fault failed `retains failed native tar diagnostics and its closed empty archive` and passed after restoration.
        if (archived.status !== 0)
          throw new Error('cannot create activation archive: ' + Buffer.concat(errors).toString());
        // Proof: prep-write-cancel; its recorded production-source fault failed `skips archive payload writes after cancellation during settled tar subscription release` and passed after restoration.
        if (readCancellation() === undefined) await descriptor.writeFile(archived.stdout);
      }
    } catch (cause) {
      failure = { cause };
    }
    try {
      // Proof: prep-archive-await-close; its recorded production-source fault failed `keeps preparation pending until the opened native archive descriptor closes` and passed after restoration.
      await descriptor.close();
    } catch (cause) {
      // Proof: prep-archive-both-causes; its recorded production-source fault failed `retains actual archive ownership and write-and-close failure after descriptor settlement` and passed after restoration.
      if (failure !== undefined)
        throw new AggregateError([failure.cause, cause], 'archive operation and close failed', {
          cause,
        });
      throw cause;
    }
    // Proof: prep-archive-failure; its recorded production-source fault failed `retains actual archive ownership and write failure after descriptor settlement` and passed after restoration.
    if (failure !== undefined) throw failure.cause;
    const afterArchive = readCancellation();
    // Proof: prep-after-archive-cancel; its recorded production-source fault failed `returns cancellation after archive write and close without attempting a later unreadable hash` and passed after restoration.
    if (afterArchive !== undefined) return afterArchive;
    const archive = { path: proposed, digest: hashBytes(readFileSync(proposed)) };
    const lines = [
      'toolkit activation: ' + sha,
      'toolkit: ' + toolkit.tag + ' ' + toolkit.sourceRevision + ' (' + toolkit.digest + ')',
      'version directory: ' + prepared.directory,
      'manifest identity: ' + prepared.identity,
      'self-check: ' + Buffer.from(certification.report).toString(),
      'archive: ' + archive.path + '   sha256: ' + archive.digest,
    ];
    return {
      kind: 'prepared',
      ownedDirectories: [...ownedDirectories],
      versionDirectory: prepared.directory,
      identity: prepared.identity,
      archive,
      report: certification.report,
      lines,
    };
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
