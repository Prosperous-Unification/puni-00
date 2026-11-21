import {
  act,
  cleanup,
  fireEvent,
  getConfig,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { PlanDocumentRequest, SessionFeatures } from '@wbs/contracts';
import { DEFAULT_PRIORITY_BANDS } from '@wbs/domain/priority-band';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FaultBoundary } from '@/components/chrome/fault-boundary';
import * as projectDialogModule from '@/components/projects/new-project-dialog';
import * as projectPickerModule from '@/components/projects/project-picker';
import type {
  SavedPlanCompareReply,
  SavedPlanListEntryView,
  SavedPlanListReply,
  SavedPlanRenameReply,
  SavedPlanSaveReply,
} from '@/lib/saved-plan-api';
import { SessionFeaturesProvider } from '@/lib/session-features';
import type {
  CreatedWorkPackage,
  PlanImportSummary,
  WorkPackageApi,
  WorkPackageListEntry,
} from '@/lib/wbs-api';
import { DEFAULT_PERT_WEIGHTS_VIEW, PlanImportRefusalError, WbsRequestError } from '@/lib/wbs-api';
import type { SocketHandlers, WorkPackageStreamDeps } from '@/lib/work-package-stream';
import type { BrowserStorage } from '@/modules/preferences/contract';
import {
  fakeBrowserStorage,
  type HeldByFake,
  writeRefusingBrowserStorage,
} from '@/modules/preferences/fake-browser-storage';
import type { SavedPlanRoutes } from '@/modules/saved-plans/contract';
import { type ApplicationServices, installApplicationRuntime } from '@/runtime/application-runtime';
import {
  ApplicationServicesProvider,
  applicationServicesStateFor,
} from '@/runtime/application-services-context';
import { createLifetimeSlot, type LifetimeSlot } from '@/runtime/lifetime-slot';
import { createWorkPackageOwner } from '@/runtime/work-package-runtime';
import { fakeWorkPackageApi } from '@/testing/fake-work-package-api';
import mountedTransfer from '@/testing/fixtures/connected-transfer.json';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
import { recordCalls } from '@/testing/record-calls';
import { refusingApi } from '@/testing/refusing-api';
import { planRead } from '@/testing/views';
import {
  pageWiring,
  VIEWER_ACCOUNT_ID,
  WorkPackagePageOverOwner,
} from '@/testing/work-package-page-over-owner';

import { forgetRefusedDrafts } from './live-editing';
import { distinctImportName } from './plan-import-words';
import { INFO_TOAST_MS } from './toasts';
import {
  recallLastWorkPackage,
  rememberLastWorkPackage,
  WorkPackagePage,
} from './work-package-page';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

publishApplicationRuntimeForEachTest();

/**
 * A WorkPackageApi over an in-memory work package list. The table's methods answer
 * emptily rather than throwing: selecting a work package renders a real WbsTable,
 * and these tests are about the page around it, not the table.
 */
function fakeWorkPackages(
  initial: WorkPackageListEntry[],
): WorkPackageApi & { renamed: [string, string][]; opened: string[]; drop: (id: string) => void } {
  let workPackages = [...initial];
  const parents = new Map(initial.map((entry) => [entry.id, entry.projectId]));
  const renamed: [string, string][] = [];
  const opened: string[] = [];
  return Object.assign(
    refusingApi(
      {
        listWorkPackages: () => Promise.resolve([...workPackages]),
        listProjects: () =>
          Promise.resolve([
            {
              id: 'fixture-project',
              organizationId: 'fixture-organization',
              spaceId: null,
              spacePosition: null,
              name: 'Fixture project',
              revision: 0,
              createdAt: 1,
              updatedAt: null,
              createdBy: null,
              workPackageCount: workPackages.filter(
                (entry) => entry.projectId === 'fixture-project',
              ).length,
            },
          ]),
        openWorkPackage(id: string) {
          opened.push(id);
          return Promise.resolve();
        },
        createWorkPackage(projectId: string, name: string) {
          const id = `p${String(workPackages.length + 1)}`;
          parents.set(id, projectId);
          // Two shapes, as be-01 has them. The list gains a whole entry; the
          // response carries the work package that was written and **no**
          // `lastOpenedAt` — an account's navigation history is not part of a row
          // that has just come into being, and typing it as the list's shape is
          // what let the page believe otherwise.
          workPackages = [
            ...workPackages,
            {
              projectId,
              id,
              name,
              restricted: false,
              abbreviation: 'PLAN',
              startDate: null,
              lastOpenedAt: null,
              createdByName: 'kat',
              createdAt: MADE_ON,
            },
          ];
          const created: CreatedWorkPackage = {
            projectId,
            id,
            name,
            restricted: false,
            abbreviation: 'PLAN',
          };
          return Promise.resolve(created);
        },
        renameWorkPackage(id: string, name: string) {
          renamed.push([id, name]);
          workPackages = workPackages.map((p) => (p.id === id ? { ...p, name } : p));
          return Promise.resolve();
        },
        setAbbreviation(id: string, abbreviation: string) {
          const canonical = abbreviation.toUpperCase();
          if (
            workPackages.some(
              (workPackage) => workPackage.id !== id && workPackage.abbreviation === canonical,
            )
          )
            return Promise.reject(new Error('abbreviation_taken'));
          workPackages = workPackages.map((workPackage) =>
            workPackage.id === id ? { ...workPackage, abbreviation: canonical } : workPackage,
          );
          return Promise.resolve(canonical);
        },
        tree: () =>
          Promise.resolve(
            planRead({
              workItems: [],
              seq: -1,
              scheduleError: null,
              slices: [],
              steps: [],
              assignedPeople: [],
              // Present and empty, never absent: be-01 always sends it, so a fake that
              // left it out would let `teamsOnThePlan` be handed `undefined` here and
              // never in production. A plan whose teams are unlimited is what `[]` says.
              teamCapacities: [],
              priorityBands: [...DEFAULT_PRIORITY_BANDS],
              estimateMethod: 'pert' as const,
              depReach: 'whole-item' as const,
              pertWeights: DEFAULT_PERT_WEIGHTS_VIEW,
              estimateRounding: 'ceil' as const,
              startDate: null,
              workPackageRevision: 0,
              undoable: false,
              redoable: false,
            }),
          ),
        setEstimateMethod: () => Promise.resolve(),
        setStartDate: () => Promise.resolve(),
        listTeams: () => Promise.resolve([]),
        listTags: () => Promise.resolve([]),
        listWorkItemTypes: () => Promise.resolve([]),
        listExternalSystems: () => Promise.resolve([]),
        listServices: () => Promise.resolve([]),
        addTeam: () => Promise.reject(new Error('not_in_these_tests')),
        listPeople: () => Promise.resolve([]),
        // The table reads the calendar markers on mount, alongside the plan, so a
        // double that stands in for a work package has to answer it: unstated, this api
        // refuses on purpose and the refusal arrives as a toast over every case in
        // this file. Empty is what these work packages have.
        listCalendarMarkers: () => Promise.resolve([]),
        // Claims too, for the same reason: unstated, the stale notice stands over every case.
        readClaims: () => Promise.resolve({ readAt: 0, claims: [] }),
        addPerson: () => Promise.reject(new Error('not_in_these_tests')),
        assignPerson: () => Promise.reject(new Error('not_in_these_tests')),
        steps: () => Promise.resolve([]),
        createWorkItem: () => Promise.reject(new Error('not_in_these_tests')),
        patchWorkItem: () => Promise.reject(new Error('not_in_these_tests')),
        moveWorkItem: () => Promise.reject(new Error('not_in_these_tests')),
        duplicateWorkItem: () => Promise.reject(new Error('not_in_these_tests')),
        removeWorkItem: () => Promise.reject(new Error('not_in_these_tests')),
        setEstimate: () => Promise.reject(new Error('not_in_these_tests')),
        clearEstimate: () => Promise.reject(new Error('not_in_these_tests')),
        freezeWorkPackage: () => Promise.reject(new Error('not_in_these_tests')),
        unfreezeWorkPackage: () => Promise.reject(new Error('not_in_these_tests')),
        unfreezeWorkItem: () => Promise.reject(new Error('not_in_these_tests')),
        addDependency: () => Promise.reject(new Error('not_in_these_tests')),
        removeDependency: () => Promise.reject(new Error('not_in_these_tests')),
        undo: () => Promise.reject(new Error('not_in_these_tests')),
        redo: () => Promise.reject(new Error('not_in_these_tests')),
      },
      {
        projectIdOf: (id: string) => {
          const parent = parents.get(id);
          if (parent === undefined) throw new Error('fixture package parent is absent');
          return parent;
        },
      },
    ),
    {
      renamed,
      opened,
      // A deletion that happened somewhere else: the next listWorkPackages simply
      // no longer has the work package.
      drop: (id: string) => {
        workPackages = workPackages.filter((p) => p.id !== id);
      },
    },
  );
}

/**
 * The first of June **this** year, as an epoch millisecond.
 *
 * Computed from the running year rather than pinned to a literal, because the
 * meta drops the year exactly when it matches today's — a fixed `2026-06-01`
 * would print `1 Jun` until the first of January and `1 Jun 2026` for ever
 * after, and every expectation in this file would go red on a date rather than
 * on a change. `shortInstant`'s own rule is proven in `short-date.test.ts`;
 * this file only needs a day it can name.
 */
const MADE_ON = new Date(new Date().getFullYear(), 5, 1, 12).getTime();

/** The same day next year, which is the side of the boundary that shows a year. */
const MADE_NEXT_YEAR = new Date(new Date().getFullYear() + 1, 5, 1, 12).getTime();

/** What the meta prints for {@link MADE_ON}: no year, because it is this one. */
const THIS_JUNE = '1 Jun';

const TWO: WorkPackageListEntry[] = [
  {
    projectId: 'fixture-project',
    id: 'p1',
    name: 'Rewire the shed',
    restricted: false,
    abbreviation: 'PLAN',
    startDate: null,
    lastOpenedAt: null,
    createdByName: 'kat',
    createdAt: MADE_ON,
  },
  {
    projectId: 'fixture-project',
    id: 'p2',
    name: 'Paint the fence',
    restricted: false,
    abbreviation: 'PLAN',
    startDate: null,
    lastOpenedAt: null,
    createdByName: 'strip',
    createdAt: MADE_ON,
  },
];

const IMPORTABLE_PLAN: PlanDocumentRequest = {
  document: { format: 'wbs-plan', version: 1, exportedAt: '2026-09-14T09:00:00.000Z' },
  settings: {
    name: 'Imported exact',
    restricted: false,
    estimateMethod: 'pert',
    depReach: 'whole-item',
    pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
    estimateRounding: 'ceil',
    startDate: null,
    solutionRef: null,
    optimizationEnabled: false,
    scheduleEngine: 'fast',
    scheduleObjective: 'pri',
  },
  capacity: [],
  priorityBands: [],
  calendarMarkers: [],
  directory: { teams: [], people: [], tags: [], services: [], types: [], externalSystems: [] },
  workItems: [],
  steps: [],
};

const IMPORTED: PlanImportSummary = {
  workPackageId: 'p3',
  rows: 40,
  created: {
    teams: [],
    people: [],
    tags: ['Needs review'],
    services: [],
    types: [],
    externalSystems: [],
  },
  solutionRef: 'none',
};

/** Opens the actual destination disclosure before observing its controls or metadata state. */
function openWorkPackageActions(): HTMLElement {
  const trigger = within(screen.getByRole('banner')).getByLabelText('Work package actions', {
    selector: 'summary',
  });
  const panel = trigger.closest('details');
  if (panel === null) throw new Error('Project actions is outside its disclosure');
  expect(trigger).toBeVisible();
  if (!panel.open) fireEvent.click(trigger);
  expect(panel).toHaveAttribute('open');
  return trigger;
}

async function chooseFixtureProject(): Promise<void> {
  openWorkPackageActions();
  await screen.findByRole('option', { name: 'Fixture project' });
  openWorkPackageActions();
  fireEvent.change(screen.getByRole('combobox', { name: 'Destination project' }), {
    target: { value: 'fixture-project' },
  });
}

const importFile = async (contents: unknown = IMPORTABLE_PLAN): Promise<void> => {
  await chooseFixtureProject();
  fireEvent.change(screen.getByLabelText('Import JSON'), {
    target: {
      files: [
        new File(
          [typeof contents === 'string' ? contents : JSON.stringify(contents)],
          'plan.json',
          {
            type: 'application/json',
          },
        ),
      ],
    },
  });
};

const toastTexts = (): string[] =>
  [...document.querySelectorAll('[data-toast-text]')].map((node) => node.textContent);

/**
 * Settles once `shows` holds for the document, checked at once and after every
 * DOM mutation, with React's act environment lifted as `waitFor` lifts it.
 *
 * It has no clock of its own. The target's `--testTimeout`
 * ([test budgets](../../../../../../docs/test-budgets.md)) is the one bound, so a
 * page that is merely slow on a loaded host is waited for, and a page that
 * never arrives still fails the test. A nested one-second `waitFor` around an
 * import, a pick and a remount failed 4 of 24 loaded runs (WBS 080.12).
 */
function untilDocumentShows(shows: () => boolean): Promise<void> {
  return getConfig().asyncWrapper(
    () =>
      new Promise<void>((resolve) => {
        if (shows()) {
          resolve();
          return;
        }
        const observer = new MutationObserver(() => {
          if (!shows()) return;
          observer.disconnect();
          resolve();
        });
        observer.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
      }),
  );
}

/** A third work package, so a card can be asked to leave the options either side of it alone. */
const THREE: WorkPackageListEntry[] = [
  ...TWO,
  {
    projectId: 'fixture-project',
    id: 'p3',
    name: 'Sand the floor',
    restricted: false,
    abbreviation: 'PLAN',
    startDate: null,
    lastOpenedAt: null,
    createdByName: 'kat',
    createdAt: MADE_ON,
  },
];

/** One saved plan, so a selected work package's shelf has a row to show. */
const CHECKPOINT: SavedPlanListEntryView = {
  id: 'sp1',
  name: 'before the re-plan',
  createdBy: 'ada',
  createdAt: MADE_ON,
  inputBytes: 4096,
  scheduleBytes: 2048,
  scheduleAbsentReason: null,
};

const savedPlanListReply = (rows: readonly SavedPlanListEntryView[]): SavedPlanListReply => ({
  kind: 'success',
  representation: 'json',
  status: 200,
  headers: new Headers(),
  body: { savedPlans: [...rows] },
});
const savedPlanSaveReply = (): SavedPlanSaveReply => ({
  kind: 'success',
  representation: 'json',
  status: 201,
  headers: new Headers(),
  body: { savedPlan: CHECKPOINT },
});
const savedPlanCompareReply = (): SavedPlanCompareReply => ({
  kind: 'success',
  representation: 'json',
  status: 200,
  headers: new Headers(),
  body: {
    diff: { input: [], schedule: [] },
    left: {
      source: { kind: 'saved', savedPlanId: CHECKPOINT.id },
      schedule: { present: true, algorithmId: 'retired' },
      provenance: { kind: 'legacy-unknown' },
      parent: { kind: 'unrecorded' },
    },
    right: {
      source: { kind: 'current' },
      schedule: { present: false, absentReason: 'pending' },
      provenance: { kind: 'legacy-unknown' },
      parent: { kind: 'recorded', projectId: 'fixture-project' },
    },
  },
});
const savedPlanRenameReply = (): SavedPlanRenameReply => ({
  kind: 'success',
  representation: 'json',
  status: 200,
  headers: new Headers(),
  body: { savedPlanId: CHECKPOINT.id, name: CHECKPOINT.name },
});

/**
 * The shelf's wiring, faked — handed to **every** render in this file.
 *
 * Not only to the case that asserts the panel: selecting a work package mounts
 * `SavedPlansPanel`, and without an override it would build the real HTTP deps
 * and put a `fetch` at a relative URL into jsdom on any test that picks or
 * creates a work package. The default is what production uses and this is what the
 * page around it is tested with, which is the same bargain `api` already makes
 * one prop up.
 */
const fakeSavedPlanRoutes = (
  rows: readonly SavedPlanListEntryView[] = [CHECKPOINT],
): SavedPlanRoutes => ({
  available: () => Promise.resolve(true),
  list: () => Promise.resolve(savedPlanListReply(rows)),
  subscribe: () => ({ unsubscribe: () => undefined }),
  save: () => Promise.resolve(savedPlanSaveReply()),
  compare: () => Promise.resolve(savedPlanCompareReply()),
  rename: () => Promise.resolve(savedPlanRenameReply()),
  remove: () => Promise.reject(new Error('not answered in this case')),
});

const pageWith = (api: WorkPackageApi, savedPlanRoutes: SavedPlanRoutes = fakeSavedPlanRoutes()) =>
  render(<WorkPackagePageOverOwner api={api} savedPlanRoutes={savedPlanRoutes} />);

async function pageWithEditableBoardRow(streamDeps?: WorkPackageStreamDeps) {
  const model = fakeWorkPackageApi();
  await model.createWorkItem('p2', { parentId: null, afterId: null, name: 'Build' });
  const api = fakeWorkPackages(TWO);
  api.tree = (workPackageId) => model.tree(workPackageId);
  api.steps = (workPackageId) => model.steps(workPackageId);
  api.patchWorkItem = (workItemId, patch) => model.patchWorkItem(workItemId, patch);
  api.setStatus = (workItemId, status, on, factStart) =>
    model.setStatus(workItemId, status, on, factStart);
  api.setEstimate = (workItemId, stepId, days) => model.setEstimate(workItemId, stepId, days);
  const writes = recordCalls(api, 'patchWorkItem');
  const undos = recordCalls(api, 'undo');
  const redos = recordCalls(api, 'redo');
  const statuses = recordCalls(api, 'setStatus');
  const estimates = recordCalls(api, 'setEstimate');
  const owner = createWorkPackageOwner();
  render(<WorkPackagePage {...pageWiring(owner, api, streamDeps, fakeSavedPlanRoutes())} />);
  await selectWorkPackage('p2');
  const field = await screen.findByLabelText<HTMLInputElement>('Name of 010');
  return { field, writes, undos, redos, statuses, estimates, model, owner, api };
}

const picker = () => screen.getByLabelText<HTMLInputElement>('Work package');

/**
 * The entries on offer, in the order the picker is showing them.
 *
 * Whole entries rather than bare names: the meta is **inside** the option, so
 * this is what somebody choosing reads and what a screen reader announces. An
 * assertion against the name alone would go green with the meta rendered
 * outside the option, which is the one place it must not be.
 */
const optionNames = () =>
  Array.from(document.querySelectorAll('#work-package-options [role="option"]')).map(
    (entry) => entry.textContent,
  );

/** Opens the list — the picker offers everything when it takes the focus. */
function openPicker() {
  fireEvent.focus(picker());
}

/** Gives jsdom's open picker the rectangles a browser supplies. */
function layOutPicker(): HTMLElement {
  const list = screen.getByRole('listbox', { name: 'Work packages' });
  list.getBoundingClientRect = () => new DOMRect(0, 0, 200, 240);
  within(list)
    .getAllByRole('option')
    .forEach((option, index) => {
      option.getBoundingClientRect = () => new DOMRect(0, index * 24, 200, 20);
    });
  return list;
}

