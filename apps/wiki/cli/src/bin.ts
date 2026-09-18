import { join } from 'node:path';

import { readInstalledToolkit } from './packaging/installed';
import { packageVersion } from './packaging/manifest';
import { prepareToolkitActivation } from './policy/prepare-activation-cli';
import { prepareRelocationActivation } from './policy/prepare-relocation-activation-cli';

const validatorCommands = new Set([
  'validate',
  'validate-record',
  'read-candidate',
  'classify-candidate',
  'content-manifest',
  'validate-artifacts',
  'extract-relationships',
  'check-indexes',
  'check-root-migration',
  'validate-review-provenance',
  'freeze-exhaustive',
  'verify-exhaustive',
  'evaluate-exhaustive-coverage',
  'submit-admission',
  'lint-local',
  'lint-ci',
  'validate-policy-activation',
]);

const help = `usage: twilight-bureaucrat <command> ...

commands:
  twilight-bureaucrat validate-record <kind> <json>
  twilight-bureaucrat lint <committed|staged|working> <repository> <revision-or-base>
  twilight-bureaucrat prepare-activation <flags>
  twilight-bureaucrat prepare-relocation-activation <flags>
`;

function runLint(argv: readonly string[], toolkitDirectory: string): void {
  if (argv.length !== 3) {
    throw new Error(
      'usage: twilight-bureaucrat lint <committed|staged|working> <repository> <revision-or-base>',
    );
  }
  const invocation = Bun.spawnSync(['bash', join(toolkitDirectory, 'launcher.sh'), ...argv], {
    env: process.env,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  process.stdout.write(invocation.stdout);
  process.stderr.write(invocation.stderr);
  if (invocation.exitCode !== 0) {
    throw new Error(`Twilight Bureaucrat lint exited ${String(invocation.exitCode)}`);
  }
}

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
  if (invocation.exitCode !== 0) {
    throw new Error(`Twilight Bureaucrat validator exited ${String(invocation.exitCode)}`);
  }
}

async function main(argv: string[]): Promise<void> {
  if (argv.length === 1 && argv[0] === '--version') {
    process.stdout.write(`${packageVersion}\n`);
    return;
  }
  if (argv.length === 1 && argv[0] === '--help') {
    process.stdout.write(help);
    return;
  }
  const [command, ...arguments_] = argv;
  if (
    command !== 'lint' &&
    command !== 'prepare-activation' &&
    command !== 'prepare-relocation-activation' &&
    !validatorCommands.has(command)
  ) {
    throw new Error(`unknown command: ${command}\n${help}`);
  }
  const toolkitDirectory = join(import.meta.dir, 'toolkit');
  const toolkit = readInstalledToolkit(import.meta.dir, toolkitDirectory);
  if (command === 'lint') {
    runLint(arguments_, toolkit.directory);
    return;
  }
  if (command === 'prepare-activation') {
    process.stdout.write(
      `${prepareToolkitActivation(arguments_, toolkit.directory, toolkit.digest).join('\n')}\n`,
    );
    return;
  }
  if (command === 'prepare-relocation-activation') {
    process.stdout.write(`${(await prepareRelocationActivation(arguments_)).join('\n')}\n`);
    return;
  }
  runValidator(argv, toolkit.directory);
}

try {
  await main(process.argv.slice(2));
} catch (cause) {
  process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
  process.exitCode = 1;
}
