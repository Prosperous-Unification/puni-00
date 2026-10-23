/**
 * The fields every work-item page row carries (spec `list-reads`), besides the
 * row's own `updatedAt`, which is not a tree field.
 */
export const WORK_ITEM_OUTLINE = [
  'id',
  'projectId',
  'parentId',
  'number',
  'name',
  'status',
  'dates',
  'revision',
] as const;

/**
 * The field groups a work-item page adds only when `fields` names them. With
 * {@link WORK_ITEM_OUTLINE} they partition the whole-tree work item's fields,
 * which `work-item-fields.test.ts` checks against the tree schema, so a field
 * added to the tree later cannot become unreachable through a page. `slices`
 * is the one group that is not a tree field: it is the tree's slices of that
 * work item.
 *
 * Proof, observed 2026-09-29: dropping `doesEveryStep` from `constraints`
 * failed `the outline and the field groups partition the whole-tree work item`
 * (the tree field was missing); adding `name` to `notes` failed it on the
 * duplicate (39 names, 38 distinct).
 * Proof: dropping `charged` from `estimates` failed the partition test and
 * `includes native charges only when the estimates group is requested`:
 * the mounted page omitted the expected minute and workday charges.
 */
export const WORK_ITEM_FIELD_GROUPS = {
  notes: ['notes'],
  schedule: ['schedule', 'finalDays', 'finalTotal', 'dependsOn'],
  slices: ['slices'],
  estimates: [
    'estimates',
    'charged',
    'actuals',
    'measures',
    'measureEstimates',
    'progress',
    'rolledUp',
    'attempts',
    'spans',
    'span',
    'nodeReadings',
    'blockages',
    'blockageCauses',
  ],
  constraints: [
    // Proof: removal failed both mounted constraints-page parity assertions
    // while the outline still omitted the field; watched 2026-10-15.
    'nodeResources',
    'position',
    'frozenNumber',
    'startNoEarlierThan',
    'startNoEarlierThanReason',
    'deadline',
    'factStart',
    'factEnd',
    'readiness',
    'hold',
    'priority',
    'maxParallel',
    'doesEveryStep',
  ],
  labels: [
    'teamIds',
    'tagIds',
    'serviceIds',
    'typeIds',
    'externalRefs',
    'serviceTeamId',
    'serviceId',
    'assignees',
  ],
} as const;

export type WorkItemFieldGroup = keyof typeof WORK_ITEM_FIELD_GROUPS;

/** Whether `name` names a field group. */
export function isWorkItemFieldGroup(name: string): name is WorkItemFieldGroup {
  return Object.hasOwn(WORK_ITEM_FIELD_GROUPS, name);
}
