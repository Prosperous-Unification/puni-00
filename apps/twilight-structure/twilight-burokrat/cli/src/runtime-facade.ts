import { realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

import { assertGitVersion, createGitEnvironment } from './git-environment';
import type { Request } from './grammar-facade';
import { type InstalledLintContext, readInstalledLint } from './installed-lint';
import { runInstalledLintLauncher } from './installed-lint-launcher';
import { decodeCandidateRoot } from './inventory/read-candidate';
import type { LintDiagnostic, LintOutput } from './lint-output';
import { lintParentMode } from './lint-parent-control';
import type { LintRequest } from './lint-request';
import { readInstalledToolkit } from './packaging/installed';
import { prepareToolkit, type Toolkit } from './policy/prepare-activation-cli';
import { prepareRelocation } from './policy/prepare-relocation-activation-cli';
import { toolkitRoles } from './policy/release';
import { anchorPreparation } from './preparation-paths';
import { anchorPath } from './validator-paths';
import type { Request as ValidatorRequest } from './validator-request';

export type { Request } from './grammar-facade';

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
  if (request.command === 'validate workflow-binding') return realpathSync(context.callerDirectory);
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
  return realpathSync(
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
  const offset = relative(candidate, realpathSync(path));
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

type ExecutableRequest = Exclude<Request, { command: 'lint' }>;

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

/** The verified ordinary child owns process state and receives only its typed stdin request. */
function executeValidator(request: ValidatorRequest, context: Context, toolkit: Toolkit): number {
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
  if (candidate !== undefined)
    assertInstallation(candidate, context.installedDirectory, toolkit.directory);
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