async function selectWorkPackage(id: string) {
  await waitFor(() => {
    expect(screen.getByLabelText('Work package')).toBeDefined();
  });
  openPicker();
  await waitFor(() => {
    expect(document.getElementById(`work-package-option-${id}`)).not.toBeNull();
  });
  const entry = document.getElementById(`work-package-option-${id}`);
  if (entry === null) throw new Error(`no option for ${id}`);
  fireEvent.click(entry);
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('opening an imported work package', () => {
  itDom(
    'disables the catalogue import choice until a project is selected in the empty state',
    async () => {
      pageWith(fakeWorkPackages([]));
      const option = await screen.findByRole('checkbox', { name: 'Define missing steps' });
      expect(option).not.toBeChecked();
      expect(option).toBeDisabled();
      await chooseFixtureProject();
      expect(option).toBeEnabled();
      expect(screen.getByLabelText('Import JSON')).toBeEnabled();
    },
  );

  itDom(
    'captures catalogue import opt-in while reading and resets after refusal without retry',
    async () => {
      const api = fakeWorkPackages(TWO);
      const imported = vi.fn<WorkPackageApi['importPlan']>(() =>
        Promise.reject(
          new PlanImportRefusalError({ error: 'unknown_step_codes', codes: ['qa', 'dev'] }),
        ),
      );
      api.importPlan = imported;
      let finishRead: () => void = () => {
        throw new Error('read not started');
      };
      vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
        Object.defineProperty(this, 'result', {
          configurable: true,
          value: JSON.stringify(IMPORTABLE_PLAN),
        });
        finishRead = () => {
          this.dispatchEvent(new ProgressEvent('load'));
        };
      });
      pageWith(api);
      await selectWorkPackage('p1');
      await chooseFixtureProject();
      const option = screen.getByRole('checkbox', { name: 'Define missing steps' });
      fireEvent.click(option);
      expect(option).toBeChecked();
      await importFile();
      expect(option).toBeDisabled();
      await act(async () => {
        finishRead();
        await Promise.resolve();
      });
      await waitFor(() => {
        expect(option).toBeEnabled();
      });
      expect(imported).toHaveBeenCalledTimes(1);
      expect(imported.mock.calls[0]?.[0]).toBe('fixture-project');
      expect(imported.mock.calls[0]?.[1].settings.name).toBe('Imported exact');
      expect(imported.mock.calls[0]?.[2]).toEqual({ defineMissing: true });
      expect(option).not.toBeChecked();
      expect(toastTexts()).toEqual([
        'Unknown step codes: qa, dev. To create them, select “Define missing steps” and import again with project settings permission.',
      ]);
      await importFile();
      await act(async () => {
        finishRead();
        await Promise.resolve();
      });
      await waitFor(() => {
        expect(imported).toHaveBeenCalledTimes(2);
      });
      expect(imported.mock.calls[1]?.[2]).toEqual({ defineMissing: false });
    },
  );

  itDom('resets catalogue import opt-in when the selected project is replaced', async () => {
    pageWith(fakeWorkPackageApi());
    await chooseFixtureProject();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Define missing steps' }));
    await submitNamedPair();
    await expectNamedPairSelected();
    expect(screen.getByRole('checkbox', { name: 'Define missing steps' })).not.toBeChecked();
  });

  itDom('resets catalogue import opt-in after a file error without sending', async () => {
    const api = fakeWorkPackages([]);
    const imported = vi.fn<WorkPackageApi['importPlan']>();
    api.importPlan = imported;
    pageWith(api);
    await chooseFixtureProject();
    const option = screen.getByRole('checkbox', { name: 'Define missing steps' });
    fireEvent.click(option);
    await importFile('not json');
    await waitFor(() => {
      expect(toastTexts()).toEqual(['This file is not JSON.']);
    });
    expect(option).not.toBeChecked();
    expect(option).toBeEnabled();
    expect(imported).not.toHaveBeenCalled();
  });

  itDom('resets catalogue import opt-in after success in the empty state', async () => {
    const api = fakeWorkPackages([]);
    const imported = vi.fn<WorkPackageApi['importPlan']>(async (projectId, document) => {
      const created = await api.createWorkPackage(projectId, document.settings.name);
      return { ...IMPORTED, workPackageId: created.id };
    });
    api.importPlan = imported;
    pageWith(api);
    await chooseFixtureProject();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Define missing steps' }));
    await importFile();
    await waitFor(() => {
      expect(picker()).toHaveValue('Imported exact');
    });
    expect(imported.mock.calls[0]?.[2]).toEqual({ defineMissing: true });
    expect(screen.getByRole('checkbox', { name: 'Define missing steps' })).not.toBeChecked();
    expect(imported).toHaveBeenCalledTimes(1);
  });

  itDom('shows retired catalogue import codes without opting in or retrying', async () => {
    const api = fakeWorkPackages([]);
    const imported = vi.fn<WorkPackageApi['importPlan']>(() =>
      Promise.reject(
        new PlanImportRefusalError({ error: 'retired_step_codes', codes: ['qa', 'dev'] }),
      ),
    );
    api.importPlan = imported;
    pageWith(api);
    await importFile();
    await waitFor(() => {
      expect(toastTexts()).toEqual([
        'Retired step codes: qa, dev. These codes cannot be reused. Update the file to use active steps before importing again.',
      ]);
    });
    expect(imported).toHaveBeenCalledExactlyOnceWith('fixture-project', expect.anything(), {
      defineMissing: false,
    });
    expect(screen.getByRole('checkbox', { name: 'Define missing steps' })).not.toBeChecked();
  });

  itDom(
    'refreshes the picker catalogue and keeps one success toast across the table remount',
    async () => {
      const api = fakeWorkPackages(TWO);
      const readPlan = api.tree.bind(api);
      let announceImportedRead: () => void = () => {
        throw new Error('the imported work package read announcer was not installed');
      };
      const importedRead = new Promise<void>((resolve) => {
        announceImportedRead = resolve;
      });
      const readTree = vi.fn((workPackageId: string) => {
        if (workPackageId === 'p3') announceImportedRead();
        return readPlan(workPackageId);
      });
      api.tree = readTree;
      api.importPlan = async () => {
        const workPackage = await api.createWorkPackage('fixture-project', 'Imported exact');
        return { ...IMPORTED, workPackageId: workPackage.id };
      };
      pageWith(api);
      await selectWorkPackage('p1');
      await untilDocumentShows(() => screen.queryByLabelText('Import JSON') !== null);
      // The success toast fades after `INFO_TOAST_MS` of `setTimeout`. Every
      // timer of that length is dropped until the remount is seen, so the toast
      // can only have survived the remount or been lost in it, never have faded
      // while a loaded host was still remounting. Only those timers: faking
      // every `setTimeout` instead hung the import itself at the 30 s budget,
      // 48 of 48 loaded runs.
      const realSetTimeout = globalThis.setTimeout;
      const droppedFades = vi
        .spyOn(globalThis, 'setTimeout')
        .mockImplementation(((handler: () => void, delayMs?: number, ...rest: unknown[]) =>
          delayMs === INFO_TOAST_MS
            ? realSetTimeout(() => undefined, 0)
            : realSetTimeout(handler, delayMs, ...rest)) as typeof setTimeout);
      try {
        await importFile();

        // The imported work package's own runtime asking for its plan, then its table
        // drawn with the toast the page kept across the remount: the two events
        // the import ends in, awaited as events rather than inside a clock.
        // Proof: on 2026-09-29, 8 copies x 3 rounds beside 24 busy loops failed the
        // former one-second `waitFor` here 4 of 24 times: `readTree` called only
        // with p1 while the pick of p3 waited 700 ms for its effect. Awaiting the
        // events with the fade left real then timed out 1 of 24 runs at 30 s:
        // the toast had faded before the p3 table was drawn.
        await importedRead;
        // Two questions since the stack is portalled to `<body>` (UI review
        // F-085): the p3 table is drawn, and a toast is on screen. The stack
        // is no longer inside the table that draws it.
        await untilDocumentShows(
          () =>
            document.querySelector('[data-work-package-id="p3"]') !== null &&
            document.querySelector('[data-toast-text]') !== null,
        );
        // The fade this test drops is the one the page asked for, so the spy is
        // not standing beside a timer it never sees.
        expect(droppedFades).toHaveBeenCalledWith(expect.any(Function), INFO_TOAST_MS);
      } finally {
        droppedFades.mockRestore();
      }
      expect(localStorage.getItem('wbs.workPackage')).toBe('p3');
      expect(picker()).toHaveValue('Imported exact');
      openPicker();
      expect(document.getElementById('work-package-option-p3')).not.toBeNull();
      expect(document.querySelectorAll('[data-toasts]')).toHaveLength(1);
      expect(toastTexts()).toEqual([
        'Imported “Imported exact” with 40 work items. Added 1 tag (Needs review).',
      ]);
      // Proof: moving import reporting back into the keyed `WbsTable` made this
      // receive no toast after `choose` remounted the table. Observed 2026-09-14;
      // on 2026-09-29, with `toastApi` withheld from `WbsTable`, the p3 table
      // never showed the toast and the test timed out at its 30 s budget.
      // Proof: removing the catalogue reload left the picker value empty and no
      // `work-package-option-p3`, although the imported tree was mounted. Observed 2026-09-14;
      // again 2026-09-29 as `expect(element).toHaveValue(Imported exact)`.
    },
  );

  itDom('admits only one asynchronous file read and request at a time', async () => {
    const api = fakeWorkPackages(TWO);
    const importPlan = vi.fn(() => Promise.resolve(IMPORTED));
    api.importPlan = importPlan;
    const reads = vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(() => undefined);
    pageWith(api);
    await selectWorkPackage('p1');
    await screen.findByLabelText('Import JSON');

    await importFile();
    await importFile();

    expect(reads).toHaveBeenCalledTimes(1);
    expect(importPlan).not.toHaveBeenCalled();
    // Proof: replacing the synchronous admission ref with React state let both
    // change events enter `readPlanJson`; expected one read, received two.
    // Observed 2026-09-14.
  });

  itDom('does not start another read while the first request remains in flight', async () => {
    const api = fakeWorkPackages(TWO);
    const importedWorkPackage = await api.createWorkPackage('fixture-project', 'Imported exact');
    let finishImport: (summary: PlanImportSummary) => void = () => {
      throw new Error('the held import resolver was not installed');
    };
    const importPlan = vi.fn(
      () =>
        new Promise<PlanImportSummary>((resolve) => {
          finishImport = resolve;
        }),
    );
    api.importPlan = importPlan;
    const reads = vi.spyOn(FileReader.prototype, 'readAsText');
    pageWith(api);
    await selectWorkPackage('p1');
    await screen.findByLabelText('Import JSON');

    await importFile();
    await waitFor(() => {
      expect(importPlan).toHaveBeenCalledTimes(1);
    });
    await importFile();

    expect(reads).toHaveBeenCalledTimes(1);
    expect(importPlan).toHaveBeenCalledTimes(1);
    await act(async () => {
      finishImport({ ...IMPORTED, workPackageId: importedWorkPackage.id });
      await Promise.resolve();
    });
  });

  itDom(
    'does not navigate when an import completes after its work package was departed',
    async () => {
      const api = fakeWorkPackages(TWO);
      const importedWorkPackage = await api.createWorkPackage('fixture-project', 'Imported exact');
      let finishImport: (summary: PlanImportSummary) => void = () => {
        throw new Error('the held import resolver was not installed');
      };
      const importPlan = vi.fn(
        () =>
          new Promise<PlanImportSummary>((resolve) => {
            finishImport = resolve;
          }),
      );
      api.importPlan = importPlan;
      pageWith(api);
      await selectWorkPackage('p1');
      await screen.findByLabelText('Import JSON');
      await importFile();
      await waitFor(() => {
        expect(importPlan).toHaveBeenCalledTimes(1);
      });

      await selectWorkPackage('p2');
      await act(async () => {
        finishImport({ ...IMPORTED, workPackageId: importedWorkPackage.id });
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(toastTexts()).toEqual([
          'Imported “Imported exact” with 40 work items. Added 1 tag (Needs review).',
        ]);
      });
      expect(picker()).toHaveValue('Paint the fence');
      expect(localStorage.getItem('wbs.workPackage')).toBe('p2');
      // Proof: removing the attempt's source-work-package comparison navigated to
      // exact `p3` after the reader had selected `p2`. Observed 2026-09-14.
    },
  );

  itDom('ignores an import completion from a replaced API lifetime', async () => {
    const first = fakeWorkPackages(TWO);
    const replacement = fakeWorkPackages(TWO);
    let finishImport: (summary: PlanImportSummary) => void = () => {
      throw new Error('the held import resolver was not installed');
    };
    const importPlan = vi.fn(
      () =>
        new Promise<PlanImportSummary>((resolve) => {
          finishImport = resolve;
        }),
    );
    first.importPlan = importPlan;
    const view = pageWith(first);
    await selectWorkPackage('p1');
    await screen.findByLabelText('Import JSON');
    await importFile();
    await waitFor(() => {
      expect(importPlan).toHaveBeenCalledTimes(1);
    });

    view.rerender(
      <WorkPackagePageOverOwner api={replacement} savedPlanRoutes={fakeSavedPlanRoutes()} />,
    );
    await chooseFixtureProject();
    await act(async () => {
      finishImport(IMPORTED);
      await Promise.resolve();
    });

    expect(picker()).toHaveValue('Rewire the shed');
    expect(localStorage.getItem('wbs.workPackage')).toBe('p1');
    expect(toastTexts()).toEqual([]);
    expect(screen.getByLabelText('Import JSON')).not.toBeDisabled();
    // Proof: removing the epoch comparison let the departed API's completion
    // report and attempt to install its work package in the replacement lifetime.
    // Observed 2026-09-14.
  });

  itDom(
    'does not submit a file whose read finishes after the API lifetime is replaced',
    async () => {
      const first = fakeWorkPackages(TWO);
      const replacement = fakeWorkPackages(TWO);
      const importPlan = vi.fn(() => Promise.resolve(IMPORTED));
      first.importPlan = importPlan;
      let finishRead = (): void => {
        throw new Error('the held file reader was not installed');
      };
      vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function holdRead(
        this: FileReader,
      ) {
        Object.defineProperty(this, 'result', {
          configurable: true,
          value: JSON.stringify(IMPORTABLE_PLAN),
        });
        finishRead = () => {
          this.dispatchEvent(new ProgressEvent('load'));
        };
      });
      const view = pageWith(first);
      await selectWorkPackage('p1');
      await screen.findByLabelText('Import JSON');
      await importFile();

      view.rerender(
        <WorkPackagePageOverOwner api={replacement} savedPlanRoutes={fakeSavedPlanRoutes()} />,
      );
      await act(async () => {
        finishRead();
        await Promise.resolve();
      });

      expect(importPlan).not.toHaveBeenCalled();
      expect(toastTexts()).toEqual([]);
      // Proof: removing the post-read and pre-write lifetime checks submitted one
      // write through the departed API. Observed 2026-09-14.
    },
  );

  itDom('does not install a catalogue fetched by a replaced API lifetime', async () => {
    const first = fakeWorkPackages(TWO);
    const replacement = fakeWorkPackages(TWO);
    let finishCatalogue: (workPackages: WorkPackageListEntry[]) => void = () => {
      throw new Error('the held catalogue resolver was not installed');
    };
    const listWorkPackages = vi.fn(first.listWorkPackages.bind(first));
    listWorkPackages
      .mockImplementationOnce(first.listWorkPackages.bind(first))
      .mockImplementationOnce(
        () =>
          new Promise<WorkPackageListEntry[]>((resolve) => {
            finishCatalogue = resolve;
          }),
      );
    first.listWorkPackages = listWorkPackages;
    first.importPlan = () => Promise.resolve(IMPORTED);
    const view = pageWith(first);
    await selectWorkPackage('p1');
    await screen.findByLabelText('Import JSON');
    await importFile();
    await waitFor(() => {
      expect(listWorkPackages).toHaveBeenCalledTimes(2);
    });

    view.rerender(
      <WorkPackagePageOverOwner api={replacement} savedPlanRoutes={fakeSavedPlanRoutes()} />,
    );
    await act(async () => {
      finishCatalogue([
        ...TWO,
        {
          projectId: 'fixture-project',
          id: 'p3',
          name: 'Imported exact',
          restricted: false,
          abbreviation: 'PLAN',
          startDate: null,
          lastOpenedAt: null,
          createdByName: 'kat',
          createdAt: MADE_ON,
        },
      ]);
      await Promise.resolve();
    });

    expect(picker()).toHaveValue('Rewire the shed');
    openPicker();
    expect(document.getElementById('work-package-option-p3')).toBeNull();
    expect(localStorage.getItem('wbs.workPackage')).toBe('p1');
    expect(toastTexts()).toEqual([]);
    // Proof: installing the fetched catalogue before the post-fetch lifetime
    // check added exact `work-package-option-p3`. Observed 2026-09-14.
  });

  itDom('reports a malformed row with its exact schema path and detail', async () => {
    const api = fakeWorkPackages(TWO);
    const importPlan = vi.fn(() => Promise.resolve(IMPORTED));
    api.importPlan = importPlan;
    const malformed = {
      ...IMPORTABLE_PLAN,
      workItems: [
        {
          id: 'file-row-1',
          parentId: null,
          position: 10,
          name: 'Malformed exact',
          notes: '',
          frozenNumber: null,
          startNoEarlierThan: null,
          startNoEarlierThanReason: null,
          deadline: null,
          factStart: null,
          factEnd: null,
          readiness: null,
          hold: null,
          priority: 'high',
          serviceTeamId: null,
          serviceId: null,
          maxParallel: 1,
          teamIds: [],
          tagIds: [],
          serviceIds: [],
          typeIds: [],
          externalRefs: [],
          estimates: {},
          actuals: {},
          progress: {},
          measures: {},
          dependsOn: [],
          assignees: {},
        },
      ],
    };
    pageWith(api);
    await selectWorkPackage('p1');
    await screen.findByLabelText('Import JSON');

    await importFile(malformed);

    await waitFor(() => {
      expect(toastTexts()).toEqual([
        'This plan export has a value the app cannot read: workItems[0].priority must be a number or null (was a string).',
      ]);
    });
    expect(importPlan).not.toHaveBeenCalled();
    expect(picker()).toHaveValue('Rewire the shed');
    // Proof: collapsing Standard Schema issues to the preflight failure code
    // produced `Plan JSON import failed (invalid_request).` and hid the exact
    // `workItems[0].priority` path/detail. Observed 2026-09-14.
  });

  itDom(
    'keeps the prior selection when the refreshed catalogue omits the imported id',
    async () => {
      const api = fakeWorkPackages(TWO);
      api.importPlan = () => Promise.resolve(IMPORTED);
      pageWith(api);
      await selectWorkPackage('p1');
      await screen.findByLabelText('Import JSON');

      await importFile();

      await waitFor(() => {
        expect(toastTexts()).toEqual([
          'The plan was imported, but the new work package is not in your list yet. Reload to see it.',
        ]);
      });
      expect(picker()).toHaveValue('Rewire the shed');
      expect(localStorage.getItem('wbs.workPackage')).toBe('p1');
    },
  );

  itDom('treats picker cancellation as no import attempt', async () => {
    const api = fakeWorkPackages(TWO);
    const importPlan = vi.fn(() => Promise.resolve(IMPORTED));
    api.importPlan = importPlan;
    pageWith(api);
    await selectWorkPackage('p1');
    const input = await screen.findByLabelText('Import JSON');

    fireEvent.change(input, { target: { files: [] } });

    expect(importPlan).not.toHaveBeenCalled();
    expect(toastTexts()).toEqual([]);
    expect(picker()).toHaveValue('Rewire the shed');
  });

  itDom('reports invalid JSON without submitting or changing work package', async () => {
    const api = fakeWorkPackages(TWO);
    const importPlan = vi.fn(() => Promise.resolve(IMPORTED));
    api.importPlan = importPlan;
    pageWith(api);
    await selectWorkPackage('p1');
    await screen.findByLabelText('Import JSON');

    await importFile('{"broken"');

    await waitFor(() => {
      expect(toastTexts()).toEqual(['This file is not JSON.']);
    });
    expect(importPlan).not.toHaveBeenCalled();
    expect(picker()).toHaveValue('Rewire the shed');
  });

  itDom('says JSON that is not a plan export is not one', async () => {
    const api = fakeWorkPackages(TWO);
    const importPlan = vi.fn(() => Promise.resolve(IMPORTED));
    api.importPlan = importPlan;
    pageWith(api);
    await selectWorkPackage('p1');
    await screen.findByLabelText('Import JSON');

    await importFile([1, 2, 3]);

    await waitFor(() => {
      expect(toastTexts()).toEqual(['This JSON is not a plan export.']);
    });
    expect(importPlan).not.toHaveBeenCalled();
  });

  itDom('reports an asynchronous file read failure without submitting', async () => {
    const api = fakeWorkPackages(TWO);
    const importPlan = vi.fn(() => Promise.resolve(IMPORTED));
    api.importPlan = importPlan;
    vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function refuseRead(
      this: FileReader,
    ) {
      this.dispatchEvent(new ProgressEvent('error'));
    });
    pageWith(api);
    await selectWorkPackage('p1');
    await screen.findByLabelText('Import JSON');

    await importFile();

    await waitFor(() => {
      expect(toastTexts()).toEqual(['The file could not be read. Choose it again.']);
    });
    expect(importPlan).not.toHaveBeenCalled();
  });

  itDom(
    'submits the mounted v11 archival projection and keeps selection on inactive external import',
    async () => {
      const api = fakeWorkPackages(TWO);
      let submitted: PlanDocumentRequest | undefined;
      api.importPlan = (_projectId, request) => {
        submitted = request;
        return Promise.reject(
          new PlanImportRefusalError({ error: 'external_dependencies_inactive', detail: null }),
        );
      };
      pageWith(api);
      await selectWorkPackage('p1');
      await screen.findByLabelText('Import JSON');
      await importFile(mountedTransfer);
      await waitFor(() => {
        expect(toastTexts()).toEqual([
          'This server does not accept dependencies between work packages yet, so nothing was imported.',
        ]);
      });
      expect(submitted?.typedDependencies).toEqual(mountedTransfer.typedDependencies);
      expect(submitted).not.toHaveProperty('connected');
      expect(submitted).not.toHaveProperty('connectedDependencies');
      expect(picker()).toHaveValue('Rewire the shed');
      expect(localStorage.getItem('wbs.workPackage')).toBe('p1');
      expect(document.querySelector('[data-work-package-id="p3"]')).toBeNull();
    },
  );

  itDom(
    'keeps the selected work package when the request returns a structured refusal',
    async () => {
      const api = fakeWorkPackages(TWO);
      const importPlan = vi.fn(() =>
        Promise.reject(
          new PlanImportRefusalError({
            error: 'unknown_ref',
            path: 'workItems[12].dependsOn[0]',
            detail: 'missing work item file-row-9',
          }),
        ),
      );
      api.importPlan = importPlan;
      pageWith(api);
      await selectWorkPackage('p1');
      await screen.findByLabelText('Import JSON');

      await importFile();

      await waitFor(() => {
        expect(toastTexts()).toEqual([
          'This plan export refers to something it does not contain (workItems[12].dependsOn[0]: missing work item file-row-9).',
        ]);
      });
      expect(picker()).toHaveValue('Rewire the shed');
      expect(localStorage.getItem('wbs.workPackage')).toBe('p1');
      // Proof: routing request rejection through `openWorkPackage` selected another
      // id; this exact prior selection assertion failed. Observed 2026-09-14.
    },
  );

  itDom('takes a stale refusal off when a later import succeeds', async () => {
    const api = fakeWorkPackages(TWO);
    api.importPlan = async () => {
      const workPackage = await api.createWorkPackage('fixture-project', 'Imported exact');
      return { ...IMPORTED, workPackageId: workPackage.id };
    };
    pageWith(api);
    await selectWorkPackage('p1');
    await screen.findByLabelText('Import JSON');

    await importFile('{"broken"');
    await waitFor(() => {
      expect(toastTexts()).toEqual(['This file is not JSON.']);
    });
    await importFile();

    await untilDocumentShows(() =>
      toastTexts().some((text) => text.startsWith('Imported “Imported exact”')),
    );
    expect(toastTexts()).toEqual([
      'Imported “Imported exact” with 40 work items. Added 1 tag (Needs review).',
    ]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  itDom('dates an import whose name a work package in the list already has', async () => {
    const api = fakeWorkPackages(TWO);
    const sent: string[] = [];
    api.importPlan = async (projectId, document) => {
      sent.push(document.settings.name);
      const workPackage = await api.createWorkPackage(projectId, document.settings.name);
      return { ...IMPORTED, workPackageId: workPackage.id };
    };
    pageWith(api);
    await selectWorkPackage('p1');
    await screen.findByLabelText('Import JSON');
    const datedName = distinctImportName('Rewire the shed', ['Rewire the shed'], new Date());
    expect(datedName).toMatch(/^Rewire the shed \(imported \d{1,2} [A-Z][a-z]{2}\)$/);

    await importFile({
      ...IMPORTABLE_PLAN,
      settings: { ...IMPORTABLE_PLAN.settings, name: 'Rewire the shed' },
    });

    await untilDocumentShows(() => toastTexts().some((text) => text.startsWith('Imported')));
    expect(sent).toEqual([datedName]);
    expect(toastTexts()).toEqual([
      `Imported “${datedName}” with 40 work items. Added 1 tag (Needs review).`,
    ]);
    // Proof: sending the file's name unchanged made this receive
    // `["Rewire the shed"]`, a second work package the list could not tell apart.
    // Observed 2026-10-15.
  });

  itDom('clears the file control so the same file can complete twice', async () => {
    const api = fakeWorkPackages(TWO);
    const importPlan = vi.fn(() => Promise.reject(new Error('server exact')));
    api.importPlan = importPlan;
    pageWith(api);
    await selectWorkPackage('p1');
    await chooseFixtureProject();
    const sameFile = new File([JSON.stringify(IMPORTABLE_PLAN)], 'plan.json', {
      type: 'application/json',
    });
    const input = await screen.findByLabelText<HTMLInputElement>('Import JSON');
    const chooseSameFile = () => {
      if (input.value === 'C:\\fakepath\\plan.json') return;
      Object.defineProperty(input, 'value', {
        configurable: true,
        writable: true,
        value: 'C:\\fakepath\\plan.json',
      });
      fireEvent.change(input, { target: { files: [sameFile] } });
    };

    chooseSameFile();
    await waitFor(() => {
      expect(importPlan).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(input.value).toBe('');
    });
    chooseSameFile();

    await waitFor(() => {
      expect(importPlan).toHaveBeenCalledTimes(2);
    });
    // Proof: removing the settlement reset left the control at the same fake
    // path and this browser-model dispatched only one completed import.
    // Observed 2026-09-14.
  });
});

/**
 * Where the work package controls are, and what they are called there.
 *
 * `H header-fits-a-row` moved every one of them into a `banner` and turned two
 * of them into icon buttons. Nothing in the repository asserted that the page
 * had a landmark, or that the two buttons kept their names — `Rename` and
 * `New workPackage` were found by name in eleven places and named in none of them,
 * which is a contract every test depends on and no test states. These are the
 * assertions, written by the change that moved them, per `F
 * shadcn-foundation`'s rule.
 */
describe('the selected runtime Plan and Board views', () => {
  beforeEach(() => {
    forgetRefusedDrafts(() => true);
  });
  afterEach(() => {
    forgetRefusedDrafts(() => true);
  });
  itDom(
    'keeps one Plan table, runtime and work package feed across repeated view switches',
    async () => {
      const sockets: SocketHandlers[] = [];
      const streamDeps: WorkPackageStreamDeps = {
        openSocket: (handlers) => {
          sockets.push(handlers);
          return { send: () => undefined, close: () => undefined };
        },
        schedule: () => 0,
        cancel: () => undefined,
        random: () => 0,
      };
      const { owner } = await pageWithEditableBoardRow(streamDeps);
      const first = owner.snapshot();
      if (first.status !== 'live') throw new Error('missing selected runtime');
      const table = document.querySelector('table[data-grid]');
      expect(table).not.toBeNull();
      expect(sockets).toHaveLength(1);
      const plan = screen.getByRole('button', { name: 'Plan' });
      const board = screen.getByRole('button', { name: 'Board' });
      expect(plan.getAttribute('aria-pressed')).toBe('true');
      expect(board.getAttribute('aria-pressed')).toBe('false');
      for (let turn = 0; turn < 3; turn += 1) {
        fireEvent.click(screen.getByRole('button', { name: 'Board' }));
        expect(screen.getByRole('button', { name: 'Board' }).getAttribute('aria-pressed')).toBe(
          'true',
        );
        expect(table?.closest('[hidden]')).not.toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
        expect(screen.getByRole('button', { name: 'Plan' }).getAttribute('aria-pressed')).toBe(
          'true',
        );
        expect(document.querySelector('table[data-grid]')).toBe(table);
      }
      const last = owner.snapshot();
      if (last.status !== 'live') throw new Error('selected runtime withdrew on a view switch');
      expect(last.services).toBe(first.services);
      expect(sockets).toHaveLength(1);
    },
  );

  itDom('takes the desktop saved-plan shelf out of the header on Board', async () => {
    await pageWithEditableBoardRow();
    openWorkPackageActions();
    expect(await screen.findByText('Saved plans', { selector: 'summary' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    expect(screen.queryByText('Saved plans', { selector: 'summary' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    openWorkPackageActions();
    expect(await screen.findByText('Saved plans', { selector: 'summary' })).toBeDefined();
  });

  itDom('closes an open Plan keyboard dialog before Board is active', async () => {
    await pageWithEditableBoardRow();
    fireEvent.keyDown(window, { key: '?' });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  itDom('closes the phone Plan actions portal while Board is active', async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    try {
      await pageWithEditableBoardRow();
      fireEvent.click(screen.getByRole('button', { name: 'Plan actions' }));
      expect(document.querySelector('[data-modal-surface]')).not.toBeNull();
      const selectors = document.querySelectorAll<HTMLButtonElement>(
        '[data-work-package-view-selector]',
      );
      expect(selectors).toHaveLength(2);
      const plan = selectors.item(0);
      const board = selectors.item(1);
      // Radix marks the page aria-hidden while its modal is open. This forces
      // the page-level switch boundary that a runtime/view transition can take.
      fireEvent.click(board);
      expect(document.querySelector('[data-modal-surface]')).toBeNull();
      fireEvent.click(plan);
      expect(document.querySelector('[data-modal-surface]')).toBeNull();
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true });
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });
    }
  });

  itDom('keeps the hidden Plan window shortcuts inactive on Board', async () => {
    const { writes, undos, redos } = await pageWithEditableBoardRow();
    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: '?' });
    expect(undos).toEqual([]);
    expect(redos).toEqual([]);
    expect(writes).toEqual([]);
    expect(screen.queryByRole('dialog', { name: /keyboard/i })).toBeNull();
  });

  itDom('sends no Plan commands from Board pointer, keyboard, drag or view changes', async () => {
    const { writes, undos, redos, statuses, estimates } = await pageWithEditableBoardRow();
    const boardButton = screen.getByRole('button', { name: 'Board' });
    fireEvent.pointerDown(boardButton);
    fireEvent.click(boardButton);
    const board = screen.getByRole('region', { name: 'Step board' });
    fireEvent.pointerDown(board);
    fireEvent.click(board);
    fireEvent.keyDown(board, { key: 'Enter' });
    fireEvent.dragStart(board);
    fireEvent.drop(board);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    expect({ writes, undos, redos, statuses, estimates }).toEqual({
      writes: [],
      undos: [],
      redos: [],
      statuses: [],
      estimates: [],
    });
  });

  itDom(
    'suspends a dirty Name before pointer focus reaches Board, without submitting',
    async () => {
      const { field, writes } = await pageWithEditableBoardRow();
      act(() => {
        field.focus();
      });
      expect(document.activeElement).toBe(field);
      fireEvent.change(field, { target: { value: 'Draft build' } });

      const board = screen.getByRole('button', { name: 'Board' });
      fireEvent.pointerDown(board);
      act(() => {
        board.focus();
      });
      expect(document.activeElement).toBe(board);
      expect(writes).toEqual([]);
      expect(field).toHaveProperty('value', 'Draft build');

      fireEvent.click(board);
      expect(screen.getByRole('button', { name: 'Board' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
      expect(writes).toEqual([]);
    },
  );

  itDom('keeps typing after a cancelled Board pointer and commits the newest draft', async () => {
    const { field, writes, model, owner } = await pageWithEditableBoardRow();
    act(() => {
      field.focus();
    });
    fireEvent.change(field, { target: { value: 'Draft one' } });
    const board = screen.getByRole('button', { name: 'Board' });
    fireEvent.pointerDown(board);
    fireEvent.pointerCancel(board);
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: 'Draft two' } });

    model.rows[0].name = 'Peer change';
    const opened = owner.snapshot();
    if (opened.status !== 'live') throw new Error('missing selected runtime');
    await act(async () => {
      await opened.services.reread(['tree']);
    });
    expect(field.value).toBe('Draft two');
    expect(writes).toEqual([]);
    act(() => {
      field.blur();
    });
    expect(writes).toEqual([['w1', { name: 'Draft two' }]]);
  });

  itDom('suspends on keyboard focus of Board without activating it', async () => {
    const { field, writes } = await pageWithEditableBoardRow();
    act(() => {
      field.focus();
    });
    fireEvent.change(field, { target: { value: 'Keyboard draft' } });

    const board = screen.getByRole('button', { name: 'Board' });
    const blurTargets: EventTarget[] = [];
    field.addEventListener('blur', (event) => {
      if (event.relatedTarget !== null) blurTargets.push(event.relatedTarget);
    });
    act(() => {
      board.focus();
    });
    expect(document.activeElement).toBe(board);
    expect(blurTargets).toEqual([board]);
    expect(board.getAttribute('aria-pressed')).toBe('false');
    expect(writes).toEqual([]);
    expect(field).toHaveProperty('value', 'Keyboard draft');
  });

  itDom(
    'keeps an unfocused draft through Board and later peer trees until deliberate leave',
    async () => {
      const { field, writes, model, owner } = await pageWithEditableBoardRow();
      act(() => {
        field.focus();
      });
      fireEvent.change(field, { target: { value: 'Draft build' } });
      const board = screen.getByRole('button', { name: 'Board' });
      fireEvent.pointerDown(board);
      act(() => {
        board.focus();
      });
      fireEvent.click(board);
      expect(writes).toEqual([]);

      const row = model.rows[0];
      row.name = 'Peer one';
      const opened = owner.snapshot();
      if (opened.status !== 'live') throw new Error('missing selected runtime');
      await act(async () => {
        await opened.services.reread(['tree']);
      });
      expect(field).toHaveProperty('value', 'Draft build');
      expect(
        within(screen.getByRole('region', { name: 'Step board' })).getAllByText('Peer one').length,
      ).toBeGreaterThan(0);

      fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
      expect(field).toHaveProperty('value', 'Draft build');
      row.name = 'Peer two';
      await act(async () => {
        await opened.services.reread(['tree']);
      });
      expect(field).toHaveProperty('value', 'Draft build');
      expect(writes).toEqual([]);

      act(() => {
        field.focus();
      });
      act(() => {
        field.blur();
      });
      expect(writes).toEqual([['w1', { name: 'Draft build' }]]);
    },
  );

  itDom('restores a suspended draft after a new step rebuilds the field face', async () => {
    const { field, writes, model, owner } = await pageWithEditableBoardRow();
    act(() => {
      field.focus();
    });
    fireEvent.change(field, { target: { value: 'Draft through step change' } });
    const board = screen.getByRole('button', { name: 'Board' });
    fireEvent.pointerDown(board);
    act(() => {
      board.focus();
    });
    fireEvent.click(board);

    model.stepRows.push({
      id: 'step-review',
      name: 'Review',
      estimateUnit: 'workdays',
      allowancePercent: 0,
    });
    const opened = owner.snapshot();
    if (opened.status !== 'live') throw new Error('missing selected runtime');
    await act(async () => {
      await opened.services.reread(['tree', 'steps']);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    const remounted = screen.getByLabelText<HTMLInputElement>('Name of 010');
    expect(remounted).not.toBe(field);
    expect(remounted.value).toBe('Draft through step change');
    expect(writes).toEqual([]);
  });

  itDom('restores a suspended draft across the responsive Plan renderer', async () => {
    const { field, writes } = await pageWithEditableBoardRow();
    const originalWidth = window.innerWidth;
    act(() => {
      field.focus();
    });
    fireEvent.change(field, { target: { value: 'Draft through rotation' } });
    const board = screen.getByRole('button', { name: 'Board' });
    fireEvent.pointerDown(board);
    act(() => {
      board.focus();
    });
    fireEvent.click(board);
    try {
      Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });
      fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
      const remounted = screen.getByLabelText<HTMLInputElement>('Name of 010');
      expect(remounted).not.toBe(field);
      expect(remounted.value).toBe('Draft through rotation');
      expect(writes).toEqual([]);
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true });
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });
    }
  });

  itDom('preserves notes with the name and suspends a separate priority edit', async () => {
    const { field, writes } = await pageWithEditableBoardRow();
    act(() => {
      field.focus();
    });
    fireEvent.change(field, { target: { value: 'Build\nDraft note' } });
    const board = screen.getByRole('button', { name: 'Board' });
    fireEvent.pointerDown(board);
    act(() => {
      board.focus();
    });
    fireEvent.click(board);
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    expect(field.value).toBe('Build\nDraft note');
    expect(writes).toEqual([]);
    act(() => {
      field.focus();
    });
    act(() => {
      field.blur();
    });
    expect(writes).toEqual([['w1', { notes: 'Draft note' }]]);

    const priority = screen.getByLabelText<HTMLInputElement>('Priority for 010');
    act(() => {
      priority.focus();
    });
    fireEvent.change(priority, { target: { value: '3' } });
    fireEvent.pointerDown(board);
    act(() => {
      board.focus();
    });
    fireEvent.click(board);
    expect(priority.value).toBe('3');
    expect(writes).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    act(() => {
      priority.focus();
    });
    act(() => {
      priority.blur();
    });
    expect(writes).toHaveLength(2);
  });

  itDom('discards a suspended draft when its selected runtime is withdrawn', async () => {
    const { field, writes } = await pageWithEditableBoardRow();
    act(() => {
      field.focus();
    });
    fireEvent.change(field, { target: { value: 'Only p2 draft' } });
    const board = screen.getByRole('button', { name: 'Board' });
    fireEvent.pointerDown(board);
    act(() => {
      board.focus();
    });
    fireEvent.click(board);

    await selectWorkPackage('p1');
    const firstPlan = await screen.findByRole('button', { name: 'Plan' });
    expect(firstPlan.getAttribute('aria-pressed')).toBe('true');
    await selectWorkPackage('p2');
    const nextField = await screen.findByLabelText<HTMLInputElement>('Name of 010');
    expect(nextField).not.toBe(field);
    expect(nextField.value).toBe('Build');
    expect(writes).toEqual([]);
  });

  itDom('prunes a held field when its row is deleted from the delivered tree', async () => {
    const { field, writes, model, owner } = await pageWithEditableBoardRow();
    const original = model.rows[0];
    const restored = { ...original, name: 'Restored server' };
    act(() => {
      field.focus();
    });
    fireEvent.change(field, { target: { value: 'Deleted draft' } });
    const board = screen.getByRole('button', { name: 'Board' });
    fireEvent.pointerDown(board);
    act(() => {
      board.focus();
    });
    fireEvent.click(board);

    await model.removeWorkItem('w1');
    const opened = owner.snapshot();
    if (opened.status !== 'live') throw new Error('missing selected runtime');
    await act(async () => {
      await opened.services.reread(['tree']);
    });
    // Model an undo restoring this identity after the authoritative deletion.
    model.rows.push(restored);
    await act(async () => {
      await opened.services.reread(['tree']);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    expect(screen.queryByDisplayValue('Deleted draft')).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Name of 010').value).toBe('Restored server');
    expect(writes).toEqual([]);
  });

  itDom('drops a held estimate when its step disappears from the delivered tree', async () => {
    const { model, owner, writes, estimates } = await pageWithEditableBoardRow();
    const estimate = screen.getByLabelText<HTMLInputElement>('Dev estimate for 010');
    act(() => {
      estimate.focus();
    });
    fireEvent.change(estimate, { target: { value: '9' } });
    const board = screen.getByRole('button', { name: 'Board' });
    fireEvent.pointerDown(board);
    act(() => {
      board.focus();
    });
    fireEvent.click(board);
    const removed = model.stepRows.findIndex((step) => step.id === 'step-dev');
    if (removed < 0) throw Error('Missing delivered Dev step');
    model.stepRows.splice(removed, 1);
    const opened = owner.snapshot();
    if (opened.status !== 'live') throw new Error('missing selected runtime');
    await act(async () => {
      await opened.services.reread(['tree', 'steps']);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    expect(screen.queryByLabelText('Dev estimate for 010')).toBeNull();
    expect(writes).toEqual([]);
    expect(estimates).toEqual([]);
  });

  itDom('keeps an issued edit in flight across Board and shows its acknowledged tree', async () => {
    const { field, writes, api, owner } = await pageWithEditableBoardRow();
    const perform = api.patchWorkItem.bind(api);
    const asked: Parameters<WorkPackageApi['patchWorkItem']>[] = [];
    const held: { answer?: () => Promise<void> } = {};
    api.patchWorkItem = (...args) =>
      new Promise<void>((resolve, reject) => {
        asked.push(args);
        held.answer = () => perform(...args).then(resolve, reject);
      });
    act(() => {
      field.focus();
    });
    fireEvent.change(field, { target: { value: 'Issued before Board' } });
    act(() => {
      field.blur();
    });
    expect(asked).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    const settle = held.answer;
    if (settle === undefined) throw new Error('no edit was issued');
    await act(async () => {
      await settle();
    });
    const opened = owner.snapshot();
    if (opened.status !== 'live') throw new Error('missing selected runtime');
    await act(async () => {
      await opened.services.reread(['tree']);
    });
    expect(
      within(screen.getByRole('region', { name: 'Step board' })).getAllByText('Issued before Board')
        .length,
    ).toBeGreaterThan(0);
    expect(writes).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    expect(field.value).toBe('Issued before Board');
    expect(asked).toHaveLength(1);
  });

  itDom('keeps an issued refusal as the existing held draft after Board', async () => {
    const { field, api } = await pageWithEditableBoardRow();
    const asked: Parameters<WorkPackageApi['patchWorkItem']>[] = [];
    const held: { refuse?: (error: Error) => void } = {};
    api.patchWorkItem = (...args) =>
      new Promise<void>((_resolve, reject) => {
        asked.push(args);
        held.refuse = reject;
      });
    act(() => {
      field.focus();
    });
    fireEvent.change(field, { target: { value: 'Refused before Board' } });
    act(() => {
      field.blur();
    });
    expect(asked).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    const rejectEdit = held.refuse;
    if (rejectEdit === undefined) throw new Error('no edit was issued');
    await act(async () => {
      rejectEdit(new Error('forbidden'));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    expect(field.value).toBe('Refused before Board');
    expect(asked).toHaveLength(1);
  });

  itDom('never draws an old work package tree on the next work package Board', async () => {
    const oldPlan = fakeWorkPackageApi();
    const newPlan = fakeWorkPackageApi();
    await oldPlan.createWorkItem('p1', { parentId: null, afterId: null, name: 'Old only' });
    await newPlan.createWorkItem('p2', { parentId: null, afterId: null, name: 'New only' });
    const api = fakeWorkPackages(TWO);
    let oldReads = 0;
    const held: { answerOld?: (tree: Awaited<ReturnType<WorkPackageApi['tree']>>) => void } = {};
    api.tree = (workPackageId) => {
      if (workPackageId === 'p2') return newPlan.tree(workPackageId);
      oldReads += 1;
      if (oldReads === 1) return oldPlan.tree(workPackageId);
      return new Promise((answer) => {
        held.answerOld = answer;
      });
    };
    api.steps = (workPackageId) =>
      workPackageId === 'p2' ? newPlan.steps(workPackageId) : oldPlan.steps(workPackageId);
    const owner = createWorkPackageOwner();
    render(<WorkPackagePage {...pageWiring(owner, api, undefined, fakeSavedPlanRoutes())} />);
    await selectWorkPackage('p1');
    expect(await screen.findByLabelText('Name of 010')).toHaveProperty('value', 'Old only');
    const opened = owner.snapshot();
    if (opened.status !== 'live') throw new Error('missing first runtime');
    const pending = opened.services.reread(['tree']);
    await waitFor(() => {
      expect(held.answerOld).toBeDefined();
    });

    await selectWorkPackage('p2');
    await screen.findByLabelText('Name of 010');
    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    const board = screen.getByRole('region', { name: 'Step board' });
    expect(within(board).queryAllByText('New only').length).toBeGreaterThan(0);
    const release = held.answerOld;
    if (release === undefined) throw new Error('old read was not held');
    await act(async () => {
      release(await oldPlan.tree('p1'));
      await pending;
    });
    expect(within(board).queryByText('Old only')).toBeNull();
    expect(within(board).queryAllByText('New only').length).toBeGreaterThan(0);
  });
});

describe('claiming from the page the router draws (wbs-claim-display 11.2)', () => {
  itDom('offers Claim for the person bound to the signed-in account', async () => {
    // Proof: `WorkPackagePage` not handing `viewerAccountId` to the table made this
    // fail on `Unable to find an accessible element with the role "menuitem"
    // and name "Claim"`; watched 2026-10-27.
    const model = fakeWorkPackageApi();
    await model.createWorkItem('p2', { parentId: null, afterId: null, name: 'Build' });
    const dany = await model.addPerson('dany', []);
    model.bindAccount(dany.id, VIEWER_ACCOUNT_ID);
    const api = fakeWorkPackages(TWO);
    api.tree = (workPackageId) => model.tree(workPackageId);
    api.steps = (workPackageId) => model.steps(workPackageId);
    api.listPeople = () => model.listPeople();
    api.claimWorkItem = (workItemId, personId) => model.claimWorkItem(workItemId, personId);
    api.readClaims = (workPackageId) => model.readClaims(workPackageId);
    const owner = createWorkPackageOwner();
    render(<WorkPackagePage {...pageWiring(owner, api, undefined, fakeSavedPlanRoutes())} />);
    await selectWorkPackage('p2');

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for 010' }));
    const claim = screen.getByRole('menuitem', { name: 'Claim' });
    expect(claim.getAttribute('data-fact')).toBeNull();
    fireEvent.click(claim);

    await waitFor(() => {
      expect(model.claimCalls).toEqual([`claim:${model.rows[0]?.id ?? ''}:${dany.id}`]);
    });
  });
});

describe('the header bar', () => {
  itDom('puts the work package controls in a banner', async () => {
    pageWith(fakeWorkPackages(TWO));
    await selectWorkPackage('p2');

    const bar = screen.getByRole('banner');
    expect(bar.contains(picker())).toBe(true);
    openWorkPackageActions();
    expect(bar.contains(screen.getByRole('button', { name: 'Rename work package' }))).toBe(true);
    openWorkPackageActions();
    expect(
      bar.contains(
        within(screen.getByRole('banner')).getByRole('button', { name: 'Create new work package' }),
      ),
    ).toBe(true);
  });

  itDom('gives the header the slots the app fills, in the bar itself', async () => {
    render(
      <WorkPackagePageOverOwner
        api={fakeWorkPackages(TWO)}
        presence={() => <p>who is here</p>}
        account={<button type="button">the account</button>}
      />,
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Work package')).toBeDefined();
    });
    // No roster off a work package (F-018): the slot is filled once one is chosen.
    expect(screen.queryByText('who is here')).toBeNull();
    await selectWorkPackage('p2');

    const bar = screen.getByRole('banner');
    expect(bar.contains(screen.getByText('who is here'))).toBe(true);
    expect(bar.contains(screen.getByRole('button', { name: 'the account' }))).toBe(true);
  });

  /**
   * The navigation reaches this page as a slot too, and lands in the bar.
   *
   * The mark on the page that is showing is `app-router.test.tsx`'s, because
   * `aria-current` is the router's answer and there is no router here. What
   * this asserts is the other half of the contract task 6.1 pins: the work package
   * route renders its **own** header, and the shared navigation is on it beside
   * the work package controls rather than hoisted into a root route above them.
   */
  itDom('carries the navigation beside the work package controls', async () => {
    render(
      <WorkPackagePageOverOwner
        api={fakeWorkPackages(TWO)}
        nav={<nav aria-label="Pages">the two pages</nav>}
      />,
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Work package')).toBeDefined();
    });

    const bar = screen.getByRole('banner');
    expect(bar.contains(screen.getByRole('navigation', { name: 'Pages' }))).toBe(true);
    expect(bar.contains(picker())).toBe(true);
  });

  itDom('hands the presence slot the roster, and an empty one before any socket', async () => {
    // The roster is a work package's (F4): gw-01 scopes it by the work package the socket
    // subscribed to. Until 2026-09-02 the slot was handed the **selection** and
    // the panel opened its own socket per work package; the panel is presentational
    // now and this page owns the roster, because the stream that carries it is
    // the table's and this page renders both halves of the screen.
    //
    // Proof: `presence?.(roster)` in `work-package-page.tsx` put back to passing
    // `presence` straight through as a node. This test failed on
    // `expect(asked[0]).toEqual({ users: [], connected: false })` — `expected
    // undefined to deeply equal …`, the slot never called at all — and `gives
    // the header the slots the app fills` failed beside it on `Unable to find
    // an element with the text: who is here`, because a function React is
    // handed as a child renders nothing. Watched 2026-08-09, and again over the
    // roster 2026-09-02.
    const asked: { users: readonly string[]; connected: boolean }[] = [];
    render(
      <WorkPackagePageOverOwner
        api={fakeWorkPackages(TWO)}
        presence={(roster) => {
          asked.push(roster);
          return (
            <p>who is here: {roster.users.length === 0 ? 'nobody' : roster.users.join(', ')}</p>
          );
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Work package')).toBeDefined();
    });
    // Off a work package the slot is not asked at all (UI review F-018): there is no roster to
    // be in, and the panel's Offline would describe a connection that never existed.
    // Proof: on 2026-10-13, with the slot filled whatever the selection, this failed on
    // `expected [ …(3) ] to deeply equal []`.
    expect(asked).toEqual([]);

    await selectWorkPackage('p2');

    // Nothing has subscribed yet, and the honest roster for that is empty and
    // disconnected rather than a stale list under a new work package's name.
    expect(asked[0]).toEqual({ users: [], connected: false });
    expect(asked.at(-1)?.users).toEqual([]);
  });

  itDom(
    'hands the presence slot who the work package’s stream says is here, and its connection',
    async () => {
      let opened: SocketHandlers | null = null;
      const streamDeps: WorkPackageStreamDeps = {
        openSocket: (handlers) => {
          opened = handlers;
          return { send: () => undefined, close: () => undefined };
        },
        schedule: () => 0,
        cancel: () => undefined,
        random: () => 0,
      };
      const asked: { users: readonly string[]; connected: boolean }[] = [];
      render(
        <WorkPackagePageOverOwner
          api={fakeWorkPackages(TWO)}
          streamDeps={streamDeps}
          presence={(roster) => {
            asked.push(roster);
            return null;
          }}
        />,
      );
      await selectWorkPackage('p2');
      await waitFor(() => {
        expect(opened).not.toBeNull();
      });
      const socket = (): SocketHandlers => {
        if (opened === null) throw new Error('the page never opened a socket');
        return opened;
      };

      act(() => {
        socket().onOpen();
        socket().onMessage(JSON.stringify({ type: 'presence', users: ['kat', 'lee'] }));
      });
      expect(asked.at(-1)).toEqual({ users: ['kat', 'lee'], connected: false });

      act(() => {
        socket().onMessage(
          JSON.stringify({ type: 'resume_ack', replayed: { 'work-package:p2': 0 } }),
        );
      });
      expect(asked.at(-1)).toEqual({ users: ['kat', 'lee'], connected: true });

      act(() => {
        socket().onClose();
      });
      expect(asked.at(-1)).toEqual({ users: ['kat', 'lee'], connected: false });
    },
  );

  itDom(
    'hands the presence slot nobody in the next work package until its own stream says',
    async () => {
      const sockets: SocketHandlers[] = [];
      const streamDeps: WorkPackageStreamDeps = {
        openSocket: (handlers) => {
          sockets.push(handlers);
          return { send: () => undefined, close: () => undefined };
        },
        schedule: () => 0,
        cancel: () => undefined,
        random: () => 0,
      };
      const asked: { users: readonly string[]; connected: boolean }[] = [];
      render(
        <WorkPackagePageOverOwner
          api={fakeWorkPackages(TWO)}
          streamDeps={streamDeps}
          presence={(roster) => {
            asked.push(roster);
            return null;
          }}
        />,
      );
      await selectWorkPackage('p1');
      await waitFor(() => {
        expect(sockets).toHaveLength(1);
      });
      const first = sockets.at(0);
      if (first === undefined) throw new Error('p1 opened no socket');
      act(() => {
        first.onOpen();
        first.onMessage(JSON.stringify({ type: 'presence', users: ['kat', 'lee'] }));
        first.onMessage(JSON.stringify({ type: 'resume_ack', replayed: { 'work-package:p1': 0 } }));
      });
      expect(asked.at(-1)).toEqual({ users: ['kat', 'lee'], connected: true });
      const beforeSwitch = asked.length;

      await selectWorkPackage('p2');
      await waitFor(() => {
        expect(sockets).toHaveLength(2);
      });

      // Only the render that moves the selection may still show p1's roster: from
      // the withdrawal on, the header is handed nobody until p2's stream speaks.
      const afterSwitch = asked.slice(beforeSwitch);
      const reset = afterSwitch.findIndex(
        (roster) => roster.users.length === 0 && !roster.connected,
      );
      expect(reset).toBeGreaterThanOrEqual(0);
      expect(afterSwitch.slice(reset).filter((roster) => roster.users.length > 0)).toEqual([]);
      expect(asked.at(-1)).toEqual({ users: [], connected: false });
    },
  );

  itDom('closes the selected work package’s stream once the page goes', async () => {
    let opened = 0;
    let closed = 0;
    const streamDeps: WorkPackageStreamDeps = {
      openSocket: () => {
        opened += 1;
        return {
          send: () => undefined,
          close: () => {
            closed += 1;
          },
        };
      },
      schedule: () => 0,
      cancel: () => undefined,
      random: () => 0,
    };
    const view = render(
      <WorkPackagePageOverOwner api={fakeWorkPackages(TWO)} streamDeps={streamDeps} />,
    );
    await selectWorkPackage('p2');
    await waitFor(() => {
      expect(opened).toBe(1);
    });

    view.unmount();

    await waitFor(() => {
      expect(closed).toBe(1);
    });
  });

  itDom(
    'shows the sanitized report when a work package will not let go, and never draws the next',
    async () => {
      let opened = 0;
      const streamDeps: WorkPackageStreamDeps = {
        openSocket: () => {
          opened += 1;
          return {
            send: () => undefined,
            close: () => {
              throw new Error('alice@example.com’s socket would not close');
            },
          };
        },
        schedule: () => 0,
        cancel: () => undefined,
        random: () => 0,
      };
      render(<WorkPackagePageOverOwner api={fakeWorkPackages(TWO)} streamDeps={streamDeps} />);
      await selectWorkPackage('p1');
      await waitFor(() => {
        expect(opened).toBe(1);
      });

      await selectWorkPackage('p2');

      const fault = await waitFor(() => {
        const shown = document.querySelector('[data-lifetime-fault]');
        expect(shown).not.toBeNull();
        return shown;
      });
      expect(fault?.textContent).toContain('Reference');
      expect(fault?.textContent).not.toContain('alice@example.com');
      expect(document.querySelector('[data-grid]')).toBeNull();
      expect(opened).toBe(1);
    },
  );

  itDom('leaves the table out of the banner and in the page’s main', async () => {
    pageWith(fakeWorkPackages(TWO));
    await selectWorkPackage('p2');

    // The half that says the landmark is a bar rather than the whole page: a
    // `<header>` wrapped around everything would satisfy the assertions above.
    const bar = screen.getByRole('banner');
    // Drawn once the work package's runtime is live, a few microtasks after the pick.
    const grid = await waitFor(() => {
      const drawn = document.querySelector('[data-grid]');
      expect(drawn).not.toBeNull();
      return drawn;
    });
    expect(bar.contains(grid)).toBe(false);
    expect(document.querySelector('main')?.contains(grid)).toBe(true);
  });
});

itDom('starts a created work package without the previous work package’s row anchors', async () => {
  const first = fakeWorkPackageApi();
  const second = fakeWorkPackageApi();
  await first.createWorkItem('p1', {
    parentId: null,
    afterId: null,
    name: 'Departed work package row',
  });
  const steps = await second.steps('p2');
  let releaseSteps!: (loaded: typeof steps) => void;
  const heldSteps = new Promise<typeof steps>((resolve) => {
    releaseSteps = resolve;
  });
  let requestedSteps = false;
  const creates: Parameters<WorkPackageApi['createWorkItem']>[] = [];
  const forWorkPackage = (workPackageId: string) => {
    if (workPackageId === 'p1') return first;
    if (workPackageId === 'p2') return second;
    throw new Error(`unexpected work package ${workPackageId}`);
  };
  const api: WorkPackageApi = {
    ...fakeWorkPackages(TWO.slice(0, 1)),
    tree: (workPackageId) => forWorkPackage(workPackageId).tree(workPackageId),
    steps: (workPackageId) => {
      if (workPackageId === 'p1') return first.steps(workPackageId);
      requestedSteps = true;
      return heldSteps;
    },
    createWorkItem: (workPackageId, input) => {
      creates.push([workPackageId, input]);
      return forWorkPackage(workPackageId).createWorkItem(workPackageId, input);
    },
  };
  pageWith(api);
  expect(await screen.findByLabelText('Name of 010')).toHaveProperty(
    'value',
    'Departed work package row',
  );

  await chooseFixtureProject();
  openWorkPackageActions();
  fireEvent.click(
    within(screen.getByRole('banner')).getByRole('button', { name: 'Create new work package' }),
  );
  const field = await screen.findByLabelText('Work package name');
  fireEvent.keyDown(field, { key: 'Escape' });
  await waitFor(() => {
    expect(requestedSteps).toBe(true);
    expect(picker()).toHaveProperty('value', 'New work package');
  });

  expect(screen.queryByLabelText('Name of 010')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Add work item' }));
  await waitFor(() => {
    expect(creates).toEqual([['p2', { parentId: null, afterId: null, name: '' }]]);
  });
  await act(async () => {
    releaseSteps(steps);
    await Promise.resolve();
  });
  expect(await screen.findByLabelText('Name of 010')).toHaveProperty('value', '');
  expect(screen.queryByDisplayValue('Departed work package row')).toBeNull();
  expect(screen.queryByLabelText('Name of 020')).toBeNull();
  expect(document.querySelector('[data-toast-text]')).toBeNull();
});

/**
 * Slice 9's prerequisite: every part of slice 8 was gated on its own and no
 * screen rendered any of it, so the suites were green over a feature that could
 * not be reached by clicking.
 */
describe('the saved-plan shelf is on the work package page', () => {
  itDom('renders the shelf in the header once a work package is open', async () => {
    // Current placement is one nested actions shelf; the preserved header/sheet account below is historical.
    pageWith(fakeWorkPackages(TWO));

    // Before a work package is picked there is no history to show — and no work package
    // id to ask be-01 about, which is the honest reason the panel is absent
    // rather than empty.
    expect(screen.queryByText('Saved plans', { selector: 'summary' })).toBeNull();

    await selectWorkPackage('p2');
    openWorkPackageActions();

    /*
      The shelf is a disclosure in the app header's work package row now, and closed
      is its rest state.

      **Four shapes, each killed by a measurement that already existed.** As an
      `mt-2 shrink-0` flex sibling it took ~76px off the one column that has to
      reach the bottom of the window, and four browser measurements failed at
      once (`header.spec.ts:272`/`:289`, `plan-surface.spec.ts:278`/`:318`).
      Floating it over `<main>`'s bottom-right paid that bill but landed on the
      chart's own controls (Gemini F-03 / Sol I4 on PR 202). The plan toolbar
      paid both — and spent a third budget nobody had put on the bill:
      `work-package-settings.spec.ts:77` holds `[data-toolbar]`'s children to 1265px
      with a named margin for exactly one more control, and `gantt.spec.ts:2605`
      needs that bar to be **one** row at 768 before the drag that adds `Reset
      layout` makes it two. Both went red at `14a1a070` (2 failed / 281 passed).
      The header's work package row is the fourth and the settled one **above `md`**:
      `flex-nowrap` with a `max-w` picker that absorbs the width, outside
      `<main>` entirely. Below `md` it is the phone's `Plan actions` sheet
      instead, because the line this row takes there costs 36px that
      `mobile.spec.ts:850` cannot spare — the case below holds that half.

      jsdom lays nothing out, so those six measurements stay the real guard for
      the pixels. What this file can hold is where the chip lives, which is what
      the pixels follow from — so both halves are asserted: in the banner, and
      **not** in either copy of the toolbar. The negative is the load-bearing
      one; it is the shape that was red on CI.
    */
    const chip = await screen.findByText('Saved plans', { selector: 'summary' });
    const shelfDisclosure = chip.closest('details');
    expect(shelfDisclosure?.closest('[data-toolbar], [data-toolbar-sheet]')).toBeNull();
    expect(shelfDisclosure?.closest('header')).not.toBeNull();
    openWorkPackageActions();
    // Beside the work package's own controls, in one row, rather than merely
    // somewhere in the bar: `Create new workPackage` is the nearest of them and the only
    // one that is there whether a rename is armed or not.
    expect(
      within(shelfDisclosure?.parentElement ?? document.body).getByRole('button', {
        name: 'Create new work package',
      }),
    ).toBeDefined();

    fireEvent.click(chip);

    const heading = await screen.findByRole('heading', { name: 'Saved plans' });
    // In the banner landmark, which is the half `main?.contains(heading)`
    // asserted until the chip left the plan column. A screen reader gets to
    // skip a banner, and the plan's history is chrome about the work package rather
    // than part of the plan on screen.
    const banner = document.querySelector('header');
    expect(banner?.contains(heading)).toBe(true);
    expect(document.querySelector('main')?.contains(heading)).toBe(false);
    // Above the grid, not below it — the inverse of what this asserted while
    // the shelf floated at the bottom of `<main>`, and the assertion survived
    // three moves because document order is what a screen reader reads. The
    // panel opens over the plan rather than under it.
    const grid = document.querySelector('[data-grid]');
    if (grid === null) throw new Error('the table did not render');
    expect(
      grid.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeGreaterThan(0);
    // The shelf's own read landed, so this is the wired panel and not an empty
    // heading: `before the re-plan` is the row the fake answers with.
    //
    // Scoped to the list, and the ambiguity is the evidence. Unscoped this
    // failed on `Found multiple elements with the text: /before the re-plan/` —
    // the row **and** the comparison's side name, which is the whole panel
    // wired rather than a heading with a list under it.
    const shelf = await screen.findByRole('list', { name: 'Saved plans' });
    expect(within(shelf).getByText('before the re-plan')).toBeDefined();
  });

  itDom('closes the shelf when a pointer goes down outside it', async () => {
    /*
      The regression this exists for, and it shipped once.

      `useClosedOnDismiss` reads its ref **once**, in a `useEffect` with
      an empty dependency list, so the hook has to mount in the same commit as
      the `<details>` it is handed. Held on `WorkPackagePage` — which renders first
      with no work package selected and so no shelf — `panel.current` was `null` when
      the effect ran, it returned early, and the `pointerdown` listener was never
      registered: the panel could only be closed from its own chip and otherwise
      floated over the plan for good. Gemini's F-01 on PR 202, and the fix is
      `SavedPlanShelf` owning the hook.

      Watched failing 2026-09-04, h2puni, `dirty=0` apart from the one file:
      `work-package-page.tsx` restored to `4bd9e95b` (the hook hoisted onto
      `WorkPackagePage`) under this file at `956265a6` fails right here, at
      `expect(disclosure.open).toBe(false)` — 1 failed, 46 skipped of 47. So the
      case is bound to the fault and not to the fix.
    */
    pageWith(fakeWorkPackages(TWO));
    await selectWorkPackage('p2');
    openWorkPackageActions();

    const chip = await screen.findByText('Saved plans', { selector: 'summary' });
    const disclosure = chip.closest('details');
    if (disclosure === null) throw new Error('the chip is not inside a disclosure');

    fireEvent.click(chip);
    expect(disclosure.open).toBe(true);

    // Capture-phase `pointerdown` on the document is what the hook listens for,
    // so that is what this fires — a `click` would prove nothing about it.
    fireEvent.pointerDown(document.body);
    expect(disclosure.open).toBe(false);
  });

  itDom(
    'does not compare the new work package against the old work package’s checkpoint',
    async () => {
      /*
      The `key={selected}` on the panel, asserted from the outside.

      The panel pins its compare pair once, in `useState`, so that a
      collaborator's save cannot re-point a picker the reader left alone
      (AC #4). Carried across a work package switch that same pin is a saved-plan id
      belonging to the work package just left, and the compare effect — which *does*
      re-run, because `workPackageId` is in its dependencies — would then ask be-01
      to compare the new work package against a checkpoint that is not in it.

      Asserted on `compare`'s arguments and not on `list`'s: the shelf re-reads
      on a work package change by itself, so a `list` assertion goes green with the
      key deleted. Measured — with `key={selected}` removed the whole file still
      passed 46/46 on the `list` form, and this form fails on `expected 'sp1'
      to be 'sp9'`.
    */
      const OTHER: SavedPlanListEntryView = {
        ...CHECKPOINT,
        id: 'sp9',
        name: 'the other work package’s',
      };
      const compared: [string, unknown][] = [];
      const deps: SavedPlanRoutes = {
        ...fakeSavedPlanRoutes(),
        list: (workPackageId: string) =>
          Promise.resolve(savedPlanListReply([workPackageId === 'p2' ? CHECKPOINT : OTHER])),
        compare: (workPackageId, left) => {
          compared.push([workPackageId, left]);
          return Promise.resolve(savedPlanCompareReply());
        },
      };
      pageWith(fakeWorkPackages(TWO), deps);

      await selectWorkPackage('p2');
      await waitFor(() => {
        expect(compared).toContainEqual(['p2', { saved: 'sp1' }]);
      });

      await selectWorkPackage('p1');
      await waitFor(() => {
        expect(compared.some(([workPackageId]) => workPackageId === 'p1')).toBe(true);
      });
      // Every question asked about p1 is asked about p1's own checkpoint. Not
      // just the last one: a stale pair asked once and corrected is still a read
      // of somebody else's plan.
      for (const [workPackageId, left] of compared) {
        if (workPackageId === 'p1') expect(left).toEqual({ saved: 'sp9' });
      }
    },
  );

  itDom(
    'keeps one saved-plan shelf in the stable actions branch across cards and table viewports',
    async () => {
      /* Current: the following recorded phone-placement narrative is historical; one Page-owned actions shelf now persists across the renderer breakpoint. */
      /*
      **The one pixel red slice 9 ended on, held as a placement rule.**

      `mobile.spec.ts:850` asks the card sheet's trigger to be above the sheet
      it opens, and at `5e59b29d` it was 13.39px below it. Measured on h2puni
      rather than argued: the `85vh` cap puts the sheet's top at 126.6 on a
      390×844 phone, a card's trigger sits 55px under `[data-plan-cards]`'s own
      top edge at the scroll ceiling, and that scroller started at 195 — so the
      goal was unreachable and the shelf's line in the header was 36 of the
      missing 21.4px. Off that row the header measured 137 → 101 and the
      scroller 195 → 159.

      jsdom lays nothing out, so this cannot assert those numbers. What it can
      assert is the fact they follow from, which is also the thing a later edit
      would silently undo: below the renderer's breakpoint the header carries no
      shelf — and with the sheet shut there is **no shelf in the document at
      all**, which is what tells a mount apart from a `hidden md:block` pair
      that leaves a second copy in the DOM for every `[data-saved-plans]`
      selector to find. `plan-cards.test.tsx` holds the other half, that the
      sheet is where it went.
    */
      const wide = window.innerWidth;
      Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
      try {
        pageWith(fakeWorkPackages(TWO));
        await selectWorkPackage('p2');
        await screen.findByText('Saved plans', { selector: 'summary' });
        openWorkPackageActions();

        // The work package's own controls are still there — this is the shelf leaving
        // the row, not the row leaving the header.
        expect(
          within(screen.getByRole('banner'))
            .getByRole('button', { name: 'Create new work package' })
            .closest('header'),
        ).not.toBeNull();
        expect(document.querySelectorAll('header [data-saved-plans]')).toHaveLength(1);
        expect(document.querySelectorAll('[data-saved-plans]')).toHaveLength(1);
        const shelf = document.querySelector('[data-saved-plans]');
        if (shelf === null) throw new Error('The live package shelf is absent from actions');
        expect(shelf.closest('[data-toolbar], [data-toolbar-sheet]')).toBeNull();
        Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
        fireEvent(window, new Event('resize'));
        await waitFor(() => {
          expect(document.querySelector('[data-saved-plans]')).toBe(shelf);
        });
        expect(document.querySelectorAll('[data-saved-plans]')).toHaveLength(1);
      } finally {
        Object.defineProperty(window, 'innerWidth', { value: wide, configurable: true });
      }
    },
  );
});

describe('a work package link, /?work package=<id>', () => {
  afterEach(() => {
    window.history.replaceState(window.history.state, '', '/');
  });

  itDom('opens the work package it names, over the remembered one', async () => {
    localStorage.setItem('wbs.workPackage', 'p1');
    window.history.replaceState(window.history.state, '', '/?workPackage=p2');
    pageWith(fakeWorkPackages(TWO));
    await waitFor(() => {
      expect(picker().value).toBe('Paint the fence');
    });
  });

  for (const phone of [false, true]) {
    for (const destination of ['work-item', 'step'] as const) {
      itDom(
        `selects a stable ${destination} destination over the remembered work package on ${phone ? 'phone' : 'desktop'}`,
        async () => {
          const width = window.innerWidth;
          Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: phone ? 390 : 1024,
          });
          try {
            const model = fakeWorkPackageApi();
            await model.createWorkItem('p2', {
              parentId: null,
              afterId: null,
              name: 'Destination',
            });
            const api = fakeWorkPackages(TWO);
            const workItemId = '11111111-1111-4111-8111-111111111111';
            const stepId = '22222222-2222-4222-8222-222222222222';
            api.tree = async (workPackageId) => {
              const plan = await model.tree(workPackageId);
              return {
                ...plan,
                workItems: plan.workItems.map((each) => ({ ...each, id: workItemId })),
                steps: plan.steps.map((step) =>
                  step.id === 'step-qa' ? { ...step, id: stepId } : step,
                ),
                stepNodes: plan.stepNodes?.map((node) => {
                  const nodeStepId = node.stepId === 'step-qa' ? stepId : node.stepId;
                  return {
                    ...node,
                    id: `sn1.${workItemId}.${nodeStepId}`,
                    workItemId,
                    stepId: nodeStepId,
                  };
                }),
              };
            };
            api.steps = async (workPackageId) =>
              (await model.steps(workPackageId)).map((step) =>
                step.id === 'step-qa' ? { ...step, id: stepId } : step,
              );
            localStorage.setItem('wbs.workPackage', 'p1');
            const stepQuery = destination === 'step' ? `&stepNode=sn1.${workItemId}.${stepId}` : '';
            window.history.replaceState(
              null,
              '',
              `/?workPackage=p2&workItem=${workItemId}${stepQuery}&view=plan`,
            );
            pageWith(api);
            await waitFor(() =>
              expect(
                screen.getByLabelText(
                  destination === 'step' ? 'QA estimate for 010' : 'Name of 010',
                ),
              ).toHaveFocus(),
            );
            expect(picker().value).toBe('Paint the fence');
            expect(localStorage.getItem('wbs.workPackage')).toBe('p2');
            expect(window.location.search).toBe('?view=plan');
            expect(api.opened).toContain('p2');
            expect(api.opened).not.toContain('p1');
          } finally {
            Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
          }
        },
      );
    }
  }

  itDom('shows the empty state for a link to a work package it cannot open', async () => {
    localStorage.setItem('wbs.workPackage', 'p1');
    window.history.replaceState(window.history.state, '', '/?workPackage=unknown');
    pageWith(fakeWorkPackages(TWO));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Work package link names a work package you cannot open.',
    );
    expect(picker().value).toBe('');
    expect(window.location.search).toBe('');
    await selectWorkPackage('p2');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('the page with no work package open', () => {
  itDom(
    'offers the account’s work packages, Create and Import, and opens the one chosen (F-019, F-027)',
    async () => {
      pageWith(fakeWorkPackages(TWO));

      // Proof: on 2026-10-13, before the empty state existed, this failed on `Unable to find role
      // "region" and name "No work package open"` — the page under the header was blank.
      const home = await screen.findByRole('region', { name: 'No work package open' });
      const offered = within(within(home).getByRole('list', { name: 'Your work packages' }))
        .getAllByRole('button')
        .map((button) => button.textContent);
      expect(offered).toEqual(['Rewire the shedNever opened', 'Paint the fenceNever opened']);
      expect(within(home).getByRole('button', { name: 'Create new work package' })).toBeDefined();
      expect(within(home).getByLabelText('Import JSON')).toBeDefined();

      fireEvent.click(within(home).getByRole('button', { name: /^Paint the fence/ }));

      await waitFor(() => {
        expect(picker().value).toBe('Paint the fence');
      });
      expect(screen.queryByRole('region', { name: 'No work package open' })).toBeNull();
      expect(localStorage.getItem('wbs.workPackage')).toBe('p2');
    },
  );

  itDom('says what to do with no work packages at all', async () => {
    pageWith(fakeWorkPackages([]));

    const home = await screen.findByRole('region', { name: 'No work package open' });
    expect(within(home).queryByRole('list')).toBeNull();
    expect(home.textContent).toContain(
      'Start a new work package, or import a plan exported as JSON.',
    );
  });

  itDom('is not drawn while a work package is open', async () => {
    pageWith(fakeWorkPackages(TWO.slice(0, 1)));

    await waitFor(() => {
      expect(picker().value).toBe('Rewire the shed');
    });
    expect(screen.queryByRole('region', { name: 'No work package open' })).toBeNull();
  });
});

describe('the chosen work package survives a refresh', () => {
  itDom('selects the remembered work package on the next load, with no click', async () => {
    pageWith(fakeWorkPackages(TWO));
    await selectWorkPackage('p2');
    expect(picker().value).toBe('Paint the fence');

    cleanup();
    pageWith(fakeWorkPackages(TWO));

    await waitFor(() => {
      expect(picker().value).toBe('Paint the fence');
    });
  });

  itDom('ignores a remembered work package the list no longer has, and forgets it', async () => {
    localStorage.setItem('wbs.workPackage', 'gone');
    const api = fakeWorkPackages(TWO);
    // What the guard prevents is the table asking be-01 for the deleted
    // work package's tree.
    const asked = recordCalls(api, 'tree', (workPackageId) => workPackageId);
    pageWith(api);

    await waitFor(() => {
      expect(localStorage.getItem('wbs.workPackage')).toBeNull();
    });
    expect(picker().value).toBe('');
    expect(screen.queryByRole('button', { name: 'Rename work package' })).toBeNull();
    expect(asked).toEqual([]);
  });

  itDom('drops an empty remembered work package and selects nothing', async () => {
    localStorage.setItem('wbs.workPackage', '');
    pageWith(fakeWorkPackages(TWO));

    await waitFor(() => {
      expect(localStorage.getItem('wbs.workPackage')).toBeNull();
    });
    expect(picker().value).toBe('');
    expect(screen.queryByRole('button', { name: 'Rename work package' })).toBeNull();
  });
});

/**
 * The four lifecycle transitions of `docs/superpowers/plans/2026-09-21-batch-6/050-7-f1-theme-hook-model.md`,
 * for a page that reads and writes the last-opened work package only when a list load
 * lands or a handler runs.
 *
 * The page renders nothing derived from that store and does not re-render when
 * the slot moves, so every transition here is about which runtime a callback
 * reaches at the instant it runs.
 */
describe('the remembered work package, over the runtime live when it is used', () => {
  const WORK_PACKAGE_KEY = 'wbs.workPackage';
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

  const pageUnder = (slot: LifetimeSlot<ApplicationServices>, api: WorkPackageApi) =>
    render(
      <ApplicationServicesProvider slot={slot}>
        <WorkPackagePageOverOwner api={api} savedPlanRoutes={fakeSavedPlanRoutes()} />
      </ApplicationServicesProvider>,
    );

  const heldWorkPackage = (store: HeldByFake): string | undefined => store.held()[WORK_PACKAGE_KEY];

  itDom('restores nothing and remembers nothing when no runtime is live', async () => {
    const slot = emptySlot();
    pageUnder(slot, fakeWorkPackages(TWO));

    await selectWorkPackage('p2');

    expect(picker().value).toBe('Paint the fence');
    // Not the page's own runtime either: nothing fell through to it.
    expect(localStorage.getItem(WORK_PACKAGE_KEY)).toBeNull();
    expect(recallLastWorkPackage(applicationServicesStateFor(slot))).toEqual({
      value: null,
      persists: false,
    });
  });

  itDom('stops remembering once its runtime is withdrawn, and never throws', async () => {
    const store = fakeBrowserStorage({ [WORK_PACKAGE_KEY]: 'p2' });
    const slot = emptySlot();
    await publishOver(slot, store);
    pageUnder(slot, fakeWorkPackages(TWO));
    await waitFor(() => {
      expect(picker().value).toBe('Paint the fence');
    });
    await act(async () => {
      await slot.retire();
    });

    await selectWorkPackage('p1');

    expect(picker().value).toBe('Rewire the shed');
    expect(heldWorkPackage(store)).toBe('p2');
    expect(rememberLastWorkPackage(applicationServicesStateFor(slot), 'p1')).toBe(false);
  });

  itDom(
    'restores the replacement runtime’s own work package when a list load lands after a replacement',
    async () => {
      const first = fakeBrowserStorage({ [WORK_PACKAGE_KEY]: 'p1' });
      const second = fakeBrowserStorage({ [WORK_PACKAGE_KEY]: 'p2' });
      const slot = emptySlot();
      await publishOver(slot, first);
      const api = fakeWorkPackages(TWO);
      let land = (): void => {
        throw new Error('the list was never asked for');
      };
      const listed = new Promise<void>((resolve) => {
        land = resolve;
      });
      const listWorkPackages = api.listWorkPackages.bind(api);
      api.listWorkPackages = async () => {
        await listed;
        return listWorkPackages();
      };
      pageUnder(slot, api);
      await publishOver(slot, second);

      await act(async () => {
        land();
        await listed;
      });

      await waitFor(() => {
        expect(picker().value).toBe('Paint the fence');
      });
      expect(heldWorkPackage(first)).toBe('p1');
    },
  );

  itDom(
    'writes a work package chosen after a replacement into the replacement, from a page drawn before it',
    async () => {
      const first = fakeBrowserStorage();
      const second = fakeBrowserStorage();
      const slot = emptySlot();
      await publishOver(slot, first);
      pageUnder(slot, fakeWorkPackages(TWO));
      await waitFor(() => {
        expect(screen.getByLabelText('Work package')).toBeDefined();
      });
      openPicker();
      await waitFor(() => {
        expect(document.getElementById('work-package-option-p2')).not.toBeNull();
      });
      // The option is on screen, drawn under the first runtime; nothing renders
      // again before it is clicked.
      await publishOver(slot, second);

      const option = document.getElementById('work-package-option-p2');
      if (option === null) throw new Error('setup: no option for p2');
      fireEvent.click(option);

      expect(picker().value).toBe('Paint the fence');
      expect(heldWorkPackage(second)).toBe('p2');
      expect(heldWorkPackage(first)).toBeUndefined();
    },
  );

  itDom(
    'lets a store’s own write failure through by identity, selecting nothing it could not keep',
    async () => {
      const denied = new Error('write denied');
      const store = writeRefusingBrowserStorage(denied);
      const slot = emptySlot();
      await publishOver(slot, store);
      const api = fakeWorkPackages(TWO);
      pageUnder(slot, api);

      const reported: unknown[] = [];
      const report = (event: ErrorEvent): void => {
        reported.push(event.error);
        event.preventDefault();
      };
      window.addEventListener('error', report);
      try {
        await selectWorkPackage('p2');
      } finally {
        window.removeEventListener('error', report);
      }

      expect(reported).toHaveLength(1);
      expect(reported[0]).toBe(denied);
      expect(screen.queryByRole('button', { name: 'Rename work package' })).toBeNull();
      expect(api.opened).toEqual([]);
      expect(heldWorkPackage(store)).toBeUndefined();
    },
  );

  itDom(
    'propagates the committed pair preference failure by identity without partial publication',
    async () => {
      const denied = new Error('combined preference write denied');
      const store = writeRefusingBrowserStorage(denied);
      const write = vi.spyOn(store, 'write');
      const slot = emptySlot();
      await publishOver(slot, store);
      const fixture = await emptyCombinedCatalog();
      const opened = vi.fn(fixture.api.openWorkPackage.bind(fixture.api));
      fixture.api.openWorkPackage = opened;
      const caught = vi.spyOn(FaultBoundary.prototype, 'componentDidCatch');
      render(
        <FaultBoundary
          fallback={() => <p role="alert">Publication stopped</p>}
          logAs="combined publication test"
          resetKey="test"
        >
          <ApplicationServicesProvider slot={slot}>
            <WorkPackagePageOverOwner api={fixture.api} savedPlanRoutes={fakeSavedPlanRoutes()} />
          </ApplicationServicesProvider>
        </FaultBoundary>,
      );
      openWorkPackageActions();
      await screen.findByText(/No projects are available to you/);
      window.history.replaceState(
        null,
        '',
        '/?workPackage=prior-url&stepNode=prior-step&workItem=prior-item',
      );
      const priorUrl = window.location.href;
      await submitNamedPair();
      await waitFor(() => {
        expect(caught).toHaveBeenCalledTimes(1);
      });
      expect(write).toHaveBeenCalledWith('wbs.workPackage', 'fake-package-1');
      expect(caught.mock.calls[0]?.[0]).toBe(denied);
      expect(screen.getByRole('alert')).toHaveTextContent('Publication stopped');
      expect(window.location.href).toBe(priorUrl);
      expect(opened).not.toHaveBeenCalled();
      expect(heldWorkPackage(store)).toBeUndefined();
      expect(fixture.create).toHaveBeenCalledExactlyOnceWith('WBS product', 'Editor');
      expect(fixture.standalone).not.toHaveBeenCalled();
      expect(fixture.rename).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Retry refresh' })).toBeNull();
    },
  );

  itDom(
    'propagates the retry pair preference failure by identity without partial publication',
    async () => {
      const denied = new Error('retry preference write denied');
      const store = writeRefusingBrowserStorage(denied);
      const write = vi.spyOn(store, 'write');
      const slot = emptySlot();
      await publishOver(slot, store);
      const fixture = await emptyCombinedCatalog();
      const opened = vi.fn(fixture.api.openWorkPackage.bind(fixture.api));
      fixture.api.openWorkPackage = opened;
      const projects = vi.fn(fixture.api.listProjects.bind(fixture.api));
      fixture.api.listProjects = projects;
      const caught = vi.spyOn(FaultBoundary.prototype, 'componentDidCatch');
      render(
        <FaultBoundary
          fallback={() => <p role="alert">Publication stopped</p>}
          logAs="combined retry publication test"
          resetKey="test"
        >
          <ApplicationServicesProvider slot={slot}>
            <WorkPackagePageOverOwner api={fixture.api} savedPlanRoutes={fakeSavedPlanRoutes()} />
          </ApplicationServicesProvider>
        </FaultBoundary>,
      );
      openWorkPackageActions();
      await screen.findByText(/No projects are available to you/);
      projects.mockRejectedValueOnce(new Error('first reconciliation unavailable'));
      window.history.replaceState(
        null,
        '',
        '/?workPackage=prior-url&stepNode=prior-step&workItem=prior-item',
      );
      const priorUrl = window.location.href;
      await submitNamedPair();
      const dialog = await screen.findByRole('dialog', { name: 'New project' });
      fireEvent.click(await within(dialog).findByRole('button', { name: 'Retry refresh' }));
      await waitFor(() => {
        expect(caught).toHaveBeenCalledTimes(1);
      });
      expect(write).toHaveBeenCalledWith('wbs.workPackage', 'fake-package-1');
      expect(caught.mock.calls[0]?.[0]).toBe(denied);
      expect(screen.getByRole('alert')).toHaveTextContent('Publication stopped');
      expect(window.location.href).toBe(priorUrl);
      expect(opened).not.toHaveBeenCalled();
      expect(heldWorkPackage(store)).toBeUndefined();
      expect(fixture.create).toHaveBeenCalledExactlyOnceWith('WBS product', 'Editor');
      expect(fixture.standalone).not.toHaveBeenCalled();
      expect(fixture.rename).not.toHaveBeenCalled();
    },
  );

  for (const publication of ['initial', 'retry'] as const) {
    itDom(
      `offers the actual undefined ${publication} pair preference failure to the disclosure boundary`,
      async () => {
        const store = fakeBrowserStorage();
        // The external storage write can throw any value; retain actual undefined through the Page.
        const write = vi.spyOn(store, 'write').mockImplementation(() => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- This test injects the external storage boundary throwing undefined.
          throw undefined;
        });
        const slot = emptySlot();
        await publishOver(slot, store);
        const fixture = await emptyCombinedCatalog();
        const opened = vi.fn(fixture.api.openWorkPackage.bind(fixture.api));
        fixture.api.openWorkPackage = opened;
        const projects = vi.fn(fixture.api.listProjects.bind(fixture.api));
        fixture.api.listProjects = projects;
        const discloses = vi.fn((_thrown: unknown): string | null => null);
        render(
          <FaultBoundary
            fallback={() => <p role="alert">Publication stopped</p>}
            discloses={discloses}
            logAs="undefined combined publication test"
            resetKey="test"
          >
            <ApplicationServicesProvider slot={slot}>
              <WorkPackagePageOverOwner api={fixture.api} savedPlanRoutes={fakeSavedPlanRoutes()} />
            </ApplicationServicesProvider>
          </FaultBoundary>,
        );
        openWorkPackageActions();
        await screen.findByText(/No projects are available to you/);
        if (publication === 'retry')
          projects.mockRejectedValueOnce(new Error('first reconciliation unavailable'));
        window.history.replaceState(
          null,
          '',
          '/?workPackage=prior-url&stepNode=prior-step&workItem=prior-item',
        );
        const priorUrl = window.location.href;
        await submitNamedPair();
        if (publication === 'retry') {
          const dialog = await screen.findByRole('dialog', { name: 'New project' });
          fireEvent.click(await within(dialog).findByRole('button', { name: 'Retry refresh' }));
        }
        await waitFor(() => {
          expect(discloses).toHaveBeenCalledTimes(1);
        });
        expect(discloses.mock.calls).toEqual([[undefined]]);
        expect(write).toHaveBeenCalledExactlyOnceWith('wbs.workPackage', 'fake-package-1');
        expect(screen.getByRole('alert')).toHaveTextContent('Publication stopped');
        expect(window.location.href).toBe(priorUrl);
        expect(opened).not.toHaveBeenCalled();
        expect(heldWorkPackage(store)).toBeUndefined();
        expect(fixture.create).toHaveBeenCalledExactlyOnceWith('WBS product', 'Editor');
        expect(fixture.standalone).not.toHaveBeenCalled();
        expect(fixture.rename).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: 'Retry refresh' })).toBeNull();
      },
    );
  }

  itDom(
    'publishes the committed pair into the replacement preference runtime after its held GET',
    async () => {
      const first = fakeBrowserStorage();
      const second = fakeBrowserStorage();
      const slot = emptySlot();
      await publishOver(slot, first);
      const fixture = await emptyCombinedCatalog();
      const readPackages = fixture.api.listWorkPackages.bind(fixture.api);
      const packages = vi.fn(readPackages);
      fixture.api.listWorkPackages = packages;
      pageUnder(slot, fixture.api);
      openWorkPackageActions();
      await screen.findByText(/No projects are available to you/);
      await waitFor(() => {
        expect(packages).toHaveBeenCalledTimes(1);
      });
      const held = holdCombinedAnswer<WorkPackageListEntry[]>();
      packages.mockImplementationOnce(() => held.promise);
      await submitNamedPair();
      await waitFor(() => {
        expect(packages).toHaveBeenCalledTimes(2);
      });
      await publishOver(slot, second);
      await act(async () => {
        held.resolve(await readPackages());
        await Promise.resolve();
      });
      await waitFor(() => expect(picker()).toHaveValue('Editor'));
      expect(heldWorkPackage(first)).toBeUndefined();
      expect(heldWorkPackage(second)).toBe('fake-package-1');
      openWorkPackageActions();
      expect(screen.getByRole('combobox', { name: 'Destination project' })).toHaveValue(
        'fake-project-1',
      );
      expect(screen.queryByRole('dialog', { name: 'New project' })).toBeNull();
      expect(screen.queryByLabelText('Work package name')).toBeNull();
      expect(fixture.create).toHaveBeenCalledTimes(1);
      expect(packages).toHaveBeenCalledTimes(2);
    },
  );
});

describe('an entry says who owns it and when it was made', () => {
  itDom('tells two work packages of one name apart by their owners', async () => {
    // The whole reason the meta exists. Two entries reading `Rewire the shed`
    // and nothing else are one work package offered twice as far as anybody
    // choosing can tell — by eye and, because the meta is inside the option, by
    // screen reader.
    pageWith(
      fakeWorkPackages([
        { ...TWO[0], id: 'p1', name: 'Rewire the shed', createdByName: 'kat' },
        { ...TWO[0], id: 'p2', name: 'Rewire the shed', createdByName: 'strip' },
      ]),
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Work package')).toBeDefined();
    });
    openPicker();

    await waitFor(() => {
      expect(optionNames().length).toBe(2);
    });
    // By accessible name, not by textContent: the claim is that the two are
    // distinguishable to the accessibility tree, and a meta rendered as a
    // `title` or an adjacent sibling would pass a text assertion and fail this.
    expect(screen.getByRole('option', { name: `Rewire the shed (${THIS_JUNE} · kat)` }).id).toBe(
      'work-package-option-p1',
    );
    expect(screen.getByRole('option', { name: `Rewire the shed (${THIS_JUNE} · strip)` }).id).toBe(
      'work-package-option-p2',
    );
  });

  itDom('carries the year only when it is not this one', async () => {
    // Both sides of `shortInstant`'s boundary, because the entry must not
    // reimplement the rule — a meta that always printed the year, or never
    // did, passes a one-sided check. The rule itself is proven in
    // `short-date.test.ts`; this asserts the picker asks the right formatter.
    pageWith(
      fakeWorkPackages([
        { ...TWO[0], id: 'p1', name: 'This year', createdAt: MADE_ON },
        { ...TWO[0], id: 'p2', name: 'Next year', createdAt: MADE_NEXT_YEAR },
      ]),
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Work package')).toBeDefined();
    });
    openPicker();

    await waitFor(() => {
      expect(optionNames().length).toBe(2);
    });
    // `'27` and not `2027`: the off-year is two digits since 2026-09-13.
    const nextYear = `'${String((new Date().getFullYear() + 1) % 100).padStart(2, '0')}`;
    expect(optionNames()).toEqual([
      `This year (${THIS_JUNE} · kat)`,
      `Next year (${THIS_JUNE} ${nextYear} · kat)`,
    ]);
  });
});

