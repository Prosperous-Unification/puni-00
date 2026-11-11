import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';

import { type InstalledRequest, readInstalledRequest } from '../cli-parser';
import { OpaqueId } from '../contracts/records';
import { hashBytes } from '../evidence/content-manifest';
import { readCandidate } from '../inventory/read-candidate';
import { extractNxRelationships } from '../relationships/nx';
import { AuditStratum } from '../review/audit';
import { prepareActivation, selectActivation } from './activation';
import { dashCheckRunAuthority } from './check-run-authority';
import { planCheckRuns, readCheckRuns, retainCheckRuns } from './check-runs';
import {
  assertPinnedRuntime,
  type CandidateFile,
  deriveToolIdentity,
  planRelocationActivation,
  planRelocationChecks,
  readRelocationPolicy,
  RelocationRefusal,
  type RelocationSources,
} from './relocation-activation';
import { readToolkit } from './toolkit';
import { copyTrustedModules, writeBytes } from './trusted-modules';

export { readToolkit, type Toolkit } from './toolkit';

/** The operator's audit stratum table: the risk this repository accepts, never derived from code. */
const AuditStrataFile = type({
  strata: AuditStratum.array(),
  obligations: type({ '[string]': OpaqueId }),
}).onUndeclaredKey('reject');

function git(repository: string, argv: string[], subject: string): Uint8Array {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...argv], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  if (invocation.exitCode !== 0) {
    throw new Error(`${subject}: ${invocation.stderr.toString('utf8').trim()}`);
  }
  return invocation.stdout;
}

function gitText(repository: string, argv: string[], subject: string): string {
  return new TextDecoder().decode(git(repository, argv, subject)).trim();
}

function showFile(repository: string, sha: string, path: string): Uint8Array {
  return git(repository, ['show', `${sha}:${path}`], `candidate file is absent at ${sha}: ${path}`);
}

function assertCommittedCandidate(repository: string, sha: string): void {
  try {
    gitText(
      repository,
      ['rev-parse', '--verify', '--end-of-options', `${sha}^{commit}`],
      'unknown',
    );
  } catch (cause) {
    throw new RelocationRefusal('R1', `candidate revision is unknown: ${sha}`, { cause });
  }
  const head = gitText(repository, ['rev-parse', 'HEAD'], 'cannot resolve candidate HEAD');
  if (head !== sha) {
    throw new RelocationRefusal(
      'R2',
      `candidate checkout is not at the candidate revision: HEAD ${head} != ${sha}`,
    );
  }
  const porcelain = new TextDecoder()
    .decode(git(repository, ['status', '--porcelain'], 'cannot read candidate status'))
    .split('\n')
    .filter((line) => line.length > 0);
  if (porcelain.length > 0) {
    throw new RelocationRefusal(
      'R3',
      `candidate checkout is dirty: ${porcelain
        .slice(0, 3)
        .map((line) => line.slice(3))
        .join(', ')}`,
    );
  }
}

function assertOutsideCandidate(repository: string, path: string, flag: string): string {
  const resolved = resolve(path);
  let ancestor = resolved;
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  const existing = existsSync(ancestor) ? realpathSync(ancestor) : ancestor;
  const offset = relative(repository, existing);
  const escapes = offset === '..' || offset.startsWith(`..${sep}`);
  if (offset === '' || (!escapes && !isAbsolute(offset))) {
    throw new RelocationRefusal('R3', `${flag} must be outside the candidate repository: ${path}`);
  }
  return resolved;
}

