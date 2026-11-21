import { Button, Input } from '@ui/saas-01';
import {
  bindCatalogueStep,
  type ClientReply,
  type listStepCatalogue,
  patchStepDefinition,
  retireStepDefinition,
} from '@wbs/contracts';
import { allowanceHundredthsOf } from '@wbs/domain/estimate';
import { useEffect, useId, useRef, useState } from 'react';

import { failureMessage, unreachable } from '@/lib/http';
import { useResourceClient, useResourceScope } from '@/runtime/organization-resources';

import type { AccessLoss } from './organization-access';
import {
  ALERT_CLASS,
  FIELD_CLASS,
  FIELD_LABEL_CLASS,
  FORM_CLASS,
  ROW_ACTIONS_CLASS,
  SELECT_CLASS,
} from './organization-section';
import type { StepBindingScope } from './step-bindings';
import { resolveStepWriteRefusal } from './step-catalogue-access';
import { useStepTypes } from './use-step-types';

const WRITE_SHAPES = [bindCatalogueStep, patchStepDefinition, retireStepDefinition] as const;
type Catalogue = Extract<ClientReply<typeof listStepCatalogue>, { kind: 'success' }>['body'];
type Definition = Catalogue['definitions'][number];
type WriteReply = ClientReply<(typeof WRITE_SHAPES)[number]>;
type Draft =
  | { kind: 'new' }
  | { kind: 'edit'; definition: Definition }
  | { kind: 'retire'; definition: Definition };

/**
 * Global metadata management through current catalogue routes. Successful writes reread
 * the owning panel; defaults never write package values. A replaced editor ignores late
 * replies, and one synchronous admission owns every pending mutation in this editor.
 * Membership display roles do not decide write permission: the server's refusal does.
 */
