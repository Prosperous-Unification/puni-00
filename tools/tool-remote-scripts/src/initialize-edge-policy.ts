import { edgeStateDirectory } from './lib/edge-admission';
import { type EdgePolicyOriginRequest, initializeOrdinaryEdgePolicy } from './lib/edge-policy';

/** Closed execute forms; optional named fields select evidence only and never imply admission. */
function readOriginArguments(argv: readonly string[]): EdgePolicyOriginRequest | undefined {
  if (argv.length === 1 && argv[0] === '--execute') return undefined;
  const receipts = argv.filter((argument) => argument.startsWith('--origin-receipt='));
  const attempts = argv.filter((argument) => argument.startsWith('--attempt-id='));
  // Proof: omitting this composite CLI guard first admitted the dry-run evidence-flags
  // variant; initialize-edge-policy.test.ts "origin CLI requires a complete request
  // before mutation" failed. Earlier incomplete variants still hit missing-value refusal.
  if (
    argv.length !== 3 ||
    argv[0] !== '--execute' ||
    receipts.length !== 1 ||
    attempts.length !== 1
  )
    throw new Error(
      'expected no arguments (dry run), exactly --execute or complete origin receipt arguments',
    );
  const receipt = receipts.at(0);
  const attempt = attempts.at(0);
  if (receipt === undefined || attempt === undefined)
    throw new Error('missing origin receipt arguments');
  return {
    receiptPath: receipt.slice('--origin-receipt='.length),
    attemptId: attempt.slice('--attempt-id='.length),
  };
}

/** Explicit first adoption: dry-run by default; never repairs or replaces retained evidence. */
export async function runInitializeEdgePolicy(argv: readonly string[]): Promise<void> {
  const origin = argv.length === 0 ? undefined : readOriginArguments(argv);
  const directory = edgeStateDirectory();
  if (argv.length === 0) {
    console.log(
      `dry run: exclusively initialize ordinary edge policy at ${directory}/edge-policy.json`,
    );
    return;
  }
  await initializeOrdinaryEdgePolicy(directory, origin);
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
