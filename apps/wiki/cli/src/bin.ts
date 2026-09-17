import { join } from 'node:path';

import { runCli } from './cli';
import { packageVersion } from './packaging/manifest';
import { prepareToolkitActivation } from './policy/prepare-activation-cli';
import { prepareRelocationActivation } from './policy/prepare-relocation-activation-cli';

function runLint(argv: readonly string[]): void {
  if (argv.length !== 3) {
    throw new Error(
      'usage: twilight-bureaucrat lint <committed|staged|working> <repository> <revision-or-base>',
    );
  }
  const invocation = Bun.spawnSync(
    ['bash', join(import.meta.dir, 'toolkit/launcher.sh'), ...argv],
    {
      env: process.env,
      stderr: 'pipe',
      stdout: 'pipe',
    },
  );
  process.stdout.write(invocation.stdout);
  process.stderr.write(invocation.stderr);
  if (invocation.exitCode !== 0) {
    throw new Error(`Twilight Bureaucrat lint exited ${String(invocation.exitCode)}`);
  }
}

async function main(argv: string[]): Promise<void> {
  if (argv.length === 1 && argv[0] === '--version') {
    process.stdout.write(`${packageVersion}\n`);
    return;
  }
  const [command, ...arguments_] = argv;
  if (command === 'lint') {
    runLint(arguments_);
    return;
  }
  if (command === 'prepare-activation') {
    process.stdout.write(
      `${prepareToolkitActivation(arguments_, join(import.meta.dir, 'toolkit')).join('\n')}\n`,
    );
    return;
  }
  if (command === 'prepare-relocation-activation') {
    process.stdout.write(`${(await prepareRelocationActivation(arguments_)).join('\n')}\n`);
    return;
  }
  await runCli(argv);
}

try {
  await main(process.argv.slice(2));
} catch (cause) {
  process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
  process.exitCode = 1;
}
