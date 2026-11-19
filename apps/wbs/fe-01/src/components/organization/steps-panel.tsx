import { Button } from '@ui/saas-01';
import { type ClientReply, listStepCatalogue } from '@wbs/contracts';
import { useEffect, useState } from 'react';

import { failureMessage, unreachable } from '@/lib/http';
import { useResourceClient } from '@/runtime/organization-resources';

import { type AccessLoss, lostAccess, type RefusalOutcome, RELOAD, said } from './organization-access';
import { ALERT_CLASS, OrganizationSection, STATUS_CLASS } from './organization-section';

const STEP_SHAPES = [listStepCatalogue] as const;
type Catalogue = Extract<ClientReply<typeof listStepCatalogue>, { kind: 'success' }>['body'];
type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'ready'; definitions: Catalogue['definitions'] };

/**
 * Active organization definitions and their defaults, read through the owning resource scope.
 * Defaults describe future package materialization; they are not existing package values.
 * Refresh replaces the visible list and supersedes an earlier pending read. Access loss goes
 * to the page so all organization panels unmount; unexpected failures reach its Error Boundary.
 */
export function StepsPanel({ onAccessLost }: { onAccessLost: (loss: AccessLoss) => void }): React.JSX.Element {
  const steps = useResourceClient(STEP_SHAPES);
  const [readVersion, setReadVersion] = useState(0);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [fault, setFault] = useState<Error | null>(null);

  useEffect(() => {
    let isCurrent = true;
    setView({ kind: 'loading' });
    async function readCatalogue() {
      const reply = await steps.listStepCatalogue({});
      // Proof: removing this return let an older real GET replace Newer response in
      // organization-step-catalogue.test.tsx; exact restoration passed the same
      // newer-refresh owner (verification-settings-read-20261119.json).
      if (!isCurrent) return;
      switch (reply.kind) {
        case 'success':
          setView({ kind: 'ready', definitions: reply.body.definitions });
          return;
        case 'failure':
          if (reply.failure.code !== 'cancelled')
            setView({ kind: 'failure', message: failureMessage(reply.failure) });
          return;
        case 'refusal': {
          const outcome = resolveStepRefusal(reply.body);
          if (outcome.kind === 'lost') onAccessLost(outcome.loss);
          else setView({ kind: 'failure', message: outcome.text });
          return;
        }
        default:
          return unreachable(reply);
      }
    }
    void readCatalogue().catch((cause: unknown) => {
      if (isCurrent) setFault(new Error('Unexpected step catalogue read failure', { cause }));
    });
    return () => { isCurrent = false; };
  }, [steps, readVersion, onAccessLost]);

  if (fault !== null) throw fault;

  function renderCatalogue(): React.JSX.Element {
    switch (view.kind) {
      case 'loading':
        return <p className={STATUS_CLASS}>Loading steps…</p>;
      case 'failure':
        return <p role="alert" className={ALERT_CLASS}>{view.message}</p>;
      case 'ready':
        return view.definitions.length === 0 ? (
          <p className="text-muted-foreground text-sm">No step definitions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="Step definitions" className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th scope="col" className="px-2 py-2 font-medium">Name</th>
                  <th scope="col" className="px-2 py-2 font-medium">Code</th>
                  <th scope="col" className="px-2 py-2 font-medium">Default estimate unit</th>
                  <th scope="col" className="px-2 py-2 font-medium">Default allowance</th>
                </tr>
              </thead>
              <tbody>
                {view.definitions.map((definition) => (
                  <tr key={definition.id} className="border-border border-b">
                    <th scope="row" className="px-2 py-2 font-medium">{definition.name}</th>
                    <td className="px-2 py-2"><code>{definition.code}</code></td>
                    <td className="px-2 py-2">{formatUnit(definition.defaultEstimateUnit)}</td>
                    <td className="px-2 py-2 tabular-nums">{(definition.defaultAllowanceBps / 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      default:
        return unreachable(view);
    }
  }

  return (
    <OrganizationSection id="steps-heading" title="Steps">
      <p className="text-muted-foreground text-sm">Defaults apply to new package values. Existing package values stay unchanged.</p>
      {renderCatalogue()}
      <Button type="button" variant="outline" className="self-start" onClick={() => setReadVersion((current) => current + 1)}>
        {view.kind === 'failure' ? 'Retry steps' : 'Refresh steps'}
      </Button>
    </OrganizationSection>
  );
}

function formatUnit(unit: Catalogue['definitions'][number]['defaultEstimateUnit']): string {
  switch (unit) {
    case 'minutes': return 'Minutes';
    case 'workdays': return 'Workdays';
    default: return unreachable(unit);
  }
}

type StepRefusal = Extract<ClientReply<typeof listStepCatalogue>, { kind: 'refusal' }>['body'];

/** Every modeled read refusal either withdraws the whole organization page or renders a retryable message. */
function resolveStepRefusal(refusal: StepRefusal): RefusalOutcome {
  switch (refusal.error) {
    case 'unauthenticated':
    case 'organization_context_changed':
    case 'no_active_organization':
    case 'not_a_member':
      return lostAccess(refusal.error);
    case 'sso_required':
    case 'reauthentication_required':
      return lostAccess(refusal);
    case 'forbidden':
      return said('Your role cannot view this organization’s steps.');
    case 'not_found':
      return said('The organization’s step catalogue is no longer available.');
    case 'invalid_query':
    case 'invalid_params':
      return said(RELOAD);
    default:
      return unreachable(refusal);
  }
}
