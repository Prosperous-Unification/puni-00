import { describe, expect, it } from 'bun:test';

import {
  type AddressSpace,
  describeAddressSpace,
  formatStepReference,
  parseStepReference,
  resolveStepReference,
} from './step-reference';

const space: AddressSpace = {
  workItems: [
    { id: 'w-010', number: '010', isLeaf: true },
    { id: 'w-020', number: '020', isLeaf: false },
    { id: 'w-020-2', number: '020.2', isLeaf: true },
  ],
  steps: [
    { id: 's-qa', code: 'qa', position: 20 },
    { id: 's-dev', code: 'dev', position: 10 },
    { id: 's-review', code: 'review', position: 30 },
    { id: 's-old', code: null, position: 40 },
  ],
};

function resolve(reference: string) {
  return resolveStepReference(reference, space);
}

describe('formatStepReference', () => {
  it('spells a node as its work item number, a dot and its step code', () => {
    expect(formatStepReference('020.2', 'review')).toBe('020.2.review');
  });
});

describe('parseStepReference', () => {
  it('splits at the last dot, because a code holds none', () => {
    expect(parseStepReference('020.2.review')).toEqual({
      number: '020.2',
      ordinal: null,
      code: 'review',
    });
  });

  it('reads the ordinal alias', () => {
    expect(parseStepReference('010.s1-dev')).toEqual({ number: '010', ordinal: 1, code: 'dev' });
  });

  it('refuses what is not a reference', () => {
    for (const bad of [
      '010',
      '.dev',
      '010.',
      '010.Dev',
      '010.2dev',
      '010.s0-dev',
      '010.s1',
      '010.s1-',
    ]) {
      expect(parseStepReference(bad)).toBeNull();
    }
  });
});

describe('resolveStepReference', () => {
  it('resolves a canonical reference to its step node', () => {
    expect(resolve('010.dev')).toEqual({
      ok: true,
      ref: { workItemId: 'w-010', stepId: 's-dev' },
      reference: '010.dev',
    });
  });

  it('resolves a nested number', () => {
    expect(resolve('020.2.review')).toEqual({
      ok: true,
      ref: { workItemId: 'w-020-2', stepId: 's-review' },
      reference: '020.2.review',
    });
  });

  it('accepts the ordinal alias when position and code agree, and answers the canonical spelling', () => {
    expect(resolve('010.s2-qa')).toEqual({
      ok: true,
      ref: { workItemId: 'w-010', stepId: 's-qa' },
      reference: '010.qa',
    });
  });

  it('refuses an alias whose position names another step', () => {
    expect(resolve('010.s2-dev')).toEqual({ ok: false, reason: 'alias_mismatch' });
    expect(resolve('010.s9-dev')).toEqual({ ok: false, reason: 'alias_mismatch' });
  });

  it('refuses an unknown number, an unknown code and a parent', () => {
    expect(resolve('030.dev')).toEqual({ ok: false, reason: 'unknown_work_item' });
    expect(resolve('010.design')).toEqual({ ok: false, reason: 'unknown_code' });
    expect(resolve('020.dev')).toEqual({ ok: false, reason: 'parent' });
  });

  it('refuses a malformed reference', () => {
    expect(resolve('010')).toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('describeAddressSpace', () => {
  it('is the same for the same addresses, whatever order they are listed in', () => {
    const reversed: AddressSpace = {
      workItems: [...space.workItems].reverse(),
      steps: [...space.steps].reverse(),
    };
    expect(describeAddressSpace('p', reversed)).toBe(describeAddressSpace('p', space));
  });

  it('changes when a number, a leafhood, a code or a step position changes', () => {
    const base = describeAddressSpace('p', space);
    const renumbered = {
      ...space,
      workItems: space.workItems.map((each) =>
        each.id === 'w-010' ? { ...each, number: '030' } : each,
      ),
    };
    const handedDown = {
      ...space,
      workItems: space.workItems.map((each) =>
        each.id === 'w-010' ? { ...each, isLeaf: false } : each,
      ),
    };
    const coded = {
      ...space,
      steps: space.steps.map((each) => (each.id === 's-old' ? { ...each, code: 'old' } : each)),
    };
    const reordered = {
      ...space,
      steps: space.steps.map((each) => (each.id === 's-dev' ? { ...each, position: 25 } : each)),
    };
    for (const changed of [renumbered, handedDown, coded, reordered]) {
      expect(describeAddressSpace('p', changed)).not.toBe(base);
    }
  });

  it('refuses two work items holding one number', () => {
    const clash = {
      ...space,
      workItems: [...space.workItems, { id: 'w-dup', number: '010', isLeaf: true }],
    };
    expect(() => describeAddressSpace('p', clash)).toThrow('number 010 is held by');
  });
});
