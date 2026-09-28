import { describe, expect, it } from 'bun:test';

import type { DependencyEndpoint, EndpointContext } from './typed-dependency';
import {
  findTypedEndpointDefect,
  formatTypedDependencyKey,
  isRelationshipType,
  isWritableRelationshipType,
} from './typed-dependency';

/** Parent `P` over leaf `L`, and a project with steps `dev` and `qa`. */
const context: EndpointContext = {
  isLeaf: (id) => (id === 'L' ? true : id === 'P' ? false : undefined),
  hasStep: (stepId) => stepId === 'dev' || stepId === 'qa',
};

describe('findTypedEndpointDefect', () => {
  it('accepts whole on either, node on a leaf and descendant-step on a parent', () => {
    const valid: DependencyEndpoint[] = [
      { scope: 'whole', workItemId: 'L' },
      { scope: 'whole', workItemId: 'P' },
      { scope: 'node', workItemId: 'L', stepId: 'dev' },
      { scope: 'descendant-step', workItemId: 'P', stepId: 'qa' },
    ];
    expect(valid.map((endpoint) => findTypedEndpointDefect(endpoint, context))).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('refuses a node on a parent and a descendant-step on a leaf', () => {
    expect(
      findTypedEndpointDefect({ scope: 'node', workItemId: 'P', stepId: 'dev' }, context),
    ).toBe('node_on_parent');
    expect(
      findTypedEndpointDefect(
        { scope: 'descendant-step', workItemId: 'L', stepId: 'dev' },
        context,
      ),
    ).toBe('descendant_step_on_leaf');
  });

  it('refuses an unknown work item and a step outside the project', () => {
    expect(findTypedEndpointDefect({ scope: 'whole', workItemId: 'X' }, context)).toBe('not_found');
    expect(
      findTypedEndpointDefect({ scope: 'node', workItemId: 'L', stepId: 'design' }, context),
    ).toBe('unknown_step');
  });

  it('leaves a stepless project whole scope only', () => {
    const stepless: EndpointContext = { ...context, hasStep: () => false };
    expect(findTypedEndpointDefect({ scope: 'whole', workItemId: 'L' }, stepless)).toBeNull();
    expect(
      findTypedEndpointDefect({ scope: 'node', workItemId: 'L', stepId: 'dev' }, stepless),
    ).toBe('unknown_step');
  });
});

describe('formatTypedDependencyKey', () => {
  it('tells a whole endpoint from a node endpoint on the same work item', () => {
    const whole = formatTypedDependencyKey({
      predecessor: { scope: 'whole', workItemId: 'L' },
      successor: { scope: 'whole', workItemId: 'M' },
      type: 'FS',
    });
    const node = formatTypedDependencyKey({
      predecessor: { scope: 'node', workItemId: 'L', stepId: 'dev' },
      successor: { scope: 'whole', workItemId: 'M' },
      type: 'FS',
    });
    expect(whole).not.toBe(node);
  });
});

describe('isRelationshipType', () => {
  it('recognizes all readable types while writes remain FS only', () => {
    expect(['FS', 'SS', 'FF', 'fs'].map(isRelationshipType)).toEqual([true, true, true, false]);
    expect(['FS', 'SS', 'FF', 'fs'].map(isWritableRelationshipType)).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });
});