describe('the picker searches', () => {
  itDom('narrows the list to what was typed, ignoring case', async () => {
    pageWith(fakeWorkPackages(TWO));
    await waitFor(() => {
      expect(screen.getByLabelText('Work package')).toBeDefined();
    });
    openPicker();
    await waitFor(() => {
      expect(optionNames()).toEqual([
        `Rewire the shed (${THIS_JUNE} · kat)`,
        `Paint the fence (${THIS_JUNE} · strip)`,
      ]);
    });

    fireEvent.change(picker(), { target: { value: 'FENCE' } });

    expect(optionNames()).toEqual([`Paint the fence (${THIS_JUNE} · strip)`]);
  });

  itDom('matches the name alone — an owner’s username offers nothing', async () => {
    // The recorded non-goal, on the page rather than only on the pure
    // function: the meta is on screen and in the accessible name, and typing
    // what it says must still narrow by name. `strip` owns `Paint the fence`
    // and names no work package.
    pageWith(fakeWorkPackages(TWO));
    await waitFor(() => {
      expect(screen.getByLabelText('Work package')).toBeDefined();
    });
    openPicker();
    await waitFor(() => {
      expect(optionNames().length).toBe(2);
    });

    fireEvent.change(picker(), { target: { value: 'strip' } });

    expect(optionNames()).toEqual([]);
  });

  itDom('chooses with the keyboard alone, and shows that work package’s table', async () => {
    const api = fakeWorkPackages(TWO);
    const asked = recordCalls(api, 'tree', (workPackageId) => workPackageId);
    pageWith(api);
    await waitFor(() => {
      expect(screen.getByLabelText('Work package')).toBeDefined();
    });
    openPicker();
    await waitFor(() => {
      expect(optionNames().length).toBe(2);
    });

    fireEvent.keyDown(picker(), { key: 'ArrowDown' });
    fireEvent.keyDown(picker(), { key: 'ArrowDown' });
    fireEvent.keyDown(picker(), { key: 'Enter' });

    await waitFor(() => {
      expect(picker().value).toBe('Paint the fence');
    });
    expect(asked).toEqual(['p2']);
  });

  itDom('offers be-01’s order rather than sorting the names itself', async () => {
    // be-01 answers in this account's recency order. `Paint` before `Rewire` is
    // not alphabetical and not the id order — a client that re-sorted by either
    // would show these two the other way round.
    pageWith(
      fakeWorkPackages([
        {
          projectId: 'fixture-project',
          id: 'p2',
          name: 'Paint the fence',
          restricted: false,
          abbreviation: 'PLAN',
          startDate: null,
          lastOpenedAt: 900,
          createdByName: 'strip',
          createdAt: MADE_ON,
        },
        {
          projectId: 'fixture-project',
          id: 'p1',
          name: 'Rewire the shed',
          restricted: false,
          abbreviation: 'PLAN',
          startDate: null,
          lastOpenedAt: null,
          createdByName: 'kat',
          createdAt: MADE_ON,
        },
      ]),
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Work package')).toBeDefined();
    });
    openPicker();

    await waitFor(() => {
      expect(optionNames()).toEqual([
        `Paint the fence (${THIS_JUNE} · strip)`,
        `Rewire the shed (${THIS_JUNE} · kat)`,
      ]);
    });
  });

  itDom('an Enter with nothing highlighted picks nothing', async () => {
    const api = fakeWorkPackages(TWO);
    pageWith(api);
    await waitFor(() => {
      expect(screen.getByLabelText('Work package')).toBeDefined();
    });
    openPicker();
    await waitFor(() => {
      expect(optionNames().length).toBe(2);
    });

    fireEvent.keyDown(picker(), { key: 'Enter' });

    expect(picker().value).toBe('');
    expect(api.opened).toEqual([]);
  });

  itDom('Escape closes the list without choosing', async () => {
    const api = fakeWorkPackages(TWO);
    pageWith(api);
    await waitFor(() => {
      expect(screen.getByLabelText('Work package')).toBeDefined();
    });
    openPicker();
    await waitFor(() => {
      expect(optionNames().length).toBe(2);
    });

    fireEvent.keyDown(picker(), { key: 'ArrowDown' });
    fireEvent.keyDown(picker(), { key: 'Escape' });

    expect(optionNames()).toEqual([]);
    expect(api.opened).toEqual([]);
  });
});

