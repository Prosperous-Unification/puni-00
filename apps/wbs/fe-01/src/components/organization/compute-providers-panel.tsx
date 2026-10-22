import { Button, Input } from '@ui/saas-01';
import {
  type ClientReply,
  listComputeProviders,
  registerComputeProvider,
  removeComputeProvider,
  updateComputeProvider,
} from '@wbs/contracts';
import { COMPUTE_PROVIDER_KINDS, type ComputeProviderKind } from '@wbs/domain/compute-provider';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/wbs/modal';
import { inUseSentence, LOCATOR_HINTS, providerKindName } from '@/lib/compute-provider-words';
import { failureMessage, unreachable } from '@/lib/http';
import { useResourceClient } from '@/runtime/organization-resources';

import {
  type ComputeProviderOperation,
  type ComputeProviderRefusal,
  computeProviderRefusal,
} from './compute-provider-refusal';
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
  SELECT_CLASS,
  STATUS_CLASS,
} from './organization-section';

const PROVIDER_SHAPES = [
  listComputeProviders,
  registerComputeProvider,
  updateComputeProvider,
  removeComputeProvider,
] as const;

/** One provider instance as the list answers it. */
export type ComputeProvider = Extract<
  ClientReply<typeof listComputeProviders>,
  { kind: 'success' }
>['body']['computeProviders'][number];

/** `absent` is the read's `forbidden`: a role that lost admin since the role read sees no panel. */
type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'absent' }
  | { kind: 'ready'; providers: readonly ComputeProvider[] };

interface Draft {
  name: string;
  kind: ComputeProviderKind;
  locator: string;
}

interface Edit {
  id: string;
  name: string;
  locator: string;
}

/**
 * A removal in progress: `confirm` before anything is sent, `in_use` once
 * be-01 named the resources that reference the instance, which only a cascade
 * removes it past.
 */
type Removal =
  | { stage: 'confirm'; id: string }
  | { stage: 'in_use'; id: string; resources: readonly { id: string; name: string }[] };

type Mutation =
  | { kind: 'register'; draft: Draft }
  | { kind: 'update'; provider: ComputeProvider; edit: Edit }
  | { kind: 'remove'; provider: ComputeProvider; cascade: boolean };

/** Whether `role` administers compute providers: admins and super-admins do, members and viewers never ask (P2). */
export function administersComputeProviders(role: OrganizationRole): boolean {
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

/** A kind option the register form offers; anything else is a programming error. */
function kindOf(value: string): ComputeProviderKind {
  const kind = COMPUTE_PROVIDER_KINDS.find((candidate) => candidate === value);
  if (kind === undefined) throw new Error(`Unexpected compute provider kind option: ${value}`);
  return kind;
}

const EMPTY_DRAFT: Draft = { name: '', kind: 'ssh_host', locator: '' };

/**
 * The compute providers panel once the caller's role is known
 * (`compute-providers` P12): nothing without organizations or for a member or
 * viewer, who send no providers request at all; a rendered failure with retry
 * when the role cannot be read; the panel for an admin or super-admin. `role`
 * is the page's one {@link useOrganizationRole} read, shared with the limits
 * and machine credentials slots.
 */
export function ComputeProvidersSlot({
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
      return <p className={STATUS_CLASS}>Loading compute providers…</p>;
    case 'failure':
      // Proof: 2026-10-23, rendering nothing here failed `renders a failed role
      // read with retry, and recovers` in compute-providers-panel.test.tsx.
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
            Retry compute providers
          </Button>
        </div>
      );
    case 'ready':
      // Proof: 2026-10-23, rendering the panel for every role failed `sends no
      // providers request and renders no panel for a member` (and a viewer):
      // the member's page sent `GET /api/organization/compute-providers`.
      return administersComputeProviders(role.role) ? (
        <ComputeProvidersPanel onAccessLost={onAccessLost} />
      ) : null;
    default:
      return unreachable(role);
  }
}

