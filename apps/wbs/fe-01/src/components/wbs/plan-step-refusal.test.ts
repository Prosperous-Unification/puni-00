import { describe, expect, it } from 'vitest';

import { WbsRequestError } from '@/lib/wbs-api';

import { batchRefusalSentence, failureText, refusalSentence } from './plan-refusal';

const reasons = [
  ['step_not_resolved', 'That step does not apply to this row. Nothing was changed.'],
  ['type_conflict', 'This row has conflicting types. Choose one type before changing its step values.'],
] as const;

describe('step catalogue batch refusal words', () => {
  for (const operation of ['postApiWorkPackagesByIdCommands', 'postApiDirectoryCommands'] as const) {
    it.each(reasons)(operation + ' explains %s through the typed error and batch reply', (error, sentence) => {
      const refusal = { error, at: 0, kind: 'setEstimate' as const };
      const thrown = new WbsRequestError({ kind: 'refusal', operation, refusal });
      expect(refusalSentence(thrown)).toBe(sentence);
      expect(batchRefusalSentence(refusal)).toBe(sentence);
      expect(failureText(thrown, 'missing refusal')).toBe(error);
    });
  }
});
