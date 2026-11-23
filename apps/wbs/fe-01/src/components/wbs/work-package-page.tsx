import { Button, Input } from '@ui/saas-01';
import {
  Profiler,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';

import { createStepBoardAction } from '@/components/board/step-board-action';
import { StepBoardView } from '@/components/board/step-board-view';
import { AppHeader } from '@/components/chrome/app-header';
import { LifetimeFault } from '@/components/chrome/lifetime-fault';
import type { Roster } from '@/components/presence/presence-panel';
import { NewProjectDialog } from '@/components/projects/new-project-dialog';
import { type ProjectChoices, ProjectPicker } from '@/components/projects/project-picker';
import type { Recalled } from '@/lib/remembered';
import { useFeatureReachable } from '@/lib/session-features';
import { cn } from '@/lib/utils';
import {
  type CreatedProjectWithWorkPackage,
  WbsRequestError,
  type WorkPackageListEntry,
} from '@/lib/wbs-api';
import type { Presence } from '@/modules/plan-feed/presence-store';
import type { SavedPlans } from '@/modules/saved-plans/contract';
import type { Store } from '@/modules/store';
import type { WorkPackageCatalog, WorkPackageRuntime } from '@/modules/work-package/contract';
import {
  type ApplicationServicesState,
  useApplicationServicesReader,
} from '@/runtime/application-services-context';
import type { SessionWorkPackages } from '@/runtime/session-runtime';

import { useClosedOnDismiss } from './close-on-dismiss';
import { type BesideAnchorRect, HoverCard } from './hover-card';
import { NoWorkPackageOpen } from './no-work-package-open';
import { PlanInteractionProvider, PlanInteractionScope } from './plan-interaction-scope';
import { failureText } from './plan-refusal';
import { useRendererForViewport } from './plan-renderer';
import { SavedPlansPanel } from './saved-plans-panel';
import { recordWbsScrollCommit } from './scroll-performance';
import { ToastStack, useToasts } from './toasts';
import { usePlanImport } from './use-plan-import';
import { WbsTable } from './wbs-table';
import {
  entryMeta,
  groupWorkPackages,
  matchingWorkPackages,
  workPackageCardMeta,
  type WorkPackageGroup,
} from './work-package-picker';

/**
 * One Page-local observation of Project reachability, not mutation authority.
 * Identity changes across withdrawal and restoration so regained true cannot
 * revive an older Project read, gesture or committed reconciliation.
 */
interface ProjectAvailability {
  readonly reachable: boolean;
}

/** The exact opening summary; a newer opening supersedes delayed close focus within the same epoch. */
interface ProjectDialogOrigin {
  readonly availability: ProjectAvailability;
  readonly summary: HTMLElement;
  readonly catalog: WorkPackageCatalog;
}

/** One retained write intent; catalog withdrawal and page publication can supersede its local effects. */
interface ProjectCreationAttempt {
  readonly availability: ProjectAvailability;
  readonly catalog: WorkPackageCatalog;
  readonly epoch: object;
  readonly projectName: string;
  readonly workPackageName: string;
}

/** A validated server commit retained across GET-only reconciliation retries. */
interface CommittedProjectCreation {
  readonly attempt: ProjectCreationAttempt;
  readonly epoch: object;
  readonly creation: CreatedProjectWithWorkPackage;
}

/** Names and visible outcomes belong to one catalog and page publication epoch. */
type ProjectCreationDialog = {
  readonly availability: ProjectAvailability;
  readonly catalog: WorkPackageCatalog;
  readonly epoch: object;
  readonly projectName: string;
  readonly workPackageName: string;
} & (
  | { readonly kind: 'editing' | 'unconfirmed' }
  | { readonly kind: 'refused'; readonly message: string }
  | { readonly kind: 'creating'; readonly attempt: ProjectCreationAttempt }
  | {
      readonly kind: 'created-refreshing' | 'created-refresh-failed' | 'created-unavailable';
      readonly committed: CommittedProjectCreation;
    }
);

/** A heading for actual project metadata or an explicitly unresolved presentation section. */
type WorkPackageOptionSection =
  | ({ kind: 'project' } & WorkPackageGroup<WorkPackageListEntry>)
  | { kind: 'unavailable'; workPackages: WorkPackageListEntry[] };

/** One rendered option order; metadata failure keeps navigation flat and visible. */
type WorkPackageOptionPresentation =
  | {
      kind: 'flat';
      metadata: Exclude<ProjectChoices['kind'], 'ready'>;
      entries: WorkPackageListEntry[];
    }
  | {
      kind: 'grouped';
      sections: WorkPackageOptionSection[];
      entries: WorkPackageListEntry[];
    };

/**
 * Produces the same order for rendering, a newly typed highlight, arrows and card lookup.
 * Known groups follow the first matching package, preserving server-relative children;
 * unresolved rows follow them in their original relative order. This is presentation,
 * never a parent selection, permission decision or additional catalog observation.
 */
function presentWorkPackageOptions(
  workPackages: readonly WorkPackageListEntry[],
  typed: string | null,
  choices: ProjectChoices,
): WorkPackageOptionPresentation {
  const matches = typed === null ? [] : matchingWorkPackages(workPackages, typed);
  if (choices.kind !== 'ready') return { kind: 'flat', metadata: choices.kind, entries: matches };
  const { groups, unresolved } = groupWorkPackages(matches, choices.projects);
  const sections: WorkPackageOptionSection[] = groups.map((group) => ({
    kind: 'project',
    ...group,
  }));
  if (unresolved.length > 0) sections.push({ kind: 'unavailable', workPackages: unresolved });
  return {
    kind: 'grouped',
    sections,
    entries: sections.flatMap((section) => section.workPackages),
  };
}

/** Accessible headings own no selection; only their real package options enter keyboard order. */
function WorkPackageOptionGroups({
  presentation,
  children,
}: {
  presentation: WorkPackageOptionPresentation;
  children: (entry: WorkPackageListEntry) => ReactNode;
}): ReactNode {
  if (presentation.kind === 'flat') return <>{presentation.entries.map(children)}</>;
  return presentation.sections.map((section) => {
    const name = section.kind === 'project' ? section.project.name : 'Project details unavailable';
    const key = section.kind === 'project' ? 'project:' + section.project.id : 'unavailable';
    return (
      <li key={key} role="group" aria-label={name} className="m-0 min-w-0 list-none p-0">
        <div
          aria-hidden="true"
          className="text-muted-foreground max-w-full min-w-0 px-2 py-1 text-xs font-medium break-words"
        >
          {name}
        </div>
        <ul role="presentation" className="m-0 min-w-0 list-none p-0">
          {section.workPackages.map(children)}
        </ul>
      </li>
    );
  });
}

/** The two surfaces for one selected runtime, with a page-local initial Plan view. */
function WorkPackageViews({
  workPackage,
  view,
  onSelect,
  selectorHost,
  isDesktop,
  children,
}: {
  workPackage: WorkPackageRuntime;
  view: 'plan' | 'board';
  onSelect: (workPackage: WorkPackageRuntime, view: 'plan' | 'board') => void;
  selectorHost: HTMLSpanElement | null;
  isDesktop: boolean;
  children: (viewControls: ReactNode) => ReactNode;
}): React.JSX.Element {
  // Proof: replacing this selected-runtime instance with a shared scope and
  // omitting its cleanup made `discards a suspended draft when its selected
  // runtime is withdrawn` restore p2's draft in the next runtime. Watched
  // 2026-10-06.
  const [interaction] = useState(() => new PlanInteractionScope());
  // Proof: keying this action by `view` recreated it on Board remount; the mounted
  // `keeps a Board step move admitted across Board remount and a Plan write`
  // test found its second move button enabled while the first request was held.
  const boardAction = useMemo(() => createStepBoardAction(workPackage), [workPackage]);
  const movesFocus = useRef(false);
  /** Ref callbacks run after DOM mutations; null means the old selector detached. */
  const focusSelector = (selector: HTMLButtonElement | null, selected: 'plan' | 'board'): void => {
    if (selector === null || !movesFocus.current || view !== selected) return;
    // Proof: suppressing focus failed `keeps view controls in the phone toolbar and keyboard
    // focus on the selected view`: the visible Board selector was not focused after Enter.
    selector.focus();
    movesFocus.current = false;
  };
  const delivered = useSyncExternalStore(workPackage.plan.subscribe, workPackage.plan.snapshot);
  useEffect(() => {
    // Proof: omitting this prune made `prunes a held field when its row is
    // deleted from the delivered tree` restore Deleted draft into the same
    // identity after an authoritative deletion and restore. Watched 2026-10-06.
    if (delivered.tree !== null) interaction.prune(delivered.tree.value);
  }, [delivered.tree, interaction]);
  useEffect(
    () => () => {
      interaction.dispose();
    },
    [interaction],
  );
  const selectView = (next: 'plan' | 'board'): void => {
    if (next === 'plan') boardAction.cancel();
    interaction.select(next);
    movesFocus.current = next !== view;
    onSelect(workPackage, next);
  };
  // On a phone the pair shares a row with `Plan actions`, a default-size
  // button, so it takes that button's 14px words rather than `sm`'s 12px: one
  // row, one type size (ui-review F-160).
  const phoneSelector = isDesktop ? undefined : 'min-h-11 text-sm';
  const viewControls = (
    // `outline` so the view that is not shown is plain and the shown one wears the
    // button's pressed fill (ui-review F-116): two filled buttons said nothing.
    <div role="group" aria-label="Work package view" className="flex shrink-0 gap-1">
      <Button
        ref={(selector) => {
          focusSelector(selector, 'plan');
        }}
        variant="outline"
        size="sm"
        className={phoneSelector}
        type="button"
        data-work-package-view-selector
        aria-pressed={view === 'plan'}
        onPointerDown={() => {
          interaction.suspendFocused();
        }}
        onClick={() => {
          selectView('plan');
        }}
      >
        Plan
      </Button>
      <Button
        ref={(selector) => {
          focusSelector(selector, 'board');
        }}
        variant="outline"
        size="sm"
        className={phoneSelector}
        type="button"
        data-work-package-view-selector
        aria-pressed={view === 'board'}
        onPointerDown={() => {
          interaction.suspendFocused();
        }}
        // Proof: injecting setStatus here failed `sends no Plan commands from
        // Board pointer, keyboard, drag or view changes` on one recorded
        // status write. Watched in the selected runtime on 2026-10-06.
        onClick={() => {
          selectView('board');
        }}
      >
        Board
      </Button>
    </div>
  );
  return (
    <>
      {isDesktop && selectorHost !== null && createPortal(viewControls, selectorHost)}
      {!isDesktop && view === 'board' && viewControls}
      <div
        className={view === 'board' ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}
        hidden={view === 'board'}
        inert={view === 'board'}
      >
        <PlanInteractionProvider scope={interaction}>
          {children(!isDesktop && view === 'plan' ? viewControls : null)}
        </PlanInteractionProvider>
      </div>
      {view === 'board' && (
        <StepBoardView
          workPackage={workPackage}
          action={boardAction}
          onReturnToPlan={() => {
            selectView('plan');
          }}
        />
      )}
    </>
  );
}

export interface WorkPackagePageProps {
  /**
   * The work packages this account can see — the signed-in session's catalog, from
   * router context. Listing, creating, renaming, marking opened and importing
   * all go through it; the page holds no client.
   */
  catalog: WorkPackageCatalog;
  /**
   * The owner of the selected work package's runtime: the signed-in session's, from
   * router context. The page names a work package by id and the session opens it
   * over its own client and stream.
   *
   * The session's and not this page's, because the session's retirement has to
   * retire the work package first — a page's own owner would be given back whenever
   * React happened to run its cleanup, and a session could let go while its
   * work package still held a socket. The page opens and leaves through it; the
   * session refuses an open once it has been withdrawn.
   */
  workPackages: SessionWorkPackages;
  /**
   * The signed-in account's id, which the plan's row menu claims for the
   * person bound to it (`wbs-claim-display` 11.2). Required here, so the page
   * the router draws always offers Claim; only a suite drawing the table alone
   * leaves it out.
   */
  viewerAccountId: string;
  /**
   * Who else is in the work package, for the right-hand end of the header bar.
   *
   * A function of the roster rather than the panel itself, because what the
   * panel needs — the session's own username — is the app's and not this
   * page's.
   *
   * **The roster is handed in, and it arrives on the table's own socket.** The
   * panel opened a second WebSocket per work package until 2026-09-02; it is
   * presentational now, and this page owns the one stream both halves of the
   * screen are fed by. `users` is empty while no work package is open, which is a
   * real state — a fresh account with nothing selected has no roster to be in —
   * and `connected` says whether the socket carrying it is up.
   */
  presence?: (roster: Roster) => ReactNode;
  /** The account menu, for the same reason and the same end of the bar. */
  account?: ReactNode;
  /** The two-page navigation, from router context — see `app-router.tsx`. */
  nav?: ReactNode;
}

/**
 * The work package this browser was last in, over the runtime `services` names — or
 * nothing, **not remembered**, when no runtime is live to ask.
 *
 * Reached through the preferences service like every other key, and **judged**
 * nowhere near it: its claim is tested against the work package list this load just
 * fetched, not against a shape, so there is nothing to hand a guard built once
 * — `found.some(...)` is the whole validity rule and it is different on every
 * load. That is what the unchecked shape is for, and why the empty string is
 * held rather than refused: a held empty string still reaches
 * `installWorkPackages`, which drops the key, and a refusal would leave it in
 * storage for ever.
 *
 * `services` is read at the instant of the call — the page reads it through
 * `useApplicationServicesReader` when a list load lands, which can be long after
 * the render that started it — and with no runtime live nothing is read and
 * nothing throws: the page simply restores no work package. See {@link Recalled}.
 */
export function recallLastWorkPackage(services: ApplicationServicesState): Recalled<string | null> {
  // Proof: on 2026-09-24, answering `persists: true` here failed `restores nothing and remembers
  // nothing when no runtime is live` on `expected { value: null, persists: true } to deeply equal
  // { value: null, persists: false }`.
  if (services.status !== 'live') return { value: null, persists: false };
  return { value: services.remembered.lastOpenedWorkPackage.read(), persists: true };
}

/**
 * The name be-01 writes for a work package nobody has named yet.
 *
 * Named here rather than typed twice: it is both what the create route is
 * asked for and what the rename field opens holding, and two literals that
 * must agree is one of them going stale.
 */
/** Nobody, not connected: the honest answer before any socket has spoken. */
const NOBODY: Presence = { users: [], connected: false };

/** The presence the header is handed while no work package runtime is published. */
const NOBODY_HERE: Store<Presence> = {
  subscribe: () => () => undefined,
  snapshot: () => NOBODY,
};

const PLACEHOLDER_WORK_PACKAGE_NAME = 'New work package';

/**
 * Writes, or forgets, which work package this browser was last in — into the runtime
 * `services` names, and answers whether one was live to take it.
 *
 * Deliberately **not** through `lib/remembered.ts`, and this is the one store
 * that stays hand-written: its claim is judged against the work package list this
 * load just fetched, not against a shape, so there is nothing to hand a guard
 * built once at module scope — `found.some(...)` is the whole validity rule and
 * it is different on every load. What it shares with the other ten is
 * `getItem`, `removeItem` and the reading that a disproved claim is dropped
 * rather than left to be re-offered; what it does not share is the part
 * `remembered` exists to hold.
 */
export function rememberLastWorkPackage(
  services: ApplicationServicesState,
  id: string | null,
): boolean {
  // Proof: on 2026-09-24, answering `true` here failed `stops remembering once its runtime is
  // withdrawn, and never throws` on `expected true to be false`.
  if (services.status !== 'live') return false;
  const store = services.remembered.lastOpenedWorkPackage;
  if (id === null) store.forget();
  else store.write(id);
  return true;
}

/**
 * Where an option's card opens: the **listbox's** own horizontal bounds, at
 * the option's row — or null while the option is scrolled out of the list.
 *
 * The list's edges rather than the option's, and that is the whole of the fix
 * this function carries. A card anchored to the option opens on top of the
 * list, so the card somebody opened to tell two work packages apart covers the
 * other work packages they were comparing it against. Moving it right by a constant
 * instead cannot work: the constant would have to be the list's width, which
 * varies with the longest work package name.
 *
 * The option contributes its `top` and nothing else, which is what "the card
 * follows the pointer down the list and never across it" means.
 *
 * Proof: put back to the option's own rect under the old `anchor` placement —
 * `the open card leaves every option visible` failed on `the card opens at
 * 45px in a list ending at 240: expected 45 to be greater than or equal to
 * 240`, with the other three placement tests failing beside it. And with the
 * option's rect read through *this* placement (`left: box.left, right:
 * box.right`), `moving down the list does not move the card sideways` failed
 * on `expected '241px' to be '246px'` — the five pixels of border and padding
 * the option is inset by, which is the only difference a browser can show
 * between the two rectangles, since every option in a `w-full` list shares its
 * width. Watched 2026-08-29.
 */
function workPackageOptionAnchor(
  id: string | null,
  listbox: HTMLElement | null,
): BesideAnchorRect | null {
  if (id === null || listbox === null) return null;
  const option = document.getElementById(`work-package-option-${id}`);
  if (option === null) return null;
  const box = option.getBoundingClientRect();
  const list = listbox.getBoundingClientRect();
  if (box.bottom <= list.top || box.top >= list.bottom) return null;
  return { left: list.left, right: list.right, top: box.top };
}

/**
 * The portalled work package preview, isolated so scroll remeasurement does not
 * rerender the page's table.
 */
function WorkPackageOptionCard({
  entry,
  now,
  layout,
}: {
  entry: WorkPackageListEntry | undefined;
  now: Date;
  /** Stable read-state, heading/content and order identity for same-ID row movements. */
  layout: object;
}): ReactNode {
  const id = entry?.id ?? null;
  const [anchor, setAnchor] = useState<BesideAnchorRect | null>(null);
  useLayoutEffect(() => {
    const listbox = document.getElementById('work-package-options');
    const remeasure = () => {
      setAnchor(workPackageOptionAnchor(id, listbox));
    };
    remeasure();
    listbox?.addEventListener('scroll', remeasure);
    return () => {
      listbox?.removeEventListener('scroll', remeasure);
    };
  }, [id, layout]);

  if (entry === undefined || anchor === null) return null;
  const meta = workPackageCardMeta(entry, now);
  return (
    <HoverCard beside={anchor} label={entry.name}>
      <div className="font-medium break-words">{entry.name}</div>
      <div className="text-muted-foreground">
        {meta.creation}
        {entry.restricted ? ' · Restricted' : ''}
      </div>
      <div className="text-muted-foreground">{meta.start}</div>
      <div className="text-muted-foreground">{meta.lastOpened}</div>
    </HoverCard>
  );
}

/**
 * The box a work package's new name is typed into while a rename is armed.
 *
 * A component rather than a callback ref on the picker's own `<Input>`, and
 * the reason is the selection: an inline callback ref is a new function on
 * every render, so React detaches and reattaches it on **every keystroke**,
 * and a `select()` there would put the whole draft back under the next
 * character typed. Mounting is the one moment a rename is armed, which is
 * exactly when the focus and the selection belong.
 *
 * Proof, both halves. With the `select()` deleted, `creating a workPackage selects
 * the whole placeholder name` failed on `expected [ 11, 11 ] to deeply equal
 * [ +0, 11 ]` — the caret at the end of `New workPackage` rather than a selection
 * over it. With the effect's dependency list removed, so it ran on every
 * render as an inline ref would, `does not put the whole draft back under the
 * next keystroke` failed on `expected [ +0, 1 ] to deeply equal [ 1, 1 ]` —
 * the one typed character selected again, and gone on the next. Watched
 * 2026-08-29.
 */
function WorkPackageNameField({
  draft,
  selectsWholeDraft,
  onDraft,
  onCommit,
  onCancel,
}: {
  draft: string;
  /** Whether the whole draft is selected on arming, so one keystroke replaces it. */
  selectsWholeDraft: boolean;
  onDraft: (draft: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}): ReactNode {
  const field = useRef<HTMLInputElement | null>(null);
  useLayoutEffect(() => {
    const node = field.current;
    // Narrowing, not a guard: a layout effect runs on a mounted node, so no
    // injected fault can make this null and a throw here would be a check
    // whose failure can never be observed. That the focus happens at all is
    // asserted instead, by `creating a workPackage puts the caret in its name`.
    if (node === null) return;
    node.focus();
    if (selectsWholeDraft) node.select();
    // Once per arming: `key` on the caller remounts this for another work package.
  }, [selectsWholeDraft]);
  return (
    <Input
      ref={field}
      className="h-8 max-w-72 min-w-0 flex-1"
      aria-label="Work package name"
      value={draft}
      onChange={(e) => {
        onDraft(e.target.value);
      }}
      // Blur commits — the proposal's word — which also gives the rename a
      // mouse exit: click anywhere else and the mode resolves instead of
      // sitting open forever.
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommit();
        }
        if (e.key === 'Escape') onCancel();
      }}
    />
  );
}

