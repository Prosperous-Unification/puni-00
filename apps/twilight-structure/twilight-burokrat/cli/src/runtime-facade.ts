import { realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

import { decodeCandidateRoot } from './inventory/read-candidate';
import { readInstalledToolkit } from './packaging/installed';
import { toolkitRoles } from './policy/release';
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

/** Git before 2.36 can interpret false as a filesystem-monitor hook pathname. */
function assertGitVersion(directory: string, environment: Readonly<Record<string, string>>): void {
  let child: Bun.ReadableSyncSubprocess;
  try {
    child = Bun.spawnSync(['git', '--version'], {
      cwd: directory,
      env: environment,
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch (cause) {
    throw new Error('cannot inspect required Git version', { cause });
  }
  // Proof: ignoring the failed version query admitted exit42 with successful-looking stdout; the named failed-query parent test failed.
  if (child.exitCode !== 0)
    throw new Error('cannot inspect required Git version (exit ' + String(child.exitCode) + ')');
  // Proof: admitting arbitrary vendor parentheses failed three malformed-version cases; removing the response guard lost the fixed diagnostic.
  const version =
    /^git version (0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})(?:\.windows\.[0-9]+| \(Apple Git-[0-9]+(?:\.[0-9]+)*\))?\n?$/u.exec(
      child.stdout.toString(),
    );
  if (version === null) throw new Error('Git version response is malformed or unsupported');
  const major = Number(version[1]);
  const minor = Number(version[2]);
  // Proof: removing each numeric-floor arm separately admitted 1.99.0 or 2.35.x in the unsupported-version parent cases.
  if (major < 2 || (major === 2 && minor < 36)) throw new Error('Git 2.36.0 or newer is required');
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

/**
 * Verify the installed toolkit and execute one typed request through its validator role.
 * The child owns process state and receives JSON stdin; its output and verdict status pass
 * through unchanged. Discovery imports the separate grammar facade and never reaches here.
 */
export function executeRequest(request: ValidatorRequest, context: Context): number {
  // Proof: directory-only selection executed a tampered installed validator; the tampered-role-before-launch test failed.
  const toolkit = readInstalledToolkit(
    context.installedDirectory,
    join(context.installedDirectory, 'toolkit'),
  );
  // Proof: inheriting ambient state or altering each declared Git/closure setting failed the observed environment contract. Separate reachable-hook and lazy-fetch faults executed their sentinels.
  const environment: Record<string, string> = {
    PATH: context.path,
    TOOL_WIKI_TRUSTED_NODE_MODULES: join(toolkit.directory, 'trusted-node-modules'),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'core.hooksPath',
    GIT_CONFIG_VALUE_0: '/dev/null',
    GIT_CONFIG_KEY_1: 'core.fsmonitor',
    GIT_CONFIG_VALUE_1: 'false',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_ALLOW_PROTOCOL: '',
    GIT_TERMINAL_PROMPT: '0',
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
