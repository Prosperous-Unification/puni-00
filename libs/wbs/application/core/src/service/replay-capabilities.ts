/** Command discriminators available to image probes without loading application dependencies. */
export const STEP_BLOCKAGE_REPLAY_KINDS = ['replace_blockage'] as const;

/** Persisted replay semantics understood by this image, distinct from command discriminators. */
export const STEP_BLOCKAGE_REPLAY_CAPABILITIES = [
  'replace_blockage',
  'move_progress_v1',
  'delete_state_v1',
] as const;