export function StepDefinitions({
  catalogue,
  mode,
  onChanged,
  onAccessLost,
}: {
  catalogue: Catalogue;
  mode: { kind: 'catalogue' } | { kind: 'scope'; scope: StepBindingScope };
  onChanged: () => void;
  onAccessLost: (loss: AccessLoss) => void;
}): React.JSX.Element {
  const client = useResourceClient(WRITE_SHAPES);
  const { organization } = useResourceScope();
  const types = useStepTypes(onAccessLost);
  const [typeChoice, setTypeChoice] = useState('');
  const [draft, setDraft] = useState<Draft>({ kind: 'new' });
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [unit, setUnit] = useState('workdays');
  const [allowance, setAllowance] = useState('0');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [fault, setFault] = useState<Error | null>(null);
  const pending = useRef(false);
  const live = useRef(true);
  const formId = useId();

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  function selectDraft(next: Draft) {
    setDraft(next);
    setMessage('');
    if (next.kind === 'edit') {
      setName(next.definition.name);
      setUnit(next.definition.defaultEstimateUnit);
      setAllowance(String(next.definition.defaultAllowanceBps / 100));
    } else if (next.kind === 'new') {
      setName('');
      setCode('');
      setUnit('workdays');
      setAllowance('0');
      setTypeChoice('');
    }
  }

  async function write(send: () => Promise<WriteReply>) {
    // Proof: removing admission sent two real POSTs from one held form; duplicate-submit test failed (verification-step-definition-ui-20261120.json).
    if (pending.current) return;
    pending.current = true;
    setSending(true);
    setMessage('');
    try {
      const reply = await send();
      // Proof: removing this fence called access loss after refresh replaced the editor; late-reply test failed, then passed restored.
      if (!live.current) return;
      switch (reply.kind) {
        case 'success':
          onChanged();
          return;
        case 'failure':
          if (reply.failure.code !== 'cancelled') setMessage(failureMessage(reply.failure));
          return;
        case 'refusal': {
          const outcome = resolveStepWriteRefusal(reply.body);
          if (outcome.kind === 'lost') onAccessLost(outcome.loss);
          else setMessage(outcome.text);
          return;
        }
        default:
          return unreachable(reply);
      }
    } catch (cause) {
      if (live.current)
        setFault(new Error('Unexpected step definition mutation failure', { cause }));
    } finally {
      pending.current = false;
      if (live.current) setSending(false);
    }
  }

  function submit(target: StepBindingScope, event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.kind === 'retire') {
      void write(() => client.retireStepDefinition({ params: { stepId: draft.definition.id } }));
      return;
    }
    // Proof: parsing blanks as numbers sent zero instead of the local refusal; both explicit-allowance cases failed, then passed restored.
    const defaultAllowanceBps = allowanceHundredthsOf(
      allowance.trim() === '' ? NaN : Number(allowance),
    );
    // Proof: bypassing validation lost the precise local refusal for 12.345; lossy-allowance test failed, then passed restored.
    if (defaultAllowanceBps === null) {
      setMessage('Enter an allowance from 0 to 1000 with at most two decimal places.');
      return;
    }
    // Proof: bypassing this branch lost the rendered refusal for injected hours; invalid-unit test failed, then passed restored.
    if (unit !== 'workdays' && unit !== 'minutes') {
      setMessage('Choose workdays or minutes.');
      return;
    }
    const fields: Pick<Definition, 'name' | 'defaultEstimateUnit' | 'defaultAllowanceBps'> = {
      name,
      defaultEstimateUnit: unit,
      defaultAllowanceBps,
    };
    if (draft.kind === 'edit') {
      void write(() =>
        client.patchStepDefinition({ params: { stepId: draft.definition.id }, body: fields }),
      );
    } else {
      if (types.view.kind !== 'ready')
        throw new Error('Step creation requires loaded type choices');
      const chosen = types.view.types.find((type) => `type:${type.id}` === typeChoice);
      // Proof: omission lost the local unlisted-type refusal in scoped-step-settings.test.tsx; the type is never inferred as every-type.
      if (typeChoice !== '' && chosen === undefined) {
        setMessage('Choose a listed work item type or Every type.');
        return;
      }
      void write(() =>
        client.bindCatalogueStep({
          body: {
            // Proof: forcing organization scope failed actual project/space creation; forcing null type failed all three owner cases in scoped-step-settings.test.tsx.
            scopeKind: target.scopeKind,
            scopeId: target.scopeId,
            workItemTypeId: chosen === undefined ? null : chosen.id,
            position: 10,
            define: { ...fields, code, position: 10 },
          },
        }),
      );
    }
  }

  if (fault !== null) throw fault;
  return (
    <>
      {/* Proof: removing this restriction exposed global edits at the project owner; scoped-step-settings.test.tsx failed. */}
      {mode.kind === 'catalogue' &&
        (catalogue.definitions.length === 0 ? (
          <p className="text-muted-foreground text-sm">No step definitions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table
              aria-label="Step definitions"
              className="w-full border-collapse text-left text-sm"
            >
              <thead>
                <tr className="border-border border-b">
                  {['Name', 'Code', 'Default estimate unit', 'Default allowance', 'Actions'].map(
                    (label) => (
                      <th key={label} scope="col" className="px-2 py-2 font-medium">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {catalogue.definitions.map((definition) => (
                  <tr key={definition.id} className="border-border border-b">
                    <th scope="row" className="px-2 py-2 font-medium">
                      {definition.name}
                    </th>
                    <td className="px-2 py-2">
                      <code>{definition.code}</code>
                    </td>
                    <td className="px-2 py-2">{formatUnit(definition.defaultEstimateUnit)}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {(definition.defaultAllowanceBps / 100).toFixed(2)}%
                    </td>
                    <td className="px-2 py-2">
                      <div className={ROW_ACTIONS_CLASS}>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={sending || organization.kind !== 'active'}
                          aria-label={`Edit ${definition.name}`}
                          onClick={() => {
                            selectDraft({ kind: 'edit', definition });
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={sending || organization.kind !== 'active'}
                          aria-label={`Retire ${definition.name}`}
                          onClick={() => {
                            selectDraft({ kind: 'retire', definition });
                          }}
                        >
                          Retire
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      {mode.kind === 'scope' && (
        <p className="text-muted-foreground text-sm">
          Global names, defaults and retirement are managed in{' '}
          <a href="/organization" className="text-primary underline">
            Organization → Steps
          </a>
          .
        </p>
      )}
      {organization.kind === 'active' ? (
        draft.kind === 'new' && types.view.kind !== 'ready' ? (
          types.view.kind === 'loading' ? (
            <p>Loading work item types…</p>
          ) : (
            <>
              <p role="alert" className={ALERT_CLASS}>
                {types.view.message}
              </p>
              <Button type="button" variant="outline" onClick={types.retry}>
                Retry definition types
              </Button>
            </>
          )
        ) : (
          <form
            aria-label={
              draft.kind === 'new'
                ? 'New step definition'
                : draft.kind === 'edit'
                  ? 'Edit step definition'
                  : 'Retire step definition'
            }
            className={`${FORM_CLASS} flex-wrap`}
            onSubmit={(event) => {
              submit(
                mode.kind === 'scope'
                  ? mode.scope
                  : {
                      scopeKind: 'organization',
                      scopeId: organization.organizationId,
                      name: 'Organization',
                    },
                event,
              );
            }}
            noValidate
          >
            {draft.kind === 'retire' ? (
              <>
                <p>Retire {draft.definition.name}?</p>
                <p>
                  Retirement keeps historical values and reserves this name and code. Remove its
                  bindings first.
                </p>
                <Button type="submit" disabled={sending}>
                  Confirm retirement
                </Button>
              </>
            ) : (
              <>
                <label htmlFor={`${formId}-name`} className={FIELD_CLASS}>
                  <span className={FIELD_LABEL_CLASS}>Step name</span>
                  <Input
                    id={`${formId}-name`}
                    value={name}
                    disabled={sending}
                    onChange={(event) => {
                      setName(event.target.value);
                    }}
                  />
                </label>
                {draft.kind === 'new' ? (
                  <label htmlFor={`${formId}-code`} className={FIELD_CLASS}>
                    <span className={FIELD_LABEL_CLASS}>Step code</span>
                    <Input
                      id={`${formId}-code`}
                      value={code}
                      disabled={sending}
                      onChange={(event) => {
                        setCode(event.target.value);
                      }}
                    />
                  </label>
                ) : (
                  <p>
                    Immutable code: <code>{draft.definition.code}</code>
                  </p>
                )}
                <label htmlFor={`${formId}-unit`} className={FIELD_CLASS}>
                  <span className={FIELD_LABEL_CLASS}>Default estimate unit</span>
                  <select
                    id={`${formId}-unit`}
                    className={SELECT_CLASS}
                    value={unit}
                    disabled={sending}
                    onChange={(event) => {
                      setUnit(event.target.value);
                    }}
                  >
                    <option value="workdays">Workdays</option>
                    <option value="minutes">Minutes</option>
                  </select>
                </label>
                <label htmlFor={`${formId}-allowance`} className={FIELD_CLASS}>
                  <span className={FIELD_LABEL_CLASS}>Default allowance (%)</span>
                  <Input
                    id={`${formId}-allowance`}
                    inputMode="decimal"
                    value={allowance}
                    disabled={sending}
                    onChange={(event) => {
                      setAllowance(event.target.value);
                    }}
                  />
                </label>
                {draft.kind === 'new' && types.view.kind === 'ready' && (
                  <label htmlFor={`${formId}-type`} className={FIELD_CLASS}>
                    <span className={FIELD_LABEL_CLASS}>Work item type</span>
                    <select
                      id={`${formId}-type`}
                      className={SELECT_CLASS}
                      value={typeChoice}
                      disabled={sending}
                      onChange={(event) => {
                        setTypeChoice(event.target.value);
                      }}
                    >
                      <option value="">Every type</option>
                      {types.view.types.map((type) => (
                        <option key={type.id} value={`type:${type.id}`}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {draft.kind === 'new' && (
                  <p className="text-muted-foreground text-sm">
                    Creates an organization definition and binds it here for the selected type.
                    Every type includes untyped leaves.
                  </p>
                )}
                <Button type="submit" disabled={sending}>
                  {draft.kind === 'new' ? 'Create and bind step' : 'Save step definition'}
                </Button>
              </>
            )}
            {draft.kind !== 'new' && (
              <Button
                type="button"
                variant="outline"
                disabled={sending}
                onClick={() => {
                  selectDraft({ kind: 'new' });
                }}
              >
                Cancel
              </Button>
            )}
            {message !== '' && (
              <p id={formId} role="alert" className={ALERT_CLASS}>
                {message}
              </p>
            )}
          </form>
        )
      ) : (
        <p>Choose an organization to manage steps.</p>
      )}
    </>
  );
}

function formatUnit(unit: Definition['defaultEstimateUnit']): string {
  switch (unit) {
    case 'minutes':
      return 'Minutes';
    case 'workdays':
      return 'Workdays';
    default:
      return unreachable(unit);
  }
}
