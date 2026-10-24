import type { ClaimView } from '@/lib/wbs-api';

import { fakeProjectApi } from './fake-project-api';

const MINUTE = 60_000;

/** When every fixture claim was made: `24 Oct 10:42` in the fixture's zone, UTC. */
export const CLAIMED_AT = Date.UTC(2026, 9, 24, 10, 42);

type ClaimFields = Omit<ClaimView, 'number' | 'numberIsFrozen' | 'name'>;

/**
 * A swarm on a small plan, for the claim chip suites (`wbs-claim-display`
 * slices 4–7):
 *
 * - `010` Strip, a parent: `claire` holds a subtree claim on it, leased.
 * - `010.1` Paint, under it: `ada` is assigned Dev and `codex` holds Dev under
 *   run `r-7`, delegated under claire's claim, leased 14.5 minutes.
 * - `020` Sand: `eve` holds Dev with 30 seconds of lease left and `finn` holds
 *   QA with a revoked credential.
 * - `030` Prime: `dana`, a human, holds Dev with no lease.
 *
 * The read's `readAt` is the fake clock at the read, and every lease is placed
 * against it, so a test that fakes `Date` and `performance` moves both.
 * The tree carries the zone `UTC`, so instants print as `24 Oct 10:42`.
 *
 * @param only Which claims the read answers (all by default), by claim id.
 */
export async function claimedPlan(only?: readonly string[]) {
  const api = fakeProjectApi();
  const strip = await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Strip' });
  const paint = await api.createWorkItem('p1', {
    parentId: strip.id,
    afterId: null,
    name: 'Paint',
  });
  const sand = await api.createWorkItem('p1', { parentId: null, afterId: strip.id, name: 'Sand' });
  const prime = await api.createWorkItem('p1', { parentId: null, afterId: sand.id, name: 'Prime' });
  const ada = await api.addPerson('ada', []);
  await api.assignPerson(paint.id, 'step-dev', ada.id);
  const tree = api.tree.bind(api);
  api.tree = async (projectId) => ({ ...(await tree(projectId)), timezone: 'UTC' });

  const holder = (name: string) => ({ personId: `person-${name}`, name });
  const claims = (readAt: number): ClaimFields[] => [
    {
      claimId: 'c-claire',
      workItemId: strip.id,
      stepId: null,
      holder: holder('claire'),
      runId: 'agent:claire:main',
      parentClaimId: null,
      claimedAt: CLAIMED_AT,
      leaseExpiresAt: readAt + 14.5 * MINUTE,
      leaseRevokedAt: null,
    },
    {
      claimId: 'c-codex',
      workItemId: paint.id,
      stepId: 'step-dev',
      holder: holder('codex'),
      runId: 'r-7',
      parentClaimId: 'c-claire',
      claimedAt: CLAIMED_AT,
      leaseExpiresAt: readAt + 14.5 * MINUTE,
      leaseRevokedAt: null,
    },
    {
      claimId: 'c-eve',
      workItemId: sand.id,
      stepId: 'step-dev',
      holder: holder('eve'),
      runId: 'r-9',
      parentClaimId: null,
      claimedAt: CLAIMED_AT,
      leaseExpiresAt: readAt + 0.5 * MINUTE,
      leaseRevokedAt: null,
    },
    {
      claimId: 'c-finn',
      workItemId: sand.id,
      stepId: 'step-qa',
      holder: holder('finn'),
      runId: 'r-11',
      parentClaimId: null,
      claimedAt: CLAIMED_AT,
      leaseExpiresAt: readAt - MINUTE,
      leaseRevokedAt: readAt - MINUTE,
    },
    {
      claimId: 'c-dana',
      workItemId: prime.id,
      stepId: 'step-dev',
      holder: holder('dana'),
      runId: null,
      parentClaimId: null,
      claimedAt: CLAIMED_AT,
      leaseExpiresAt: null,
      leaseRevokedAt: null,
    },
  ];
  /** Extra claims a case adds, answered beside the fixture's own. */
  const extra: ClaimFields[] = [];
  let claimsReads = 0;
  api.readClaims = async () => {
    claimsReads += 1;
    const readAt = Date.now();
    const byId = new Map(
      (await tree('p1')).workItems.map((row) => [row.id, { number: row.number, name: row.name }]),
    );
    const answered = [...claims(readAt), ...extra].filter(
      (claim) => only === undefined || only.includes(claim.claimId),
    );
    return {
      readAt,
      claims: answered.map((claim) => ({
        ...claim,
        number: byId.get(claim.workItemId)?.number ?? '999',
        numberIsFrozen: false,
        name: byId.get(claim.workItemId)?.name ?? 'Gone',
      })),
    };
  };
  return {
    api,
    ids: { strip: strip.id, paint: paint.id, sand: sand.id, prime: prime.id },
    extra,
    claimsReads: () => claimsReads,
  };
}
