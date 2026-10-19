import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import {
  type Claim,
  type ClaimRequest,
  decideClaim,
  decideRelease,
  type ReleaseRequest,
} from './claim';
import { WORK_ITEM_STATUSES } from './progress';

const F = 'account-f';
const G = 'account-g';

function claim(over: Partial<Claim> & Pick<Claim, 'id' | 'workItemId'>): Claim {
  return {
    stepId: null,
    personId: 'claire',
    runId: null,
    parentClaimId: null,
    accountId: F,
    ...over,
  };
}

/** Leaf `080.25` under `080` under the root, with the spec's three steps. */
function leafRequest(over: Partial<ClaimRequest> = {}): ClaimRequest {
  return {
    target: {
      workItemId: 'leaf',
      isLeaf: true,
      status: 'in_progress',
      ancestorIds: ['parent', 'root'],
      descendantIds: [],
      steps: [
        { stepId: 'plan', progress: 'unknown' },
        { stepId: 'impl', progress: 'done' },
        { stepId: 'review', progress: 'in_progress' },
      ],
    },
    caller: { accountId: F, isAdmin: false, pinnedPersonId: null },
    claimant: { personId: 'worker', boundAccountId: F },
    stepIds: null,
    runId: 'agent:main:subagent:7f',
    parentClaim: null,
    parentClaimId: null,
    claims: [],
    ...over,
  };
}

function parentRequest(over: Partial<ClaimRequest> = {}): ClaimRequest {
  return leafRequest({
    target: {
      workItemId: 'parent',
      isLeaf: false,
      status: 'in_progress',
      ancestorIds: ['root'],
      descendantIds: ['leaf', 'sibling', 'mid', 'deep'],
      steps: [],
    },
    claimant: { personId: 'claire', boundAccountId: F },
    runId: null,
    ...over,
  });
}

const subtree = claim({ id: 'c-parent', workItemId: 'parent', personId: 'claire' });

describe('decideClaim on a leaf', () => {
  it('claims every step that is not done and states the unstated one in progress', () => {
    expect(decideClaim(leafRequest())).toEqual({
      kind: 'claim',
      drafts: [
        {
          workItemId: 'leaf',
          stepId: 'plan',
          personId: 'worker',
          runId: 'agent:main:subagent:7f',
          parentClaimId: null,
        },
        {
          workItemId: 'leaf',
          stepId: 'review',
          personId: 'worker',
          runId: 'agent:main:subagent:7f',
          parentClaimId: null,
        },
      ],
      stateInProgress: ['plan'],
    });
  });

  it('claims exactly the named steps', () => {
    const decided = decideClaim(leafRequest({ stepIds: ['review'] }));
    expect(decided).toMatchObject({ kind: 'claim', stateInProgress: [] });
    expect(decided.kind === 'claim' && decided.drafts.map(({ stepId }) => stepId)).toEqual([
      'review',
    ]);
  });

  it('lets a second agent hold another step of the same leaf', () => {
    const held = claim({ id: 'a', workItemId: 'leaf', stepId: 'review', personId: 'agent-a' });
    const decided = decideClaim(leafRequest({ stepIds: ['plan'], claims: [held] }));
    expect(decided.kind).toBe('claim');
  });

  it('adopts an orphan in-progress step', () => {
    const decided = decideClaim(
      leafRequest({
        target: { ...leafRequest().target, status: 'in_progress' },
        stepIds: ['review'],
      }),
    );
    expect(decided).toMatchObject({ kind: 'claim', stateInProgress: [] });
  });

  for (const status of ['unknown', 'draft', 'ready'] as const) {
    it(`accepts a leaf reading ${status}`, () => {
      const target = { ...leafRequest().target, status };
      expect(decideClaim(leafRequest({ target })).kind).toBe('claim');
    });
  }

  it('answers alreadyHeld when the same person and run hold every step it would take', () => {
    const runId = 'agent:main:subagent:7f';
    const claims = ['plan', 'review'].map((stepId) =>
      claim({ id: stepId, workItemId: 'leaf', stepId, personId: 'worker', runId }),
    );
    expect(decideClaim(leafRequest({ claims }))).toEqual({ kind: 'alreadyHeld' });
  });

  it('takes only the free steps when the holder already holds some', () => {
    const runId = 'agent:main:subagent:7f';
    const claims = [
      claim({ id: 'p', workItemId: 'leaf', stepId: 'plan', personId: 'worker', runId }),
    ];
    const decided = decideClaim(leafRequest({ claims }));
    expect(decided.kind === 'claim' && decided.drafts.map(({ stepId }) => stepId)).toEqual([
      'review',
    ]);
  });

  it('accepts a delegated claim under the subtree claim from the same account', () => {
    const decided = decideClaim(
      leafRequest({ parentClaim: subtree, parentClaimId: subtree.id, claims: [subtree] }),
    );
    expect(
      decided.kind === 'claim' && decided.drafts.every((each) => each.parentClaimId === 'c-parent'),
    ).toBe(true);
  });

  it('accepts the subtree holder itself inside its subtree', () => {
    const decided = decideClaim(
      leafRequest({ claimant: { personId: 'claire', boundAccountId: F }, claims: [subtree] }),
    );
    expect(decided.kind).toBe('claim');
  });

  it('accepts a claim nested two delegations deep', () => {
    const mid = claim({
      id: 'c-mid',
      workItemId: 'mid',
      personId: 'lieutenant',
      parentClaimId: 'c-parent',
    });
    const decided = decideClaim(
      leafRequest({
        target: { ...leafRequest().target, ancestorIds: ['mid', 'parent', 'root'] },
        parentClaim: mid,
        parentClaimId: mid.id,
        claims: [subtree, mid],
      }),
    );
    expect(decided.kind).toBe('claim');
  });
});

