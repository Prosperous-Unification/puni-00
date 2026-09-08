/** Monotonic scheduling capability supplied by the composition root. */
export interface Timers {
  nowMs(): number;
  schedule(ms: number, fire: () => void): () => void;
}
