/** A capability's admitted observation, independent of whether the connection remains open. */
export interface ReadSnapshotLifetime {
  assertOpen(): void;
}

/** One-way capability expiry; a later transaction can never revive an old reader. */
export function createReadSnapshotLifetime(): ReadSnapshotLifetime & { expire(): void } {
  let open = true;
  return {
    assertOpen() {
      // Proof: omitting the guard returned cached input after `snapshot capability expires when callback closes`.
      if (!open) throw new Error('read snapshot is closed');
    },
    expire() {
      open = false;
    },
  };
}