describe('decideClaim refusals, one per reason', () => {
  it('person_not_bound: the person is bound to another account', () => {
    const decided = decideClaim(
      leafRequest({ claimant: { personId: 'worker', boundAccountId: G } }),
    );
    expect(decided).toEqual({ kind: 'refused', refusal: { reason: 'person_not_bound' } });
  });

  it('person_not_bound: the person is bound to nobody and the caller is a member', () => {
    const decided = decideClaim(
      leafRequest({ claimant: { personId: 'worker', boundAccountId: null } }),
    );
    expect(decided).toEqual({ kind: 'refused', refusal: { reason: 'person_not_bound' } });
  });

  it('lets an admin claim for an unbound person', () => {
    const decided = decideClaim(
      leafRequest({
        caller: { accountId: F, isAdmin: true, pinnedPersonId: null },
        claimant: { personId: 'worker', boundAccountId: null },
      }),
    );
    expect(decided.kind).toBe('claim');
  });

  it('credential_not_for_person: a pinned credential names another person', () => {
    const decided = decideClaim(
      leafRequest({
        caller: { accountId: F, isAdmin: false, pinnedPersonId: 'claire' },
        claimant: { personId: 'codex-fleet', boundAccountId: F },
      }),
    );
    expect(decided).toEqual({ kind: 'refused', refusal: { reason: 'credential_not_for_person' } });
  });

  it('the admin bypass does not reach credential_not_for_person', () => {
    const decided = decideClaim(
      leafRequest({
        caller: { accountId: F, isAdmin: true, pinnedPersonId: 'claire' },
        claimant: { personId: 'codex-fleet', boundAccountId: null },
      }),
    );
    expect(decided).toEqual({ kind: 'refused', refusal: { reason: 'credential_not_for_person' } });
  });

  it('a pinned credential may claim for a subagent under its own person’s claim', () => {
    const decided = decideClaim(
      leafRequest({
        caller: { accountId: F, isAdmin: false, pinnedPersonId: 'claire' },
        parentClaim: subtree,
        parentClaimId: subtree.id,
        claims: [subtree],
      }),
    );
    expect(decided.kind).toBe('claim');
  });

  it('parent_claim_unknown: the named parent is absent or released', () => {
    const decided = decideClaim(leafRequest({ parentClaimId: 'gone', parentClaim: null }));
    expect(decided).toEqual({ kind: 'refused', refusal: { reason: 'parent_claim_unknown' } });
  });

  it('parent_claim_foreign: the parent was written by another account', () => {
    const foreign = { ...subtree, accountId: G };
    const decided = decideClaim(
      leafRequest({ parentClaim: foreign, parentClaimId: foreign.id, claims: [foreign] }),
    );
    expect(decided).toEqual({ kind: 'refused', refusal: { reason: 'parent_claim_foreign' } });
  });

  it('parent_claim_not_ancestor: the parent sits beside the item, not above it', () => {
    const beside = claim({ id: 'c-beside', workItemId: 'elsewhere' });
    const decided = decideClaim(leafRequest({ parentClaim: beside, parentClaimId: beside.id }));
    expect(decided).toEqual({ kind: 'refused', refusal: { reason: 'parent_claim_not_ancestor' } });
  });

  it('parent_claim_not_ancestor: the parent is on the item itself', () => {
    const own = claim({ id: 'c-own', workItemId: 'leaf' });
    const decided = decideClaim(leafRequest({ parentClaim: own, parentClaimId: own.id }));
    expect(decided).toEqual({ kind: 'refused', refusal: { reason: 'parent_claim_not_ancestor' } });
  });

  it('item_done: the item reads done', () => {
    const target = { ...leafRequest().target, status: 'done' as const };
    expect(decideClaim(leafRequest({ target }))).toEqual({
      kind: 'refused',
      refusal: { reason: 'item_done' },
    });
  });

  for (const status of ['blocked', 'on_hold', 'blocked_by_proxy'] as const) {
    it(`not_startable: a leaf reading ${status}, carrying the status`, () => {
      const target = { ...leafRequest().target, status };
      expect(decideClaim(leafRequest({ target }))).toEqual({
        kind: 'refused',
        refusal: { reason: 'not_startable', status },
      });
    });
  }

  it('step_done: a named step is done', () => {
    expect(decideClaim(leafRequest({ stepIds: ['plan', 'impl'] }))).toEqual({
      kind: 'refused',
      refusal: { reason: 'step_done', stepIds: ['impl'] },
    });
  });

  it('already_claimed: another holder has a step, named with its run', () => {
    const held = claim({
      id: 'h',
      workItemId: 'leaf',
      stepId: 'review',
      personId: 'agent-a',
      runId: 'run-a',
      accountId: G,
    });
    expect(decideClaim(leafRequest({ claims: [held] }))).toEqual({
      kind: 'refused',
      refusal: {
        reason: 'already_claimed',
        holders: [{ claimId: 'h', personId: 'agent-a', runId: 'run-a' }],
      },
    });
  });

  it('already_claimed: the same person under another run is another holder', () => {
    const held = claim({
      id: 'h',
      workItemId: 'leaf',
      stepId: 'plan',
      personId: 'worker',
      runId: 'old',
    });
    expect(decideClaim(leafRequest({ claims: [held] }))).toMatchObject({
      kind: 'refused',
      refusal: { reason: 'already_claimed' },
    });
  });

  it('inside_subtree_claim: a stranger claims inside a claimed subtree, naming the holder', () => {
    const decided = decideClaim(
      leafRequest({
        caller: { accountId: G, isAdmin: false, pinnedPersonId: null },
        claimant: { personId: 'stranger', boundAccountId: G },
        claims: [subtree],
      }),
    );
    expect(decided).toEqual({
      kind: 'refused',
      refusal: {
        reason: 'inside_subtree_claim',
        holder: { claimId: 'c-parent', personId: 'claire', runId: null },
      },
    });
  });

  // Proof: with the checks reordered so the subtree check ran before
  // `already_claimed`, this case answered inside_subtree_claim; watched 2026-10-19.
  it('orders already_claimed before inside_subtree_claim', () => {
    const held = claim({ id: 'h', workItemId: 'leaf', stepId: 'plan', personId: 'agent-a' });
    const decided = decideClaim(
      leafRequest({
        caller: { accountId: G, isAdmin: false, pinnedPersonId: null },
        claimant: { personId: 'stranger', boundAccountId: G },
        claims: [subtree, held],
      }),
    );
    expect(decided).toMatchObject({ kind: 'refused', refusal: { reason: 'already_claimed' } });
  });

  it('orders person_not_bound before every other refusal', () => {
    const target = { ...leafRequest().target, status: 'done' as const };
    const decided = decideClaim(
      leafRequest({
        target,
        caller: { accountId: G, isAdmin: false, pinnedPersonId: 'claire' },
        parentClaimId: 'gone',
      }),
    );
    expect(decided).toEqual({ kind: 'refused', refusal: { reason: 'person_not_bound' } });
  });
});

