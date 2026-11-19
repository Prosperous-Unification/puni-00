import { type ChangeEventHandler, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { planDocumentRequestFromJson, type WorkPackageListEntry } from '@/lib/wbs-api';
import type { WorkPackageCatalog } from '@/modules/work-package/contract';

import {
  distinctImportName,
  importRefusalSentence,
  importSummarySentence,
} from './plan-import-words';
import { type Toast, toastKey, type ToastStackApi } from './toasts';

const readPlanJson = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('file_read_failed'));
    };
    // Proof: removing this rejection made `reports an asynchronous file read
    // failure without submitting` time out with no toast. Observed 2026-09-14.
    reader.onerror = () => {
      reject(new Error('file_read_failed'));
    };
    reader.onabort = () => {
      reject(new Error('file_read_failed'));
    };
    reader.readAsText(file);
  });

export interface PlanImportControl {
  busy: boolean;
  canImport: boolean;
  chooseFile: ChangeEventHandler<HTMLInputElement>;
}

/**
 * Owns one archival import attempt across the keyed plan table's lifetime.
 *
 * The plan is created under {@link distinctImportName} of the file's name
 * against `workPackages` (the catalogue on screen), opened when the reader is
 * still on the work package they imported from, and reported by its name. Each
 * attempt's outcome replaces the previous attempt's error toast, so a stale
 * refusal never sits above a later success.
 */
export function usePlanImport({
  catalog,
  isCurrent,
  projectId,
  selectedWorkPackageId,
  workPackages,
  fetchWorkPackages,
  installWorkPackages,
  openWorkPackage,
  pushToast,
  dismissToast,
}: {
  catalog: WorkPackageCatalog;
  /** Captured page publication lifetime; catalog identity alone does not fence a combined commit. */
  isCurrent: () => boolean;
  projectId: string | null;
  selectedWorkPackageId: string | null;
  workPackages: readonly WorkPackageListEntry[];
  fetchWorkPackages: () => Promise<WorkPackageListEntry[]>;
  installWorkPackages: (workPackages: WorkPackageListEntry[]) => void;
  openWorkPackage: (workPackageId: string) => void;
  pushToast: ToastStackApi['pushToast'];
  dismissToast: ToastStackApi['dismissToast'];
}): PlanImportControl {
  const lifetime = useMemo(() => ({ catalog, isCurrent }), [catalog, isCurrent]);
  const [busyLifetime, setBusyLifetime] = useState<object | null>(null);
  const admittedLifetime = useRef<object | null>(null);
  const currentLifetime = useRef<object | null>(lifetime);
  currentLifetime.current = lifetime;
  const currentWorkPackage = useRef(selectedWorkPackageId);
  const currentWorkPackages = useRef(workPackages);
  /** The key of the error toast the last failed attempt raised, until an attempt settles again. */
  const lastFailure = useRef<string | null>(null);

  useEffect(() => {
    currentWorkPackage.current = selectedWorkPackageId;
  }, [selectedWorkPackageId]);

  useEffect(() => {
    currentWorkPackages.current = workPackages;
  }, [workPackages]);

  useEffect(() => {
    currentLifetime.current = lifetime;
    return () => {
      if (currentLifetime.current === lifetime) currentLifetime.current = null;
    };
  }, [lifetime]);

  const chooseFile = useCallback<ChangeEventHandler<HTMLInputElement>>(
    (event) => {
      const canPublish = () => currentLifetime.current === lifetime && isCurrent();
      if (!canPublish()) return;
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (file === undefined) return;
      if (projectId === null) {
        input.value = '';
        return;
      }
      const destinationProjectId = projectId;
      // Proof: removing this synchronous admission made two rapid changes call
      // `readAsText` twice; the page expected one read. Observed 2026-09-14.
      if (admittedLifetime.current === lifetime) {
        input.value = '';
        return;
      }
      admittedLifetime.current = lifetime;
      setBusyLifetime(lifetime);
      const sourceWorkPackageId = selectedWorkPackageId;
      /** Says how this attempt ended, taking the previous attempt's error off first. */
      const report = (toast: Toast): void => {
        if (!canPublish()) return;
        // Proof: without this dismissal, `takes a stale refusal off when a later
        // import succeeds` failed on `expected [ …(2) ] to deeply equal
        // [ Array(1) ]`: the refusal still stood above the success. Observed 2026-10-15.
        if (lastFailure.current !== null) dismissToast(lastFailure.current);
        if (!canPublish()) return;
        lastFailure.current = toast.kind === 'error' ? toastKey(toast) : null;
        pushToast(toast);
      };
      void (async () => {
        try {
          const source = await readPlanJson(file);
          // Proof: removing this post-read boundary and the pre-write boundary
          // below submitted one write through the replaced API. Observed
          // 2026-09-14.
          if (!canPublish()) return;
          const parsed = await planDocumentRequestFromJson(source);
          if (!canPublish()) return;
          const name = distinctImportName(
            parsed.settings.name,
            currentWorkPackages.current.map((workPackage) => workPackage.name),
            new Date(),
          );
          if (!canPublish()) return;
          const summary = await catalog.importPlan(destinationProjectId, {
            ...parsed,
            settings: { ...parsed.settings, name },
          });
          if (!canPublish()) return;
          const catalogue = await fetchWorkPackages();
          // Proof: installing before this post-fetch boundary let exact stale
          // work package `p3` replace the new lifetime's picker. Observed 2026-09-14.
          if (!canPublish()) return;
          installWorkPackages(catalogue);
          if (!canPublish()) return;
          const imported = catalogue.find(
            (workPackage) => workPackage.id === summary.workPackageId,
          );
          if (imported === undefined) throw new Error('imported_work_package_missing');
          // Proof: removing this ownership comparison navigated from exact p2
          // back to the completed import p3. Observed 2026-09-14.
          if (!canPublish()) return;
          if (currentWorkPackage.current === sourceWorkPackageId)
            openWorkPackage(summary.workPackageId);
          if (!canPublish()) return;
          report({ kind: 'info', text: importSummarySentence(summary, imported.name) });
        } catch (thrown: unknown) {
          if (!canPublish()) return;
          report({ kind: 'error', text: importRefusalSentence(thrown) });
        } finally {
          // Proof: removing this reset left the browser-model file path set and
          // the same-file case completed one attempt, not two. Observed 2026-09-14.
          if (admittedLifetime.current === lifetime) {
            input.value = '';
            admittedLifetime.current = null;
            if (canPublish()) setBusyLifetime(null);
          }
        }
      })();
    },
    [
      catalog,
      dismissToast,
      fetchWorkPackages,
      installWorkPackages,
      isCurrent,
      lifetime,
      openWorkPackage,
      pushToast,
      projectId,
      selectedWorkPackageId,
    ],
  );

  return { busy: busyLifetime === lifetime, canImport: projectId !== null, chooseFile };
}