/**
 * The organization's provider instances (`compute-providers` P2, P12): the
 * hosts and clusters it brings, each with its kind, its display locator and
 * the count of resources it fulfils; register, rename or relocate, and remove,
 * which names every referencing resource before a cascade clears them.
 *
 * Nothing here is optimistic: every write rereads the list, and a refused
 * write leaves the list as it was with the sentence in place.
 */
export function ComputeProvidersPanel({
  onAccessLost,
}: {
  onAccessLost: (loss: AccessLoss) => void;
}): React.JSX.Element | null {
  const client = useResourceClient(PROVIDER_SHAPES);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftMessage, setDraftMessage] = useState('');
  const [edit, setEdit] = useState<Edit | null>(null);
  const [editMessage, setEditMessage] = useState('');
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [fault, setFault] = useState<Error | null>(null);
  const [isSending, setIsSending] = useState(false);
  const isPending = useRef(false);
  const generation = useRef(0);

  const processRefusal = useCallback(
    (refusal: ComputeProviderRefusal, operation: ComputeProviderOperation, provider: string) => {
      if (operation === 'read' && refusal.error === 'forbidden') {
        // Proof: 2026-10-23, rendering this as a failure failed `renders no
        // panel when the read answers forbidden`: the alert stood in its place.
        setView({ kind: 'absent' });
        return;
      }
      const outcome = computeProviderRefusal(refusal, operation, provider);
      if (outcome.kind === 'lost') {
        setView({ kind: 'loading' });
        onAccessLost(outcome.loss);
        return;
      }
      switch (operation) {
        case 'read':
          setView({ kind: 'failure', message: outcome.text });
          return;
        case 'register':
          setDraftMessage(outcome.text);
          return;
        case 'update':
          setEditMessage(outcome.text);
          return;
        case 'remove':
          setMessage(outcome.text);
          return;
        default:
          return unreachable(operation);
      }
    },
    [onAccessLost],
  );

  const read = useCallback(
    async (version: number) => {
      const reply = await client['getApiOrganizationCompute-providers']({});
      // Proof: 2026-10-23, removing this fence failed `never shows the previous
      // organization's providers after a switch`: org-a's late list replaced org-b's.
      if (version !== generation.current) return;
      switch (reply.kind) {
        case 'success':
          setView({ kind: 'ready', providers: reply.body.computeProviders });
          return;
        case 'failure':
          if (reply.failure.code !== 'cancelled')
            setView({ kind: 'failure', message: failureMessage(reply.failure) });
          return;
        case 'refusal':
          processRefusal(reply.body, 'read', '');
          return;
        default:
          return unreachable(reply);
      }
    },
    [client, processRefusal],
  );

  const refresh = useCallback(async () => {
    if (isPending.current) return;
    setMessage('');
    setNotice('');
    setRemoval(null);
    setEdit(null);
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
      setFault(new Error(`Unexpected compute provider ${what} failure`, { cause }));
    });
  }, []);

  useEffect(() => {
    observe(refresh(), 'read');
    const version = generation;
    return () => {
      version.current++;
      isPending.current = false;
    };
  }, [refresh, observe]);
  if (fault !== null) throw fault;
  if (view.kind === 'absent') return null;

  async function mutate(mutation: Mutation) {
    // Proof: 2026-10-23, removing this admission sent two DELETEs in
    // `serializes a double-clicked removal`.
    if (isPending.current || view.kind !== 'ready') return;
    isPending.current = true;
    const version = ++generation.current;
    setIsSending(true);
    setMessage('');
    setNotice('');
    try {
      switch (mutation.kind) {
        case 'register': {
          setDraftMessage('');
          const { draft: sent } = mutation;
          const reply = await client['postApiOrganizationCompute-providers']({
            body: { kind: sent.kind, name: sent.name.trim(), locator: sent.locator.trim() },
          });
          if (version !== generation.current) return;
          switch (reply.kind) {
            case 'success':
              setDraft(null);
              setNotice(`Registered ${reply.body.name}.`);
              await read(version);
              return;
            case 'failure':
              if (reply.failure.code !== 'cancelled')
                setDraftMessage(failureMessage(reply.failure));
              return;
            case 'refusal':
              processRefusal(reply.body, 'register', sent.name);
              return;
            default:
              return unreachable(reply);
          }
        }
        case 'update': {
          setEditMessage('');
          const { provider, edit: sent } = mutation;
          const name = sent.name.trim();
          const locator = sent.locator.trim();
          const body = {
            ...(name === provider.name ? {} : { name }),
            ...(locator === provider.locator ? {} : { locator }),
          };
          // be-01 refuses an empty patch (`invalid_body`); an unchanged edit
          // simply closes.
          if (Object.keys(body).length === 0) {
            setEdit(null);
            return;
          }
          const reply = await client['patchApiOrganizationCompute-providersById']({
            params: { id: provider.id },
            body,
          });
          if (version !== generation.current) return;
          switch (reply.kind) {
            case 'success':
              setEdit(null);
              setNotice(`Saved ${reply.body.name}.`);
              await read(version);
              return;
            case 'failure':
              if (reply.failure.code !== 'cancelled') setEditMessage(failureMessage(reply.failure));
              return;
            case 'refusal':
              processRefusal(reply.body, 'update', provider.name);
              return;
            default:
              return unreachable(reply);
          }
        }
        case 'remove': {
          const { provider, cascade } = mutation;
          const reply = await client['deleteApiOrganizationCompute-providersById']({
            params: { id: provider.id },
            ...(cascade ? { query: { cascade: 'true' as const } } : {}),
          });
          if (version !== generation.current) return;
          switch (reply.kind) {
            case 'success':
              setRemoval(null);
              setNotice(`Removed ${provider.name}.`);
              await read(version);
              return;
            case 'failure':
              if (reply.failure.code !== 'cancelled') setMessage(failureMessage(reply.failure));
              return;
            case 'refusal':
              // Proof: 2026-10-23, sending `in_use` to the sentence instead
              // failed `names the referencing resources and removes them only
              // with cascade`: no cascade control was drawn.
              if (reply.body.error === 'in_use' && !cascade) {
                setRemoval({ stage: 'in_use', id: provider.id, resources: reply.body.resources });
                return;
              }
              setRemoval(null);
              processRefusal(reply.body, 'remove', provider.name);
              return;
            default:
              return unreachable(reply);
          }
        }
        default:
          return unreachable(mutation);
      }
    } catch (cause) {
      if (version === generation.current)
        setFault(new Error('Unexpected compute provider write failure', { cause }));
    } finally {
      if (version === generation.current) {
        isPending.current = false;
        setIsSending(false);
      }
    }
  }

  return (
    <OrganizationSection id="compute-providers-heading" title="Compute providers">
      <p className={STATUS_CLASS}>
        The hosts and clusters this organization brings for its agents. Twilight Dash measures each
        one and reports beside the capacity a project states; WBS never connects to them, and a
        report never changes a plan.
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
            Register compute provider
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
          {view.kind === 'failure' ? 'Retry compute providers' : 'Refresh compute providers'}
        </Button>
      </div>
      {view.kind === 'loading' && <p className={STATUS_CLASS}>Loading compute providers…</p>}
      {view.kind === 'ready' &&
        (view.providers.length === 0 ? (
          <p className={STATUS_CLASS}>
            No compute provider is registered yet. Register the hosts your agents run on, then name
            one on each resource it fulfils in a project’s settings.
          </p>
        ) : (
          <ul className={`${LIST_CLASS} gap-3`} aria-label="Compute providers list">
            {view.providers.map((provider) => (
              <ProviderRow
                key={provider.id}
                provider={provider}
                isSending={isSending}
                edit={edit?.id === provider.id ? edit : null}
                editMessage={editMessage}
                removal={removal?.id === provider.id ? removal : null}
                onEdit={(next) => {
                  setEditMessage('');
                  setEdit(next);
                }}
                onSave={(sent) => void mutate({ kind: 'update', provider, edit: sent })}
                onAskRemove={() => {
                  setMessage('');
                  setEdit(null);
                  setRemoval({ stage: 'confirm', id: provider.id });
                }}
                onCancelRemove={() => {
                  setRemoval(null);
                }}
                onRemove={(cascade) => void mutate({ kind: 'remove', provider, cascade })}
              />
            ))}
          </ul>
        ))}
      {notice !== '' && (
        <p role="status" className={STATUS_CLASS}>
          {notice}
        </p>
      )}
      {message !== '' && (
        <p role="alert" className={ALERT_CLASS}>
          {message}
        </p>
      )}
      {draft !== null && (
        <RegisterDialog
          draft={draft}
          isSending={isSending}
          message={draftMessage}
          onDraft={setDraft}
          onCancel={() => {
            if (isPending.current) return;
            setDraft(null);
            setDraftMessage('');
          }}
          onSubmit={() => void mutate({ kind: 'register', draft })}
        />
      )}
    </OrganizationSection>
  );
}

