import { Button } from '@ui/saas-01';
import {
  bindCatalogueStep,
  type ClientReply,
  type listStepCatalogue,
  listWorkItemTypes,
  reorderCatalogueBindings,
  unbindCatalogueStep,
} from '@wbs/contracts';
import { useEffect, useId, useRef, useState } from 'react';

import { failureMessage, unreachable } from '@/lib/http';
import { useResourceClient } from '@/runtime/organization-resources';

import type { AccessLoss } from './organization-access';
import {
  ALERT_CLASS,
  FIELD_CLASS,
  FIELD_LABEL_CLASS,
  FORM_CLASS,
  LIST_CLASS,
  ROW_ACTIONS_CLASS,
  SELECT_CLASS,
  STATUS_CLASS,
} from './organization-section';
import { resolveStepWriteRefusal } from './step-catalogue-access';

const SHAPES = [
  bindCatalogueStep,
  listWorkItemTypes,
  reorderCatalogueBindings,
  unbindCatalogueStep,
] as const;
type Catalogue = Extract<ClientReply<typeof listStepCatalogue>, { kind: 'success' }>['body'];
type Binding = Catalogue['bindings'][number];
type Definition = Catalogue['definitions'][number];
type Types = Extract<
  ClientReply<typeof listWorkItemTypes>,
  { kind: 'success' }
>['body']['workItemTypes'];
type View =
  { kind: 'loading' } | { kind: 'failure'; message: string } | { kind: 'ready'; types: Types };
type Protection = Extract<
  Extract<ClientReply<typeof unbindCatalogueStep>, { kind: 'refusal' }>['body'],
  { error: 'step_nodes_in_use' }
>;
type Removal =
  | { kind: 'clear'; binding: Binding }
  | { kind: 'blocked'; binding: Binding; protection: Pick<Protection, 'count' | 'pairs'> };
type Job =
  | { kind: 'bind'; stepId: string; workItemTypeId: string | null }
  | { kind: 'preview' | 'remove'; binding: Binding }
  | { kind: 'reorder'; ids: string[] };
type Reply = ClientReply<
  typeof bindCatalogueStep | typeof unbindCatalogueStep | typeof reorderCatalogueBindings
>;

/** An observed owner supplies this scope; the UI never asks for an arbitrary scope id. */
export type StepBindingScope = Pick<Binding, 'scopeKind' | 'scopeId'> & { name: string };
interface Props {
  catalogue: Catalogue;
  scope: StepBindingScope;
  onChanged: () => void;
  onAccessLost: (loss: AccessLoss) => void;
}

/**
 * Own-scope bindings across every type, using real directory choices and current API admission.
 * A new scope replaces the editor lifetime. Reorder always sends the entire own-scope census;
 * a visible type filter changes drawing only. Removal previews before confirmation and reapplies
 * under server admission, retaining named late conflicts instead of claiming preview authority.
 */
export function StepBindings(props: Props): React.JSX.Element {
  // Proof: dropping the scope key kept the old draft for both changed id and kind; both owner-change cases failed (verification-step-binding-ui-20261120.json).
  return <BindingEditor key={`${props.scope.scopeKind}:${props.scope.scopeId}`} {...props} />;
}

