import { runCli } from './cli';

export const packageVersion = '0.1.0';

async function main(argv: string[]): Promise<void> {
  if (argv.length === 1 && argv[0] === '--version') {
    process.stdout.write(`${packageVersion}\n`);
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
