import { Button, Input } from '@ui/saas-01';
import {
  type ClientReply,
  createMachineCredential,
  listMachineCredentials,
  listPeople,
  listTrustedIssuers,
  revokeMachineCredential,
  rotateMachineCredential,
} from '@wbs/contracts';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

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

import { type CredentialRefusal, credentialRefusal } from './machine-credential-refusal';
import { type AccessLoss } from './organization-access';
import { type CredentialViewer } from './organization-role';
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
import { TrustedIssuersSection } from './trusted-issuers-section';

const CREDENTIAL_SHAPES = [
  listMachineCredentials,
  createMachineCredential,
  rotateMachineCredential,
  revokeMachineCredential,
  listPeople,
  listTrustedIssuers,
] as const;

type Credential = Extract<
  ClientReply<typeof listMachineCredentials>,
  { kind: 'success' }
>['body']['credentials'][number];
type Source = Credential['source'];
type TrustedIssuer = Extract<
  ClientReply<typeof listTrustedIssuers>,
  { kind: 'success' }
>['body']['trustedIssuers'][number];

/** An agent person a credential may be created for, by this viewer. */
export interface CredentialAgent {
  readonly id: string;
  readonly name: string;
}

/**
 * The trusted issuers an `oidc` credential may name: read for an admin
 * (`ready`), never read for a member (`unoffered`), or a failed read, which
 * leaves only the `api_key` source (`unavailable`).
 */
type IssuerChoice =
  | { readonly kind: 'unoffered' }
  | { readonly kind: 'unavailable'; readonly message: string }
  | { readonly kind: 'ready'; readonly issuers: readonly TrustedIssuer[] };

type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | {
      kind: 'ready';
      credentials: readonly Credential[];
      agents: readonly CredentialAgent[];
      names: ReadonlyMap<string, string>;
      issuers: IssuerChoice;
    };

/** A key create or rotate answered, held only until dismissal, refresh, a refusal, another write or unmount. */
interface Secret {
  readonly name: string;
  readonly key: string;
  readonly previousExpiresAt?: number;
}

interface Draft {
  personId: string;
  name: string;
  source: 'api_key' | 'oidc';
  trustedIssuerId: string;
  subject: string;
  audience: string;
}

type Mutation =
  | { kind: 'create'; draft: Draft }
  | { kind: 'rotate'; credential: Credential }
  | { kind: 'revoke'; id: string };

const SOURCE_NAMES: Record<Source, string> = {
  api_key: 'API key',
  oidc: 'OIDC (trusted issuer)',
  mcp_consent: 'MCP consent',
};

