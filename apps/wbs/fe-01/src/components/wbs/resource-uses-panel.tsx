import { Button, Input, SELECT_CLASS } from '@ui/saas-01';
import {
  appendResourceUseEvent,
  type ClientReply,
  listPeople,
  listResourceUses,
  readResourceUseHistory,
} from '@wbs/contracts';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { failureMessage } from '@/lib/http';
import { useResourceClient, useResourceScope } from '@/runtime/organization-resources';

const SHAPES = [
  listResourceUses,
  appendResourceUseEvent,
  readResourceUseHistory,
  listPeople,
] as const;
type Use = Extract<
  ClientReply<typeof listResourceUses>,
  { kind: 'success' }
>['body']['uses'][number];
type HistoryEvent = Extract<
  ClientReply<typeof readResourceUseHistory>,
  { kind: 'success' }
>['body']['events'][number];
type Person = Extract<
  ClientReply<typeof listPeople>,
  { kind: 'success' }
>['body']['people'][number];
type Kind = 'cleanup_requested' | 'cleanup_blocked' | 'retained' | 'release_reported';
type ListView =
  | { kind: 'loading'; projectId: string; scopeKey: string }
  | { kind: 'failure'; projectId: string; scopeKey: string; message: string }
  | {
      kind: 'ready';
      projectId: string;
      scopeKey: string;
      uses: readonly Use[];
      nextCursor: string | null;
    };
type HistoryView =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'ready'; events: readonly HistoryEvent[]; nextCursor: string | null };

// Proof: changing cleanup_pending to 'Release reported' failed `treats cleanup request as pending, not released` on the missing pending label (watched 2026-10-25).
const status: Record<Use['state'], string> = {
  active: 'Active',
  cleanup_pending: 'Cleanup pending',
  blocked: 'Blocked',
  retained: 'Retained',
  release_reported: 'Release reported',
  release_verified: 'Release verified',
};
const eventName: Record<HistoryEvent['kind'], string> = {
  registered: 'Registered',
  cleanup_requested: 'Cleanup requested',
  cleanup_blocked: 'Cleanup blocked',
  retained: 'Retained',
  release_reported: 'Release reported',
  cleanup_pending: 'Cleanup pending',
  blocked: 'Blocked',
  release_verified: 'Release verified',
};
function time(at: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(at);
}
function refusal(error: string): string {
  switch (error) {
    case 'conflict':
      return 'Conflict: this resource use changed. The current report has been reread; review it before retrying.';
    case 'forbidden':
    case 'insufficient_scope':
      return 'Your role cannot change this resource use.';
    case 'unauthenticated':
      return 'Your session ended. Sign in again to see resource uses.';
    case 'not_found':
      return 'This resource use could not be found. Reload the list.';
    case 'resource_tracking_unavailable':
      return 'Resource uses could not be read from this server. The resource editor remains available.';
    default:
      return `Resource uses request was refused (${error}).`;
  }
}

export interface ResourceUsesPanelProps {
  projectId: string;
  shown: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}

