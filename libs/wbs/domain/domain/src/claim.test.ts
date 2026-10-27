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
    caller: { accountId: F, isAdmin: false, pinnedPersonId: null, pinnedRunId: null },
    claimant: { personId: 'worker', boundAccountId: F },
    stepIds: null,
    runId: 'agent:main:subagent:7f',
    parentClaim: null,
    parentClaimId: null,
    assign: false,
    claims: [],
    demand: [],
    resources: null,
    capacities: [],
    occupancy: [],
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
      assignStepIds: [],
      occupancy: [],
      acquired: [],
    });
  });

  it('assigns exactly the steps it claims when asked, skipping the ones it already holds', () => {
    const held = claim({
      id: 'c-plan',
      workItemId: 'leaf',
      stepId: 'plan',
      personId: 'worker',
      runId: 'agent:main:subagent:7f',
    });
    expect(decideClaim(leafRequest({ assign: true }))).toMatchObject({
      kind: 'claim',
      assignStepIds: ['plan', 'review'],
    });
    expect(decideClaim(leafRequest({ assign: true, claims: [held] }))).toMatchObject({
      kind: 'claim',
      assignStepIds: ['review'],
    });
    expect(decideClaim(leafRequest({ assign: true, stepIds: ['review'] }))).toMatchObject({
      kind: 'claim',
      assignStepIds: ['review'],
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
        caller: { accountId: F, isAdmin: true, pinnedPersonId: null, pinnedRunId: null },
        claimant: { personId: 'worker', boundAccountId: null },
      }),
    );
    expect(decided.kind).toBe('claim');
  });

  it('credential_not_for_person: a pinned credential names another person', () => {
    const decided = decideClaim(
      leafRequest({
        caller: { accountId: F, isAdmin: false, pinnedPersonId: 'claire', pinnedRunId: null },
        claimant: { personId: 'codex-fleet', boundAccountId: F },
      }),
    );
    expect(decided).toEqual({ kind: 'refused', refusal: { reason: 'credential_not_for_person' } });
  });

  it('the admin bypass does not reach credential_not_for_person', () => {
    const decided = decideClaim(
      leafRequest({
        caller: { accountId: F, isAdmin: true, pinnedPersonId: 'claire', pinnedRunId: null },
        claimant: { personId: 'codex-fleet', boundAccountId: null },
      }),
    );
    expect(decided).toEqual({ kind: 'refused', refusal: { reason: 'credential_not_for_person' } });
  });

  it('a pinned credential may claim for a subagent under its own person’s claim', () => {
    const decided = decideClaim(
      leafRequest({
        caller: { accountId: F, isAdmin: false, pinnedPersonId: 'claire', pinnedRunId: null },
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
        caller: { accountId: G, isAdmin: false, pinnedPersonId: null, pinnedRunId: null },
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
        caller: { accountId: G, isAdmin: false, pinnedPersonId: null, pinnedRunId: null },
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
        caller: { accountId: G, isAdmin: false, pinnedPersonId: 'claire', pinnedRunId: null },
        parentClaimId: 'gone',
      }),
    );
    expect(decided).toEqual({ kind: 'refused', refusal: { reason: 'person_not_bound' } });
  });
});

