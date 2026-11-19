import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PlanDocumentRequest } from '@wbs/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { usePlanImport } from '@/components/wbs/use-plan-import';
import type { PlanImportSummary, WorkPackageListEntry } from '@/lib/wbs-api';
import type { WorkPackageCatalog } from '@/modules/work-package/contract';
import { createWorkPackageCatalog } from '@/modules/work-package/work-package-catalog.feature';
import { fakeWorkPackageApi } from '@/testing/fake-work-package-api';
import archivalPlan from '@/testing/fixtures/connected-transfer.json';

import { ProjectPicker } from './project-picker';

/** This fixture has no page publication epoch; catalog replacement remains hook-owned. */
const isImportFixtureCurrent = () => true;

const project = {
  id: 'parent-a',
  organizationId: 'organization-a',
  spaceId: null,
  spacePosition: null,
  name: 'Project A',
  revision: 0,
  createdAt: 1,
  updatedAt: null,
  createdBy: null,
  workPackageCount: 0,
};
const summary: PlanImportSummary = {
  workPackageId: 'imported',
  rows: 0,
  created: { teams: [], people: [], tags: [], services: [], types: [], externalSystems: [] },
  solutionRef: 'none',
};
const imported: WorkPackageListEntry = {
  id: 'imported',
  projectId: 'parent-a',
  name: 'Imported',
  restricted: false,
  abbreviation: 'PLAN',
  startDate: null,
  lastOpenedAt: null,
  createdByName: 'Fixture creator',
  createdAt: 1,
};
const file = new File([JSON.stringify(archivalPlan)], 'same-plan.json', {
  type: 'application/json',
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('explicit destination picker', () => {
  it('renders loading, empty and failed reads without an invented selection', () => {
    const choose = vi.fn();
    const refresh = vi.fn();
    const view = render(
      <ProjectPicker
        choices={{ kind: 'loading' }}
        selectedId={null}
        onChoose={choose}
        onRefresh={refresh}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading projects');
    view.rerender(
      <ProjectPicker
        choices={{ kind: 'ready', projects: [] }}
        selectedId={null}
        onChoose={choose}
        onRefresh={refresh}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('No projects are available to you');
    expect(screen.queryByRole('combobox')).toBeNull();
    view.rerender(
      <ProjectPicker
        choices={{ kind: 'refused', message: 'Choose an active organization.' }}
        selectedId={null}
        onChoose={choose}
        onRefresh={refresh}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an active organization.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry projects' }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(choose).not.toHaveBeenCalled();
  });

  it('requires an explicit choice even for one row, and lets the reader clear it', () => {
    const choose = vi.fn();
    const view = render(
      <ProjectPicker
        choices={{ kind: 'ready', projects: [project] }}
        selectedId={null}
        onChoose={choose}
        onRefresh={vi.fn()}
      />,
    );
    const destination = screen.getByRole('combobox', { name: 'Destination project' });
    expect(destination).toHaveValue('');
    expect(choose).not.toHaveBeenCalled();
    fireEvent.change(destination, { target: { value: 'parent-a' } });
    expect(choose).toHaveBeenLastCalledWith('parent-a');
    view.rerender(
      <ProjectPicker
        choices={{ kind: 'ready', projects: [project] }}
        selectedId="parent-a"
        onChoose={choose}
        onRefresh={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    expect(choose).toHaveBeenLastCalledWith(null);
  });
});

function importFixture() {
  const api = fakeWorkPackageApi();
  const submit = vi.fn<
    (projectId: string, document: PlanDocumentRequest) => Promise<PlanImportSummary>
  >(() => Promise.resolve(summary));
  api.importPlan = submit;
  const catalog = createWorkPackageCatalog({ routes: api, isCurrent: () => true });
  const install = vi.fn();
  const open = vi.fn();
  const report = vi.fn();
  function ImportProbe({
    parent,
    source = catalog,
  }: {
    parent: string | null;
    source?: WorkPackageCatalog;
  }) {
    const control = usePlanImport({
      catalog: source,
      isCurrent: isImportFixtureCurrent,
      projectId: parent,
      selectedWorkPackageId: null,
      workPackages: [],
      fetchWorkPackages: () => Promise.resolve([imported]),
      installWorkPackages: install,
      openWorkPackage: open,
      pushToast: report,
      dismissToast: vi.fn(),
    });
    return <input type="file" aria-label="Import test plan" onChange={control.chooseFile} />;
  }
  return { api, submit, catalog, install, open, report, ImportProbe };
}

function holdFile() {
  let finish: () => void = () => {
    throw new Error('file read has not begun');
  };
  const reading = vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (
    this: FileReader,
  ) {
    Object.defineProperty(this, 'result', {
      configurable: true,
      value: JSON.stringify(archivalPlan),
    });
    finish = () => this.dispatchEvent(new ProgressEvent('load'));
  });
  return {
    reading,
    finish: () => {
      finish();
    },
  };
}

describe('import destination retention', () => {
  it('clears a missing-parent selection without reading, then accepts the same file after explicit selection', async () => {
    const fixture = importFixture();
    const held = holdFile();
    const view = render(<fixture.ImportProbe parent={null} />);
    const input = screen.getByLabelText('Import test plan');
    Object.defineProperty(input, 'value', {
      configurable: true,
      writable: true,
      value: 'same-plan.json',
    });
    fireEvent.change(input, { target: { files: [file] } });
    expect(input).toHaveValue('');
    expect(held.reading).not.toHaveBeenCalled();
    expect(fixture.submit).not.toHaveBeenCalled();
    view.rerender(<fixture.ImportProbe parent="parent-a" />);
    fireEvent.change(input, { target: { files: [file] } });
    await act(() => {
      held.finish();
      return Promise.resolve();
    });
    await waitFor(() => {
      expect(fixture.submit).toHaveBeenCalledTimes(1);
    });
    expect(fixture.submit.mock.calls[0]?.[0]).toBe('parent-a');
    expect(fixture.open).toHaveBeenCalledExactlyOnceWith('imported');
  });

  it('retains the selected parent before FileReader even when the visible choice changes', async () => {
    const fixture = importFixture();
    const held = holdFile();
    const view = render(<fixture.ImportProbe parent="parent-a" />);
    fireEvent.change(screen.getByLabelText('Import test plan'), { target: { files: [file] } });
    view.rerender(<fixture.ImportProbe parent="parent-b" />);
    await act(() => {
      held.finish();
      return Promise.resolve();
    });
    await waitFor(() => {
      expect(fixture.submit).toHaveBeenCalledTimes(1);
    });
    expect(fixture.submit.mock.calls[0]?.[0]).toBe('parent-a');
  });

  it('does not submit a held file into a replaced catalog', async () => {
    const fixture = importFixture();
    const held = holdFile();
    const view = render(<fixture.ImportProbe parent="parent-a" />);
    fireEvent.change(screen.getByLabelText('Import test plan'), { target: { files: [file] } });
    const replacement = createWorkPackageCatalog({
      routes: fakeWorkPackageApi(),
      isCurrent: () => true,
    });
    view.rerender(<fixture.ImportProbe parent="parent-a" source={replacement} />);
    await act(() => {
      held.finish();
      return Promise.resolve();
    });
    expect(fixture.submit).not.toHaveBeenCalled();
    expect(fixture.install).not.toHaveBeenCalled();
    expect(fixture.open).not.toHaveBeenCalled();
    expect(fixture.report).not.toHaveBeenCalled();
  });
});

describe('inactive Project availability', () => {
  it('renders unavailable without an empty-success selection or retry action', () => {
    const choose = vi.fn();
    const refresh = vi.fn();
    render(
      <ProjectPicker
        choices={{ kind: 'inactive' }}
        selectedId="parent-a"
        onChoose={choose}
        onRefresh={refresh}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Project actions are unavailable in this mode.',
    );
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry projects' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh projects' })).toBeNull();
    expect(screen.queryByText(/No projects are available to you/)).toBeNull();
    expect(choose).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});

it('offers a genuine shell as an explicit named destination without full project metadata', () => {
  const choose = vi.fn(),
    refresh = vi.fn();
  render(
    <ProjectPicker
      choices={{ kind: 'ready', projects: [{ id: 'shell', name: 'Package-only parent' }] }}
      selectedId={null}
      onChoose={choose}
      onRefresh={refresh}
    />,
  );
  expect(screen.getByRole('combobox', { name: 'Destination project' })).toHaveValue('');
  expect(screen.getByRole('option', { name: 'Package-only parent' })).toHaveValue('shell');
  expect(choose).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('combobox', { name: 'Destination project' }), {
    target: { value: 'shell' },
  });
  expect(choose).toHaveBeenCalledExactlyOnceWith('shell');
  expect(refresh).not.toHaveBeenCalled();
});