/**
 * Picks a work package, remembers the pick, renames it, then hands it to the table.
 *
 * It renders the page's two structural pieces: the {@link AppHeader} the picker
 * lives in, and the `<main>` the table fills. The header is here rather than in
 * `App` because the picker is the bar's widest control and its state — the
 * list, the selection, the rename in progress — is this page's; `App` passes in
 * the two slots that belong to the session instead.
 *
 * `<main>` is a column flex that takes the rest of the window, and from it down
 * to `TABLE_FRAME` there is one unbroken `flex-1` / `min-h-0` chain. Break a
 * link of it and the frame stops being the thing that scrolls — the page starts
 * scrolling instead and the heading row scrolls away with it, which is the
 * failure `table-frame.ts` describes.
 */

/**
 * The saved-plan shelf: a disclosure in the app header's work package row, beside
 * the picker, Rename work package and Create new work package.
 *
 * **Its own component, after a bug this had.** Held on {@link WorkPackagePage}
 * (which renders first with no work package selected and therefore no shelf), the
 * former one-shot version of `useClosedOnDismiss` ran before the
 * `<details>` existed and never installed its listener. Caught by the Gemini
 * seat on PR 202 as F-01. The hook now follows a late-mounted node itself; this
 * component remains the shelf's boundary and keeps the layout decisions below
 * local to the element they describe.
 *
 * **And its own component is also why the second fault was cheap to repair.**
 * It shipped `absolute right-4 bottom-2 z-40` against `<main>`, which sat it on
 * top of the chart's `[data-gantt-fullscreen-toggle]` and
 * `[data-gantt-svg-download]` — the last two children of a control strip that
 * packs from the left, so no other corner is better — and put `z-40` above the
 * full-screen chart's `aria-modal` layer. Gemini F-03 and Sol I4, found
 * independently. The repair is to stop floating, and `z-50` on the panel is
 * what the chart's modal now outranks.
 *
 * **Costing the plan column nothing is not a preference, and this is the
 * fourth shape to try for it.** The first three each failed to a browser
 * measurement that already existed, and the list is the argument for where it
 * ended up:
 *
 * 1. *A flex sibling of the table* (`mt-2 max-h-64 shrink-0`): `shrink-0` did
 *    exactly what it says — ~76px off the one column whose whole invariant is
 *    reaching the bottom of the window. Four measurements said so at once —
 *    `header.spec.ts:272` wanted the frame >= 634 and got 601, `:289` and
 *    `plan-surface.spec.ts:278` both wanted <= 16px under the surface and got
 *    76, and `plan-surface.spec.ts:318` said the same for a plan that fills the
 *    frame. Raising those thresholds is the wrong repair:
 *    `plan-surface.spec.ts:300` exists to say that what reaches the bottom must
 *    be the chart itself, "not a control strip that parted company with it".
 *    Above the table is no better — `:272` measures the frame's own
 *    `clientHeight`, so height lost anywhere in the column fails it the same —
 *    and inside the scrolling frame is ruled out by `plan-surface.spec.ts:288`,
 *    which requires `frame.scrollHeight === frame.clientHeight` on a short plan.
 * 2. *A floating chip over `<main>`*: the two findings above.
 * 3. *A plain control in the plan toolbar*, handed to the table's own row.
 *    "It costs the column no height because that row already exists" is true
 *    only **while the row does not gain a line**, and it does: the row has a
 *    measured width budget with a named margin for exactly one more control,
 *    and "Saved plans" spent it. Run
 *    [33871922414](https://github.com/Prosperous-Unification/wbs-tool-v1/actions/runs/33871922414)
 *    at `14a1a070`, 2 failed / 281 passed —
 *    `work-package-settings.spec.ts:77` ("the toolbar keeps its 1280 budget with one
 *    settings control") measures `[data-toolbar]`'s children against 1265px and
 *    a fifth disclosure puts it over, and `gantt.spec.ts:2605`
 *    ("re-measures the room when the toolbar wraps under a new control") needs
 *    the bar to be **one** row at 768 before the drag that adds `Reset layout`
 *    makes it two — with this control on it the bar is already two, so the
 *    wrap the case is about cannot be observed.
 * 4. *The app header's work package row*, which is where it is. The header is
 *    `shrink-0` with `md:flex-nowrap` and a `max-w` picker that takes the
 *    slack, so a control added here changes no height at any laptop width — it
 *    narrows the picker instead of wrapping (`header.spec.ts`, "keeps the
 *    header to one row at every laptop width"). It costs `[data-toolbar]`
 *    nothing because it is not in it, and it costs the plan column nothing
 *    because it is not in that either: the header is outside `<main>`.
 *
 * **And the header is where it belongs rather than merely where it fits.**
 * These are the plans saved for *this work package*, and the row it now sits in is
 * the work package's own — pick a work package, rename it, start a new one, read its
 * history.
 *
 * **On a phone it is not in that row, and the reason is 21.4 measured pixels.**
 * The header's work package group takes a line of its own below `md`, and with the
 * shelf on it that line costs 36px: the phone header is 137px in three rows and
 * `[data-plan-cards]` starts at 195. `mobile.spec.ts:850` needs the card
 * scroller's top at 173.6 or less — the sheet is capped at `85vh`, so its top
 * is 126.6, and a card's `Plan actions` trigger sits 55px below the scroller's
 * own top edge, which is where the last card lands at the scroll ceiling. So
 * the guard's goal was *unreachable*, not unreached, and no padding closes it:
 * `[data-plan-cards]` is `flex-1 min-h-0` and padding is not shrinkable, so
 * past its 641px the content box clamps to 0 and `scrollHeight - clientHeight`
 * does not move (13372 both times, measured on h2puni 2026-09-04).
 *
 * Taking the shelf off that row drops the header to 101 and the scroller to
 * 159 — clearing the criterion by 14.6px — and puts the remaining three
 * controls back on row 1 at 132.125px, so run 16's 25px of horizontal overflow
 * does not come back with them. Both numbers are a browser's, from a throwaway
 * probe run before this shape was written rather than a CI cycle after it.
 *
 * So the shelf is drawn by whichever surface the viewport is already using: the
 * header's work package row on a table viewport, and the phone's `Plan actions`
 * sheet on a cards one. {@link useRendererForViewport} decides, so exactly one
 * of the two is mounted at any width and neither is a hidden duplicate. Below
 * `md` it cannot simply be *absent* — AC #2 is "saved plans are available
 * chronologically", and a phone is the surface this task exists for.
 */
