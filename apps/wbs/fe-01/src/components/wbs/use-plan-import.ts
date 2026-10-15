import { type ChangeEventHandler, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { planDocumentRequestFromJson, type ProjectListEntry } from '@/lib/wbs-api';
import type { ProjectCatalog } from '@/modules/project/contract';

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
  chooseFile: ChangeEventHandler<HTMLInputElement>;
}

/**
 * Owns one archival import attempt across the keyed plan table's lifetime.
 *
 * The plan is created under {@link distinctImportName} of the file's name
 * against `projects` (the catalogue on screen), opened when the reader is
 * still on the project they imported from, and reported by its name. Each
 * attempt's outcome replaces the previous attempt's error toast, so a stale
 * refusal never sits above a later success.
 */
export function usePlanImport({
  catalog,
  selectedProjectId,
  projects,
  fetchProjects,
  installProjects,
  openProject,
  pushToast,
  dismissToast,
}: {
  catalog: ProjectCatalog;
  selectedProjectId: string | null;
  projects: readonly ProjectListEntry[];
  fetchProjects: () => Promise<ProjectListEntry[]>;
  installProjects: (projects: ProjectListEntry[]) => void;
  openProject: (projectId: string) => void;
  pushToast: ToastStackApi['pushToast'];
  dismissToast: ToastStackApi['dismissToast'];
}): PlanImportControl {
  const lifetime = useMemo(() => ({ catalog }), [catalog]);
  const [busyLifetime, setBusyLifetime] = useState<object | null>(null);
  const admittedLifetime = useRef<object | null>(null);
  const currentLifetime = useRef<object | null>(lifetime);
  const currentProject = useRef(selectedProjectId);
  const currentProjects = useRef(projects);
  /** The key of the error toast the last failed attempt raised, until an attempt settles again. */
  const lastFailure = useRef<string | null>(null);

  useEffect(() => {
    currentProject.current = selectedProjectId;
  }, [selectedProjectId]);

  useEffect(() => {
    currentProjects.current = projects;
  }, [projects]);

  useEffect(() => {
    currentLifetime.current = lifetime;
    return () => {
      if (currentLifetime.current === lifetime) currentLifetime.current = null;
    };
  }, [lifetime]);

  const chooseFile = useCallback<ChangeEventHandler<HTMLInputElement>>(
    (event) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (file === undefined) return;
      // Proof: removing this synchronous admission made two rapid changes call
      // `readAsText` twice; the page expected one read. Observed 2026-09-14.
      if (admittedLifetime.current === lifetime) {
        input.value = '';
        return;
      }
      admittedLifetime.current = lifetime;
      setBusyLifetime(lifetime);
      const sourceProjectId = selectedProjectId;
      /** Says how this attempt ended, taking the previous attempt's error off first. */
      const report = (toast: Toast): void => {
        // Proof: without this dismissal, `takes a stale refusal off when a later
        // import succeeds` failed on `expected [ …(2) ] to deeply equal
        // [ Array(1) ]`: the refusal still stood above the success. Observed 2026-10-15.
        if (lastFailure.current !== null) dismissToast(lastFailure.current);
        lastFailure.current = toast.kind === 'error' ? toastKey(toast) : null;
        pushToast(toast);
      };
      void (async () => {
        try {
          const source = await readPlanJson(file);
          // Proof: removing this post-read boundary and the pre-write boundary
          // below submitted one write through the replaced API. Observed
          // 2026-09-14.
          if (currentLifetime.current !== lifetime) return;
          const parsed = await planDocumentRequestFromJson(source);
          if (currentLifetime.current !== lifetime) return;
          const name = distinctImportName(
            parsed.settings.name,
            currentProjects.current.map((project) => project.name),
            new Date(),
          );
          const summary = await catalog.importPlan({
            ...parsed,
            settings: { ...parsed.settings, name },
          });
          if (currentLifetime.current !== lifetime) return;
          const catalogue = await fetchProjects();
          // Proof: installing before this post-fetch boundary let exact stale
          // project `p3` replace the new lifetime's picker. Observed 2026-09-14.
          if (currentLifetime.current !== lifetime) return;
          installProjects(catalogue);
          if (currentLifetime.current !== lifetime) return;
          const imported = catalogue.find((project) => project.id === summary.projectId);
          if (imported === undefined) throw new Error('imported_project_missing');
          // Proof: removing this ownership comparison navigated from exact p2
          // back to the completed import p3. Observed 2026-09-14.
          if (currentLifetime.current !== lifetime) return;
          if (currentProject.current === sourceProjectId) openProject(summary.projectId);
          if (currentLifetime.current !== lifetime) return;
          report({ kind: 'info', text: importSummarySentence(summary, imported.name) });
        } catch (thrown: unknown) {
          if (currentLifetime.current !== lifetime) return;
          report({ kind: 'error', text: importRefusalSentence(thrown) });
        } finally {
          // Proof: removing this reset left the browser-model file path set and
          // the same-file case completed one attempt, not two. Observed 2026-09-14.
          input.value = '';
          if (currentLifetime.current === lifetime) {
            admittedLifetime.current = null;
            setBusyLifetime(null);
          }
        }
      })();
    },
    [
      catalog,
      dismissToast,
      fetchProjects,
      installProjects,
      lifetime,
      openProject,
      pushToast,
      selectedProjectId,
    ],
  );

  return { busy: busyLifetime === lifetime, chooseFile };
}
