import { describe, expect, it } from 'bun:test';

import type { DependencyEndpoint, EndpointContext } from './typed-dependency';
import {
  isRelationshipType,
  typedDependencyKeyOf,
  typedEndpointDefectOf,
} from './typed-dependency';

/** Parent `P` over leaf `L`, and a project with steps `dev` and `qa`. */
const context: EndpointContext = {
  isLeaf: (id) => (id === 'L' ? true : id === 'P' ? false : undefined),
  hasStep: (stepId) => stepId === 'dev' || stepId === 'qa',
};

describe('typedEndpointDefectOf', () => {
  it('accepts whole on either, node on a leaf and descendant-step on a parent', () => {
    const valid: DependencyEndpoint[] = [
      { scope: 'whole', workItemId: 'L' },
      { scope: 'whole', workItemId: 'P' },
      { scope: 'node', workItemId: 'L', stepId: 'dev' },
      { scope: 'descendant-step', workItemId: 'P', stepId: 'qa' },
    ];
    expect(valid.map((endpoint) => typedEndpointDefectOf(endpoint, context))).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('refuses a node on a parent and a descendant-step on a leaf', () => {
    expect(typedEndpointDefectOf({ scope: 'node', workItemId: 'P', stepId: 'dev' }, context)).toBe(
      'node_on_parent',
    );
    expect(
      typedEndpointDefectOf({ scope: 'descendant-step', workItemId: 'L', stepId: 'dev' }, context),
    ).toBe('descendant_step_on_leaf');
  });

  it('refuses an unknown work item and a step outside the project', () => {
    expect(typedEndpointDefectOf({ scope: 'whole', workItemId: 'X' }, context)).toBe('not_found');
    expect(
      typedEndpointDefectOf({ scope: 'node', workItemId: 'L', stepId: 'design' }, context),
    ).toBe('unknown_step');
  });

  it('leaves a stepless project whole scope only', () => {
    const stepless: EndpointContext = { ...context, hasStep: () => false };
    expect(typedEndpointDefectOf({ scope: 'whole', workItemId: 'L' }, stepless)).toBeNull();
    expect(typedEndpointDefectOf({ scope: 'node', workItemId: 'L', stepId: 'dev' }, stepless)).toBe(
      'unknown_step',
    );
  });
});

describe('typedDependencyKeyOf', () => {
  it('tells a whole endpoint from a node endpoint on the same work item', () => {
    const whole = typedDependencyKeyOf({
      predecessor: { scope: 'whole', workItemId: 'L' },
      successor: { scope: 'whole', workItemId: 'M' },
      type: 'FS',
    });
    const node = typedDependencyKeyOf({
      predecessor: { scope: 'node', workItemId: 'L', stepId: 'dev' },
      successor: { scope: 'whole', workItemId: 'M' },
      type: 'FS',
    });
    expect(whole).not.toBe(node);
  });
});

describe('isRelationshipType', () => {
  it('accepts FS and refuses the types this stage does not schedule', () => {
    expect(['FS', 'SS', 'FF', 'fs'].map(isRelationshipType)).toEqual([true, false, false, false]);
  });
});