describe('creating a work package', () => {
  itDom('selects what was created, from a response carrying no last-opened time', async () => {
    // The create route answers with the work package it wrote and nothing about
    // this account's history — `CreatedWorkPackage` is that shape, and the fixture
    // above returns exactly it. The page must still select the new work package by
    // id and show its name, which is all it ever read of that response.
    const api = fakeWorkPackages(TWO);
    pageWith(api);
    await waitFor(() => {
      expect(screen.getByLabelText('Work package')).toBeDefined();
    });

    await chooseFixtureProject();
    openWorkPackageActions();
    fireEvent.click(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Create new work package' }),
    );

    // The name field stands in place of the picker while the rename a create
    // arms is open; leaving it is what shows the picker the selection.
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('Work package name').value).toBe(
        'New work package',
      );
    });
    fireEvent.keyDown(screen.getByLabelText('Work package name'), { key: 'Escape' });
    expect(picker().value).toBe('New work package');
    // And it was opened, which is what sorts the picker next time — the
    // recording is driven by the selection, so a create that failed to select
    // would record nothing.
    expect(api.opened).toContain('p3');
    expect(localStorage.getItem('wbs.workPackage')).toBe('p3');
  });
});

describe('opening a work package is recorded', () => {
  itDom('records the work package that was picked', async () => {
    const api = fakeWorkPackages(TWO);
    pageWith(api);
    await selectWorkPackage('p2');

    await waitFor(() => {
      expect(api.opened).toEqual(['p2']);
    });
  });

  itDom('records the work package restored from a previous visit', async () => {
    // The commonest arrival of all. Recording only on the click would leave
    // the work packages people return to most looking never-opened, and the
    // ordering would drift by exactly those.
    localStorage.setItem('wbs.workPackage', 'p1');
    const api = fakeWorkPackages(TWO);
    pageWith(api);

    await waitFor(() => {
      expect(api.opened).toEqual(['p1']);
    });
  });

  itDom('shows no error when recording fails', async () => {
    const api = fakeWorkPackages(TWO);
    api.openWorkPackage = () => Promise.reject(new Error('offline'));
    pageWith(api);
    await selectWorkPackage('p2');

    await waitFor(() => {
      expect(picker().value).toBe('Paint the fence');
    });
    // Navigation history nobody can act on: the work package still opened.
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('renaming a work package', () => {
  itDom('commits on Enter and shows the new name, still selected', async () => {
    const api = fakeWorkPackages(TWO);
    pageWith(api);
    await selectWorkPackage('p2');
    openWorkPackageActions();

    fireEvent.click(screen.getByRole('button', { name: 'Rename work package' }));
    const name = screen.getByLabelText<HTMLInputElement>('Work package name');
    expect(name.value).toBe('Paint the fence');
    fireEvent.change(name, { target: { value: 'Stain the fence' } });
    fireEvent.keyDown(name, { key: 'Enter' });

    await waitFor(() => {
      expect(picker().value).toBe('Stain the fence');
    });
    expect(api.renamed).toEqual([['p2', 'Stain the fence']]);
  });

  itDom('cancels on Escape without a request', async () => {
    const api = fakeWorkPackages(TWO);
    pageWith(api);
    await selectWorkPackage('p2');
    openWorkPackageActions();

    fireEvent.click(screen.getByRole('button', { name: 'Rename work package' }));
    const name = screen.getByLabelText<HTMLInputElement>('Work package name');
    fireEvent.change(name, { target: { value: 'Never this' } });
    fireEvent.keyDown(name, { key: 'Escape' });

    expect(api.renamed).toEqual([]);
    expect(screen.queryByLabelText('Work package name')).toBeNull();
    expect(picker().value).toBe('Paint the fence');
  });

  itDom('shows be-01’s refusal and keeps the old name', async () => {
    const api = fakeWorkPackages(TWO);
    api.renameWorkPackage = () => Promise.reject(new Error('forbidden'));
    pageWith(api);
    await selectWorkPackage('p2');
    openWorkPackageActions();

    fireEvent.click(screen.getByRole('button', { name: 'Rename work package' }));
    const name = screen.getByLabelText<HTMLInputElement>('Work package name');
    fireEvent.change(name, { target: { value: 'Not allowed' } });
    fireEvent.keyDown(name, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('forbidden');
    });
    // The draft survives the refusal — a `forbidden` must not eat what was
    // typed. Without this the test passed with a catch that closed the input.
    expect(screen.getByLabelText<HTMLInputElement>('Work package name').value).toBe('Not allowed');
    // And the work package is still called what it was called. This used to read
    // the "Working in …" line, which `H header-fits-a-row` removed with the
    // rest of the stacked chrome; the picker is where a work package's name is
    // shown now, and it shows it the moment the rename mode ends. Same claim,
    // one keystroke later, against the control that carries it today.
    fireEvent.keyDown(screen.getByLabelText('Work package name'), { key: 'Escape' });
    expect(picker().value).toBe('Paint the fence');
  });

  itDom('commits on blur when the name changed', async () => {
    const api = fakeWorkPackages(TWO);
    pageWith(api);
    await selectWorkPackage('p2');
    openWorkPackageActions();

    fireEvent.click(screen.getByRole('button', { name: 'Rename work package' }));
    const name = screen.getByLabelText<HTMLInputElement>('Work package name');
    fireEvent.change(name, { target: { value: 'Stain the fence' } });
    fireEvent.blur(name);

    await waitFor(() => {
      expect(picker().value).toBe('Stain the fence');
    });
    expect(api.renamed).toEqual([['p2', 'Stain the fence']]);
  });

  itDom('a blur that changed nothing cancels without a request', async () => {
    const api = fakeWorkPackages(TWO);
    pageWith(api);
    await selectWorkPackage('p2');
    openWorkPackageActions();

    fireEvent.click(screen.getByRole('button', { name: 'Rename work package' }));
    fireEvent.blur(screen.getByLabelText('Work package name'));

    expect(api.renamed).toEqual([]);
    expect(screen.queryByLabelText('Work package name')).toBeNull();
    expect(picker().value).toBe('Paint the fence');
  });

  itDom('an emptied draft cancels rather than blanking the name', async () => {
    const api = fakeWorkPackages(TWO);
    pageWith(api);
    await selectWorkPackage('p2');
    openWorkPackageActions();

    fireEvent.click(screen.getByRole('button', { name: 'Rename work package' }));
    const name = screen.getByLabelText<HTMLInputElement>('Work package name');
    fireEvent.change(name, { target: { value: '   ' } });
    fireEvent.keyDown(name, { key: 'Enter' });

    expect(api.renamed).toEqual([]);
    expect(screen.queryByLabelText('Work package name')).toBeNull();
    expect(picker().value).toBe('Paint the fence');
  });
});

describe('the selection is a claim too', () => {
  itDom('a selected work package deleted elsewhere is dropped on the next list load', async () => {
    const api = fakeWorkPackages(TWO);
    pageWith(api);
    await selectWorkPackage('p2');

    // p2 vanishes behind our back; the next load is triggered by a rename
    // commit, which is one of the two paths that refetch the list.
    api.drop('p2');
    openWorkPackageActions();
    fireEvent.click(screen.getByRole('button', { name: 'Rename work package' }));
    const name = screen.getByLabelText<HTMLInputElement>('Work package name');
    fireEvent.change(name, { target: { value: 'Too late' } });
    fireEvent.keyDown(name, { key: 'Enter' });

    // The one work package left is auto-selected — the read-back is 'p1', which a
    // held-forever 'p2' cannot produce (it would read back '').
    await waitFor(() => {
      expect(picker().value).toBe('Rewire the shed');
    });
    openWorkPackageActions();
    expect(screen.getByRole('button', { name: 'Rename work package' })).toBeDefined();
  });
});

describe('the hover card follows the list, not a stale pointer', () => {
  itDom(
    'remeasures the fixed card when its scrolling list moves the option underneath it',
    async () => {
      pageWith(fakeWorkPackages(TWO));
      await waitFor(() => {
        expect(screen.getByLabelText('Work package')).toBeDefined();
      });
      openPicker();
      const list = await screen.findByRole('listbox', { name: 'Work packages' });
      await waitFor(() => {
        expect(within(list).queryAllByRole('option').length).toBe(2);
      });
      list.getBoundingClientRect = () => new DOMRect(0, 0, 200, 240);

      const option = document.getElementById('work-package-option-p2');
      if (option === null) throw new Error('the second work package is not offered');
      let optionTop = 20;
      option.getBoundingClientRect = () => new DOMRect(10, optionTop, 120, 10);
      fireEvent.mouseEnter(option);
      // The option's own top, not its bottom plus a gap: the card opens
      // *beside* the list now, on the row it describes.
      await waitFor(() => {
        expect(screen.getByRole('tooltip', { name: 'Paint the fence' }).style.top).toBe('20px');
      });

      optionTop = 100;
      fireEvent.scroll(list);

      await waitFor(() => {
        expect(screen.getByRole('tooltip', { name: 'Paint the fence' }).style.top).toBe('100px');
      });
    },
  );

  itDom('hides the card when scrolling takes its option outside the visible listbox', async () => {
    pageWith(fakeWorkPackages(TWO));
    await waitFor(() => {
      expect(screen.getByLabelText('Work package')).toBeDefined();
    });
    openPicker();
    const list = await screen.findByRole('listbox', { name: 'Work packages' });
    list.getBoundingClientRect = () => new DOMRect(0, 0, 200, 60);
    const option = document.getElementById('work-package-option-p2');
    if (option === null) throw new Error('the second work package is not offered');
    let optionTop = 20;
    option.getBoundingClientRect = () => new DOMRect(10, optionTop, 120, 10);
    fireEvent.mouseEnter(option);
    expect(await screen.findByRole('tooltip', { name: 'Paint the fence' })).toBeDefined();

    optionTop = 80;
    fireEvent.scroll(list);

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  itDom('remeasures during list scroll without rerendering the work package page', async () => {
    let pageRenders = 0;
    render(
      <WorkPackagePageOverOwner
        api={fakeWorkPackages(TWO)}
        presence={() => {
          pageRenders += 1;
          return null;
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Work package')).toBeDefined();
    });
    openPicker();
    const list = await screen.findByRole('listbox', { name: 'Work packages' });
    list.getBoundingClientRect = () => new DOMRect(0, 0, 200, 240);
    const option = document.getElementById('work-package-option-p2');
    if (option === null) throw new Error('the second work package is not offered');
    let optionTop = 20;
    option.getBoundingClientRect = () => new DOMRect(10, optionTop, 120, 10);
    fireEvent.mouseEnter(option);
    await waitFor(() => {
      expect(screen.getByRole('tooltip', { name: 'Paint the fence' }).style.top).toBe('20px');
    });
    const rendersBeforeScroll = pageRenders;

    optionTop = 40;
    fireEvent.scroll(list);

    await waitFor(() => {
      expect(screen.getByRole('tooltip', { name: 'Paint the fence' }).style.top).toBe('40px');
    });
    expect(pageRenders).toBe(rendersBeforeScroll);
  });

  itDom(
    'shows the card for the entry the pointer rests on, then nothing stale after Escape and reopen',
    async () => {
      pageWith(fakeWorkPackages(TWO));
      await waitFor(() => {
        expect(screen.getByLabelText('Work package')).toBeDefined();
      });
      openPicker();
      await waitFor(() => {
        expect(optionNames().length).toBe(2);
      });
      layOutPicker();

      // Hover the second work package.
      fireEvent.mouseEnter(document.getElementById('work-package-option-p2')!);
      expect(await screen.findByRole('tooltip', { name: 'Paint the fence' })).toBeDefined();

      // Close with Escape while the pointer remains over p2 — the options
      // unmount, so no mouseleave fires and the pointer id would linger.
      fireEvent.keyDown(picker(), { key: 'Escape' });
      expect(optionNames()).toEqual([]);

      // Reopen by keyboard: the card must not show the stale pointer's work package.
      openPicker();
      await waitFor(() => {
        expect(optionNames().length).toBe(2);
      });
      layOutPicker();
      expect(screen.queryByRole('tooltip')).toBeNull();

      // The card now follows the keyboard highlight, never the old pointer.
      fireEvent.keyDown(picker(), { key: 'ArrowDown' });
      expect(await screen.findByRole('tooltip', { name: 'Rewire the shed' })).toBeDefined();
      expect(screen.queryByRole('tooltip', { name: 'Paint the fence' })).toBeNull();
    },
  );

  itDom('does not leave the just-chosen work package’s card showing on the next open', async () => {
    const api = fakeWorkPackages(TWO);
    pageWith(api);
    await waitFor(() => {
      expect(screen.getByLabelText('Work package')).toBeDefined();
    });
    openPicker();
    await waitFor(() => {
      expect(optionNames().length).toBe(2);
    });
    layOutPicker();

    fireEvent.mouseEnter(document.getElementById('work-package-option-p2')!);
    expect(await screen.findByRole('tooltip', { name: 'Paint the fence' })).toBeDefined();

    // Choosing unmounts the options without a mouseleave, then closes.
    fireEvent.click(document.getElementById('work-package-option-p2')!);
    await waitFor(() => {
      expect(picker().value).toBe('Paint the fence');
    });

    openPicker();
    const list = await screen.findByRole('listbox', { name: 'Work packages' });
    await waitFor(() => {
      expect(within(list).queryAllByRole('option').length).toBe(2);
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

/**
 * How far an option's box is inset from the listbox's own, in px.
 *
 * The `<ul>` has a 1px border and `p-1`, so an option's rectangle is five
 * pixels inside the list's on each side. It is stubbed here rather than left
 * equal because that inset is the **only** measurable difference between a
 * card anchored to the list and one anchored to the option: every option in a
 * one-column `w-full` list shares its width, so a per-option anchor cannot
 * produce two different lefts, and a stub that gave both the same box could
 * not see the two apart at all.
 */
const OPTION_INSET = 5;

/** How tall a stubbed option row is, in px. */
const OPTION_ROW = 24;

/** The clear air the placement keeps between the card and the list, in px. */
const CARD_GAP = 6;

/**
 * What jsdom reports for the hover card's own box while these tests run.
 *
 * jsdom measures every element as 0×0, and a card with no width can neither
 * run out of room on the right nor cover anything on the left — which is both
 * of the placements this suite is about. `G gantt-calendar-axis`'s sixteenth
 * fault is a measurement taken against something with no size; each test below
 * asserts this is non-zero before it believes an overlap.
 */
const CARD_WIDTH = 300;

/** How tall the stubbed card is. Only the placement's vertical clamp reads it. */
const CARD_HEIGHT = 90;

/**
 * jsdom's own measurement, restored after each test in this suite.
 *
 * Referenced unbound on purpose and called with `.call(this)` below: this is
 * the prototype method the stub stands in front of, and binding it to one
 * element would measure that element for every node asking.
 */
// eslint-disable-next-line @typescript-eslint/unbound-method -- see above; every call site supplies its own `this`.
const measureElement = HTMLElement.prototype.getBoundingClientRect;

/** jsdom's own window width, restored after each test in this suite. */
const WINDOW_WIDTH = window.innerWidth;

function resizeWindow(width: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
}

/**
 * Lays the open listbox out where a browser would put it, options inset.
 *
 * Returns the list's own edges, which is what the card is asserted against —
 * reading them back rather than restating the numbers keeps each assertion
 * about the relation rather than about two literals that happen to agree.
 */
function layOutPickerAt(box: { left: number; width: number }): { left: number; right: number } {
  const list = screen.getByRole('listbox', { name: 'Work packages' });
  list.getBoundingClientRect = () => new DOMRect(box.left, 0, box.width, 240);
  within(list)
    .getAllByRole('option')
    .forEach((option, index) => {
      option.getBoundingClientRect = () =>
        new DOMRect(
          box.left + OPTION_INSET,
          index * OPTION_ROW,
          box.width - 2 * OPTION_INSET,
          OPTION_ROW,
        );
    });
  return { left: box.left, right: box.left + box.width };
}

/** Rests the pointer on a work package's option, by the id the listbox gives it. */
function pointAt(id: string): void {
  const option = document.getElementById(`work-package-option-${id}`);
  if (option === null) throw new Error(`no option for ${id}`);
  fireEvent.mouseEnter(option);
}

/** Opens the picker on `workPackages` and waits for every one of them to be offered. */
async function openPickerOn(workPackages: WorkPackageListEntry[]): Promise<void> {
  pageWith(fakeWorkPackages(workPackages));
  await waitFor(() => {
    expect(screen.getByLabelText('Work package')).toBeDefined();
  });
  openPicker();
  await waitFor(() => {
    expect(optionNames().length).toBe(workPackages.length);
  });
}

describe('the card opens beside the list, not over it', () => {
  beforeEach(() => {
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      // The card alone: everything else keeps jsdom's zeroes, or the stubs
      // `layOutPickerAt` installs on the list and its options.
      if (this.getAttribute('role') === 'tooltip') {
        return new DOMRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
      }
      return measureElement.call(this);
    };
  });

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = measureElement;
    resizeWindow(WINDOW_WIDTH);
  });

  itDom('the open card leaves every option visible', async () => {
    await openPickerOn(THREE);
    const list = layOutPickerAt({ left: 40, width: 200 });

    pointAt('p2');

    const card = await screen.findByRole('tooltip', { name: 'Paint the fence' });
    const cardLeft = Number.parseFloat(card.style.left);
    // Or the card has no rectangle, covers nothing whatever it is placed over,
    // and every assertion under this one is green by default.
    expect(CARD_WIDTH, 'a card of no width cannot cover the list').toBeGreaterThan(0);
    expect(
      cardLeft,
      `the card opens at ${card.style.left} in a list ending at ${String(list.right)}`,
    ).toBeGreaterThanOrEqual(list.right);
    // And every option — the two being compared as much as the one being read
    // — ends before the card begins.
    const optionRights = within(screen.getByRole('listbox', { name: 'Work packages' }))
      .getAllByRole('option')
      .map((option) => option.getBoundingClientRect().right);
    expect(optionRights).toHaveLength(3);
    expect(Math.max(...optionRights)).toBeLessThanOrEqual(cardLeft);
  });

  itDom('a narrow window flips the card to the left of the list', async () => {
    await openPickerOn(TWO);
    resizeWindow(700);
    const list = layOutPickerAt({ left: 400, width: 200 });

    pointAt('p2');

    const card = await screen.findByRole('tooltip', { name: 'Paint the fence' });
    await waitFor(() => {
      expect(Number.parseFloat(card.style.left)).toBeLessThan(list.left);
    });
    expect(CARD_WIDTH, 'a card of no width cannot cover the list').toBeGreaterThan(0);
    // The whole card, not only its left edge: a clamp back into the viewport
    // would put its right edge over the list, which is the failure the flip
    // exists to avoid.
    const cardRight = Number.parseFloat(card.style.left) + CARD_WIDTH;
    expect(
      cardRight,
      `the flipped card ends at ${String(cardRight)}, over a list starting at ${String(list.left)}`,
    ).toBeLessThanOrEqual(list.left);
  });

  itDom('a window with room on neither side shows no card', async () => {
    await openPickerOn(TWO);
    resizeWindow(500);
    layOutPickerAt({ left: 100, width: 200 });

    pointAt('p2');

    // A card that must cover the list to exist has no claim on the space.
    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).toBeNull();
    });
  });

  itDom('moving down the list does not move the card sideways', async () => {
    await openPickerOn(THREE);
    const list = layOutPickerAt({ left: 40, width: 200 });

    pointAt('p1');
    const first = await screen.findByRole('tooltip', { name: 'Rewire the shed' });
    const firstPlacement = { left: first.style.left, top: first.style.top };

    pointAt('p3');

    const third = await screen.findByRole('tooltip', { name: 'Sand the floor' });
    // Sideways: unchanged, and at the **list's** edge rather than the option's
    // — the two are five pixels apart, which is what an anchor taken from the
    // option's own box would read instead.
    expect(third.style.left).toBe(firstPlacement.left);
    expect(third.style.left).toBe(`${String(list.right + CARD_GAP)}px`);
    // Vertically: it followed the pointer, or the assertion above is about a
    // card that never moved at all.
    expect(Number.parseFloat(third.style.top)).toBeGreaterThan(
      Number.parseFloat(firstPlacement.top),
    );
  });
});

describe('a pick leaves the picker at rest', () => {
  itDom('choosing a work package takes the focus off the picker', async () => {
    pageWith(fakeWorkPackages(TWO));
    await waitFor(() => {
      expect(screen.getByLabelText('Work package')).toBeDefined();
    });
    // A real focus, not a dispatched `focus` event: `document.activeElement`
    // is the whole claim here, and `fireEvent.focus` moves nothing at all —
    // the assertion below would then hold with the blur deleted, which is the
    // vacuous check this file exists to avoid.
    picker().focus();
    await waitFor(() => {
      expect(optionNames().length).toBe(2);
    });
    expect(document.activeElement, 'the picker never took the focus').toBe(picker());

    fireEvent.click(document.getElementById('work-package-option-p2')!);

    await waitFor(() => {
      expect(picker().value).toBe('Paint the fence');
    });
    // Nothing focuses an option — the list's mousedown is prevented so the
    // click can land — so without the blur the combobox keeps the keyboard,
    // showing the work package's name with a caret in it.
    expect(document.activeElement).not.toBe(picker());
  });

  itDom('choosing a work package arms no rename', async () => {
    pageWith(fakeWorkPackages(TWO));
    await selectWorkPackage('p2');

    await waitFor(() => {
      expect(picker().value).toBe('Paint the fence');
    });
    expect(screen.queryByLabelText('Work package name')).toBeNull();
    openWorkPackageActions();
    // The rename is reachable, and only through its own control.
    expect(screen.getByRole('button', { name: 'Rename work package' })).toBeDefined();
  });

  itDom('the picker still searches after a pick', async () => {
    pageWith(fakeWorkPackages(TWO));
    await selectWorkPackage('p2');
    await waitFor(() => {
      expect(picker().value).toBe('Paint the fence');
    });
    // At rest it is a label of what is open, which is what `readOnly` says.
    expect(picker().readOnly).toBe(true);

    picker().focus();

    // Scoped to the picker's own list: a selected work package renders the table,
    // and the table has options of its own.
    const offered = () =>
      within(screen.getByRole('listbox', { name: 'Work packages' }))
        .queryAllByRole('option')
        .map((entry) => entry.textContent);
    await waitFor(() => {
      expect(offered().length).toBe(2);
    });
    // And it is a search box again the moment it has the focus, in the same
    // commit that opened the list.
    expect(picker().readOnly).toBe(false);
    fireEvent.change(picker(), { target: { value: 'FENCE' } });
    expect(offered()).toEqual([`Paint the fence (${THIS_JUNE} · strip)`]);
    expect(picker().value).toBe('FENCE');
  });
});

describe('a new work package opens with its name ready to be typed', () => {
  itDom('creating a work package puts the caret in its name', async () => {
    const api = fakeWorkPackages(TWO);
    pageWith(api);
    await waitFor(() => {
      expect(screen.getByLabelText('Work package')).toBeDefined();
    });

    await chooseFixtureProject();
    openWorkPackageActions();
    fireEvent.click(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Create new work package' }),
    );

    const name = await screen.findByLabelText<HTMLInputElement>('Work package name');
    expect(name.value).toBe('New work package');
    expect(document.activeElement).toBe(name);
    // And it was selected and opened, which is what sorts the picker next
    // time — both are driven by the selection, so a create that failed to
    // select would record nothing.
    // Proof: removing markOpened from the selection effect failed this awaited assertion.
    await waitFor(() => {
      expect(api.opened).toContain('p3');
      expect(localStorage.getItem('wbs.workPackage')).toBe('p3');
    });
  });

  itDom('does not put the whole draft back under the next keystroke', async () => {
    pageWith(fakeWorkPackages(TWO));
    await waitFor(() => {
      expect(screen.getByLabelText('Work package')).toBeDefined();
    });
    await chooseFixtureProject();
    openWorkPackageActions();
    fireEvent.click(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Create new work package' }),
    );
    const name = await screen.findByLabelText<HTMLInputElement>('Work package name');

    fireEvent.change(name, { target: { value: 'A' } });

    // The selection is armed once, when the rename is armed — not on every
    // render. Re-selected after each keystroke, the second character typed
    // would replace the first and the field could never hold two.
    expect([name.selectionStart, name.selectionEnd]).toEqual([1, 1]);
  });

  itDom('creating a work package selects the whole placeholder name', async () => {
    pageWith(fakeWorkPackages(TWO));
    await waitFor(() => {
      expect(screen.getByLabelText('Work package')).toBeDefined();
    });

    await chooseFixtureProject();
    openWorkPackageActions();
    fireEvent.click(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Create new work package' }),
    );

    const name = await screen.findByLabelText<HTMLInputElement>('Work package name');
    // Selected rather than emptied: `commitOrCancelRename` reads an empty
    // draft as a cancel, so an empty box would answer Enter with a work package
    // still called `New workPackage` and no explanation. Selected, the first
    // keystroke replaces it and an untouched Enter is a no-op rename.
    expect([name.selectionStart, name.selectionEnd]).toEqual([0, 'New work package'.length]);
  });

  itDom('arms the rename only once the list can name the new work package', async () => {
    const api = fakeWorkPackages(TWO);
    const listWorkPackages = api.listWorkPackages.bind(api);
    let releaseList: () => void = () => undefined;
    let listCalls = 0;
    // The page's own first load answers at once; the create's reload is held,
    // which is the window the fault lives in. Armed before `await load()`, the
    // name field is on screen for a work package the picker cannot yet name — and
    // an Enter there compares the draft against no current name at all and
    // sends a rename for the name the row already has.
    api.listWorkPackages = async () => {
      listCalls += 1;
      if (listCalls > 1) {
        await new Promise<void>((resolve) => {
          releaseList = resolve;
        });
      }
      return listWorkPackages();
    };
    pageWith(api);
    await waitFor(() => {
      expect(screen.getByLabelText('Work package')).toBeDefined();
    });

    await chooseFixtureProject();
    openWorkPackageActions();
    fireEvent.click(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Create new work package' }),
    );

    await waitFor(() => {
      expect(listCalls).toBe(2);
    });
    expect(screen.queryByLabelText('Work package name')).toBeNull();

    releaseList();

    expect(await screen.findByLabelText<HTMLInputElement>('Work package name')).toBeDefined();
  });

  itDom('a draft armed for another work package does not follow the create', async () => {
    const api = fakeWorkPackages(TWO);
    const createWorkPackage = api.createWorkPackage.bind(api);
    let releaseCreate: () => void = () => undefined;
    api.createWorkPackage = async (projectId, name) => {
      await new Promise<void>((resolve) => {
        releaseCreate = resolve;
      });
      return createWorkPackage(projectId, name);
    };
    pageWith(api);
    await selectWorkPackage('p2');
    openWorkPackageActions();
    fireEvent.click(screen.getByRole('button', { name: 'Rename work package' }));
    fireEvent.change(screen.getByLabelText('Work package name'), {
      target: { value: 'Meant for p2' },
    });

    await chooseFixtureProject();
    openWorkPackageActions();
    fireEvent.click(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Create new work package' }),
    );

    // Asserted in the window the fault lives in: with the create held, a draft
    // that was not cancelled is still on screen and still aimed at p2. Once
    // the create resolves the re-arm would overwrite it either way, so the
    // final state cannot see this at all.
    await waitFor(() => {
      expect(releaseCreate).not.toBeNull();
    });
    expect(
      screen.queryByLabelText<HTMLInputElement>('Work package name')?.value ?? null,
    ).toBeNull();

    releaseCreate();

    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('Work package name').value).toBe(
        'New work package',
      );
    });
    // Nothing was renamed, and p2 still holds the name it had.
    expect(api.renamed).toEqual([]);
    fireEvent.keyDown(screen.getByLabelText('Work package name'), { key: 'Escape' });
    openPicker();
    await waitFor(() => {
      expect(optionNames()).toContain(`Paint the fence (${THIS_JUNE} · strip)`);
    });
  });

  itDom('abandoning the new work package’s rename keeps the work package', async () => {
    const api = fakeWorkPackages(TWO);
    pageWith(api);
    await waitFor(() => {
      expect(screen.getByLabelText('Work package')).toBeDefined();
    });
    await chooseFixtureProject();
    openWorkPackageActions();
    fireEvent.click(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Create new work package' }),
    );
    const name = await screen.findByLabelText<HTMLInputElement>('Work package name');

    fireEvent.keyDown(name, { key: 'Escape' });

    // The work package was created before the rename was ever offered; nothing is
    // rolled back, and it is still the one that is open.
    expect(api.renamed).toEqual([]);
    expect(picker().value).toBe('New work package');
    openPicker();
    await waitFor(() => {
      expect(optionNames()).toContain(`New work package (${THIS_JUNE} · kat)`);
    });
  });
});

itDom('resumes the table subscription from its covered positive anchor', async () => {
  const sent: string[] = [];
  class Socket extends EventTarget {
    constructor() {
      super();
      queueMicrotask(() => {
        this.dispatchEvent(new Event('open'));
      });
    }
    send(frame: string) {
      sent.push(frame);
    }
    close() {
      /* The page's cleanup has already stopped its stream. */
    }
  }
  vi.stubGlobal('WebSocket', Socket);
  try {
    const api = fakeWorkPackages(TWO);
    api.tree = () => Promise.resolve(planRead({ seq: 7 }));
    pageWith(api);
    await selectWorkPackage('p2');
    await waitFor(() => {
      expect(sent.some((frame) => (JSON.parse(frame) as { type: string }).type === 'resume')).toBe(
        true,
      );
    });
    const frames = sent.map(
      (frame) => JSON.parse(frame) as { type: string; resume_points?: Record<string, number> },
    );
    expect(frames.find((frame) => frame.type === 'resume')?.resume_points).toEqual({
      'work-package:p2': 7,
    });
  } finally {
    cleanup();
    vi.unstubAllGlobals();
  }
});

it.each(['resume_denied', 'resume_ack'] as const)(
  'recovers a persistent %s without replacing the registered socket',
  async (refusal) => {
    const sockets: Socket[] = [];
    class Socket extends EventTarget {
      sent: string[] = [];
      constructor() {
        super();
        sockets.push(this);
        queueMicrotask(() => {
          this.dispatchEvent(new Event('open'));
        });
      }
      send(frame: string) {
        this.sent.push(frame);
      }
      close() {
        /* Tests deliver close explicitly to model delayed browser callbacks. */
      }
      refuse() {
        this.dispatchEvent(
          new MessageEvent('message', {
            data: JSON.stringify(
              refusal === 'resume_denied'
                ? { type: refusal, subscription: 'work-package:p2', reason: 'unavailable' }
                : { type: refusal, replayed: {} },
            ),
          }),
        );
      }
    }
    vi.stubGlobal('WebSocket', Socket);
    try {
      let reads = 0;
      const api = fakeWorkPackages(TWO);
      api.tree = () => {
        reads += 1;
        return Promise.resolve(planRead({ seq: reads === 1 ? 0 : 7 }));
      };
      pageWith(api);
      await selectWorkPackage('p2');
      await waitFor(() => {
        expect(sockets).toHaveLength(1);
      });
      await act(async () => {
        sockets[0].refuse();
        await Promise.resolve();
      });
      expect(reads).toBe(2);
      expect(sockets).toHaveLength(1);
      expect(
        sockets[0].sent.filter(
          (frame) => (JSON.parse(frame) as { type: string }).type === 'resume',
        ),
      ).toHaveLength(1);

      // A real departure may recover again, using the completed anchored read.
      act(() => {
        sockets[0].dispatchEvent(new Event('close'));
      });
      await waitFor(() => {
        expect(sockets).toHaveLength(2);
      });
      const resumes = sockets[1].sent.map(
        (frame) => JSON.parse(frame) as { type: string; resume_points?: Record<string, number> },
      );
      expect(resumes.find((frame) => frame.type === 'resume')?.resume_points).toEqual({
        'work-package:p2': 7,
      });
      await act(async () => {
        sockets[1].refuse();
        await Promise.resolve();
      });
      expect(reads).toBe(3);
      expect(sockets).toHaveLength(2);
    } finally {
      cleanup();
      vi.unstubAllGlobals();
    }
  },
);

describe('work package settings abbreviation through the real page and table', () => {
  itDom(
    'refreshes the selected catalog entry after a canonical abbreviation edit without changing identity',
    async () => {
      const api = fakeWorkPackages(
        TWO.map((workPackage, at) => ({
          ...workPackage,
          abbreviation: at === 0 ? 'SHED' : 'FENCE',
        })),
      );
      const writes = recordCalls(api, 'setAbbreviation');
      pageWith(api);
      await selectWorkPackage('p1');
      fireEvent.click(await screen.findByRole('button', { name: 'Work package settings' }));
      fireEvent.click(screen.getByRole('tab', { name: 'General' }));
      const field = screen.getByRole('textbox', { name: 'Work package abbreviation' });
      expect(field).toHaveValue('SHED');
      fireEvent.change(field, { target: { value: 'shed2-main_core12345' } });
      fireEvent.keyDown(field, { key: 'Enter' });
      await waitFor(() => expect(field).toHaveValue('SHED2-MAIN_CORE12345'));
      expect(writes).toEqual([['p1', 'shed2-main_core12345']]);
      expect(
        (await api.listWorkPackages()).find((workPackage) => workPackage.id === 'p1'),
      ).toMatchObject({
        id: 'p1',
        name: 'Rewire the shed',
        abbreviation: 'SHED2-MAIN_CORE12345',
      });
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Work package settings' }));
      expect(screen.getByRole('textbox', { name: 'Work package abbreviation' })).toHaveValue(
        'SHED2-MAIN_CORE12345',
      );
    },
  );
});

itDom(
  'an occupied abbreviation stays visible in real page settings without changing work package identity',
  async () => {
    const api = fakeWorkPackages(
      TWO.map((workPackage, at) => ({ ...workPackage, abbreviation: at === 0 ? 'SHED' : 'FENCE' })),
    );
    pageWith(api);
    await selectWorkPackage('p1');
    fireEvent.click(await screen.findByRole('button', { name: 'Work package settings' }));
    fireEvent.click(screen.getByRole('tab', { name: 'General' }));
    const field = screen.getByRole('textbox', { name: 'Work package abbreviation' });
    fireEvent.change(field, { target: { value: 'fence' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('already uses');
    });
    expect(field).toHaveValue('fence');
    expect(
      (await api.listWorkPackages()).find((workPackage) => workPackage.id === 'p1'),
    ).toMatchObject({
      id: 'p1',
      name: 'Rewire the shed',
      abbreviation: 'SHED',
    });
  },
);

for (const baseline of [-1, 7]) {
  itDom(
    'uses covered ' + String(baseline) + ' current anchor beside obsolete stored project cursor',
    async () => {
      const key = 'wbs:realtime:last-seq',
        previous = localStorage.getItem(key),
        old = JSON.stringify({ 'project:p2': 0 });
      localStorage.setItem(key, old);
      const sent: string[] = [];
      class Socket extends EventTarget {
        constructor() {
          super();
          queueMicrotask(() => this.dispatchEvent(new Event('open')));
        }
        send(frame: string) {
          sent.push(frame);
        }
        close() {
          /* The owner stops its stream before closing the fixture socket. */
        }
      }
      vi.stubGlobal('WebSocket', Socket);
      try {
        const api = fakeWorkPackages(TWO);
        api.tree = () => Promise.resolve(planRead({ seq: baseline }));
        pageWith(api);
        await selectWorkPackage('p2');
        await waitFor(() => {
          expect(
            sent.some((frame) => (JSON.parse(frame) as { type: string }).type === 'resume'),
          ).toBe(true);
        });
        const frames = sent.map(
          (frame) =>
            JSON.parse(frame) as {
              type: string;
              subscription?: string;
              resume_points?: Record<string, number>;
            },
        );
        expect(
          frames.filter((frame) => frame.type === 'subscribe').map((frame) => frame.subscription),
        ).toEqual(['work-package:p2']);
        expect(
          frames.filter((frame) => frame.type === 'resume').map((frame) => frame.resume_points),
        ).toEqual([{ 'work-package:p2': baseline }]);
        expect(localStorage.getItem(key)).toBe(old);
      } finally {
        cleanup();
        if (previous === null) localStorage.removeItem(key);
        else localStorage.setItem(key, previous);
        vi.unstubAllGlobals();
      }
    },
  );
}

describe('required project destination', () => {
  itDom(
    'does not select the sole project automatically and disables both create controls',
    async () => {
      const api = fakeWorkPackages(TWO);
      pageWith(api);
      await screen.findByRole('combobox', { name: 'Work package' });
      openWorkPackageActions();
      for (const action of screen.getAllByRole('button', { name: 'Create new work package' }))
        expect(action).toBeDisabled();
      openWorkPackageActions();
      await screen.findByRole('option', { name: 'Fixture project' });
      openWorkPackageActions();
      const destination = screen.queryByRole('combobox', { name: 'Destination project' });
      expect(destination).not.toBeNull();
      expect(destination).toHaveValue('');
      openWorkPackageActions();
      await screen.findByRole('option', { name: 'Fixture project' });
      expect(destination).toHaveValue('');
    },
  );

  itDom(
    'sends the explicitly selected destination and preserves the armed rename sequence',
    async () => {
      const api = fakeWorkPackages(TWO);
      const original = api.createWorkPackage.bind(api);
      const creation = vi.fn((projectId: string, name: string) => original(projectId, name));
      api.createWorkPackage = creation;
      pageWith(api);
      await screen.findByRole('combobox', { name: 'Work package' });
      openWorkPackageActions();
      await screen.findByRole('option', { name: 'Fixture project' });
      openWorkPackageActions();
      const destination = screen.queryByRole('combobox', { name: 'Destination project' });
      expect(destination).not.toBeNull();
      if (destination === null) throw new Error('required destination picker absent');
      fireEvent.change(destination, { target: { value: 'fixture-project' } });
      openWorkPackageActions();
      const action = within(screen.getByRole('banner')).getByRole('button', {
        name: 'Create new work package',
      });
      fireEvent.click(action);
      await screen.findByLabelText('Work package name');
      expect(creation).toHaveBeenCalledExactlyOnceWith('fixture-project', 'New work package');
    },
  );

  itDom('disables the empty-home import control without a selected destination', async () => {
    pageWith(fakeWorkPackages([]));
    const home = await screen.findByRole('region', { name: 'No work package open' });
    expect(within(home).getByLabelText('Import JSON')).toBeDisabled();
    expect(within(home).getByRole('button', { name: 'Create new work package' })).toBeDisabled();
  });

  itDom('keeps package navigation usable when project choices fail', async () => {
    const api = fakeWorkPackages(TWO);
    api.listProjects = () => Promise.reject(new Error('project choices unavailable'));
    pageWith(api);
    await selectWorkPackage('p1');
    expect(screen.getByRole('combobox', { name: 'Work package' })).toHaveValue('Rewire the shed');
    openWorkPackageActions();
    expect(await screen.findByText('Projects could not be loaded. Try again.')).toBeVisible();
    openWorkPackageActions();
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Create new work package' }),
    ).toBeDisabled();
  });
});

describe('required project lifetime', () => {
  async function chooseDestination() {
    openWorkPackageActions();
    await screen.findByRole('option', { name: 'Fixture project' });
    openWorkPackageActions();
    fireEvent.change(screen.getByRole('combobox', { name: 'Destination project' }), {
      target: { value: 'fixture-project' },
    });
  }

  itDom(
    'discards a departed create response before preferences, reload or rename publication',
    async () => {
      const first = fakeWorkPackages(TWO);
      const birth = first.createWorkPackage.bind(first);
      let finish: () => void = () => {
        throw new Error('creation was not dispatched');
      };
      first.createWorkPackage = (parent, name) =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }).then(() => birth(parent, name));
      const oldList = vi.fn(first.listWorkPackages.bind(first));
      first.listWorkPackages = oldList;
      const view = pageWith(first);
      await chooseDestination();
      openWorkPackageActions();
      fireEvent.click(
        within(screen.getByRole('banner')).getByRole('button', { name: 'Create new work package' }),
      );
      const replacement = fakeWorkPackages(TWO);
      view.rerender(
        <WorkPackagePageOverOwner api={replacement} savedPlanRoutes={fakeSavedPlanRoutes()} />,
      );
      openWorkPackageActions();
      await screen.findByRole('option', { name: 'Fixture project' });
      await act(async () => {
        finish();
        await Promise.resolve();
      });
      expect(oldList).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('wbs.workPackage')).toBeNull();
      expect(screen.queryByLabelText('Work package name')).toBeNull();
      expect(await first.listWorkPackages()).toHaveLength(3);
    },
  );

  itDom(
    'discards an old create reload before replacing the new list or arming rename',
    async () => {
      const first = fakeWorkPackages(TWO);
      const actualList = first.listWorkPackages.bind(first);
      let finish: (rows: WorkPackageListEntry[]) => void = (_rows: WorkPackageListEntry[]) => {
        throw new Error('creation reload was not dispatched');
      };
      const oldList = vi
        .fn(actualList)
        .mockImplementationOnce(actualList)
        .mockImplementationOnce(
          () =>
            new Promise<WorkPackageListEntry[]>((resolve) => {
              finish = resolve;
            }),
        );
      first.listWorkPackages = oldList;
      const view = pageWith(first);
      await chooseDestination();
      openWorkPackageActions();
      fireEvent.click(
        within(screen.getByRole('banner')).getByRole('button', { name: 'Create new work package' }),
      );
      await waitFor(() => {
        expect(oldList).toHaveBeenCalledTimes(2);
      });
      const replacement = fakeWorkPackages(
        THREE.map((entry) =>
          entry.id === 'p3' ? { ...entry, name: 'Replacement package' } : entry,
        ),
      );
      view.rerender(
        <WorkPackagePageOverOwner api={replacement} savedPlanRoutes={fakeSavedPlanRoutes()} />,
      );
      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: 'Work package' })).toHaveValue(
          'Replacement package',
        );
      });
      await act(async () => {
        finish(await actualList());
        await Promise.resolve();
      });
      expect(screen.queryByLabelText('Work package name')).toBeNull();
      expect(screen.getByRole('combobox', { name: 'Work package' })).toHaveValue(
        'Replacement package',
      );
      expect(localStorage.getItem('wbs.workPackage')).toBe('p3');
    },
  );

  itDom('discards a departed create rejection instead of publishing its error', async () => {
    const first = fakeWorkPackages(TWO);
    let reject: (cause: Error) => void = (_cause: Error) => {
      throw new Error('creation was not dispatched');
    };
    first.createWorkPackage = () =>
      new Promise<CreatedWorkPackage>((_resolve, refuse) => {
        reject = refuse;
      });
    const view = pageWith(first);
    await chooseDestination();
    openWorkPackageActions();
    fireEvent.click(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Create new work package' }),
    );
    view.rerender(
      <WorkPackagePageOverOwner
        api={fakeWorkPackages(TWO)}
        savedPlanRoutes={fakeSavedPlanRoutes()}
      />,
    );
    openWorkPackageActions();
    await screen.findByRole('option', { name: 'Fixture project' });
    await act(async () => {
      reject(new Error('departed create failed'));
      await Promise.resolve();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  itDom.each(['success', 'failure'] as const)(
    'discards delayed project-list %s across same-ID catalog replacement',
    async (completion) => {
      const first = fakeWorkPackages(TWO);
      const projects = await first.listProjects();
      let finish: (rows: typeof projects) => void = (_rows: typeof projects) => {
        throw new Error('project list was not dispatched');
      };
      let reject: (cause: Error) => void = (_cause: Error) => {
        throw new Error('project list was not dispatched');
      };
      first.listProjects = () =>
        new Promise((resolve, refuse) => {
          finish = resolve;
          reject = refuse;
        });
      const view = pageWith(first);
      openWorkPackageActions();
      await screen.findByText('Loading projects…');
      const replacement = fakeWorkPackages(TWO);
      replacement.listProjects = () =>
        Promise.resolve(projects.map((project) => ({ ...project, name: 'Current project' })));
      view.rerender(
        <WorkPackagePageOverOwner api={replacement} savedPlanRoutes={fakeSavedPlanRoutes()} />,
      );
      openWorkPackageActions();
      await screen.findByRole('option', { name: 'Current project' });
      await act(async () => {
        if (completion === 'success') finish(projects);
        else reject(new Error('old project lookup failed'));
        await Promise.resolve();
      });
      openWorkPackageActions();
      expect(screen.queryByRole('option', { name: 'Fixture project' })).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      openWorkPackageActions();
      expect(screen.getByRole('combobox', { name: 'Destination project' })).toHaveValue('');
      openWorkPackageActions();
      expect(
        within(screen.getByRole('banner')).getByRole('button', { name: 'Create new work package' }),
      ).toBeDisabled();
    },
  );
});

describe('destination membership after catalog refresh', () => {
  itDom('clears the chosen destination when a fresh project list omits it', async () => {
    const api = fakeWorkPackages(TWO);
    const creation = vi.fn(api.createWorkPackage.bind(api));
    api.createWorkPackage = creation;
    pageWith(api);
    await chooseFixtureProject();
    api.listProjects = () => Promise.resolve([]);
    openWorkPackageActions();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh projects' }));
    openWorkPackageActions();
    await screen.findByText(/No projects are available to you/);
    openWorkPackageActions();
    const action = within(screen.getByRole('banner')).getByRole('button', {
      name: 'Create new work package',
    });
    expect(action).toBeDisabled();
    fireEvent.click(action);
    expect(creation).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Work package' })).toHaveValue('');
  });

  itDom('does not carry a selected same-ID destination into the replacement catalog', async () => {
    const view = pageWith(fakeWorkPackages(TWO));
    await chooseFixtureProject();
    const replacement = fakeWorkPackages(TWO);
    const projects = await replacement.listProjects();
    let finish: (rows: typeof projects) => void = (_projects: typeof projects) => {
      throw new Error('replacement lookup not dispatched');
    };
    replacement.listProjects = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    view.rerender(
      <WorkPackagePageOverOwner api={replacement} savedPlanRoutes={fakeSavedPlanRoutes()} />,
    );
    openWorkPackageActions();
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Create new work package' }),
    ).toBeDisabled();
    openWorkPackageActions();
    expect(screen.queryByRole('combobox', { name: 'Destination project' })).toBeNull();
    await act(async () => {
      finish(projects);
      await Promise.resolve();
    });
    openWorkPackageActions();
    expect(screen.getByRole('combobox', { name: 'Destination project' })).toHaveValue('');
    openWorkPackageActions();
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Create new work package' }),
    ).toBeDisabled();
  });
});