function selfCheck(destination: string, repository: string, sha: string): string {
  // The runtime override is scrubbed, not set: a consumer's `trusted-wiki.yml` sets only the
  // activation root and lets the launcher default the closure to `<root>/trusted-node-modules`, so
  // a self-check that supplied the path would prove a configuration no consumer ever runs. The
  // operator's own environment is scrubbed too, because it may carry one from an unrelated gate.
  const inherited = { ...process.env };
  delete inherited['TOOL_WIKI_TRUSTED_NODE_MODULES'];
  const invocation = Bun.spawnSync(
    ['bash', join(destination, 'bootstrap-launcher.sh'), 'committed', repository, sha],
    {
      env: {
        ...inherited,
        TOOL_WIKI_ACTIVATION_ROOT: destination,
        TOOL_WIKI_REQUIRE_CERTIFIED: '1',
      },
      stderr: 'pipe',
      stdout: 'pipe',
    },
  );
  const stdout = invocation.stdout.toString('utf8');
  const stderr = invocation.stderr.toString('utf8');
  const certified = ((): boolean => {
    try {
      return (JSON.parse(stdout) as { certified?: unknown }).certified === true;
    } catch {
      return false;
    }
  })();
  // Proof: forcing this refusal false tarred an activation the toolkit's own launcher had just
  // refused to certify; the R20 negative expected exit 1 and received 0.
  if (invocation.exitCode !== 0 || !certified) {
    throw new RelocationRefusal(
      'R20',
      `prepared activation is not certified by the toolkit launcher: ${stdout.trim() || stderr.trim()}`,
    );
  }
  return stdout.trim();
}

function archive(
  destination: string,
  sha: string,
  committerEpoch: string,
): { path: string; digest: string } {
  const path = resolve(destination, '..', `tool-wiki-activation-${sha.slice(0, 8)}.tar`);
  const invocation = Bun.spawnSync(
    [
      'tar',
      '--create',
      '--sort=name',
      '--owner=0',
      '--group=0',
      '--numeric-owner',
      `--mtime=@${committerEpoch}`,
      '--directory',
      destination,
      '--file',
      path,
      '.',
    ],
    { stderr: 'pipe', stdout: 'pipe' },
  );
  if (invocation.exitCode !== 0) {
    throw new Error(
      `cannot write the activation archive: ${invocation.stderr.toString('utf8').trim()}`,
    );
  }
  return { path, digest: hashBytes(readFileSync(path)) };
}

/**
 * Prepares a consumer repository's FIRST Tool Wiki activation from a released toolkit and the
 * consumer's own commit. The toolkit supplies launcher, snapshotter, validator and the TypeScript
 * runtime closure; this commit supplies policy, mapping and declarations; the operator supplies
 * the review record and the audit strata; Twilight Dash supplies the check runs it measured
 * (`--check-runs`), which this command judges and never repeats, so it reads no clock. Everything
 * else is derived and then proved by running the toolkit's own launcher to `certified: true`
 * before any archive is written.
 *
 * A release certifies nothing for a consumer — see
 * `docs/adr/0026-a-wiki-release-is-a-toolkit-not-a-certification.md`.
 * @throws {@link RelocationRefusal} `R1`-`R3`, `R10`, `R14`-`R17` and `R19`-`R21`, and
 * `CheckRunRefusal` (`check-runs.ts`) for check runs that do not prove the planned checks on this candidate.
 */
export function prepareToolkitActivation(
  argv: readonly string[],
  defaultToolkit?: string,
  expectedToolkitIdentity?: string,
): string[] {
  return prepareToolkit(
    readInstalledRequest('prepare-activation', ['prepare-activation', ...argv]),
    defaultToolkit,
    expectedToolkitIdentity,
  );
}