/** Reports of resource use in this project; no event here verifies host cleanup. */
export function ResourceUsesPanel({
  projectId,
  shown,
  onDirtyChange,
  onBusyChange,
}: ResourceUsesPanelProps): React.JSX.Element {
  const client = useResourceClient(SHAPES);
  const scope = useResourceScope();
  const scopeKey =
    scope.organization.kind === 'legacy' ? 'legacy' : scope.organization.organizationId;
  const generation = useRef(0);
  const [list, setList] = useState<ListView>({ kind: 'loading', projectId, scopeKey });
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeForm, setActiveForm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState<readonly Person[] | null>(null);
  const [peopleError, setPeopleError] = useState('');

  useEffect(() => {
    onDirtyChange(activeForm !== null || busy);
    onBusyChange?.(busy);
  }, [activeForm, busy, onDirtyChange, onBusyChange]);
  useEffect(
    () => () => {
      onDirtyChange(false);
      onBusyChange?.(false);
    },
    [onDirtyChange, onBusyChange],
  );

  const read = useCallback(
    async (cursor: string | null, append: boolean, version: number) => {
      const reply = await client.getApiProjectsByIdResourceUses({
        params: { id: projectId },
        query: cursor === null ? {} : { cursor },
      });
      if (version !== generation.current) return;
      setLoadingMore(false);
      if (reply.kind === 'success') {
        setList((previous) => ({
          kind: 'ready',
          projectId,
          scopeKey,
          uses:
            append &&
            previous.kind === 'ready' &&
            previous.projectId === projectId &&
            previous.scopeKey === scopeKey
              ? [...previous.uses, ...reply.body.uses]
              : reply.body.uses,
          nextCursor: reply.body.nextCursor,
        }));
      } else if (reply.kind === 'refusal') {
        setList({ kind: 'failure', projectId, scopeKey, message: refusal(reply.body.error) });
      } else if (reply.failure.code !== 'cancelled') {
        setList({
          kind: 'failure',
          projectId,
          scopeKey,
          message: `Resource uses could not be read. ${failureMessage(reply.failure)}`,
        });
      }
    },
    [client, projectId, scopeKey],
  );

  const reread = useCallback(
    (keepCurrent = false) => {
      const version = ++generation.current;
      setLoadingMore(false);
      if (!keepCurrent) setList({ kind: 'loading', projectId, scopeKey });
      return read(null, false, version);
    },
    [projectId, scopeKey, read],
  );

  useEffect(() => {
    setActiveForm(null);
    setBusy(false);
    setPeople(null);
    setPeopleError('');
  }, [projectId, scopeKey]);

  useEffect(() => {
    if (!shown) return;
    // Proof: changing projects while a request is in flight must retire that answer.
    void reread();
    const version = generation;
    return () => {
      version.current++;
    };
  }, [shown, reread]);

  const loadPeople = useCallback(async (): Promise<void> => {
    if (people !== null) return;
    setPeopleError('');
    const version = generation.current;
    const reply = await client.getApiPeople({});
    if (version !== generation.current) return;
    if (reply.kind === 'success')
      setPeople(reply.body.people.filter((person) => person.kind === 'person'));
    else
      setPeopleError(
        reply.kind === 'refusal' ? refusal(reply.body.error) : failureMessage(reply.failure),
      );
  }, [client, people]);

  useEffect(() => {
    if (
      shown &&
      list.kind === 'ready' &&
      list.projectId === projectId &&
      list.scopeKey === scopeKey &&
      list.uses.some((use) => use.retention !== null) &&
      people === null &&
      peopleError === ''
    )
      void loadPeople();
  }, [shown, list, projectId, scopeKey, people, peopleError, loadPeople]);

  function replaceUse(next: Use): void {
    setList((previous) =>
      previous.kind === 'ready' &&
      previous.projectId === projectId &&
      previous.scopeKey === scopeKey
        ? { ...previous, uses: previous.uses.map((use) => (use.id === next.id ? next : use)) }
        : previous,
    );
  }

  async function write(
    use: Use,
    body: Parameters<typeof client.postApiProjectsByIdResourceUsesByUseIdEvents>[0]['body'],
  ): Promise<string | null> {
    setBusy(true);
    const version = generation.current;
    try {
      const reply = await client.postApiProjectsByIdResourceUsesByUseIdEvents({
        params: { id: projectId, useId: use.id },
        body,
      });
      if (version !== generation.current) return null;
      if (reply.kind === 'success') {
        replaceUse(reply.body.use);
        return null;
      }
      if (reply.kind === 'refusal') {
        if (reply.body.error === 'conflict') void reread(true);
        return refusal(reply.body.error);
      }
      return reply.failure.code === 'cancelled' ? null : failureMessage(reply.failure);
    } finally {
      if (version === generation.current) setBusy(false);
    }
  }

  const current =
    list.projectId === projectId && list.scopeKey === scopeKey
      ? list
      : { kind: 'loading' as const, projectId, scopeKey };
  return (
    <section aria-label="Resource uses" className="border-border flex flex-col gap-3 border-t pt-4">
      <h3 className="m-0 text-base font-semibold">Resource uses</h3>
      <p className="text-muted-foreground m-0 text-sm">
        These records are reports. Cleanup requests do not delete files, and a reported release is
        not independent host verification.
      </p>
      {current.kind === 'loading' && shown && <p className="m-0 text-sm">Loading resource uses…</p>}
      {current.kind === 'failure' && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-destructive m-0 text-sm">
            {current.message}
          </p>
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => {
              void reread();
            }}
          >
            Retry resource uses
          </Button>
        </div>
      )}
      {current.kind === 'ready' && (
        <>
          {current.uses.length === 0 ? (
            <p className="m-0 text-sm">No resource uses registered</p>
          ) : (
            <ul
              aria-label="Reported resource uses"
              className="divide-border m-0 list-none divide-y p-0"
            >
              {current.uses.map((use) => (
                <UseRow
                  key={`${projectId}:${use.id}`}
                  use={use}
                  projectId={projectId}
                  shown={shown}
                  active={activeForm === use.id}
                  busy={busy}
                  people={people}
                  peopleError={peopleError}
                  onChoose={(open) => {
                    setActiveForm(open ? use.id : null);
                  }}
                  onPeople={() => {
                    void loadPeople();
                  }}
                  onWrite={(body) => write(use, body)}
                  client={client}
                />
              ))}
            </ul>
          )}
          {current.nextCursor !== null && (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              disabled={loadingMore}
              onClick={() => {
                const version = generation.current;
                setLoadingMore(true);
                void read(current.nextCursor, true, version);
              }}
            >
              {loadingMore ? 'Loading…' : 'More resource uses'}
            </Button>
          )}
        </>
      )}
    </section>
  );
}

