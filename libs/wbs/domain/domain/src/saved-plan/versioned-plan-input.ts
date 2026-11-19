import { canonicalisePlanInput, type PlanInputRows } from './canonical-plan-input';
import { type SavedDependencyHistory, serializeSavedDependencyHistory } from './dependency-history';
import { requireHistory } from './history-json';
import { type CanonicalPlanInputV12, readCurrentSavedPlanInput12 } from './input12';
import { readLegacySavedPlanInput } from './legacy-input10';
import { type LegacyPlanInputV11, readLegacySavedPlanInput11 } from './legacy-input11';
import { PlanInputVersionError } from './normalise-plan-input';
import { upgradeLegacyPlanInput10 } from './upgrade-plan-input10';

export type { CanonicalPlanInputV12 } from './input12';
/** Highest supported original body version; the historical normalizer retains its own ceiling9. */
export const SAVED_PLAN_INPUT_READER_VERSION = 12 as const;
/** Published11 remains its independent original owner-bearing type. */
export type CanonicalPlanInputV11 = LegacyPlanInputV11;
/** Original older bodies decode through the frozen11 projection; they never become raw12. */
export type DecodedPlanInput = LegacyPlanInputV11 | CanonicalPlanInputV12;

/** Validates original version/shape before a caller constructs its detached comparison evidence. */
export function readSavedPlanInput(body: unknown, version: number): DecodedPlanInput {
  if (!Number.isInteger(version) || version < 1)
    throw new PlanInputVersionError('not-a-version', version, 12);
  if (version > 12) throw new PlanInputVersionError('from-the-future', version, 12);
  requireHistory(
    typeof body === 'object' &&
      body !== null &&
      'schemaVersion' in body &&
      body.schemaVersion === version,
    'version',
    '$.schemaVersion',
  );
  if (version === 12) return readCurrentSavedPlanInput12(body);
  return readLegacySavedPlanInput11(
    version <= 10 ? upgradeLegacyPlanInput10(readLegacySavedPlanInput(body, version)) : body,
  );
}

/** Emits only current12 from actual captured parent and explicit local or connected history. */
export function canonicalisePlanInputV12(
  rows: PlanInputRows,
  history: SavedDependencyHistory,
): CanonicalPlanInputV12 {
  const dependencyHistory: unknown = JSON.parse(serializeSavedDependencyHistory(history));
  return readCurrentSavedPlanInput12({
    schemaVersion: 12,
    ...canonicalisePlanInput(rows),
    dependencyHistory,
  });
}
