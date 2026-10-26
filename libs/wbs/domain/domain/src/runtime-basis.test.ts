import { describe, expect, it } from 'bun:test';

import { describeRuntimeBasis, type RuntimeBasisInput } from './runtime-basis';

const basis: RuntimeBasisInput = {
  ledgerId: 'ledger-a',
  organizationId: 'org-a',
  projectId: 'project-a',
  projectRevision: 2,
  workItems: [
    { id: 'b', revision: 4 },
    { id: 'a', revision: 3 },
  ],
};

describe('runtime basis bytes', () => {
  it('pins every identity and revision in binary id order without mutating rows', () => {
    const rows = structuredClone(basis.workItems);
    expect(describeRuntimeBasis(basis)).toBe(
      '["wbs-runtime-basis",1,"ledger-a","org-a","project-a",2,[["a",3],["b",4]]]',
    );
    expect(basis.workItems).toEqual(rows);
    expect(describeRuntimeBasis({ ...basis, workItems: [...rows].reverse() })).toBe(
      describeRuntimeBasis(basis),
    );
    expect(
      describeRuntimeBasis({
        ...basis,
        workItems: [
          { id: 'a', revision: 1 },
          { id: 'Z', revision: 0 },
        ],
      }),
    ).toContain('[["Z",0],["a",1]]');
  });

  it.each([
    { ledgerId: 'ledger-b' },
    { organizationId: 'org-b' },
    { projectId: 'project-b' },
    { projectRevision: 3 },
    {
      workItems: [
        { id: 'b', revision: 5 },
        { id: 'a', revision: 3 },
      ],
    },
    {
      workItems: [
        { id: 'c', revision: 4 },
        { id: 'a', revision: 3 },
      ],
    },
    { workItems: [{ id: 'a', revision: 3 }] },
    { workItems: [] },
  ])('changes when a covered identity, counter or member changes: %j', (change) => {
    expect(describeRuntimeBasis({ ...basis, ...change })).not.toBe(describeRuntimeBasis(basis));
  });

  it.each([
    { ledgerId: '' },
    { organizationId: '' },
    { projectId: '' },
    { ledgerId: undefined },
    { organizationId: undefined },
    { projectId: undefined },
    { projectRevision: undefined },
    { projectRevision: -1 },
    { projectRevision: 0.5 },
    { projectRevision: Number.MAX_SAFE_INTEGER + 1 },
    { projectRevision: NaN },
    { workItems: undefined },
    { workItems: new Array(1) },
    { workItems: [undefined] },
    { workItems: [null] },
    { workItems: [{ id: '', revision: 0 }] },
    { workItems: [{ revision: 0 }] },
    { workItems: [{ id: 'a' }] },
    { workItems: [{ id: 'a', revision: -1 }] },
    { workItems: [{ id: 'a', revision: 0.5 }] },
    { workItems: [{ id: 'a', revision: Number.MAX_SAFE_INTEGER + 1 }] },
    {
      workItems: [
        { id: 'a', revision: 0 },
        { id: 'a', revision: 1 },
      ],
    },
  ])('throws for malformed trusted basis: %j', (change) => {
    expect(() => describeRuntimeBasis({ ...basis, ...change } as RuntimeBasisInput)).toThrow();
  });
});