describe('decideClaim on a non-leaf', () => {
  it('writes one subtree claim with no step and states nothing', () => {
    expect(decideClaim(parentRequest())).toEqual({
      kind: 'claim',
      drafts: [
        {
          workItemId: 'parent',
          stepId: null,
          personId: 'claire',
          runId: null,
          parentClaimId: null,
        },
      ],
      stateInProgress: [],
    });
  });

  it('is not refused by a blocked reading: only done refuses a subtree claim', () => {
    const target = { ...parentRequest().target, status: 'blocked_by_proxy' as const };
    expect(decideClaim(parentRequest({ target })).kind).toBe('claim');
  });

  it('item_done on a done subtree', () => {
    const target = { ...parentRequest().target, status: 'done' as const };
    expect(decideClaim(parentRequest({ target }))).toEqual({
      kind: 'refused',
      refusal: { reason: 'item_done' },
    });
  });

  it('answers alreadyHeld to the holder repeating it', () => {
    expect(decideClaim(parentRequest({ claims: [subtree] }))).toEqual({ kind: 'alreadyHeld' });
  });

  it('already_claimed when another person holds the subtree', () => {
    const decided = decideClaim(
      parentRequest({ claimant: { personId: 'other', boundAccountId: F }, claims: [subtree] }),
    );
    expect(decided).toMatchObject({ kind: 'refused', refusal: { reason: 'already_claimed' } });
  });

  it('overlaps_subtree_claim: a descendant holds another person’s subtree claim', () => {
    const below = claim({ id: 'c-mid', workItemId: 'mid', personId: 'other', accountId: G });
    expect(decideClaim(parentRequest({ claims: [below] }))).toEqual({
      kind: 'refused',
      refusal: {
        reason: 'overlaps_subtree_claim',
        holder: { claimId: 'c-mid', personId: 'other', runId: null },
      },
    });
  });

  it('a descendant step claim of another person does not overlap', () => {
    const step = claim({ id: 's', workItemId: 'leaf', stepId: 'plan', personId: 'other' });
    expect(decideClaim(parentRequest({ claims: [step] })).kind).toBe('claim');
  });

  // The spec checks inside_subtree_claim before overlaps_subtree_claim, so an
  // ancestor's foreign subtree claim answers the former on a non-leaf too.
  it('an ancestor’s foreign subtree claim answers inside_subtree_claim, first in order', () => {
    const above = claim({ id: 'c-root', workItemId: 'root', personId: 'other', accountId: G });
    expect(decideClaim(parentRequest({ claims: [above] }))).toMatchObject({
      kind: 'refused',
      refusal: { reason: 'inside_subtree_claim', holder: { claimId: 'c-root' } },
    });
  });

  it('allows a nested subtree claim as a delegated claim', () => {
    const above = claim({ id: 'c-root', workItemId: 'root', personId: 'boss' });
    const decided = decideClaim(
      parentRequest({ parentClaim: above, parentClaimId: above.id, claims: [above] }),
    );
    expect(decided).toMatchObject({
      kind: 'claim',
      drafts: [{ workItemId: 'parent', stepId: null, parentClaimId: 'c-root' }],
    });
  });
});

