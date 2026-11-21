import { describe, expect, it } from 'vitest';

import { WbsRequestError } from '@/lib/wbs-api';

import { batchRefusalSentence, failureText, refusalSentence } from './plan-refusal';

describe('first-child protected step refusal', () => {
  for (const operation of [
    'postApiWorkPackagesByIdCommands',
    'postApiDirectoryCommands',
  ] as const) {
    it(operation + ' names the affected current row and step before any change', () => {
      const healthy = { error: 'step_not_resolved' as const, at: 0, kind: 'setEstimate' as const };
      expect(batchRefusalSentence(healthy)).toBe(
        'That step does not apply to this row. Nothing was changed.',
      );
      const refusal = {
        error: 'step_nodes_in_use' as const,
        at: 0,
        kind: 'createWorkItem' as const,
        count: 1,
        pairs: [
          {
            id: 'parent',
            name: 'Typed parent',
            workPackageId: 'package',
            stepId: 'typed-step',
            facts: ['estimate', 'actual'] satisfies ('estimate' | 'actual')[],
          },
        ],
      };
      const thrown = new WbsRequestError({ kind: 'refusal', operation, refusal });
      const sentence =
        'This change would detach 1 protected step: Typed parent / typed-step (estimate, actual). Nothing was changed.';
      expect(refusalSentence(thrown)).toBe(sentence);
      expect(batchRefusalSentence(refusal)).toBe(sentence);
      expect(failureText(thrown, 'missing refusal')).toBe('step_nodes_in_use');
    });
  }
});
