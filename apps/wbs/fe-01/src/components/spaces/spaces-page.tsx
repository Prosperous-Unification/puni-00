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
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CONTROL_HEIGHT, FIELD_LABEL_CLASS, FORM_CLASS } from '@/components/ui/control';
import { Input } from '@/components/ui/input';
import { browserClient, failureMessage, unreachable } from '@/lib/http';

import { spaceRefusal } from './space-access';
import {
  ALERT_CLASS,
  FIELD_CLASS,
  LINK_CLASS,
  LIST_CLASS,
  MAIN_CLASS,
  NOTE_CLASS,
  ROW_CLASS,
  STATUS_CLASS,
} from './space-chrome';
import { useSpacesPolling } from './use-spaces-polling';

const spaces = browserClient([listSpaces, createSpace, renameSpace, removeSpace]);

type Space = Extract<ClientReply<typeof listSpaces>, { kind: 'success' }>['body']['spaces'][number];
type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'refused'; message: string }
  | { kind: 'ready'; spaces: readonly Space[]; writable: boolean };

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

  const refreshSafely = useCallback(
    () =>
      refresh().catch((cause: unknown) => {
        setFault(new Error('Unexpected space list failure', { cause }));
      }),
    [refresh],
  );

  useEffect(() => {
    void refreshSafely();
  }, [refreshSafely]);
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
      <main className={MAIN_CLASS}>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:p-8">
          <h1 className="text-2xl font-semibold">Spaces</h1>
          {view.kind === 'refused' ? (
            <>
              <p role="alert" className={STATUS_CLASS}>
                {view.message}
              </p>
              <p className={STATUS_CLASS}>
                <AllProjectsLink />
              </p>
            </>
          ) : (
            <Card className="border-border">
              <CardContent className="flex flex-col gap-4">
                <ul aria-label="Spaces" className={`${LIST_CLASS} -my-3`}>
                  <li className={ROW_CLASS}>
                    <AllProjectsLink />
                  </li>
                  {view.kind === 'ready' &&
                    view.spaces.map((space) => (
                      <li key={space.id} className={ROW_CLASS}>
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          {renaming?.id === space.id ? (
                            <form
                              className={FORM_CLASS}
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
                              <span className={FIELD_CLASS}>
                                <label
                                  htmlFor={`rename-${space.id}`}
                                  className={`${FIELD_LABEL_CLASS} [overflow-wrap:anywhere]`}
                                >
                                  New name for {space.name}
                                </label>
                                <Input
                                  id={`rename-${space.id}`}
                                  className={CONTROL_HEIGHT}
                                  value={renaming.name}
                                  onChange={(event) => {
                                    setRenaming({ id: space.id, name: event.target.value });
                                  }}
                                />
                              </span>
                              <Button type="submit" className={CONTROL_HEIGHT} disabled={sending}>
                                Save
                              </Button>
                            </form>
                          ) : (
                            <Link
                              to="/spaces/$spaceId"
                              params={{ spaceId: space.id }}
                              className={`${LINK_CLASS} self-start`}
                            >
                              {space.name}
                            </Link>
                          )}
                          <span className={NOTE_CLASS}>
                            {space.projectCount === 1
                              ? '1 project'
                              : `${String(space.projectCount)} projects`}
                          </span>
                        </span>
                        {view.writable && renaming?.id !== space.id && (
                          <span className="flex shrink-0 flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className={CONTROL_HEIGHT}
                              disabled={sending}
                              aria-label={`Rename ${space.name}`}
                              onClick={() => {
                                setRenaming({ id: space.id, name: space.name });
                              }}
                            >
                              Rename
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className={`text-destructive hover:text-destructive ${CONTROL_HEIGHT}`}
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
                            </Button>
                          </span>
                        )}
                      </li>
                    ))}
                </ul>
                {view.kind === 'loading' && <p className={STATUS_CLASS}>Loading spaces…</p>}
                {view.kind === 'failure' && (
                  <p role="alert" className={ALERT_CLASS}>
                    {view.message}
                  </p>
                )}
                {view.kind === 'ready' && view.spaces.length === 0 && (
                  <p className={NOTE_CLASS}>No spaces yet.</p>
                )}
                {view.kind === 'ready' && view.writable && (
                  <form
                    className={`${FORM_CLASS} border-border border-t pt-4`}
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
                    <span className={FIELD_CLASS}>
                      <label htmlFor="new-space-name" className={FIELD_LABEL_CLASS}>
                        New space
                      </label>
                      <Input
                        id="new-space-name"
                        className={CONTROL_HEIGHT}
                        value={name}
                        onChange={(event) => {
                          setName(event.target.value);
                        }}
                      />
                    </span>
                    <Button type="submit" className={CONTROL_HEIGHT} disabled={sending}>
                      Create
                    </Button>
                  </form>
                )}
                {message !== '' && (
                  <p role="status" className={STATUS_CLASS}>
                    {message}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}

function AllProjectsLink(): React.JSX.Element {
  return (
    <Link to="/spaces/$spaceId" params={{ spaceId: 'all' }} className={LINK_CLASS}>
      All projects
    </Link>
  );
}
