import { Button, CONTROL_HEIGHT, SELECT_CLASS } from '@ui/saas-01';
import { type ClientReply, readProjectSteps } from '@wbs/contracts';
import { useEffect, useId, useState } from 'react';

import { type AccessLoss } from '@/components/organization/organization-access';
import { resolveStepWriteRefusal } from '@/components/organization/step-catalogue-access';
import { type StepTypes, useStepTypes } from '@/components/organization/use-step-types';
import { failureMessage, unreachable } from '@/lib/http';
import { useResourceClient } from '@/runtime/organization-resources';

const SHAPES = [readProjectSteps] as const;
type Steps = Extract<ClientReply<typeof readProjectSteps>, { kind: 'success' }>['body']['steps'];
type View =
  { kind: 'loading' } | { kind: 'failure'; message: string } | { kind: 'ready'; steps: Steps };

/** Current typed/untyped project resolution retains every provenance binding; inherited entries have no mutation affordance. */
export function ProjectResolvedSteps({
  projectId,
  version,
  onAccessLost,
  onUnavailable,
}: {
  projectId: string;
  version: number;
  onAccessLost: (loss: AccessLoss) => void;
  onUnavailable: (message: string) => void;
}): React.JSX.Element {
  const client = useResourceClient(SHAPES),
    types = useStepTypes(onAccessLost),
    identity = useId();
  const directory = types.view;
  const [choice, setChoice] = useState(''),
    [retry, setRetry] = useState(0),
    [view, setView] = useState<View>({ kind: 'loading' }),
    [fault, setFault] = useState<Error | null>(null);
  useEffect(() => {
    let isCurrent = true;
    async function readResolution() {
      if (directory.kind !== 'ready') return;
      const selected = directory.types.find((type) => `type:${type.id}` === choice);
      // Proof: omitting this branch requested the untyped default for an injected unlisted type; scoped-step-settings.test.tsx failed.
      if (choice !== '' && selected === undefined) {
        setView({
          kind: 'failure',
          message: 'The selected type is no longer listed. Choose a current type.',
        });
        return;
      }
      setView({ kind: 'loading' });
      const reply = await client.readProjectSteps({
        params: { id: projectId },
        // Proof: dropping the type query failed the typed/untyped provenance case in scoped-step-settings.test.tsx.
        query: selected === undefined ? {} : { type: selected.id },
      });
      // Proof: omitting this fence let held untyped results replace the newer typed selection in scoped-step-settings.test.tsx.
      if (!isCurrent) return;
      switch (reply.kind) {
        case 'success':
          setView({ kind: 'ready', steps: reply.body.steps });
          return;
        case 'failure':
          if (reply.failure.code !== 'cancelled')
            setView({ kind: 'failure', message: failureMessage(reply.failure) });
          return;
        case 'refusal': {
          if (reply.body.error === 'forbidden' || reply.body.error === 'not_found') {
            // Proof: keeping refusal local retained the project editor; its withdrawal case failed in scoped-step-settings.test.tsx.
            onUnavailable(
              'This project or its selected type is no longer available. Refresh the project.',
            );
            return;
          }
          const outcome = resolveStepWriteRefusal(reply.body);
          if (outcome.kind === 'lost') onAccessLost(outcome.loss);
          else setView({ kind: 'failure', message: outcome.text });
          return;
        }
        default:
          return unreachable(reply);
      }
    }
    void readResolution().catch((cause: unknown) => {
      if (isCurrent)
        setFault(new Error('Unexpected resolved project step read failure', { cause }));
    });
    return () => {
      isCurrent = false;
    };
  }, [client, projectId, version, choice, retry, directory, onAccessLost, onUnavailable]);
  if (fault !== null) throw fault;
  return (
    <section aria-labelledby={`${identity}-heading`} className="flex flex-col gap-3">
      <h2 id={`${identity}-heading`} className="m-0 text-lg font-medium">
        Resolved project steps
      </h2>
      <p className="text-muted-foreground text-sm">
        Bindings add across organization, space and project. Change an inherited binding at its
        owning scope.
      </p>
      {directory.kind === 'loading' ? (
        <p>Loading work item types…</p>
      ) : directory.kind === 'failure' ? (
        <>
          <p role="alert" className="text-destructive text-sm">
            {directory.message}
          </p>
          <Button type="button" variant="outline" onClick={types.retry}>
            Retry resolution types
          </Button>
        </>
      ) : (
        <>
          <label htmlFor={`${identity}-type`} className="flex flex-col gap-1 text-sm">
            Resolve steps for
            <select
              id={`${identity}-type`}
              value={choice}
              className={SELECT_CLASS}
              onChange={(event) => {
                setChoice(event.target.value);
              }}
            >
              <option value="">Untyped default</option>
              {directory.types.map((type) => (
                <option key={type.id} value={`type:${type.id}`}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          {view.kind === 'loading' ? (
            <p>Loading resolved steps…</p>
          ) : view.kind === 'failure' ? (
            <p role="alert" className="text-destructive text-sm">
              {view.message}
            </p>
          ) : view.steps.length === 0 ? (
            <p>No steps resolve for this selection.</p>
          ) : (
            <table
              aria-label="Resolved project steps"
              className="w-full border-collapse text-left text-sm"
            >
              <thead>
                <tr>
                  <th scope="col">Step</th>
                  <th scope="col">Code</th>
                  <th scope="col">Provenance</th>
                </tr>
              </thead>
              <tbody>
                {view.steps.map((step) => (
                  <tr key={step.stepId} className="border-border border-b">
                    <th scope="row" className="px-2 py-2">
                      {step.name}
                    </th>
                    <td className="px-2 py-2">
                      <code>{step.code}</code>
                    </td>
                    <td className="px-2 py-2">
                      <ul className="m-0 list-none p-0">
                        {/* Proof: retaining only the first provenance entry failed the inherited-provenance case in scoped-step-settings.test.tsx. */}
                        {step.via.map((binding) => (
                          <li key={binding.bindingId}>
                            {formatScope(binding.scopeKind)} ·{' '}
                            {formatType(binding.workItemTypeId, directory.types)}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Button
            type="button"
            variant="outline"
            className={`self-start ${CONTROL_HEIGHT}`}
            onClick={() => {
              setRetry((current) => current + 1);
            }}
          >
            Refresh resolved steps
          </Button>
        </>
      )}
    </section>
  );
}

function formatScope(kind: Steps[number]['via'][number]['scopeKind']): string {
  switch (kind) {
    case 'organization':
      return 'Organization';
    case 'space':
      return 'Space';
    case 'project':
      return 'Project';
    default:
      return unreachable(kind);
  }
}
/** A separately read directory can be newer than the captured resolution; absence remains visibly stale. */
function formatType(typeId: string | null, types: StepTypes): string {
  if (typeId === null) return 'Every type';
  const type = types.find((candidate) => candidate.id === typeId);
  return type === undefined ? `Type no longer listed: ${typeId}` : type.name;
}
