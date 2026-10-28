import { Button, Input } from '@ui/saas-01';
import {
  type ClientReply,
  createAgentPool,
  listAgentPools,
  readOrganizationLimits,
  rekeyAgentPool,
  revokeAgentPool,
} from '@wbs/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/wbs/modal';
import { failureMessage, unreachable } from '@/lib/http';
import { useResourceClient } from '@/runtime/organization-resources';

import { downloadAgentPoolKeys } from './agent-pool-keys-file';
import {
  agentHeadroom,
  type AgentPoolOperation,
  type AgentPoolRefusal,
  agentPoolRefusal,
} from './agent-pool-refusal';
import { minuteOf } from './machine-credentials-panel';
import { type AccessLoss } from './organization-access';
import type { OrganizationRole, RoleView } from './organization-role';
import {
  ALERT_CLASS,
  CONTROL_HEIGHT,
  FIELD_CLASS,
  FIELD_LABEL_CLASS,
  LIST_CLASS,
  OrganizationSection,
  ROW_ACTIONS_CLASS,
  STATUS_CLASS,
} from './organization-section';

const POOL_SHAPES = [
  listAgentPools,
  readOrganizationLimits,
  createAgentPool,
  rekeyAgentPool,
  revokeAgentPool,
] as const;

const DAY_MS = 86_400_000;
/** The most agents one pool holds (`createAgentPool`'s `size`). */
const MOST_POOL_SIZE = 100;
/**
 * The latest expiry day offered, in days after today (UTC). be-01 refuses an
 * `expiresAt` more than 90 days ahead; 00:00 UTC on day 89 is always under
 * that, whatever the minute the form is sent.
 */
const LATEST_EXPIRY_DAYS = 89;

/** One pool as the list answers it: its live credentials, never a secret. */
export type AgentPool = Extract<
  ClientReply<typeof listAgentPools>,
  { kind: 'success' }
>['body']['pools'][number];

/** The organization's agent persons against their cap, from the limits read. */
export interface AgentCapacity {
  readonly used: number;
  readonly cap: number;
}

/** `absent` is a read's `forbidden`: a role that lost admin since the role read sees no panel. */
type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'absent' }
  | {
      kind: 'ready';
      pools: readonly AgentPool[];
      capacity: AgentCapacity;
      /** When the list was read: what a pool's standing and the expiry bounds are judged at. */
      readAt: number;
    };

/** The create form as typed: `size` and `expiry` (a `YYYY-MM-DD` UTC day, or empty) are read on send. */
interface Draft {
  name: string;
  size: string;
  expiry: string;
}

/**
 * A re-key being confirmed: `expiry` is an optional new expiry day, required
 * once `isExpired` (the list said so, or be-01 answered `pool_expired`).
 */
interface Rekeying {
  poolId: string;
  expiry: string;
  isExpired: boolean;
  message: string;
}

/** A revocation being confirmed; `removePersons` is opt-in and starts off. */
interface Revocation {
  poolId: string;
  removePersons: boolean;
}

/**
 * What the panel says after a write. `delivered` names the file the keys were
 * saved as, never a key; `persons_kept` is `persons_not_removed`, a partial
 * success: the pool is revoked and its persons stay.
 */
type Outcome =
  | {
      kind: 'delivered';
      act: 'created' | 'rekeyed';
      poolName: string;
      fileName: string;
      keys: number;
    }
  | { kind: 'revoked'; poolName: string; revokedCredentials: number; removedPersons: number }
  | { kind: 'persons_kept'; poolName: string; text: string };

type Mutation =
  | { kind: 'create'; draft: Draft }
  | { kind: 'rekey'; pool: AgentPool; expiry: string }
  | { kind: 'revoke'; pool: AgentPool; removePersons: boolean };

/** Where a pool stands at `now`. */
type PoolStanding = 'live' | 'expired' | 'revoked';

function standingOf(pool: AgentPool, now: number): PoolStanding {
  if (pool.revokedAt !== null) return 'revoked';
  return pool.expiresAt !== null && pool.expiresAt <= now ? 'expired' : 'live';
}

/** The UTC calendar day of `instant`, as a date input holds it. */
function utcDayOf(instant: number): string {
  return new Date(instant).toISOString().slice(0, 10);
}

/**
 * 00:00 UTC on `day`, the instant a pool's keys stop working.
 *
 * @throws On anything but `YYYY-MM-DD`, which a date input never produces.
 */