describe('decideClaim never takes a held step', () => {
  const steps = ['s0', 's1', 's2', 's3'];
  const people = ['p0', 'p1', 'p2'];
  const arbitrary = fc.record({
    status: fc.constantFrom(...WORK_ITEM_STATUSES),
    progress: fc.array(
      fc.constantFrom('unknown' as const, 'in_progress' as const, 'done' as const),
      {
        minLength: steps.length,
        maxLength: steps.length,
      },
    ),
    held: fc.array(
      fc.option(
        fc.record({ person: fc.constantFrom(...people), run: fc.constantFrom('r0', 'r1') }),
        { nil: null },
      ),
      {
        minLength: steps.length,
        maxLength: steps.length,
      },
    ),
    named: fc.option(fc.subarray(steps, { minLength: 1 }), { nil: null }),
    claimant: fc.constantFrom(...people),
    run: fc.constantFrom('r0', 'r1'),
  });

  it('answers no draft on a step any claim holds', () => {
    fc.assert(
      fc.property(arbitrary, (drawn) => {
        const claims = drawn.held.flatMap((holder, index) =>
          holder === null
            ? []
            : [
                claim({
                  id: `c${String(index)}`,
                  workItemId: 'leaf',
                  stepId: steps[index] ?? 'x',
                  personId: holder.person,
                  runId: holder.run,
                }),
              ],
        );
        const decided = decideClaim(
          leafRequest({
            target: {
              ...leafRequest().target,
              status: drawn.status,
              steps: steps.map((stepId, index) => ({
                stepId,
                progress: drawn.progress[index] ?? 'unknown',
              })),
            },
            claimant: { personId: drawn.claimant, boundAccountId: F },
            runId: drawn.run,
            stepIds: drawn.named,
            claims,
          }),
        );
        if (decided.kind !== 'claim') return;
        const heldSteps = new Set(claims.map(({ stepId }) => stepId));
        for (const draft of decided.drafts) expect(heldSteps.has(draft.stepId)).toBe(false);
      }),
    );
  });
});