/**
 * Which surface is drawing it, which is the whole of what differs between
 * the two: the panel *floats* over the page from the header, and *flows*
 * inside the sheet.
 *
 * A phone cannot have the floating one. It is `absolute right-0 w-96` — 384px
 * anchored to the chip's right edge — so on a 390px screen it paints off the
 * left of the viewport, which is the horizontal overflow four e2e cases
 * already fail on. Inside the sheet there is nothing to float over anyway:
 * the sheet is a bottom sheet that already owns the width, so the panel is
 * an ordinary block in it and the sheet grows by exactly what is open.
 */
/**
 * One in-flow child of WorkPackageActions at every renderer width. The preceding
 * header/sheet placement narratives record earlier measured layouts; they no
 * longer describe the host. Selected-runtime ownership, key and comparison pin
 * remain unchanged, while resizing no longer remounts this shelf.
 */
function SavedPlanShelf({
  workPackageId,
  savedPlans,
}: {
  workPackageId: string;
  /** The live work package runtime's saved plans, which own the shelf's watch. */
  savedPlans: SavedPlans;
}): ReactNode {
  return (
    /*
      `shrink-0` for the reason the brand and the two fold-in buttons beside it
      carry one: above `md` the header is `flex-nowrap`, and what absorbs a new
      control is the picker's `max-w` slack. Shrinkable, this chip would give up
      its own width first and the label would clip before the picker gave an
      inch. In the sheet the chip is instead the full width of the sheet, which
      is what the controls beside it are.
    */
    /* Current: the preserved layout narrative above is historical; this shelf now flows inside the stable actions branch. */
    <details ref={useClosedOnDismiss()} data-saved-plans className="w-full min-w-0">
      <summary
        className="border-control-edge flex min-h-8 cursor-pointer items-center rounded-md border px-3 py-1 text-xs select-none max-md:min-h-11"
        data-hint="The plans saved for this work package, and what changed since one of them"
      >
        Saved plans
      </summary>
      <div
        data-saved-plans-panel
        className="bg-popover mt-1 max-h-80 w-full min-w-0 overflow-y-auto rounded-md border p-3 text-sm shadow-md"
      >
        <SavedPlansPanel workPackageId={workPackageId} savedPlans={savedPlans} />
      </div>
    </details>
  );
}

/** Closes the exact actions disclosure and returns its still-visible dialog focus origin. */
function closeWorkPackageActions(control: HTMLElement): HTMLElement {
  const panel = control.closest('details');
  const summary = panel?.querySelector(':scope > summary');
  if (panel === null || !(summary instanceof HTMLElement))
    throw new Error('Work package actions has no native disclosure summary');
  panel.open = false;
  return summary;
}

/**
 * The single destination field stays page-owned while its presentation collapses.
 * Dismissal uses the toolbar's existing native disclosure contract. Opening the
 * existing creation dialog first closes the panel and focuses its summary so
 * the dialog returns focus to a visible control rather than its hidden button.
 */
/** Groups real package actions and its single saved-plan shelf without owning any write state. */
function WorkPackageActions({
  children,
  onNewProject,
  isProjectCurrent,
}: {
  children: ReactNode;
  onNewProject: (summary: HTMLElement) => void;
  isProjectCurrent: () => boolean;
}): ReactNode {
  return (
    <details ref={useClosedOnDismiss()} className="relative shrink-0">
      <summary
        aria-label="Work package actions"
        className="border-control-edge flex h-8 w-18 cursor-pointer items-center justify-center rounded-md border px-2 text-xs select-none max-md:h-11"
      >
        Actions
      </summary>
      <div className="bg-popover fixed right-4 left-4 z-50 mt-1 max-h-[min(28rem,calc(100dvh-8rem))] overflow-y-auto rounded-md border p-3 text-sm shadow-md sm:absolute sm:right-0 sm:left-auto sm:w-80">
        {children}
        <Button
          size="sm"
          variant="outline"
          type="button"
          className="mt-3 max-md:h-11"
          disabled={!isProjectCurrent()}
          onClick={(event) => {
            if (!isProjectCurrent()) return;
            const summary = closeWorkPackageActions(event.currentTarget);
            summary.focus();
            onNewProject(summary);
          }}
        >
          New project
        </Button>
      </div>
    </details>
  );
}

