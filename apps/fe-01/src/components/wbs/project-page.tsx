import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { subscribeToProject } from '@/lib/project-stream';
import { cn } from '@/lib/utils';
import { httpProjectApi, type ProjectApi, type ProjectSummary } from '@/lib/wbs-api';

import { matchingProjects } from './project-picker';
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
  /**
   * What has been typed into the picker, and which entry is highlighted — or
   * null while the picker is closed.
   *
   * `null` rather than a separate `open` flag: "closed" and "nothing typed"
   * are two different states (a closed picker shows the project's name, an
   * open empty one shows every project), and two booleans that must agree is
   * one more thing to keep in step. The highlight is an entry's id, never an
   * index — the same reason the Depends on picker holds one (cross review #6).
   */
  const [search, setSearch] = useState<{ typed: string; highlightId: string | null } | null>(null);

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
      // A remembered id the list no longer holds is a claim that has been
      // disproved, so it is dropped rather than left to be re-tested — and
      // re-offered as a choice — on every future load.
      if (remembered !== null) rememberProject(null);
      return found.length === 1 ? (found[0]?.id ?? null) : null;
    });
  }, [api]);

  useEffect(() => {
    void load().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'load_failed');
    });
  }, [load]);

  /**
   * Tells be-01 which project this account is now in, which is what sorts the
   * picker next time.
   *
   * On the selection rather than on the click, so every way of arriving at a
   * project counts: picked from the list, restored from localStorage,
   * auto-selected as the only one, or just created. Recording it in the click
   * handler would have left the restored project — the commonest arrival of
   * all — never marked as opened, and the ordering would drift by exactly the
   * projects people return to most.
   *
   * A failure is swallowed on purpose: this is navigation history, and an
   * error banner over a list that will simply be ordered slightly stale is
   * noise about something the user cannot act on.
   */
  useEffect(() => {
    if (selected === null) return;
    void api.openProject(selected).catch(() => {
      // Deliberate: see above.
    });
  }, [api, selected]);

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

  /** The entries the picker is offering right now, or none while it is closed. */
  const entries = search === null ? [] : matchingProjects(projects, search.typed);
  // Resolved by id at render, so a highlight whose project has left the list is
  // simply nothing rather than somebody else's project.
  const highlighted =
    search?.highlightId == null
      ? undefined
      : entries.find((entry) => entry.id === search.highlightId);
  const listOpen = search !== null && entries.length > 0;

  /** Takes a project: selects it, remembers it, and closes the picker. */
  const choose = (id: string) => {
    setSelected(id);
    rememberProject(id);
    setSearch(null);
  };

  /** Moves the picker highlight by `delta` over what is on offer, clamped. */
  const moveHighlight = (delta: 1 | -1) => {
    if (entries.length === 0) return;
    setSearch((current) => {
      if (current === null) return current;
      const ids = entries.map((entry) => entry.id);
      const at = current.highlightId === null ? -1 : ids.indexOf(current.highlightId);
      // From nothing highlighted — or a highlight whose project left the list —
      // Down enters at the top and Up at the bottom.
      const from = at === -1 ? (delta === 1 ? -1 : ids.length) : at;
      const to = Math.min(ids.length - 1, Math.max(0, from + delta));
      return { ...current, highlightId: ids[to] ?? null };
    });
  };

  return (
    <section>
      <h2 className="mb-2 text-base font-semibold tracking-tight">Projects</h2>
      {error !== null && (
        <p role="alert" className="text-destructive mb-2 text-sm">
          {error}
        </p>
      )}
      <div className="mb-3 flex items-center gap-2">
        {rename === null ? (
          <>
            <span className="relative inline-block">
              <Input
                className="w-64"
                aria-label="Project"
                role="combobox"
                aria-expanded={listOpen}
                aria-controls={listOpen ? 'project-options' : undefined}
                aria-activedescendant={
                  highlighted === undefined ? undefined : `project-option-${highlighted.id}`
                }
                aria-autocomplete="list"
                placeholder="Choose a project…"
                size={28}
                // Closed, the box reads as a label of what is open; typing in
                // it is a search, and the typing is what is shown then.
                value={search?.typed ?? selectedProject?.name ?? ''}
                onFocus={() => {
                  setSearch({ typed: '', highlightId: null });
                }}
                // A blur discards the typing and shows the selection again. It
                // does not select the highlighted entry: a click elsewhere is
                // not a choice, and choosing on the way out is how a picker
                // silently changes the project under someone who left it.
                onBlur={() => {
                  setSearch(null);
                }}
                onChange={(e) => {
                  const typed = e.target.value;
                  // Typing is aiming at the narrowed-to project; emptying the
                  // box aims at nothing again.
                  const first =
                    typed.trim() === '' ? undefined : matchingProjects(projects, typed)[0];
                  setSearch({ typed, highlightId: first?.id ?? null });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    moveHighlight(e.key === 'ArrowDown' ? 1 : -1);
                    return;
                  }
                  if (e.key === 'Escape') {
                    setSearch(null);
                    return;
                  }
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  // Nothing highlighted is not a choice. An empty box whose
                  // list happens to be showing must not select the first
                  // project on a stray Enter.
                  if (highlighted !== undefined) choose(highlighted.id);
                }}
              />
              {listOpen && (
                <ul
                  role="listbox"
                  id="project-options"
                  aria-label="Projects"
                  // One preventDefault for the whole list, options included, by
                  // bubbling: a mousedown here must not blur the input, or the
                  // list would close before the click could land — on an option
                  // and on the scrollbar alike (cross review #6's lesson,
                  // learned on the Depends on picker).
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  className="bg-popover text-popover-foreground absolute top-full left-0 z-10 m-0 max-h-60 min-w-full list-none overflow-y-auto rounded-md border p-1 text-sm shadow-md"
                >
                  {entries.map((entry) => (
                    // The ARIA combobox pattern is the boundary that makes this
                    // safe: options are not focusable, and the keyboard drives
                    // them from the input through aria-activedescendant.
                    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                    <li
                      key={entry.id}
                      id={`project-option-${entry.id}`}
                      role="option"
                      aria-selected={entry.id === highlighted?.id}
                      ref={(element) => {
                        // jsdom has no scrollIntoView; that boundary is the
                        // test environment, not a browser this will meet.
                        if (
                          entry.id === highlighted?.id &&
                          element !== null &&
                          typeof element.scrollIntoView === 'function'
                        ) {
                          element.scrollIntoView({ block: 'nearest' });
                        }
                      }}
                      className={cn(
                        'cursor-pointer rounded-sm px-2 py-1 whitespace-nowrap',
                        entry.id === highlighted?.id && 'bg-accent text-accent-foreground',
                      )}
                      onClick={() => {
                        choose(entry.id);
                      }}
                    >
                      {entry.name}
                    </li>
                  ))}
                </ul>
              )}
            </span>
            {selectedProject !== undefined && (
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setRename({ projectId: selectedProject.id, draft: selectedProject.name });
                }}
              >
                Rename
              </Button>
            )}
          </>
        ) : (
          <Input
            className="w-64"
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
        <Button type="button" onClick={create}>
          New project
        </Button>
      </div>
      {selectedProject !== undefined && (
        <p className="text-muted-foreground mb-3 text-sm">
          Working in <strong className="text-foreground font-medium">{selectedProject.name}</strong>
        </p>
      )}
      {selected !== null && (
        <WbsTable
          projectId={selected}
          // The name the export's header and filename carry. Read from the
          // list rather than held twice: a rename lands in `projects` and the
          // next export says the new name.
          projectName={selectedProject?.name}
          api={api}
          subscribe={subscribe}
        />
      )}
    </section>
  );
}
