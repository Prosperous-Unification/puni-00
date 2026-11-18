import { type } from '@shared/validation';

const IsoInstantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
export const GitObjectId = type(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/);
export const Sha256 = type(/^[0-9a-f]{64}$/);
export const IsoInstantText = type(IsoInstantPattern);
export const IsoInstant = IsoInstantText.narrow((instant, context) => {
  const epochMs = Date.parse(instant);
  const normalized = instant.length === 20 ? `${instant.slice(0, -1)}.000Z` : instant;
  // Proof: removing this semantic check made the production CLI print
  // `valid invocation-receipt` for 2026-02-30T17:00:00.000Z (expected exit 1).
  return Number.isFinite(epochMs) && new Date(epochMs).toISOString() === normalized
    ? true
    : context.mustBe('a real ISO 8601 UTC instant');
});
// Proof: widening this to any positive integer made the production CLI print
// `valid candidate-entry` for schemaVersion 99 (expected exit 1), and made artifact graph
// version 99 exit 0 with artifactCount 2 instead of refusing before traversal.
export const SchemaVersion = type('1');