type ResourceClient = ReturnType<typeof useResourceClient<typeof SHAPES>>;
interface UseRowProps {
  use: Use;
  projectId: string;
  shown: boolean;
  active: boolean;
  busy: boolean;
  people: readonly Person[] | null;
  peopleError: string;
  onChoose: (open: boolean) => void;
  onPeople: () => void;
  onWrite: (
    body: Parameters<ResourceClient['postApiProjectsByIdResourceUsesByUseIdEvents']>[0]['body'],
  ) => Promise<string | null>;
  client: ResourceClient;
}
function UseRow({
  use,
  projectId,
  shown,
  active,
  busy,
  people,
  peopleError,
  onChoose,
  onPeople,
  onWrite,
  client,
}: UseRowProps): React.JSX.Element {
  const fieldId = useId();
  const [kind, setKind] = useState<Kind | null>(null);
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const [owner, setOwner] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryView | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const historyGeneration = useRef(0);
  useEffect(
    () => () => {
      historyGeneration.current++;
    },
    [],
  );

  function choose(next: Kind): void {
    setKind(next);
    setReason('');
    setEvidence('');
    setOwner('');
    setReviewDate('');
    setError('');
    onChoose(true);
    if (next === 'retained') onPeople();
  }
  async function send(): Promise<void> {
    if (kind === null || busy) return;
    if (reason.trim() === '') {
      setError('Reason is required.');
      return;
    }
    // Proof: replacing the evidence check with false failed `requires evidence for release and waits for server response` because its missing-evidence alert disappeared (watched 2026-10-25).
    if (kind === 'release_reported' && evidence.trim() === '') {
      setError('Evidence is required to report release.');
      return;
    }
    const reviewAt = new Date(`${reviewDate}T23:59:59`).getTime();
    if (
      kind === 'retained' &&
      (people?.some((person) => person.id === owner) !== true ||
        !Number.isFinite(reviewAt) ||
        reviewAt <= Date.now())
    ) {
      setError('Choose a retention owner and a future review date.');
      return;
    }
    setError('');
    const reply = await onWrite({
      eventId: crypto.randomUUID(),
      expectedRevision: use.revision,
      kind,
      reason: reason.trim(),
      ...(kind === 'release_reported' ? { evidence: evidence.trim() } : {}),
      ...(kind === 'retained' ? { ownerPersonId: owner, reviewAt } : {}),
    });
    if (reply !== null) setError(reply);
    else {
      setKind(null);
      onChoose(false);
    }
  }
  async function loadHistory(cursor: string | null): Promise<void> {
    const version = ++historyGeneration.current;
    setHistoryBusy(true);
    if (cursor === null) setHistory({ kind: 'loading' });
    const reply = await client.getApiProjectsByIdResourceUsesByUseIdHistory({
      params: { id: projectId, useId: use.id },
      query: cursor === null ? {} : { cursor },
    });
    if (version !== historyGeneration.current || !shown) return;
    setHistoryBusy(false);
    if (reply.kind === 'success') {
      setHistory((previous) => ({
        kind: 'ready',
        events:
          cursor !== null && previous?.kind === 'ready'
            ? [...previous.events, ...reply.body.events]
            : reply.body.events,
        nextCursor: reply.body.nextCursor,
      }));
    } else
      setHistory({
        kind: 'failure',
        message:
          reply.kind === 'refusal' ? refusal(reply.body.error) : failureMessage(reply.failure),
      });
  }
  // Proof: replacing the runtime branch with the reported offers failed `offers only a cleanup retry for a managed pending use`: Retain and Report release appeared (watched 2026-10-25).
  const allowed: readonly Kind[] =
    use.source === 'runtime'
      ? use.state === 'release_verified' || use.state === 'release_reported'
        ? []
        : ['cleanup_requested']
      : use.state === 'active'
        ? ['cleanup_requested', 'retained']
        : use.state === 'cleanup_pending'
          ? ['cleanup_blocked', 'retained', 'release_reported']
          : use.state === 'blocked' || use.state === 'retained'
            ? ['cleanup_requested']
            : [];
  const label: Record<Kind, string> = {
    cleanup_requested:
      use.source === 'runtime'
        ? use.pendingCleanupRequest || use.state !== 'active'
          ? 'Retry cleanup'
          : 'Request cleanup'
        : use.state === 'active'
          ? 'Request cleanup'
          : 'Retry cleanup',
    cleanup_blocked: 'Report blocked',
    retained: 'Retain',
    release_reported: 'Report release',
  };
  return (
    <li
      aria-label={`${use.resourceName} for ${use.workItemName}`}
      className="flex flex-col gap-2 py-3 text-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <strong>{use.resourceName}</strong>
        <span className="text-muted-foreground">
          {use.source === 'runtime' ? 'Managed by Dash' : 'Reported use'}
        </span>
        <span>{status[use.state]}</span>
        <span className="text-muted-foreground">{time(use.updatedAt)}</span>
      </div>
      <p className="m-0">
        Task: {use.workItemName} · Owner: {use.responsiblePersonName} · Run: {use.agentRun}
      </p>
      <p className="m-0">
        Locator: <code className="break-all">{use.locator}</code> · {use.units} {use.unitLabel}
      </p>
      {use.source === 'runtime' && use.pendingCleanupRequest && (
        <p className="m-0">Cleanup request queued for Dash</p>
      )}
      {use.retention !== null && (
        <p className="m-0">
          Retained by{' '}
          {people?.find((person) => person.id === use.retention?.ownerPersonId)?.name ??
            use.retention.ownerPersonId}
          : {use.retention.reason}. Review {time(use.retention.reviewAt)}.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {allowed.map((offered) => (
          <Button
            key={offered}
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              choose(offered);
            }}
          >
            {label[offered]}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (history === null) void loadHistory(null);
            else {
              historyGeneration.current++;
              setHistory(null);
            }
          }}
        >
          {history === null ? 'Show history' : 'Hide history'}
        </Button>
      </div>
      {active && kind !== null && (
        <div className="border-border flex flex-col gap-2 rounded-md border p-3">
          <strong>{label[kind]}</strong>
          <label htmlFor={`${fieldId}-reason`} className="flex flex-col gap-1">
            Reason
            <Input
              id={`${fieldId}-reason`}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
          </label>
          {kind === 'release_reported' && (
            <label htmlFor={`${fieldId}-evidence`} className="flex flex-col gap-1">
              Evidence
              <Input
                id={`${fieldId}-evidence`}
                value={evidence}
                onChange={(event) => {
                  setEvidence(event.target.value);
                }}
                placeholder="Log or ticket reference"
              />
            </label>
          )}
          {kind === 'retained' && (
            <>
              {peopleError !== '' && (
                <p role="alert" className="text-destructive m-0">
                  {peopleError}
                </p>
              )}
              <label htmlFor={`${fieldId}-owner`} className="flex flex-col gap-1">
                Retention owner
                <select
                  id={`${fieldId}-owner`}
                  className={SELECT_CLASS}
                  value={owner}
                  onChange={(event) => {
                    setOwner(event.target.value);
                  }}
                >
                  <option value="">Choose a person</option>
                  {people?.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor={`${fieldId}-review`} className="flex flex-col gap-1">
                Review date
                <Input
                  id={`${fieldId}-review`}
                  type="date"
                  value={reviewDate}
                  onChange={(event) => {
                    setReviewDate(event.target.value);
                  }}
                />
              </label>
            </>
          )}
          {error !== '' && (
            <p role="alert" className="text-destructive m-0">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                void send();
              }}
            >
              {use.source === 'runtime' ? 'Send cleanup request' : 'Send report'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setKind(null);
                onChoose(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {history?.kind === 'loading' && <p className="m-0">Loading history…</p>}
      {history?.kind === 'failure' && (
        <div>
          <p role="alert" className="text-destructive m-0">
            {history.message}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void loadHistory(null);
            }}
          >
            Retry history
          </Button>
        </div>
      )}
      {history?.kind === 'ready' && (
        <div className="flex flex-col gap-2">
          {history.events.length === 0 && <p className="m-0">No events reported</p>}
          <ol aria-label={`History of ${use.resourceName}`} className="m-0 list-inside">
            {history.events.map((event) => (
              <li key={event.id}>
                {eventName[event.kind]} · {time(event.at)} · <span>{event.actorName}</span> ·{' '}
                <span>{event.reason}</span>
                {event.evidence !== null && (
                  <>
                    {' '}
                    · <span>{event.evidence}</span>
                  </>
                )}
              </li>
            ))}
          </ol>
          {history.nextCursor !== null && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={historyBusy}
              onClick={() => {
                void loadHistory(history.nextCursor);
              }}
            >
              More history
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
