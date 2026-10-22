import { describe, expect, it } from 'bun:test';

import { sharedPersonRequest, verifyImageSolverResponse } from './solver-image-scenario';

describe('shared-person solver image scenario', () => {
  it('builds the exact booking and a later feasible baseline through production builders', () => {
    const request = sharedPersonRequest();
    expect(request.elsewhere).toEqual({ ana: [[0, 49]] });
    expect(request.slices).toHaveLength(1);
    expect(request.slices[0]?.personId).toBe('ana');
    expect(Object.values(request.baselineOffsets)).toEqual([49]);
  });

  it('requires a publishing answer for the exact shared request', () => {
    const request = sharedPersonRequest();
    expect(() => {
      verifyImageSolverResponse(
        request,
        '{"wireVersion":5,"scope":{"kind":"local"},"status":"unknown"}\n',
      );
    }).toThrow('not feasible');
    expect(() => {
      verifyImageSolverResponse(
        request,
        '{"wireVersion":5,"scope":{"kind":"local"},"status":"infeasible"}\n',
      );
    }).toThrow('not feasible');
    const responseAt = (start: number) =>
      JSON.stringify({
        wireVersion: 5,
        scope: { kind: 'local' },
        status: 'feasible',
        offsets: { [request.slices[0].key]: start },
        objectiveValues: {
          makespan: { value: start + 48, stageValue: null, bound: null, status: 'feasible' },
          priority: { value: 0, stageValue: null, bound: null, status: 'feasible' },
          movement: {
            value: Math.abs(start - 49),
            stageValue: null,
            bound: null,
            status: 'feasible',
          },
        },
      });
    expect(() => {
      verifyImageSolverResponse(request, `${responseAt(0)}\n`);
    }).toThrow('assignee-double-booked');
    expect(() => {
      verifyImageSolverResponse(request, `${responseAt(49)}\n`);
    }).not.toThrow();
  });
});
