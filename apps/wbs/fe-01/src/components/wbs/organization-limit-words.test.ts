import { describe, expect, it } from 'vitest';

import { type WbsProblem, WbsRequestError } from '@/lib/wbs-api';

import { refusalSentence } from './plan-refusal';

/** A refused batch as the shared client throws it, at the first command. */
const refusedBatch = (
  operation: 'postApiProjectsByIdCommands' | 'postApiDirectoryCommands',
  refusal: Record<string, unknown>,
): WbsRequestError =>
  // The refusal bodies below are the contract's own arms; the cast only spares
  // the test the operation-indexed union's spelling.
  new WbsRequestError({ kind: 'refusal', operation, refusal } as unknown as WbsProblem);

/** Every number a sentence names, in order. */
const numbersIn = (sentence: string): number[] =>
  [...sentence.matchAll(/\d+/g)].map((match) => Number(match[0]));

describe('organization limit refusal words', () => {
  it.each(['postApiProjectsByIdCommands', 'postApiDirectoryCommands'] as const)(
    'names the agent-person cap with the body’s numbers from %s',
    (operation) => {
      const sentence = refusalSentence(
        refusedBatch(operation, {
          error: 'agent_person_limit',
          at: 0,
          kind: 'patchPerson',
          cap: 8,
          current: 8,
          added: 1,
        }),
      );
      expect(sentence).toBe(
        'Organization limit: 8 of 8 agent persons; adding 1 would exceed the cap. Nothing was changed.',
      );
    },
  );

  it('names the claim cap with the body’s numbers and no other', () => {
    const sentence = refusalSentence(
      refusedBatch('postApiProjectsByIdCommands', {
        error: 'claim_limit',
        at: 2,
        kind: 'claimWorkItem',
        cap: 10,
        current: 40,
      }),
    );
    expect(sentence).toBe(
      'Organization limit: 40 of 10 concurrent claims. Release a claim first. Nothing was changed.',
    );
    // `at: 2` is the command's position, not a number the reader is told.
    expect(numbersIn(sentence)).toEqual([40, 10]);
  });

  it('names the capacity cap with the resource, the total and its parts', () => {
    const sentence = refusalSentence(
      refusedBatch('postApiProjectsByIdCommands', {
        error: 'capacity_limit',
        at: 0,
        kind: 'setResourceCapacity',
        resourceId: 'res-ram',
        cap: 64,
        declared: 48,
        asked: 24,
      }),
    );
    expect(sentence).toBe(
      'Organization limit: resource res-ram would declare 72 of 64 units across your projects (48 stated by your other projects, 24 asked here). Nothing was changed.',
    );
    expect(numbersIn(sentence)).toEqual([72, 64, 48, 24]);
  });

  it('carries different numbers through rather than any fixed copy', () => {
    const sentence = refusalSentence(
      refusedBatch('postApiProjectsByIdCommands', {
        error: 'agent_person_limit',
        at: 0,
        kind: 'patchPerson',
        cap: 0,
        current: 0,
        added: 3,
      }),
    );
    expect(numbersIn(sentence)).toEqual([0, 0, 3]);
  });

  it('leaves every other refusal to the plan’s table', () => {
    expect(
      refusalSentence(
        refusedBatch('postApiProjectsByIdCommands', {
          error: 'forbidden',
          at: 0,
          kind: 'patchPerson',
        }),
      ),
    ).toBe('That change could not be completed: this plan is not yours to change.');
  });
});