/** Prepare the typed selection against the verified installed toolkit, preserving identity checks. */
export function prepareToolkit(
  request: InstalledRequest<'prepare-activation'>,
  defaultToolkit?: string,
  expectedToolkitIdentity?: string,
): string[] {
  const toolkitPath = request.toolkit ?? defaultToolkit;
  // Proof: removing this check lets absent toolkit authority reach the repository reader;
  // the typed adapter negative loses its required-toolkit refusal before any authority read.
  if (toolkitPath === undefined) throw new Error('missing required flag: --toolkit');
  const options = {
    'candidate-repository': request.candidateRepository,
    'candidate-sha': request.candidateSha,
    toolkit: toolkitPath,
    'candidate-policy': request.candidatePolicy,
    'candidate-mapping': request.candidateMapping,
    'review-record': request.reviewRecord,
    'audit-strata': request.auditStrata,
    destination: request.destination,
    work: request.work,
    'resource-lane': request.resourceLane,
    'cwd-identity': request.cwdIdentity,
    'check-runs': request.checkRuns,
  };
  const repository = realpathSync(resolve(options['candidate-repository']));
  const sha = options['candidate-sha'];
  const destination = assertOutsideCandidate(repository, options.destination, '--destination');
  const work = assertOutsideCandidate(repository, options.work, '--work');
  if (existsSync(join(destination, 'selected.json'))) {
    throw new Error(`activation destination already selects a version: ${destination}`);
  }
  const toolkit = readToolkit(resolve(options.toolkit));
  // Proof: replacing this comparison with the selected digest let an explicit `--toolkit`
  // override substitute a different self-consistent toolkit for the one bound by the installed
  // package manifest; the override negative then prepared with the substituted toolkit.
  if (expectedToolkitIdentity !== undefined && toolkit.digest !== expectedToolkitIdentity) {
    throw new RelocationRefusal(
      'R19',
      `selected toolkit differs from package manifest: ${toolkit.digest} != ${expectedToolkitIdentity}`,
    );
  }
  assertCommittedCandidate(repository, sha);
  assertPinnedRuntime(
    Bun.version,
    new TextDecoder().decode(showFile(repository, sha, '.bun-version')),
  );
  const policyBytes = showFile(repository, sha, options['candidate-policy']);
  const policy = readRelocationPolicy(policyBytes);
  const mappingBytes = showFile(repository, sha, options['candidate-mapping']);
  const declarations: CandidateFile[] = (policy.relationshipRequest?.declarationPaths ?? []).map(
    (path) => ({ path, bytes: showFile(repository, sha, path) }),
  );
  const strataFile = parseOrThrow(
    AuditStrataFile,
    JSON.parse(readFileSync(resolve(options['audit-strata']), 'utf8')) as unknown,
  );
  const sources: RelocationSources = {
    base: {
      kind: 'toolkit',
      validatorIdentity: hashBytes(toolkit.roleBytes['validator.mjs']),
      strata: strataFile.strata,
      obligationStrata: strataFile.obligations,
    },
    candidate: {
      sha,
      tree: readCandidate(repository, { kind: 'committed', revision: sha }),
      reviewed: readCandidate(repository, {
        kind: 'committed',
        revision: policy.pilot.sourceRevision,
      }),
      policyBytes,
      mappingBytes,
      mappingPath: options['candidate-mapping'],
      declarations,
      validatorIdentity: hashBytes(toolkit.roleBytes['validator.mjs']),
    },
  };
  const checks = planRelocationChecks(sources);
  const projects = extractNxRelationships(repository).relationships.projects;
  const runs = retainCheckRuns(
    readCheckRuns(
      resolve(options['check-runs']),
      planCheckRuns(sha, checks, projects),
      dashCheckRunAuthority,
    ),
    work,
  );
  const plan = planRelocationActivation(
    sources,
    runs,
    JSON.parse(readFileSync(resolve(options['review-record']), 'utf8')) as unknown,
    {
      resourceLane: options['resource-lane'],
      cwdIdentity: options['cwd-identity'],
      toolIdentity: deriveToolIdentity(showFile(repository, sha, 'package.json'), Bun.version),
    },
  );
  const roles = join(work, 'roles');
  const roleSources = {
    authority: writeBytes(join(roles, 'authority.json'), plan.roles.authority),
    ciBinding: writeBytes(join(roles, 'ci-binding.json'), plan.roles.ciBinding),
    evidence: writeBytes(join(roles, 'evidence.json'), plan.roles.evidence),
    launcher: writeBytes(join(roles, 'launcher.sh'), toolkit.roleBytes['launcher.sh']),
    localBinding: writeBytes(join(roles, 'local-binding.json'), plan.roles.localBinding),
    mapping: writeBytes(join(roles, 'mapping.json'), plan.roles.mapping),
    policy: writeBytes(join(roles, 'policy.json'), plan.roles.policy),
    reviewReceipt: writeBytes(join(roles, 'review-receipt.json'), plan.roles.reviewReceipt),
    snapshotter: writeBytes(join(roles, 'snapshotter.ts'), toolkit.roleBytes['snapshotter.ts']),
    validator: writeBytes(join(roles, 'validator.mjs'), toolkit.roleBytes['validator.mjs']),
  };
  mkdirSync(destination, { recursive: true });
  const prepared = prepareActivation({
    candidateRepository: repository,
    destination: join(destination, `activation-${sha}`),
    roleSources,
    sourceRevision: sha,
    policyIdentity: plan.identities.policy,
    mappingIdentity: plan.identities.mapping,
    validatorIdentity: plan.identities.validator,
    reviewReceiptIdentity: plan.identities.reviewReceipt,
  });
  selectActivation(destination, prepared.directory, prepared.identity);
  const launcherPath = join(destination, 'bootstrap-launcher.sh');
  writeBytes(launcherPath, toolkit.roleBytes['launcher.sh']);
  chmodSync(launcherPath, 0o555);
  writeBytes(join(destination, 'launcher-path'), 'bootstrap-launcher.sh\n');
  writeBytes(join(destination, 'active-v1'), 'tool-wiki-active-v1\n');
  // Provenance only. Nothing on the admission path reads this descriptor; the transport digest
  // authenticates it exactly as it authenticates every other root file.
  writeBytes(join(destination, 'toolkit-release'), `${toolkit.tag} ${toolkit.digest}\n`);
  // The names come from `toolkit.json`, not from walking the directory: re-deriving them would let
  // an added package into the copy that the descriptor never named. `readToolkit` has already
  // proven the closure's bytes against that same descriptor.
  copyTrustedModules(
    join(destination, 'trusted-node-modules'),
    join(toolkit.directory, 'trusted-node-modules'),
    toolkit.trustedNodeModules,
  );
  const report = selfCheck(destination, repository, sha);
  const tarball = archive(
    destination,
    sha,
    gitText(
      repository,
      ['show', '--no-patch', '--format=%ct', sha],
      'cannot read candidate committer time',
    ),
  );
  // The origin only phrases the instruction below. It is an explicitly optional convenience, not
  // trusted state: a checkout with no remote still gets a complete, certified archive.
  const originInvocation = Bun.spawnSync(['git', '-C', repository, 'remote', 'get-url', 'origin'], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const origin =
    originInvocation.exitCode === 0
      ? originInvocation.stdout.toString('utf8').trim()
      : 'your repository (no origin remote is configured)';
  const sha8 = sha.slice(0, 8);
  return [
    `toolkit activation: ${sha}`,
    `toolkit: ${toolkit.tag} ${toolkit.sourceRevision} (${toolkit.digest})`,
    `version directory: ${prepared.directory}`,
    `manifest identity: ${prepared.identity}`,
    `review: ${plan.ids.receiptId} journal ${plan.ids.journalId} — operator attestation, not re-derived`,
    `checks: ${runs.map((run) => `${run.checkId} exit ${String(run.exitCode)}`).join('; ') || '(none)'}`,
    `self-check: ${report}`,
    `archive: ${tarball.path}   sha256: ${tarball.digest}`,
    `publish this archive as a release of ${origin}, then in THAT repository:`,
    `gh variable set TOOL_WIKI_ACTIVATION_VERSION --body ${sha}`,
    `gh variable set TOOL_WIKI_ACTIVATION_ARCHIVE_URL --body <asset URL of tool-wiki-activation-${sha8}.tar>`,
    `gh variable set TOOL_WIKI_ACTIVATION_ARCHIVE_SHA256 --body ${tarball.digest}`,
  ];
}

if (import.meta.main) {
  try {
    const lines = prepareToolkitActivation(process.argv.slice(2), import.meta.dir);
    process.stdout.write(`${lines.join('\n')}\n`);
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 1;
  }
}
