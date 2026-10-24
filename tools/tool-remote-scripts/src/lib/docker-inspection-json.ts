/**
 * Decode credential-bearing Docker inspection without parser excerpts or a sensitive cause.
 * Proof: restoring the raw parser exposed source/container/image, solver and managed sentinels; all four boundary negatives failed.
 */
export function parseDockerInspection(contents: string): unknown {
  try {
    const inspected: unknown = JSON.parse(contents);
    return inspected;
  } catch {
    // SyntaxError excerpts contain raw Config.Env bytes; this boundary intentionally discards that cause.
    throw new Error('Docker inspection JSON is malformed');
  }
}
