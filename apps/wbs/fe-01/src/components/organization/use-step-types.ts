import { type ClientReply, listWorkItemTypes } from '@wbs/contracts';
import { useEffect, useState } from 'react';

import { failureMessage, unreachable } from '@/lib/http';
import { useResourceClient } from '@/runtime/organization-resources';

import type { AccessLoss } from './organization-access';
import { resolveStepWriteRefusal } from './step-catalogue-access';

const SHAPES = [listWorkItemTypes] as const;
export type StepTypes = Extract<
  ClientReply<typeof listWorkItemTypes>,
  { kind: 'success' }
>['body']['workItemTypes'];
export type StepTypesView =
  { kind: 'loading' } | { kind: 'failure'; message: string } | { kind: 'ready'; types: StepTypes };

/** Actual directory choices for one editor lifetime; failure never becomes an every-type-only list. */
export function useStepTypes(onAccessLost: (loss: AccessLoss) => void): {
  view: StepTypesView;
  retry: () => void;
} {
  const client = useResourceClient(SHAPES);
  const [view, setView] = useState<StepTypesView>({ kind: 'loading' });
  const [version, setVersion] = useState(0);
  const [fault, setFault] = useState<Error | null>(null);
  useEffect(() => {
    let isCurrent = true;
    setView({ kind: 'loading' });
    async function readTypes() {
      const reply = await client['getApiWork-item-types']({});
      // Proof: omitting this fence let a retired creation-directory refusal withdraw refreshed settings in scoped-step-settings.test.tsx.
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
      if (isCurrent) setFault(new Error('Unexpected step type directory failure', { cause }));
    });
    return () => {
      isCurrent = false;
    };
  }, [client, version, onAccessLost]);
  if (fault !== null) throw fault;
  return {
    view,
    retry: () => {
      setVersion((current) => current + 1);
    },
  };
}
