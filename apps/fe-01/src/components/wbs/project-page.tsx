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
  /** The rename input's draft, or null while the picker is showing. */
  const [renameDraft, setRenameDraft] = useState<string | null>(null);

  const load = useCallback(async () => {
    const found = await api.listProjects();
    setProjects(found);
    setSelected((current) => {
      if (current !== null) return current;
      // The remembered project first, if it is still there. Then, selecting
      // the only project saves a click on the common path; with several, the
      // choice is the user's and nothing is guessed.
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

  const commitRename = (typed: string) => {
    // Guarded by the render below: the Rename button exists only with a
    // selection, so a null here is a state this component cannot reach.
    if (selected === null) return;
    setError(null);
    void api
      .renameProject(selected, typed)
      .then(async () => {
        setRenameDraft(null);
        await load();
      })
      .catch((e: unknown) => {
        // The draft stays: a `forbidden` should not eat what was typed.
        setError(e instanceof Error ? e.message : 'rename_failed');
      });
  };

  const selectedProject = projects.find((project) => project.id === selected);

  return (
    <section>
      <h2>Projects</h2>
      {error !== null && <p role="alert">{error}</p>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        {renameDraft === null ? (
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
                  setRenameDraft(selectedProject.name);
                }}
              >
                Rename
              </button>
            )}
          </>
        ) : (
          <input
            aria-label="Project name"
            value={renameDraft}
            // A callback ref rather than autoFocus: it fires when the node
            // attaches, which is the moment the button it replaces was clicked.
            ref={(element) => element?.focus()}
            onChange={(e) => {
              setRenameDraft(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitRename(e.currentTarget.value);
              }
              if (e.key === 'Escape') setRenameDraft(null);
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
