import { Buffer } from 'node:buffer';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { hashBytes } from '../evidence/content-manifest';
import { runLintChild } from '../lint-child';
import type { SubscribeLintInterrupts } from '../lint-interrupts';
import type { LintRuntime } from '../lint-runtime';
import {
  type PrepareActivationRequest,
  prepareBunActivation,
  selectActivation,
} from './activation';
import { checkPreparedActivation } from './prepared-self-check';
import type { RelocationPlan } from './relocation-activation';
import type { BunToolkit } from './toolkit';
import { copyTrustedModules, hashTrustedModules } from './trusted-modules';

export interface ExecutableRoles {
  readonly launcher: Uint8Array;
  readonly snapshotter: Uint8Array;
  readonly validator: Uint8Array;
}
export interface PreparationNotice {
  readonly path:
    'licenses/typescript-preparation/LICENSE.txt' | 'licenses/typescript-preparation/NOTICE';
  readonly bytes: Uint8Array;
}
interface Context {
  readonly callerDirectory: string;
  readonly runtime: LintRuntime;
  readonly path: string;
  readonly launch: (entrypoint: string) => readonly string[];
  readonly subscribeInterrupts: SubscribeLintInterrupts;
  readonly readCancellation: () =>
    { readonly kind: 'cancelled'; readonly status: 130 | 143 } | undefined;
  readonly recordArchive: (path: string) => void;
}
interface Request {
  readonly candidateDirectory: string;
  readonly sha: string;
  readonly work: string;
  readonly destination: string;
  readonly plan: RelocationPlan;
  readonly roleSources: PrepareActivationRequest['roleSources'];
  readonly launcherBytes: Uint8Array;
  readonly toolkit: BunToolkit;
  readonly committerEpoch: string;
  readonly heading: 'toolkit activation' | 'relocation activation';
  readonly notices: readonly PreparationNotice[];
}
type Outcome =
  | { readonly kind: 'cancelled'; readonly status: 130 | 143 }
  | {
      readonly kind: 'prepared';
      readonly versionDirectory: string;
      readonly identity: string;
      readonly archive: { readonly path: string; readonly digest: string };
      readonly report: Uint8Array;
      readonly lines: readonly string[];
    };

/** Write plan and executable roles only under the caller's freshly owned work root. */
export function writeActivationRoles(
  plan: RelocationPlan,
  executables: ExecutableRoles,
  work: string,
): PrepareActivationRequest['roleSources'] {
  const roles = join(work, 'roles');
  mkdirSync(roles, { mode: 0o700 });
  const writeRole = (name: string, bytes: Uint8Array) => {
    const path = join(roles, name);
    writeFileSync(path, bytes, { flag: 'wx', mode: 0o444 });
    return path;
  };
  return {
    authority: writeRole('authority.json', plan.roles.authority),
    ciBinding: writeRole('ci-binding.json', plan.roles.ciBinding),
    evidence: writeRole('evidence.json', plan.roles.evidence),
    launcher: writeRole('launcher.mjs', executables.launcher),
    localBinding: writeRole('local-binding.json', plan.roles.localBinding),
    mapping: writeRole('mapping.json', plan.roles.mapping),
    policy: writeRole('policy.json', plan.roles.policy),
    reviewReceipt: writeRole('review-receipt.json', plan.roles.reviewReceipt),
    snapshotter: writeRole('snapshotter.ts', executables.snapshotter),
    validator: writeRole('validator.mjs', executables.validator),
  };
}

/**
 * Assemble an activation in borrowed fresh roots, deliver required notices, certify with the
 * actual selected Bun launcher, then settle exclusive archive write/close before success.
 * The caller owns interruption, roots, archive identity and final release/error aggregation.
 */
export async function assembleActivation(request: Request, context: Context): Promise<Outcome> {
  const {
    candidateDirectory,
    sha,
    work,
    destination,
    plan,
    roleSources,
    launcherBytes,
    toolkit,
    committerEpoch,
    heading,
    notices,
  } = request;
  const { readCancellation, path } = context;
  const prior = readCancellation();
  // Proof: c26-assembly-prior-cancel; injected fault failed `retains relocation roots and stops after interrupted destination reservation`; the same named test(s) passed after restoration.
  if (prior !== undefined) return prior;
  const prepared = prepareBunActivation({
    candidateRepository: candidateDirectory,
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
  writeFileSync(launcher, launcherBytes, { flag: 'wx', mode: 0o555 });
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
  if (hashBytes(readFileSync(launcher)) !== hashBytes(launcherBytes))
    throw new Error('written bootstrap differs from selected toolkit');
  for (const notice of notices) {
    const target = join(destination, notice.path);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    writeFileSync(target, notice.bytes, { flag: 'wx', mode: 0o444 });
    // Proof: c26-notice-readback; injected fault failed `refuses written compiler notice drift before certification and archive reservation`; the same named test(s) passed after restoration.
    if (hashBytes(readFileSync(target)) !== hashBytes(notice.bytes))
      throw new Error('written preparation notice differs: ' + notice.path);
  }
  const scratch = join(work, 'scratch');
  mkdirSync(scratch, { mode: 0o700 });
  const certification = await checkPreparedActivation({
    launcher,
    callerDirectory: context.callerDirectory,
    lookup: { directory: context.runtime.directory, path },
    activationRoot: destination,
    scratchDirectory: scratch,
    repository: candidateDirectory,
    revision: sha,
    launch: context.launch,
    subscribeInterrupts: context.subscribeInterrupts,
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
  context.recordArchive(proposed);
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
      directory: context.runtime.directory,
      environment: context.runtime.environment,
      stage: 'preparation archive',
      stdin: undefined,
      stdout: () => ({ kind: 'written' }),
      stderr: (bytes) => {
        // Proof: prep-tar-diagnostics; its recorded production-source fault failed `retains failed native tar diagnostics and its closed empty archive` and passed after restoration.
        errors.push(bytes.slice());
        return { kind: 'written' };
      },
      subscribeInterrupts: context.subscribeInterrupts,
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
    heading + ': ' + sha,
    'toolkit: ' + toolkit.tag + ' ' + toolkit.sourceRevision + ' (' + toolkit.digest + ')',
    'version directory: ' + prepared.directory,
    'manifest identity: ' + prepared.identity,
    'self-check: ' + Buffer.from(certification.report).toString(),
    'archive: ' + archive.path + '   sha256: ' + archive.digest,
  ];
  return {
    kind: 'prepared',
    versionDirectory: prepared.directory,
    identity: prepared.identity,
    archive,
    report: certification.report,
    lines,
  };
}