describe('decideClaim on what a claim names', () => {
  // Proof: with the empty-list throw removed, this answered alreadyHeld with no
  // claim at all; watched 2026-10-19.
  it('throws on an empty step list: the normalizer refuses it at the boundary', () => {
    expect(() => decideClaim(leafRequest({ stepIds: [] }))).toThrow('a claim names no steps');
  });

  // Proof: with parentClaimId left out of the same-holder test, this answered
  // alreadyHeld and the chain was never recorded; watched 2026-10-19.
  it('refuses the holder repeating its claim under another parent, naming itself', () => {
    const runId = 'agent:main:subagent:7f';
    const own = ['plan', 'review'].map((stepId) =>
      claim({ id: stepId, workItemId: 'leaf', stepId, personId: 'worker', runId }),
    );
    expect(
      decideClaim(
        leafRequest({ claims: [subtree, ...own], parentClaim: subtree, parentClaimId: subtree.id }),
      ),
    ).toMatchObject({
      kind: 'refused',
      refusal: { reason: 'already_claimed', holders: [{ claimId: 'plan' }, { claimId: 'review' }] },
    });
  });

  it('answers no_steps on a leaf of a project with no steps', () => {
    const target = { ...leafRequest().target, steps: [] };
    expect(decideClaim(leafRequest({ target }))).toEqual({
      kind: 'refused',
      refusal: { reason: 'no_steps' },
    });
  });

  // Proof: with the subtree steps check removed, this wrote a subtree claim and
  // ignored the steps; watched 2026-10-19.
  it('refuses steps named on a non-leaf', () => {
    expect(decideClaim(parentRequest({ stepIds: ['plan'] }))).toEqual({
      kind: 'refused',
      refusal: { reason: 'steps_on_subtree' },
    });
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
      assignStepIds: [],
      occupancy: [],
      acquired: [],
    });
  });

  it('assigns nothing with a subtree claim, which writes no step', () => {
    expect(decideClaim(parentRequest({ assign: true }))).toMatchObject({
      kind: 'claim',
      assignStepIds: [],
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
    named: fc.option(fc.subarray(steps, { minLength: 0 }), { nil: null }),
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
        const decide = () =>
          decideClaim(
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
        // An empty list names nothing to hold: it never answers alreadyHeld.
        if (drawn.named?.length === 0) {
          expect(decide).toThrow('a claim names no steps');
          return;
        }
        const decided = decide();
        if (decided.kind !== 'claim') return;
        const heldSteps = new Set(claims.map(({ stepId }) => stepId));
        for (const draft of decided.drafts) expect(heldSteps.has(draft.stepId)).toBe(false);
      }),
    );
  });

  it('with assign, assigns exactly the steps it claims; without, none', () => {
    fc.assert(
      fc.property(arbitrary, fc.boolean(), (drawn, assign) => {
        if (drawn.named?.length === 0) return;
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
            assign,
            claims: drawn.held.flatMap((holder, index) =>
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
            ),
          }),
        );
        if (decided.kind !== 'claim') return;
        // A leaf's drafts always name a step.
        const claimed = decided.drafts.map(({ stepId }) => stepId ?? 'subtree').toSorted();
        expect([...decided.assignStepIds].toSorted()).toEqual(assign ? claimed : []);
      }),
    );
  });
});

