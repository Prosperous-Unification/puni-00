/** The most commands one batch may carry. */
// Proof: codec-T1-cap changed 200 to 201; independent codec/HTTP negatives failed,
// and unchanged ordinary controller/service tests accepted 201 commands (HTTP 200).
export const MOST_COMMANDS_IN_A_BATCH = 200;
