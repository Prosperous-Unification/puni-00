import { expect, test } from 'bun:test';

import { validateSchema } from './schema-shape';
import { readStartableWork } from './startable-shapes';

const leaf = {
  workItemId: 'w',
  number: '010',
  numberIsFrozen: false,
  name: 'Build',
  stepIds: ['dev'],
  assignees: [],
  teams: [],
  unfinishedPredecessorIds: [],
  subtreeClaim: null,
};

// Proof: with `doesNotFit`, `resources`, `occupancyScope` and the leaf's `fits`
// required, the outgoing answer below was refused; watched 2026-10-20.
test('reads a startable answer from a release that knows no fit, as mid-swap', async () => {
  const startable = readStartableWork.responses[0].schema;
  const outgoing = { leaves: [leaf], claimed: [], subtreeClaims: [] };
  expect(await validateSchema(startable, outgoing)).toEqual({ value: outgoing });
});

test('reads the fit fields and refuses a leaf apart that claims to fit', async () => {
  const startable = readStartableWork.responses[0].schema;
  const exhausted = {
    resourceId: 'ram',
    name: 'h2puni ram',
    unitLabel: 'GB',
    asked: 8,
    free: 4,
    shortfall: 4,
  };
  const current = {
    leaves: [{ ...leaf, fits: true as const }],
    doesNotFit: [{ ...leaf, workItemId: 'b', fits: false as const, exhausted }],
    claimed: [],
    subtreeClaims: [],
    resources: [
      {
        resourceId: 'ram',
        name: 'h2puni ram',
        unitLabel: 'GB',
        kind: 'divisible' as const,
        capacity: 8,
        occupied: 4,
        free: 4,
      },
    ],
    occupancyScope: 'project' as const,
  };
  expect(await validateSchema(startable, current)).toEqual({ value: current });
  const contradicted = {
    ...current,
    doesNotFit: [{ ...leaf, workItemId: 'b', fits: true, exhausted }],
  };
  expect(await validateSchema(startable, contradicted)).not.toEqual({ value: contradicted });
});
