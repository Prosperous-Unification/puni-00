import { useEffect, useState } from 'react';

import { useFeatureReachable } from '@/lib/session-features';
import type { MeasureDefinitionView } from '@/lib/wbs-api';
import type { PlanCommands } from '@/modules/plan-commands/contract';

import { refusalSentence } from './plan-refusal';

/**
 * Where the organization's measure definitions stand for this table.
 *
 * Every arm is a rendered state (AGENTS.md, React states): `loading` before
 * the read answers, `organization_required` before activation (review S3-6,
 * a modeled 409 and not a fault), `failed` with the sentence any other refusal
 * reads as. Measure columns and the panel exist only in `ready`.
 */
export type MeasureDefinitionsState =
  | { kind: 'loading' }
  | { kind: 'ready'; measures: readonly MeasureDefinitionView[] }
  | { kind: 'organization_required' }
  | { kind: 'failed'; sentence: string };

/**
 * The answer of a deployment reported before activation, one object for every
 * render: the table memoizes its columns on the state's identity, and a fresh
 * object each render rebuilt them under an open dependency search.
 *
 * Proof: answering a new literal instead, layout.spec.ts's `drives the actions
 * menu from the keyboard` timed out seeding at `Stop 020 waiting for 010`
 * (Enter on the candidate added nothing); watched 2026-10-23.
 */
const BEFORE_ACTIVATION: MeasureDefinitionsState = { kind: 'organization_required' };

/**
 * Reads the measure definitions once per opened project (`wbs-measure-budgets`
 * D7, D17).
 *
 * Once, and not on every plan read: definitions are directory data that
 * changes by directory command, and the plan read neither carries nor
 * invalidates them. A definition created while the plan is open shows the next
 * time it is opened (design D55). An answer arriving after the project changed
 * is dropped, never shown against the wrong plan.
 *
 * A deployment the session read reported before organization activation
 * (`onboarding: false`) answers `organization_required` without asking, as the
 * spaces page does: before activation every caller has legacy access and no
 * organization is marked legacy (activation creates it in the same
 * transaction that flips the marker), so the read could only be refused, and a
 * refused read is a console error on every opened plan (`quiet-load.spec.ts`'s
 * rule). Gated on `onboarding` and not `organizations`: an activated
 * deployment without a selection composition still owns definitions.
 */
export function useMeasureDefinitions(
  commands: Pick<PlanCommands, 'listMeasures'>,
  projectId: string,
): MeasureDefinitionsState {
  const reachable = useFeatureReachable('onboarding');
  const [state, setState] = useState<{ projectId: string; reading: MeasureDefinitionsState }>({
    projectId,
    reading: { kind: 'loading' },
  });
  useEffect(() => {
    // Proof: with this return removed, `asks nothing of a deployment reported
    // before activation` (measure-panel.test.tsx) saw `listMeasures` called.
    if (!reachable) return;
    let current = true;
    // Called inside a promise, so a read that throws before it returns a
    // promise is the same rendered `failed` state as one that rejects.
    Promise.resolve()
      .then(() => commands.listMeasures())
      .then(
        (directory) => {
          // Proof: with this return removed, `drops the answer of commands it no
          // longer reads through` (measure-panel.test.tsx) read the old `ready`.
          if (!current) return;
          setState({
            projectId,
            reading:
              directory.kind === 'ready'
                ? { kind: 'ready', measures: directory.measures }
                : { kind: 'organization_required' },
          });
        },
        (thrown: unknown) => {
          // A refusal other than the modeled 409 is shown as what it is; the
          // table keeps working without measure columns.
          if (current)
            setState({ projectId, reading: { kind: 'failed', sentence: refusalSentence(thrown) } });
        },
      );
    return () => {
      current = false;
    };
  }, [commands, projectId, reachable]);
  // Proof: with this line removed, the same test read `{ kind: 'loading' }`.
  if (!reachable) return BEFORE_ACTIVATION;
  // Proof: answering `state.reading` without this project check, `shows no
  // project’s definitions against another, nor a late answer`
  // (measure-panel.test.tsx) read p1's `ready` on the render after the switch.
  return state.projectId === projectId ? state.reading : { kind: 'loading' };
}
