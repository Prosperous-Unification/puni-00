import { act, renderHook, waitFor } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { httpWorkPackageApi } from '@/lib/wbs-api';
import { createWorkPackageCatalog } from '@/modules/work-package/work-package-catalog.feature';

import { usePlanImport } from './use-plan-import';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Real hook and catalog; choice and held-reader cases never dispatch an import request. */
function openChoiceHook(projectId: string | null = 'project-a') {
  const catalog = createWorkPackageCatalog({
    routes: httpWorkPackageApi('token'),
    isCurrent: () => true,
  });
  let current = true;
  const isCurrent = () => current;
  const opened = renderHook(
    ({ destination }: { destination: string | null }) =>
      usePlanImport({
        catalog,
        isCurrent,
        projectId: destination,
        selectedWorkPackageId: null,
        workPackages: [],
        fetchWorkPackages: () => Promise.reject(new Error('unexpected read')),
        installWorkPackages: vi.fn(),
        openWorkPackage: vi.fn(),
        pushToast: vi.fn(),
        dismissToast: vi.fn(),
      }),
    { initialProps: { destination: projectId } },
  );
  return {
    ...opened,
    withdraw: () => {
      current = false;
    },
  };
}

describe('catalogue import choice lifetime', () => {
  it('refuses a retained choice edit while an admitted file is being read', async () => {
    let failRead: () => void = () => {
      throw new Error('The real hook did not start reading');
    };
    vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
      failRead = () => {
        this.dispatchEvent(new ProgressEvent('error'));
      };
    });
    const opened = openChoiceHook();
    act(() => {
      opened.result.current.setDefineMissing(true);
    });
    const retained = opened.result.current.setDefineMissing;
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [new File(['unread'], 'plan.json')] });
    act(() => {
      opened.result.current.chooseFile({ currentTarget: input } as ChangeEvent<HTMLInputElement>);
    });
    expect(opened.result.current.busy).toBe(true);
    act(() => {
      retained(false);
    });
    const consentDuringRead = opened.result.current.defineMissing;
    await act(async () => {
      failRead();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(opened.result.current.busy).toBe(false);
    });
    expect(consentDuringRead).toBe(true);
    expect(opened.result.current.defineMissing).toBe(false);
  });

  it('refuses a choice without a destination even through a retained callback', () => {
    const opened = openChoiceHook(null);
    act(() => {
      opened.result.current.setDefineMissing(true);
    });
    expect(opened.result.current.defineMissing).toBe(false);
  });

  it('refuses a choice after actual publication withdrawal without a rerender', () => {
    const opened = openChoiceHook();
    const retained = opened.result.current.setDefineMissing;
    opened.withdraw();
    act(() => {
      retained(true);
    });
    expect(opened.result.current.defineMissing).toBe(false);
  });

  it('resets when only the actual project changes and rejects the old setter', () => {
    const opened = openChoiceHook();
    const retained = opened.result.current.setDefineMissing;
    act(() => {
      retained(true);
    });
    expect(opened.result.current.defineMissing).toBe(true);
    opened.rerender({ destination: 'project-b' });
    expect(opened.result.current.defineMissing).toBe(false);
    act(() => {
      opened.result.current.setDefineMissing(true);
    });
    act(() => {
      retained(false);
    });
    expect(opened.result.current.defineMissing).toBe(true);
  });

  it('retires a file callback from the previous destination before another read can start', async () => {
    const readers: FileReader[] = [];
    const reading = vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (
      this: FileReader,
    ) {
      readers.push(this);
    });
    const opened = openChoiceHook();
    const retained = opened.result.current.chooseFile;
    opened.rerender({ destination: 'project-b' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [new File(['unread'], 'plan.json')] });
    await act(async () => {
      retained({ currentTarget: input } as ChangeEvent<HTMLInputElement>);
      for (const reader of readers) reader.dispatchEvent(new ProgressEvent('error'));
      await Promise.resolve();
    });
    expect(reading).not.toHaveBeenCalled();
    expect(opened.result.current.busy).toBe(false);
  });
});