function releaseRequest(over: Partial<ReleaseRequest> = {}): ReleaseRequest {
  return {
    target: { workItemId: 'leaf', isLeaf: true },
    caller: { accountId: F, isAdmin: false, pinnedPersonId: null },
    claimant: { personId: 'worker', boundAccountId: F },
    stepIds: null,
    claims: [],
    ...over,
  };
}

describe('decideRelease', () => {
  const impl = claim({ id: 'i', workItemId: 'leaf', stepId: 'impl', personId: 'worker' });
  const review = claim({ id: 'r', workItemId: 'leaf', stepId: 'review', personId: 'worker' });
  const others = claim({ id: 'o', workItemId: 'leaf', stepId: 'plan', personId: 'agent-b' });

  it('releases every claim of the person on a leaf, leaving other holders', () => {
    expect(decideRelease(releaseRequest({ claims: [impl, review, others] }))).toEqual({
      kind: 'release',
      claims: [impl, review],
    });
  });

  it('releases only the named steps', () => {
    expect(decideRelease(releaseRequest({ stepIds: ['review'], claims: [impl, review] }))).toEqual({
      kind: 'release',
      claims: [review],
    });
  });

  it('not_claimed_by when the person holds nothing it would remove', () => {
    expect(decideRelease(releaseRequest({ claims: [others] }))).toEqual({
      kind: 'refused',
      refusal: { reason: 'not_claimed_by' },
    });
  });

  it('person_not_bound under the claim rules', () => {
    expect(
      decideRelease(
        releaseRequest({ claimant: { personId: 'worker', boundAccountId: G }, claims: [impl] }),
      ),
    ).toEqual({ kind: 'refused', refusal: { reason: 'person_not_bound' } });
  });

  it('credential_not_for_person under the claim rules', () => {
    expect(
      decideRelease(
        releaseRequest({
          caller: { accountId: F, isAdmin: false, pinnedPersonId: 'claire' },
          claims: [impl],
        }),
      ),
    ).toEqual({ kind: 'refused', refusal: { reason: 'credential_not_for_person' } });
  });

  it('a pinned credential releases its subagent’s delegated claim', () => {
    const delegated = { ...impl, parentClaimId: 'c-parent' };
    expect(
      decideRelease(
        releaseRequest({
          caller: { accountId: F, isAdmin: false, pinnedPersonId: 'claire' },
          claims: [subtree, delegated],
        }),
      ),
    ).toEqual({ kind: 'release', claims: [delegated] });
  });

  it('cascades a subtree release through delegated claims, transitively', () => {
    const mid = claim({
      id: 'c-mid',
      workItemId: 'mid',
      personId: 'lieutenant',
      parentClaimId: 'c-parent',
    });
    const w1 = claim({
      id: 'w1',
      workItemId: 'leaf',
      stepId: 'impl',
      personId: 'worker-1',
      parentClaimId: 'c-parent',
    });
    const w2 = claim({
      id: 'w2',
      workItemId: 'deep',
      stepId: 'impl',
      personId: 'worker-2',
      parentClaimId: 'c-mid',
    });
    const stranger = claim({
      id: 'x',
      workItemId: 'sibling',
      stepId: 'impl',
      personId: 'stranger',
    });
    expect(
      decideRelease(
        releaseRequest({
          target: { workItemId: 'parent', isLeaf: false },
          claimant: { personId: 'claire', boundAccountId: F },
          claims: [subtree, mid, w1, w2, stranger],
        }),
      ),
    ).toEqual({ kind: 'release', claims: [subtree, mid, w1, w2] });
  });
});
