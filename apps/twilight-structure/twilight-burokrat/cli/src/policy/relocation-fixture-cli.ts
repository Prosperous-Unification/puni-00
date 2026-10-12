import { createRelocationCandidate } from './relocation-fixtures';

/**
 * Builds one reproducible relocation fixture candidate and prints `{ workspace, repository,
 * baseRevision, candidateRevision }` as JSON. Test support for processes that cannot import this package:
 * Twilight Dash's check-run tests and the regeneration of the golden ledgers under
 * `fixtures/check-runs/` (its README). The caller owns and removes `workspace`.
 *
 * `--skipping-check` points the candidate's check at the `bun test` target that skips one test.
 */
function main(argv: readonly string[]): void {
  const unknown = argv.filter((flag) => flag !== '--skipping-check');
  if (unknown.length > 0) {
    throw new Error(
      `usage: relocation-fixture-cli.ts [--skipping-check] (got ${unknown.join(' ')})`,
    );
  }
  const fixture = createRelocationCandidate({
    reproducible: true,
    skippingCheck: argv.includes('--skipping-check'),
  });
  process.stdout.write(
    `${JSON.stringify({
      workspace: fixture.workspace,
      repository: fixture.repository,
      baseRevision: fixture.baseRevision,
      candidateRevision: fixture.candidateRevision,
    })}\n`,
  );
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 1;
  }
}
