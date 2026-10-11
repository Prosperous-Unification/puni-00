import { expect, test } from 'bun:test';

import { WORK_ITEM_FIELD_GROUPS, WORK_ITEM_OUTLINE } from './work-item-fields';
import { numberedWorkItem } from './work-item-response';

/** Every field the whole-tree read answers for one work item, from its schema. */
function treeFields(): string[] {
  const schema: unknown = numberedWorkItem.toJsonSchema();
  if (typeof schema !== 'object' || schema === null || !('properties' in schema))
    throw new Error('the tree work item schema has no properties');
  const { properties } = schema;
  if (typeof properties !== 'object' || properties === null)
    throw new Error('the tree work item properties are not an object');
  return Object.keys(properties).sort();
}

test('the outline and the field groups partition the whole-tree work item', () => {
  const grouped = Object.values(WORK_ITEM_FIELD_GROUPS)
    .flat()
    .filter((field) => field !== 'slices');
  const named: string[] = [...WORK_ITEM_OUTLINE, ...grouped];
  expect(new Set(named).size).toBe(named.length);
  expect([...named].sort()).toEqual(treeFields());
});
