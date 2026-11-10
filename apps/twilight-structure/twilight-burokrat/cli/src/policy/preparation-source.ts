import { Buffer } from 'node:buffer';
import { realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

import { runLintChild } from '../lint-child';
import type { SubscribeLintInterrupts } from '../lint-interrupts';
import type { LintRuntime } from '../lint-runtime';
import { readLintCandidate } from '../run-lint';
import { anchorPath } from '../validator-paths';
import { RelocationRefusal } from './relocation-refusal';
import { type BunToolkit, readBunToolkit } from './toolkit';

export interface PreparationSelection {
  readonly candidateRepository: string;
  readonly candidateSha: string;
}

/** Caller-authenticated package digest and independently frozen Git authority; no ambient selection. */
export interface PreparationContext {
  readonly callerDirectory: string;
  readonly toolkitDirectory: string;
  readonly expectedToolkitIdentity: string;
  readonly runtime: LintRuntime;
  readonly subscribeInterrupts: SubscribeLintInterrupts;
}

export type PreparationSource =
  | { readonly kind: 'cancelled'; readonly status: 130 | 143 }
  | {
      readonly kind: 'ready';
      readonly candidateDirectory: string;
      readonly sourceRevision: string;
      readonly toolkit: BunToolkit;
      readonly runtime: LintRuntime;
    };

function isWithin(root: string, path: string): boolean {
  const offset = relative(root, path);
  return (
    offset === '' || (offset !== '..' && !offset.startsWith('..' + sep) && !isAbsolute(offset))
  );
}
function assertExternal(candidate: string, path: string, subject: string): string {
  // Proof: prep-native-placement; `refuses candidate-contained launcher.mjs through physical selection` failed under its recorded source fault and passed after restoration.
  const canonical = realpathSync.native(path);
  // Proof: prep-external-containment; `refuses candidate-contained trusted-node-modules through physical selection` failed under its recorded source fault and passed after restoration.
  if (isWithin(candidate, canonical))
    throw new RelocationRefusal('R19', subject + ' must be outside the candidate repository');
  return canonical;
}
function readCommit(bytes: Uint8Array): string {
  // Proof: prep-commit-utf8; `preserves invalid UTF8 commit decoding failure` failed under its recorded source fault and passed after restoration.
  const revision = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\n$/u, '');
  // Proof: prep-commit-response; `refuses nonhex commit from successful committed revision query` failed under its recorded source fault and passed after restoration.
  if (!/^[0-9a-f]{40}$/u.test(revision))
    throw new RelocationRefusal('R1', 'candidate commit identity is malformed');
  return revision;
}
function assertNoGitlinks(bytes: Uint8Array): void {
  // Proof: prep-index-utf8; `preserves invalid UTF8 index decoding failure` failed under its recorded source fault and passed after restoration.
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  // Proof: prep-index-empty; `allows a real empty committed index with complete successful observations` failed under its recorded source fault and passed after restoration.
  if (text === '') return;
  // Proof: prep-index-terminator; `refuses unterminated index before status` failed under its recorded source fault and passed after restoration.
  if (!text.endsWith('\0'))
    throw new RelocationRefusal('R3', 'candidate index inventory lacks NUL terminator');
  for (const record of text.slice(0, -1).split('\0')) {
    // Proof: prep-index-stage; `refuses nonzero-stage gitlink before status` failed under its recorded source fault and passed after restoration.
    const fields =
      /^(100644|100755|120000|160000) [0-9a-f]{40}(?:[0-9a-f]{24})? [0-3]\t[\s\S]+$/u.exec(record);
    // Proof: prep-index-record; `refuses invalid index mode before status` failed under its recorded source fault and passed after restoration.
    if (fields === null)
      throw new RelocationRefusal('R3', 'candidate index inventory is malformed');
    // Proof: prep-index-gitlink; `refuses newly staged gitlink before nested filter execution` failed under its recorded source fault and passed after restoration.
    if (fields[1] === '160000')
      throw new RelocationRefusal('R3', 'current preparation does not support indexed gitlinks');
  }
}

/**
 * Select strict current toolkit authority before candidate Git work, then verify physical
 * placement, exact full commit/HEAD equality and Git-reported cleanliness. Every child uses
 * the caller-owned process/cancellation lane and explicit frozen environment. Effective working
 * filters and indexed submodules refuse before status can execute their programs. The caller
 * authenticates the expected package digest; this helper does not authenticate that package.
 * Git metadata and the selected runtime remain stable trusted prerequisites. No immutable tree,
 * output reservation, preparer execution or archive is produced by selection.
 * @throws RelocationRefusal for identity, placement, revision or cleanliness refusal; filesystem,
 * decoding, spawn and unconfirmed group-cleanup failures propagate without revision reclassification.
 */
