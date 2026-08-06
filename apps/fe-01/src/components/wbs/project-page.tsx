import { useCallback, useEffect, useMemo, useState } from 'react';

import { subscribeToProject } from '@/lib/project-stream';
import { httpProjectApi, type ProjectSummary } from '@/lib/wbs-api';

import { type SubscriptionHandlers, WbsTable } from './wbs-table';

export interface ProjectPageProps {
  token: string;
}

/** Picks a project, then hands it to the table. */
export function ProjectPage({ token }: ProjectPageProps) {
  const api = useMemo(() => httpProjectApi(token), [token]);
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

  const load = useCallback(async () => {
    const found = await api.listProjects();
    setProjects(found);
    // Selecting the only project saves a click on the common path; with several,
    // the choice is the user's and nothing is guessed.
    setSelected((current) => current ?? (found.length === 1 ? (found[0]?.id ?? null) : null));
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
        await load();
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'create_failed');
      });
  };

  return (
    <section>
      <h2>Projects</h2>
      {error !== null && <p role="alert">{error}</p>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <select
          aria-label="Project"
          value={selected ?? ''}
          onChange={(e) => {
            setSelected(e.target.value === '' ? null : e.target.value);
          }}
        >
          <option value="">Choose a project…</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={create}>
          New project
        </button>
      </div>
      {selected !== null && <WbsTable projectId={selected} api={api} subscribe={subscribe} />}
    </section>
  );
}