async function emptyCombinedCatalog() {
  const api = fakeWorkPackageApi();
  const readProjects = api.listProjects.bind(api);
  const readPackages = api.listWorkPackages.bind(api);
  // This UI cohort deliberately omits the fake's named initial metadata;
  // later rows still come from its actual recorded combined-creation pairs.
  const seededProjects = new Set((await readProjects()).map((project) => project.id));
  const seededPackages = new Set((await readPackages()).map((workPackage) => workPackage.id));
  api.listProjects = () =>
    readProjects().then((projects) =>
      projects.filter((project) => !seededProjects.has(project.id)),
    );
  api.listWorkPackages = () =>
    readPackages().then((packages) =>
      packages.filter((workPackage) => !seededPackages.has(workPackage.id)),
    );
  const create = vi.fn(api.createProjectWithWorkPackage.bind(api));
  const standalone = vi.fn(api.createWorkPackage.bind(api));
  const rename = vi.fn(api.renameWorkPackage.bind(api));
  api.createProjectWithWorkPackage = create;
  api.createWorkPackage = standalone;
  api.renameWorkPackage = rename;
  return { api, create, standalone, rename };
}

describe('named project and first package creation', () => {
  itDom(
    'creates from an empty project catalog and selects the exact named committed pair',
    async () => {
      const fixture = await emptyCombinedCatalog();
      pageWith(fixture.api);
      openWorkPackageActions();
      await screen.findByText(/No projects are available to you/);
      openWorkPackageActions();
      expect(
        within(screen.getByRole('banner')).getByRole('button', { name: 'Create new work package' }),
      ).toBeDisabled();
      openWorkPackageActions();
      fireEvent.click(screen.getByRole('button', { name: 'New project' }));
      const dialog = await screen.findByRole('dialog', { name: 'New project' });
      fireEvent.change(within(dialog).getByRole('textbox', { name: 'Project name' }), {
        target: { value: 'WBS product' },
      });
      fireEvent.change(within(dialog).getByRole('textbox', { name: 'First work package name' }), {
        target: { value: 'Editor' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: 'Work package' })).toHaveValue('Editor');
      });
      expect(fixture.create).toHaveBeenCalledExactlyOnceWith('WBS product', 'Editor');
      expect(fixture.standalone).not.toHaveBeenCalled();
      expect(fixture.rename).not.toHaveBeenCalled();
      const projects = await fixture.api.listProjects();
      const packages = await fixture.api.listWorkPackages();
      expect(projects).toHaveLength(1);
      expect(packages).toHaveLength(1);
      const createdProject = projects.at(0);
      const createdPackage = packages.at(0);
      if (createdProject === undefined || createdPackage === undefined)
        throw new Error('Expected both actual recorded creation rows');
      expect(createdProject.name).toBe('WBS product');
      expect(createdPackage.name).toBe('Editor');
      expect(createdPackage.projectId).toBe(createdProject.id);
      openWorkPackageActions();
      expect(screen.getByRole('combobox', { name: 'Destination project' })).toHaveValue(
        createdProject.id,
      );
      expect(localStorage.getItem('wbs.workPackage')).toBe(createdPackage.id);
      expect(screen.queryByLabelText('Work package name')).toBeNull();
      expect(screen.queryByRole('dialog', { name: 'New project' })).toBeNull();
    },
  );

  itDom('cancels before sending and never supplies blank or placeholder names', async () => {
    const fixture = await emptyCombinedCatalog();
    pageWith(fixture.api);
    openWorkPackageActions();
    await screen.findByText(/No projects are available to you/);
    openWorkPackageActions();
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    const submit = within(dialog).getByRole('button', { name: 'Create project' });
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Project name' }), {
      target: { value: '   ' },
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'First work package name' }), {
      target: { value: 'Editor' },
    });
    expect(submit).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'New project' })).toBeNull();
    });
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.standalone).not.toHaveBeenCalled();
    expect(await fixture.api.listProjects()).toEqual([]);
    expect(await fixture.api.listWorkPackages()).toEqual([]);
  });
});