function releaseRequest(over: Partial<ReleaseRequest> = {}): ReleaseRequest {
  return {
    target: { workItemId: 'leaf', isLeaf: true },
    caller: { accountId: F, isAdmin: false, pinnedPersonId: null, pinnedRunId: null },
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
          caller: { accountId: F, isAdmin: false, pinnedPersonId: 'claire', pinnedRunId: null },
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
          caller: { accountId: F, isAdmin: false, pinnedPersonId: 'claire', pinnedRunId: null },
          claims: [subtree, delegated],
        }),
      ),
    ).toEqual({ kind: 'release', claims: [delegated] });
  });

  // Proof: with the release steps check removed, this released the subtree claim
  // and ignored the steps; watched 2026-10-19.
  it('refuses steps named on a non-leaf release', () => {
    expect(
      decideRelease(
        releaseRequest({
          target: { workItemId: 'parent', isLeaf: false },
          claimant: { personId: 'claire', boundAccountId: F },
          stepIds: ['plan'],
          claims: [subtree],
        }),
      ),
    ).toEqual({ kind: 'refused', refusal: { reason: 'steps_on_subtree' } });
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

/** A machine grant pinned to `worker` that opted into run `a` (`wbs-mcp-agent-surface` M15). */
const RUN_A = { accountId: F, isAdmin: false, pinnedPersonId: 'worker', pinnedRunId: 'a' };

describe('decideClaim under an opted-in run', () => {
  it('stamps the run on a claim for its own person, given no runId', () => {
    const decided = decideClaim(leafRequest({ caller: RUN_A, runId: null }));
    if (decided.kind !== 'claim') throw new Error(`refused: ${JSON.stringify(decided)}`);
    expect(decided.drafts.map(({ runId }) => runId)).toEqual(['a', 'a']);
  });

  it('accepts the same runId as its run', () => {
    const decided = decideClaim(leafRequest({ caller: RUN_A, runId: 'a' }));
    expect(decided.kind).toBe('claim');
  });

  it('refuses a forged run id run_mismatch, after the identity refusals', () => {
    expect(decideClaim(leafRequest({ caller: RUN_A, runId: 'b' }))).toEqual({
      kind: 'refused',
      refusal: { reason: 'run_mismatch' },
    });
    expect(
      decideClaim(
        leafRequest({
          caller: { ...RUN_A, pinnedPersonId: 'claire' },
          claimant: { personId: 'codex-fleet', boundAccountId: F },
          runId: 'b',
        }),
      ),
    ).toEqual({ kind: 'refused', refusal: { reason: 'credential_not_for_person' } });
  });

  it('refuses run_mismatch before the parent-claim checks', () => {
    expect(
      decideClaim(
        leafRequest({ caller: RUN_A, runId: 'b', parentClaimId: 'c-absent', parentClaim: null }),
      ),
    ).toEqual({ kind: 'refused', refusal: { reason: 'run_mismatch' } });
  });

  it('answers alreadyHeld for its own run, and already_claimed for another run', () => {
    const held = [
      claim({ id: 'p', workItemId: 'leaf', stepId: 'plan', personId: 'worker', runId: 'a' }),
      claim({ id: 'r', workItemId: 'leaf', stepId: 'review', personId: 'worker', runId: 'a' }),
    ];
    expect(decideClaim(leafRequest({ caller: RUN_A, runId: null, claims: held }))).toEqual({
      kind: 'alreadyHeld',
    });
    const underB = held.map((each) => ({ ...each, runId: 'b' }));
    expect(decideClaim(leafRequest({ caller: RUN_A, runId: null, claims: underB })).kind).toBe(
      'refused',
    );
  });

  it('adopts its own pre-opt-in claim as alreadyHeld, without restamping it', () => {
    const before = [
      claim({ id: 'p', workItemId: 'leaf', stepId: 'plan', personId: 'worker', runId: null }),
      claim({ id: 'r', workItemId: 'leaf', stepId: 'review', personId: 'worker', runId: null }),
    ];
    expect(decideClaim(leafRequest({ caller: RUN_A, runId: null, claims: before }))).toEqual({
      kind: 'alreadyHeld',
    });
    // A step beside the adopted one is written under the run.
    const decided = decideClaim(
      leafRequest({ caller: RUN_A, runId: null, claims: before.slice(0, 1) }),
    );
    if (decided.kind !== 'claim') throw new Error(`refused: ${JSON.stringify(decided)}`);
    expect(decided.drafts.map(({ stepId, runId }) => [stepId, runId])).toEqual([['review', 'a']]);
  });

  it('adopts no other person’s no-run claim', () => {
    const theirs = [
      claim({ id: 'p', workItemId: 'leaf', stepId: 'plan', personId: 'other', runId: null }),
    ];
    expect(decideClaim(leafRequest({ caller: RUN_A, runId: null, claims: theirs })).kind).toBe(
      'refused',
    );
  });

  it("a lead writes a worker's delegated claim with the worker's run", () => {
    const lead = { accountId: F, isAdmin: false, pinnedPersonId: 'claire', pinnedRunId: 'a' };
    const decided = decideClaim(
      leafRequest({
        caller: lead,
        runId: 'b',
        parentClaim: subtree,
        parentClaimId: subtree.id,
        claims: [subtree],
      }),
    );
    if (decided.kind !== 'claim') throw new Error(`refused: ${JSON.stringify(decided)}`);
    expect(decided.drafts.map(({ runId }) => runId)).toEqual(['b', 'b']);
  });

  it('leaves a caller without a run to the command’s runId', () => {
    const decided = decideClaim(
      leafRequest({ caller: { ...RUN_A, pinnedRunId: null }, runId: 'free' }),
    );
    if (decided.kind !== 'claim') throw new Error(`refused: ${JSON.stringify(decided)}`);
    expect(decided.drafts.map(({ runId }) => runId)).toEqual(['free', 'free']);
  });
});

describe('decideRelease under an opted-in run', () => {
  const implA = claim({
    id: 'ia',
    workItemId: 'leaf',
    stepId: 'impl',
    personId: 'worker',
    runId: 'a',
  });
  const reviewB = claim({
    id: 'rb',
    workItemId: 'leaf',
    stepId: 'review',
    personId: 'worker',
    runId: 'b',
  });

  it('releases only its run’s claim on a leaf held under two runs', () => {
    expect(decideRelease(releaseRequest({ caller: RUN_A, claims: [implA, reviewB] }))).toEqual({
      kind: 'release',
      claims: [implA],
    });
  });

  it('releases its run’s step of named steps split across runs, refusing nothing', () => {
    expect(
      decideRelease(
        releaseRequest({ caller: RUN_A, stepIds: ['impl', 'review'], claims: [implA, reviewB] }),
      ),
    ).toEqual({ kind: 'release', claims: [implA] });
  });

  it('refuses run_mismatch naming only another run’s step', () => {
    expect(
      decideRelease(
        releaseRequest({ caller: RUN_A, stepIds: ['review'], claims: [implA, reviewB] }),
      ),
    ).toEqual({ kind: 'refused', refusal: { reason: 'run_mismatch' } });
  });

  it('judges not_claimed_by first, over every run', () => {
    expect(
      decideRelease(releaseRequest({ caller: RUN_A, stepIds: ['plan'], claims: [implA, reviewB] })),
    ).toEqual({ kind: 'refused', refusal: { reason: 'not_claimed_by' } });
  });

  it('refuses run_mismatch when the person holds the item only under other runs', () => {
    expect(decideRelease(releaseRequest({ caller: RUN_A, claims: [reviewB] }))).toEqual({
      kind: 'refused',
      refusal: { reason: 'run_mismatch' },
    });
  });

  it('releases a claim taken with no run before it opted in', () => {
    const before = { ...reviewB, runId: null };
    expect(decideRelease(releaseRequest({ caller: RUN_A, claims: [before] }))).toEqual({
      kind: 'release',
      claims: [before],
    });
  });

  it('refuses run_mismatch on a subtree claim held under another run', () => {
    const underB = { ...subtree, personId: 'worker', runId: 'b' };
    expect(
      decideRelease(
        releaseRequest({
          target: { workItemId: 'parent', isLeaf: false },
          caller: RUN_A,
          claims: [underB],
        }),
      ),
    ).toEqual({ kind: 'refused', refusal: { reason: 'run_mismatch' } });
  });

  // Proof: with the run applied to every release the principal makes (the
  // pinned-person test dropped from `decideRelease`), this answered
  // run_mismatch; watched 2026-10-27.
  it("judges a lead's release of a worker's delegated claim without a run", () => {
    const delegated = { ...reviewB, parentClaimId: 'c-parent' };
    const lead = { accountId: F, isAdmin: false, pinnedPersonId: 'claire', pinnedRunId: 'a' };
    expect(decideRelease(releaseRequest({ caller: lead, claims: [subtree, delegated] }))).toEqual({
      kind: 'release',
      claims: [delegated],
    });
  });
});
