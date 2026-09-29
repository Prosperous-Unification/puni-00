import { Link } from '@tanstack/react-router';
import {
  type ClientReply,
  createSpace,
  listSpaces,
  removeSpace,
  renameSpace,
} from '@wbs/contracts';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { AppHeader } from '@/components/chrome/app-header';
import { browserClient, failureMessage, unreachable } from '@/lib/http';

import { spaceRefusal } from './space-access';

const spaces = browserClient([listSpaces, createSpace, renameSpace, removeSpace]);

type Space = Extract<ClientReply<typeof listSpaces>, { kind: 'success' }>['body']['spaces'][number];
type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'refused'; message: string }
  | { kind: 'ready'; spaces: readonly Space[]; writable: boolean };

/** How often a visible page re-reads what others may have changed (design memo §7). */
export const SPACES_REFRESH_MS = 60_000;

/**
 * Re-reads on focus and every {@link SPACES_REFRESH_MS} while the tab is
 * visible: no socket carries space changes, so polling is the freshness.
 */
export function useSpacesPolling(refresh: () => void): void {
  useEffect(() => {
    const onFocus = () => {
      refresh();
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, SPACES_REFRESH_MS);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);
}

/**
 * The organization's spaces, at `/spaces`: All projects first, then every
 * named space. Creating, renaming and deleting are offered only when the
 * server says the caller may (`writable`), so a viewer sees no control a
 * write would refuse.
 */
export function SpacesPage({
  nav,
  account,
}: {
  nav: ReactNode;
  account: ReactNode;
}): React.JSX.Element {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [fault, setFault] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    const reply = await spaces.getApiSpaces({});
    switch (reply.kind) {
      case 'success':
        setView({ kind: 'ready', spaces: reply.body.spaces, writable: reply.body.writable });
        return;
      case 'failure':
        setView({ kind: 'failure', message: failureMessage(reply.failure) });
        return;
      case 'refusal': {
        const outcome = spaceRefusal(reply.body.error);
        setView(
          outcome.kind === 'page'
            ? { kind: 'refused', message: outcome.text }
            : { kind: 'failure', message: outcome.text },
        );
        return;
      }
      default:
        return unreachable(reply);
    }
  }, []);

  const refreshSafely = useCallback(() => {
    void refresh().catch((cause: unknown) => {
      setFault(new Error('Unexpected space list failure', { cause }));
    });
  }, [refresh]);

  useEffect(refreshSafely, [refreshSafely]);
  useSpacesPolling(refreshSafely);

  if (fault !== null) throw fault;

  /** Sends one write, says its refusal in place, and re-reads the list. */
  async function write(
    send: () => Promise<
      | ClientReply<typeof createSpace>
      | ClientReply<typeof renameSpace>
      | ClientReply<typeof removeSpace>
    >,
    done: string,
  ) {
    setSending(true);
    setMessage('');
    try {
      const reply = await send();
      switch (reply.kind) {
        case 'success':
          setMessage(done);
          break;
        case 'failure':
          setMessage(failureMessage(reply.failure));
          break;
        case 'refusal': {
          const outcome = spaceRefusal(reply.body.error);
          if (outcome.kind === 'page') {
            setView({ kind: 'refused', message: outcome.text });
            return;
          }
          setMessage(outcome.text);
          break;
        }
        default:
          unreachable(reply);
      }
      await refresh();
    } catch (cause) {
      setFault(new Error('Unexpected space write failure', { cause }));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <AppHeader nav={nav} account={account} />
      <main className="bg-background text-foreground mx-auto w-full max-w-3xl p-8 font-sans">
        <h1 className="mb-6 text-2xl font-semibold">Spaces</h1>
        {view.kind === 'refused' ? (
          <>
            <p role="alert">{view.message}</p>
            <AllProjectsLink />
          </>
        ) : (
          <>
            <ul aria-label="Spaces" className="mb-6 flex flex-col gap-2">
              <li>
                <AllProjectsLink />
              </li>
              {view.kind === 'ready' &&
                view.spaces.map((space) => (
                  <li key={space.id} className="flex flex-wrap items-center gap-2">
                    {renaming?.id === space.id ? (
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const next = renaming.name;
                          setRenaming(null);
                          void write(
                            () =>
                              spaces.patchApiSpacesById({
                                params: { id: space.id },
                                body: { name: next },
                              }),
                            `Renamed to ${next.trim()}.`,
                          );
                        }}
                      >
                        <label htmlFor={`rename-${space.id}`}>New name for {space.name}</label>
                        <input
                          id={`rename-${space.id}`}
                          className="border p-2"
                          value={renaming.name}
                          onChange={(event) => {
                            setRenaming({ id: space.id, name: event.target.value });
                          }}
                        />
                        <button type="submit" disabled={sending}>
                          Save
                        </button>
                      </form>
                    ) : (
                      <Link to="/spaces/$spaceId" params={{ spaceId: space.id }}>
                        {space.name}
                      </Link>
                    )}
                    <span className="text-muted-foreground text-sm">
                      {space.projectCount === 1
                        ? '1 project'
                        : `${String(space.projectCount)} projects`}
                    </span>
                    {view.writable && renaming?.id !== space.id && (
                      <>
                        <button
                          type="button"
                          disabled={sending}
                          aria-label={`Rename ${space.name}`}
                          onClick={() => {
                            setRenaming({ id: space.id, name: space.name });
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          disabled={sending}
                          aria-label={`Delete ${space.name}`}
                          onClick={() => {
                            void write(
                              () => spaces.deleteApiSpacesById({ params: { id: space.id } }),
                              `Deleted ${space.name}. Its projects are unchanged.`,
                            );
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </li>
                ))}
            </ul>
            {view.kind === 'loading' && <p>Loading spaces…</p>}
            {view.kind === 'failure' && <p role="alert">{view.message}</p>}
            {view.kind === 'ready' && view.spaces.length === 0 && <p>No spaces yet.</p>}
            {view.kind === 'ready' && view.writable && (
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const chosen = name;
                  setName('');
                  void write(
                    () => spaces.postApiSpaces({ body: { name: chosen } }),
                    `Created ${chosen.trim()}.`,
                  );
                }}
              >
                <label htmlFor="new-space-name">New space</label>
                <input
                  id="new-space-name"
                  className="border p-2"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                />
                <button type="submit" disabled={sending}>
                  Create
                </button>
              </form>
            )}
            {message !== '' && <p role="status">{message}</p>}
          </>
        )}
      </main>
    </>
  );
}

function AllProjectsLink(): React.JSX.Element {
  return (
    <Link to="/spaces/$spaceId" params={{ spaceId: 'all' }}>
      All projects
    </Link>
  );
}
