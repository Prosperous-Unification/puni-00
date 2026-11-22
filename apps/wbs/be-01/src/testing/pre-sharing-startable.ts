import { responseSchema } from '@wbs/contracts';
import { type } from 'arktype';

const person = type({ personId: 'string', name: 'string' });
const address = {
  workItemId: 'string',
  number: 'string',
  numberIsFrozen: 'boolean',
  name: 'string',
} as const;
const leafSteps = {
  ...address,
  stepIds: 'string[]',
  assignees: type({ stepId: 'string', personId: 'string', name: 'string' }).array(),
  teams: type({ teamId: 'string', name: 'string', fromId: 'string' }).array(),
  unfinishedPredecessorIds: 'string[]',
  subtreeClaim: type({
    claimId: 'string',
    workItemId: 'string',
    holder: person,
    runId: 'string | null',
    parentClaimId: 'string | null',
  }).or('null'),
} as const;
// `fits`, `doesNotFit`, `resources` and `occupancyScope` (`wbs-resources` R6)
// are optional on the wire although this release always sends them: mid-swap a
// new fe-01 or MCP client is answered by an outgoing be-01 that knows no fit.
// be-01's own answer is held to them by startable-organization.controller.db.test.ts.
const startableLeaf = type({ ...leafSteps, 'fits?': 'true' });
const unfitLeaf = type({
  ...leafSteps,
  fits: 'false',
  exhausted: type({
    resourceId: 'string',
    name: 'string',
    unitLabel: 'string',
    asked: 'number',
    free: 'number',
    shortfall: 'number',
  }),
});
const resourceFree = type({
  resourceId: 'string',
  name: 'string',
  unitLabel: 'string',
  kind: "'exclusive' | 'divisible'",
  capacity: 'number',
  occupied: 'number',
  free: 'number',
});
const claimedStep = type({
  ...address,
  stepId: 'string',
  claimId: 'string',
  holder: person,
  assignee: person.or('null'),
  runId: 'string | null',
  parentClaimId: 'string | null',
  claimedAt: 'number',
  leaseExpiresAt: 'number | null',
});
const heldSubtree = type({
  ...address,
  claimId: 'string',
  holder: person,
  runId: 'string | null',
  parentClaimId: 'string | null',
  claimedAt: 'number',
  leaseExpiresAt: 'number | null',
});

/** The 200 response declaration from startable-shapes.ts at Git blob 24592c61. */
export const preSharingStartable = responseSchema(
  type({
    leaves: startableLeaf.array(),
    'doesNotFit?': unfitLeaf.array(),
    claimed: claimedStep.array(),
    subtreeClaims: heldSubtree.array(),
    'resources?': resourceFree.array(),
    'occupancyScope?': "'project'",
  }),
);