function startOfUtcDay(day: string): number {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (parts === null) throw new Error(`Unexpected expiry day: ${day}`);
  return Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
}

/** The expiry days a form offers at `now`: tomorrow to {@link LATEST_EXPIRY_DAYS} ahead, UTC. */
function expiryBoundsOf(now: number): { earliest: string; latest: string } {
  return {
    earliest: utcDayOf(now + DAY_MS),
    latest: utcDayOf(now + LATEST_EXPIRY_DAYS * DAY_MS),
  };
}

/** The draft's agent count, or null while it is not a whole number from 1 to 100. */
function sizeOf(draft: Draft): number | null {
  const size = Number(draft.size);
  return draft.size.trim() !== '' && Number.isInteger(size) && size >= 1 && size <= MOST_POOL_SIZE
    ? size
    : null;
}

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** Whether `role` administers agent pools: admins and super-admins do, members and viewers never ask (M7). */
export function administersAgentPools(role: OrganizationRole): boolean {
  switch (role) {
    case 'super_admin':
    case 'admin':
      return true;
    case 'member':
    case 'viewer':
      return false;
    default:
      return unreachable(role);
  }
}

const EMPTY_DRAFT: Draft = { name: '', size: '8', expiry: '' };

/**
 * The agent pools panel once the caller's role is known: nothing without
 * organizations or for a member or viewer, who send no pools request at all;
 * a rendered failure with retry when the role cannot be read; the panel for an
 * admin or super-admin. `role` is the page's one {@link useOrganizationRole} read.
 */
export function AgentPoolsSlot({
  role,
  onAccessLost,
}: {
  role: RoleView;
  onAccessLost: (loss: AccessLoss) => void;
}): React.JSX.Element | null {
  switch (role.kind) {
    case 'legacy':
    case 'withdrawn':
      return null;
    case 'loading':
      return <p className={STATUS_CLASS}>Loading agent pools…</p>;
    case 'failure':
      // Proof: 2026-10-28, rendering nothing here failed `renders a failed role
      // read with retry, and recovers` in agent-pools-panel.test.tsx.
      return (
        <div className="flex flex-col gap-2">
          <p role="alert" className={ALERT_CLASS}>
            {role.message}
          </p>
          <Button
            type="button"
            variant="outline"
            className={`self-start ${CONTROL_HEIGHT}`}
            onClick={role.retry}
          >
            Retry agent pools
          </Button>
        </div>
      );
    case 'ready':
      // Proof: 2026-10-28, rendering the panel for every role failed `sends no
      // pools request and renders no panel for a member` (and a viewer): the
      // member's page sent `GET /api/organization/agent-pools`.
      return administersAgentPools(role.role) ? (
        <AgentPoolsPanel onAccessLost={onAccessLost} />
      ) : null;
    default:
      return unreachable(role);
  }
}

/**
 * The organization's agent pools (`wbs-mcp-agent-surface` M7): sets of agent
 * persons made in one act, each with its own API key, for Twilight Dash to
 * run. Create and re-key save the keys as one file, once, and never show
 * them; every act states its counts before it is confirmed; revoke removes the
 * persons only when asked.
 *
 * Nothing here is optimistic: every write rereads the list and the limits,
 * and a refused write leaves both as they were with the sentence in place.
 */