function holdCombinedAnswer<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('held resolver is not initialized');
  };
  let reject: (cause: unknown) => void = () => {
    throw new Error('held rejection is not initialized');
  };
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

async function submitNamedPair(projectName = 'WBS product', workPackageName = 'Editor') {
  openWorkPackageActions();
  fireEvent.click(screen.getByRole('button', { name: 'New project' }));
  const dialog = await screen.findByRole('dialog', { name: 'New project' });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Project name' }), {
    target: { value: projectName },
  });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'First work package name' }), {
    target: { value: workPackageName },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
}

async function expectNamedPairSelected() {
  await waitFor(() => {
    expect(picker()).toHaveValue('Editor');
    expect(screen.queryByRole('dialog', { name: 'New project' })).toBeNull();
  });
  expect(localStorage.getItem('wbs.workPackage')).toBe('fake-package-1');
  openWorkPackageActions();
  expect(screen.getByRole('combobox', { name: 'Destination project' })).toHaveValue(
    'fake-project-1',
  );
  expect(screen.queryByLabelText('Work package name')).toBeNull();
}

describe('combined project publication lifetime', () => {
  for (const failingRead of ['projects', 'packages'] as const) {
    itDom(
      `retains the known committed pair after ${failingRead} refresh failure and retries GET only`,
      async () => {
        const fixture = await emptyCombinedCatalog();
        const projects = vi.fn(fixture.api.listProjects.bind(fixture.api));
        const packages = vi.fn(fixture.api.listWorkPackages.bind(fixture.api));
        fixture.api.listProjects = projects;
        fixture.api.listWorkPackages = packages;
        pageWith(fixture.api);
        openWorkPackageActions();
        await screen.findByText(/No projects are available to you/);
        await waitFor(() => {
          expect(packages).toHaveBeenCalledTimes(1);
        });
        if (failingRead === 'projects') projects.mockRejectedValueOnce(new Error('offline'));
        else packages.mockRejectedValueOnce(new Error('offline'));
        await submitNamedPair();
        const dialog = await screen.findByRole('dialog', { name: 'New project' });
        const retry = await within(dialog).findByRole('button', { name: 'Retry refresh' });
        expect(within(dialog).queryByRole('button', { name: 'Create project' })).toBeNull();
        expect(fixture.create).toHaveBeenCalledTimes(1);
        fireEvent.click(retry);
        await expectNamedPairSelected();
        expect(fixture.create).toHaveBeenCalledTimes(1);
        expect(fixture.standalone).not.toHaveBeenCalled();
        expect(projects).toHaveBeenCalledTimes(3);
        expect(packages).toHaveBeenCalledTimes(failingRead === 'projects' ? 2 : 3);
      },
    );
  }

  itDom(
    'keeps the committed but unavailable pair distinct and retries without another POST',
    async () => {
      const fixture = await emptyCombinedCatalog();
      const readPackages = fixture.api.listWorkPackages.bind(fixture.api);
      const packages = vi.fn(readPackages);
      fixture.api.listWorkPackages = packages;
      pageWith(fixture.api);
      openWorkPackageActions();
      await screen.findByText(/No projects are available to you/);
      await waitFor(() => {
        expect(packages).toHaveBeenCalledTimes(1);
      });
      packages.mockResolvedValueOnce([]);
      await submitNamedPair();
      const dialog = await screen.findByRole('dialog', { name: 'New project' });
      const retry = await within(dialog).findByRole('button', { name: 'Retry refresh' });
      expect(picker()).toHaveValue('');
      expect(localStorage.getItem('wbs.workPackage')).toBeNull();
      expect(fixture.create).toHaveBeenCalledTimes(1);
      fireEvent.click(retry);
      await expectNamedPairSelected();
      expect(fixture.create).toHaveBeenCalledTimes(1);
      expect(packages).toHaveBeenCalledTimes(3);
    },
  );

  itDom('does not repeat an unconfirmed write or label its outcome as rolled back', async () => {
    const fixture = await emptyCombinedCatalog();
    fixture.create.mockRejectedValueOnce(new Error('connection ended before a reply'));
    pageWith(fixture.api);
    openWorkPackageActions();
    await screen.findByText(/No projects are available to you/);
    await submitNamedPair();
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    await within(dialog).findByText(/could not be confirmed/i);
    expect(within(dialog).queryByRole('button', { name: 'Create project' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Retry refresh' })).toBeNull();
    expect(within(dialog).getByRole('textbox', { name: 'Project name' })).toHaveValue(
      'WBS product',
    );
    expect(within(dialog).getByRole('textbox', { name: 'First work package name' })).toHaveValue(
      'Editor',
    );
    expect(fixture.create).toHaveBeenCalledTimes(1);
    expect(fixture.standalone).not.toHaveBeenCalled();
  });

  for (const readKind of ['projects', 'packages'] as const) {
    for (const settlement of ['success', 'failure'] as const) {
      itDom(
        `withdraws an older same-catalog ${readKind} ${settlement} without an epoch-triggered reload`,
        async () => {
          const fixture = await emptyCombinedCatalog();
          const readProjects = fixture.api.listProjects.bind(fixture.api);
          const readPackages = fixture.api.listWorkPackages.bind(fixture.api);
          const oldProjects = holdCombinedAnswer<Awaited<ReturnType<typeof readProjects>>>();
          const oldPackages = holdCombinedAnswer<WorkPackageListEntry[]>();
          const projects = vi.fn(readProjects);
          const packages = vi.fn(readPackages);
          if (readKind === 'projects') projects.mockImplementationOnce(() => oldProjects.promise);
          else packages.mockImplementationOnce(() => oldPackages.promise);
          fixture.api.listProjects = projects;
          fixture.api.listWorkPackages = packages;
          pageWith(fixture.api);
          await waitFor(() => {
            expect(projects).toHaveBeenCalledTimes(1);
            expect(packages).toHaveBeenCalledTimes(1);
          });
          await submitNamedPair();
          await expectNamedPairSelected();
          await act(async () => {
            if (readKind === 'projects') {
              if (settlement === 'success') oldProjects.resolve([]);
              else oldProjects.reject(new Error('old projects unavailable'));
            } else {
              if (settlement === 'success') oldPackages.resolve([]);
              else oldPackages.reject(new Error('old packages unavailable'));
            }
            await Promise.resolve();
          });
          await expectNamedPairSelected();
          expect(screen.queryByRole('alert')).toBeNull();
          expect(projects).toHaveBeenCalledTimes(2);
          expect(packages).toHaveBeenCalledTimes(2);
        },
      );
    }
  }

  for (const settlement of ['success', 'failure'] as const) {
    itDom(
      `withdraws an older standalone create ${settlement} before reload or local publication`,
      async () => {
        const api = fakeWorkPackageApi();
        const oldCreate = holdCombinedAnswer<CreatedWorkPackage>();
        const standalone = vi.fn(() => oldCreate.promise);
        api.createWorkPackage = standalone;
        const packages = vi.fn(api.listWorkPackages.bind(api));
        api.listWorkPackages = packages;
        pageWith(api);
        await chooseFixtureProject();
        openWorkPackageActions();
        fireEvent.click(
          within(screen.getByRole('banner')).getByRole('button', {
            name: 'Create new work package',
          }),
        );
        expect(standalone).toHaveBeenCalledTimes(1);
        await submitNamedPair();
        await expectNamedPairSelected();
        await act(async () => {
          if (settlement === 'failure') oldCreate.reject(new Error('old create failed'));
          else
            oldCreate.resolve({
              id: 'old-created-package',
              projectId: 'fixture-project',
              name: 'New work package',
              restricted: false,
              abbreviation: 'OLD',
            });
          await Promise.resolve();
        });
        await expectNamedPairSelected();
        expect(packages).toHaveBeenCalledTimes(2);
        expect(screen.queryByRole('alert')).toBeNull();
      },
    );
  }

  itDom('withdraws an older standalone create reload before it can arm rename', async () => {
    const api = fakeWorkPackageApi();
    api.createWorkPackage = () =>
      Promise.resolve({
        id: 'old-created-package',
        projectId: 'fixture-project',
        name: 'New work package',
        restricted: false,
        abbreviation: 'OLD',
      });
    const oldReload = holdCombinedAnswer<WorkPackageListEntry[]>();
    const packages = vi.fn(api.listWorkPackages.bind(api));
    packages
      .mockImplementationOnce(api.listWorkPackages.bind(api))
      .mockImplementationOnce(() => oldReload.promise);
    api.listWorkPackages = packages;
    pageWith(api);
    await chooseFixtureProject();
    openWorkPackageActions();
    fireEvent.click(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Create new work package' }),
    );
    await waitFor(() => {
      expect(packages).toHaveBeenCalledTimes(2);
    });
    await submitNamedPair();
    await expectNamedPairSelected();
    await act(async () => {
      oldReload.resolve([]);
      await Promise.resolve();
    });
    await expectNamedPairSelected();
    expect(packages).toHaveBeenCalledTimes(3);
  });

  for (const settlement of ['success', 'failure'] as const) {
    itDom(
      `withdraws an older rename ${settlement} before reload or error publication`,
      async () => {
        const api = fakeWorkPackageApi();
        const oldRename = holdCombinedAnswer<undefined>();
        api.renameWorkPackage = () => oldRename.promise;
        const packages = vi.fn(api.listWorkPackages.bind(api));
        api.listWorkPackages = packages;
        pageWith(api);
        await chooseFixtureProject();
        openWorkPackageActions();
        await screen.findByRole('button', { name: 'Rename work package' });
        openWorkPackageActions();
        fireEvent.click(screen.getByRole('button', { name: 'Rename work package' }));
        const name = screen.getByRole('textbox', { name: 'Work package name' });
        fireEvent.change(name, { target: { value: 'Old pending rename' } });
        fireEvent.keyDown(name, { key: 'Enter' });
        await submitNamedPair();
        await expectNamedPairSelected();
        await act(async () => {
          if (settlement === 'success') oldRename.resolve(undefined);
          else oldRename.reject(new Error('old rename failed'));
          await Promise.resolve();
        });
        await expectNamedPairSelected();
        expect(packages).toHaveBeenCalledTimes(2);
        expect(screen.queryByRole('alert')).toBeNull();
      },
    );
  }

  itDom(
    'withdraws a held FileReader before import dispatch after the same-catalog commit',
    async () => {
      const api = fakeWorkPackageApi();
      const imported = vi.fn(() => Promise.resolve(IMPORTED));
      api.importPlan = imported;
      let finishRead: () => void = () => {
        throw new Error('held reader not started');
      };
      vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
        Object.defineProperty(this, 'result', {
          configurable: true,
          value: JSON.stringify(IMPORTABLE_PLAN),
        });
        finishRead = () => {
          this.dispatchEvent(new ProgressEvent('load'));
        };
      });
      pageWith(api);
      await chooseFixtureProject();
      await screen.findByLabelText('Import JSON');
      await importFile();
      await submitNamedPair();
      await expectNamedPairSelected();
      await act(async () => {
        finishRead();
        await Promise.resolve();
      });
      expect(imported).not.toHaveBeenCalled();
      expect(toastTexts()).toEqual([]);
      await expectNamedPairSelected();
    },
  );

  for (const settlement of ['success', 'failure'] as const) {
    itDom(
      `withdraws an already-sent import ${settlement} without a late reload or toast`,
      async () => {
        const api = fakeWorkPackageApi();
        const oldImport = holdCombinedAnswer<PlanImportSummary>();
        const imported = vi.fn(() => oldImport.promise);
        api.importPlan = imported;
        const packages = vi.fn(api.listWorkPackages.bind(api));
        api.listWorkPackages = packages;
        pageWith(api);
        await chooseFixtureProject();
        await screen.findByLabelText('Import JSON');
        await importFile();
        await waitFor(() => {
          expect(imported).toHaveBeenCalledTimes(1);
        });
        await submitNamedPair();
        await expectNamedPairSelected();
        await act(async () => {
          if (settlement === 'success') oldImport.resolve(IMPORTED);
          else oldImport.reject(new Error('old import failed'));
          await Promise.resolve();
        });
        expect(packages).toHaveBeenCalledTimes(2);
        expect(toastTexts()).toEqual([]);
        await expectNamedPairSelected();
      },
    );
  }

  itDom('withdraws an import reload before navigation and toast publication', async () => {
    const api = fakeWorkPackageApi();
    api.importPlan = () => Promise.resolve(IMPORTED);
    const oldReload = holdCombinedAnswer<WorkPackageListEntry[]>();
    const packages = vi.fn(api.listWorkPackages.bind(api));
    packages
      .mockImplementationOnce(api.listWorkPackages.bind(api))
      .mockImplementationOnce(() => oldReload.promise);
    api.listWorkPackages = packages;
    pageWith(api);
    await chooseFixtureProject();
    await screen.findByLabelText('Import JSON');
    await importFile();
    await waitFor(() => {
      expect(packages).toHaveBeenCalledTimes(2);
    });
    await submitNamedPair();
    await expectNamedPairSelected();
    await act(async () => {
      oldReload.resolve([]);
      await Promise.resolve();
    });
    expect(toastTexts()).toEqual([]);
    await expectNamedPairSelected();
  });
});

describe('combined project context and admission', () => {
  for (const phase of ['write', 'projects', 'packages'] as const) {
    for (const settlement of ['success', 'failure'] as const) {
      itDom(
        `abandons ${phase} ${settlement} from a replaced catalog without local publication`,
        async () => {
          const fixture = await emptyCombinedCatalog();
          const creation = holdCombinedAnswer<Awaited<ReturnType<typeof fixture.create>>>();
          const oldProjects =
            holdCombinedAnswer<Awaited<ReturnType<typeof fixture.api.listProjects>>>();
          const oldPackages = holdCombinedAnswer<WorkPackageListEntry[]>();
          const readProjects = fixture.api.listProjects.bind(fixture.api);
          const readPackages = fixture.api.listWorkPackages.bind(fixture.api);
          const projects = vi.fn(readProjects);
          const packages = vi.fn(readPackages);
          fixture.api.listProjects = projects;
          fixture.api.listWorkPackages = packages;
          const view = pageWith(fixture.api);
          openWorkPackageActions();
          await screen.findByText(/No projects are available to you/);
          await waitFor(() => {
            expect(packages).toHaveBeenCalledTimes(1);
          });
          const fakeBirth = fixture.create.getMockImplementation();
          if (fakeBirth === undefined) throw new Error('actual fake birth is missing');
          let recorded: Awaited<ReturnType<typeof fixture.create>> | undefined;
          if (phase === 'write')
            fixture.create.mockImplementationOnce(async (project, workPackage) => {
              recorded = await fakeBirth(project, workPackage);
              return creation.promise;
            });
          if (phase === 'projects') projects.mockImplementationOnce(() => oldProjects.promise);
          if (phase === 'packages') packages.mockImplementationOnce(() => oldPackages.promise);
          await submitNamedPair();
          await waitFor(() => {
            if (phase === 'write') expect(fixture.create).toHaveBeenCalledTimes(1);
            else if (phase === 'projects') expect(projects).toHaveBeenCalledTimes(2);
            else expect(packages).toHaveBeenCalledTimes(2);
          });
          const replacement = fakeWorkPackageApi();
          view.rerender(
            <WorkPackagePageOverOwner api={replacement} savedPlanRoutes={fakeSavedPlanRoutes()} />,
          );
          openWorkPackageActions();
          await screen.findByRole('option', { name: 'Fixture project' });
          await waitFor(() => expect(picker()).toHaveValue('Rewire the shed'));
          await act(async () => {
            if (settlement === 'failure') {
              if (phase === 'write') creation.reject(new Error('old write unavailable'));
              else if (phase === 'projects')
                oldProjects.reject(new Error('old project read unavailable'));
              else oldPackages.reject(new Error('old package read unavailable'));
            } else if (phase === 'write') {
              if (recorded === undefined) throw new Error('actual recorded birth did not complete');
              creation.resolve(recorded);
            } else if (phase === 'projects') oldProjects.resolve(await readProjects());
            else oldPackages.resolve(await readPackages());
            await Promise.resolve();
          });
          expect(picker()).toHaveValue('Rewire the shed');
          expect(screen.queryByRole('dialog', { name: 'New project' })).toBeNull();
          openWorkPackageActions();
          expect(screen.getByRole('combobox', { name: 'Destination project' })).toHaveValue('');
          expect(screen.queryByRole('alert')).toBeNull();
          expect(localStorage.getItem('wbs.workPackage')).not.toBe('fake-package-1');
          expect(fixture.standalone).not.toHaveBeenCalled();
        },
      );
    }
  }

  itDom('lets the new import finish after an obsolete import finally settles first', async () => {
    const api = fakeWorkPackageApi();
    const firstImport = holdCombinedAnswer<PlanImportSummary>();
    const nextImport = holdCombinedAnswer<PlanImportSummary>();
    const imported = vi
      .fn<WorkPackageApi['importPlan']>()
      .mockImplementationOnce(() => firstImport.promise)
      .mockImplementationOnce(() => nextImport.promise);
    api.importPlan = imported;
    pageWith(api);
    await chooseFixtureProject();
    await screen.findByLabelText('Import JSON');
    await importFile();
    await waitFor(() => {
      expect(imported).toHaveBeenCalledTimes(1);
    });
    await submitNamedPair();
    await expectNamedPairSelected();
    const nextInput = screen.getByLabelText<HTMLInputElement>('Import JSON');
    const nextFile = new File([JSON.stringify(IMPORTABLE_PLAN)], 'next.json', {
      type: 'application/json',
    });
    fireEvent.change(nextInput, { target: { files: [nextFile] } });
    await waitFor(() => {
      expect(imported).toHaveBeenCalledTimes(2);
    });
    Object.defineProperty(nextInput, 'value', {
      configurable: true,
      writable: true,
      value: 'new-owned-file',
    });
    await act(async () => {
      firstImport.resolve(IMPORTED);
      await Promise.resolve();
    });
    expect(nextInput).toBeDisabled();
    expect(nextInput.value).toBe('new-owned-file');
    expect(toastTexts()).toEqual([]);
    fireEvent.change(nextInput, { target: { files: [nextFile] } });
    expect(imported).toHaveBeenCalledTimes(2);
    await act(async () => {
      nextImport.resolve({ ...IMPORTED, workPackageId: 'fake-package-1' });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(nextInput).not.toBeDisabled();
      expect(toastTexts()).toEqual([
        'Imported “Editor” with 40 work items. Added 1 tag (Needs review).',
      ]);
    });
    expect(nextInput.value).toBe('');
    expect(picker()).toHaveValue('Editor');
  });

  itDom(
    'clears the consumed old link and selects the returned pair without placeholder rename',
    async () => {
      window.history.replaceState(null, '', '/?workPackage=p1&stepNode=old-step&workItem=old-item');
      const api = fakeWorkPackageApi();
      const standalone = vi.fn(api.createWorkPackage.bind(api));
      const rename = vi.fn(api.renameWorkPackage.bind(api));
      api.createWorkPackage = standalone;
      api.renameWorkPackage = rename;
      pageWith(api);
      await chooseFixtureProject();
      await submitNamedPair();
      await expectNamedPairSelected();
      const url = new URL(window.location.href);
      expect(url.searchParams.has('workPackage')).toBe(false);
      expect(url.searchParams.has('stepNode')).toBe(false);
      expect(url.searchParams.has('workItem')).toBe(false);
      expect(standalone).not.toHaveBeenCalled();
      expect(rename).not.toHaveBeenCalled();
    },
  );
});

const GROUPING_PACKAGES: WorkPackageListEntry[] = [
  { ...TWO[0], id: 'unknown-one', projectId: 'unavailable-parent', name: 'Shared unknown first' },
  { ...TWO[0], id: 'b-one', projectId: 'parent-b', name: 'Shared B first' },
  { ...TWO[0], id: 'a-one', projectId: 'parent-a', name: 'Shared A first' },
  { ...TWO[0], id: 'b-two', projectId: 'parent-b', name: 'Shared B second' },
  { ...TWO[0], id: 'unknown-two', projectId: 'unavailable-parent', name: 'Shared unknown second' },
  { ...TWO[0], id: 'a-two', projectId: 'parent-a', name: 'Shared A second' },
];
const GROUPING_PROJECTS: Awaited<ReturnType<WorkPackageApi['listProjects']>> = [
  {
    id: 'parent-a',
    organizationId: 'fixture-organization',
    spaceId: null,
    spacePosition: null,
    name: 'Project A',
    revision: 0,
    createdAt: 1,
    updatedAt: null,
    createdBy: null,
    workPackageCount: 2,
  },
  {
    id: 'parent-b',
    organizationId: 'fixture-organization',
    spaceId: null,
    spacePosition: null,
    name: 'Project B',
    revision: 0,
    createdAt: 1,
    updatedAt: null,
    createdBy: null,
    workPackageCount: 2,
  },
  {
    id: 'empty-parent',
    organizationId: 'fixture-organization',
    spaceId: null,
    spacePosition: null,
    name: 'Empty project',
    revision: 0,
    createdAt: 1,
    updatedAt: null,
    createdBy: null,
    workPackageCount: 0,
  },
];
const GROUPED_OPTION_IDS = [
  'work-package-option-b-one',
  'work-package-option-b-two',
  'work-package-option-a-one',
  'work-package-option-a-two',
  'work-package-option-unknown-one',
  'work-package-option-unknown-two',
];

function packageGroupingFixture() {
  const api = fakeWorkPackages(GROUPING_PACKAGES);
  const projects = vi.fn(() =>
    Promise.resolve(GROUPING_PROJECTS.map((project) => ({ ...project }))),
  );
  const packages = vi.fn(api.listWorkPackages.bind(api));
  api.listProjects = projects;
  api.listWorkPackages = packages;
  return { api, projects, packages };
}

const offeredPackageIds = () =>
  within(screen.getByRole('listbox', { name: 'Work packages' }))
    .getAllByRole('option')
    .map((option) => option.id);

async function readyGroupingPicker() {
  openWorkPackageActions();
  await screen.findByRole('option', { name: 'Project B' });
  openPicker();
  return await screen.findByRole('listbox', { name: 'Work packages' });
}

function placeGroupingRows(topOfB: () => number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.id === 'work-package-options') return new DOMRect(0, 0, 200, 240);
    if (this.id === 'work-package-option-b-one') return new DOMRect(10, topOfB(), 120, 10);
    return new DOMRect(0, 0, 0, 0);
  });
}

