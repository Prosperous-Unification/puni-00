import { useEffect, useState } from 'react';

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
 * Reads the measure definitions once per opened project (`wbs-measure-budgets`
 * D7, D17).
 *
 * Once, and not on every plan read: definitions are directory data that
 * changes by directory command, and the plan read neither carries nor
 * invalidates them. A definition created while the plan is open shows the next
 * time it is opened (design D55). An answer arriving after the project changed
 * is dropped, never shown against the wrong plan.
 */
export function useMeasureDefinitions(
  commands: Pick<PlanCommands, 'listMeasures'>,
  projectId: string,
): MeasureDefinitionsState {
  const [state, setState] = useState<{ projectId: string; reading: MeasureDefinitionsState }>({
    projectId,
    reading: { kind: 'loading' },
  });
  useEffect(() => {
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
  }, [commands, projectId]);
  // Proof: answering `state.reading` without this project check, `shows no
  // project’s definitions against another, nor a late answer`
  // (measure-panel.test.tsx) read p1's `ready` on the render after the switch.
  return state.projectId === projectId ? state.reading : { kind: 'loading' };
}