/** A server instant to the minute, the coarseness `lastUsedAt` is written at (A13). */
export function minuteOf(instant: number): string {
  return `${new Date(instant).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** The two create sources the dialog offers; anything else is a programming error. */
function sourceOf(value: string): Draft['source'] {
  if (value === 'api_key' || value === 'oidc') return value;
  throw new Error(`Unexpected credential source option: ${value}`);
}

function emptyDraft(person: CredentialAgent | undefined): Draft {
  return {
    personId: person?.id ?? '',
    name: '',
    source: 'api_key',
    trustedIssuerId: '',
    subject: '',
    audience: '',
  };
}

/**
 * Machine credentials of the active organization (`wbs-machine-credentials`
 * A6, A7): the list the viewer reaches, create, rotate for `api_key` only, and
 * revoke under the exact id. With `person`, the same surface narrowed to that
 * agent for the people page, without the trusted issuers section.
 *
 * A created or rotated key lives only in this component's state until it is
 * dismissed, the list is refreshed, another write starts, a refusal arrives or
 * the panel unmounts; it is never written to browser storage and cannot be
 * read again. A metadata failure after a successful write keeps it on screen,
 * because the server will not answer it a second time.
 */
export function MachineCredentialsPanel({
  viewer,
  person,
  onAccessLost,
}: {
  viewer: CredentialViewer;
  person?: CredentialAgent;
  onAccessLost: (loss: AccessLoss) => void;
}): React.JSX.Element {
  const client = useResourceClient(CREDENTIAL_SHAPES);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [message, setMessage] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftMessage, setDraftMessage] = useState('');
  const [copyNote, setCopyNote] = useState('');
  const [fault, setFault] = useState<Error | null>(null);
  const [isSending, setIsSending] = useState(false);
  const isPending = useRef(false);
  const generation = useRef(0);
  const isAdmin = viewer.reach === 'all';
  const ids = person === undefined ? 'machine-credentials' : `machine-credentials-${person.id}`;

  const processRefusal = useCallback(
    (refusal: CredentialRefusal, operation: Parameters<typeof credentialRefusal>[1]) => {
      // Proof: 2026-10-22, omitting this clearing kept the key on screen in
      // `discards a created key when the reread is refused`.
      setSecret(null);
      const outcome = credentialRefusal(refusal, operation);
      if (outcome.kind === 'lost') {
        setView({ kind: 'loading' });
        onAccessLost(outcome.loss);
        return;
      }
      if (operation === 'read') setView({ kind: 'failure', message: outcome.text });
      else if (operation === 'create') setDraftMessage(outcome.text);
      else setMessage(outcome.text);
    },
    [onAccessLost],
  );

  const read = useCallback(
    async (version: number, withRevoked: boolean) => {
      const query = {
        ...(person === undefined ? {} : { personId: person.id }),
        ...(withRevoked ? { include: 'revoked' as const } : {}),
      };
      const [listed, people, issuers] = await Promise.all([
        client['getApiOrganizationMachine-credentials']({ query }),
        person === undefined ? client.getApiPeople({}) : null,
        isAdmin && person === undefined ? client['getApiOrganizationTrusted-issuers']({}) : null,
      ]);
      if (version !== generation.current) return;
      switch (listed.kind) {
        case 'success':
          break;
        case 'failure':
          // Proof: 2026-10-22, clearing the secret here failed `keeps a created
          // key when the list cannot be reread`.
          if (listed.failure.code !== 'cancelled')
            setView({ kind: 'failure', message: failureMessage(listed.failure) });
          return;
        case 'refusal':
          processRefusal(listed.body, 'read');
          return;
        default:
          return unreachable(listed);
      }
      let agents: readonly CredentialAgent[];
      let names: ReadonlyMap<string, string>;
      if (people === null) {
        if (person === undefined) throw new Error('A people read is required without a person');
        agents = [person];
        names = new Map([[person.id, person.name]]);
      } else {
        switch (people.kind) {
          case 'success':
            break;
          case 'failure':
            if (people.failure.code !== 'cancelled')
              setView({ kind: 'failure', message: failureMessage(people.failure) });
            return;
          case 'refusal': {
            const refusal = people.body;
            switch (refusal.error) {
              case 'organization_context_changed':
              case 'no_active_organization':
              case 'not_a_member':
              case 'unauthenticated':
              case 'sso_required':
              case 'reauthentication_required':
                processRefusal(refusal, 'read');
                return;
              case 'invalid_query':
              case 'invalid_params':
              case 'invalid_body':
                processRefusal({ error: 'invalid_query' }, 'read');
                return;
              default:
                return unreachable(refusal);
            }
          }
          default:
            return unreachable(people);
        }
        names = new Map(people.body.people.map((entry) => [entry.id, entry.name]));
        // Proof: 2026-10-22, offering every bound agent to a member failed
        // `offers a member only their own agents`.
        agents = people.body.people.filter(
          (entry) =>
            entry.kind === 'agent' &&
            entry.accountId !== undefined &&
            entry.accountId !== null &&
            (isAdmin || entry.accountId === viewer.userId),
        );
      }
      let choice: IssuerChoice = { kind: 'unoffered' };
      if (issuers !== null) {
        switch (issuers.kind) {
          case 'success':
            choice = { kind: 'ready', issuers: issuers.body.trustedIssuers };
            break;
          case 'failure':
            if (issuers.failure.code === 'cancelled') return;
            choice = { kind: 'unavailable', message: failureMessage(issuers.failure) };
            break;
          case 'refusal': {
            const refusal = issuers.body;
            if (
              refusal.error === 'forbidden' ||
              refusal.error === 'insufficient_scope' ||
              refusal.error === 'invalid_query' ||
              refusal.error === 'invalid_body' ||
              refusal.error === 'invalid_json' ||
              refusal.error === 'invalid_params' ||
              refusal.error === 'invalid_origin'
            ) {
              choice = {
                kind: 'unavailable',
                message: 'Trusted issuers could not be read, so only API keys can be created.',
              };
              break;
            }
            processRefusal(refusal, 'read');
            return;
          }
          default:
            return unreachable(issuers);
        }
      }
      setView({
        kind: 'ready',
        credentials: listed.body.credentials,
        agents,
        names,
        issuers: choice,
      });
    },
    [client, person, isAdmin, viewer.userId, processRefusal],
  );

  const refresh = useCallback(
    async (withRevoked: boolean) => {
      if (isPending.current) return;
      // Proof: 2026-10-22, omitting this clearing failed `create shows the key
      // once, then refresh discards it`: the key was still displayed.
      setSecret(null);
      setMessage('');
      setRevoking(null);
      setConfirmation('');
      setView({ kind: 'loading' });
      isPending.current = true;
      const version = ++generation.current;
      try {
        await read(version, withRevoked);
      } finally {
        if (version === generation.current) isPending.current = false;
      }
    },
    [read],
  );

  const observe = useCallback((work: Promise<void>, what: string) => {
    void work.catch((cause: unknown) => {
      setFault(new Error(`Unexpected machine credential ${what} failure`, { cause }));
    });
  }, []);

  useEffect(() => {
    observe(refresh(false), 'read');
    const version = generation;
    return () => {
      version.current++;
      isPending.current = false;
    };
  }, [refresh, observe]);
  if (fault !== null) throw fault;

  async function mutate(mutation: Mutation) {
    // Proof: 2026-10-22, removing this admission sent two DELETEs in
    // `serializes forced revoke submissions`.
    if (isPending.current || view.kind !== 'ready') return;
    isPending.current = true;
    const version = ++generation.current;
    setIsSending(true);
    // Proof: 2026-10-22, omitting this clearing kept the rotated key on screen
    // in `withdraws a shown key as soon as another write starts`.
    setSecret(null);
    setMessage('');
    setCopyNote('');
    try {
      switch (mutation.kind) {
        case 'revoke': {
          const reply = await client['deleteApiOrganizationMachine-credentialsById']({
            params: { id: mutation.id },
          });
          if (version !== generation.current) return;
          switch (reply.kind) {
            case 'success':
              setRevoking(null);
              setConfirmation('');
              await read(version, includeRevoked);
              return;
            case 'failure':
              if (reply.failure.code !== 'cancelled') setMessage(failureMessage(reply.failure));
              return;
            case 'refusal':
              processRefusal(reply.body, 'revoke');
              return;
            default:
              return unreachable(reply);
          }
        }
        case 'rotate': {
          const reply = await client['postApiOrganizationMachine-credentialsByIdRotate']({
            params: { id: mutation.credential.id },
          });
          if (version !== generation.current) return;
          switch (reply.kind) {
            case 'success':
              setSecret({
                name: mutation.credential.name,
                key: reply.body.key,
                previousExpiresAt: reply.body.previousExpiresAt,
              });
              await read(version, includeRevoked);
              return;
            case 'failure':
              if (reply.failure.code !== 'cancelled') setMessage(failureMessage(reply.failure));
              return;
            case 'refusal':
              processRefusal(reply.body, 'rotate');
              return;
            default:
              return unreachable(reply);
          }
        }
        case 'create': {
          setDraftMessage('');
          const { draft: sent } = mutation;
          const body =
            sent.source === 'api_key'
              ? { source: 'api_key' as const, name: sent.name, personId: sent.personId }
              : {
                  source: 'oidc' as const,
                  name: sent.name,
                  personId: sent.personId,
                  trustedIssuerId: sent.trustedIssuerId,
                  subject: sent.subject,
                  ...(sent.audience === '' ? {} : { audience: sent.audience }),
                };
          const reply = await client['postApiOrganizationMachine-credentials']({ body });
          if (version !== generation.current) return;
          switch (reply.kind) {
            case 'success':
              setDraft(null);
              if (reply.body.source === 'api_key')
                setSecret({ name: reply.body.name, key: reply.body.key });
              else setMessage(`Created ${reply.body.name} for subject ${reply.body.subject}.`);
              await read(version, includeRevoked);
              return;
            case 'failure':
              if (reply.failure.code !== 'cancelled')
                setDraftMessage(failureMessage(reply.failure));
              return;
            case 'refusal':
              processRefusal(reply.body, 'create');
              return;
            default:
              return unreachable(reply);
          }
        }
        default:
          return unreachable(mutation);
      }
    } finally {
      if (version === generation.current) {
        isPending.current = false;
        setIsSending(false);
      }
    }
  }

  const title = person === undefined ? 'Machine credentials' : `Credentials of ${person.name}`;
  const reachSentence = isAdmin
    ? 'As an admin you see every agent person’s credentials.'
    : 'You see only credentials of agent persons bound to your own account.';
  const body = (
    <>
      <p className={STATUS_CLASS}>
        Machine credentials let an agent person act in WBS without a browser. {reachSentence} Last
        use is recorded to the minute.
      </p>
      <div className={ROW_ACTIONS_CLASS}>
        <Button
          type="button"
          variant="outline"
          className={CONTROL_HEIGHT}
          disabled={isSending || view.kind === 'loading'}
          onClick={() => {
            observe(refresh(includeRevoked), 'refresh');
          }}
        >
          Refresh credentials
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="rounded-md"
            checked={includeRevoked}
            disabled={isSending || view.kind === 'loading'}
            onChange={(event) => {
              const next = event.target.checked;
              setIncludeRevoked(next);
              observe(refresh(next), 'refresh');
            }}
          />
          Include revoked
        </label>
      </div>
      {secret !== null && (
        <div
          role="status"
          className="border-primary bg-muted/40 flex min-w-0 flex-col gap-2 rounded-md border-2 p-3"
        >
          <p className="font-semibold">
            Copy the key for {secret.name} now. It will not be shown again.
          </p>
          <label htmlFor={`${ids}-secret`} className={FIELD_LABEL_CLASS}>
            Machine credential key
          </label>
          <Input
            id={`${ids}-secret`}
            value={secret.key}
            readOnly
            className={`${CONTROL_HEIGHT} font-mono`}
            onFocus={(event) => {
              event.currentTarget.select();
            }}
          />
          <p className={STATUS_CLASS}>
            Send it as <code>Authorization: Bearer</code>. Tab to the key to select it, or copy it
            below.
          </p>
          {secret.previousExpiresAt !== undefined && (
            <p className={STATUS_CLASS}>
              The previous key keeps working until {minuteOf(secret.previousExpiresAt)}.
            </p>
          )}
          <div className={ROW_ACTIONS_CLASS}>
            <Button
              type="button"
              variant="outline"
              className={CONTROL_HEIGHT}
              onClick={() => {
                const shown = secret.key;
                // The clipboard is optional: an insecure context or a refused
                // permission leaves the selectable field, said in place.
                // Proof: 2026-10-22, dropping this guard threw in `says when
                // the clipboard is unavailable` instead of rendering the note.
                // lib.dom types `clipboard` as always present; a non-secure
                // context leaves it undefined, which is the boundary this reads.
                const clipboard = (navigator as Partial<Navigator>).clipboard;
                if (clipboard === undefined) {
                  setCopyNote('Copying is not available here. Select the key and copy it.');
                  return;
                }
                clipboard.writeText(shown).then(
                  () => {
                    setCopyNote('Copied.');
                  },
                  () => {
                    setCopyNote('Copying was refused. Select the key and copy it.');
                  },
                );
              }}
            >
              Copy key
            </Button>
            <Button
              type="button"
              variant="outline"
              className={CONTROL_HEIGHT}
              onClick={() => {
                setSecret(null);
                setCopyNote('');
              }}
            >
              Dismiss key
            </Button>
          </div>
          {copyNote !== '' && <p className={STATUS_CLASS}>{copyNote}</p>}
        </div>
      )}
      {view.kind === 'loading' && <p className={STATUS_CLASS}>Loading machine credentials…</p>}
      {view.kind === 'failure' && (
        <div className="flex flex-col gap-2">
          <p role="alert" className={ALERT_CLASS}>
            {view.message}
          </p>
          <Button
            type="button"
            variant="outline"
            className={`self-start ${CONTROL_HEIGHT}`}
            disabled={isSending}
            onClick={() => {
              observe(refresh(includeRevoked), 'retry');
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {view.kind === 'ready' && (
        <>
          {view.agents.length === 0 ? (
            <p className={STATUS_CLASS}>
              {isAdmin
                ? 'No agent person is bound to an account, so none can hold a credential. Bind one on the Directory page.'
                : 'No agent person is bound to your account, so you cannot create a credential yet.'}
            </p>
          ) : (
            <Button
              type="button"
              className={`self-start ${CONTROL_HEIGHT}`}
              disabled={isSending}
              onClick={() => {
                setDraftMessage('');
                setDraft(
                  emptyDraft(person ?? (view.agents.length === 1 ? view.agents[0] : undefined)),
                );
              }}
            >
              Create credential
            </Button>
          )}
          {view.credentials.length === 0 ? (
            <p className={STATUS_CLASS}>
              {person !== undefined
                ? `${person.name} holds no ${includeRevoked ? '' : 'live '}credentials.`
                : isAdmin
                  ? `No ${includeRevoked ? '' : 'live '}machine credentials in this organization.`
                  : `No ${includeRevoked ? '' : 'live '}credentials for agents bound to your account. Credentials of other members’ agents are not listed for you.`}
            </p>
          ) : (
            <ul className={`${LIST_CLASS} gap-3`} aria-label={`${title} list`}>
              {view.credentials.map((credential) => (
                <CredentialRow
                  key={credential.id}
                  credential={credential}
                  personName={view.names.get(credential.personId)}
                  viewer={viewer}
                  isSending={isSending}
                  isRevoking={revoking === credential.id}
                  confirmation={confirmation}
                  onRotate={() => void mutate({ kind: 'rotate', credential })}
                  onAskRevoke={() => {
                    setMessage('');
                    setConfirmation('');
                    setRevoking(credential.id);
                  }}
                  onCancelRevoke={() => {
                    setRevoking(null);
                    setConfirmation('');
                  }}
                  onConfirmation={setConfirmation}
                  onRevoke={() => {
                    // Proof: 2026-10-22, bypassing this comparison sent the
                    // DELETE in `requires the exact id before revoking, then rereads`.
                    if (confirmation !== credential.id) {
                      setMessage('Enter the exact credential ID to revoke it.');
                      return;
                    }
                    void mutate({ kind: 'revoke', id: credential.id });
                  }}
                />
              ))}
            </ul>
          )}
          {draft !== null && (
            <CreateDialog
              ids={ids}
              draft={draft}
              person={person}
              agents={view.agents}
              issuers={view.issuers}
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
        </>
      )}
      {message !== '' && (
        <p role="alert" className={ALERT_CLASS}>
          {message}
        </p>
      )}
    </>
  );
  if (person !== undefined)
    return (
      <section
        aria-labelledby={`${ids}-heading`}
        className="border-border flex min-w-0 flex-col gap-3 rounded-md border p-3"
      >
        <h3 id={`${ids}-heading`} className="text-sm font-semibold">
          {title}
        </h3>
        {body}
      </section>
    );
  return (
    <OrganizationSection id={`${ids}-heading`} title={title}>
      {body}
      {isAdmin && (
        <TrustedIssuersSection
          onAccessLost={onAccessLost}
          onChanged={() => {
            observe(refresh(includeRevoked), 'refresh');
          }}
        />
      )}
    </OrganizationSection>
  );
}

/**
 * An `oidc` row's issuer or subject, which be-01's per-source CHECK makes
 * non-null; a null one is a broken contract and reaches the Error Boundary.
 *
 * @throws When `value` is null.
 */
function required(value: string | null, what: string): string {
  // Proof: 2026-10-22, answering a placeholder here failed `an oidc row without
  // its subject reaches the error boundary`.
  if (value === null) throw new Error(`An oidc machine credential arrived without its ${what}`);
  return value;
}

function Field({ label, value }: { label: string; value: ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="m-0 text-sm [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

/** Why a live row has no rotate control, or the open window's end; null when rotate is offered. */
function rotationOf(credential: Credential): string | null {
  switch (credential.source) {
    case 'api_key':
      return credential.rotationEndsAt === null
        ? null
        : `Rotating: the previous key ends ${minuteOf(credential.rotationEndsAt)}`;
    case 'oidc':
      return 'Rotates at its issuer';
    case 'mcp_consent':
      return 'Rotates by refresh';
    default:
      return unreachable(credential.source);
  }
}

function CredentialRow({
  credential,
  personName,
  viewer,
  isSending,
  isRevoking,
  confirmation,
  onRotate,
  onAskRevoke,
  onCancelRevoke,
  onConfirmation,
  onRevoke,
}: {
  credential: Credential;
  personName: string | undefined;
  viewer: CredentialViewer;
  isSending: boolean;
  isRevoking: boolean;
  confirmation: string;
  onRotate: () => void;
  onAskRevoke: () => void;
  onCancelRevoke: () => void;
  onConfirmation: (value: string) => void;
  onRevoke: () => void;
}): React.JSX.Element {
  const rotation = rotationOf(credential);
  const isRevoked = credential.revokedAt !== null;
  return (
    <li className="border-border flex min-w-0 flex-col gap-3 rounded-md border p-3">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold [overflow-wrap:anywhere]">{credential.name}</span>
        <code className="text-muted-foreground text-xs [overflow-wrap:anywhere]">
          {credential.id}
        </code>
      </div>
      <dl className="m-0 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Agent person" value={personName ?? `Unknown person ${credential.personId}`} />
        <Field label="Source" value={SOURCE_NAMES[credential.source]} />
        <Field
          label="Issued by"
          value={credential.issuedBy === viewer.userId ? 'You' : `Account ${credential.issuedBy}`}
        />
        <Field label="Created" value={minuteOf(credential.createdAt)} />
        <Field
          label="Last used"
          value={credential.lastUsedAt === null ? 'Never' : minuteOf(credential.lastUsedAt)}
        />
        <Field
          label="State"
          value={
            credential.revokedAt !== null
              ? `Revoked ${minuteOf(credential.revokedAt)}`
              : (rotation ?? 'Live')
          }
        />
        {credential.source === 'oidc' && (
          <>
            <Field label="Issuer" value={required(credential.issuer, 'issuer')} />
            <Field label="Subject" value={required(credential.subject, 'subject')} />
          </>
        )}
      </dl>
      {!isRevoked && (
        <div className={ROW_ACTIONS_CLASS}>
          {/* Proof: 2026-10-22, offering Rotate on every source failed `offers rotate on API keys only`. */}
          {credential.source === 'api_key' && (
            <Button
              type="button"
              variant="outline"
              className={CONTROL_HEIGHT}
              disabled={isSending || credential.rotationEndsAt !== null}
              aria-label={`Rotate ${credential.name}`}
              title={rotation ?? undefined}
              onClick={onRotate}
            >
              Rotate key
            </Button>
          )}
          {!isRevoking && (
            <Button
              type="button"
              variant="outline"
              className={CONTROL_HEIGHT}
              disabled={isSending}
              aria-label={`Revoke ${credential.name}`}
              onClick={onAskRevoke}
            >
              Revoke…
            </Button>
          )}
        </div>
      )}
      {!isRevoked && isRevoking && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onRevoke();
          }}
        >
          <label htmlFor={`revoke-${credential.id}`} className={FIELD_LABEL_CLASS}>
            Type {credential.id} to revoke {credential.name}
          </label>
          <Input
            id={`revoke-${credential.id}`}
            className={CONTROL_HEIGHT}
            value={confirmation}
            disabled={isSending}
            autoComplete="off"
            onChange={(event) => {
              onConfirmation(event.target.value);
            }}
          />
          <div className={ROW_ACTIONS_CLASS}>
            <Button
              type="submit"
              variant="destructive"
              className={CONTROL_HEIGHT}
              disabled={isSending}
              aria-label={`Confirm revoking ${credential.name}`}
            >
              Revoke credential
            </Button>
            <Button
              type="button"
              variant="outline"
              className={CONTROL_HEIGHT}
              disabled={isSending}
              onClick={onCancelRevoke}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

function CreateDialog({
  ids,
  draft,
  person,
  agents,
  issuers,
  isSending,
  message,
  onDraft,
  onCancel,
  onSubmit,
}: {
  ids: string;
  draft: Draft;
  person: CredentialAgent | undefined;
  agents: readonly CredentialAgent[];
  issuers: IssuerChoice;
  isSending: boolean;
  message: string;
  onDraft: (draft: Draft) => void;
  onCancel: () => void;
  onSubmit: () => void;
}): React.JSX.Element {
  const offered = issuers.kind === 'ready' && issuers.issuers.length > 0;
  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Create a machine credential</ModalTitle>
          <ModalDescription>
            The credential acts as its agent person only, never with your own rights.
          </ModalDescription>
        </ModalHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {person === undefined ? (
            <span className={FIELD_CLASS}>
              <label htmlFor={`${ids}-person`} className={FIELD_LABEL_CLASS}>
                Agent person
              </label>
              <select
                id={`${ids}-person`}
                className={SELECT_CLASS}
                value={draft.personId}
                disabled={isSending}
                required
                onChange={(event) => {
                  onDraft({ ...draft, personId: event.target.value });
                }}
              >
                <option value="">Choose an agent person</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </span>
          ) : (
            <p className={STATUS_CLASS}>For {person.name}</p>
          )}
          <span className={FIELD_CLASS}>
            <label htmlFor={`${ids}-name`} className={FIELD_LABEL_CLASS}>
              Name
            </label>
            <Input
              id={`${ids}-name`}
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
            <label htmlFor={`${ids}-source`} className={FIELD_LABEL_CLASS}>
              Source
            </label>
            <select
              id={`${ids}-source`}
              className={SELECT_CLASS}
              value={draft.source}
              disabled={isSending}
              onChange={(event) => {
                // Proof: 2026-10-22, removing this check failed `throws on an
                // impossible source selection`.
                onDraft({ ...draft, source: sourceOf(event.target.value) });
              }}
            >
              <option value="api_key">API key, shown once</option>
              <option value="oidc" disabled={!offered}>
                OIDC token of a trusted issuer
              </option>
            </select>
          </span>
          {issuers.kind === 'unavailable' && <p className={STATUS_CLASS}>{issuers.message}</p>}
          {issuers.kind === 'ready' && issuers.issuers.length === 0 && (
            <p className={STATUS_CLASS}>
              Register a trusted issuer below to create OIDC credentials.
            </p>
          )}
          {issuers.kind === 'unoffered' && person === undefined && (
            <p className={STATUS_CLASS}>OIDC credentials are created by an admin.</p>
          )}
          {draft.source === 'oidc' && issuers.kind === 'ready' && (
            <>
              <span className={FIELD_CLASS}>
                <label htmlFor={`${ids}-issuer`} className={FIELD_LABEL_CLASS}>
                  Trusted issuer
                </label>
                <select
                  id={`${ids}-issuer`}
                  className={SELECT_CLASS}
                  value={draft.trustedIssuerId}
                  disabled={isSending}
                  required
                  onChange={(event) => {
                    onDraft({ ...draft, trustedIssuerId: event.target.value });
                  }}
                >
                  <option value="">Choose a trusted issuer</option>
                  {issuers.issuers.map((issuer) => (
                    <option key={issuer.id} value={issuer.id}>
                      {issuer.issuer}
                    </option>
                  ))}
                </select>
              </span>
              <span className={FIELD_CLASS}>
                <label htmlFor={`${ids}-subject`} className={FIELD_LABEL_CLASS}>
                  Subject (exact <code>sub</code> claim)
                </label>
                <Input
                  id={`${ids}-subject`}
                  className={CONTROL_HEIGHT}
                  value={draft.subject}
                  disabled={isSending}
                  required
                  maxLength={512}
                  onChange={(event) => {
                    onDraft({ ...draft, subject: event.target.value });
                  }}
                />
              </span>
              <span className={FIELD_CLASS}>
                <label htmlFor={`${ids}-audience`} className={FIELD_LABEL_CLASS}>
                  Audience (optional; the issuer’s default otherwise)
                </label>
                <Input
                  id={`${ids}-audience`}
                  className={CONTROL_HEIGHT}
                  value={draft.audience}
                  disabled={isSending}
                  maxLength={512}
                  onChange={(event) => {
                    onDraft({ ...draft, audience: event.target.value });
                  }}
                />
              </span>
            </>
          )}
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
              Create credential
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
