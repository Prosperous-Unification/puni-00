import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from '@/components/ui/modal';
import type { Recalled, Remembered } from '@/lib/remembered';
import type { RememberedPreferences } from '@/modules/preferences/contract';
import {
  type ApplicationServicesState,
  useApplicationServicesReader,
} from '@/runtime/application-services-context';

import { EstimatingPanel, type EstimatingPanelProps } from './estimating-panel';
import { OptimizationSettingsPanel, type OptimizationSettingsProps } from './optimization-settings';
import { PrioritiesPanel, type PrioritiesPanelProps } from './priorities-panel';
import { StepsPanel, type StepsPanelProps } from './steps-panel';
import { TeamsPanel, type TeamsPanelProps } from './teams-panel';
import { TimezonePanel, type TimezonePanelProps } from './timezone-panel';
import { SettingsIcon } from './toolbar-icons';

/**
 * The three things a project configures about itself, in the order the tab
 * list shows them — the order the three toolbar buttons stood in until
 * `project-config-modal` folded them into this one surface.
 */
export type SettingsSection =
  'teams' | 'priorities' | 'steps' | 'estimating' | 'optimization' | 'timezone';

const SECTIONS: readonly { id: SettingsSection; label: string }[] = [
  { id: 'teams', label: 'Teams' },
  { id: 'priorities', label: 'Priorities' },
  { id: 'steps', label: 'Steps' },
  { id: 'estimating', label: 'Estimating' },
  { id: 'optimization', label: 'Optimization' },
  { id: 'timezone', label: 'Timezone' },
];

const FIRST_SECTION: SettingsSection = 'teams';

/** Whether a value read from storage names a section this modal has. */
export function isSettingsSection(claimed: unknown): claimed is SettingsSection {
  return SECTIONS.some((section) => section.id === claimed);
}

/**
 * The section this browser last left open for `projectId`, or the first one.
 *
 * Read from the runtime `services` names — which the modal reads at the instant
 * it opens, through `useApplicationServicesReader`, never from a render it may
 * have outlived. With no runtime live the first section is shown and
 * `persists` says it is not remembered: nothing is read, and nothing throws.
 *
 * The stored value is a claim, not a fact, read the way `rememberedHiddenColumns`
 * reads its key: anything that is not the id of a section this modal offers is
 * **dropped, key and all**, and the first section shown. Not the R5 throw — the
 * alternative is a settings surface that cannot be opened until somebody clears
 * storage by hand, over a preference about which tab was in front — and not a
 * default-through either, which would keep the bad value for the next read.
 *
 * Proof: the `isSettingsSection` guard replaced by an unchecked cast, and
 * `an unrecognised remembered section is dropped` failed on
 * `expect(element).toHaveAttribute("aria-selected", "true")` — a stored `7`
 * selecting no tab at all, with nothing on the surface. Watched 2026-08-30.
 */
export function rememberedSettingsSection(
  services: ApplicationServicesState,
  projectId: string,
): Recalled<SettingsSection> {
  // Proof: on 2026-09-24, answering `persists: true` here failed `opens on the first section and
  // remembers nothing when no runtime is live` on `expected { value: 'teams', persists: true } to
  // deeply equal { value: 'teams', persists: false }`.
  if (services.status !== 'live') return { value: FIRST_SECTION, persists: false };
  return {
    value: storedSection(services.remembered, projectId).readAndDrop() ?? FIRST_SECTION,
    persists: true,
  };
}

/**
 * Writes the open section for `projectId` into the runtime `services` names.
 *
 * Answers whether one was live to take it: `false` writes nothing anywhere, and
 * the section is simply not remembered — see {@link Recalled}.
 *
 * @throws whatever a live store throws on write — a browser with site data
 * blocked — unchanged; that is not a lifecycle outcome and nothing here
 * recovers from it.
 */
export function rememberSettingsSection(
  services: ApplicationServicesState,
  projectId: string,
  section: SettingsSection,
): boolean {
  // Proof: on 2026-09-24, answering `true` here failed `stops remembering once its runtime is
  // withdrawn, and never throws` on `expected true to be false`.
  if (services.status !== 'live') return false;
  storedSection(services.remembered, projectId).write(section);
  return true;
}

