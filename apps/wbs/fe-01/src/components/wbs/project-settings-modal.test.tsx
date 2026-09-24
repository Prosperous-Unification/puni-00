import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { DEFAULT_PRIORITY_BANDS } from '@wbs/domain/priority-band';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_PERT_WEIGHTS_VIEW, type PriorityBandView } from '@/lib/wbs-api';
import type { BrowserStorage } from '@/modules/preferences/contract';
import {
  fakeBrowserStorage,
  type HeldByFake,
  writeRefusingBrowserStorage,
} from '@/modules/preferences/fake-browser-storage';
import {
  type ApplicationServices,
  applicationSlot,
  installApplicationRuntime,
} from '@/runtime/application-runtime';
import {
  ApplicationServicesProvider,
  applicationServicesStateFor,
} from '@/runtime/application-services-context';
import { createLifetimeSlot, type LifetimeSlot } from '@/runtime/lifetime-slot';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';

import {
  isSettingsSection,
  ProjectSettingsModal,
  type ProjectSettingsModalProps,
  rememberedSettingsSection,
  rememberSettingsSection,
} from './project-settings-modal';
import { INITIAL_HIDDEN_COLUMNS } from './table-frame';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

publishApplicationRuntimeForEachTest();

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
});

const PROJECT = 'p1';
const SECTION_KEY = `wbs.projectSettingsSection.${PROJECT}`;

/** A request that lands only when the test says so — the window an in-flight write lives in. */
function held(): { promise: Promise<void>; land: () => void } {
  let land = (): void => {
    throw new Error('the promise executor did not run');
  };
  const promise = new Promise<void>((resolve) => {
    land = resolve;
  });
  return { promise, land };
}

/**
 * The modal with three fake sections' worth of plan behind it, every write
 * recorded, opened through its own trigger — because the trigger is the
 * component's, for Radix's focus-restore reason.
 */
function mounted(
  overrides: Partial<ProjectSettingsModalProps> = {},
  slot: LifetimeSlot<ApplicationServices> | null = null,
) {
  const setCapacity = vi.fn(() => Promise.resolve());
  const setBands = vi.fn<(bands: readonly PriorityBandView[]) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const addStep = vi.fn(() => Promise.resolve({ id: 'step-design', name: 'Design' }));
  const renameStep = vi.fn(() => Promise.resolve({ id: 'step-qa', name: 'Review' }));
  const removeStep = vi.fn(() => Promise.resolve({ ok: true }));
  const onChanged = vi.fn(() => Promise.resolve());
  const setArithmetic = vi.fn(() => Promise.resolve());
  const props: ProjectSettingsModalProps = {
    projectId: PROJECT,
    trigger: 'glyph',
    teams: {
      teams: [
        { id: 't-backend', name: 'Backend', stated: 2, rows: 4 },
        { id: 't-platform', name: 'Platform', stated: null, rows: 1 },
      ],
      setCapacity,
      onChanged,
    },
    priorities: { bands: DEFAULT_PRIORITY_BANDS, setBands, onChanged },
    steps: {
      steps: [
        { id: 'step-dev', name: 'Dev' },
        { id: 'step-qa', name: 'QA' },
      ],
      frameState: { hasAnyNotBefore: false, deepestDepth: 0, numberingFrozen: false },
      hiddenColumnIds: INITIAL_HIDDEN_COLUMNS,
      numberOf: () => null,
      nameOf: () => null,
      // The reach and its writer, stubbed rather than omitted: the panel draws
      // the ticked one straight off the project, and a suite that leaves a
      // required prop out typechecks differently from the app that mounts it.
      depReach: 'whole-item',
      setDepReach: () => Promise.resolve(),
      addStep,
      renameStep,
      removeStep,
      onChanged,
    },
    estimating: {
      method: 'pert',
      pertWeights: DEFAULT_PERT_WEIGHTS_VIEW,
      estimateRounding: 'ceil',
      setArithmetic,
      onChanged,
    },
    optimization: {
      value: { enabled: false, engine: 'fast', objective: 'pri' },
      setSettings: () => Promise.resolve(),
      onChanged,
    },
    ...overrides,
  };
  // A test that owns its own slot renders its own provider inside the file's;
  // the nearer provider is the one the modal reads.
  render(
    slot === null ? (
      <ProjectSettingsModal {...props} />
    ) : (
      <ApplicationServicesProvider slot={slot}>
        <ProjectSettingsModal {...props} />
      </ApplicationServicesProvider>
    ),
  );
  return { setCapacity, setBands, addStep, renameStep, removeStep, setArithmetic, onChanged };
}

