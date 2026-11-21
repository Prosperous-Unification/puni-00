import { Button } from '@ui/saas-01';
import { type ClientReply, listStepCatalogue } from '@wbs/contracts';
import { useEffect, useState } from 'react';

import { failureMessage, unreachable } from '@/lib/http';
import { useResourceClient } from '@/runtime/organization-resources';

import {
  type AccessLoss,
  lostAccess,
  type RefusalOutcome,
  RELOAD,
  said,
} from './organization-access';
import { ALERT_CLASS, OrganizationSection, STATUS_CLASS } from './organization-section';
import { StepBindings, type StepBindingScope } from './step-bindings';
import { StepDefinitions } from './step-definitions';

const STEP_SHAPES = [listStepCatalogue] as const;
type Catalogue = Extract<ClientReply<typeof listStepCatalogue>, { kind: 'success' }>['body'];
type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'ready'; catalogue: Catalogue };

interface Props {
  scope: StepBindingScope;
  onChanged: () => void;
  onAccessLost: (loss: AccessLoss) => void;
}

/**
 * Scoped catalogue creation and bindings through the owning organization resource context.
 * Defaults describe future package materialization; they are not existing package values.
 * Refresh replaces the visible list and supersedes an earlier pending read. Access loss goes
 * to the page so all organization panels unmount; unexpected failures reach its Error Boundary.
 */
export function ScopedSteps(props: Props): React.JSX.Element {
  // Proof: removing this key retained both old definition drafts on supplied owner changes in scoped-step-settings.test.tsx.
  return <ScopedStepsEditor key={`${props.scope.scopeKind}:${props.scope.scopeId}`} {...props} />;
}

function ScopedStepsEditor({ scope, onChanged, onAccessLost }: Props): React.JSX.Element {
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
      // newer-refresh owner (verification-settings-read-20261119.json). The relocated
      // guard also failed its fresh omission in verification-scoped-step-settings-20261120.json.
      if (!isCurrent) return;
      switch (reply.kind) {
        case 'success':
          setView({ kind: 'ready', catalogue: reply.body });
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
    return () => {
      isCurrent = false;
    };
  }, [steps, readVersion, onAccessLost]);

  if (fault !== null) throw fault;

  function renderCatalogue(): React.JSX.Element {
    switch (view.kind) {
      case 'loading':
        return <p className={STATUS_CLASS}>Loading steps…</p>;
      case 'failure':
        return (
          <p role="alert" className={ALERT_CLASS}>
            {view.message}
          </p>
        );
      case 'ready':
        return (
          <>
            <StepDefinitions
              catalogue={view.catalogue}
              mode={
                scope.scopeKind === 'organization'
                  ? { kind: 'catalogue' }
                  : { kind: 'scope', scope }
              }
              onChanged={() => {
                setReadVersion((current) => current + 1);
                // Proof: omitting notification skipped the project resolution reread after typed creation; scoped-step-settings.test.tsx failed.
                onChanged();
              }}
              onAccessLost={onAccessLost}
            />
            <StepBindings
              catalogue={view.catalogue}
              scope={scope}
              onChanged={() => {
                setReadVersion((version) => version + 1);
                onChanged();
              }}
              onAccessLost={onAccessLost}
            />
          </>
        );
      default:
        return unreachable(view);
    }
  }

  return (
    <OrganizationSection id="steps-heading" title="Steps">
      <p className="text-muted-foreground text-sm">
        Defaults apply to new package values. Existing package values stay unchanged.
      </p>
      {renderCatalogue()}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => {
          setReadVersion((current) => current + 1);
          onChanged();
        }}
      >
        {view.kind === 'failure' ? 'Retry steps' : 'Refresh steps'}
      </Button>
    </OrganizationSection>
  );
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