describe('project-grouped package navigation', () => {
  itDom(
    'shows actual known groups before unavailable rows with one accessible option order',
    async () => {
      const fixture = packageGroupingFixture();
      pageWith(fixture.api);
      const list = await readyGroupingPicker();
      expect(within(list).getAllByRole('group')).toEqual([
        within(list).getByRole('group', { name: 'Project B' }),
        within(list).getByRole('group', { name: 'Project A' }),
        within(list).getByRole('group', { name: 'Project details unavailable' }),
      ]);
      expect(offeredPackageIds()).toEqual(GROUPED_OPTION_IDS);
      expect(within(list).queryByRole('group', { name: 'Empty project' })).toBeNull();
      openWorkPackageActions();
      expect(screen.getByRole('option', { name: 'Empty project' })).toBeDefined();
      openWorkPackageActions();
      expect(screen.getByRole('combobox', { name: 'Destination project' })).toHaveValue('');
      expect(
        within(list).getByRole('option', { name: `Shared B first (${THIS_JUNE} · kat)` }).id,
      ).toBe('work-package-option-b-one');
    },
  );

  itDom(
    'uses the grouped order for first typing highlight, arrows, clamping and Enter',
    async () => {
      const fixture = packageGroupingFixture();
      pageWith(fixture.api);
      await readyGroupingPicker();
      fireEvent.change(picker(), { target: { value: 'Shared' } });
      expect(picker()).toHaveAttribute('aria-activedescendant', 'work-package-option-b-one');
      fireEvent.keyDown(picker(), { key: 'ArrowUp' });
      expect(picker()).toHaveAttribute('aria-activedescendant', 'work-package-option-b-one');
      fireEvent.keyDown(picker(), { key: 'ArrowDown' });
      expect(picker()).toHaveAttribute('aria-activedescendant', 'work-package-option-b-two');
      fireEvent.keyDown(picker(), { key: 'ArrowDown' });
      expect(picker()).toHaveAttribute('aria-activedescendant', 'work-package-option-a-one');
      for (let move = 0; move < 6; move += 1) fireEvent.keyDown(picker(), { key: 'ArrowDown' });
      expect(picker()).toHaveAttribute('aria-activedescendant', 'work-package-option-unknown-two');
      fireEvent.keyDown(picker(), { key: 'Enter' });
      await waitFor(() => {
        expect(picker()).toHaveValue('Shared unknown second');
      });
      expect(fixture.api.opened).toEqual(['unknown-two']);
      openWorkPackageActions();
      expect(screen.getByRole('combobox', { name: 'Destination project' })).toHaveValue('');
    },
  );

  itDom(
    'keeps the highlighted package ID when pending metadata becomes grouped without extra package reads',
    async () => {
      const fixture = packageGroupingFixture();
      const held = holdCombinedAnswer<Awaited<ReturnType<WorkPackageApi['listProjects']>>>();
      fixture.projects.mockImplementationOnce(() => held.promise);
      pageWith(fixture.api);
      openWorkPackageActions();
      await screen.findByText('Loading projects…');
      openPicker();
      const list = await screen.findByRole('listbox', { name: 'Work packages' });
      expect(
        within(list)
          .getAllByRole('option')
          .map((option) => option.id),
      ).toEqual(GROUPING_PACKAGES.map((row) => 'work-package-option-' + row.id));
      fireEvent.keyDown(picker(), { key: 'ArrowDown' });
      fireEvent.keyDown(picker(), { key: 'ArrowDown' });
      expect(picker()).toHaveAttribute('aria-activedescendant', 'work-package-option-b-one');
      await act(async () => {
        held.resolve(GROUPING_PROJECTS);
        await Promise.resolve();
      });
      expect(offeredPackageIds()).toEqual(GROUPED_OPTION_IDS);
      expect(picker()).toHaveAttribute('aria-activedescendant', 'work-package-option-b-one');
      expect(fixture.packages).toHaveBeenCalledTimes(1);
      expect(fixture.api.opened).toEqual([]);
      expect(localStorage.getItem('wbs.workPackage')).toBeNull();
    },
  );

  for (const kind of ['refused', 'failed'] as const) {
    itDom(
      `keeps flat package navigation through ${kind} metadata and groups only after retry`,
      async () => {
        const fixture = packageGroupingFixture();
        fixture.projects.mockRejectedValueOnce(
          kind === 'refused'
            ? new WbsRequestError({
                kind: 'refusal',
                operation: 'getApiProjects',
                refusal: { error: 'no_active_organization' },
              })
            : new Error('temporary project query failure'),
        );
        pageWith(fixture.api);
        openWorkPackageActions();
        await screen.findByRole('button', { name: 'Retry projects' });
        openPicker();
        const list = await screen.findByRole('listbox', { name: 'Work packages' });
        expect(
          within(list)
            .getAllByRole('option')
            .map((option) => option.id),
        ).toEqual(GROUPING_PACKAGES.map((row) => 'work-package-option-' + row.id));
        expect(within(list).queryAllByRole('group')).toEqual([]);
        fireEvent.click(
          within(list).getByRole('option', { name: `Shared A first (${THIS_JUNE} · kat)` }),
        );
        await waitFor(() => {
          expect(picker()).toHaveValue('Shared A first');
        });
        expect(fixture.api.opened).toEqual(['a-one']);
        openWorkPackageActions();
        fireEvent.click(screen.getByRole('button', { name: 'Retry projects' }));
        await readyGroupingPicker();
        expect(offeredPackageIds()).toEqual(GROUPED_OPTION_IDS);
        expect(fixture.packages).toHaveBeenCalledTimes(1);
        expect(fixture.api.opened).toEqual(['a-one']);
        expect(localStorage.getItem('wbs.workPackage')).toBe('a-one');
        openWorkPackageActions();
        expect(screen.getByRole('combobox', { name: 'Destination project' })).toHaveValue('');
      },
    );
  }

  itDom(
    'keeps destination selection independent of navigating and grouping actual parents',
    async () => {
      const fixture = packageGroupingFixture();
      pageWith(fixture.api);
      const list = await readyGroupingPicker();
      openWorkPackageActions();
      fireEvent.change(screen.getByRole('combobox', { name: 'Destination project' }), {
        target: { value: 'parent-b' },
      });
      fireEvent.click(
        within(list).getByRole('option', { name: `Shared A first (${THIS_JUNE} · kat)` }),
      );
      await waitFor(() => {
        expect(picker()).toHaveValue('Shared A first');
      });
      openWorkPackageActions();
      expect(screen.getByRole('combobox', { name: 'Destination project' })).toHaveValue('parent-b');
      openPicker();
      openWorkPackageActions();
      fireEvent.change(screen.getByRole('combobox', { name: 'Destination project' }), {
        target: { value: 'parent-a' },
      });
      expect(offeredPackageIds()).toEqual(GROUPED_OPTION_IDS);
      expect(fixture.api.opened).toEqual(['a-one']);
      expect(localStorage.getItem('wbs.workPackage')).toBe('a-one');
    },
  );

  for (const settlement of ['success', 'failure'] as const) {
    itDom(
      `withdraws old catalog metadata ${settlement} instead of publishing old headings or alerts`,
      async () => {
        const old = packageGroupingFixture();
        const held = holdCombinedAnswer<Awaited<ReturnType<WorkPackageApi['listProjects']>>>();
        old.projects.mockImplementationOnce(() => held.promise);
        const view = pageWith(old.api);
        openWorkPackageActions();
        await screen.findByText('Loading projects…');
        const current = packageGroupingFixture();
        current.projects.mockResolvedValueOnce(
          GROUPING_PROJECTS.map((project) => ({ ...project, name: 'Current ' + project.name })),
        );
        view.rerender(
          <WorkPackagePageOverOwner api={current.api} savedPlanRoutes={fakeSavedPlanRoutes()} />,
        );
        await screen.findByRole('option', { name: 'Current Project B' });
        openPicker();
        const list = await screen.findByRole('listbox', { name: 'Work packages' });
        expect(within(list).getByRole('group', { name: 'Current Project B' })).toBeDefined();
        await act(async () => {
          if (settlement === 'success') held.resolve(GROUPING_PROJECTS);
          else held.reject(new Error('old metadata failed'));
          await Promise.resolve();
        });
        expect(within(list).getByRole('group', { name: 'Current Project B' })).toBeDefined();
        expect(within(list).queryByRole('group', { name: 'Project B' })).toBeNull();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(current.packages).toHaveBeenCalledTimes(1);
      },
    );
  }

  itDom(
    'keeps readable packages visibly unresolved when ready metadata contains no project',
    async () => {
      const fixture = packageGroupingFixture();
      fixture.projects.mockResolvedValueOnce([]);
      pageWith(fixture.api);
      openWorkPackageActions();
      await screen.findByText(/No projects are available to you/);
      openPicker();
      const list = await screen.findByRole('listbox', { name: 'Work packages' });
      const unresolved = within(list).getByRole('group', { name: 'Project details unavailable' });
      expect(
        within(unresolved)
          .getAllByRole('option')
          .map((option) => option.id),
      ).toEqual(GROUPING_PACKAGES.map((row) => 'work-package-option-' + row.id));
      openWorkPackageActions();
      expect(
        within(screen.getByRole('banner')).getByRole('button', { name: 'Create new work package' }),
      ).toBeDisabled();
      openWorkPackageActions();
      expect(screen.queryByRole('combobox', { name: 'Destination project' })).toBeNull();
      fireEvent.click(
        within(unresolved).getByRole('option', { name: `Shared B first (${THIS_JUNE} · kat)` }),
      );
      await waitFor(() => {
        expect(picker()).toHaveValue('Shared B first');
      });
      expect(fixture.api.opened).toEqual(['b-one']);
    },
  );

  itDom(
    'remeasures a same-ID hovered row when metadata arrives without scrolling or reopening its selected runtime',
    async () => {
      const fixture = packageGroupingFixture();
      const held = holdCombinedAnswer<Awaited<ReturnType<WorkPackageApi['listProjects']>>>();
      fixture.projects.mockImplementationOnce(() => held.promise);
      const reads = vi.fn(fixture.api.tree.bind(fixture.api));
      fixture.api.tree = reads;
      let rowTop = 20;
      placeGroupingRows(() => rowTop);
      pageWith(fixture.api);
      await selectWorkPackage('a-one');
      await waitFor(() => {
        expect(reads).toHaveBeenCalledWith('a-one');
      });
      openPicker();
      const option = await screen.findByRole('option', {
        name: `Shared B first (${THIS_JUNE} · kat)`,
      });
      fireEvent.mouseEnter(option);
      await waitFor(() => {
        expect(screen.getByRole('tooltip', { name: 'Shared B first' }).style.top).toBe('20px');
      });
      const readCount = reads.mock.calls.length;
      rowTop = 90;
      await act(async () => {
        held.resolve(GROUPING_PROJECTS);
        await Promise.resolve();
      });
      await waitFor(() => {
        expect(screen.getByRole('tooltip', { name: 'Shared B first' }).style.top).toBe('90px');
      });
      expect(reads).toHaveBeenCalledTimes(readCount);
      expect(fixture.api.opened).toEqual(['a-one']);
      expect(localStorage.getItem('wbs.workPackage')).toBe('a-one');
    },
  );

  itDom(
    'remeasures unchanged option IDs after a heading rename and hides an off-list same-ID card',
    async () => {
      const fixture = packageGroupingFixture();
      let rowTop = 20;
      placeGroupingRows(() => rowTop);
      pageWith(fixture.api);
      const list = await readyGroupingPicker();
      fireEvent.mouseEnter(
        within(list).getByRole('option', { name: `Shared B first (${THIS_JUNE} · kat)` }),
      );
      await waitFor(() => {
        expect(screen.getByRole('tooltip', { name: 'Shared B first' }).style.top).toBe('20px');
      });
      const longHeading = 'Project B with an explicitly longer heading that wraps';
      const renamed = GROUPING_PROJECTS.map((project) =>
        project.id === 'parent-b' ? { ...project, name: longHeading } : project,
      );
      fixture.projects.mockResolvedValueOnce(renamed);
      rowTop = 100;
      openWorkPackageActions();
      fireEvent.click(screen.getByRole('button', { name: 'Refresh projects' }));
      await screen.findByRole('option', { name: longHeading });
      await waitFor(() => {
        expect(screen.getByRole('tooltip', { name: 'Shared B first' }).style.top).toBe('100px');
      });
      expect(offeredPackageIds()).toEqual(GROUPED_OPTION_IDS);
      fixture.projects.mockResolvedValueOnce(GROUPING_PROJECTS);
      rowTop = 300;
      openWorkPackageActions();
      fireEvent.click(screen.getByRole('button', { name: 'Refresh projects' }));
      openWorkPackageActions();
      await screen.findByRole('option', { name: 'Project B' });
      await waitFor(() => {
        expect(screen.queryByRole('tooltip')).toBeNull();
      });
      expect(fixture.packages).toHaveBeenCalledTimes(1);
      expect(fixture.api.opened).toEqual([]);
    },
  );
});

describe('project actions header disclosure', () => {
  itDom(
    'reveals the retained explicit destination only inside Project actions and dismisses on Escape',
    async () => {
      pageWith(fakeWorkPackages(TWO));
      await screen.findByText('Fixture project', { selector: 'option' });
      const header = within(screen.getByRole('banner'));
      const trigger = header.getByLabelText('Work package actions', { selector: 'summary' });
      const panel = trigger.closest('details');
      const destination = header.getByRole('combobox', { name: 'Destination project' });
      expect(panel).not.toHaveAttribute('open');
      expect(destination).not.toBeVisible();
      fireEvent.click(trigger);
      expect(panel).toHaveAttribute('open');
      expect(destination).toBeVisible();
      expect(destination).toHaveValue('');
      fireEvent.change(destination, { target: { value: 'fixture-project' } });
      expect(destination).toHaveValue('fixture-project');
      fireEvent.keyDown(destination, { key: 'Escape' });
      expect(panel).not.toHaveAttribute('open');
      expect(destination).not.toBeVisible();
      expect(trigger).toHaveFocus();
      fireEvent.click(trigger);
      expect(panel).toHaveAttribute('open');
      expect(destination).toBeVisible();
      expect(destination).toHaveValue('fixture-project');
    },
  );
});

describe('project actions modal and outside dismissal', () => {
  itDom(
    'closes the project panel before New project and restores focus to its summary',
    async () => {
      pageWith(fakeWorkPackages(TWO));
      await screen.findByText('Fixture project', { selector: 'option' });
      const trigger = openWorkPackageActions();
      const panel = trigger.closest('details');
      const destination = screen.getByRole('combobox', { name: 'Destination project' });
      expect(destination).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'New project' }));
      const dialog = await screen.findByRole('dialog', { name: 'New project' });
      expect(panel).not.toHaveAttribute('open');
      expect(destination).not.toBeVisible();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'New project' })).toBeNull();
      });
      expect(trigger).toHaveFocus();
    },
  );

  itDom(
    'dismisses the project panel outside without changing its explicit destination',
    async () => {
      pageWith(fakeWorkPackages(TWO));
      await screen.findByText('Fixture project', { selector: 'option' });
      const trigger = openWorkPackageActions();
      const destination = screen.getByRole('combobox', { name: 'Destination project' });
      expect(destination).toBeVisible();
      fireEvent.change(destination, { target: { value: 'fixture-project' } });
      fireEvent.pointerDown(picker());
      expect(trigger.closest('details')).not.toHaveAttribute('open');
      expect(destination).not.toBeVisible();
      openWorkPackageActions();
      expect(destination).toBeVisible();
      expect(destination).toHaveValue('fixture-project');
    },
  );
});

