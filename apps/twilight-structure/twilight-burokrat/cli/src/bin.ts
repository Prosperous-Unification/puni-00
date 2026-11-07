import { join } from 'node:path';

import {
  type InstalledCommand,
  installedGrammar,
  readInvocation,
  UsageRefusal,
} from './cli-parser';
import { readInstalledToolkit } from './packaging/installed';
import { packageVersion } from './packaging/manifest';
import { prepareToolkitActivation } from './policy/prepare-activation-cli';
import { prepareRelocationActivation } from './policy/prepare-relocation-activation-cli';

function runLint(
  command: Extract<InstalledCommand, { command: 'lint' }>,
  toolkitDirectory: string,
): void {
  const invocation = Bun.spawnSync(
    [
      'bash',
      join(toolkitDirectory, 'launcher.sh'),
      command.kind,
      command.repository,
      command.revision,
    ],
    { env: process.env, stderr: 'pipe', stdout: 'pipe' },
  );
  process.stdout.write(invocation.stdout);
  process.stderr.write(invocation.stderr);
  if (invocation.exitCode !== 0) {
    throw new Error(`Twilight Burokrat lint exited ${String(invocation.exitCode)}`);
  }
}

/**
 * Runs one validator command in the installed toolkit's `validator.mjs`, which parses `argv`
 * again with the same grammar `installedGrammar` shares with `cli.ts`.
 */
function runValidator(argv: readonly string[], toolkitDirectory: string): void {
  const invocation = Bun.spawnSync(
    [process.execPath, join(toolkitDirectory, 'validator.mjs'), ...argv],
    {
      env: {
        ...process.env,
        TOOL_WIKI_TRUSTED_NODE_MODULES: join(toolkitDirectory, 'trusted-node-modules'),
      },
      stderr: 'pipe',
      stdout: 'pipe',
    },
  );
  process.stdout.write(invocation.stdout);
  process.stderr.write(invocation.stderr);
  // Proof: removing this passthrough failed BROWSER-T2-POLICY-PREVIEW-012's installed refusal stderr parity.
  if (argv[0] === 'inspect-browser-t2-policy' && invocation.exitCode === 1) {
    process.exitCode = 1;
    return;
  }
  if (invocation.exitCode !== 0) {
    throw new Error(`Twilight Burokrat validator exited ${String(invocation.exitCode)}`);
  }
}

/**
 * The installed `twilight-burokrat` and `twib` executable. `--help`, `help <command>`,
 * `--version` and `completion <shell>` print before the toolkit is read; a refused command line
 * is one `error: ` line, exit 1, before the toolkit is read. Every installed validator command
 * reaches the toolkit's `validator.mjs` with its words unchanged.
 */
async function main(argv: readonly string[]): Promise<void> {
  const invocation = readInvocation(installedGrammar, argv, {
    stdout: (text) => {
      process.stdout.write(text);
    },
    version: packageVersion,
  });
  if (invocation.kind === 'printed') return;
  const { command } = invocation;
  const toolkitDirectory = join(import.meta.dir, 'toolkit');
  const toolkit = readInstalledToolkit(import.meta.dir, toolkitDirectory);
  if (command.command === 'lint') {
    runLint(command, toolkit.directory);
    return;
  }
  if (command.command === 'prepare-activation') {
    process.stdout.write(
      `${prepareToolkitActivation(command.argv, toolkit.directory, toolkit.digest).join('\n')}\n`,
    );
    return;
  }
  if (command.command === 'prepare-relocation-activation') {
    process.stdout.write(`${(await prepareRelocationActivation(command.argv)).join('\n')}\n`);
    return;
  }
  runValidator(argv, toolkit.directory);
}

try {
  await main(process.argv.slice(2));
} catch (cause) {
  const message = cause instanceof Error ? cause.message : String(cause);
  // Proof: writing the bare message here failed `an unknown command refuses in one line, exit 1,
  // through both entries` on the installed entry's line (2026-11-02).
  process.stderr.write(cause instanceof UsageRefusal ? `error: ${message}\n` : `${message}\n`);
  process.exitCode = 1;
}