function BindingEditor({ catalogue, scope, onChanged, onAccessLost }: Props): React.JSX.Element {
  const client = useResourceClient(SHAPES);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [readVersion, setReadVersion] = useState(0);
  const [stepId, setStepId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [filter, setFilter] = useState('all');
  const [message, setMessage] = useState('');
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [sending, setSending] = useState(false);
  const [fault, setFault] = useState<Error | null>(null);
  const pending = useRef(false),
    live = useRef(true);
  const identity = useId();

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    let isCurrent = true;
    setView({ kind: 'loading' });
    async function readTypes() {
      const reply = await client['getApiWork-item-types']({});
      // Proof: omitting this return delivered a withdrawn type-read refusal after refresh; late-types owner failed, then passed restored.
      if (!isCurrent) return;
      switch (reply.kind) {
        case 'success':
          setView({ kind: 'ready', types: reply.body.workItemTypes });
          return;
        case 'failure':
          if (reply.failure.code !== 'cancelled')
            setView({ kind: 'failure', message: failureMessage(reply.failure) });
          return;
        case 'refusal': {
          const outcome = resolveStepWriteRefusal(reply.body);
          if (outcome.kind === 'lost') onAccessLost(outcome.loss);
          else setView({ kind: 'failure', message: outcome.text });
          return;
        }
        default:
          return unreachable(reply);
      }
    }
    void readTypes().catch((cause: unknown) => {
      if (isCurrent) setFault(new Error('Unexpected step binding type read failure', { cause }));
    });
    return () => {
      isCurrent = false;
    };
  }, [client, readVersion, onAccessLost]);

  // Proof: independent scope-kind and scope-id omissions exposed another scope or sibling rows; both selected owners failed, then passed restored.
  const ownBindings = catalogue.bindings
    .filter((binding) => binding.scopeKind === scope.scopeKind && binding.scopeId === scope.scopeId)
    .sort(compareBindings);
  const definitions = new Map(
    catalogue.definitions.map((definition) => [definition.id, definition]),
  );
  function definitionOf(binding: Binding): Definition {
    const definition = definitions.get(binding.stepId);
    // Proof: omission reached a native TypeError instead of this precise metadata fault; the production Error Boundary selector distinguished them.
    if (definition === undefined)
      throw new Error(
        `Step binding names a missing active definition: ${binding.bindingId} / ${binding.stepId}`,
      );
    return definition;
  }
  // The one catalogue response owns these relationships; a separate type directory may be newer.
  for (const binding of ownBindings) definitionOf(binding);

  async function write(job: Job) {
    // Proof: dropping admission sent two POSTs from one held form; pending-binding owner failed, then passed restored.
    if (pending.current) return;
    pending.current = true;
    setSending(true);
    setMessage('');
    if (job.kind === 'preview') setRemoval(null);
    try {
      let reply: Reply;
      switch (job.kind) {
        case 'bind':
          reply = await client.bindCatalogueStep({
            body: {
              scopeKind: scope.scopeKind,
              scopeId: scope.scopeId,
              stepId: job.stepId,
              workItemTypeId: job.workItemTypeId,
              position: 10,
            },
          });
          break;
        case 'reorder':
          reply = await client.reorderCatalogueBindings({
            body: { scopeKind: scope.scopeKind, scopeId: scope.scopeId, ids: job.ids },
          });
          break;
        case 'preview':
        case 'remove':
          reply = await client.unbindCatalogueStep({
            params: { bindingId: job.binding.bindingId },
            // Proof: forcing either boolean broke the exact preview/apply request sequence; each independent mode fault failed its owner.
            body: { dryRun: job.kind === 'preview' },
          });
          break;
        default:
          return unreachable(job);
      }
      // Proof: omission called access loss after refresh replaced the editor; held-preview owner failed, then passed restored.
      if (!live.current) return;
      switch (reply.kind) {
        case 'success':
          if (job.kind === 'preview') {
            // Proof: omission threw the wrong fault for204; the precise preview-mode Error Boundary owner failed.
            if (reply.status !== 200)
              throw new Error('Step binding preview requires a 200 response');
            setRemoval(
              reply.body.wouldRefuse === null
                ? { kind: 'clear', binding: job.binding }
                : { kind: 'blocked', binding: job.binding, protection: reply.body },
            );
          } else {
            // Proof: omission accepted a200preview as removal and refreshed; the precise apply-mode Error Boundary owner failed.
            if (job.kind === 'remove' && reply.status !== 204)
              throw new Error('Step binding removal requires a 204 response');
            onChanged();
          }
          return;
        case 'failure':
          if (reply.failure.code !== 'cancelled') setMessage(failureMessage(reply.failure));
          return;
        case 'refusal':
          switch (reply.body.error) {
            case 'step_nodes_in_use':
              // Only the unbind shape can return this variant; preserve the exact request target.
              if (job.kind !== 'preview' && job.kind !== 'remove')
                throw new Error('Protected step refusal without a removal request');
              setRemoval({ kind: 'blocked', binding: job.binding, protection: reply.body });
              return;
            case 'stale_order':
              setMessage('Bindings changed. Refresh steps before reordering.');
              return;
            default: {
              const outcome = resolveStepWriteRefusal(reply.body);
              if (outcome.kind === 'lost') onAccessLost(outcome.loss);
              else setMessage(outcome.text);
              return;
            }
          }
        default:
          return unreachable(reply);
      }
    } catch (cause) {
      if (live.current) setFault(new Error('Unexpected step binding mutation failure', { cause }));
    } finally {
      pending.current = false;
      if (live.current) setSending(false);
    }
  }

  function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    // Proof: omission lost the local selection refusal; lower request validation still blocked transport and the selection owner failed.
    if (stepId === '') {
      setMessage('Choose an active step definition.');
      return;
    }
    void write({ kind: 'bind', stepId, workItemTypeId: typeId === '' ? null : typeId });
  }
  function move(binding: Binding, direction: -1 | 1) {
    const offset =
      ownBindings.findIndex((candidate) => candidate.bindingId === binding.bindingId) + direction;
    const neighbor = ownBindings.find((_binding, index) => index === offset);
    if (neighbor === undefined) return;
    // Proof: substituting the visible-type census omitted Spike; the actual-client complete-census request owner failed.
    const ids = ownBindings.map((candidate) =>
      candidate.bindingId === binding.bindingId
        ? neighbor.bindingId
        : candidate.bindingId === neighbor.bindingId
          ? binding.bindingId
          : candidate.bindingId,
    );
    void write({ kind: 'reorder', ids });
  }

  if (fault !== null) throw fault;
  function renderBindings(): React.JSX.Element {
    switch (view.kind) {
      case 'loading':
        return <p className={STATUS_CLASS}>Loading work item types…</p>;
      case 'failure':
        return (
          <>
            <p role="alert" className={ALERT_CLASS}>
              {view.message}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setReadVersion((version) => version + 1);
              }}
            >
              Retry work item types
            </Button>
          </>
        );
      case 'ready': {
        const types = view.types;
        // Proof: untagged option values broke both all/null identity cases; omitting the null predicate separately included every-type rows.
        const visible = ownBindings.filter(
          (binding) =>
            filter === 'all' ||
            (filter === ''
              ? binding.workItemTypeId === null
              : binding.workItemTypeId !== null && `type:${binding.workItemTypeId}` === filter),
        );
        return (
          <>
            <label htmlFor={`${identity}-filter`} className={FIELD_CLASS}>
              <span className={FIELD_LABEL_CLASS}>View bindings</span>
              <select
                id={`${identity}-filter`}
                className={SELECT_CLASS}
                value={filter}
                disabled={sending}
                onChange={(event) => {
                  setFilter(event.target.value);
                }}
              >
                <option value="all">All types</option>
                <option value="">Every type</option>
                {types.map((type) => (
                  <option key={type.id} value={`type:${type.id}`}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-muted-foreground text-sm">
              Order covers every binding at this scope, across all types. Bindings add steps; they
              do not hide inherited steps.
            </p>
            {ownBindings.length === 0 ? (
              <p className={STATUS_CLASS}>No step bindings at this scope.</p>
            ) : visible.length === 0 ? (
              <p className={STATUS_CLASS}>No bindings in this type view.</p>
            ) : (
              <div className="overflow-x-auto">
                <table
                  aria-label={`Bindings at ${scope.name}`}
                  className="w-full border-collapse text-left text-sm"
                >
                  <thead>
                    <tr>
                      {['Scope order', 'Step', 'Applies to', 'Origin', 'Actions'].map((label) => (
                        <th key={label} scope="col" className="px-2 py-2 font-medium">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((binding) => {
                      const definition = definitionOf(binding),
                        label = `${definition.name} for ${typeName(binding, types)}`,
                        order = ownBindings.findIndex(
                          (candidate) => candidate.bindingId === binding.bindingId,
                        );
                      return (
                        <tr key={binding.bindingId} className="border-border border-b">
                          <td className="px-2 py-2 tabular-nums">{order + 1}</td>
                          <th scope="row" className="px-2 py-2 font-medium">
                            {definition.name}
                          </th>
                          <td className="px-2 py-2">{typeName(binding, types)}</td>
                          <td className="px-2 py-2">
                            {binding.origin === 'authored' ? 'Authored' : 'Migration'}
                          </td>
                          <td className="px-2 py-2">
                            <div className={ROW_ACTIONS_CLASS}>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={sending || order === 0}
                                aria-label={`Move ${label} earlier`}
                                onClick={() => {
                                  move(binding, -1);
                                }}
                              >
                                Move earlier
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={sending || order === ownBindings.length - 1}
                                aria-label={`Move ${label} later`}
                                onClick={() => {
                                  move(binding, 1);
                                }}
                              >
                                Move later
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={sending}
                                aria-label={`Preview removal of ${label}`}
                                onClick={() => {
                                  void write({ kind: 'preview', binding });
                                }}
                              >
                                Preview removal
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <form
              aria-label="Bind existing step"
              className={FORM_CLASS}
              onSubmit={submit}
              noValidate
            >
              <label htmlFor={`${identity}-step`} className={FIELD_CLASS}>
                <span className={FIELD_LABEL_CLASS}>Existing step</span>
                <select
                  id={`${identity}-step`}
                  className={SELECT_CLASS}
                  value={stepId}
                  disabled={sending}
                  onChange={(event) => {
                    setStepId(event.target.value);
                  }}
                >
                  <option value="">Choose a definition</option>
                  {catalogue.definitions.map((definition) => (
                    <option key={definition.id} value={definition.id}>
                      {definition.name} ({definition.code})
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor={`${identity}-type`} className={FIELD_CLASS}>
                <span className={FIELD_LABEL_CLASS}>Work item type</span>
                <select
                  id={`${identity}-type`}
                  className={SELECT_CLASS}
                  value={typeId}
                  disabled={sending}
                  onChange={(event) => {
                    setTypeId(event.target.value);
                  }}
                >
                  <option value="">Every type</option>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" variant="outline" disabled={sending}>
                Bind step here
              </Button>
            </form>
            {types.length === 0 && (
              <p className={STATUS_CLASS}>
                No work item types are defined. Every-type bindings also apply to untyped leaves.
              </p>
            )}
          </>
        );
      }
      default:
        return unreachable(view);
    }
  }
  return (
    <section aria-labelledby={`${identity}-heading`} className="flex flex-col gap-3">
      <h3 id={`${identity}-heading`} className="m-0 text-base font-medium">
        {scope.name} step bindings
      </h3>
      {renderBindings()}
      {message !== '' && (
        <p role="alert" className={ALERT_CLASS}>
          {message}
        </p>
      )}
      {removal !== null && (
        <div className="border-border flex flex-col gap-3 border-l pl-3">
          <p>
            Remove {definitionOf(removal.binding).name} for{' '}
            {view.kind === 'ready'
              ? typeName(removal.binding, view.types)
              : (removal.binding.workItemTypeId ?? 'Every type')}{' '}
            from {scope.name}?
          </p>
          <p className="text-muted-foreground text-sm">
            The preview does not change bindings. Applying checks current facts again and keeps
            definition, package values and history.
          </p>
          {removal.kind === 'clear' ? (
            <Button
              type="button"
              variant="destructive"
              disabled={sending}
              className="self-start"
              onClick={() => {
                void write({ kind: 'remove', binding: removal.binding });
              }}
            >
              Confirm binding removal
            </Button>
          ) : (
            <>
              <p role="alert" className={ALERT_CLASS}>
                {removal.protection.count} protected steps would lose this binding.
                {removal.protection.pairs.length < removal.protection.count
                  ? ` Showing the first ${String(removal.protection.pairs.length)}.`
                  : ''}
              </p>
              <ul className={LIST_CLASS}>
                {removal.protection.pairs.map((pair) => (
                  <li
                    key={JSON.stringify([pair.workPackageId, pair.id, pair.stepId])}
                    className="flex flex-wrap gap-2 text-sm"
                  >
                    <a href={`/?workPackage=${encodeURIComponent(pair.workPackageId)}`}>
                      <span>{pair.name}</span>
                    </a>
                    <code>{pair.stepId}</code>
                    <span>{pair.facts.join(', ')}</span>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                disabled={sending}
                className="self-start"
                onClick={() => {
                  void write({ kind: 'preview', binding: removal.binding });
                }}
              >
                Check removal again
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={sending}
            className="self-start"
            onClick={() => {
              setRemoval(null);
            }}
          >
            Cancel removal
          </Button>
        </div>
      )}
    </section>
  );
}

/** Scope order uses the server's binary ID tie-break, independent of the browser locale. */
function compareBindings(left: Binding, right: Binding): number {
  if (left.position !== right.position) return left.position - right.position;
  // Proof: both no tie-break and localeCompare reordered Z/a incorrectly; each tied-position response-order owner failed, then passed restored.
  return left.bindingId < right.bindingId ? -1 : left.bindingId > right.bindingId ? 1 : 0;
}

/** Types are a separate observation: a deleted type remains visibly stale until catalogue refresh. */
function typeName(binding: Binding, types: Types): string {
  if (binding.workItemTypeId === null) return 'Every type';
  const type = types.find((candidate) => candidate.id === binding.workItemTypeId);
  return type === undefined ? `Type no longer listed: ${binding.workItemTypeId}` : type.name;
}