describe('project dialog focus ownership', () => {
  itDom(
    'does not focus the still-connected opening summary after catalog replacement',
    async () => {
      const view = pageWith(fakeWorkPackages(TWO));
      await screen.findByText('Fixture project', { selector: 'option' });
      const trigger = openWorkPackageActions();
      fireEvent.click(screen.getByRole('button', { name: 'New project' }));
      await screen.findByRole('dialog', { name: 'New project' });
      const focus = vi.spyOn(trigger, 'focus');
      view.rerender(
        <WorkPackagePageOverOwner
          api={fakeWorkPackages(TWO)}
          savedPlanRoutes={fakeSavedPlanRoutes()}
        />,
      );
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'New project' })).toBeNull();
      });
      await act(async () => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
      });
      expect(trigger.isConnected).toBe(true);
      expect(focus).not.toHaveBeenCalled();
    },
  );

  itDom('does not return focus to the disconnected summary after page unmount', async () => {
    const view = pageWith(fakeWorkPackages(TWO));
    await screen.findByText('Fixture project', { selector: 'option' });
    const trigger = openWorkPackageActions();
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    await screen.findByRole('dialog', { name: 'New project' });
    const focus = vi.spyOn(trigger, 'focus');
    view.unmount();
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(trigger.isConnected).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });

  itDom('keeps the reopened dialog focus when the older same-epoch close settles', async () => {
    pageWith(fakeWorkPackages(TWO));
    await screen.findByText('Fixture project', { selector: 'option' });
    openWorkPackageActions();
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    const first = await screen.findByRole('dialog', { name: 'New project' });
    fireEvent.click(within(first).getByRole('button', { name: 'Cancel' }));
    openWorkPackageActions();
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    const second = await screen.findByRole('dialog', { name: 'New project' });
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    await waitFor(() =>
      expect(within(second).getByRole('textbox', { name: 'Project name' })).toHaveFocus(),
    );
  });
});

describe('grouped work package action focus', () => {
  itDom('closes actions before the existing rename field takes focus', async () => {
    pageWith(fakeWorkPackages(TWO));
    await selectWorkPackage('p2');
    const trigger = openWorkPackageActions();
    const rename = screen.getByRole('button', { name: 'Rename work package' });
    expect(rename).toBeVisible();
    fireEvent.click(rename);
    const field = await screen.findByLabelText('Work package name');
    expect(trigger.closest('details')).not.toHaveAttribute('open');
    expect(field).toHaveValue('Paint the fence');
    expect(field).toHaveFocus();
  });

  itDom('closes actions before the created package name takes focus', async () => {
    pageWith(fakeWorkPackages(TWO));
    await chooseFixtureProject();
    const trigger = openWorkPackageActions();
    const create = within(screen.getByRole('banner')).getByRole('button', {
      name: 'Create new work package',
    });
    expect(create).toBeVisible();
    fireEvent.click(create);
    const field = await screen.findByLabelText('Work package name');
    expect(trigger.closest('details')).not.toHaveAttribute('open');
    expect(field).toHaveValue('New work package');
    expect(field).toHaveFocus();
  });
});

describe('project actions for reported deployment features', () => {
  itDom(
    'keeps package navigation without asking projects when organizations are reported off',
    async () => {
      const api = fakeWorkPackages(TWO);
      const projects = vi.fn(api.listProjects.bind(api));
      const packages = vi.fn(api.listWorkPackages.bind(api));
      api.listProjects = projects;
      api.listWorkPackages = packages;
      render(
        <SessionFeaturesProvider value={{ onboarding: false, organizations: false }}>
          <WorkPackagePageOverOwner api={api} savedPlanRoutes={fakeSavedPlanRoutes()} />
        </SessionFeaturesProvider>,
      );
      await screen.findByRole('combobox', { name: 'Work package' });
      await waitFor(() => {
        expect(packages).toHaveBeenCalled();
      });
      expect(projects).not.toHaveBeenCalled();
      const summary = openWorkPackageActions();
      const panel = summary.closest('details');
      if (panel === null) throw new Error('Required existing actions disclosure is absent');
      expect(
        within(panel).getByText('Project actions are unavailable in this mode.'),
      ).toBeVisible();
      expect(within(panel).queryByRole('combobox', { name: 'Destination project' })).toBeNull();
      expect(within(panel).queryByRole('button', { name: 'Retry projects' })).toBeNull();
      expect(within(panel).queryByRole('button', { name: 'Refresh projects' })).toBeNull();
      expect(within(panel).queryByText(/No projects are available to you/)).toBeNull();
      expect(within(panel).getByRole('button', { name: 'New project' })).toBeDisabled();
      expect(within(panel).getByRole('button', { name: 'Create new work package' })).toBeDisabled();
      fireEvent.click(summary);
      await selectWorkPackage('p1');
      expect(screen.getByRole('combobox', { name: 'Work package' })).toHaveValue('Rewire the shed');
      expect(api.opened).toContain('p1');
      expect(projects).not.toHaveBeenCalled();
    },
  );
});

const PROJECT_FEATURES_ON: SessionFeatures = { onboarding: false, organizations: true };
const PROJECT_FEATURES_OFF: SessionFeatures = { onboarding: false, organizations: false };

/** Changes only the actual feature context, retaining the same Page, catalog and owner. */
function renderPageWithProjectFeatures(api: WorkPackageApi, features: SessionFeatures | null) {
  const savedPlanRoutes = fakeSavedPlanRoutes();
  const draw = (value: SessionFeatures | null) => (
    <SessionFeaturesProvider value={value}>
      <WorkPackagePageOverOwner api={api} savedPlanRoutes={savedPlanRoutes} />
    </SessionFeaturesProvider>
  );
  const view = render(draw(features));
  return {
    ...view,
    showFeatures: (value: SessionFeatures | null) => {
      view.rerender(draw(value));
    },
  };
}

/** Retains actual Page-supplied callbacks while rendering the unchanged real dialog. */
function observeProjectDialogCallbacks() {
  type Props = Parameters<typeof projectDialogModule.NewProjectDialog>[0];
  const published: Props[] = [];
  const original = projectDialogModule.NewProjectDialog;
  vi.spyOn(projectDialogModule, 'NewProjectDialog').mockImplementation((props) => {
    published.push(props);
    return original(props);
  });
  return () => {
    const props = published.at(-1);
    if (props === undefined) throw new Error('Actual Project dialog callbacks were not published');
    return props;
  };
}

/** Records real picker callbacks, preserving its actual rendering and hooks. */
function observeProjectPickerCallbacks() {
  type Props = Parameters<typeof projectPickerModule.ProjectPicker>[0];
  const published: Props[] = [];
  const original = projectPickerModule.ProjectPicker;
  vi.spyOn(projectPickerModule, 'ProjectPicker').mockImplementation((props) => {
    published.push(props);
    return original(props);
  });
  return () => {
    const props = published.at(-1);
    if (props === undefined) throw new Error('Actual Project picker callbacks were not published');
    return props;
  };
}

describe('Project availability observations', () => {
  for (const mode of ['true', 'null'] as const) {
    itDom(`keeps actual Project reads and explicit choices when features are ${mode}`, async () => {
      const api = fakeWorkPackages(TWO);
      const projects = vi.fn(api.listProjects.bind(api));
      api.listProjects = projects;
      renderPageWithProjectFeatures(api, mode === 'true' ? PROJECT_FEATURES_ON : null);
      await chooseFixtureProject();
      expect(projects).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('combobox', { name: 'Destination project' })).toHaveValue(
        'fixture-project',
      );
      expect(
        within(screen.getByRole('banner')).getByRole('button', { name: 'Create new work package' }),
      ).not.toBeDisabled();
    });
  }

  itDom('keeps unknown-feature refusal rendering distinct from inactive Projects', async () => {
    const api = fakeWorkPackages(TWO);
    const projects = vi.fn(() => Promise.reject(new Error('actual fixture Project read refused')));
    api.listProjects = projects;
    renderPageWithProjectFeatures(api, null);
    openWorkPackageActions();
    expect(await screen.findByText('Projects could not be loaded. Try again.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry projects' })).toBeVisible();
    expect(screen.queryByText('Project actions are unavailable in this mode.')).toBeNull();
    expect(projects).toHaveBeenCalledTimes(1);
  });

  for (const settlement of ['success', 'failure'] as const) {
    itDom(
      `does not revive old Project metadata or selection after true false true ${settlement}`,
      async () => {
        const currentProps = observeProjectPickerCallbacks();
        const api = fakeWorkPackages(TWO);
        const readProjects = api.listProjects.bind(api);
        const originalRows = await readProjects();
        const oldRead = holdCombinedAnswer<typeof originalRows>();
        const freshRead = holdCombinedAnswer<typeof originalRows>();
        const projects = vi.fn(readProjects);
        api.listProjects = projects;
        const view = renderPageWithProjectFeatures(api, PROJECT_FEATURES_ON);
        await chooseFixtureProject();
        expect(screen.getByRole('combobox', { name: 'Destination project' })).toHaveValue(
          'fixture-project',
        );
        const oldPicker = currentProps();
        projects.mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(freshRead.promise);
        fireEvent.click(screen.getByRole('button', { name: 'Refresh projects' }));
        await waitFor(() => {
          expect(projects).toHaveBeenCalledTimes(2);
        });
        view.showFeatures(PROJECT_FEATURES_OFF);
        expect(screen.getByText('Project actions are unavailable in this mode.')).toBeVisible();
        expect(screen.queryByRole('combobox', { name: 'Destination project' })).toBeNull();
        await act(async () => {
          oldPicker.onChoose('fixture-project');
          oldPicker.onRefresh();
          await Promise.resolve();
        });
        expect(projects).toHaveBeenCalledTimes(2);
        view.showFeatures(PROJECT_FEATURES_ON);
        expect(screen.getByText('Loading projects…')).toBeVisible();
        await waitFor(() => {
          expect(projects).toHaveBeenCalledTimes(3);
        });
        await act(async () => {
          freshRead.resolve(
            originalRows.map((row) => ({ ...row, name: 'Fresh Project metadata' })),
          );
          await freshRead.promise;
        });
        expect(await screen.findByRole('option', { name: 'Fresh Project metadata' })).toBeDefined();
        expect(screen.getByRole('combobox', { name: 'Destination project' })).toHaveValue('');
        await act(async () => {
          oldPicker.onChoose('fixture-project');
          oldPicker.onRefresh();
          await Promise.resolve();
        });
        await act(async () => {
          if (settlement === 'success') oldRead.resolve(originalRows);
          else oldRead.reject(new Error('old Project observation failed'));
          await Promise.resolve();
        });
        expect(screen.queryByRole('option', { name: 'Fixture project' })).toBeNull();
        expect(screen.getByRole('option', { name: 'Fresh Project metadata' })).toBeDefined();
        expect(screen.queryByText('Projects could not be loaded. Try again.')).toBeNull();
        expect(screen.getByRole('combobox', { name: 'Destination project' })).toHaveValue('');
        expect(projects).toHaveBeenCalledTimes(3);
      },
    );
  }

  itDom('keeps existing-package navigation and rename active with Projects inactive', async () => {
    const api = fakeWorkPackages(TWO);
    const projects = vi.fn(api.listProjects.bind(api));
    api.listProjects = projects;
    renderPageWithProjectFeatures(api, PROJECT_FEATURES_OFF);
    await selectWorkPackage('p2');
    openWorkPackageActions();
    fireEvent.click(screen.getByRole('button', { name: 'Rename work package' }));
    const name = await screen.findByLabelText('Work package name');
    fireEvent.change(name, { target: { value: 'Local package still editable' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    await waitFor(() => {
      expect(api.renamed).toContainEqual(['p2', 'Local package still editable']);
    });
    expect(projects).not.toHaveBeenCalled();
  });

  itDom('retires actual dialog callbacks and focus across withdrawal and restoration', async () => {
    const currentProps = observeProjectDialogCallbacks();
    const fixture = await emptyCombinedCatalog();
    const view = renderPageWithProjectFeatures(fixture.api, PROJECT_FEATURES_ON);
    openWorkPackageActions();
    await screen.findByText(/No projects are available to you/);
    const summary = openWorkPackageActions();
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    const first = await screen.findByRole('dialog', { name: 'New project' });
    fireEvent.change(within(first).getByRole('textbox', { name: 'Project name' }), {
      target: { value: 'Departed name' },
    });
    const old = currentProps();
    const focus = vi.spyOn(summary, 'focus');
    focus.mockClear();
    view.showFeatures(PROJECT_FEATURES_OFF);
    expect(screen.queryByRole('dialog', { name: 'New project' })).toBeNull();
    const closeFocus = old.onCloseAutoFocus;
    if (closeFocus === undefined) throw new Error('Required actual close-focus callback absent');
    await act(async () => {
      old.onCreate('Departed', 'Departed child');
      old.onOpenChange(false);
      old.onRetryRefresh();
      closeFocus(new Event('closeAutoFocus', { cancelable: true }));
      await Promise.resolve();
    });
    expect(fixture.create).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
    view.showFeatures(PROJECT_FEATURES_ON);
    openWorkPackageActions();
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    const next = await screen.findByRole('dialog', { name: 'New project' });
    expect(within(next).getByRole('textbox', { name: 'Project name' })).toHaveValue('');
    focus.mockClear();
    await act(async () => {
      old.onProjectNameChange('Obsolete');
      old.onWorkPackageNameChange('Obsolete child');
      old.onCreate('Departed', 'Departed child');
      old.onOpenChange(false);
      old.onRetryRefresh();
      closeFocus(new Event('closeAutoFocus', { cancelable: true }));
      await Promise.resolve();
    });
    expect(screen.getByRole('dialog', { name: 'New project' })).toBe(next);
    expect(within(next).getByRole('textbox', { name: 'Project name' })).toHaveValue('');
    expect(fixture.create).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
  });

  for (const settlement of ['success', 'failure'] as const) {
    itDom(
      `keeps an old POST ${settlement} from reviving or unlocking a restored attempt`,
      async () => {
        const currentProps = observeProjectDialogCallbacks();
        const fixture = await emptyCombinedCatalog();
        const applyCreation = fixture.create.getMockImplementation();
        if (applyCreation === undefined)
          throw new Error('Actual fixture creation implementation absent');
        const oldPost = holdCombinedAnswer<Awaited<ReturnType<typeof fixture.create>>>();
        const newPost = holdCombinedAnswer<Awaited<ReturnType<typeof fixture.create>>>();
        fixture.create.mockReturnValueOnce(oldPost.promise).mockReturnValueOnce(newPost.promise);
        const projects = vi.fn(fixture.api.listProjects.bind(fixture.api));
        const packages = vi.fn(fixture.api.listWorkPackages.bind(fixture.api));
        fixture.api.listProjects = projects;
        fixture.api.listWorkPackages = packages;
        const view = renderPageWithProjectFeatures(fixture.api, PROJECT_FEATURES_ON);
        openWorkPackageActions();
        await screen.findByText(/No projects are available to you/);
        await submitNamedPair('Old Project', 'Old child');
        await waitFor(() => {
          expect(fixture.create).toHaveBeenCalledTimes(1);
        });
        const location = window.location.href;
        view.showFeatures(PROJECT_FEATURES_OFF);
        view.showFeatures(PROJECT_FEATURES_ON);
        expect(screen.queryByRole('dialog', { name: 'New project' })).toBeNull();
        await waitFor(() => {
          expect(projects).toHaveBeenCalledTimes(2);
        });
        await submitNamedPair('Current Project', 'Current child');
        await waitFor(() => {
          expect(fixture.create).toHaveBeenCalledTimes(2);
        });
        const next = currentProps();
        await act(async () => {
          if (settlement === 'success')
            oldPost.resolve(await applyCreation('Old Project', 'Old child'));
          else oldPost.reject(new Error('old POST reply unavailable'));
          await Promise.resolve();
        });
        expect(projects).toHaveBeenCalledTimes(2);
        expect(packages).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem('wbs.workPackage')).toBeNull();
        expect(window.location.href).toBe(location);
        expect(screen.queryByLabelText('Work package name')).toBeNull();
        expect(
          within(screen.getByRole('dialog', { name: 'New project' })).getByRole('textbox', {
            name: 'Project name',
          }),
        ).toHaveValue('Current Project');
        await act(async () => {
          next.onOpenChange(false);
          await Promise.resolve();
        });
        expect(
          within(screen.getByRole('dialog', { name: 'New project' })).getByRole('textbox', {
            name: 'Project name',
          }),
        ).toHaveValue('Current Project');
        await act(async () => {
          next.onCreate('Duplicate', 'Duplicate child');
          await Promise.resolve();
        });
        expect(fixture.create).toHaveBeenCalledTimes(2);
        await act(async () => {
          newPost.reject(new Error('current outcome unconfirmed'));
          await Promise.resolve();
        });
        expect(await screen.findByText(/Creation could not be confirmed/)).toBeVisible();
      },
    );
  }

  for (const settlement of ['success', 'failure'] as const) {
    itDom(
      `discards old committed Project reconciliation ${settlement} after restoration`,
      async () => {
        const fixture = await emptyCombinedCatalog();
        const readProjects = fixture.api.listProjects.bind(fixture.api);
        const held = holdCombinedAnswer<Awaited<ReturnType<typeof readProjects>>>();
        const projects = vi.fn(readProjects);
        const packages = vi.fn(fixture.api.listWorkPackages.bind(fixture.api));
        fixture.api.listProjects = projects;
        fixture.api.listWorkPackages = packages;
        const view = renderPageWithProjectFeatures(fixture.api, PROJECT_FEATURES_ON);
        openWorkPackageActions();
        await screen.findByText(/No projects are available to you/);
        projects.mockReturnValueOnce(held.promise);
        await submitNamedPair();
        await waitFor(() => {
          expect(projects).toHaveBeenCalledTimes(2);
        });
        const location = window.location.href;
        view.showFeatures(PROJECT_FEATURES_OFF);
        view.showFeatures(PROJECT_FEATURES_ON);
        await waitFor(() => {
          expect(projects).toHaveBeenCalledTimes(3);
        });
        openWorkPackageActions();
        await screen.findByRole('option', { name: 'WBS product' });
        await act(async () => {
          if (settlement === 'success') held.resolve(await readProjects());
          else held.reject(new Error('old reconciliation refused'));
          await Promise.resolve();
        });
        expect(packages).toHaveBeenCalledTimes(1);
        expect(projects).toHaveBeenCalledTimes(3);
        expect(screen.queryByRole('dialog', { name: 'New project' })).toBeNull();
        expect(screen.getByRole('combobox', { name: 'Destination project' })).toHaveValue('');
        expect(localStorage.getItem('wbs.workPackage')).toBeNull();
        expect(window.location.href).toBe(location);
      },
    );
  }

  itDom(
    'discards a committed package-list reconciliation across availability replacement',
    async () => {
      const fixture = await emptyCombinedCatalog();
      const readPackages = fixture.api.listWorkPackages.bind(fixture.api);
      const held = holdCombinedAnswer<WorkPackageListEntry[]>();
      const packages = vi.fn(readPackages);
      fixture.api.listWorkPackages = packages;
      const view = renderPageWithProjectFeatures(fixture.api, PROJECT_FEATURES_ON);
      openWorkPackageActions();
      await screen.findByText(/No projects are available to you/);
      await waitFor(() => {
        expect(packages).toHaveBeenCalledTimes(1);
      });
      packages.mockReturnValueOnce(held.promise);
      await submitNamedPair();
      await waitFor(() => {
        expect(packages).toHaveBeenCalledTimes(2);
      });
      const location = window.location.href;
      view.showFeatures(PROJECT_FEATURES_OFF);
      view.showFeatures(PROJECT_FEATURES_ON);
      await act(async () => {
        held.resolve(await readPackages());
        await Promise.resolve();
      });
      expect(packages).toHaveBeenCalledTimes(2);
      expect(localStorage.getItem('wbs.workPackage')).toBeNull();
      expect(window.location.href).toBe(location);
      expect(screen.queryByRole('dialog', { name: 'New project' })).toBeNull();
      expect(picker()).toHaveValue('');
    },
  );

  for (const settlement of ['success', 'failure'] as const) {
    itDom(
      `retires standalone creation ${settlement} without a stale reload or rename`,
      async () => {
        const api = fakeWorkPackages(TWO);
        const applyCreation = api.createWorkPackage.bind(api);
        const held = holdCombinedAnswer<CreatedWorkPackage>();
        const create = vi.fn(() => held.promise);
        api.createWorkPackage = create;
        const packages = vi.fn(api.listWorkPackages.bind(api));
        api.listWorkPackages = packages;
        const view = renderPageWithProjectFeatures(api, PROJECT_FEATURES_ON);
        await selectWorkPackage('p2');
        await chooseFixtureProject();
        fireEvent.click(
          within(screen.getByRole('banner')).getByRole('button', {
            name: 'Create new work package',
          }),
        );
        await waitFor(() => {
          expect(create).toHaveBeenCalledTimes(1);
        });
        const remembered = localStorage.getItem('wbs.workPackage');
        const listed = packages.mock.calls.length;
        view.showFeatures(PROJECT_FEATURES_OFF);
        view.showFeatures(PROJECT_FEATURES_ON);
        await act(async () => {
          if (settlement === 'success')
            held.resolve(await applyCreation('fixture-project', 'New work package'));
          else held.reject(new Error('departed standalone failure'));
          await Promise.resolve();
        });
        expect(packages).toHaveBeenCalledTimes(listed);
        expect(localStorage.getItem('wbs.workPackage')).toBe(remembered);
        expect(picker()).toHaveValue('Paint the fence');
        expect(screen.queryByLabelText('Work package name')).toBeNull();
        expect(screen.queryByText('departed standalone failure')).toBeNull();
      },
    );
  }

  itDom(
    'withdraws an actual held FileReader even after fresh availability and destination return',
    async () => {
      const api = fakeWorkPackageApi();
      const imported = vi.fn(() => Promise.resolve(IMPORTED));
      api.importPlan = imported;
      let finishRead: () => void = () => {
        throw new Error('held FileReader not acquired');
      };
      vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
        Object.defineProperty(this, 'result', {
          configurable: true,
          value: JSON.stringify(IMPORTABLE_PLAN),
        });
        finishRead = () => {
          this.dispatchEvent(new ProgressEvent('load'));
        };
      });
      const view = renderPageWithProjectFeatures(api, PROJECT_FEATURES_ON);
      await importFile();
      view.showFeatures(PROJECT_FEATURES_OFF);
      view.showFeatures(PROJECT_FEATURES_ON);
      await chooseFixtureProject();
      await act(async () => {
        finishRead();
        await Promise.resolve();
      });
      expect(imported).not.toHaveBeenCalled();
      expect(toastTexts()).toEqual([]);
    },
  );

  for (const settlement of ['success', 'failure'] as const) {
    itDom(
      `withdraws an already-sent import ${settlement} without stale reload or toast`,
      async () => {
        const api = fakeWorkPackageApi();
        const held = holdCombinedAnswer<PlanImportSummary>();
        const imported = vi.fn(() => held.promise);
        api.importPlan = imported;
        const packages = vi.fn(api.listWorkPackages.bind(api));
        api.listWorkPackages = packages;
        const view = renderPageWithProjectFeatures(api, PROJECT_FEATURES_ON);
        await importFile();
        await waitFor(() => {
          expect(imported).toHaveBeenCalledTimes(1);
        });
        const listed = packages.mock.calls.length;
        const remembered = localStorage.getItem('wbs.workPackage');
        view.showFeatures(PROJECT_FEATURES_OFF);
        view.showFeatures(PROJECT_FEATURES_ON);
        await chooseFixtureProject();
        await act(async () => {
          if (settlement === 'success') held.resolve(IMPORTED);
          else held.reject(new Error('departed import failure'));
          await Promise.resolve();
        });
        expect(packages).toHaveBeenCalledTimes(listed);
        expect(toastTexts()).toEqual([]);
        expect(localStorage.getItem('wbs.workPackage')).toBe(remembered);
      },
    );
  }
});

describe('Project availability before any replacement attempt', () => {
  for (const settlement of ['success', 'failure'] as const) {
    itDom(
      `discards an old POST ${settlement} after availability restoration before any new dialog opens`,
      async () => {
        const fixture = await emptyCombinedCatalog();
        const applyCreation = fixture.create.getMockImplementation();
        if (applyCreation === undefined)
          throw new Error('Actual fixture creation implementation absent');
        const readProjects = fixture.api.listProjects.bind(fixture.api);
        const readPackages = fixture.api.listWorkPackages.bind(fixture.api);
        const projects = vi.fn(readProjects);
        const packages = vi.fn(readPackages);
        fixture.api.listProjects = projects;
        fixture.api.listWorkPackages = packages;
        const post = holdCombinedAnswer<Awaited<ReturnType<typeof fixture.create>>>();
        fixture.create.mockReturnValueOnce(post.promise);
        const view = renderPageWithProjectFeatures(fixture.api, PROJECT_FEATURES_ON);
        openWorkPackageActions();
        await screen.findByText(/No projects are available to you/);
        await submitNamedPair('Departed Project', 'Departed child');
        await waitFor(() => {
          expect(fixture.create).toHaveBeenCalledTimes(1);
        });
        window.history.replaceState(
          null,
          '',
          '/?workPackage=prior-url&stepNode=prior-step&workItem=prior-item',
        );
        const priorUrl = window.location.href;
        const remembered = localStorage.getItem('wbs.workPackage');
        const restoredRead = holdCombinedAnswer<Awaited<ReturnType<typeof readProjects>>>();
        let restoredResponse: ReturnType<typeof readProjects> | undefined;
        if (settlement === 'success') {
          projects.mockImplementationOnce(() => {
            restoredResponse = readProjects();
            return restoredRead.promise;
          });
        }
        view.showFeatures(PROJECT_FEATURES_OFF);
        expect(screen.queryByRole('dialog', { name: 'New project' })).toBeNull();
        view.showFeatures(PROJECT_FEATURES_ON);
        await waitFor(() => {
          expect(projects).toHaveBeenCalledTimes(2);
        });
        openWorkPackageActions();
        if (settlement === 'success') expect(screen.getByText('Loading projects…')).toBeVisible();
        else await screen.findByText(/No projects are available to you/);
        expect(screen.queryByRole('dialog', { name: 'New project' })).toBeNull();
        expect(packages).toHaveBeenCalledTimes(1);
        await act(async () => {
          if (settlement === 'success')
            post.resolve(await applyCreation('Departed Project', 'Departed child'));
          else post.reject(new Error('departed POST outcome unavailable'));
          await Promise.resolve();
        });
        if (settlement === 'success') {
          expect(screen.getByText('Loading projects…')).toBeVisible();
          const response = restoredResponse;
          if (response === undefined)
            throw new Error('Actual restored Project read was not acquired');
          await act(async () => {
            restoredRead.resolve(await response);
            await restoredRead.promise;
          });
          expect(screen.queryByText('Loading projects…')).toBeNull();
          expect(screen.getByText(/No projects are available to you/)).toBeVisible();
        }
        expect(projects).toHaveBeenCalledTimes(2);
        expect(packages).toHaveBeenCalledTimes(1);
        expect(fixture.create).toHaveBeenCalledExactlyOnceWith(
          'Departed Project',
          'Departed child',
        );
        expect(fixture.standalone).not.toHaveBeenCalled();
        expect(fixture.rename).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog', { name: 'New project' })).toBeNull();
        expect(screen.queryByText(/Creation could not be confirmed/)).toBeNull();
        expect(screen.queryByText('departed POST outcome unavailable')).toBeNull();
        expect(screen.queryByLabelText('Work package name')).toBeNull();
        expect(picker()).toHaveValue('');
        expect(screen.queryByRole('combobox', { name: 'Destination project' })).toBeNull();
        expect(screen.getByText(/No projects are available to you/)).toBeVisible();
        expect(screen.getByRole('button', { name: 'Refresh projects' })).toBeVisible();
        expect(localStorage.getItem('wbs.workPackage')).toBe(remembered);
        expect(window.location.href).toBe(priorUrl);
        const recordedProjects = await readProjects();
        const recordedPackages = await readPackages();
        if (settlement === 'success') {
          expect(recordedProjects).toHaveLength(1);
          expect(recordedPackages).toHaveLength(1);
          const project = recordedProjects.at(0);
          const workPackage = recordedPackages.at(0);
          if (project === undefined || workPackage === undefined)
            throw new Error('Actual fixture did not retain the committed pair');
          expect(project.name).toBe('Departed Project');
          expect(workPackage.name).toBe('Departed child');
          expect(workPackage.projectId).toBe(project.id);
        } else {
          expect(recordedProjects).toEqual([]);
          expect(recordedPackages).toEqual([]);
        }
      },
    );
  }
});

itDom(
  'groups actual readable packages under a shell label and keeps its destination explicit',
  async () => {
    const api = fakeWorkPackages(TWO);
    const projects = vi.fn(() =>
      Promise.resolve([{ id: 'fixture-project', name: 'Package-only parent' }]),
    );
    api.listProjects = projects;
    pageWith(api);
    openWorkPackageActions();
    await screen.findByRole('option', { name: 'Package-only parent' });
    expect(screen.getByRole('combobox', { name: 'Destination project' })).toHaveValue('');
    openPicker();
    const list = await screen.findByRole('listbox', { name: 'Work packages' });
    expect(within(list).getByRole('group', { name: 'Package-only parent' })).toBeVisible();
    expect(within(list).queryByRole('group', { name: 'Project details unavailable' })).toBeNull();
    openWorkPackageActions();
    fireEvent.change(screen.getByRole('combobox', { name: 'Destination project' }), {
      target: { value: 'fixture-project' },
    });
    expect(screen.getByRole('combobox', { name: 'Destination project' })).toHaveValue(
      'fixture-project',
    );
    expect(projects).toHaveBeenCalledTimes(1);
  },
);