export function AgentPoolsPanel({
  onAccessLost,
}: {
  onAccessLost: (loss: AccessLoss) => void;
}): React.JSX.Element | null {
  const client = useResourceClient(POOL_SHAPES);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [message, setMessage] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftMessage, setDraftMessage] = useState('');
  const [rekeying, setRekeying] = useState<Rekeying | null>(null);
  const [revocation, setRevocation] = useState<Revocation | null>(null);
  const [fault, setFault] = useState<Error | null>(null);
  const [isSending, setIsSending] = useState(false);
  const isPending = useRef(false);
  const generation = useRef(0);

  /** Gives the page up on a loss, hides the panel on a read's `forbidden`, else says the sentence through `say`. */
  const sayRefusal = useCallback(
    (refusal: AgentPoolRefusal, operation: AgentPoolOperation, say: (text: string) => void) => {
      if (operation === 'read' && refusal.error === 'forbidden') {
        // Proof: 2026-10-28, rendering this as a failure failed `renders no
        // panel when the read answers forbidden`: the alert stood in its place.
        setView({ kind: 'absent' });
        return;
      }
      const reading = agentPoolRefusal(refusal, operation);
      if (reading.kind === 'lost') {
        setView({ kind: 'loading' });
        onAccessLost(reading.loss);
        return;
      }
      say(reading.text);
    },
    [onAccessLost],
  );

  const read = useCallback(
    async (version: number) => {
      const [pools, limits] = await Promise.all([
        client['getApiOrganizationAgent-pools']({}),
        client.getApiOrganizationLimits({}),
      ]);
      // Proof: 2026-10-28, removing this fence failed `never shows the previous
      // organization's pools after a switch`: org-a's late list replaced org-b's.
      if (version !== generation.current) return;
      const fail = (text: string) => {
        setView({ kind: 'failure', message: text });
      };
      // The counts a create states come from the limits read, so the panel
      // never draws without it.
      // Proof: 2026-10-28, judging the pool reply alone failed `renders a failed
      // limits read as the panel failure, never counts without it`: no alert.
      for (const reply of [pools, limits]) {
        switch (reply.kind) {
          case 'success':
            continue;
          case 'failure':
            if (reply.failure.code !== 'cancelled') fail(failureMessage(reply.failure));
            return;
          case 'refusal':
            sayRefusal(reply.body, 'read', fail);
            return;
          default:
            return unreachable(reply);
        }
      }
      if (pools.kind !== 'success' || limits.kind !== 'success')
        throw new Error('A pool read passed its replies without both succeeding');
      setView({
        kind: 'ready',
        pools: pools.body.pools,
        capacity: {
          used: limits.body.usage.agentPersons,
          cap: limits.body.limits.maxAgentPersons,
        },
        readAt: Date.now(),
      });
    },
    [client, sayRefusal],
  );

  const refresh = useCallback(async () => {
    if (isPending.current) return;
    setMessage('');
    setOutcome(null);
    setRekeying(null);
    setRevocation(null);
    setView({ kind: 'loading' });
    isPending.current = true;
    const version = ++generation.current;
    try {
      await read(version);
    } finally {
      if (version === generation.current) isPending.current = false;
    }
  }, [read]);

  const observe = useCallback((work: Promise<void>, what: string) => {
    void work.catch((cause: unknown) => {
      setFault(new Error(`Unexpected agent pool ${what} failure`, { cause }));
    });
  }, []);

  useEffect(() => {
    observe(refresh(), 'read');
    const version = generation;
    return () => {
      version.current++;
      isPending.current = false;
      setIsSending(false);
    };
  }, [refresh, observe]);
  if (fault !== null) throw fault;
  if (view.kind === 'absent') return null;

  async function mutate(mutation: Mutation) {
    // Proof: 2026-10-28, removing this admission sent two re-key POSTs in
    // `serializes a double-clicked re-key`.
    if (isPending.current || view.kind !== 'ready') return;
    isPending.current = true;
    const version = ++generation.current;
    setIsSending(true);
    setMessage('');
    setOutcome(null);
    try {
      switch (mutation.kind) {
        case 'create': {
          setDraftMessage('');
          const { draft: sent } = mutation;
          const size = sizeOf(sent);
          if (size === null) throw new Error('A pool was sent without a valid agent count');
          const reply = await client['postApiOrganizationAgent-pools']({
            body: {
              name: sent.name.trim(),
              size,
              ...(sent.expiry === '' ? {} : { expiresAt: startOfUtcDay(sent.expiry) }),
            },
          });
          if (version !== generation.current) return;
          switch (reply.kind) {
            case 'success': {
              // The reply is handed to the download and dropped: only the file
              // name and the count are kept to say what happened.
              // Proof: 2026-10-28, calling the download a second time here failed
              // `creates a pool, downloads its keys exactly once and never renders
              // them` (2 files saved, expected 1).
              const fileName = downloadAgentPoolKeys(reply.body);
              setDraft(null);
              setOutcome({
                kind: 'delivered',
                act: 'created',
                poolName: reply.body.name,
                fileName,
                keys: reply.body.agents.length,
              });
              await read(version);
              return;
            }
            case 'failure':
              if (reply.failure.code !== 'cancelled')
                setDraftMessage(failureMessage(reply.failure));
              return;
            case 'refusal':
              sayRefusal(reply.body, 'create', setDraftMessage);
              return;
            default:
              return unreachable(reply);
          }
        }
        case 'rekey': {
          const { pool, expiry } = mutation;
          // be-01 refuses a re-key POST without a JSON body (400): the body is
          // always an object, `{}` keeping the pool's expiry.
          // Proof: 2026-10-28, sending no `body` here failed `re-keys with a JSON
          // body, {} when the expiry is kept` and four more re-key cases: no
          // request reached the stub and no keys note was drawn.
          const reply = await client['postApiOrganizationAgent-poolsByIdRekey']({
            params: { id: pool.id },
            body: expiry === '' ? {} : { expiresAt: startOfUtcDay(expiry) },
          });
          if (version !== generation.current) return;
          switch (reply.kind) {
            case 'success': {
              const fileName = downloadAgentPoolKeys(reply.body);
              setRekeying(null);
              setOutcome({
                kind: 'delivered',
                act: 'rekeyed',
                poolName: reply.body.name,
                fileName,
                keys: reply.body.agents.length,
              });
              await read(version);
              return;
            }
            case 'failure':
              if (reply.failure.code !== 'cancelled')
                setRekeying((current) =>
                  current === null ? null : { ...current, message: failureMessage(reply.failure) },
                );
              return;
            case 'refusal': {
              const refusal = reply.body;
              // Proof: 2026-10-28, sending `pool_expired` to the sentence alone
              // failed `offers a new expiry when the pool expired`: no required
              // `New expiry` field was drawn.
              if (refusal.error === 'pool_expired') {
                setRekeying({
                  poolId: pool.id,
                  expiry,
                  isExpired: true,
                  message: agentPoolRefusalText(refusal),
                });
                return;
              }
              sayRefusal(refusal, 'rekey', (text) => {
                setRekeying((current) => (current === null ? null : { ...current, message: text }));
              });
              return;
            }
            default:
              return unreachable(reply);
          }
        }
        case 'revoke': {
          const { pool, removePersons } = mutation;
          const reply = await client['deleteApiOrganizationAgent-poolsById']({
            params: { id: pool.id },
            // Proof: 2026-10-28, sending `removePersons: 'true'` whatever the
            // checkbox held failed `revokes without removing persons unless asked`.
            ...(removePersons ? { query: { removePersons: 'true' as const } } : {}),
          });
          if (version !== generation.current) return;
          switch (reply.kind) {
            case 'success':
              setRevocation(null);
              setOutcome({
                kind: 'revoked',
                poolName: pool.name,
                revokedCredentials: reply.body.revokedCredentials,
                removedPersons: reply.body.removedPersons,
              });
              await read(version);
              return;
            case 'failure':
              if (reply.failure.code !== 'cancelled') setMessage(failureMessage(reply.failure));
              return;
            case 'refusal': {
              const refusal = reply.body;
              setRevocation(null);
              // Proof: 2026-10-28, sending `persons_not_removed` to the alert
              // failed `renders persons_not_removed as revoked with persons kept`:
              // no partial-success state was drawn, only the alert.
              if (refusal.error === 'persons_not_removed') {
                setOutcome({
                  kind: 'persons_kept',
                  poolName: pool.name,
                  text: agentPoolRefusalText(refusal),
                });
                await read(version);
                return;
              }
              sayRefusal(refusal, 'revoke', setMessage);
              return;
            }
            default:
              return unreachable(reply);
          }
        }
        default:
          return unreachable(mutation);
      }
    } catch (cause) {
      if (version === generation.current)
        setFault(new Error('Unexpected agent pool write failure', { cause }));
    } finally {
      if (version === generation.current) {
        isPending.current = false;
        setIsSending(false);
      }
    }
  }

  return (
    <OrganizationSection id="agent-pools-heading" title="Agent pools">
      <p className={STATUS_CLASS}>
        A pool is a set of agent persons made in one act, each with its own API key, for Twilight
        Dash to run. The keys are saved once as a file and never shown here.
      </p>
      {view.kind === 'failure' && (
        <p role="alert" className={ALERT_CLASS}>
          {view.message}
        </p>
      )}
      <div className={ROW_ACTIONS_CLASS}>
        {view.kind === 'ready' && (
          <Button
            type="button"
            className={CONTROL_HEIGHT}
            disabled={isSending}
            onClick={() => {
              setDraftMessage('');
              setDraft(EMPTY_DRAFT);
            }}
          >
            Create agent pool
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          className={CONTROL_HEIGHT}
          disabled={isSending || view.kind === 'loading'}
          onClick={() => {
            observe(refresh(), 'refresh');
          }}
        >
          {view.kind === 'failure' ? 'Retry agent pools' : 'Refresh agent pools'}
        </Button>
      </div>
      {outcome !== null && (
        <OutcomeNote
          outcome={outcome}
          onDismiss={() => {
            setOutcome(null);
          }}
        />
      )}
      {message !== '' && (
        <p role="alert" className={ALERT_CLASS}>
          {message}
        </p>
      )}
      {view.kind === 'loading' && <p className={STATUS_CLASS}>Loading agent pools…</p>}
      {view.kind === 'ready' &&
        (view.pools.length === 0 ? (
          <p className={STATUS_CLASS}>
            No agent pool yet. Create one to give a swarm of agents an API key each, saved as one
            file for <code className="text-xs">twilight-dash pool import</code>.
          </p>
        ) : (
          <ul className={`${LIST_CLASS} gap-3`} aria-label="Agent pools list">
            {view.pools.map((pool) => (
              <PoolRow
                key={pool.id}
                pool={pool}
                standing={standingOf(pool, view.readAt)}
                now={view.readAt}
                isSending={isSending}
                rekeying={rekeying?.poolId === pool.id ? rekeying : null}
                revocation={revocation?.poolId === pool.id ? revocation : null}
                onAskRekey={() => {
                  setMessage('');
                  setRevocation(null);
                  setRekeying({
                    poolId: pool.id,
                    expiry: '',
                    isExpired: standingOf(pool, Date.now()) === 'expired',
                    message: '',
                  });
                }}
                onRekeying={setRekeying}
                onRekey={(expiry) => void mutate({ kind: 'rekey', pool, expiry })}
                onAskRevoke={() => {
                  setMessage('');
                  setRekeying(null);
                  // Removing the persons is opt-in.
                  // Proof: 2026-10-28, starting at `true` failed `revokes without
                  // removing persons unless asked…` and four more revoke cases.
                  setRevocation({ poolId: pool.id, removePersons: false });
                }}
                onRevocation={setRevocation}
                onRevoke={(removePersons) => void mutate({ kind: 'revoke', pool, removePersons })}
              />
            ))}
          </ul>
        ))}
      {draft !== null && view.kind === 'ready' && (
        <CreateDialog
          draft={draft}
          capacity={view.capacity}
          now={view.readAt}
          isSending={isSending}
          message={draftMessage}
          onDraft={setDraft}
          onCancel={() => {
            if (isPending.current) return;
            setDraft(null);
            setDraftMessage('');
          }}
          onSubmit={() => void mutate({ kind: 'create', draft })}
        />
      )}
    </OrganizationSection>
  );
}

/** The sentence of a refusal the panel draws as its own state; a loss there is impossible. */
function agentPoolRefusalText(refusal: AgentPoolRefusal): string {
  const reading = agentPoolRefusal(refusal, 'rekey');
  if (reading.kind !== 'message') throw new Error(`A ${refusal.error} refusal read as a page loss`);
  return reading.text;
}

/** The note after a write: what was saved and how to use it, or what a revocation did. */
function OutcomeNote({
  outcome,
  onDismiss,
}: {
  outcome: Outcome;
  onDismiss: () => void;
}): React.JSX.Element {
  switch (outcome.kind) {
    case 'delivered':
      return (
        <div
          role="status"
          aria-label="Keys downloaded"
          className="border-primary/40 bg-primary/5 flex flex-col gap-2 rounded-md border p-3"
        >
          <p className="m-0 text-sm font-semibold">
            Keys downloaded as <code className="text-xs">{outcome.fileName}</code>
          </p>
          <p className="m-0 text-sm">
            {outcome.act === 'created' ? 'Created' : 'Re-keyed'} {outcome.poolName}:{' '}
            {plural(outcome.keys, 'key was', 'keys were')} saved to that file. They are not shown
            here and cannot be downloaded again; if the file is lost, re-key the pool.
          </p>
          <p className="m-0 text-sm">
            Import it with{' '}
            <code className="text-xs [overflow-wrap:anywhere]">
              twilight-dash pool import {outcome.fileName}
            </code>
            , then delete the file.
          </p>
          <Button
            type="button"
            variant="outline"
            className={`self-start ${CONTROL_HEIGHT}`}
            onClick={onDismiss}
          >
            Done
          </Button>
        </div>
      );
    case 'revoked':
      return (
        <p role="status" className={STATUS_CLASS}>
          Revoked {outcome.poolName}: {plural(outcome.revokedCredentials, 'key', 'keys')} no longer
          {outcome.revokedCredentials === 1 ? ' works' : ' work'}
          {outcome.removedPersons === 0
            ? '.'
            : `, and ${plural(outcome.removedPersons, 'agent person was', 'agent persons were')} removed.`}
        </p>
      );
    case 'persons_kept':
      return (
        <div
          role="status"
          aria-label="Revoked, persons kept"
          className="border-destructive/40 flex flex-col gap-2 rounded-md border p-3"
        >
          <p className="m-0 text-sm font-semibold">
            {outcome.poolName} is revoked; its persons were kept
          </p>
          <p className="m-0 text-sm">{outcome.text}</p>
          <Button
            type="button"
            variant="outline"
            className={`self-start ${CONTROL_HEIGHT}`}
            onClick={onDismiss}
          >
            Done
          </Button>
        </div>
      );
    default:
      return unreachable(outcome);
  }
}

const STANDING_WORDS: Record<PoolStanding, string> = {
  live: 'Live',
  expired: 'Expired',
  revoked: 'Revoked',
};

/** One label and value of a pool row; `isWide` takes a whole line on a phone, as an instant needs. */
function Fact({
  label,
  value,
  isWide = false,
}: {
  label: string;
  value: string;
  isWide?: boolean;
}): React.JSX.Element {
  return (
    <div className={`flex min-w-0 flex-col ${isWide ? 'col-span-2 sm:col-span-1' : ''}`}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="m-0 text-sm [overflow-wrap:anywhere] tabular-nums">{value}</dd>
    </div>
  );
}

function PoolRow({
  pool,
  standing,
  now,
  isSending,
  rekeying,
  revocation,
  onAskRekey,
  onRekeying,
  onRekey,
  onAskRevoke,
  onRevocation,
  onRevoke,
}: {
  pool: AgentPool;
  standing: PoolStanding;
  now: number;
  isSending: boolean;
  rekeying: Rekeying | null;
  revocation: Revocation | null;
  onAskRekey: () => void;
  onRekeying: (next: Rekeying | null) => void;
  onRekey: (expiry: string) => void;
  onAskRevoke: () => void;
  onRevocation: (next: Revocation | null) => void;
  onRevoke: (removePersons: boolean) => void;
}): React.JSX.Element {
  const liveKeys = pool.credentials.length;
  const keyless = Math.max(0, pool.size - liveKeys);
  const idPrefix = `agent-pool-${pool.id}`;
  return (
    <li
      className="border-border flex min-w-0 flex-col gap-3 rounded-md border p-3"
      aria-label={pool.name}
      data-standing={standing}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-semibold [overflow-wrap:anywhere]">{pool.name}</span>
          <span
            className={
              standing === 'expired'
                ? 'border-destructive text-destructive rounded border px-1.5 text-xs font-medium'
                : 'border-border text-muted-foreground rounded border px-1.5 text-xs'
            }
          >
            {STANDING_WORDS[standing]}
          </span>
        </div>
        {standing !== 'revoked' && rekeying === null && revocation === null && (
          <div className={`${ROW_ACTIONS_CLASS} shrink-0`}>
            <Button
              type="button"
              variant="outline"
              className={CONTROL_HEIGHT}
              disabled={isSending || liveKeys === 0}
              title={liveKeys === 0 ? 'No agent of this pool holds a live key' : undefined}
              aria-label={`Re-key ${pool.name}`}
              onClick={onAskRekey}
            >
              Re-key…
            </Button>
            <Button
              type="button"
              variant="outline"
              className={CONTROL_HEIGHT}
              disabled={isSending}
              aria-label={`Revoke ${pool.name}`}
              onClick={onAskRevoke}
            >
              Revoke…
            </Button>
          </div>
        )}
      </div>
      <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(0,2fr)]">
        <Fact label="Agents" value={String(pool.size)} />
        <Fact label="Live keys" value={String(liveKeys)} />
        <Fact
          isWide
          label={standing === 'revoked' ? 'Revoked' : 'Expires'}
          value={
            standing === 'revoked' && pool.revokedAt !== null
              ? minuteOf(pool.revokedAt)
              : pool.expiresAt === null
                ? 'Never'
                : minuteOf(pool.expiresAt)
          }
        />
        <Fact isWide label="Created" value={minuteOf(pool.createdAt)} />
      </dl>
      {rekeying !== null && (
        <form
          aria-label={`Re-key ${pool.name}`}
          className="border-border flex flex-col gap-3 rounded-md border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            onRekey(rekeying.expiry);
          }}
        >
          <p className="m-0 text-sm">
            Re-key {pool.name}? Its {plural(liveKeys, 'live key stops', 'live keys stop')} working
            now, and {plural(liveKeys, 'new key is', 'new keys are')} saved once as a file. No agent
            person is created.
            {keyless > 0 &&
              ` ${plural(keyless, 'agent', 'agents')} without a live key ${keyless === 1 ? 'stays' : 'stay'} keyless.`}
          </p>
          {rekeying.isExpired && (
            <p role="alert" className={ALERT_CLASS}>
              {rekeying.message === ''
                ? 'This pool has expired. Choose a new expiry to re-key it.'
                : rekeying.message}
            </p>
          )}
          <ExpiryField
            id={`${idPrefix}-expiry`}
            label={rekeying.isExpired ? 'New expiry' : 'New expiry (optional)'}
            hint={
              rekeying.isExpired
                ? 'The keys stop working at 00:00 UTC on this day.'
                : `Leave empty to keep ${pool.expiresAt === null ? 'no expiry' : minuteOf(pool.expiresAt)}.`
            }
            value={rekeying.expiry}
            now={now}
            isRequired={rekeying.isExpired}
            isSending={isSending}
            onChange={(expiry) => {
              onRekeying({ ...rekeying, expiry });
            }}
          />
          {!rekeying.isExpired && rekeying.message !== '' && (
            <p role="alert" className={ALERT_CLASS}>
              {rekeying.message}
            </p>
          )}
          <div className={ROW_ACTIONS_CLASS}>
            <Button type="submit" className={CONTROL_HEIGHT} disabled={isSending}>
              Re-key and download keys
            </Button>
            <Button
              type="button"
              variant="outline"
              className={CONTROL_HEIGHT}
              disabled={isSending}
              onClick={() => {
                onRekeying(null);
              }}
            >
              Keep the current keys
            </Button>
          </div>
        </form>
      )}
      {revocation !== null && (
        <div
          role="group"
          aria-label={`Revoke ${pool.name}`}
          className="border-destructive/40 flex flex-col gap-3 rounded-md border p-3"
        >
          <p className="m-0 text-sm">
            Revoke {pool.name}? Its {plural(liveKeys, 'live key stops', 'live keys stop')} working
            now and their claims are released. Its{' '}
            {plural(pool.size, 'agent person', 'agent persons')}{' '}
            {revocation.removePersons
              ? `${pool.size === 1 ? 'is' : 'are'} then removed, with their claims, assignments and credentials, releasing ${String(pool.size)} of the agent-person limit.`
              : `${pool.size === 1 ? 'stays and keeps' : 'stay and keep'} counting toward the agent-person limit.`}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="rounded-md"
              checked={revocation.removePersons}
              disabled={isSending}
              onChange={(event) => {
                onRevocation({ ...revocation, removePersons: event.target.checked });
              }}
            />
            Also remove the {plural(pool.size, 'agent person', 'agent persons')}
          </label>
          <div className={ROW_ACTIONS_CLASS}>
            <Button
              type="button"
              variant="destructive"
              className={CONTROL_HEIGHT}
              disabled={isSending}
              onClick={() => {
                onRevoke(revocation.removePersons);
              }}
            >
              {revocation.removePersons ? 'Revoke and remove persons' : 'Revoke pool'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className={CONTROL_HEIGHT}
              disabled={isSending}
              onClick={() => {
                onRevocation(null);
              }}
            >
              Keep it
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/** An expiry day, offered from tomorrow to {@link LATEST_EXPIRY_DAYS} ahead (UTC). */
function ExpiryField({
  id,
  label,
  hint,
  value,
  now,
  isRequired,
  isSending,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  now: number;
  isRequired: boolean;
  isSending: boolean;
  onChange: (day: string) => void;
}): React.JSX.Element {
  const bounds = expiryBoundsOf(now);
  return (
    <span className={FIELD_CLASS}>
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>
        {label}
      </label>
      <Input
        id={id}
        type="date"
        className={`${CONTROL_HEIGHT} sm:max-w-56`}
        value={value}
        min={bounds.earliest}
        max={bounds.latest}
        required={isRequired}
        disabled={isSending}
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <span id={`${id}-hint`} className="text-muted-foreground text-xs">
        {hint}
      </span>
    </span>
  );
}

/** The counts a create states before it is confirmed. */
function CreateCounts({
  name,
  size,
  capacity,
}: {
  name: string;
  size: number | null;
  capacity: AgentCapacity;
}): React.JSX.Element {
  const room = agentHeadroom(capacity.cap, capacity.used);
  const prefix = name.trim() === '' ? '<name>' : name.trim();
  return (
    <div
      aria-label="What this creates"
      className="border-border bg-muted/40 flex flex-col gap-1 rounded-md border p-3 text-sm"
    >
      {size === null ? (
        <p className="m-0">Choose from 1 to {String(MOST_POOL_SIZE)} agents.</p>
      ) : (
        <p className="m-0">
          Creates {plural(size, 'agent person', 'agent persons')},{' '}
          {size === 1 ? (
            <code className="text-xs [overflow-wrap:anywhere]">{prefix}-1</code>
          ) : (
            <>
              <code className="text-xs [overflow-wrap:anywhere]">{prefix}-1</code> to{' '}
              <code className="text-xs [overflow-wrap:anywhere]">
                {prefix}-{String(size)}
              </code>
            </>
          )}
          , each with one API key, bound to your account.
        </p>
      )}
      <p className="m-0 tabular-nums">
        The organization holds {String(capacity.used)} of {String(capacity.cap)} agent persons;{' '}
        {room === 0 ? 'no more fit.' : `${String(room)} more fit.`}
      </p>
      {size !== null && size > room && (
        <p role="alert" className={ALERT_CLASS}>
          {plural(size, 'agent does', 'agents do')} not fit. Choose at most {String(room)}, or
          remove agent persons first.
        </p>
      )}
    </div>
  );
}

function CreateDialog({
  draft,
  capacity,
  now,
  isSending,
  message,
  onDraft,
  onCancel,
  onSubmit,
}: {
  draft: Draft;
  capacity: AgentCapacity;
  now: number;
  isSending: boolean;
  message: string;
  onDraft: (draft: Draft) => void;
  onCancel: () => void;
  onSubmit: () => void;
}): React.JSX.Element {
  const idPrefix = 'agent-pool-create';
  const size = sizeOf(draft);
  // Proof: 2026-10-28, leaving the submit enabled past the headroom failed
  // `states the counts and holds a pool that does not fit`: the button was enabled.
  const fits = size !== null && size <= agentHeadroom(capacity.cap, capacity.used);
  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Create an agent pool</ModalTitle>
          <ModalDescription>
            The keys are saved once as a file when you create the pool. They are never shown and
            cannot be downloaded again.
          </ModalDescription>
        </ModalHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (fits && draft.name.trim() !== '') onSubmit();
          }}
        >
          <span className={FIELD_CLASS}>
            <label htmlFor={`${idPrefix}-name`} className={FIELD_LABEL_CLASS}>
              Name
            </label>
            <Input
              id={`${idPrefix}-name`}
              className={CONTROL_HEIGHT}
              value={draft.name}
              disabled={isSending}
              required
              maxLength={60}
              autoComplete="off"
              onChange={(event) => {
                onDraft({ ...draft, name: event.target.value });
              }}
            />
          </span>
          <span className={FIELD_CLASS}>
            <label htmlFor={`${idPrefix}-size`} className={FIELD_LABEL_CLASS}>
              Agents
            </label>
            <Input
              id={`${idPrefix}-size`}
              type="number"
              inputMode="numeric"
              className={`${CONTROL_HEIGHT} sm:max-w-32`}
              value={draft.size}
              min={1}
              max={MOST_POOL_SIZE}
              step={1}
              disabled={isSending}
              required
              onChange={(event) => {
                onDraft({ ...draft, size: event.target.value });
              }}
            />
          </span>
          <ExpiryField
            id={`${idPrefix}-expiry`}
            label="Expiry (optional)"
            hint="Every key of the pool stops working at 00:00 UTC on this day. Empty means no expiry."
            value={draft.expiry}
            now={now}
            isRequired={false}
            isSending={isSending}
            onChange={(expiry) => {
              onDraft({ ...draft, expiry });
            }}
          />
          <CreateCounts name={draft.name} size={size} capacity={capacity} />
          {message !== '' && (
            <p role="alert" className={ALERT_CLASS}>
              {message}
            </p>
          )}
          <ModalFooter>
            <Button
              type="button"
              variant="outline"
              className={CONTROL_HEIGHT}
              disabled={isSending}
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className={CONTROL_HEIGHT}
              disabled={isSending || !fits || draft.name.trim() === ''}
            >
              Create and download keys
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
