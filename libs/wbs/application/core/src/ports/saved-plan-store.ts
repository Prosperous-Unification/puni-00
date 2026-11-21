import type {
  SavedPlanHoldingRow,
  SavedPlanPrincipals,
  SavedPlanRow,
  SavedPlanTouchOutcome,
  SavedPlanTouchWrite,
  SavedPlanWrite,
  SavedPlanWriteOutcome,
  ScopedSavedPlanWrite,
  StoredSavedPlan,
} from './saved-plan-values';
export type {
  LegacySavedPlanTouch,
  SavedPlanBodyWrite,
  SavedPlanHoldingRow,
  SavedPlanPrincipals,
  SavedPlanRow,
  SavedPlanScheduleWrite,
  SavedPlanTouchMutation,
  SavedPlanTouchOutcome,
  SavedPlanTouchWrite,
  SavedPlanWrite,
  SavedPlanWriteOutcome,
  ScopedSavedPlanWrite,
  StoredSavedPlan,
  StoredSavedPlanBytes,
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
  listOf(workPackageId: string): Promise<readonly SavedPlanRow[]>;
  principalsOf(savedPlanId: string): Promise<SavedPlanPrincipals | null>;
  renameTo(
    savedPlanId: string,
    name: string,
    touch: SavedPlanTouchWrite,
  ): Promise<SavedPlanTouchOutcome>;
  deleteOf(savedPlanId: string, touch: SavedPlanTouchWrite): Promise<SavedPlanTouchOutcome>;
}

/** Detach actor/context before waiting; malformed internal admission evidence throws. */
export function retainSavedPlanTouch(
  touch: SavedPlanTouchWrite,
  operation: 'rename' | 'delete',
  name?: string,
): SavedPlanTouchWrite {
  if (operation === 'rename' && typeof name !== 'string')
    throw new Error('saved-plan rename payload is missing');
  const supplied: unknown = touch;
  if (typeof supplied !== 'object' || supplied === null)
    throw new Error('saved-plan touch admission is missing');
  if (
    !('actorId' in supplied) ||
    typeof supplied.actorId !== 'string' ||
    supplied.actorId.trim() === '' ||
    !('operation' in supplied) ||
    supplied.operation !== operation
  )
    throw new Error('saved-plan touch operation or actor disagrees with its authorization');
  if (
    'kind' in supplied &&
    (supplied.kind !== 'legacy' ||
      !('source' in supplied) ||
      (supplied.source !== 'human' && supplied.source !== 'internal'))
  )
    throw new Error('saved-plan legacy touch context is malformed');
  return structuredClone(touch);
}
