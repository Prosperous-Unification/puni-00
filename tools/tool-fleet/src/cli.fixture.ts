/** Deterministic CLI presentation without transforming stdout, stderr or private payloads. */
export function cliEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string | undefined> {
  // Proof: removing these overrides made cli.fixture.test.ts `exact safe refusal output`
  // fail under inherited FORCE_COLOR=1; the child's raw ANSI bytes reached the equality assertion.
  return { ...env, FORCE_COLOR: '0', NO_COLOR: '1' };
}
