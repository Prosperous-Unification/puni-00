import { describe, expect, it } from 'bun:test';

import { planTestCollection } from './test-collection';

describe('test collection plan', () => {
  it('binds a nonempty run to its discovery inputs', () => {
    expect(
      planTestCollection({
        target: 'wbs-fe-01:test:view:level',
        level: 'view',
        files: ['apps/wbs/fe-01/src/board.test.tsx'],
        discoveryInputs: ['apps/wbs/fe-01/vitest.view.config.ts'],
      }),
    ).toEqual({
      kind: 'run',
      target: 'wbs-fe-01:test:view:level',
      level: 'view',
      files: ['apps/wbs/fe-01/src/board.test.tsx'],
      discoveryInputs: ['apps/wbs/fe-01/vitest.view.config.ts'],
    });
  });

  it('returns explicit no-cases for an empty Performance suite', () => {
    expect(
      planTestCollection({
        target: 'wbs-fe-01:test:performance:level',
        level: 'performance',
        files: [],
        discoveryInputs: ['apps/wbs/fe-01/playwright.config.ts'],
        noCasesReason: 'no performance fixtures declare thresholds',
      }),
    ).toEqual({
      kind: 'no-cases',
      target: 'wbs-fe-01:test:performance:level',
      level: 'performance',
      discoveryInputs: ['apps/wbs/fe-01/playwright.config.ts'],
      reason: 'no performance fixtures declare thresholds',
    });
  });

  it('refuses an empty collection without a reason and malformed discovery', () => {
    expect(() =>
      planTestCollection({
        target: 'a:test',
        level: 'api',
        files: [],
        discoveryInputs: ['a/config'],
      }),
    ).toThrow('no-cases reason');
    expect(() =>
      planTestCollection({
        target: 'a:test',
        level: 'api',
        files: ['a/test.ts'],
        discoveryInputs: [],
      }),
    ).toThrow('discovery input');
  });
});
