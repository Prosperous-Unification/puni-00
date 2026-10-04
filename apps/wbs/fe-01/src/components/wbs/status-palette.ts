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
