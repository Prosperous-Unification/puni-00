import { describe, expect, it } from 'bun:test';

import { resolveStepResources } from './node-resources';
import { resolveStepParallel } from './step-parallel';

const dev = { workItemId: 'leaf', stepId: 'dev' };
const qa = { workItemId: 'leaf', stepId: 'qa' };

describe('resolveStepParallel', () => {
  it('inherits Dev four while QA explicitly requests two', () => {
    expect(resolveStepParallel(dev, 4, undefined)).toEqual({ kind: 'inherited', maxParallel: 4 });
    expect(resolveStepParallel(qa, 4, { ...qa, maxParallel: 2 })).toEqual({
      kind: 'explicit',
      maxParallel: 2,
    });
  });

  it('retains explicit one when equal to the row default and after it becomes four', () => {
    const override = { ...dev, maxParallel: 1 };
    expect(resolveStepParallel(dev, 1, override)).toEqual({ kind: 'explicit', maxParallel: 1 });
    expect(resolveStepParallel(dev, 4, override)).toEqual({ kind: 'explicit', maxParallel: 1 });
  });

  it('refuses a fact belonging to another work item', () => {
    expect(() =>
      resolveStepParallel(dev, 4, { ...dev, workItemId: 'foreign', maxParallel: 2 }),
    ).toThrow();
  });

  it('refuses a fact belonging to another step', () => {
    expect(() => resolveStepParallel(dev, 4, { ...qa, maxParallel: 2 })).toThrow();
  });

  for (const invalid of [0, 1001, 1.5, NaN, Infinity, -Infinity]) {
    it(`refuses inherited row maximum ${String(invalid)}`, () => {
      expect(() => resolveStepParallel(dev, invalid, undefined)).toThrow();
    });
    it(`refuses row maximum ${String(invalid)} despite a valid override`, () => {
      expect(() => resolveStepParallel(dev, invalid, { ...dev, maxParallel: 2 })).toThrow();
    });
    it(`refuses override maximum ${String(invalid)}`, () => {
      expect(() => resolveStepParallel(dev, 4, { ...dev, maxParallel: invalid })).toThrow();
    });
  }

  it('accepts both inclusive bounds as inherited and explicit maxima', () => {
    for (const maxParallel of [1, 1000]) {
      expect(resolveStepParallel(dev, maxParallel, undefined)).toEqual({
        kind: 'inherited',
        maxParallel,
      });
      expect(resolveStepParallel(dev, 4, { ...dev, maxParallel })).toEqual({
        kind: 'explicit',
        maxParallel,
      });
    }
  });

  it('reads an override getter once and returns exactly the validated maximum', () => {
    let reads = 0;
    const override = {
      ...dev,
      get maxParallel() {
        reads += 1;
        return reads === 1 ? 2 : 1001;
      },
    };
    const resolved = resolveStepParallel(dev, 4, override);
    expect(resolved).toEqual({ kind: 'explicit', maxParallel: 2 });
    expect(reads).toBe(1);
  });

  it('detaches the resolved maximum from the supplied mutable fact', () => {
    const override = { ...dev, maxParallel: 2 };
    const resolved = resolveStepParallel(dev, 4, override);
    override.maxParallel = 8;
    override.workItemId = 'foreign';
    expect(resolved).toEqual({ kind: 'explicit', maxParallel: 2 });
  });

  it('composes with named-person, narrowest-pool and unsized-team resource rules', () => {
    const sizes = new Map([
      ['wide', 8],
      ['narrow', 3],
    ]);
    const inherited = resolveStepParallel(dev, 4, undefined);
    const explicit = resolveStepParallel(qa, 4, { ...qa, maxParallel: 2 });
    expect(
      resolveStepResources(inherited.maxParallel, 'dev', {}, ['wide', 'narrow'], sizes).width,
    ).toBe(3);
    expect(
      resolveStepResources(explicit.maxParallel, 'qa', {}, ['wide', 'narrow'], sizes).width,
    ).toBe(2);
    expect(
      resolveStepResources(explicit.maxParallel, 'qa', { qa: 'ada' }, ['wide'], sizes).width,
    ).toBe(1);
    expect(
      resolveStepResources(inherited.maxParallel, 'dev', {}, ['unsized'], sizes),
    ).toMatchObject({ width: 4, poolIds: [] });
  });
});
