import { realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

import { assertGitVersion, createGitEnvironment } from './git-environment';
import type { Request } from './grammar-facade';
import { type InstalledLint, type InstalledLintContext, readInstalledLint } from './installed-lint';
import { runInstalledLintLauncher } from './installed-lint-launcher';
import { assertInstalledPlacement } from './installed-placement';
import { decodeCandidateRoot } from './inventory/read-candidate';
import { LintActivationRefusal } from './lint-activation';
import { runLintOperation } from './lint-execution';
import type { LintDiagnostic, LintOutput } from './lint-output';
import { lintParentMode } from './lint-parent-control';
import { type LintInvocation, type LintRequest, LintUsageRefusal } from './lint-request';
import { readLintRuntime } from './lint-runtime';
import { readInstalledPuniToolkit, readInstalledToolkit } from './packaging/installed';
import { prepareToolkit, type Toolkit } from './policy/prepare-activation-cli';
import { prepareRelocation } from './policy/prepare-relocation-activation-cli';
import { toolkitRoles } from './policy/release';
import { type BunExecutionToolkit, readCommittedBunToolkit } from './policy/toolkit';
import { anchorPreparation } from './preparation-paths';
import { readPushAudit } from './push-audit';
import { anchorPath } from './validator-paths';
import type { Request as ValidatorRequest } from './validator-request';

export type { Request } from './grammar-facade';
export { runInstalledPreparation } from './installed-preparation';
export { freezePath } from './lint-runtime';

/** The selected installation, caller paths, protected Bun launch and owned output streams. */
export interface Context {
  readonly installedDirectory: string;
  readonly callerDirectory: string;
  readonly path: string;
  readonly ciTrustedBinding?: string;
  readonly launch: (entrypoint: string) => readonly string[];
  readonly stdout: (chunk: string | Uint8Array) => void;
  readonly stderr: (chunk: string | Uint8Array) => void;
}

function readCandidateDirectory(
  request: ValidatorRequest,
  context: Context,
  directory: string,
  environment: Readonly<Record<string, string>>,
): string | undefined {
  // Proof: bypassing this caller-root branch admitted candidate-local assets in the workflow-binding placement test.
  if (request.command === 'validate workflow-binding')
    return realpathSync.native(context.callerDirectory);
  const repository =
    'repository' in request
      ? request.repository
      : request.command === 'explain'
        ? // Proof: omitting this nested repository selection admitted candidate-local assets in the explain placement test.
          request.policy?.repository
        : undefined;
  if (repository === undefined) return undefined;
  // Proof: skipping the probe admitted unsupported Git before any prerequisite refusal; all three unsupported-version cases failed.
  assertGitVersion(directory, environment);
  const child = Bun.spawnSync(
    ['git', '-C', anchorPath(repository, context.callerDirectory), 'rev-parse', '--show-toplevel'],
    {
      cwd: directory,
      env: environment,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  // Proof: using the interior repository operand instead of the actual worktree root admitted the candidate-local installation test.
  return realpathSync.native(
    decodeCandidateRoot({
      exitCode: child.exitCode,
      stdout: child.stdout,
      stderr: child.stderr.toString(),
    }),
  );
}

/** Physical placement is separate from digest verification; candidate symlinks cannot grant it. */
function assertExternal(candidate: string, path: string, subject: string): void {
  // Proof: lexical placement admitted a validator symlink into the candidate; the validator-target placement negative failed.
  const offset = relative(candidate, realpathSync.native(path));
  if (offset === '' || (offset !== '..' && !offset.startsWith('..' + sep) && !isAbsolute(offset)))
    throw new Error(
      'installed Burokrat runtime must be outside the selected candidate: ' + subject,
    );
}

function assertInstallation(
  candidate: string,
  installedDirectory: string,
  toolkitDirectory: string,
): void {
  // Proof: omitting installation, cwd, manifest, descriptor, role or closure checks separately failed their actual candidate/symlink placement negatives.
  assertExternal(candidate, installedDirectory, 'installation');
  assertExternal(candidate, toolkitDirectory, 'toolkit cwd');
  assertExternal(candidate, join(installedDirectory, 'package-manifest.json'), 'package manifest');
  assertExternal(candidate, join(toolkitDirectory, 'toolkit.json'), 'toolkit descriptor');
  for (const role of toolkitRoles) assertExternal(candidate, join(toolkitDirectory, role), role);
  assertExternal(candidate, join(toolkitDirectory, 'trusted-node-modules'), 'runtime closure');
}

type ExecutableRequest = Exclude<Request, { command: 'lint' | 'audit-push' }>;

/** A current-only committed audit request; legacy dispatch never receives this operation. */
export type PushAuditRequest = Extract<Request, { command: 'audit-push' }>;

/**
 * Verify the installation before dispatching validation or typed preparation. Ordinary requests
 * use the isolated validator child; preparation retains the provider's existing in-process
 * subprocess and normalization contracts. Lint uses the dedicated {@link executeLint} current-format boundary. Discovery imports
 * only the separate grammar facade and never reaches this dispatcher.
 */
export function executeRequest(
  request: ExecutableRequest,
  context: Context,
): number | Promise<number> {
  // Proof: directory-only selection executed a tampered installed validator; the tampered-role-before-launch test failed.
  // Proof: replacing package verification with readToolkit failed both preparation manifest-before-input cases.
  const toolkit = readInstalledToolkit(
    context.installedDirectory,
    join(context.installedDirectory, 'toolkit'),
  );
  // Proof: omitting this dispatch reached the ordinary launch instead of the real default-toolkit reader; the named preparation default case failed.
  if (request.command === 'prepare-activation') {
    // Proof: omitting the default path failed its real reader case; omitting the expected digest or discarding the explicit toolkit failed the self-consistent-override refusal.
    const lines = prepareToolkit(
      anchorPreparation(request, context.callerDirectory),
      toolkit.directory,
      toolkit.digest,
    );
    // Proof: literal escape delimiters failed the toolkit report LF-byte assertion.
    context.stdout(lines.join('\n') + '\n');
    return 0;
  }
  // Proof: omitting this dispatch or caller anchoring failed the real base-selection case; returning before completion failed the controlled async report case.
  if (request.command === 'prepare-relocation-activation') {
    return prepareRelocation(anchorPreparation(request, context.callerDirectory)).then((lines) => {
      // Proof: literal escape delimiters failed the relocation report LF-byte assertion.
      context.stdout(lines.join('\n') + '\n');
      return 0;
    });
  }
  return executeValidator(request, context, toolkit);
}

/**
 * Execute a typed current ordinary request through its independently verified PUNI/toolkit
 * child. Native installation selection precedes child-path joining; current physical placement
 * enumerates the verified current roles. Lint/preparation retain their separate owned routes.
 * @throws for package/runtime/placement failures or signaled validator execution.
 */
export function executeCurrentRequest(request: ValidatorRequest, context: Context): number {
  const directory = realpathSync.native(context.installedDirectory);
  // Proof: c28-ordinary-current-profile; Old package with otherwise valid toolkit2; asserts no candidate Git or launch before diagnostic.; injected fault failed `refuses a complete old package profile with valid toolkit2 before ordinary candidate Git or launch`; restoration passed.
  const toolkit = readInstalledPuniToolkit(directory, join(directory, 'toolkit'));
  if(request.command==='lint-ci')readCommittedBunToolkit(toolkit.directory);
  return executeValidator(request, { ...context, installedDirectory: directory }, toolkit);
}

/** The verified ordinary child owns process state and receives only its typed stdin request. */
function executeValidator(
  request: ValidatorRequest,
  context: Context,
  toolkit: Toolkit | BunExecutionToolkit,
): number {
  const environment: Record<string, string> = {
    ...createGitEnvironment(context.path),
    TOOL_WIKI_TRUSTED_NODE_MODULES: join(toolkit.directory, 'trusted-node-modules'),
  };
  // Proof: inheriting an absent binding, dropping propagation/anchoring, anchoring empty or forwarding to other commands each failed its selected-binding negative.
  const binding = context.ciTrustedBinding;
  if (request.command === 'lint-ci' && binding !== undefined)
    environment['TOOL_WIKI_CI_TRUSTED_BINDING'] =
      binding.length === 0 ? binding : anchorPath(binding, context.callerDirectory);
  const candidate = readCandidateDirectory(request, context, toolkit.directory, environment);
  if (candidate !== undefined) {
    if (toolkit.schemaVersion !== 1)
      assertInstalledPlacement(candidate, context.installedDirectory, toolkit);
    else assertInstallation(candidate, context.installedDirectory, toolkit.directory);
  }
  // Proof: bypassing the protected launch capability lost its prerequisite refusal; removing the typed mode, envelope caller or stdin payload failed actual dispatch.
  const argv = [...context.launch(join(toolkit.directory, 'validator.mjs')), '--puni-request-v1'];
  let child: Bun.ReadableSyncSubprocess;
  try {
    child = Bun.spawnSync(argv, {
      // Proof: omitting cwd failed the child-cwd observation; omitting env survived the initial parent-only oracle, then failed once the environment test required child ls-tree activity.
      cwd: toolkit.directory,
      env: environment,
      stdin: Buffer.from(
        JSON.stringify({ version: 1, callerDirectory: context.callerDirectory, request }),
      ),
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch (cause) {
    throw new Error('cannot start verified Burokrat validator', { cause });
  }
  // Proof: dropping either stream or decoding invalid UTF-8 failed the controlled binary-output test (both streams, exact exit37).
  context.stdout(child.stdout);
  context.stderr(child.stderr);
  // Bun 1.4.4 returns a null exitCode for a signal despite its nominal number declaration.
  // A signal is a process failure; it cannot become the returned normal verdict status.
  // Proof: returning the signaled child as a verdict failed the SIGTERM/partial-output parent case; removing spawn context failed its missing-executable diagnostic.
  if (child.signalCode !== undefined)
    throw new Error('verified Burokrat validator ended by ' + child.signalCode);
  // Proof: normalizing nonzero status to zero failed the structured nonpassing-verdict test.
  return child.exitCode;
}

/** Installed selection and independently frozen Git authority plus caller-owned output/signals. */
export interface LintContext extends InstalledLintContext {
  readonly callerDirectory: string;
  readonly activationRoot: string | undefined;
  readonly trustedNodeModules: string | undefined;
  readonly required: boolean;
  readonly scratchDirectory: string;
  readonly launch: (entrypoint: string) => readonly string[];
  readonly stdout: LintOutput;
  readonly stderr: LintOutput;
  readonly reportDiagnostic: (bytes: Uint8Array) => Promise<LintDiagnostic>;
}

/**
 * Execute the typed installed lint request through its verified current package launcher.
 * Integrity, supported Git, actual worktree and physical placement precede optional activation
 * availability. The selected archive owns the default closure; the installation never overrides it.
 * @throws for preflight or launcher ownership/output failures; normal verdict statuses are exact.
 */
export async function executeLint(request: LintRequest, context: LintContext): Promise<number> {
  // Proof: facade-caller; `installed Bun lint typed execution > retains caller-relative repository and activation operands while launcher cwd is external` failed with the recorded source fault and passed after restoration.
  // Proof: facade-request; `installed Bun lint typed execution > maps typed working through the actual selected snapshotter and captured validator` failed with the recorded source fault and passed after restoration.
  const invocation = { version: 1 as const, callerDirectory: context.callerDirectory, request };
  const selected = await readInstalledLint(invocation, context);
  if (selected.kind === 'cancelled') return selected.status;
  return executeSelectedLint(invocation, selected, context);
}

/** Launch once from the already verified installed selection, preserving its exact owned route. */
function executeSelectedLint(
  invocation: LintInvocation,
  selected: Extract<InstalledLint, { kind: 'ready' }>,
  context: LintContext,
): Promise<number> {
  if(context.required)readCommittedBunToolkit(selected.toolkit.directory);
  const environment: Record<string, string> = {
    // Proof: facade-environment; `passes only frozen environment and caller-anchored scratch with explicit activation and closure to the actual installed launcher` failed with the recorded source fault and passed after restoration.
    ...selected.runtime.environment,
    // Proof: facade-required; `installed Bun lint typed execution > preserves required certificate refusal status78 and its report bytes` failed with the recorded source fault and passed after restoration.
    TOOL_WIKI_REQUIRE_CERTIFIED: context.required ? '1' : '0',
    // Proof: facade-tmpdir; `passes only frozen environment and caller-anchored scratch with explicit activation and closure to the actual installed launcher` failed with the recorded source fault and passed after restoration.
    TMPDIR: anchorPath(context.scratchDirectory, context.callerDirectory),
  };
  if (context.activationRoot !== undefined)
    // Proof: facade-activation; `passes only frozen environment and caller-anchored scratch with explicit activation and closure to the actual installed launcher` failed with the recorded source fault and passed after restoration.
    environment['TOOL_WIKI_ACTIVATION_ROOT'] = context.activationRoot;
  if (context.trustedNodeModules !== undefined)
    // Proof: facade-closure; `passes only frozen environment and caller-anchored scratch with explicit activation and closure to the actual installed launcher` failed with the recorded source fault and passed after restoration.
    environment['TOOL_WIKI_TRUSTED_NODE_MODULES'] = context.trustedNodeModules;
  return runInstalledLintLauncher({
    // Proof: facade-distinct-mode; `refuses a controlled v1-only launcher before its operation marker and never retries standalone mode` failed with the recorded source fault and passed after restoration.
    argv: [...context.launch(join(selected.toolkit.directory, 'launcher.mjs')), lintParentMode],
    // Proof: facade-cwd; `passes only frozen environment and caller-anchored scratch with explicit activation and closure to the actual installed launcher` failed with the recorded source fault and passed after restoration.
    directory: selected.toolkit.directory,
    environment,
    stdin: Buffer.from(JSON.stringify(invocation)),
    stdout: context.stdout,
    stderr: context.stderr,
    reportDiagnostic: context.reportDiagnostic,
    subscribeInterrupts: context.subscribeInterrupts,
  });
}

/** The reusable audit caller owns outputs/signals; configured required policy is not optional input. */
export type PushAuditContext = Omit<LintContext, 'required'>;

/**
 * Verify the current installation/candidate first, then apply the configured archive release join.
 * Wholly absent configuration returns the historical explicit push inactivity report. Configured
 * audit always uses committed lint with required certification, through the same selected owner.
 * @throws for unexpected preflight, output or ownership failures; modeled archive refusals return78.
 */
export async function executePushAudit(
  request: PushAuditRequest,
  context: PushAuditContext,
): Promise<number> {
  const invocation: LintInvocation = {
    version: 1,
    callerDirectory: context.callerDirectory,
    request: {
      command: 'lint',
      // Proof: replacing committed with working made
      // `joins the configured root release and runs committed certification through one installed launcher`
      // receive 1 at its initial expected-0 assertion; later argv/stdin checks were unreached.
      kind: 'committed',
      repository: request.repository,
      revision: request.revision,
    },
  };
  const selected = await readInstalledLint(invocation, context);
  // Proof: omitting this selected-cancellation return made
  // `returns prior cancellation before absent installation or configured authority IO`
  // receive 78 instead of 143; shared preflight guards remained unchanged.
  if (selected.kind === 'cancelled') return selected.status;
  let policy: 'inactive' | 'configured';
  try {
    policy = readPushAudit({
      activationRoot: context.activationRoot,
      callerDirectory: context.callerDirectory,
      candidateRoot: selected.candidateDirectory,
      toolkit: selected.toolkit,
    });
  } catch (cause) {
    // Proof: omitting this unexpected-cause rethrow made
    // `preserves an unexpected policy dependency failure exactly: undefined`
    // receive TypeError instead of the exact thrown undefined.
    if (!(cause instanceof LintActivationRefusal)) throw cause;
    const written = await context.stderr(
      Buffer.from('tool-wiki push audit: ' + cause.message + '\n'),
    );
    // Proof: ignoring the returned stderr cancellation made
    // `preserves configured refusal stderr cancellation as SIGTERM`
    // receive 78 instead of 143; no independent SIGINT or output-throw proof.
    return written.kind === 'cancelled' ? (written.signal === 'SIGINT' ? 130 : 143) : cause.status;
  }
  if (policy === 'inactive') {
    const written = await context.stdout(
      Buffer.from(
        '{"schemaVersion":1,"status":"inactive","certified":false,"reason":"external activation marker is not provisioned"}\n',
      ),
    );
    // Proof: ignoring the returned stdout cancellation made
    // `preserves inactive stdout cancellation as SIGTERM`
    // receive 0 instead of 143; no independent SIGINT or absence-policy proof.
    return written.kind === 'cancelled' ? (written.signal === 'SIGINT' ? 130 : 143) : 0;
  }
  // Proof: changing only this inner required override to false made
  // `forces required certification despite a reusable caller required=false: {}`
  // receive 0 instead of 78; the outer override is not an independent proof.
  return executeSelectedLint(invocation, selected, { ...context, required: true });
}

/**
 * Normalize only the executable boundary's raw environment spelling or trusted Boolean input.
 * Undefined and exact0 mean optional, exact1 means required; no trimming or alternate spelling.
 * @throws LintUsageRefusal for every other raw string, including an explicitly empty setting.
 */
function readRequiredSetting(required: boolean | string | undefined): boolean {
  if (typeof required === 'boolean') return required;
  if (required === undefined || required === '0') return false;
  if (required === '1') return true;
  // Proof: removing this throw made the raw executable setting "true" control
  // execute its forbidden validator and return 1 instead of 64 (N2).
  throw new LintUsageRefusal('TOOL_WIKI_REQUIRE_CERTIFIED must be 0 or 1');
}

/** Caller-selected lookup authority, captured independently of the provider being verified. */
export interface LintExecutableContext extends Omit<
  LintContext,
  'runtime' | 'required' | 'stdout' | 'stderr' | 'reportDiagnostic' | 'subscribeInterrupts'
> {
  readonly lookup: { readonly directory: string; readonly path: string | undefined };
  /** Raw or typed admission setting, normalized inside the executable owner before prerequisite IO. */
  readonly required: boolean | string | undefined;
}

/**
 * Run a typed installed lint operation with executable-owned signals, output and diagnostics.
 * Raw required admission is normalized inside this owner before prerequisite IO.
 * Runtime construction occurs inside that owner; it never reads stdin or reparses user argv.
 * The root must perform its mode-specific terminal exit only after this owner returns, since
 * unconfirmed preflight cleanup or abandoned native output may retain refs independently of
 * the installed launcher. Reusable callers retain {@link executeLint} with their own owners.
 */
export function runInstalledLint(
  request: LintRequest,
  context: LintExecutableContext,
): Promise<number> {
  return runInstalledOperation(request, context);
}

/** Execute current audit inside the existing lint owner; no caller-required value can disable it. */
export function runInstalledPushAudit(
  request: PushAuditRequest,
  context: Omit<LintExecutableContext, 'required'>,
): Promise<number> {
  return runInstalledOperation(request, { ...context, required: true });
}

/** Both typed operations share runtime construction, output/signals and exactly one owner. */
function runInstalledOperation(
  request: LintRequest | PushAuditRequest,
  context: LintExecutableContext,
): Promise<number> {
  // Proof: typed-runtime-inside-owner; moving runtime construction before this owner failed `contains runtime construction failure through the executable bounded reporter`; restoration passed.
  // Proof: typed-no-stdin; reading Bun.stdin.stream here failed `owns typed installed execution without stdin or argv re-entry and preserves binary verdict37`; restoration passed.
  return runLintOperation(async ({ outputs, subscribeInterrupts }) => {
    let required: boolean;
    try {
      required = readRequiredSetting(context.required);
    } catch (cause) {
      // Proof: removing this filter changed the undefined-accessor control's exact
      // undefined diagnostic to a cause.message TypeError (N5); status 1 already passed.
      if (!(cause instanceof LintUsageRefusal)) throw cause;
      // Proof: removing await made the modeled SIGINT diagnostic-write control
      // return 64 instead of 130 (N3), without an OS-delivery or native-flush claim.
      const written = await outputs.stderr(Buffer.from('tool-wiki lint: ' + cause.message + '\n'));
      // Proof: omitting this returned mapping made the same modeled SIGINT control
      // return 64 instead of 130 (N4); SIGTERM has ordinary coverage only.
      return written.kind === 'cancelled'
        ? written.signal === 'SIGINT'
          ? 130
          : 143
        : cause.status;
    }
    // Proof: typed-lookup-origin; rebasing lookup onto the provider failed `freezes relative Git lookup at the independently captured origin instead of provider directories`; restoration passed.
    const path = context.lookup.path;
    // Proof: root-lint-empty-path; `preserves explicitly empty root lint PATH as the selected trusted directory` failed under its recorded production fault and passed after restoration.
    // Proof: root-lint-path-refusal; `reports absent root lint PATH inside its bounded executable reporter` failed under its recorded production fault and passed after restoration.
    if (path === undefined) throw new Error('trusted executable PATH is required for Burokrat');
    const runtime = readLintRuntime(path, context.lookup.directory);
    const execution = {
      // Proof: typed-required-setting; overriding required to false failed `preserves required admission status78 through the typed executable owner`; restoration passed.
      ...context,
      required,
      runtime,
      // Proof: typed-output-wiring; routing stdout to stderr failed `owns typed installed execution without stdin or argv re-entry and preserves binary verdict37`; restoration passed.
      stdout: outputs.stdout,
      stderr: outputs.stderr,
      reportDiagnostic: outputs.reportDiagnostic,
      // Proof: typed-native-cancellation; replacing the subscription with a no-op failed `delivers actual native cancellation through the typed owner and removes its live stage`; restoration passed.
      subscribeInterrupts,
    };
    return request.command === 'lint'
      ? executeLint(request, execution)
      : executePushAudit(request, execution);
  }, false);
}