const trigger = (): HTMLElement => screen.getByRole('button', { name: 'Project settings' });
const open = (): void => {
  fireEvent.click(trigger());
};
const tab = (name: string): HTMLElement => screen.getByRole('tab', { name });
const dialog = (): HTMLElement => screen.getByRole('dialog', { name: 'Project settings' });

/** Lets the awaits a write makes — the call, then the reread — settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resume) => setTimeout(resume, 0));
  });
}

/**
 * Escape as Radix sees it: a keydown that reaches `document`, where
 * `DismissableLayer` listens. Dispatched on the surface rather than on a box so
 * no panel's own `onKeyDown` is in the way of the claim being made about the
 * modal.
 */
const escape = (): void => {
  fireEvent.keyDown(dialog(), { key: 'Escape' });
};

describe('one modal for the project’s five settings', () => {
  itDom('opens on one control and offers every section from its tab list', () => {
    mounted();
    open();

    expect(dialog()).toBeInTheDocument();
    const list = screen.getByRole('tablist');
    expect(
      [...list.querySelectorAll('[role="tab"]')].map((each) => each.textContent.trim()),
    ).toEqual(['Teams', 'Priorities', 'Steps', 'Estimating', 'Optimization']);
    // The first section is showing, and it is the teams'.
    expect(tab('Teams')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Teams' })).toBeVisible();
    expect(screen.getByLabelText('How many of Backend at once')).toBeInTheDocument();
  });

  itDom('every section is reachable from the tab list, by click and by arrow key', () => {
    mounted();
    open();

    fireEvent.click(tab('Priorities'));
    expect(tab('Priorities')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Priorities' })).toBeVisible();
    // By id rather than by step: a `hidden` element is outside the accessibility
    // tree, which is the point, and a role query that could find it would be
    // asserting the opposite of what `hidden` means.
    expect(document.getElementById('project-settings-panel-teams')).not.toBeVisible();

    // Arrow keys select as they go — automatic activation — and wrap. The
    // sections are Teams, Priorities, Steps, Estimating, so the wrap is off
    // the **last** of the four and `End` lands on it.
    fireEvent.keyDown(tab('Priorities'), { key: 'ArrowDown' });
    expect(tab('Steps')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('New step')).toBeVisible();
    fireEvent.keyDown(tab('Steps'), { key: 'ArrowRight' });
    expect(tab('Estimating')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tab('Estimating'), { key: 'ArrowRight' });
    expect(tab('Optimization')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tab('Optimization'), { key: 'ArrowRight' });
    expect(tab('Teams')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tab('Teams'), { key: 'End' });
    expect(tab('Optimization')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tab('Optimization'), { key: 'Home' });
    expect(tab('Teams')).toHaveAttribute('aria-selected', 'true');
  });

  itDom('a half-typed value survives a look at another section', () => {
    // design.md D2: the inactive panels stay **mounted** and hidden. Unmounting
    // them would discard a half-typed capacity when the reader glanced at the
    // ladder — the "does not take the focus or the half-typed value" fault
    // class `AGENTS.md` records from 2026-08-06.
    //
    // Proof: the inactive panels rendered conditionally — `{shown === 'teams'
    // && <TeamsPanel …/>}` — instead of `hidden`, and this failed on
    // `expected '' to be '7'`; watched 2026-08-30.
    mounted();
    open();
    fireEvent.change(screen.getByLabelText('How many of Platform at once'), {
      target: { value: '7' },
    });

    fireEvent.click(tab('Priorities'));
    fireEvent.click(tab('Teams'));

    expect(screen.getByLabelText<HTMLInputElement>('How many of Platform at once').value).toBe('7');
  });
});

describe('closing over an edit', () => {
  itDom(
    'a clean modal closes from any section, and gives the focus back to its control',
    async () => {
      mounted();
      open();
      fireEvent.click(tab('Steps'));

      escape();
      await settle();

      expect(screen.queryByRole('dialog')).toBeNull();
      // Radix's `onCloseAutoFocus` cancels the default restore and focuses its
      // **trigger** — so a modal opened without a `ModalTrigger` puts the focus
      // nowhere. Found in a browser for the steps dialog this replaces, and
      // kept here because it is the modal's rule now.
      expect(document.activeElement).toBe(trigger());
    },
  );

  itDom('an in-flight write holds the modal open and is shown', async () => {
    // The spec's own scenario: the ladder is saving from the priorities section,
    // the reader has moved to the steps section, and Escape must neither close
    // nor leave them looking at the wrong section for why.
    //
    // Proof: `requestClose`'s `dirtyRef.current.size > 0` refusal removed, and
    // this failed on `Unable to find an accessible element with the role
    // "dialog"` — Escape closed over a ladder still travelling. And the fault
    // D3 names, a panel wired to report `false` while holding an in-flight
    // write (`const dirty = false` in `priorities-panel.tsx`): the same
    // failure, because the modal believes what it is told. Both watched
    // 2026-08-30.
    const landing = held();
    const setBands = vi.fn<(bands: readonly PriorityBandView[]) => Promise<void>>(
      () => landing.promise,
    );
    mounted({ priorities: { bands: DEFAULT_PRIORITY_BANDS, setBands, onChanged: vi.fn() } });
    open();
    fireEvent.click(tab('Priorities'));
    fireEvent.change(screen.getByLabelText('Name of band 1'), { target: { value: 'Blocker' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await settle();
    fireEvent.click(tab('Steps'));
    expect(tab('Steps')).toHaveAttribute('aria-selected', 'true');

    escape();
    await settle();

    expect(dialog()).toBeInTheDocument();
    expect(tab('Priorities')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('alert').textContent).toContain('Priorities has an unsaved edit');

    // And once it lands, the modal closes on its own: `Save` asked to close
    // when it was clicked, and the refusal was about the window, not the
    // section. The reader who pressed Save meant "save and leave".
    landing.land();
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  itDom('the ✕ is refused the same way, and says which section is holding', async () => {
    mounted();
    open();
    fireEvent.change(screen.getByLabelText('How many of Platform at once'), {
      target: { value: '7' },
    });
    fireEvent.click(tab('Steps'));

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await settle();

    expect(dialog()).toBeInTheDocument();
    expect(tab('Teams')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('alert').textContent).toContain('Teams has an unsaved edit');
  });

  itDom('refuses to close over a confirmation nobody has answered', async () => {
    // `steps-panel.test.tsx` — `steps-dialog.test.tsx` when it was written —
    // used to assert the opposite: that the ✕ *cleared*
    // an open confirmation silently. The modal refuses instead: a confirmation
    // somebody walked away from is not one they agreed to, and it is also not
    // one they declined.
    const removeStep = vi.fn((_stepId: string, cascade: boolean) =>
      cascade
        ? Promise.resolve({ ok: true })
        : Promise.resolve({
            ok: false,
            inUse: { estimates: 1, assignments: 0, assumedAssignees: [] },
          }),
    );
    mounted({
      steps: {
        steps: [{ id: 'step-qa', name: 'QA' }],
        frameState: { hasAnyNotBefore: false, deepestDepth: 0, numberingFrozen: false },
        hiddenColumnIds: INITIAL_HIDDEN_COLUMNS,
        numberOf: () => null,
        nameOf: () => null,
        depReach: 'whole-item',
        setDepReach: () => Promise.resolve(),
        addStep: vi.fn(),
        renameStep: vi.fn(),
        removeStep,
        onChanged: vi.fn(() => Promise.resolve()),
      },
    });
    open();
    fireEvent.click(tab('Steps'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove QA' }));
    await settle();
    expect(screen.getByLabelText('Delete them along with the step')).toBeInTheDocument();

    escape();
    await settle();
    expect(dialog()).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Keep QA' }));
    await settle();
    escape();
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  itDom('a section’s own Done closes without waiting for its next report', async () => {
    // The panel says it is clean by asking; the modal takes its word rather
    // than reading the dirty report from the previous render, which would make
    // `Done` a button that has to be clicked twice.
    const { setCapacity } = mounted();
    open();
    fireEvent.change(screen.getByLabelText('How many of Platform at once'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await settle();

    expect(setCapacity).toHaveBeenCalledWith('t-platform', 3);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  itDom('Escape over a capacity draft abandons the draft and keeps the modal', async () => {
    // Both halves of the teams dialog's old Escape, from two owners now: the
    // box forgets its draft, and the modal — which read the section as dirty
    // when the key was pressed — refuses the close. The sentence it would show
    // clears with the draft, because it is shown only while something is held.
    mounted();
    open();
    const box = screen.getByLabelText<HTMLInputElement>('How many of Backend at once');
    fireEvent.change(box, { target: { value: '9' } });

    fireEvent.keyDown(box, { key: 'Escape' });
    await settle();

    expect(dialog()).toBeInTheDocument();
    expect(box.value).toBe('2');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('the section it reopens on', () => {
  itDom('reopens where it was left, per project', async () => {
    mounted();
    open();
    fireEvent.click(tab('Priorities'));
    escape();
    await settle();
    expect(localStorage.getItem(SECTION_KEY)).toBe('priorities');

    open();
    expect(tab('Priorities')).toHaveAttribute('aria-selected', 'true');
  });

  itDom('an unrecognised remembered section is dropped, and the first is shown', () => {
    // design.md D4: the stored value is a claim. A `7`, a section this modal
    // does not have, or a value from a future version all select nothing, and
    // a modal that showed nothing would be one that cannot be used until
    // storage is cleared by hand.
    //
    // Proof: the `isSettingsSection` guard in `rememberedSettingsSection`
    // replaced by an unchecked cast, and this failed on
    // `expect(element).toHaveAttribute("aria-selected", "true")` — no tab
    // selected and no panel visible; watched 2026-08-30.
    localStorage.setItem(SECTION_KEY, '7');
    mounted();
    open();

    expect(tab('Teams')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Teams' })).toBeVisible();
    // Dropped, key and all — not kept for the next read to trip on.
    expect(localStorage.getItem(SECTION_KEY)).toBeNull();
  });

  it('knows its own sections and nothing else', () => {
    expect(isSettingsSection('teams')).toBe(true);
    expect(isSettingsSection('steps')).toBe(true);
    expect(isSettingsSection('7')).toBe(false);
    expect(isSettingsSection(7)).toBe(false);
    expect(isSettingsSection(null)).toBe(false);
  });

  it('reads an absent key as the first section', () => {
    expect(
      rememberedSettingsSection(applicationServicesStateFor(applicationSlot), 'nobody'),
    ).toEqual({ value: 'teams', persists: true });
  });
});

/**
 * The four lifecycle transitions of `docs/superpowers/plans/2026-09-21-batch-6/050-7-f1-theme-hook-model.md`,
 * for a modal that reads and writes its section only when a handler runs.
 *
 * The modal renders nothing derived from the store and does not re-render when
 * the slot moves, so every transition here is about which runtime a handler
 * reaches at the instant it runs.
 */
describe('the section it reopens on, over the runtime live when a handler runs', () => {
  /** Every slot this block built, given back after React's own cleanup. */
  const built: LifetimeSlot<ApplicationServices>[] = [];

  afterEach(async () => {
    try {
      cleanup();
    } finally {
      for (const slot of built.splice(0)) await slot.retire();
    }
  });

  function emptySlot(): LifetimeSlot<ApplicationServices> {
    const slot = createLifetimeSlot<ApplicationServices>(50);
    built.push(slot);
    return slot;
  }

  /** The production installer over `store`, live when this resolves. */
  async function publishOver(
    slot: LifetimeSlot<ApplicationServices>,
    store: BrowserStorage,
  ): Promise<void> {
    await act(async () => {
      await slot.replace(() =>
        installApplicationRuntime({
          openStore: () => store,
          isLive: () => slot.snapshot().status === 'live',
        }),
      );
    });
  }

  const heldSection = (store: HeldByFake): string | undefined => store.held()[SECTION_KEY];

  itDom('opens on the first section and remembers nothing when no runtime is live', () => {
    const slot = emptySlot();
    mounted({}, slot);
    open();
    expect(tab('Teams')).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(tab('Priorities'));

    expect(tab('Priorities')).toHaveAttribute('aria-selected', 'true');
    // Not the page's own runtime either: nothing fell through to it.
    expect(localStorage.getItem(SECTION_KEY)).toBeNull();
    expect(rememberedSettingsSection(applicationServicesStateFor(slot), PROJECT)).toEqual({
      value: 'teams',
      persists: false,
    });
  });

  itDom('stops remembering once its runtime is withdrawn, and never throws', async () => {
    const store = fakeBrowserStorage({ [SECTION_KEY]: 'steps' });
    const slot = emptySlot();
    await publishOver(slot, store);
    mounted({}, slot);
    await act(async () => {
      await slot.retire();
    });

    open();
    expect(tab('Teams')).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(tab('Estimating'));

    expect(tab('Estimating')).toHaveAttribute('aria-selected', 'true');
    expect(heldSection(store)).toBe('steps');
    expect(rememberSettingsSection(applicationServicesStateFor(slot), PROJECT, 'teams')).toBe(
      false,
    );
  });

  itDom('reopens on a replacement runtime’s own remembered section', async () => {
    const first = fakeBrowserStorage({ [SECTION_KEY]: 'steps' });
    const second = fakeBrowserStorage({ [SECTION_KEY]: 'priorities' });
    const slot = emptySlot();
    await publishOver(slot, first);
    mounted({}, slot);
    await publishOver(slot, second);

    open();

    expect(tab('Priorities')).toHaveAttribute('aria-selected', 'true');
    expect(heldSection(first)).toBe('steps');
  });

  itDom(
    'writes a section chosen after a replacement into the replacement, from a modal opened before it',
    async () => {
      const first = fakeBrowserStorage();
      const second = fakeBrowserStorage();
      const slot = emptySlot();
      await publishOver(slot, first);
      mounted({}, slot);
      open();
      await publishOver(slot, second);

      fireEvent.click(tab('Steps'));

      expect(tab('Steps')).toHaveAttribute('aria-selected', 'true');
      expect(heldSection(second)).toBe('steps');
      expect(heldSection(first)).toBeUndefined();
    },
  );

  itDom(
    'lets a store’s own write failure through by identity, showing no section it could not keep',
    async () => {
      const denied = new Error('write denied');
      const store = writeRefusingBrowserStorage(denied);
      const slot = emptySlot();
      await publishOver(slot, store);
      mounted({}, slot);
      open();

      const reported: unknown[] = [];
      const report = (event: ErrorEvent): void => {
        reported.push(event.error);
        event.preventDefault();
      };
      window.addEventListener('error', report);
      try {
        fireEvent.click(tab('Priorities'));
      } finally {
        window.removeEventListener('error', report);
      }

      expect(reported).toHaveLength(1);
      expect(reported[0]).toBe(denied);
      expect(tab('Teams')).toHaveAttribute('aria-selected', 'true');
      expect(heldSection(store)).toBeUndefined();
    },
  );
});

describe('the control that opens it', () => {
  itDom('is a glyph on the wide bar, named for a screen reader', () => {
    mounted({ trigger: 'glyph' });
    const control = trigger();
    expect(control.textContent.trim()).toBe('');
    expect(control.querySelectorAll('svg')).toHaveLength(1);
  });

  itDom('carries its label on the phone’s sheet', () => {
    mounted({ trigger: 'labelled' });
    expect(trigger().textContent).toContain('Project settings');
  });
});