/** A provider's kind as a quiet chip beside its name. */
export function ProviderKindChip({ kind }: { kind: ComputeProviderKind }): React.JSX.Element {
  return (
    <span className="border-border text-muted-foreground inline-flex shrink-0 items-center rounded border px-1.5 text-xs whitespace-nowrap">
      {providerKindName(kind)}
    </span>
  );
}

function ProviderRow({
  provider,
  isSending,
  edit,
  editMessage,
  removal,
  onEdit,
  onSave,
  onAskRemove,
  onCancelRemove,
  onRemove,
}: {
  provider: ComputeProvider;
  isSending: boolean;
  edit: Edit | null;
  editMessage: string;
  removal: Removal | null;
  onEdit: (edit: Edit | null) => void;
  onSave: (edit: Edit) => void;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onRemove: (cascade: boolean) => void;
}): React.JSX.Element {
  const fulfils =
    provider.resources === 0
      ? 'Fulfils no resource yet'
      : `Fulfils ${String(provider.resources)} ${provider.resources === 1 ? 'resource' : 'resources'}`;
  const idPrefix = `compute-provider-${provider.id}`;
  return (
    <li
      className="border-border flex min-w-0 flex-col gap-3 rounded-md border p-3"
      aria-label={provider.name}
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-semibold [overflow-wrap:anywhere]">{provider.name}</span>
            <ProviderKindChip kind={provider.kind} />
          </div>
          <div className="text-muted-foreground flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
            <code className="text-xs [overflow-wrap:anywhere]">{provider.locator}</code>
            <span aria-hidden="true">·</span>
            <span>{fulfils}</span>
          </div>
        </div>
        {edit === null && removal === null && (
          <div className={`${ROW_ACTIONS_CLASS} shrink-0`}>
            <Button
              type="button"
              variant="outline"
              className={CONTROL_HEIGHT}
              disabled={isSending}
              aria-label={`Edit ${provider.name}`}
              onClick={() => {
                onEdit({ id: provider.id, name: provider.name, locator: provider.locator });
              }}
            >
              Edit…
            </Button>
            <Button
              type="button"
              variant="outline"
              className={CONTROL_HEIGHT}
              disabled={isSending}
              aria-label={`Remove ${provider.name}`}
              onClick={onAskRemove}
            >
              Remove…
            </Button>
          </div>
        )}
      </div>
      {edit !== null && (
        <form
          className="flex flex-col gap-3"
          aria-label={`Edit ${provider.name}`}
          onSubmit={(event) => {
            event.preventDefault();
            onSave(edit);
          }}
        >
          <span className={FIELD_CLASS}>
            <label htmlFor={`${idPrefix}-name`} className={FIELD_LABEL_CLASS}>
              Name
            </label>
            <Input
              id={`${idPrefix}-name`}
              className={CONTROL_HEIGHT}
              value={edit.name}
              disabled={isSending}
              required
              maxLength={80}
              autoComplete="off"
              onChange={(event) => {
                onEdit({ ...edit, name: event.target.value });
              }}
            />
          </span>
          <span className={FIELD_CLASS}>
            <label htmlFor={`${idPrefix}-locator`} className={FIELD_LABEL_CLASS}>
              Locator
            </label>
            <Input
              id={`${idPrefix}-locator`}
              className={`${CONTROL_HEIGHT} font-mono`}
              value={edit.locator}
              disabled={isSending}
              required
              maxLength={256}
              autoComplete="off"
              onChange={(event) => {
                onEdit({ ...edit, locator: event.target.value });
              }}
            />
          </span>
          {editMessage !== '' && (
            <p role="alert" className={ALERT_CLASS}>
              {editMessage}
            </p>
          )}
          <div className={ROW_ACTIONS_CLASS}>
            <Button type="submit" className={CONTROL_HEIGHT} disabled={isSending}>
              Save changes
            </Button>
            <Button
              type="button"
              variant="outline"
              className={CONTROL_HEIGHT}
              disabled={isSending}
              onClick={() => {
                onEdit(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {removal !== null && (
        <div
          role="group"
          aria-label={`Remove ${provider.name}`}
          className="border-destructive/40 flex flex-col gap-2 rounded-md border p-3"
        >
          <p className="m-0 text-sm">
            {removal.stage === 'confirm'
              ? provider.resources === 0
                ? `Remove ${provider.name}? No resource names it.`
                : `Remove ${provider.name}? ${String(provider.resources)} ${
                    provider.resources === 1 ? 'resource names' : 'resources name'
                  } it; you will see which before any reference is cleared.`
              : inUseSentence(provider.name, removal.resources)}
          </p>
          <div className={ROW_ACTIONS_CLASS}>
            <Button
              type="button"
              variant="destructive"
              className={CONTROL_HEIGHT}
              disabled={isSending}
              onClick={() => {
                onRemove(removal.stage === 'in_use');
              }}
            >
              {removal.stage === 'confirm'
                ? 'Remove compute provider'
                : `Remove and clear ${removal.resources.length === 1 ? 'the reference' : `${String(removal.resources.length)} references`}`}
            </Button>
            <Button
              type="button"
              variant="outline"
              className={CONTROL_HEIGHT}
              disabled={isSending}
              onClick={onCancelRemove}
            >
              Keep it
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function RegisterDialog({
  draft,
  isSending,
  message,
  onDraft,
  onCancel,
  onSubmit,
}: {
  draft: Draft;
  isSending: boolean;
  message: string;
  onDraft: (draft: Draft) => void;
  onCancel: () => void;
  onSubmit: () => void;
}): React.JSX.Element {
  const idPrefix = 'compute-provider-register';
  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Register a compute provider</ModalTitle>
          <ModalDescription>
            A host or cluster this organization brings. WBS stores its name and locator only and
            never connects to it.
          </ModalDescription>
        </ModalHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
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
              maxLength={80}
              autoComplete="off"
              onChange={(event) => {
                onDraft({ ...draft, name: event.target.value });
              }}
            />
          </span>
          <span className={FIELD_CLASS}>
            <label htmlFor={`${idPrefix}-kind`} className={FIELD_LABEL_CLASS}>
              Kind
            </label>
            <select
              id={`${idPrefix}-kind`}
              className={SELECT_CLASS}
              value={draft.kind}
              disabled={isSending}
              onChange={(event) => {
                // Throws loudly and leaves the draft unchanged; a throw in an
                // event handler reaches window `error`, not the Error Boundary.
                onDraft({ ...draft, kind: kindOf(event.target.value) });
              }}
            >
              {COMPUTE_PROVIDER_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {providerKindName(kind)}
                </option>
              ))}
            </select>
          </span>
          <span className={FIELD_CLASS}>
            <label htmlFor={`${idPrefix}-locator`} className={FIELD_LABEL_CLASS}>
              Locator
            </label>
            <Input
              id={`${idPrefix}-locator`}
              className={`${CONTROL_HEIGHT} font-mono`}
              value={draft.locator}
              disabled={isSending}
              required
              maxLength={256}
              autoComplete="off"
              aria-describedby={`${idPrefix}-locator-hint`}
              onChange={(event) => {
                onDraft({ ...draft, locator: event.target.value });
              }}
            />
            <span id={`${idPrefix}-locator-hint`} className="text-muted-foreground text-xs">
              {LOCATOR_HINTS[draft.kind]}
            </span>
          </span>
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
            <Button type="submit" className={CONTROL_HEIGHT} disabled={isSending}>
              Register
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
