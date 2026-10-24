import { edgeStateDirectory } from './lib/edge-admission';
import { initializeOrdinaryEdgePolicy } from './lib/edge-policy';

/** Explicit first adoption: dry-run by default; never repairs or replaces retained evidence. */
export async function runInitializeEdgePolicy(argv: readonly string[]): Promise<void> {
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== '--execute'))
    throw new Error('expected no arguments (dry run) or exactly --execute');
  const directory = edgeStateDirectory();
  if (argv.length === 0) {
    console.log(
      `dry run: exclusively initialize ordinary edge policy at ${directory}/edge-policy.json`,
    );
    return;
  }
  await initializeOrdinaryEdgePolicy(directory);
  console.log(
    `initialized ordinary edge policy at ${directory}/edge-policy.json; install and independently audit before adoption`,
  );
}

if (import.meta.main) {
  runInitializeEdgePolicy(process.argv.slice(2)).catch((cause: unknown) => {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exit(1);
  });
}
