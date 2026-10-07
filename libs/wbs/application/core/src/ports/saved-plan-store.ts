import type {
  SavedPlanHoldingRow,
  SavedPlanPrincipals,
  SavedPlanRow,
  SavedPlanTouchOutcome,
  SavedPlanWrite,
  SavedPlanWriteOutcome,
  ScopedSavedPlanWrite,
  StoredSavedPlan,
} from './saved-plan-values';
export type {
  SavedPlanBodyWrite,
  SavedPlanHoldingRow,
  SavedPlanPrincipals,
  SavedPlanRow,
  SavedPlanScheduleWrite,
  SavedPlanTouchOutcome,
  SavedPlanWrite,
  SavedPlanWriteOutcome,
  ScopedSavedPlanWrite,
  StoredSavedPlan,
} from './saved-plan-values';

/** The source-neutral saved-plan history boundary. */
export interface SavedPlanStore {
  // Proof: adding `holdingOf` here failed the adapter-free fixture on TS2741,
  // missing the transaction-only method (2026-09-09).
  // Proof: adding `bodyOf` did the same, naming `bodyOf` at TS2741.
  write<Refusal>(
    plan: SavedPlanWrite,
    check: (holding: SavedPlanHoldingRow, incomingBytes: number) => Promise<Refusal | null>,
    scoped?: ScopedSavedPlanWrite,
  ): Promise<SavedPlanWriteOutcome<Refusal>>;
  readOf(savedPlanId: string): Promise<StoredSavedPlan | null>;
  listOf(projectId: string): Promise<readonly SavedPlanRow[]>;
  principalsOf(savedPlanId: string): Promise<SavedPlanPrincipals | null>;
  renameTo(
    savedPlanId: string,
    name: string,
    scoped?: ScopedSavedPlanWrite,
  ): Promise<SavedPlanTouchOutcome>;
  deleteOf(savedPlanId: string, scoped?: ScopedSavedPlanWrite): Promise<SavedPlanTouchOutcome>;
}
