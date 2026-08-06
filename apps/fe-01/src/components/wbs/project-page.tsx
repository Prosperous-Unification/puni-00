import { useCallback, useEffect, useMemo, useState } from 'react';

import { subscribeToProject } from '@/lib/project-stream';
import { httpProjectApi, type ProjectApi, type ProjectSummary } from '@/lib/wbs-api';

import { type SubscriptionHandlers, WbsTable } from './wbs-table';

export interface ProjectPageProps {
  token: string;
  /** Injected in tests; the app lets it default to the real one. */
  api?: ProjectApi;
}

/**
 * Where this browser remembers which project was open.
 *
 * localStorage, like the session token beside it: a refresh that forgets the
 * project costs a click and the remembering, every time. The stored id is a
 * claim, not a fact — it is honoured only while the fetched list still
 * contains it, so a deleted project cannot be "selected" into a 404.
 */
const PROJECT_KEY = 'wbs.project';

function rememberProject(id: string | null): void {
  if (id === null) localStorage.removeItem(PROJECT_KEY);
  else localStorage.setItem(PROJECT_KEY, id);
}

/** Picks a project, remembers the pick, renames it, then hands it to the table. */
export function ProjectPage({ token, api: apiOverride }: ProjectPageProps) {
  const api = useMemo(() => apiOverride ?? httpProjectApi(token), [apiOverride, token]);
  const subscribe = useMemo(
    () => (projectId: string, handlers: SubscriptionHandlers) =>
      subscribeToProject({
        token,
        projectId,
        // The table's first read has not happened yet, so the stream starts
        // knowing nothing and the read reports its sequence through `seen`.
        sinceSeq: -1,
        onChange: handlers.onChange,
        onConnectionChange: handlers.onConnectionChange,
      }),
    [token],
  );

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * The rename in progress, or null while the picker is showing.
   *
   * It carries the id of the project it was opened for, and the commit uses
   * that id — never the current selection. Cross review #6's one critical
   * finding, from all three reviewers: with only the draft stored, arming a
   * rename and then creating a project sent the old draft to the new project.
   */
  const [rename, setRename] = useState<{ projectId: string; draft: string } | null>(null);

  const load = useCallback(async () => {
    const found = await api.listProjects();
    setProjects(found);
    setSelected((current) => {
      // The current selection and the remembered id are both claims, honoured
      // only while the list still contains them — a project deleted elsewhere
      // must not stay "selected" into a table asking for its tree. Then,
      // selecting the only project saves a click on the common path; with
      // several, the choice is the user's and nothing is guessed.
      if (current !== null && found.some((project) => project.id === current)) return current;
      const remembered = localStorage.getItem(PROJECT_KEY);
      if (remembered !== null && found.some((project) => project.id === remembered)) {
        return remembered;
      }
      return found.length === 1 ? (found[0]?.id ?? null) : null;
    });
  }, [api]);

  useEffect(() => {
    void load().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'load_failed');
    });
  }, [load]);

  const create = () => {
    // An armed rename is cancelled, not carried: the draft was meant for the
    // project it was opened on, and this click is about to select another.
    setRename(null);
    void api
      .createProject('New project')
      .then(async (project) => {
        setSelected(project.id);
        rememberProject(project.id);
        await load();
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'create_failed');
      });
  };

  /**
   * Commits the rename if it says something, cancels if it does not.
   *
   * A draft that trims to nothing or to the name the project already has is a
   * cancel — a blank name would leave the project unidentifiable in every
   * picker, and an unchanged one is a request that changes nothing. A refusal
   * keeps the draft on screen: `forbidden` must not eat what was typed. The
   * post-success list reload fails separately — by then the rename landed,
   * and reporting it as a rename failure would be a lie.
   */
  const commitOrCancelRename = (armed: { projectId: string; draft: string }) => {
    const typed = armed.draft.trim();
    const currentName = projects.find((project) => project.id === armed.projectId)?.name;
    if (typed === '' || typed === currentName) {
      setRename(null);
      return;
    }
    setError(null);
    void api.renameProject(armed.projectId, typed).then(
      async () => {
        setRename(null);
        await load().catch((e: unknown) => {
          setError(e instanceof Error ? e.message : 'load_failed');
        });
      },
      (e: unknown) => {
        setError(e instanceof Error ? e.message : 'rename_failed');
      },
    );
  };

  const selectedProject = projects.find((project) => project.id === selected);

  return (
    <section>
      <h2>Projects</h2>
      {error !== null && <p role="alert">{error}</p>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        {rename === null ? (
          <>
            <select
              aria-label="Project"
              value={selected ?? ''}
              onChange={(e) => {
                const chosen = e.target.value === '' ? null : e.target.value;
                setSelected(chosen);
                rememberProject(chosen);
              }}
            >
              <option value="">Choose a project…</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            {selectedProject !== undefined && (
              <button
                type="button"
                onClick={() => {
                  setRename({ projectId: selectedProject.id, draft: selectedProject.name });
                }}
              >
                Rename
              </button>
            )}
          </>
        ) : (
          <input
            aria-label="Project name"
            value={rename.draft}
            // A callback ref rather than autoFocus: it fires when the node
            // attaches, which is the moment the button it replaces was clicked.
            ref={(element) => element?.focus()}
            onChange={(e) => {
              const draft = e.target.value;
              setRename((current) => (current === null ? current : { ...current, draft }));
            }}
            // Blur commits — the proposal's word — which also gives the rename
            // a mouse exit: click anywhere else and the mode resolves instead
            // of sitting open forever.
            onBlur={() => {
              commitOrCancelRename(rename);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitOrCancelRename(rename);
              }
              if (e.key === 'Escape') setRename(null);
            }}
          />
        )}
        <button type="button" onClick={create}>
          New project
        </button>
      </div>
      {selectedProject !== undefined && (
        <p>
          Working in <strong>{selectedProject.name}</strong>
        </p>
      )}
      {selected !== null && <WbsTable projectId={selected} api={api} subscribe={subscribe} />}
    </section>
  );
}