/**
 * Where this browser remembers which section of a project's settings was last
 * open. Per project and per browser, as every other remembered plan preference
 * in `wbs-table.tsx` is — a reader who came back to adjust capacity twice lands
 * on capacity, and be-01 is never told.
 *
 * One project's open section, stored as **bare text**, which cannot become JSON
 * without losing the section existing readers already hold.
 */
const storedSection = (
  remembered: RememberedPreferences,
  projectId: string,
): Remembered<SettingsSection> => remembered.projectSettingsSection(projectId, isSettingsSection);

/** What each section gets from the plan, less what the modal itself supplies. */
type SectionOwn<P> = Omit<P, 'onDirtyChange'>;

export interface ProjectSettingsModalProps {
  projectId: string;
  /**
   * How the control that opens this reads on the bar it sits in.
   *
   * `glyph` for the wide toolbar, where a gear says what eighteen characters
   * would and the width is the scarce resource (`design.md` D5); `labelled`
   * for the phone's `Plan actions` sheet, which lists its controls by name and
   * has the room. Both carry the same accessible name.
   */
  trigger: 'glyph' | 'labelled';
  teams: SectionOwn<TeamsPanelProps>;
  priorities: SectionOwn<PrioritiesPanelProps>;
  steps: SectionOwn<StepsPanelProps>;
  /**
   * The arithmetic the plan's days are computed with — the PERT coefficients
   * and the rounding a step's figure is charged at.
   *
   * Here rather than on the toolbar for the reason `dep-reach-whole-item` gives
   * about the reach: a project-wide statement about **how the plan is computed**
   * belongs beside the teams' capacity and the priority ladder, not on a bar
   * whose width is the scarce resource.
   */
  estimating: SectionOwn<EstimatingPanelProps>;
  /** Absent only before the first plan read or when this backend has no optimizer. */
  optimization?: SectionOwn<OptimizationSettingsProps>;
  /**
   * The zone every instant on the plan is read in (`step-node-attempts` D3) —
   * a project-wide statement about how the plan reads, for `estimating`'s
   * reason.
   */
  timezone: SectionOwn<TimezonePanelProps>;
}

/**
 * One modal for everything a project configures about itself: its teams and
 * their capacity, its priority ladder, and its steps.
 *
 * Three toolbar buttons each opened a `Modal` of its own until
 * `project-config-modal` (2026-08-30). Each was a thing somebody sets once and
 * then leaves for weeks, sitting permanently beside `Add work item` and `Undo`
 * on a bar whose width is the scarce resource. The three surfaces are three
 * **panels** of this one now — moved, not rewritten: same boxes, same writes,
 * same refusals, same accessible names. What changed is who mounts them.
 *
 * **One shell, never three nested.** A modal inside a modal is two focus traps,
 * and Radix restores the focus to the inner trigger on close — inside the outer
 * modal, the thing the reader was leaving. `P phases-ui` already cost 49
 * unrelated tests when a `ModalContent` merely being *declared* suspended the
 * page's keyboard; two live shells is that fault with a second copy
 * (`design.md` D1).
 *
 * **The inactive panels stay mounted and `hidden`** (D2). Unmounting them would
 * discard a half-typed capacity when the reader glanced at the ladder — the
 * "does not take the focus or the half-typed value" fault class `AGENTS.md`
 * records from 2026-08-06. The cost is three panels' render at once; each reads
 * the plan's existing data rather than fetching its own.
 *
 * **One commit model: every section applies as its field is left** (UI review
 * D7, F-060). No section has a Save, a Cancel or a Done; a capacity, a step, a
 * zone apply on blur or Enter, and the ladder and the weights — values that are
 * only meaningful together — apply as one when the focus leaves the group, with
 * an Undo once they land. Escape in a field puts that field back.
 *
 * **The ✕ and a click outside mean "keep this and leave"**, which is what Done
 * meant. The click blurs the field, which applies it; the close is refused while
 * the write is in the air, and the modal then closes by itself once nothing is
 * held — or stays open on the refusal if be-01 said no. Escape waits the same
 * way, except in a field, where it is the field's own key: it puts the field
 * back where it is, and while anything is held the modal neither moves nor
 * speaks (UI review F-112).
 *
 * **Closing over an edit is refused, and the refusal shows where** (D3). Each
 * panel reports whether it holds an uncommitted draft or a write in flight;
 * Escape outside a field, the ✕ and a click outside all go through
 * {@link requestClose}, which refuses while any holds a draft and switches to
 * the first section that does; a hold that is only travelling is waited out
 * quietly. Switching
 * rather than only announcing: a refusal naming a section the reader cannot see
 * is a refusal they have to go looking for.
 *
 * The trigger lives here for the reason the three dialogs each held their own:
 * Radix's `onCloseAutoFocus` cancels the default restore and focuses its
 * **trigger**, so a modal opened without a `ModalTrigger` puts the focus on
 * nothing at all — watched, `plan-cards.test.tsx`'s `closing project settings
 * puts the focus back on its trigger` failing on `expected <body …> to be
 * <button …>` with a plain `Button` in its place. It carries no
 * `data-takes-the-focus`, and that is a description rather than a guard: the
 * sheet reads that mark only off a control that closes the sheet, and a control
 * that opens a surface of its own never does (`closingControlIn`), so the
 * attribute's presence or absence here changes nothing. The distinction
 * `wbs-table.tsx` draws for `⌨` versus `Add work item` is the right one; it is
 * just not one this button is ever asked.
 */