export function WorkPackagePage({
  catalog,
  workPackages: workPackageOwner,
  presence,
  account,
  nav,
  viewerAccountId,
}: WorkPackagePageProps) {
  const projectsReachable = useFeatureReachable('organizations');
  const currentProjectAvailability = useRef<ProjectAvailability>({ reachable: projectsReachable });
  if (currentProjectAvailability.current.reachable !== projectsReachable)
    currentProjectAvailability.current = { reachable: projectsReachable };
  const projectAvailability = currentProjectAvailability.current;
  /**
   * The picker's own box, for the one thing state cannot say: give up the
   * keyboard. See {@link WorkPackagePage}'s `choose`.
   */
  const pickerBox = useRef<HTMLInputElement | null>(null);
  const [workPackages, setWorkPackages] = useState<WorkPackageListEntry[]>([]);
  /** Whether a list load has landed, so an empty home is never drawn before one. */
  const [listed, setListed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentCatalog = useRef<WorkPackageCatalog | null>(catalog);
  currentCatalog.current = catalog;
  useEffect(() => {
    currentCatalog.current = catalog;
    return () => {
      currentCatalog.current = null;
    };
  }, [catalog]);
  const [publicationEpoch, setPublicationEpoch] = useState<object>(() => ({}));
  const currentPublicationEpoch = useRef(publicationEpoch);
  const [projectDialog, setProjectDialog] = useState<ProjectCreationDialog | null>(null);
  /** Required publication failures reach the Error Boundary without losing an undefined cause. */
  const [publicationFailure, setPublicationFailure] = useState<{
    readonly cause: unknown;
    readonly availability: ProjectAvailability;
  } | null>(null);
  const projectDialogOrigin = useRef<ProjectDialogOrigin | null>(null);
  const activeProjectAttempt = useRef<ProjectCreationAttempt | null>(null);
  const isProjectRequestPending = useRef(false);
  const visibleProjectDialog =
    projectAvailability.reachable &&
    projectDialog?.catalog === catalog &&
    projectDialog.availability === projectAvailability &&
    projectDialog.epoch === publicationEpoch
      ? projectDialog
      : null;
  const isPublicationCurrent = useCallback(
    () =>
      currentCatalog.current === catalog && currentPublicationEpoch.current === publicationEpoch,
    [catalog, publicationEpoch],
  );
  const capturePublication = useCallback(() => {
    const epoch = currentPublicationEpoch.current;
    return () => currentCatalog.current === catalog && currentPublicationEpoch.current === epoch;
  }, [catalog]);
  /** Captures Project availability in addition to the existing ordinary publication boundary. */
  const isProjectCurrent = useCallback(
    () =>
      projectAvailability.reachable &&
      currentProjectAvailability.current === projectAvailability &&
      isPublicationCurrent(),
    [projectAvailability, isPublicationCurrent],
  );
  const captureProjectPublication = useCallback(() => {
    const isPublished = capturePublication();
    return () =>
      projectAvailability.reachable &&
      currentProjectAvailability.current === projectAvailability &&
      isPublished();
  }, [projectAvailability, capturePublication]);
  const [projectChoices, setProjectChoices] = useState<{
    availability: ProjectAvailability;
    catalog: WorkPackageCatalog;
    choices: ProjectChoices;
  }>({ availability: projectAvailability, catalog, choices: { kind: 'loading' } });
  const [projectSelection, setProjectSelection] = useState<{
    availability: ProjectAvailability;
    catalog: WorkPackageCatalog;
    id: string;
  } | null>(null);
  const [projectRefresh, setProjectRefresh] = useState(0);
  const visibleProjectChoices = useMemo<ProjectChoices>(
    () =>
      !projectAvailability.reachable
        ? { kind: 'inactive' }
        : projectChoices.catalog === catalog && projectChoices.availability === projectAvailability
          ? projectChoices.choices
          : { kind: 'loading' },
    [catalog, projectChoices, projectAvailability],
  );
  const projectId =
    projectSelection?.catalog === catalog &&
    projectSelection.availability === projectAvailability &&
    visibleProjectChoices.kind === 'ready' &&
    visibleProjectChoices.projects.some((project) => project.id === projectSelection.id)
      ? projectSelection.id
      : null;
  useEffect(() => {
    let accepting = true;
    const isCurrent = captureProjectPublication();
    if (!isCurrent()) return;
    setProjectChoices({ availability: projectAvailability, catalog, choices: { kind: 'loading' } });
    void catalog.listProjects().then(
      (projects) => {
        if (!accepting || !isCurrent()) return;
        setProjectChoices((current) =>
          accepting && isCurrent()
            ? { availability: projectAvailability, catalog, choices: { kind: 'ready', projects } }
            : current,
        );
        setProjectSelection((selection) => {
          if (!accepting || !isCurrent()) return selection;
          return selection?.catalog === catalog &&
            selection.availability === projectAvailability &&
            !projects.some((project) => project.id === selection.id)
            ? null
            : selection;
        });
      },
      (cause: unknown) => {
        if (!accepting || !isCurrent()) return;
        setProjectChoices((current) =>
          !accepting || !isCurrent()
            ? current
            : {
                availability: projectAvailability,
                catalog,
                choices: {
                  kind:
                    cause instanceof WbsRequestError && cause.problem.kind === 'refusal'
                      ? 'refused'
                      : 'failed',
                  message:
                    cause instanceof WbsRequestError && cause.problem.kind === 'refusal'
                      ? 'Projects are unavailable. Check your organization and try again.'
                      : 'Projects could not be loaded. Try again.',
                },
              },
        );
      },
    );
    return () => {
      accepting = false;
    };
  }, [catalog, projectRefresh, captureProjectPublication, projectAvailability]);
  /**
   * The selected work package's runtime — its feed, its writer, its marker gestures
   * and its commands — as the session's work package owner publishes it: opened
   * once per selected work package by the effect below, never in render, and given
   * back when the selection moves, this page goes, or the session is left.
   */
  const workPackageState = useSyncExternalStore(
    workPackageOwner.subscribe,
    workPackageOwner.snapshot,
  );
  const [viewFor, setViewFor] = useState<{
    workPackage: WorkPackageRuntime;
    view: 'plan' | 'board';
  } | null>(null);
  const view =
    workPackageState.status === 'live' && viewFor?.workPackage === workPackageState.services
      ? viewFor.view
      : 'plan';
  /**
   * Who else is in the selected work package, and whether the socket saying so is
   * up: the work package runtime's own presence, which its stream writes into.
   *
   * **Reset by a work package switch**, and that is the decision rather than an
   * accident: while no runtime is published — the instant the old work package is
   * withdrawn, until the next one is live — the header is handed nobody,
   * disconnected, and then the next work package's own store, which starts from
   * nobody until its own stream says who is there. A roster is one work package's,
   * so the previous work package's list is never shown under the next one's name.
   */
  // Proof: on 2026-09-25, handing the header the last live runtime's presence through the
  // gap failed `draws no table and hands the header nobody while the last workPackage lets go`:
  // expected { users: [ 'kat', 'lee' ], …(1) } to deeply equal { users: [], connected: false }.
  const presenceStore =
    workPackageState.status === 'live' ? workPackageState.services.presence : NOBODY_HERE;
  const roster: Roster = useSyncExternalStore(presenceStore.subscribe, presenceStore.snapshot);
  /**
   * Opens the selected work package's runtime, and leaves it when the selection or
   * the session's work package owner changes, or the page goes.
   *
   * Every trigger reaches the one owner, so a switch and an unmount each
   * withdraw the old runtime before anything else happens and retire it once;
   * the next is published only after that retirement succeeded, and a
   * retirement that fails leaves the owner fatal. Strict Mode's re-entry finds
   * nothing selected — the page mounts with no selection — and opens nothing.
   */
  useEffect(() => {
    if (selected === null) return;
    void workPackageOwner.open(selected);
    // Proof: on 2026-09-24, this cleanup replaced by `return undefined` failed `closes the selected
    // work package’s stream once the page goes` on `expected +0 to be 1`: the socket was never closed.
    // Proof: on 2026-09-25, the same `return undefined` failed `opens one runtime per pick
    // under Strict Mode, and gives each back once` on `expected 'live' to be 'empty'`, and,
    // through the router, `gives the workPackage back once when its route goes, keeps the session,
    // and opens a new runtime on return` on `expected [ 'session built', 'work package p1 built' ]
    // to include 'work package p1 given back'`.
    return () => {
      void workPackageOwner.leave();
    };
  }, [workPackageOwner, selected]);
  const toastApi = useToasts();
  /**
   * The rename in progress, or null while the picker is showing.
   *
   * It carries the id of the work package it was opened for, and the commit uses
   * that id — never the current selection. Cross review #6's one critical
   * finding, from all three reviewers: with only the draft stored, arming a
   * rename and then creating a work package sent the old draft to the new work package.
   */
  const [rename, setRename] = useState<{
    workPackageId: string;
    draft: string;
    /**
     * Whether the draft is the placeholder name a create put there, which the
     * field selects whole so the first keystroke replaces it.
     *
     * False for the ✎, which arms a rename on a name somebody chose: selecting
     * that would put a whole considered name one keystroke from gone.
     */
    draftIsPlaceholder: boolean;
  } | null>(null);
  /**
   * What has been typed into the picker, and which entry is highlighted — or
   * null while the picker is closed.
   *
   * `null` rather than a separate `open` flag: "closed" and "nothing typed"
   * are two different states (a closed picker shows the work package's name, an
   * open empty one shows every work package), and two booleans that must agree is
   * one more thing to keep in step. The highlight is an entry's id, never an
   * index — the same reason the Depends on picker holds one (cross review #6).
   */
  const [search, setSearch] = useState<{ typed: string; highlightId: string | null } | null>(null);
  /**
   * Which entry the pointer is resting on, or null.
   *
   * Separate from the keyboard's `highlightId` because they are two different
   * facts about the same list: the pointer can rest on one entry while the
   * keyboard (or the initial highlight) points at another. The card and its
   * anchor are resolved from whichever of the two is active,
   * pointer-first.
   */
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  /**
   * Owns the hover at the list's lifecycle boundary.
   *
   * `hoveredId` is set on an option's `mouseenter` and cleared only on its
   * `mouseleave`. Every close path — Escape, blur, and `choose` — unmounts the
   * options without firing that `mouseleave`, so the pointer id it last held
   * outlives the list it pointed into. A reopened list would then show the
   * last-hovered work package's card even while the keyboard highlights another (or
   * nothing). Cleared here, whenever the picker closes, so a closed list owns
   * no hover.
   */
  useEffect(() => {
    if (search === null) setHoveredId(null);
  }, [search]);

  /**
   * The page's runtime as it is when a callback runs — a list load or a create
   * lands long after the render that started it, and a click can arrive before
   * React has re-rendered for a slot that has already moved on.
   */
  const readServices = useApplicationServicesReader();

  const installWorkPackages = useCallback(
    (found: WorkPackageListEntry[], isCurrent: () => boolean) => {
      if (!isCurrent()) return;
      const url = new URL(window.location.href);
      // `/?workPackage=<id>` opens a work package (a space row links here); with
      // `stepNode` it also focuses a step node.
      const linkedWorkPackage = url.searchParams.get('workPackage');
      const hasLinkedWorkPackage =
        linkedWorkPackage !== null &&
        found.some((workPackage) => workPackage.id === linkedWorkPackage);
      const brokenLink = linkedWorkPackage !== null && !hasLinkedWorkPackage;
      // Proof: bypassing this refusal changed the alert to "Step link is invalid."
      // while the missing work package's URL was consumed by p1 (2026-09-27).
      if (brokenLink) {
        const naming = url.searchParams.has('stepNode') ? 'Step link' : 'Work package link';
        url.searchParams.delete('workPackage');
        url.searchParams.delete('stepNode');
        url.searchParams.delete('workItem');
        window.history.replaceState(window.history.state, '', url.href);
        // Said on the page rather than as a toast: toasts are drawn by the
        // table, and a link that opens nothing leaves no table to draw them.
        setError(`${naming} names a work package you cannot open.`);
      }
      // The link's selection is a real choice. Keep it across a later reload,
      // just as choosing the work package from the picker does.
      // Proof: without this write the WorkPackagePage link test still focused p1,
      // but storage stayed at p2 (2026-09-27).
      if (hasLinkedWorkPackage) {
        rememberLastWorkPackage(readServices(), linkedWorkPackage);
      }
      setWorkPackages((current) => (isCurrent() ? found : current));
      setListed(true);
      setSelected((current) => {
        if (!isCurrent()) return current;
        // Proof: without this branch, a link to p1 kept the remembered p2 and
        // never focused the p1 step in the WorkPackagePage link test (2026-09-27).
        if (hasLinkedWorkPackage) {
          return linkedWorkPackage;
        }
        // A link to a work package the caller cannot open selects nothing: the page
        // shows its empty state and the toast says why, rather than opening a
        // work package the link did not name.
        // Proof, observed 2026-09-29: with this branch removed, `shows the
        // empty state for a link to a work package it cannot open` in
        // `work-package-page.test.tsx` selected the remembered work package instead.
        if (brokenLink) return null;
        // The current selection and the remembered id are both claims, honoured
        // only while the list still contains them — a work package deleted elsewhere
        // must not stay "selected" into a table asking for its tree. Then,
        // selecting the only work package saves a click on the common path; with
        // several, the choice is the user's and nothing is guessed.
        if (current !== null && found.some((workPackage) => workPackage.id === current))
          return current;
        // Proof: on 2026-09-24, reading the runtime once at mount (`useMemo(readServices, …)`) instead
        // failed `restores the replacement runtime’s own workPackage when a list load lands after a
        // replacement` on `PreferenceStoreLifecycleError: the preferences store was revoked with its
        // runtime`.
        const services = readServices();
        const remembered = recallLastWorkPackage(services).value;
        if (remembered !== null && found.some((workPackage) => workPackage.id === remembered)) {
          return remembered;
        }
        // A remembered id the list no longer holds is a claim that has been
        // disproved, so it is dropped rather than left to be re-tested — and
        // re-offered as a choice — on every future load.
        if (remembered !== null) rememberLastWorkPackage(services, null);
        return found.length === 1 ? (found[0]?.id ?? null) : null;
      });
    },
    [readServices],
  );

  const fetchWorkPackages = useCallback(() => catalog.list(), [catalog]);

  const load = useCallback(
    async (isCurrent: () => boolean): Promise<void> => {
      if (!isCurrent()) return;
      const found = await fetchWorkPackages();
      if (!isCurrent()) return;
      installWorkPackages(found, isCurrent);
    },
    [fetchWorkPackages, installWorkPackages],
  );

  useEffect(() => {
    const isCurrent = capturePublication();
    void load(isCurrent).catch((cause: unknown) => {
      if (!isCurrent()) return;
      setError((current) => (isCurrent() ? failureText(cause, 'load_failed') : current));
    });
  }, [load, capturePublication]);

  /**
   * Tells be-01 which work package this account is now in, which is what sorts the
   * picker next time.
   *
   * On the selection rather than on the click, so every way of arriving at a
   * work package counts: picked from the list, restored from localStorage,
   * auto-selected as the only one, or just created. Recording it in the click
   * handler would have left the restored work package — the commonest arrival of
   * all — never marked as opened, and the ordering would drift by exactly the
   * work packages people return to most.
   *
   * A failure is swallowed on purpose: this is navigation history, and an
   * error banner over a list that will simply be ordered slightly stale is
   * noise about something the user cannot act on.
   */
  useEffect(() => {
    if (selected === null) return;
    void catalog.markOpened(selected).catch(() => {
      // Deliberate: see above.
    });
  }, [catalog, selected]);

  /**
   * Creates a work package, selects it, and puts the caret in its name.
   *
   * The re-arm is **after** `await load()`: the name field renders in place of
   * the picker, and arming it before the list holds the new work package puts a
   * commit target on screen for a work package this page cannot yet name — an
   * immediate Enter would then compare the draft against no current name at
   * all and send a rename for the name the row already has.
   *
   * Proof: the re-arm moved above `await load()` — `arms the rename only once
   * the list can name the new workPackage` failed on `expected <input …(3)></input>
   * to be null`, the field on screen while the reload was still in flight.
   * Watched 2026-08-29.
   *
   * The draft is the placeholder rather than an empty box, and it is selected
   * rather than cleared: `commitOrCancelRename` reads an empty draft as a
   * cancel, so a reader who saw an empty field and pressed Enter would get a
   * work package called `New workPackage` and no explanation.
   */
  const create = () => {
    // Keep the explicit destination and catalog together: an old server write may
    // finish, but cannot publish its response, reload or failure into a new catalog.
    const isCurrent = isProjectCurrent;
    if (projectId === null || !isCurrent()) return;
    const destinationProjectId = projectId;
    const requestedCatalog = catalog;
    // An armed rename is cancelled, not carried: the draft was meant for the
    // work package it was opened on, and this click is about to select another.
    //
    // Proof: this line deleted — `a draft armed for another workPackage does not
    // follow the create` failed on `expected 'Meant for p2' to be null`, the
    // old work package's typing still on screen and still aimed at it while the
    // create was in flight. Watched 2026-08-29.
    setRename(null);
    void requestedCatalog
      .create(destinationProjectId, PLACEHOLDER_WORK_PACKAGE_NAME)
      .then(async (workPackage) => {
        if (!isCurrent()) return;
        // Written before the selection moves: a store that refuses the write for
        // a reason of its own propagates before the page has shown a choice it
        // could not keep.
        rememberLastWorkPackage(readServices(), workPackage.id);
        setSelected((current) => (isCurrent() ? workPackage.id : current));
        const found = await requestedCatalog.list();
        if (!isCurrent()) return;
        installWorkPackages(found, isCurrent);
        setRename((current) =>
          isCurrent()
            ? {
                workPackageId: workPackage.id,
                draft: PLACEHOLDER_WORK_PACKAGE_NAME,
                draftIsPlaceholder: true,
              }
            : current,
        );
      })
      .catch((e: unknown) => {
        if (!isCurrent()) return;
        setError((current) => (isCurrent() ? failureText(e, 'create_failed') : current));
      });
  };

  /**
   * Commits the rename if it says something, cancels if it does not.
   *
   * A draft that trims to nothing or to the name the work package already has is a
   * cancel — a blank name would leave the work package unidentifiable in every
   * picker, and an unchanged one is a request that changes nothing. A refusal
   * keeps the draft on screen: `forbidden` must not eat what was typed. The
   * post-success list reload fails separately — by then the rename landed,
   * and reporting it as a rename failure would be a lie.
   */
  const commitOrCancelRename = (armed: { workPackageId: string; draft: string }) => {
    const isCurrent = isPublicationCurrent;
    if (!isCurrent()) return;
    const typed = armed.draft.trim();
    const currentName = workPackages.find(
      (workPackage) => workPackage.id === armed.workPackageId,
    )?.name;
    if (typed === '' || typed === currentName) {
      setRename(null);
      return;
    }
    setError(null);
    void catalog.rename(armed.workPackageId, typed).then(
      async () => {
        if (!isCurrent()) return;
        setRename((current) => (isCurrent() ? null : current));
        await load(isCurrent).catch((e: unknown) => {
          if (!isCurrent()) return;
          setError((current) => (isCurrent() ? failureText(e, 'load_failed') : current));
        });
      },
      (e: unknown) => {
        if (!isCurrent()) return;
        setError((current) => (isCurrent() ? failureText(e, 'rename_failed') : current));
      },
    );
  };

  const isCommittedCreationCurrent = (committed: CommittedProjectCreation): boolean =>
    activeProjectAttempt.current === committed.attempt &&
    currentCatalog.current === committed.attempt.catalog &&
    currentPublicationEpoch.current === committed.epoch &&
    currentProjectAvailability.current === committed.attempt.availability;

  const recordCommittedPublicationFailure = (
    committed: CommittedProjectCreation,
    cause: unknown,
  ) => {
    if (!isCommittedCreationCurrent(committed)) return;
    setPublicationFailure((current) =>
      isCommittedCreationCurrent(committed)
        ? { cause, availability: committed.attempt.availability }
        : current,
    );
  };

  const refreshCommittedCreation = async (committed: CommittedProjectCreation): Promise<void> => {
    const isCurrent = () => isCommittedCreationCurrent(committed);
    let projects: Awaited<ReturnType<WorkPackageCatalog['listProjects']>>;
    let packages: WorkPackageListEntry[];
    try {
      if (!isCurrent()) return;
      projects = await committed.attempt.catalog.listProjects();
      if (!isCurrent()) return;
      packages = await committed.attempt.catalog.list();
    } catch (_cause: unknown) {
      if (!isCurrent()) return;
      setProjectDialog((current) =>
        isCurrent()
          ? {
              ...committed.attempt,
              epoch: committed.epoch,
              kind: 'created-refresh-failed',
              committed,
            }
          : current,
      );
      return;
    }
    if (!isCurrent()) return;
    const projectId = committed.creation.project.id;
    const workPackageId = committed.creation.workPackage.id;
    const project = projects.find((candidate) => candidate.id === projectId);
    const workPackage = packages.find((candidate) => candidate.id === workPackageId);
    if (project === undefined || workPackage?.projectId !== projectId) {
      setProjectDialog((current) =>
        isCurrent()
          ? {
              ...committed.attempt,
              epoch: committed.epoch,
              kind: 'created-unavailable',
              committed,
            }
          : current,
      );
      return;
    }
    if (!isCurrent()) return;
    rememberLastWorkPackage(readServices(), workPackageId);
    if (!isCurrent()) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('workPackage');
    url.searchParams.delete('stepNode');
    url.searchParams.delete('workItem');
    window.history.replaceState(window.history.state, '', url.href);
    setProjectChoices((current) =>
      isCurrent()
        ? {
            availability: committed.attempt.availability,
            catalog: committed.attempt.catalog,
            choices: { kind: 'ready', projects },
          }
        : current,
    );
    setProjectSelection((current) =>
      isCurrent()
        ? {
            availability: committed.attempt.availability,
            catalog: committed.attempt.catalog,
            id: projectId,
          }
        : current,
    );
    setWorkPackages((current) => (isCurrent() ? packages : current));
    if (!isCurrent()) return;
    setListed(true);
    setSelected((current) => (isCurrent() ? workPackageId : current));
    setRename((current) => (isCurrent() ? null : current));
    setSearch((current) => (isCurrent() ? null : current));
    setError((current) => (isCurrent() ? null : current));
    setProjectDialog((current) => (isCurrent() ? null : current));
  };

  const openProjectDialog = (summary: HTMLElement) => {
    if (!isProjectCurrent()) return;
    if (
      activeProjectAttempt.current !== null &&
      (activeProjectAttempt.current.catalog !== catalog ||
        activeProjectAttempt.current.availability !== projectAvailability)
    ) {
      activeProjectAttempt.current = null;
      isProjectRequestPending.current = false;
    }
    if (isProjectRequestPending.current) return;
    projectDialogOrigin.current = { availability: projectAvailability, summary, catalog };
    activeProjectAttempt.current = null;
    setProjectDialog({
      availability: projectAvailability,
      catalog,
      epoch: publicationEpoch,
      projectName: '',
      workPackageName: '',
      kind: 'editing',
    });
  };

  const editProjectCreation = (field: 'projectName' | 'workPackageName', name: string) => {
    setProjectDialog((current) => {
      if (
        !isProjectCurrent() ||
        current?.catalog !== catalog ||
        current.availability !== projectAvailability ||
        current.epoch !== publicationEpoch ||
        (current.kind !== 'editing' && current.kind !== 'refused')
      )
        return current;
      return { ...current, [field]: name, kind: 'editing' };
    });
  };

  const closeProjectDialog = (open: boolean) => {
    if (open || isProjectRequestPending.current || !isProjectCurrent()) return;
    activeProjectAttempt.current = null;
    setProjectDialog(null);
  };

  const createProjectWithWorkPackage = (projectName: string, workPackageName: string) => {
    if (
      !isProjectCurrent() ||
      isProjectRequestPending.current ||
      visibleProjectDialog === null ||
      (visibleProjectDialog.kind !== 'editing' && visibleProjectDialog.kind !== 'refused')
    )
      return;
    const attempt: ProjectCreationAttempt = {
      availability: projectAvailability,
      catalog,
      epoch: publicationEpoch,
      projectName,
      workPackageName,
    };
    activeProjectAttempt.current = attempt;
    isProjectRequestPending.current = true;
    setRename(null);
    setProjectDialog({ ...attempt, kind: 'creating', attempt });
    const isCurrent = () =>
      activeProjectAttempt.current === attempt &&
      currentCatalog.current === attempt.catalog &&
      currentPublicationEpoch.current === attempt.epoch &&
      // Proof: omitting this comparison in a private source overlay failed
      // `discards an old POST success after availability restoration before any new dialog
      // opens`: the held current GET left Loading visible. Canonical rerun passed (2026-11-14).
      currentProjectAvailability.current === attempt.availability;
    void (async () => {
      let committed: CommittedProjectCreation | null = null;
      try {
        const creation = await attempt.catalog.createProjectWithWorkPackage(
          attempt.projectName,
          attempt.workPackageName,
        );
        if (!isCurrent()) return;
        committed = { attempt, epoch: {}, creation };
        currentPublicationEpoch.current = committed.epoch;
        setPublicationEpoch(committed.epoch);
        setProjectDialog({
          ...attempt,
          epoch: committed.epoch,
          kind: 'created-refreshing',
          committed,
        });
        await refreshCommittedCreation(committed);
      } catch (cause: unknown) {
        if (committed !== null) {
          recordCommittedPublicationFailure(committed, cause);
          return;
        }
        if (!isCurrent()) return;
        setProjectDialog(
          cause instanceof WbsRequestError && cause.problem.kind === 'refusal'
            ? { ...attempt, kind: 'refused', message: failureText(cause, 'create_failed') }
            : { ...attempt, kind: 'unconfirmed' },
        );
      } finally {
        if (activeProjectAttempt.current === attempt) isProjectRequestPending.current = false;
      }
    })();
  };

  const retryProjectRefresh = () => {
    if (
      isProjectRequestPending.current ||
      visibleProjectDialog === null ||
      (visibleProjectDialog.kind !== 'created-refresh-failed' &&
        visibleProjectDialog.kind !== 'created-unavailable')
    )
      return;
    const committed = visibleProjectDialog.committed;
    if (!isCommittedCreationCurrent(committed)) return;
    isProjectRequestPending.current = true;
    setProjectDialog({ ...visibleProjectDialog, kind: 'created-refreshing' });
    void refreshCommittedCreation(committed).then(
      () => {
        if (activeProjectAttempt.current === committed.attempt)
          isProjectRequestPending.current = false;
      },
      (cause: unknown) => {
        recordCommittedPublicationFailure(committed, cause);
        if (activeProjectAttempt.current === committed.attempt)
          isProjectRequestPending.current = false;
      },
    );
  };

  const selectedWorkPackage = workPackages.find((workPackage) => workPackage.id === selected);

  /** The entries the picker is offering right now, or none while it is closed. */
  const typedSearch = search?.typed ?? null;
  const optionPresentation = useMemo(
    () => presentWorkPackageOptions(workPackages, typedSearch, visibleProjectChoices),
    [workPackages, typedSearch, visibleProjectChoices],
  );
  const entries = optionPresentation.entries;
  useEffect(() => {
    setSearch((current) => {
      if (
        current?.typed !== typedSearch ||
        current.highlightId === null ||
        entries.some((entry) => entry.id === current.highlightId)
      )
        return current;
      return { ...current, highlightId: null };
    });
  }, [entries, typedSearch]);
  /**
   * The reader's own today, which is the year an entry meta's is measured
   * against — one per render rather than one per entry, so a list opened across
   * midnight on New Year's Eve at least prints one year throughout.
   */
  const now = new Date();
  const layoutSignature = JSON.stringify({
    metadata: visibleProjectChoices.kind,
    sections:
      optionPresentation.kind === 'grouped'
        ? optionPresentation.sections.map((section) =>
            section.kind === 'project'
              ? [
                  'project',
                  section.project.id,
                  section.project.name,
                  section.workPackages.map((entry) => entry.id),
                ]
              : ['unavailable', section.workPackages.map((entry) => entry.id)],
          )
        : null,
    entries: entries.map((entry) => [entry.id, entry.name, entryMeta(entry, now)]),
  });
  const optionLayout = useMemo(() => ({ signature: layoutSignature }), [layoutSignature]);
  // Resolved by id at render, so a highlight whose work package has left the list is
  // simply nothing rather than somebody else's work package.
  const highlighted =
    search?.highlightId == null
      ? undefined
      : entries.find((entry) => entry.id === search.highlightId);
  const listOpen = search !== null && entries.length > 0;
  /**
   * The entry whose hover card is open, and the rectangle it is placed
   * against.
   *
   * The pointer wins over the keyboard highlight: resting on an entry shows
   * that entry even while the arrows hold another. The card id is an entry's
   * id, resolved against `entries` so an entry scrolled out of the narrowed
   * list simply has no card rather than somebody else's. The anchor is read
   * from the option element by its `id` in a layout effect below, because the
   * mouseenter handler that first sets `hoveredId` fires before React has
   * re-rendered, and the element that will carry the `id` is the one thing
   * that can be asked where the card is meant to open.
   */
  const cardId = listOpen ? (hoveredId ?? highlighted?.id ?? null) : null;
  const cardEntry = cardId === null ? undefined : entries.find((entry) => entry.id === cardId);

  /**
   * Takes a work package: selects it, remembers it, closes the picker, and gives
   * the keyboard back.
   *
   * The blur is the third of those and not tidiness. Nothing focuses the
   * option — the list's `mousedown` is prevented so the click can land — so
   * without it the combobox keeps the focus, and a closed combobox shows the
   * chosen work package's **name**: a text field holding the work package's name with a
   * caret in it, indistinguishable from an armed rename that does not exist.
   *
   * Proof: the `blur()` removed — `choosing a workPackage takes the focus off the
   * picker` failed on `expected <input …(9)></input> not to be <input
   * …(9)></input>`, the combobox still holding the keyboard after the pick.
   * Watched 2026-08-29.
   */
  const choose = (id: string) => {
    // Proof: on 2026-09-24, writing into the runtime read at render instead of `readServices()` failed
    // `writes a workPackage chosen after a replacement into the replacement, from a page drawn before it`
    // on `expected '' to be 'Paint the fence'`, with the revoked store's refusal reported. Moving this
    // line below `setSelected` failed `lets a store’s own write failure through by identity, selecting
    // nothing it could not keep` on `expected <button …(3)></button> to be null`. Wrapping it in a
    // swallowing `try` failed the same test on `expected [] to have a length of 1 but got +0`.
    rememberLastWorkPackage(readServices(), id);
    setSelected(id);
    setSearch(null);
    // A choice answers whatever the page last said, such as a broken link.
    setError(null);
    pickerBox.current?.blur();
  };

  const planImport = usePlanImport({
    catalog,
    isCurrent: isProjectCurrent,
    projectId,
    selectedWorkPackageId: selected,
    workPackages,
    fetchWorkPackages,
    installWorkPackages: (found) => {
      installWorkPackages(found, isProjectCurrent);
    },
    openWorkPackage: choose,
    pushToast: toastApi.pushToast,
    dismissToast: toastApi.dismissToast,
  });

  /** Moves the picker highlight by `delta` over what is on offer, clamped. */
  const moveHighlight = (delta: 1 | -1) => {
    if (entries.length === 0) return;
    setSearch((current) => {
      if (current === null) return current;
      const ids = entries.map((entry) => entry.id);
      const at = current.highlightId === null ? -1 : ids.indexOf(current.highlightId);
      // From nothing highlighted — or a highlight whose work package left the list —
      // Down enters at the top and Up at the bottom.
      const from = at === -1 ? (delta === 1 ? -1 : ids.length) : at;
      const to = Math.min(ids.length - 1, Math.max(0, from + delta));
      return { ...current, highlightId: ids[to] ?? null };
    });
  };

  /**
   * Which of the two plan surfaces this viewport is drawing, asked here for the
   * one thing this page decides with it: where {@link SavedPlanShelf} is
   * mounted.
   *
   * The same hook {@link WbsTable} uses, and deliberately not a prop threaded
   * down from it: it is `useSyncExternalStore` over one `resize` subscription
   * and a pure function of `window.innerWidth`/`innerHeight`, so two callers
   * cannot disagree within a render, and the second subscription costs a
   * listener rather than a source of truth.
   *
   * A CSS `hidden md:block` pair would be cheaper and is wrong here: it leaves
   * both shelves mounted, so `[data-saved-plans]` matches twice, two
   * `useSavedPlanShelf` watches subscribe, and every e2e selector on that
   * attribute becomes a strict-mode violation the moment the phone's sheet is
   * open.
   */
  const renderer = useRendererForViewport();
  const [selectorHost, setSelectorHost] = useState<HTMLSpanElement | null>(null);
  /**
   * The work package's history, mounted by whichever surface is drawing the plan.
   *
   * Absent off a work package for the reason {@link AppHeader}'s `workPackage` slot
   * gives for the whole row: a control that belongs to a work package is absent off
   * the work package rather than drawn dead — and `workPackageId` is a `string` in
   * {@link SavedPlanShelf}, so absence is the type as well as the taste.
   *
   * **Drawn only while the selected work package's runtime is live**, from that
   * runtime's own saved plans, exactly as the table is: in the interval between
   * one work package's withdrawal and the next one's publication there is no shelf,
   * so nothing the left work package's watch still delivers can be drawn under the
   * next one's name.
   *
   * The key remounts it per work package. The panel pins its compare pair once, on
   * the first shelf that arrives (AC #4: a comparison must not be swapped under
   * the reader), and that pin is `useState` — kept across a work package switch it
   * would hold a saved-plan id belonging to the work package just left, and the
   * first compare of the new work package would ask be-01 about a checkpoint that is
   * not in it. Crossing the renderer breakpoint remounts it for the same
   * reason, and that is a resize somebody performed, not an update arriving
   * under them.
   *
   * **Prefixed, and the bare `key={selected}` this carried in the toolbar is a
   * bug in the header row.** `WorkPackageNameField` two slots up is keyed
   * `rename.workPackageId`, and those are static JSX children — one array, one key
   * map. While a rename is armed on the open work package both keys are that
   * work package's id, React reports "Encountered two children with the same key,
   * `p2`", and the omission it warns about is real: cancelling the rename left
   * the field mounted with its draft intact. Four cases in
   * `work-package-page.test.tsx` went red on it at `c1b51324` (`cancels on Escape`,
   * `a blur that changed nothing cancels`, `an emptied draft cancels`, `a draft
   * armed for another workPackage does not follow the create`) — all four are
   * cancels, because a cancel is the update whose whole job is to unmount that
   * child.
   */
  /** Current: one nested actions host persists across renderer changes; the preceding remount-on-resize account is historical. */
  // Proof: on 2026-09-27, drawing the shelf from the last live runtime through the gap (v2) failed
  // `draws no shelf while the last workPackage lets go, and the next one’s own rows after` on
  // `expected [ Array(1) ] to be null`.
  const savedPlanShelf =
    workPackageState.status !== 'live' || view === 'board' ? null : (
      <SavedPlanShelf
        key={`saved-plans-${workPackageState.services.workPackageId}`}
        workPackageId={workPackageState.services.workPackageId}
        savedPlans={workPackageState.services.savedPlans}
      />
    );
  /**
   * The work package controls, as one group of the header bar.
   *
   * `min-w-0` on the box and on the group is what lets the picker be the part
   * that gives way: without it a flex item refuses to shrink below its content
   * and the bar wraps at the width the longest work package name asks for.
   *
   * **`flex-1`, and the phone's sideways scroll is closed by the shelf leaving
   * this row rather than by the row taking a line of its own.** The five red
   * pixel cases at `22464b72` were one defect measured five times — the page
   * 415px wide in a 390px viewport, 25px over, in `gantt.spec.ts:1449`,
   * `header.spec.ts:345`, `mobile.spec.ts:255`, `:404` and `:965`, every one an
   * overflow assertion and none of them the 44px touch-target assertion that
   * sits two lines above one of them and passed.
   *
   * The mechanism was `flex-1`'s `flex-basis: 0%`. {@link AppHeader} wraps below
   * `md`, but a zero-basis item never *asks* for a line: it is handed whatever
   * is left over — about 135px beside the brand and the account group — and
   * `min-w-0` lets it be squeezed to that. Its own children then decide the
   * width, and three of the *four* were `shrink-0` (`✎`, `+`,
   * {@link SavedPlanShelf}, ~160px with the gaps). What does not fit does not
   * wrap; it paints past the viewport.
   *
   * `basis-full md:basis-0` fixed that by making the group ask for its own
   * line, and the line cost 36px of header — which `mobile.spec.ts:850` cannot
   * afford, for the arithmetic {@link SavedPlanShelf} carries. So the fix is
   * the other half of the same sentence: **the shelf did not create the squeeze,
   * it exceeded it** — at ~76px of `shrink-0` children the group still fit. Off
   * a cards viewport the group is three children with 64px unshrinkable against
   * ~156px free on row 1 at 390, and a browser measured the whole group at
   * 132.125px there with `scrollWidth === clientWidth` on the header and no
   * page overflow at all.
   *
   * Above `md` nothing about this changed at any point: the header is
   * `flex-nowrap`, `flex-1` is what it always was, and the picker's `max-w`
   * slack absorbs the shelf at every laptop width (`header.spec.ts`, "keeps the
   * header to one row at every laptop width").
   */
  const workPackageControls = (
    // `basis-full` below `md`: two worded buttons and a picker are wider than
    // a 390px phone leaves beside the brand and the nav, so on a phone the
    // header (which wraps there, see `AppHeader`) gives this group a row of its
    // own. Proof: without it `grows page links to phone touch targets only
    // below the card breakpoint` failed on `the larger phone targets make the
    // page scroll sideways`, Received: 95. Watched 2026-09-16.
    //
    // Below 900 it is the header's second row whatever the device: `order-last`
    // puts it after the account group, so the pages and the account share row
    // one (UI review F-010, F-047). See `AppHeader`.
    <div className="order-last flex min-w-0 flex-1 basis-full items-center gap-1 min-[900px]:order-none min-[900px]:basis-auto">
      {rename === null ? (
        <>
          {/*
            A floor of 9rem with an ellipsis (UI review F-011): with no floor the
            picker was the bar's only give, and it gave down to `PUN` at 1024,
            0px at 900 and an un-ellipsed `PUNI platfor` on a phone. The fact
            card carries the whole name while the box clips it — the app's own
            card, not a native `title` (`e2e/hints.spec.ts` sweeps for those).
          */}
          <span className="relative inline-block max-w-72 min-w-36 flex-1">
            <Input
              ref={pickerBox}
              className="h-8 w-full text-ellipsis max-md:h-11"
              data-fact={search === null ? selectedWorkPackage?.name : undefined}
              aria-label="Work package"
              role="combobox"
              // At rest the box is the label of what is open, and a label is
              // not typed into: `readOnly` is what stops a click on the closed
              // picker putting a caret in the work package's name. It is dropped
              // the moment the box takes the focus — the same commit that
              // opens the list — so every route in still types.
              //
              // `readOnly` and not `disabled`: a disabled combobox is out of
              // the tab order and cannot be opened from the keyboard at all.
              //
              // jsdom cannot be the oracle for this half. A click's default
              // action — the focus and the caret it places — is the browser's,
              // and jsdom performs none of it (R5 #14/#15). The negative lives
              // in `e2e/work-package-picker.spec.ts`.
              readOnly={search === null}
              aria-expanded={listOpen}
              aria-controls={listOpen ? 'work-package-options' : undefined}
              aria-activedescendant={
                highlighted === undefined ? undefined : `work-package-option-${highlighted.id}`
              }
              aria-autocomplete="list"
              placeholder="Choose a work package…"
              size={28}
              // Closed, the box reads as a label of what is open; typing in
              // it is a search, and the typing is what is shown then.
              value={search?.typed ?? selectedWorkPackage?.name ?? ''}
              onFocus={() => {
                setSearch({ typed: '', highlightId: null });
              }}
              // A blur discards the typing and shows the selection again. It
              // does not select the highlighted entry: a click elsewhere is
              // not a choice, and choosing on the way out is how a picker
              // silently changes the work package under someone who left it.
              onBlur={() => {
                setSearch(null);
              }}
              onChange={(e) => {
                const typed = e.target.value;
                // Typing is aiming at the narrowed-to work package; emptying the
                // box aims at nothing again.
                const first =
                  typed.trim() === ''
                    ? undefined
                    : presentWorkPackageOptions(workPackages, typed, visibleProjectChoices)
                        .entries[0];
                setSearch({ typed, highlightId: first?.id ?? null });
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  moveHighlight(e.key === 'ArrowDown' ? 1 : -1);
                  return;
                }
                if (e.key === 'Escape') {
                  setSearch(null);
                  return;
                }
                if (e.key !== 'Enter') return;
                e.preventDefault();
                // Nothing highlighted is not a choice. An empty box whose
                // list happens to be showing must not select the first
                // work package on a stray Enter.
                if (highlighted !== undefined) choose(highlighted.id);
              }}
            />
            {listOpen && (
              <ul
                role="listbox"
                id="work-package-options"
                aria-label="Work packages"
                // One preventDefault for the whole list, options included, by
                // bubbling: a mousedown here must not blur the input, or the
                // list would close before the click could land — on an option
                // and on the scrollbar alike (cross review #6's lesson,
                // learned on the Depends on picker).
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                // `w-full`, not `min-w-full`. An absolutely positioned box with
                // only a minimum is shrink-to-fit, so one long entry decides
                // how wide the list is — and with `whitespace-nowrap` below,
                // that is as wide as the entry wants, past the right edge of
                // the window and giving the whole document a horizontal
                // scrollbar. The width is the combobox's instead: the input is
                // inside the bar, the bar is inside the viewport, so the list
                // is too, whatever be-01 answers with. Entries wrap inside it
                // (UI review F-086), so the width never decides what is read.
                //
                // Below `md` the window's width less its margins instead (UI
                // review F-130): the work package row is the header's own row there
                // and the input starts at the margin, so that width is bounded
                // too, and at the input's 175px a name took three lines.
                // Proof: `two imports of one long name read apart at every
                // width` (`e2e/header.spec.ts`) failed on `[3,3]` lines at 375
                // without it. Watched 2026-10-16.
                //
                // From `md` up the list is at least the picker's widest, 18rem
                // (`md:min-w-72`), and never just the input's leftover width:
                // the input is a flex child, so what the header's neighbours
                // take (the Plan / Board selector's outline, #528) it loses, and
                // a list tied to it made a name a paragraph at 1024. The bar
                // leaves well over 18rem right of the input at every `md` width,
                // and `max-w-[calc(100vw-1rem)]` still caps it.
                // Proof: without `md:min-w-72`, `two imports of one long name
                // read apart at every width` failed on `a name takes more than
                // two lines at 1024px: [3,3]` and on `the list is narrower than
                // 18rem at 1024px`, `Received: 196`. Watched 2026-10-16.
                //
                // Proof: back to `min-w-full`, `the widest entry be-01 permits
                // stays inside the window` in `e2e/header.spec.ts` failed at
                // every one of 1280, 1024 and 900 on the precondition —
                // `entryOverflow 0`, nothing clipped anywhere, the list simply
                // as wide as the text — and, with that precondition relaxed to
                // read the bound underneath, on `the listbox reaches 46px past
                // the window at 900px`. Watched in Chromium, 2026-08-09.
                className="bg-popover text-popover-foreground absolute top-full left-0 z-10 m-0 max-h-60 w-full max-w-[calc(100vw-1rem)] list-none overflow-y-auto rounded-md border p-1 text-sm shadow-md max-md:w-[calc(100vw-2rem)] md:min-w-72"
              >
                <WorkPackageOptionGroups presentation={optionPresentation}>
                  {(entry) => (
                    // The ARIA combobox pattern is the boundary that makes this
                    // safe: options are not focusable, and the keyboard drives
                    // them from the input through aria-activedescendant.
                    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                    <li
                      key={entry.id}
                      id={`work-package-option-${entry.id}`}
                      role="option"
                      // The native `title` is gone: its delay is exactly the
                      // "immediately" this change rejects, and the hover card
                      // below shows the same full name and meta with none. The
                      // option's accessible name already carries the whole text,
                      // so nothing a screen reader overhears is lost.
                      onMouseEnter={() => {
                        setHoveredId(entry.id);
                      }}
                      onMouseLeave={() => {
                        setHoveredId((current) => (current === entry.id ? null : current));
                      }}
                      aria-selected={entry.id === highlighted?.id}
                      ref={(element) => {
                        // jsdom has no scrollIntoView; that boundary is the
                        // test environment, not a browser this will meet.
                        if (
                          entry.id === highlighted?.id &&
                          element !== null &&
                          typeof element.scrollIntoView === 'function'
                        ) {
                          element.scrollIntoView({ block: 'nearest' });
                        }
                      }}
                      className={cn(
                        'flex cursor-pointer flex-wrap items-baseline gap-x-1 rounded-sm px-2 py-1 max-md:min-h-11 max-md:content-center',
                        entry.id === highlighted?.id && 'bg-accent text-accent-foreground',
                      )}
                      onClick={() => {
                        choose(entry.id);
                      }}
                    >
                      {/*
                      The name is shown whole and the meta is the half that
                      gives way — the name wraps, `min-w-0 truncate` on the
                      meta below. The other way round, a long owner name (an
                      e2e run's generated account, say) squeezed every `New
                      workPackage …` to `New pr…` and the picker offered choices
                      nobody could tell apart — Dany, 2026-08-10.

                      **Wrapped, not clipped, since UI review F-086.** The
                      entry was one line whatever its length, so a name wider
                      than the list was cut at the list's edge with no
                      ellipsis — and an import's `(imported 15 Oct)` is at the
                      end of its name, so two imports of one plan read the
                      same on every phone and on a laptop past ~22
                      characters. A two-line option is a name read whole; the
                      meta drops to a line of its own when the name leaves it
                      no room, and still truncates there.
                    */}
                      <span className="min-w-0 break-words">{entry.name}</span>
                      {/*
                      A real space in the text, not only the `gap` beside it: an
                      entry's accessible name is `Rewire the shed (1 Jun · kat)`
                      and the string somebody hears has to have the word break
                      in it. A whitespace-only node between two flex items is
                      not itself an item, so it costs no second gap on screen.
                    */}{' '}
                      {/*
                      Inside the option, so it is part of the accessible name:
                      two work packages called `Rewire the shed` are told apart by a
                      screen reader as well as by eye. A `title` or a sibling
                      element outside the option would look identical and say
                      nothing to anybody listening.

                      Proof: with `aria-hidden="true"` on this span — the meta
                      still on screen, out of the accessibility tree — `tells
                      two workPackages of one name apart by their owners` failed on
                      `Unable to find an accessible element with the role
                      "option" and name "Rewire the shed (kat · 1 Jun)"` (the meta
                      was owner-first then).
                      Watched, 2026-08-09.
                    */}
                      <span className="text-muted-foreground min-w-0 truncate">
                        {entryMeta(entry, now)}
                      </span>
                    </li>
                  )}
                </WorkPackageOptionGroups>
              </ul>
            )}
            {/*
              The card owns its scroll listener and anchor state: a wheel tick
              repositions this small child, not the WBS table below the header.
              Off-list options answer no anchor, so a keyboard highlight cannot
              leave a portal floating outside the listbox. Proof: the two scroll
              regressions in `work-package-page.test.tsx` failed on a parent rerender
              and a still-mounted off-list card. Watched 2026-08-24.
            */}
            <WorkPackageOptionCard entry={cardEntry} now={now} layout={optionLayout} />
          </span>
        </>
      ) : (
        <WorkPackageNameField
          // The armed work package, so arming a rename on another one is a new
          // field rather than the same one holding somebody else's name: the
          // focus and the selection below happen on mount.
          key={rename.workPackageId}
          draft={rename.draft}
          selectsWholeDraft={rename.draftIsPlaceholder}
          onDraft={(draft) => {
            setRename((current) => (current === null ? current : { ...current, draft }));
          }}
          onCommit={() => {
            commitOrCancelRename(rename);
          }}
          onCancel={() => {
            setRename(null);
          }}
        />
      )}
      <WorkPackageActions onNewProject={openProjectDialog} isProjectCurrent={isProjectCurrent}>
        <ProjectPicker
          choices={visibleProjectChoices}
          selectedId={projectId}
          onChoose={(id) => {
            if (!isProjectCurrent()) return;
            setProjectSelection((current) =>
              isProjectCurrent()
                ? id === null
                  ? null
                  : { availability: projectAvailability, catalog, id }
                : current,
            );
          }}
          onRefresh={() => {
            if (!isProjectCurrent()) return;
            setProjectRefresh((refresh) => (isProjectCurrent() ? refresh + 1 : refresh));
          }}
        />
        {rename === null && (
          <>
            {selectedWorkPackage !== undefined && (
              <Button
                variant="outline"
                size="sm"
                type="button"
                // Words, not a glyph: the pen and the plus were read as decoration
                // once drawn (2026-09-16), so the visible text is the accessible
                // name and every test finds the control by it. `sm` keeps the
                // bar at its `h-8` row height.
                data-hint="Rename this work package"
                // The words shorten below `xl` and the name does not: `Rename` is
                // inside `Rename workPackage`, so what is said and what is shown agree.
                aria-label="Rename work package"
                className="max-md:h-11"
                onClick={(event) => {
                  closeWorkPackageActions(event.currentTarget);
                  setRename({
                    workPackageId: selectedWorkPackage.id,
                    draft: selectedWorkPackage.name,
                    draftIsPlaceholder: false,
                  });
                }}
              >
                <span className="xl:hidden">Rename</span>
                <span className="max-xl:hidden">Rename work package</span>
              </Button>
            )}
          </>
        )}
        <Button
          size="sm"
          type="button"
          disabled={projectId === null}
          data-hint="Start a new work package"
          aria-label="Create new work package"
          className="max-md:h-11"
          onClick={(event) => {
            closeWorkPackageActions(event.currentTarget);
            create();
          }}
        >
          <span className="xl:hidden">New</span>
          <span className="max-xl:hidden">Create new work package</span>
        </Button>
        {savedPlanShelf}
      </WorkPackageActions>
      {/* Current: history is now nested once inside actions above; the following old renderer-placement account is retained as historical. */}
      {/*
        The work package's history, on a table viewport only — on a cards one it is
        in the phone's `Plan actions` sheet instead, and `savedPlanShelf` has
        why that is 21.4 measured pixels rather than a preference.
      */}
      {renderer === 'table' && <span ref={setSelectorHost} className="flex shrink-0" />}
    </div>
  );

  const dialogOrigin = projectDialogOrigin.current;
  const projectCreationSurface =
    visibleProjectDialog === null ? null : (
      <NewProjectDialog
        open={true}
        state={visibleProjectDialog}
        projectName={visibleProjectDialog.projectName}
        workPackageName={visibleProjectDialog.workPackageName}
        onProjectNameChange={(name) => {
          editProjectCreation('projectName', name);
        }}
        onWorkPackageNameChange={(name) => {
          editProjectCreation('workPackageName', name);
        }}
        onOpenChange={closeProjectDialog}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (
            dialogOrigin !== null &&
            isProjectCurrent() &&
            dialogOrigin.availability === projectAvailability &&
            projectDialogOrigin.current === dialogOrigin &&
            currentCatalog.current === dialogOrigin.catalog &&
            currentPublicationEpoch.current === visibleProjectDialog.epoch &&
            dialogOrigin.summary.isConnected
          )
            dialogOrigin.summary.focus();
        }}
        onCreate={createProjectWithWorkPackage}
        onRetryRefresh={retryProjectRefresh}
      />
    );

  const header = (
    <>
      {projectCreationSurface}
      <AppHeader
        nav={nav}
        workPackage={workPackageControls}
        // Only once a work package is chosen: off one there is no roster to be in, and
        // the panel's Reconnecting (Offline before D9) would read as a dropped
        // connection that never existed (UI review F-018). From the choice on it
        // is handed the honest roster — empty and disconnected until the
        // work package's stream speaks.
        presence={selected === null ? undefined : presence?.(roster)}
        account={account}
      />
    </>
  );
  if (publicationFailure !== null && publicationFailure.availability === projectAvailability)
    throw publicationFailure.cause;
  // Proof: on 2026-09-24, `&& false` added to this condition failed `shows the sanitized report
  // when a work package will not let go, and never draws the next` on `expected null not to be null`:
  // no `[data-lifetime-fault]` was drawn.
  if (workPackageState.status === 'fatal') {
    // The work package's runtime could not be given back, or built: the same sanitized
    // report the page's own runtime shows, in place of the page's main, and no
    // table drawn from services nobody owns.
    return (
      <>
        {header}
        <LifetimeFault fault={workPackageState.fault} />
      </>
    );
  }
  return (
    <>
      {header}
      {/*
        The rest of the window, and a column flex so the frame below can have
        what the toolbar does not. `min-h-0` is the load-bearing half: a flex
        item's default `min-height: auto` refuses to shrink below its content,
        so without it the table's own height would push this box past the
        bottom of the screen and the frame would never be the thing that
        scrolls.

        `relative` stays: the shelf's panel is absolutely positioned, and
        several of the table's own menus are too, so this column is the
        containing block they are all measured against.
      */}
      <main className="relative flex min-h-0 flex-1 flex-col px-4 py-2">
        {error !== null && (
          <p role="alert" className="text-destructive mb-2 text-sm">
            {error}
          </p>
        )}
        {/* Drawn only while the owner publishes a runtime. In the render that
        moves the selection the owner still publishes the previous work package's,
        until the page's effect withdraws it; from that withdrawal nothing is
        drawn here until the next runtime is live, so every runtime is drawn in a
        table of its own — its rows and transient editor state with it — and no
        key is needed to say so. */}
        {/* Proof: on 2026-09-25, drawing the table from the last live runtime through the
        gap failed `draws the next workPackage in a table of its own`: the next work package kept the
        old table element (`expected <table …> not to be <table …>`). */}
        {/*
          No work package open, once the list has said what there is to open (UI
          review F-019, F-027). Its own toast stack: the table's is the one that
          reports an import, and there is no table here.
        */}
        {listed && selected === null && (
          <>
            <NoWorkPackageOpen
              workPackages={workPackages}
              onOpen={choose}
              onCreate={create}
              canCreate={projectId !== null}
              planImport={planImport}
              now={now}
            />
            <ToastStack toasts={toastApi.toasts} onDismiss={toastApi.dismissToast} />
          </>
        )}
        {workPackageState.status === 'live' && (
          <WorkPackageViews
            workPackage={workPackageState.services}
            selectorHost={selectorHost}
            isDesktop={renderer === 'table'}
            view={view}
            onSelect={(workPackage, next) => {
              setViewFor({ workPackage, view: next });
            }}
          >
            {(viewControls) => (
              <Profiler id="wbs-table" onRender={recordWbsScrollCommit}>
                <WbsTable
                  workPackage={workPackageState.services}
                  // Proof: leaving this out made `offers Claim for the person bound
                  // to the signed-in account` fail on `Unable to find … "menuitem"
                  // and name "Claim"`; watched 2026-10-27.
                  viewerAccountId={viewerAccountId}
                  viewControls={viewControls}
                  planActive={view === 'plan'}
                  // The name the export's header and filename carry. Read from the
                  // list rather than held twice: a rename lands in `workPackages` and
                  // the next export says the new name.
                  workPackageName={selectedWorkPackage?.name}
                  {...(selectedWorkPackage === undefined
                    ? {}
                    : {
                        generalSettings: {
                          abbreviation: selectedWorkPackage.abbreviation,
                          ...(selectedWorkPackage.budgetFactor === undefined
                            ? {}
                            : { budgetFactor: selectedWorkPackage.budgetFactor }),
                          setAbbreviation: (abbreviation: string) =>
                            catalog.setAbbreviation(selectedWorkPackage.id, abbreviation),
                          onChanged: async () => {
                            await load(isPublicationCurrent);
                          },
                        },
                      })}
                  planImport={planImport}
                  // Proof: omitting this page-owned API left the remounted table's
                  // toast list empty after a successful import. Observed 2026-09-14.
                  toastApi={toastApi}
                  // Rendered by the table only on a cards viewport, which is the
                  // same answer `renderer` above gives — one hook, one store, so the
                  // header's arm and this one are complementary and never both.
                  /* Current: the shelf no longer enters this table slot; it has one stable Page-owned actions host. */
                />
              </Profiler>
            )}
          </WorkPackageViews>
        )}
      </main>
    </>
  );
}
