import type { NodeReading } from '@wbs/domain/node-reading';
import type { WorkItemStatus } from '@wbs/domain/progress';

/**
 * The colour each status is said in, as its palette token in `styles.css`:
 * on the status strip at a row's left edge, in the Status cell's glyph, and on
 * a dependency line naming the row. `unknown` has none — it is the absence of
 * a saying, and a colour for it would be a colour for "nobody knows".
 *
 * `blocked_by_proxy` is the blocked hue muted, because it is read off the
 * graph rather than said about the row itself (`add-work-item-statuses`,
 * design §7).
 */
export const STATUS_TOKEN: Readonly<Record<WorkItemStatus, string | null>> = {
  unknown: null,
  draft: 'var(--status-draft)',
  ready: 'var(--status-ready)',
  in_progress: 'var(--status-in-progress)',
  blocked_by_proxy: 'var(--status-blocked-by-proxy)',
  on_hold: 'var(--status-on-hold)',
  blocked: 'var(--status-blocked)',
  done: 'var(--status-done)',
};

/**
 * The colour each node reading's corner glyph is said in (`step-node-readings`
 * D4). Shared words take {@link STATUS_TOKEN}'s, `unknown` none for its reason.
 * `waiting` is ready's hue at in progress's lightness — lined up, about to be
 * under way — and `skipped` is the muted chroma of blocked by proxy on a
 * neutral hue, since a skipped node is a fact about the workflow and not a
 * saying about the work.
 */
export const NODE_READING_TOKEN: Readonly<Record<NodeReading, string | null>> = {
  skipped: 'var(--reading-skipped)',
  done: STATUS_TOKEN.done,
  on_hold: STATUS_TOKEN.on_hold,
  blocked: STATUS_TOKEN.blocked,
  in_progress: STATUS_TOKEN.in_progress,
  blocked_by_proxy: STATUS_TOKEN.blocked_by_proxy,
  waiting: 'var(--reading-waiting)',
  unknown: STATUS_TOKEN.unknown,
};
