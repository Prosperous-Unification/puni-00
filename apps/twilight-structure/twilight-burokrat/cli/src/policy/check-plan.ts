import { parseOrThrow, type } from '@shared/validation';

import { OpaqueId, RelationshipDeclaration, RelativePath } from '../contracts/records';
import { hashCanonical } from '../evidence/content-manifest';
import type { CandidateSnapshot } from '../inventory/read-candidate';
import { refuse } from './relocation-refusal';

export const GitIdentity = type(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/);

export const BoundarySelector = type({ kind: "'path'", value: RelativePath })
  .onUndeclaredKey('reject')
  .or(type({ kind: "'prefix'", value: RelativePath }).onUndeclaredKey('reject'));
export type BoundarySelectorValue = typeof BoundarySelector.infer;
export const ExactTuple = type({
  path: RelativePath,
  mode: "'100644'|'100755'|'120000'|'160000'",
  blob: GitIdentity,
}).onUndeclaredKey('reject');

/**
 * The fields a relocation reasons about, read out of a policy this command never activates by
 * itself: {@link planRelocationActivation} produces an activation whose own launcher parses the
 * same bytes with the complete schema in `trust.ts`, and refuses (`R20`) when they disagree.
 */
export const RelocationPolicyView = type({
  policyId: OpaqueId,
  boundaries: type({
    boundaryId: OpaqueId,
    selector: BoundarySelector,
    'sourceSelector?': BoundarySelector,
    baselineEntries: ExactTuple.array(),
    obligationIds: OpaqueId.array(),
  }).array(),
  obligations: type({
    obligationId: OpaqueId,
    boundaryId: OpaqueId,
    checkIds: OpaqueId.array(),
    reviewIds: OpaqueId.array(),
  }).array(),
  pilot: type({ sourceRevision: GitIdentity }),
  'relationshipRequest?': type({ 'declarationPaths?': RelativePath.array() }),
});
export type RelocationPolicy = typeof RelocationPolicyView.infer;

/** One candidate file read at the candidate revision, addressed by its repository-relative path. */
export interface CandidateFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

/**
 * Whether the resolved command reports skipped work on a channel this tool can read. `bun test`
 * prints a `N skip` / `N todo` summary and still exits 0; every other command family this policy
 * can name emits no skip channel at all, so an empty `skips` list is a contract-level claim about
 * the command rather than an observation — see docs/findings/checks-that-cannot-fail.md.
 */
export type SkipChannel = 'bun-test' | 'none';

export interface CheckCommand {
  readonly checkId: string;
  readonly command: string[];
  readonly skipChannel: SkipChannel;
  readonly skipProbe?: {
    readonly command: string;
    readonly project: string;
    readonly cwd?: string;
    readonly env: Readonly<Record<string, string>>;
  };
}

export interface SkipProbeInvocation {
  readonly command: string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
}

export interface CheckPlan {
  readonly checks: CheckCommand[];
  readonly candidateIdentity: string;
}

/** A check as the judge reads it back from Dash's check-run ledger (`policy/check-runs.ts`). */
export interface RecordedCheck {
  readonly checkId: string;
  readonly command: string[];
  readonly startedAt: string;
  readonly endedAt: string;
  readonly exitCode: number;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
  /**
   * The streams whose summary measures skipped work: the direct skip probe's when one ran,
   * otherwise the check's own. `stdout`/`stderr` concatenate every invocation as evidence, and
   * Nx may forward the same Bun summary the probe prints, so they would count it twice.
   */
  readonly measured: { readonly stdout: Uint8Array; readonly stderr: Uint8Array };
  readonly stdoutPath: string;
  readonly stderrPath: string;
}

export function parseJson(bytes: Uint8Array, subject: string): unknown {
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`${subject} is not UTF-8: ${detail}`, { cause });
  }
  try {
    return JSON.parse(source) as unknown;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`malformed ${subject}: ${detail}`, { cause });
  }
}

export function policyOf(
  bytes: Uint8Array,
  subject: string,
): { json: unknown; view: RelocationPolicy } {
  const json = parseJson(bytes, subject);
  return { json, view: parseOrThrow(RelocationPolicyView, json) };
}