export async function readPreparationSource(
  request: PreparationSelection,
  context: PreparationContext,
): Promise<PreparationSource> {
  // Proof: prep-request-capture; `captures request and runtime before the first owned await` failed under its recorded source fault and passed after restoration.
  const selection = { ...request },
    callerDirectory = context.callerDirectory,
    toolkitDirectory = context.toolkitDirectory,
    expectedToolkitIdentity = context.expectedToolkitIdentity,
    subscribeInterrupts = context.subscribeInterrupts;
  const runtime: LintRuntime = {
    directory: context.runtime.directory,
    // Proof: prep-environment-capture; `captures request and runtime before the first owned await` failed under its recorded source fault and passed after restoration.
    // Proof: prep-ambient-isolation; `selects exact committed HEAD through explicit independently frozen Git authority` failed under its recorded source fault and passed after restoration.
    environment: { ...context.runtime.environment },
  };
  const cancellation: { status: 130 | 143 | undefined } = { status: undefined };
  const unsubscribe = subscribeInterrupts((signal) => {
    cancellation.status ??= signal === 'SIGINT' ? 130 : 143;
  });
  unsubscribe();
  // Proof: prep-prior-cancel; `replays prior cancellation before reading absent toolkit or candidate` failed under its recorded source fault and passed after restoration.
  if (cancellation.status !== undefined) return { kind: 'cancelled', status: cancellation.status };
  // Proof: prep-format; `refuses legacy toolkit format before candidate-dependent Git IO` failed under its recorded source fault and passed after restoration.
  const toolkit = readBunToolkit(
    // Proof: prep-toolkit-native; `preserves native symlink-parent semantics for toolkit selection` failed under its recorded source fault and passed after restoration.
    realpathSync.native(anchorPath(toolkitDirectory, callerDirectory)),
  );
  if (
    // Proof: prep-expected-package; `refuses substituted toolkit digest before candidate-dependent Git IO` failed under its recorded source fault and passed after restoration.
    toolkit.digest !== expectedToolkitIdentity
  )
    throw new RelocationRefusal(
      'R19',
      'selected toolkit differs from authenticated package authority',
    );
  const candidate = await readLintCandidate(
    {
      version: 1,
      callerDirectory,
      request: {
        command: 'lint',
        kind: 'committed',
        repository: selection.candidateRepository,
        revision: selection.candidateSha,
      },
    },
    runtime,
    subscribeInterrupts,
  );
  // Proof: prep-cancel-version; `owns cancellation during version query and starts no later query` failed under its recorded source fault and passed after restoration.
  if (candidate.kind === 'cancelled') return candidate;
  const repository = candidate.directory;
  // Proof: prep-placement-runtime; `refuses candidate-contained runtime through physical selection` failed under its recorded source fault and passed after restoration.
  assertExternal(repository, runtime.directory, 'Git runtime cwd');
  // Proof: prep-placement-toolkit; `refuses candidate-contained toolkit through physical selection` failed under its recorded source fault and passed after restoration.
  assertExternal(repository, toolkit.directory, 'toolkit');
  // Proof: prep-placement-descriptor; `refuses candidate-contained toolkit.json through physical selection` failed under its recorded source fault and passed after restoration.
  assertExternal(repository, join(toolkit.directory, 'toolkit.json'), 'toolkit descriptor');
  for (const role of Object.keys(toolkit.roleBytes))
    // Proof: prep-placement-launcher.mjs; `refuses candidate-contained launcher.mjs through physical selection` failed under its recorded source fault and passed after restoration.
    // Proof: prep-placement-snapshotter.ts; `refuses candidate-contained snapshotter.ts through physical selection` failed under its recorded source fault and passed after restoration.
    // Proof: prep-placement-validator.mjs; `refuses candidate-contained validator.mjs through physical selection` failed under its recorded source fault and passed after restoration.
    // Proof: prep-placement-prepare-activation.mjs; `refuses candidate-contained prepare-activation.mjs through physical selection` failed under its recorded source fault and passed after restoration.
    // Proof: prep-placement-prepare-relocation-activation.mjs; `refuses candidate-contained prepare-relocation-activation.mjs through physical selection` failed under its recorded source fault and passed after restoration.
    assertExternal(repository, join(toolkit.directory, role), 'toolkit role ' + role);
  const closure = assertExternal(
    repository,
    join(toolkit.directory, 'trusted-node-modules'),
    'runtime closure',
  );
  // Proof: prep-closure-overlap; `refuses a runtime closure ancestor containing the actual candidate` failed under its recorded source fault and passed after restoration.
  if (isWithin(closure, repository))
    throw new RelocationRefusal('R19', 'runtime closure overlaps the candidate repository');
  // Proof: prep-full-revision; `refuses noncurrent full revision "HEAD"` failed under its recorded source fault and passed after restoration.
  if (!/^[0-9a-f]{40}$/u.test(selection.candidateSha))
    throw new RelocationRefusal('R1', 'candidate revision must be a full commit identity');
  async function git(argv: readonly string[]) {
    const errors: Uint8Array[] = [];
    const outcome = await runLintChild({
      argv: ['git', '-C', repository, ...argv],
      directory: runtime.directory,
      environment: runtime.environment,
      stage: 'preparation Git',
      stdin: undefined,
      stdout: () => ({ kind: 'written' }),
      stderr: (bytes) => {
        errors.push(bytes.slice());
        return { kind: 'written' };
      },
      subscribeInterrupts,
    });
    return { ...outcome, stderr: Buffer.concat(errors) };
  }
  const resolved = await git([
    'rev-parse',
    '--verify',
    '--end-of-options',
    selection.candidateSha + '^{commit}',
  ]);
  // Proof: prep-cancel-commit; `owns cancellation during commit query and starts no later query` failed under its recorded source fault and passed after restoration.
  if (resolved.kind === 'cancelled') return { kind: 'cancelled', status: resolved.status };
  // Proof: prep-resolved-status; `refuses failed commit query without treating it as an empty successful observation` failed under its recorded source fault and passed after restoration.
  if (resolved.status !== 0)
    throw new RelocationRefusal(
      'R1',
      'candidate revision is unknown: ' + Buffer.from(resolved.stderr).toString(),
    );
  const sourceRevision = readCommit(resolved.stdout);
  // Proof: prep-resolved-identity; `refuses substituted commit from successful committed revision query` failed under its recorded source fault and passed after restoration.
  if (sourceRevision !== selection.candidateSha)
    throw new RelocationRefusal('R1', 'resolved candidate commit differs from selected revision');
  const head = await git(['rev-parse', '--verify', '--end-of-options', 'HEAD^{commit}']);
  // Proof: prep-cancel-HEAD; `owns cancellation during HEAD query and starts no later query` failed under its recorded source fault and passed after restoration.
  if (head.kind === 'cancelled') return { kind: 'cancelled', status: head.status };
  // Proof: prep-head-status; `refuses failed HEAD query without treating it as an empty successful observation` failed under its recorded source fault and passed after restoration.
  if (head.status !== 0)
    throw new RelocationRefusal(
      'R2',
      'cannot resolve candidate HEAD: ' + Buffer.from(head.stderr).toString(),
    );
  // Proof: prep-head-identity; `refuses a real earlier commit instead of silently selecting current HEAD` failed under its recorded source fault and passed after restoration.
  if (readCommit(head.stdout) !== sourceRevision)
    throw new RelocationRefusal('R2', 'candidate HEAD differs from selected commit');
  const filters = await git([
    'config',
    '--null',
    '--get-regexp',
    '^filter[.].*[.](clean|process)$',
    '.+',
  ]);
  // Proof: prep-cancel-filters; `owns cancellation during filters query and starts no later query` failed under its recorded source fault and passed after restoration.
  if (filters.kind === 'cancelled') return { kind: 'cancelled', status: filters.status };
  // Proof: prep-filter-admission; `refuses actual clean filter before status can execute its sentinel` failed under its recorded source fault and passed after restoration.
  if (filters.status === 0)
    throw new RelocationRefusal('R3', 'preparation refuses configured Git clean/process filters');
  // Proof: prep-filter-query-status; `does not treat a failed filter configuration query as absent filters` failed under its recorded source fault and passed after restoration.
  if (filters.status !== 1)
    throw new RelocationRefusal(
      'R3',
      'cannot inspect preparation Git filter configuration: ' +
        Buffer.from(filters.stderr).toString(),
    );
  const index = await git(['ls-files', '--stage', '-z']);
  // Proof: prep-cancel-index; `owns cancellation during index query and starts no later query` failed under its recorded source fault and passed after restoration.
  if (index.kind === 'cancelled') return { kind: 'cancelled', status: index.status };
  // Proof: prep-index-status; `refuses failed index query without treating it as an empty successful observation` failed under its recorded source fault and passed after restoration.
  if (index.status !== 0)
    throw new RelocationRefusal(
      'R3',
      'cannot inspect candidate index: ' + Buffer.from(index.stderr).toString(),
    );
  assertNoGitlinks(index.stdout);
  const status = await git([
    'status',
    '--porcelain=v1',
    '-z',
    // Proof: prep-untracked-visibility; `refuses untracked dirt despite operator status configuration` failed under its recorded source fault and passed after restoration.
    '--untracked-files=all',
    '--ignore-submodules=none',
  ]);
  // Proof: prep-cancel-status; `owns cancellation during status query and starts no later query` failed under its recorded source fault and passed after restoration.
  if (status.kind === 'cancelled') return { kind: 'cancelled', status: status.status };
  // Proof: prep-status-query; `refuses failed status query without treating it as an empty successful observation` failed under its recorded source fault and passed after restoration.
  if (status.status !== 0)
    throw new RelocationRefusal(
      'R3',
      'cannot inspect candidate status: ' + Buffer.from(status.stderr).toString(),
    );
  // Proof: prep-status-dirty; `refuses tracked dirt despite operator status configuration` failed under its recorded source fault and passed after restoration.
  if (status.stdout.length !== 0) throw new RelocationRefusal('R3', 'candidate checkout is dirty');
  return { kind: 'ready', candidateDirectory: repository, sourceRevision, toolkit, runtime };
}
