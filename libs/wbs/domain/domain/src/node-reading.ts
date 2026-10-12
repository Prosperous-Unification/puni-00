import type { Hold, StepState } from './progress';

/**
 * What a step node reads as — its **node reading** (`CONTEXT.md`) — in the
 * order {@link nodeReadingOf} tries them, first match winning. Derived on every
 * read and never stored: the stored statements stay {@link StepState}'s two
 * words, absence meaning unknown (ADR 0032, ADR 0045).
 *
 * `skipped` is in the union before anything produces it, so a later reader
 * that meets it from participation (010.4.13.3) never meets a word its
 * `Record<NodeReading, …>` cannot name.
 */
export const NODE_READINGS = [
  'skipped',
  'done',
  'on_hold',
  'blocked',
  'in_progress',
  'blocked_by_proxy',
  'waiting',
  'unknown',
] as const;
export type NodeReading = (typeof NODE_READINGS)[number];

/** Whether a value off the wire is one of the eight node readings. */
export function isNodeReading(value: unknown): value is NodeReading {
  return typeof value === 'string' && (NODE_READINGS as readonly string[]).includes(value);
}

/**
 * Whether a node takes part in its leaf's work. `null` until
 * `configure-project-step-workflows` (010.4.13.3) stores it; until then no node
 * reads `skipped`.
 */
export type Participation = 'included' | 'skipped';

/** Everything one node's reading is derived from. */
export interface NodeFacts {
  readonly participation: Participation | null;
  /** The node's own progress statement; `null` is unknown. */
  readonly statement: StepState | null;
  /** The leaf's hold: holds are leaf-grain (ADR 0032), so every node of the row shows it. */
  readonly rowHold: Hold | null;
  readonly runningAttempt: boolean;
  /** Whether the leaf reads `blocked_by_proxy` from the work-item graph. */
  readonly rowBlockedByProxy: boolean;
  /**
   * The readings of the node's predecessors in the resolved step-node graph —
   * workflow and authored edges into it — so the reading follows the graph and
   * never re-derives step order.
   */
  readonly predecessors: readonly NodeReading[];
}

/**
 * A node's reading, first match winning: skipped, done, the row's hold, in
 * progress (a statement or a running attempt), the row's proxy, waiting, else
 * unknown (`openspec/changes/step-node-readings/design.md` D1).
 *
 * **Waiting needs at least one predecessor, every one done**: a leaf's first
 * node has nothing handed to it, so it is never waiting. **The hold outranks
 * in progress** for {@link leafStatusOf}'s reason: it is the planner's later
 * word about work that had started. Shared by be-01's wire and fe-01's folds,
 * as `leafStatusOf` is.
 */
export function nodeReadingOf({
  participation,
  statement,
  rowHold,
  runningAttempt,
  rowBlockedByProxy,
  predecessors,
}: NodeFacts): NodeReading {
  if (participation === 'skipped') return 'skipped';
  if (statement === 'done') return 'done';
  // Proof: this clause moved below the in-progress one and `the row's hold
  // shows on its nodes` failed on `Expected: "on_hold", Received:
  // "in_progress"`; watched 2026-10-12.
  if (rowHold !== null) return rowHold;
  if (statement === 'in_progress' || runningAttempt) return 'in_progress';
  if (rowBlockedByProxy) return 'blocked_by_proxy';
  // Proof: `predecessors.length >= 1` dropped and `a first node is never
  // waiting` failed on `Expected: "unknown", Received: "waiting"`; watched
  // 2026-10-12.
  if (predecessors.length >= 1 && predecessors.every((reading) => reading === 'done')) {
    return 'waiting';
  }
  return 'unknown';
}
