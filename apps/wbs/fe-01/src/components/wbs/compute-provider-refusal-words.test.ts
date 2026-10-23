import { describe, expect, it } from 'vitest';

import { type WbsProblem, WbsRequestError } from '@/lib/wbs-api';

import { type BatchRefusal, batchRefusalSentence, refusalSentence } from './plan-refusal';

/** A refused batch as the shared client throws it, at the first command. */
const refusedBatch = (refusal: Record<string, unknown>): WbsRequestError =>
  // The refusal bodies below are the contract's own arms; the cast only spares
  // the test the operation-indexed union's spelling.
  new WbsRequestError({
    kind: 'refusal',
    operation: 'postApiDirectoryCommands',
    refusal,
  } as unknown as WbsProblem);

describe('compute provider reference refusal words', () => {
  it.each([
    [
      'unknown_provider',
      'That compute provider is no longer registered — someone may have removed it. Nothing was changed.',
    ],
    [
      'provider_not_in_organization',
      'That compute provider belongs to another organization, so this resource cannot name it. Nothing was changed.',
    ],
  ])('words both provider reference refusals: %s', (error, sentence) => {
    const body = { error, at: 0, kind: 'patchResource' };
    expect(refusalSentence(refusedBatch(body))).toBe(sentence);
    // The contract's own arm; the cast only spares the operation-indexed union.
    expect(batchRefusalSentence(body as unknown as BatchRefusal)).toBe(sentence);
    expect(sentence).not.toContain(error);
  });

  it('names the resource of a capacity cap refused through the reply body', () => {
    const body = {
      error: 'capacity_limit',
      at: 0,
      kind: 'setResourceCapacity',
      resourceId: 'r1',
      cap: 64,
      declared: 48,
      asked: 32,
    };
    expect(batchRefusalSentence(body as unknown as BatchRefusal, 'h2puni ram')).toBe(
      'Organization limit: h2puni ram would declare 80 of 64 units across your projects (48 stated by your other projects, 32 asked here). Nothing was changed.',
    );
  });
});