export function ProjectSettingsModal({
  projectId,
  trigger,
  teams,
  priorities,
  steps,
  estimating,
  optimization,
  timezone,
}: ProjectSettingsModalProps) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<SettingsSection>(FIRST_SECTION);
  /**
   * The sections holding something a close would lose.
   *
   * A ref **and** state, deliberately. The ref is what {@link requestClose}
   * reads, because it is asked from Radix's own dismissal handlers and from a
   * panel's `Done` in the same tick as the state change that would have
   * emptied it — a read of state there is a read of the previous render. The
   * state is what renders the refusal sentence, and it follows the ref by one
   * render, which is soon enough for a sentence.
   */
  const dirtyRef = useRef(new Set<SettingsSection>());
  const [dirtySections, setDirtySections] = useState<readonly SettingsSection[]>([]);
  /**
   * Whether a close has been refused over the hold that is live now. The
   * sentence it earns is shown only while something is still held — see
   * {@link holding} — and the flag ends with that hold, when the last section
   * lets go: Escape in a dirty field is refused as it puts the field back, and a
   * flag that outlived the revert turned the next keystroke anywhere into the
   * red "has an unsaved edit" while the reader was only typing (UI review F-080).
   */
  const [refused, setRefused] = useState(false);
  /**
   * Whether a ✕ or a click outside was refused while something was held, and the
   * modal should close once it is not. Dropped by any key or pointer inside the
   * surface: a reader who has started on the refusal has not asked to leave.
   */
  const [closeWanted, setCloseWanted] = useState(false);

  /**
   * The sections with a write in the air — a subset of the holds above, kept
   * apart because a travelling write clears by itself and a draft or a refusal
   * does not. Ref and state for the reason `dirtyRef` gives.
   */
  const busyRef = useRef(new Set<SettingsSection>());
  const [busySections, setBusySections] = useState<readonly SettingsSection[]>([]);

  const publishDirty = (): void => {
    setDirtySections(SECTIONS.map((s) => s.id).filter((id) => dirtyRef.current.has(id)));
  };
  const publishBusy = (): void => {
    setBusySections(SECTIONS.map((s) => s.id).filter((id) => busyRef.current.has(id)));
  };

  /**
   * One stable reporter per section, so a panel's `useEffect` on it runs on
   * dirtiness alone. A new function per render would re-run every panel's
   * effect on every render of this modal, each reporting the same value —
   * harmless, and the kind of noise that hides a real report.
   */
  const reporterFor = useCallback(
    (section: SettingsSection) =>
      (dirty: boolean): void => {
        if (dirty) dirtyRef.current.add(section);
        else dirtyRef.current.delete(section);
        // Proof: on 2026-10-16, without this reset, `typing after an Escape put
        // a field back raises no refusal` (project-settings-modal.test.tsx)
        // failed on `expected <p role="alert" …(2)></p> to be null`.
        if (dirtyRef.current.size === 0) setRefused(false);
        publishDirty();
      },
    // `publishDirty` closes over a setter and a ref, and `setRefused` is a
    // setter, all stable for the life of the component, so the reporters are
    // made once.
    [],
  );
  const busyReporterFor = useCallback(
    (section: SettingsSection) =>
      (busy: boolean): void => {
        if (busy) busyRef.current.add(section);
        else busyRef.current.delete(section);
        publishBusy();
      },
    // Stable for the reason `reporterFor` gives.
    [],
  );
  const busyReporters = useMemo(
    () => ({
      teams: busyReporterFor('teams'),
      priorities: busyReporterFor('priorities'),
      steps: busyReporterFor('steps'),
      estimating: busyReporterFor('estimating'),
      optimization: busyReporterFor('optimization'),
      timezone: busyReporterFor('timezone'),
    }),
    [busyReporterFor],
  );
  const reporters = useMemo(
    () => ({
      teams: reporterFor('teams'),
      priorities: reporterFor('priorities'),
      steps: reporterFor('steps'),
      estimating: reporterFor('estimating'),
      optimization: reporterFor('optimization'),
      timezone: reporterFor('timezone'),
    }),
    [reporterFor],
  );

  /**
   * The page's runtime as it is when a handler runs, not as it was when this
   * modal last rendered: the modal does not re-render when the slot moves, so a
   * handler bound under one runtime can run under the next — and must reach that
   * one, or none.
   */
  const readServices = useApplicationServicesReader();

  const show = useCallback(
    (section: SettingsSection): void => {
      // Written before `setShown`, on purpose: a store that refuses the write for
      // a reason of its own propagates before this modal has shown a section it
      // could not keep.
      // Proof: on 2026-09-24, writing into the runtime read at render instead of `readServices()` failed
      // `writes a section chosen after a replacement into the replacement, from a modal opened before it`
      // on `toHaveAttribute("aria-selected", "true")`, with the revoked store's
      // `PreferenceStoreLifecycleError` reported. Moving this line below `setShown` failed `lets a store’s
      // own write failure through by identity, showing no section it could not keep` on
      // `toHaveAttribute("aria-selected", "true")` for Teams. Wrapping it in a swallowing `try` failed the
      // same test on `expected [] to have a length of 1 but got +0`.
      rememberSettingsSection(readServices(), projectId, section);
      setShown(section);
    },
    [projectId, readServices],
  );

  /**
   * Closes if nothing is held, or refuses and shows what is holding it.
   *
   * Every way out goes through here — Escape outside a field and the click
   * away via Radix's handlers below, the ✕ via `onOpenChange(false)`. Answers
   * whether it closed, so a Radix handler can `preventDefault()` the dismissal
   * it would otherwise perform on its own. `leaving` is a request to leave:
   * refused, it leaves {@link closeWanted} set, and the close happens when the
   * hold clears.
   *
   * Proof: the `if (first !== undefined)` refusal below deleted, so this always
   * closes, and both `an in-flight write holds the modal open and is shown` and
   * `the ✕ is refused the same way, and says which section is holding` failed
   * on `Unable to find an accessible element with the role "dialog" and name
   * "Project settings"` — the close went through over a ladder still
   * travelling and over a typed capacity. Watched 2026-08-30.
   */
  function requestClose(leaving = false): boolean {
    const held = SECTIONS.map((s) => s.id).filter((id) => dirtyRef.current.has(id));
    const first = held.at(0);
    if (first !== undefined) {
      // Writes that are only travelling are never refused out loud: nothing in
      // them can be finished or cancelled, they clear by themselves, and the
      // foot already says `Saving …`. Jumping to their section with the red
      // "Finish it or cancel it" was the refusal contradicting the close it was
      // about to make (Fable review of #453, blocking 1), and, for a request
      // that was not leaving, the sentence under `Saving …` (ui-review F-111).
      // Proof: on 2026-10-14, against 6d4d02f33 (no such branch), `leaving over
      // a write in flight says it is saving, not that an edit is unsaved` failed
      // on `expected <p role="alert" …(1)></p> to be null`.
      if (held.every((id) => busyRef.current.has(id))) {
        if (leaving) setCloseWanted(true);
        return false;
      }
      show(first);
      setRefused(true);
      setCloseWanted(leaving);
      return false;
    }
    setOpen(false);
    setRefused(false);
    setCloseWanted(false);
    return true;
  }

  // The ✕'s second half: the blur it caused has applied the field, and once the
  // write lands and nothing is held the modal closes without a second click.
  // Proof: on 2026-10-14, with this effect removed, `the ✕ applies a typed
  // capacity and closes once it lands` in project-settings-modal.test.tsx failed
  // on the dialog still open after the write landed.
  // A write that was refused instead turns the quiet wait into the refusal: its
  // section is shown with the sentence, and the modal stays.
  useEffect(() => {
    if (!open || !closeWanted) return;
    if (dirtySections.length === 0) {
      requestClose();
      return;
    }
    const stuck = dirtySections.find((id) => !busySections.includes(id));
    if (stuck === undefined) return;
    show(stuck);
    setRefused(true);
    // `requestClose` and `show` are plain functions of this render; the four
    // values are what decide whether either runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closeWanted, dirtySections, busySections]);

  function onOpenChange(next: boolean): void {
    if (next) {
      dirtyRef.current.clear();
      setDirtySections([]);
      busyRef.current.clear();
      setBusySections([]);
      setRefused(false);
      setCloseWanted(false);
      // Proof: on 2026-09-24, showing `FIRST_SECTION` here instead of reading the runtime failed `reopens
      // on a replacement runtime’s own remembered section` on `toHaveAttribute("aria-selected", "true")`.
      setShown(rememberedSettingsSection(readServices(), projectId).value);
      setOpen(true);
      return;
    }
    requestClose(true);
  }

  /**
   * Arrow keys walk the tab list and select as they go — automatic activation,
   * which is what a screen reader expects of a section list inside a dialog.
   * Both axes, because the list is a column on a wide window and a row on a
   * narrow one, and a reader on either should not have to know which.
   */
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, at: number): void {
    const step =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? -1
          : null;
    let next: number | null = null;
    if (step !== null) next = (at + step + SECTIONS.length) % SECTIONS.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = SECTIONS.length - 1;
    if (next === null) return;
    event.preventDefault();
    const target = SECTIONS.at(next);
    if (target === undefined) throw new Error(`no settings section at ${String(next)}`);
    show(target.id);
    document.getElementById(tabId(target.id))?.focus();
  }

  // Only a section holding something the reader can finish or cancel is named.
  // A refusal over a hold that is now only travelling — a refused write fixed
  // and sent again — says nothing until it lands: it then clears with the hold
  // (F-080), or be-01 refuses again and the section is held, not travelling.
  // Proof: on 2026-10-17, with the old `?? dirtySections[0]` fallback, `a
  // refused ladder sent again says it is saving, not that it is unsaved`
  // (project-settings-modal.test.tsx) failed on `expected 'Priorities has an
  // unsaved edit. Finis…' to be undefined` (ui-review F-111).
  const holding = refused ? dirtySections.find((id) => !busySections.includes(id)) : undefined;
  const travelling =
    closeWanted && holding === undefined
      ? SECTIONS.filter((s) => dirtySections.includes(s.id)).map((s) => s.label)
      : [];
  const holdingLabel = SECTIONS.find((s) => s.id === holding)?.label;
  const saving = SECTIONS.filter((s) => busySections.includes(s.id)).map((s) => s.label);
  const savingWords =
    travelling.length > 0
      ? `Saving ${travelling.join(' and ')}. The window closes when it lands.`
      : saving.length > 0
        ? `Saving ${saving.join(' and ')}…`
        : '';

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalTrigger asChild>
        <Button
          variant="outline"
          size={trigger === 'glyph' ? 'square' : 'sm'}
          type="button"
          // Proof: withholding the initial work-items GET with this guard absent
          // made project-settings.spec.ts's initial-read regression fail:
          // expected disabled, received enabled. Empty bands precede the first
          // authoritative read (usePlanReadState); mounted drafts must not reseed.
          disabled={priorities.bands.length === 0}
          aria-label="Project settings"
          data-hint="Teams, priorities and steps of this project"
        >
          <SettingsIcon />
          {trigger === 'labelled' && <span>Project settings</span>}
        </Button>
      </ModalTrigger>
      <ModalContent
        // Anchored at the top rather than centred. F-021 (UI review
        // 2026-10-13): sized by its contents and centred, the surface was
        // 346px on Teams and 538px on Priorities and re-centred on every tab,
        // so the tab list jumped under the pointer. A fixed height stopped the
        // jump but left Teams two-thirds empty; a top anchor keeps the title
        // and the tabs where they were clicked and lets each section be its own
        // height. Only the section scrolls (below), never the title or the ✕.
        // Wider than `2xl` so the Steps grid has a readable name column (F-020).
        //
        // The whole screen on a phone (F-054): as tall as its section, the
        // surface left the dimmed Plan actions sheet it is opened from showing
        // under it, a dialog stacked on a dialog. The sheet cannot close
        // instead, because this modal is mounted inside it. Proof: on
        // 2026-10-14, without the `max-md:` half, `on a phone the settings fill
        // the screen` (settings-layout.spec.ts) failed on `{ top: 41, bottom:
        // 455 }` against `{ top: 0, bottom: 812 }`.
        className="top-[5vh] translate-y-0 overflow-y-hidden max-md:inset-0 max-md:h-dvh max-md:max-h-dvh max-md:translate-x-0 max-md:rounded-none max-md:border-0 sm:max-w-3xl"
        // Radix performs the dismissal itself unless the event is prevented, so
        // a refused close has to be said here and not only in `onOpenChange`.
        //
        // Escape in a field is that field's: it puts the field back where it
        // is (D7), so while anything is held it is neither a request to leave
        // nor a reason to refuse one. Refusing here switched the modal to
        // another section's held draft, with the red sentence, and took the
        // focus out of the box whose Escape it was (ui-review F-112). With
        // nothing held it closes, as Escape anywhere else does. Radix listens on
        // the document's capture phase, before the field's own handler, so the
        // target is what tells the two apart.
        // Proof: on 2026-10-17, with a field's Escape sent through
        // `requestClose(false)` as before, `Escape in one section’s box puts it
        // back there, whatever another holds` (project-settings-modal.test.tsx)
        // failed on `toHaveAttribute("aria-selected", "true")` for Timezone, and
        // `Escape in a box whose ladder travels says only that it is saving`
        // on `expected 'Priorities has an unsaved edit. Finis…' to be undefined`.
        onEscapeKeyDown={(event) => {
          if (isField(event.target)) {
            if (dirtyRef.current.size > 0) event.preventDefault();
            return;
          }
          if (!requestClose(true)) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (!requestClose(true)) event.preventDefault();
        }}
        onKeyDownCapture={(event) => {
          if (event.key !== 'Escape') setCloseWanted(false);
        }}
        onPointerDownCapture={() => {
          setCloseWanted(false);
        }}
        onClickCapture={() => {
          setCloseWanted(false);
        }}
      >
        <ModalHeader>
          <ModalTitle>Project settings</ModalTitle>
          <ModalDescription>
            What this project configures about itself. Every setting here is this plan’s own, and
            each applies as you leave its field.
          </ModalDescription>
        </ModalHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 sm:flex-row">
          {/*
            Three to a row on a phone: six tabs in one row were cut to "Team"
            and ran into each other past the edge (F-053). A column from `sm`.
          */}
          <div
            role="tablist"
            aria-label="Project settings sections"
            className="grid shrink-0 grid-cols-3 gap-1 sm:flex sm:w-36 sm:flex-col"
          >
            {SECTIONS.map((section, at) => {
              const selected = shown === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  role="tab"
                  id={tabId(section.id)}
                  aria-selected={selected}
                  aria-controls={panelId(section.id)}
                  tabIndex={selected ? 0 : -1}
                  data-state={selected ? 'active' : 'inactive'}
                  // `border-0 bg-transparent` is what `buttonVariants` brings every chrome
                  // button: without it the platform's 2px border boxed each tab, the
                  // only 2px edge in the app (ui-review F-117).
                  className="data-[state=active]:bg-muted data-[state=inactive]:text-muted-foreground hover:bg-muted/60 rounded-md border-0 bg-transparent px-3 py-1.5 text-left text-sm"
                  onClick={() => {
                    show(section.id);
                  }}
                  onKeyDown={(event) => {
                    onTabKey(event, at);
                  }}
                >
                  {section.label}
                  {dirtySections.includes(section.id) && (
                    <span aria-hidden="true" data-fact="Has an unsaved edit">
                      {' '}
                      •
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/*
            `pb-6`, the surface's own `p-6`: a section that scrolls ends with the
            room the modal starts with, rather than its last line on the box's
            edge (ui-review F-123, Estimating at 1024×768).
          */}
          <div className="-mx-1 min-h-0 min-w-0 flex-1 overflow-y-auto px-1 pb-6">
            <div
              role="tabpanel"
              id={panelId('teams')}
              aria-labelledby={tabId('teams')}
              aria-busy={busySections.includes('teams')}
              hidden={shown !== 'teams'}
            >
              <TeamsPanel
                {...teams}
                onDirtyChange={reporters.teams}
                onBusyChange={busyReporters.teams}
              />
            </div>
            <div
              role="tabpanel"
              id={panelId('priorities')}
              aria-labelledby={tabId('priorities')}
              aria-busy={busySections.includes('priorities')}
              hidden={shown !== 'priorities'}
            >
              <PrioritiesPanel
                {...priorities}
                onDirtyChange={reporters.priorities}
                onBusyChange={busyReporters.priorities}
              />
            </div>
            <div
              role="tabpanel"
              id={panelId('steps')}
              aria-labelledby={tabId('steps')}
              aria-busy={busySections.includes('steps')}
              hidden={shown !== 'steps'}
            >
              <StepsPanel
                {...steps}
                onDirtyChange={reporters.steps}
                onBusyChange={busyReporters.steps}
              />
            </div>
            <div
              role="tabpanel"
              id={panelId('estimating')}
              aria-labelledby={tabId('estimating')}
              aria-busy={busySections.includes('estimating')}
              hidden={shown !== 'estimating'}
            >
              <EstimatingPanel
                {...estimating}
                onDirtyChange={reporters.estimating}
                onBusyChange={busyReporters.estimating}
              />
            </div>
            <div
              role="tabpanel"
              id={panelId('optimization')}
              aria-labelledby={tabId('optimization')}
              aria-busy={busySections.includes('optimization')}
              hidden={shown !== 'optimization'}
            >
              {optimization === undefined ? (
                <p className="text-muted-foreground text-sm">
                  Optimization settings are not available yet.
                </p>
              ) : (
                <OptimizationSettingsPanel
                  {...optimization}
                  onDirtyChange={reporters.optimization}
                  onBusyChange={busyReporters.optimization}
                />
              )}
            </div>
            <div
              role="tabpanel"
              id={panelId('timezone')}
              aria-labelledby={tabId('timezone')}
              aria-busy={busySections.includes('timezone')}
              hidden={shown !== 'timezone'}
            >
              <TimezonePanel
                {...timezone}
                onDirtyChange={reporters.timezone}
                onBusyChange={busyReporters.timezone}
              />
            </div>
          </div>
        </div>

        {/*
          Why the modal has not closed yet, at its foot: the surface is anchored
          at the top and grows downwards, so a line here moves neither the title
          nor the tabs. Between the description and the tabs it pushed both down
          36px for as long as a write travelled (Fable review of #453, the
          36 px shift). Proof: on 2026-10-14, with the lines back above the tabs,
          `the closing line moves neither the title nor the tabs`
          (settings-layout.spec.ts) failed on `Expected: 150, Received: 186`.
        */}
        {/*
          What travels, said politely as it goes (UI review F-081): a section's
          boxes are only `readOnly` while its write is in the air, and the
          tabpanel's `aria-busy` is read out by no screen reader. Mounted for the
          modal's whole life, because a live region that appears together with
          its words may not be read; `empty:sr-only` takes the quiet one out of
          the flow, so it costs the foot no gap.
          Proof: on 2026-10-16, against 3e06eb5a4 (the line rendered only with a
          close request), `says, politely, which section is saving while its
          write travels` (project-settings-modal.test.tsx) failed on `expected
          undefined to be 'status'`.
        */}
        <p
          role="status"
          data-settings-saving=""
          className="text-muted-foreground text-sm empty:sr-only"
        >
          {savingWords}
        </p>
        {holdingLabel !== undefined && (
          <p role="alert" data-settings-closing="" className="text-destructive text-sm">
            {holdingLabel} has an unsaved edit. Finish it or cancel it before closing.
          </p>
        )}
      </ModalContent>
    </Modal>
  );
}

/** Whether an event came from a box a reader types or picks in, whose Escape is its own. */
const isField = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement;

const tabId = (section: SettingsSection): string => `project-settings-tab-${section}`;
const panelId = (section: SettingsSection): string => `project-settings-panel-${section}`;
