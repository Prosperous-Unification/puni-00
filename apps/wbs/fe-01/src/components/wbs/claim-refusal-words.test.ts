import { describe, expect, it } from 'vitest';

import { type WbsProblem, WbsRequestError } from '@/lib/wbs-api';

import { refusalSentence } from './plan-refusal';

/** A refused `claimWorkItem` batch as the shared client throws it. */
const refusedClaim = (refusal: Record<string, unknown>): WbsRequestError =>
  // The bodies below are the contract's own arms; the cast only spares the
  // test the operation-indexed union's spelling.
  new WbsRequestError({
    kind: 'refusal',
    operation: 'postApiProjectsByIdCommands',
    refusal: { at: 0, kind: 'claimWorkItem', ...refusal },
  } as unknown as WbsProblem);

const holder = (name: string, runId: string | null) => ({
  claimId: `c-${name}`,
  personId: `person-${name}`,
  name,
  runId,
});

describe('a claim refused from the row menu (wbs-claim-display 11.3)', () => {
  it('names the holders of an already claimed row', () => {
    // Proof: `claimRefusalSentence` returning null failed this and the two
    // cases below on the bare sentence: `expected 'Somebody else already holds
    // a claim o…' to be 'Already claimed by claude-code (run r…'`; watched
    // 2026-10-27.
    expect(
      refusalSentence(
        refusedClaim({
          error: 'already_claimed',
          holders: [
            holder('claude-code', 'r-1'),
            holder('claude-code', 'r-1'),
            holder('dana', null),
          ],
        }),
      ),
    ).toBe('Already claimed by claude-code (run r-1) and dana. Nothing was changed.');
  });

  it('names the short resource, its numbers and who holds it', () => {
    const gpu = {
      resourceId: 'res-gpu',
      asked: 1,
      free: 0,
      holders: [
        { personId: 'person-w', name: 'claude-code-worker', runId: 'r-2', workItemId: 'w9' },
      ],
    };
    expect(
      refusalSentence(refusedClaim({ error: 'resources_exhausted', ...gpu, resources: [gpu] })),
    ).toBe(
      'Not enough free: resource res-gpu needs 1, 0 free, held by claude-code-worker (run r-2). Nothing was changed.',
    );
  });

  it('names the holder of the subtree claim around or under the row', () => {
    expect(
      refusalSentence(
        refusedClaim({ error: 'inside_subtree_claim', holder: holder('claire', 'agent:main') }),
      ),
    ).toBe(
      'This row is inside claire (run agent:main)’s claim on a row above it. Nothing was changed.',
    );
    expect(
      refusalSentence(
        refusedClaim({ error: 'overlaps_subtree_claim', holder: holder('dana', null) }),
      ),
    ).toBe('dana holds a claim on a row under this one. Nothing was changed.');
  });

  it('words every claim refusal the menu can reach rather than naming its code', () => {
    // Proof: with the bare entries struck from PLAN_REFUSALS, the first read
    // `That change could not be completed (already_claimed)`; watched 2026-10-27.
    for (const code of [
      'already_claimed',
      'person_required',
      'person_not_bound',
      'credential_not_for_person',
      'item_done',
      'not_startable',
      'step_done',
      'inside_subtree_claim',
      'overlaps_subtree_claim',
      'resources_exhausted',
      'not_claimed_by',
    ]) {
      const sentence = refusalSentence(new Error(code));
      expect(sentence, code).not.toContain(code);
      expect(sentence, code).toContain('Nothing was changed.');
    }
  });
});