/** Reads the relocation-relevant fields of a trusted policy the caller holds as exact bytes. */
export function readRelocationPolicy(bytes: Uint8Array): RelocationPolicy {
  return policyOf(bytes, 'candidate trusted policy JSON').view;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function orderedIds(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort();
}

export function policyCheckIds(policy: RelocationPolicy): string[] {
  return orderedIds(policy.obligations.flatMap(({ checkIds }) => checkIds));
}

/**
 * Resolves each obligation's checks to the executable command the candidate declares for it, at
 * the candidate revision and only through the declaration files the pinned policy names.
 * @throws {@link RelocationRefusal} `R15` when a check resolves to no executable `nx-target` fact.
 */
export function deriveCheckCommands(
  policy: RelocationPolicy,
  declarations: readonly CandidateFile[],
): CheckCommand[] {
  const facts = new Map<string, (typeof RelationshipDeclaration.infer)['facts'][number]>();
  for (const declaration of declarations) {
    const decoded = parseOrThrow(
      RelationshipDeclaration,
      parseJson(declaration.bytes, `relationship declaration ${declaration.path}`),
    );
    for (const fact of decoded.facts) facts.set(fact.factId, fact);
  }
  return policyCheckIds(policy).map((checkId) => {
    const fact = facts.get(checkId);
    // Proof: forcing this refusal false let a check with no declared target reach command
    // derivation; the R15 negative observed `undefined is not an object (evaluating
    // 'fact.project')` instead of this refusal.
    if (fact?.kind !== 'nx-target') {
      refuse('R15', `check has no executable nx-target fact: ${checkId}`);
    }
    const skipChannel = skipChannelOf(fact.expectedConfiguration);
    const options = isPlainObject(fact.expectedConfiguration)
      ? fact.expectedConfiguration['options']
      : undefined;
    const declaredCommand = isPlainObject(options) ? options['command'] : undefined;
    const declaredCwd = isPlainObject(options) ? options['cwd'] : undefined;
    const declaredEnvironment = isPlainObject(options) ? options['env'] : undefined;
    const env: Record<string, string> = {};
    if (declaredEnvironment !== undefined) {
      if (!isPlainObject(declaredEnvironment)) {
        refuse('R15', `check environment is not a string map: ${checkId}`);
      }
      for (const [name, value] of Object.entries(declaredEnvironment)) {
        if (typeof value !== 'string') {
          refuse('R15', `check environment is not a string map: ${checkId} (${name})`);
        }
        env[name] = value;
      }
    }
    return {
      checkId,
      command: [
        'bunx',
        'nx',
        'run',
        `${fact.project}:${fact.target}`,
        '--skip-nx-cache',
        '--outputStyle=stream-without-prefixes',
      ],
      skipChannel,
      ...(skipChannel === 'bun-test' && typeof declaredCommand === 'string'
        ? {
            skipProbe: {
              command: declaredCommand,
              project: fact.project,
              ...(typeof declaredCwd === 'string' ? { cwd: declaredCwd } : {}),
              env,
            },
          }
        : {}),
    };
  });
}

/** Resolve the declared Bun test command used to observe skips that Nx does not pipe reliably. */
export function resolveSkipProbe(
  check: CheckCommand,
  projects: readonly { name: string; root: string }[],
): SkipProbeInvocation | undefined {
  if (check.skipProbe === undefined) return undefined;
  const roots = projects
    .filter(({ name }) => name === check.skipProbe?.project)
    .map(({ root }) => root);
  // Proof: changing the skip fact's project to `missing` made the production preparation test
  // refuse here instead of running a guessed command from the repository root.
  if (roots.length !== 1) {
    refuse(
      'R15',
      `check skip probe project unresolved: ${check.checkId} (${check.skipProbe.project})`,
    );
  }
  const quotedRoot = `'${roots[0].replaceAll("'", "'\"'\"'")}'`;
  return {
    command: ['bash', '-c', check.skipProbe.command.replaceAll('{projectRoot}', quotedRoot)],
    cwd: check.skipProbe.cwd ?? '.',
    env: check.skipProbe.env,
  };
}

/**
 * Reads the skip channel out of the target configuration the pinned declarations file states.
 * The declaration is the reviewed record of what `nx run <project>:<target>` executes, and the
 * relationship extractor refuses a declaration that disagrees with the candidate's `project.json`.
 */
// Proof: returning `'none'` for every command left the skips unmeasured, and the Nx `bun test`
// target that reported one skipped test prepared, certified and tarred a complete activation;
// the skip negative expected exit 1 and received 0.
function skipChannelOf(expectedConfiguration: unknown): SkipChannel {
  const options = isPlainObject(expectedConfiguration)
    ? expectedConfiguration['options']
    : undefined;
  const command = isPlainObject(options) ? options['command'] : undefined;
  return typeof command === 'string' && /(?:^|\s|\/)bun\s+test(?:\s|$)/.test(command)
    ? 'bun-test'
    : 'none';
}

export function candidateIdentityOf(snapshot: CandidateSnapshot): string {
  return hashCanonical({
    selection: snapshot.selection,
    entries: snapshot.entries,
    untracked: snapshot.untracked,
  });
}

/**
 * The commands a candidate's policy and declarations select, and the identity of its tree: the
 * one derivation both Twilight Dash (to run the checks) and both preparers (to judge what Dash
 * recorded) use. Unlike {@link planRelocationChecks} it compares nothing with a base.
 * @throws {@link RelocationRefusal} `R15`.
 */
export function planCandidateChecks(candidate: {
  readonly policyBytes: Uint8Array;
  readonly declarations: readonly CandidateFile[];
  readonly tree: CandidateSnapshot;
}): CheckPlan {
  const policy = policyOf(candidate.policyBytes, 'candidate trusted policy JSON');
  return {
    checks: deriveCheckCommands(policy.view, candidate.declarations),
    candidateIdentity: candidateIdentityOf(candidate.tree),
  };
}
