import { describe, expect, test } from 'bun:test';

import { chooseWaiter, jobTypeDescriptor, vectorFits } from './host-pool';

const allocatable = { cpuCores: 8, memoryGib: 13, diskUnits: 4, workspaceSlots: 4 };
const none = { cpuCores: 0, memoryGib: 0, diskUnits: 0, workspaceSlots: 0 };

describe('vectorFits', () => {
  test('fits at the boundary of every dimension and not one unit past it', () => {
    expect(vectorFits(allocatable, none, allocatable)).toBe(true);
    for (const dimension of ['cpuCores', 'memoryGib', 'diskUnits', 'workspaceSlots'] as const)
      expect(vectorFits({ ...none, [dimension]: 1 }, allocatable, allocatable)).toBe(false);
  });
});

describe('chooseWaiter', () => {
  const waiter = (sequence: number, overtakes = 0, fits = true) => ({ sequence, overtakes, fits });
  const fit = (candidate: { fits: boolean }): boolean => candidate.fits;

  test('serves the oldest waiter that fits', () => {
    expect(chooseWaiter([waiter(1, 0, false), waiter(2), waiter(3)], fit)?.sequence).toBe(2);
  });

  test('a waiter overtaken three times bars every younger waiter', () => {
    expect(chooseWaiter([waiter(1, 3, false), waiter(2)], fit)).toBeNull();
    expect(chooseWaiter([waiter(1, 2, false), waiter(2)], fit)?.sequence).toBe(2);
  });

  test('the oldest of several barriers applies; an older waiter still passes', () => {
    expect(chooseWaiter([waiter(1), waiter(2, 3, false), waiter(3, 3)], fit)?.sequence).toBe(1);
    expect(chooseWaiter([waiter(1, 0, false), waiter(2, 3, false), waiter(3, 3)], fit)).toBeNull();
  });
});

describe('jobTypeDescriptor', () => {
  test('refuses a container value that is neither none nor a bound', () => {
    const base = {
      id: 'gate',
      envelope: { cpuCores: 4, memoryGib: 6, tmpDiskGib: 8, exclusive: ['gate_tree'] },
      enforcement: 'observe',
    };
    expect(jobTypeDescriptor.allows({ ...base, containers: 'none' })).toBe(true);
    expect(jobTypeDescriptor.allows({ ...base, containers: { memoryGib: 1, cpuCores: 1 } })).toBe(
      true,
    );
    expect(jobTypeDescriptor.allows({ ...base, containers: 'unbounded' })).toBe(false);
    expect(jobTypeDescriptor.allows({ ...base, containers: { memoryGib: 1 } })).toBe(false);
  });
});
