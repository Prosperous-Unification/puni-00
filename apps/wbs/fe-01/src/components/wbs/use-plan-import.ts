import { type ChangeEventHandler, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  planDocumentRequestFromJson,
  type PlanImportOptions,
  type WorkPackageListEntry,
} from '@/lib/wbs-api';
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
  defineMissing: boolean;
  setDefineMissing: (enabled: boolean) => void;
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
 *
 * The catalog/publication owns one admitted read through settlement. Definition
 * consent additionally belongs to the selected project: changing that visible choice
 * retires its callbacks and future consent while the admitted request retains its
 * captured destination and option. Publication replacement or unmount still fences
 * all work and visible effects from the retired publication.
 * {@link PlanImportOptions} never substitutes for the server's current grant check.
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
  // Proof: import-fault-publication-{project,catalog,callback}-key-v122b each
  // failed its captured-request or replacement case, then passed restored.
  const publication = useMemo(() => ({ catalog, isCurrent }), [catalog, isCurrent]);
  // Proof: import-fault-choice-project-key-v122b retained old consent after project replacement.
  const choice = useMemo(() => ({ publication, projectId }), [publication, projectId]);
  const [definitionChoice, setDefinitionChoice] = useState<{
    owner: typeof choice;
    enabled: boolean;
  } | null>(null);
  const [busyPublication, setBusyPublication] = useState<typeof publication | null>(null);
  const admittedPublication = useRef<typeof publication | null>(null);
  const currentPublication = useRef<typeof publication | null>(publication);
  const currentChoice = useRef(choice);
  currentPublication.current = publication;
  currentChoice.current = choice;
  const currentWorkPackage = useRef(selectedWorkPackageId);
  const currentWorkPackages = useRef(workPackages);
  /** The key of the error toast the last failed attempt raised, until an attempt settles again. */
  const lastFailure = useRef<string | null>(null);

  // Proof: import-fault-publication-{scope,current}-v122b each submitted through
  // its retired catalog or withdrawn publication; both own refusals passed restored.
  const canPublish = useCallback(
    () => currentPublication.current === publication && isCurrent(),
    [isCurrent, publication],
  );
  // Proof: import-fault-choice-view-v122b exposed the previous project's consent.
  const defineMissing = definitionChoice?.owner === choice && definitionChoice.enabled;
  const setDefineMissing = useCallback(
    (enabled: boolean) => {
      // Proof: import-fault-choice-{setter,project-admission,busy}-v122b each
      // failed the old-setter, absent-project or held-read assertion independently.
      if (
        currentChoice.current !== choice ||
        !canPublish() ||
        projectId === null ||
        admittedPublication.current === publication
      )
        return;
      setDefinitionChoice({ owner: choice, enabled });
    },
    [canPublish, choice, projectId, publication],
  );

  useEffect(() => {
    currentWorkPackage.current = selectedWorkPackageId;
  }, [selectedWorkPackageId]);

  useEffect(() => {
    currentWorkPackages.current = workPackages;
  }, [workPackages]);

  useEffect(() => {
    currentPublication.current = publication;
    return () => {
      // Proof: import-fault-unmount-release-v122c submitted after this surface unmounted.
      if (currentPublication.current === publication) currentPublication.current = null;
    };
  }, [publication]);

  const chooseFile = useCallback<ChangeEventHandler<HTMLInputElement>>(
    (event) => {
      // Proof: import-fault-choice-file-v122b let the retired destination callback start a read.
      if (currentChoice.current !== choice || !canPublish()) return;
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
      // Proof: import-fault-file-admission-v122c admitted two reads across a destination change.
      if (admittedPublication.current === publication) {
        input.value = '';
        return;
      }
      admittedPublication.current = publication;
      setBusyPublication(publication);
      const options: PlanImportOptions = { defineMissing };
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
          const summary = await catalog.importPlan(
            destinationProjectId,
            {
              ...parsed,
              settings: { ...parsed.settings, name },
            },
            options,
          );
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
          // Proof: import-finally-fault-v122e made this comparison unconditional;
          // the same-hook/input case lost the new file value, then passed restored.
          // Proof: removing this reset left the browser-model file path set and
          // the same-file case completed one attempt, not two. Observed 2026-09-14.
          // Proof: import-finally-fault-v122e cleared the new owner's exact file value
          // on the same hook/input. The earlier page-only witness survived and is excluded.
          if (admittedPublication.current === publication) {
            input.value = '';
            admittedPublication.current = null;
            if (canPublish()) {
              setBusyPublication(null);
              // Proof: omitting this reset left consent checked after malformed
              // JSON in the actual page (catalogue-browser-fault-choice-reset-v1).
              setDefinitionChoice(null);
            }
          }
        }
      })();
    },
    [
      catalog,
      canPublish,
      choice,
      dismissToast,
      defineMissing,
      fetchWorkPackages,
      installWorkPackages,
      openWorkPackage,
      pushToast,
      projectId,
      publication,
      selectedWorkPackageId,
    ],
  );

  return {
    // Proof: import-fault-busy-view-v122c showed false during the held admitted read.
    busy: busyPublication === publication,
    canImport: projectId !== null,
    defineMissing,
    setDefineMissing,
    chooseFile,
  };
}
