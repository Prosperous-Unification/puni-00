import type { PlanRefresh, RefreshResource } from '@/lib/plan-refresh';
import type { CalendarMarkerView, NewCalendarMarkerView, ProjectApi } from '@/lib/wbs-api';

/**
 * Re-exported so delivery imports this module and no other: rule K2 says a
 * screen sees a feature-service and never the resource-service beneath it. The
 * same line stands in `modules/plan-feed/contract.ts`, for the same rule.
 */
export type { CalendarMarkerView, NewCalendarMarkerView };

/**
 * One edit to a project's calendar markers, as a value rather than a call.
 *
 * A value because the two kinds have to talk about the edit twice — the
 * resource sends it, the feature decides whether its answer still matters — and
 * a closure would let only one of them see what was asked for. Rename and
 * recolour are separate arms and not one `edit(name?, color?)`, because be-01
 * answers 422 to a body naming both; {@link ProjectApi.renameCalendarMarker}
 * argues it on the route.
 */
export type CalendarMarkerEdit =
  | { readonly kind: 'add'; readonly marker: NewCalendarMarkerView }
  | { readonly kind: 'rename'; readonly markerId: string; readonly name: string }
  | { readonly kind: 'recolor'; readonly markerId: string; readonly color: string | null }
  | { readonly kind: 'remove'; readonly markerId: string };

/**
 * The part of the HTTP client this resource writes through.
 *
 * Narrowed to the four routes rather than taken whole, so the module's surface
 * states what it can do to a project: nothing here can rename the project or
 * move a work item.
 */
export type CalendarMarkerRoutes = Pick<
  ProjectApi,
  'createCalendarMarker' | 'renameCalendarMarker' | 'recolorCalendarMarker' | 'deleteCalendarMarker'
>;

/** What the writing needs from whoever built it. */
export interface CalendarMarkerPorts {
  readonly projectId: string;
  readonly api: CalendarMarkerRoutes;
}

/**
 * One project's calendar markers, as this browser writes them.
 *
 * The **resource**-service: one aggregate — the markers of one project — the
 * four routes that change it, and the knowledge of what each change leaves out
 * of date. It owns no lifetime and says nothing to anybody; a refusal leaves it
 * as the thrown cause.
 */
export interface CalendarMarkerWrites {
  /**
   * The plan resources one marker edit leaves out of date, accepted or refused.
   *
   * Refused counts: a rename be-01 rejects because a peer already deleted the
   * marker means the list on screen is wrong, not that nothing happened.
   */
  readonly dirtied: readonly RefreshResource[];
  /** Sends one edit. Throws what be-01 refused, unchanged and unworded. */
  readonly send: (edit: CalendarMarkerEdit) => Promise<void>;
}

/** A refusal this module owes the reader, in the terms its words are built from. */
export interface CalendarMarkerRefusal {
  readonly cause: unknown;
}

/**
 * What the gestures need from whoever is hosting them.
 *
 * Every member is a function for {@link PlanWriterHost}'s reason: all of them
 * are read at the moment something happens, not at the moment the module is
 * built. A reader can leave for another project between a write starting and
 * its answer arriving.
 */
export interface CalendarMarkersHost extends CalendarMarkerPorts {
  /**
   * The refresh owner this reader is currently reading through, or `null`
   * before the first one exists and from the instant the reader is withdrawn.
   *
   * Its **identity** is what makes a write this reader's: the same object it
   * started against, still answered. That is the whole test, and no second
   * "is the reader still on screen" question is asked beside it: a feed opens
   * its refresh owner once, and the project runtime answers `null` here from
   * the moment its owner withdraws it (`readRefreshOwner` in
   * `runtime/project-runtime.ts`), so a reader that left and a reader replaced
   * fail the same comparison.
   */
  readonly readRefreshOwner: () => PlanRefresh | null;
  /** Announces one refusal to whoever says things to the reader. */
  readonly announceRefusal: (refusal: CalendarMarkerRefusal) => void;
}

/**
 * The calendar markers a reader may put on the chart, for as long as it owns it.
 *
 * The **feature**-service, and the only thing delivery sees: one piece of
 * user-facing value — the dates a person marks on the chart stay the project's,
 * and a refused one leaves the chart showing what is really there — coordinated
 * over one resource-service. It imports no React (F1).
 *
 * Each gesture resolves when its write and the reread that covers it are done,
 * which is what lets a test await one. Today's caller does not: every one of the
 * four call sites in `wbs-table.tsx` is a `void`, because a chart click has
 * nowhere to await.
 */
export interface CalendarMarkers {
  readonly add: (marker: NewCalendarMarkerView) => Promise<void>;
  readonly rename: (markerId: string, name: string) => Promise<void>;
  readonly recolor: (markerId: string, color: string | null) => Promise<void>;
  readonly remove: (markerId: string) => Promise<void>;
}
