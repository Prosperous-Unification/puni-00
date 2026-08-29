import { PLAN_COMMAND_KINDS, type PlanCommandKind } from '../service/plan-command';

type Schema = Record<string, unknown>;

const id = (description: string): Schema => ({ type: 'string', description });
const ref = (description: string): Schema => ({
  type: 'string',
  description: `${description} — the \`ref\` an earlier command in this batch gave it.`,
});
const nullableId = (description: string): Schema => ({
  type: 'string',
  nullable: true,
  description,
});
const target: Record<string, Schema> = {
  workItemId: id('The work item this command is aimed at.'),
  workItemRef: ref('The work item this command is aimed at'),
};
const step = { stepId: id('The step (step) this figure belongs to.') };
const DAYS: Schema = {
  type: 'object',
  description: 'A three-point estimate in workdays.',
  properties: {
    optimistic: { type: 'number' },
    realistic: { type: 'number' },
    pessimistic: { type: 'number' },
  },
  required: ['optimistic', 'realistic', 'pessimistic'],
};
const cascade = {
  cascade: {
    type: 'boolean',
    description:
      'Take the labels or memberships that use it off as well. Absent refuses an entry still in use.',
  },
};

function variant(
  kind: PlanCommandKind,
  description: string,
  properties: Record<string, Schema>,
  required: readonly string[] = [],
): Schema {
  return {
    type: 'object',
    title: kind,
    description,
    properties: { kind: { type: 'string', enum: [kind] }, ...properties },
    required: ['kind', ...required],
  };
}

const VARIANTS: Schema[] = [
  variant('createWorkItem', 'Add a work item. `ref` names it for the rest of this batch.', {
    ref: id('A name for the new work item, usable by later commands in this batch.'),
    parentId: nullableId('The work item it goes under. Null or absent puts it at the top level.'),
    parentRef: ref('The work item it goes under'),
    afterId: nullableId(
      'The sibling it is placed after. Null or absent puts it first in its group.',
    ),
    afterRef: ref('The sibling it is placed after'),
    name: id('Its name. Absent leaves it unnamed.'),
    notes: id('Free text shown on the row.'),
    priority: {
      type: 'integer',
      nullable: true,
      description:
        'Its priority: a whole number ≥ 1, or null to create it unprioritised. Absent takes the project’s middle band’s default.',
    },
  }),
  variant(
    'patchWorkItem',
    'Change fields of a work item; only the fields named change.',
    {
      ...target,
      patch: {
        type: 'object',
        description:
          'Any of: name, notes, startNoEarlierThan (ISO date or null), startNoEarlierThanReason, priority (whole number ≥ 1 or null), teamIds, tagIds, serviceIds (ids), teamRefs, tagRefs, serviceRefs (refs from this batch), maxParallel. Never number or frozenNumber — those are derived.',
      },
    },
    ['patch'],
  ),
  variant('moveWorkItem', 'Move a work item under a parent, after a sibling.', {
    ...target,
    parentId: nullableId('The new parent, or null for the top level.'),
    parentRef: ref('The new parent'),
    afterId: nullableId('The sibling it lands after, or null for first.'),
    afterRef: ref('The sibling it lands after'),
  }),
  variant('duplicateWorkItem', 'Copy a work item with its whole subtree, placed right after it.', {
    ...target,
    ref: id('A name for the copy, usable by later commands in this batch.'),
  }),
  variant(
    'deleteWorkItem',
    'Remove a work item. A parent needs a strategy: cascade its children or promote them.',
    {
      ...target,
      strategy: { type: 'string', enum: ['cascade', 'promote'] },
    },
  ),
  variant(
    'setEstimate',
    'Set the three-point estimate of one step on a leaf work item.',
    { ...target, ...step, days: DAYS },
    ['stepId', 'days'],
  ),
  variant('clearEstimate', 'Remove one step’s estimate from a work item.', { ...target, ...step }, [
    'stepId',
  ]),
  variant(
    'setActual',
    'Record the days one step actually took on a work item.',
    { ...target, ...step, days: { type: 'number' } },
    ['stepId', 'days'],
  ),
  variant('clearActual', 'Remove one step’s actual from a work item.', { ...target, ...step }, [
    'stepId',
  ]),
  variant(
    'setProgress',
    'Mark one step of a work item in progress or done.',
    { ...target, ...step, state: { type: 'string', enum: ['in_progress', 'done'] } },
    ['stepId', 'state'],
  ),
  variant('clearProgress', 'Take a step back to not started.', { ...target, ...step }, ['stepId']),
  variant(
    'setMeasure',
    'Record a measured figure (tokens, hours…) for one step of a work item.',
    {
      ...target,
      ...step,
      metric: id('The metric, e.g. tokens or hours.'),
      value: { type: 'number' },
    },
    ['stepId', 'metric', 'value'],
  ),
  variant(
    'clearMeasure',
    'Remove one measured figure.',
    { ...target, ...step, metric: id('The metric.') },
    ['stepId', 'metric'],
  ),
  variant(
    'setAssignee',
    'Name who does one step of a work item, or null to unassign.',
    {
      ...target,
      ...step,
      personId: nullableId('The person, or null.'),
      personRef: ref('The person'),
    },
    ['stepId'],
  ),
  variant('addDependency', 'Make a work item wait for another.', {
    ...target,
    predecessorId: id('The work item it waits for.'),
    predecessorRef: ref('The work item it waits for'),
  }),
  variant('removeDependency', 'Stop a work item waiting for another.', {
    ...target,
    predecessorId: id('The predecessor.'),
    predecessorRef: ref('The predecessor'),
  }),
  variant('freezeProject', 'Freeze every work item number as it stands.', {}),
  variant('unfreezeProject', 'Let every number follow the tree again.', {}),
  variant('unfreezeWorkItem', 'Let one work item’s number follow the tree again.', target),
  variant(
    'setCapacity',
    'How many of a team may be at work at once on this project; null means unstated.',
    {
      teamId: id('The team.'),
      teamRef: ref('The team'),
      size: { type: 'integer', nullable: true },
    },
    ['size'],
  ),
  variant(
    'setPriorityBands',
    'Replace this project’s priority ladder.',
    { bands: { type: 'array', items: { type: 'object' } } },
    ['bands'],
  ),
  variant(
    'createTeam',
    'Add a team to the directory.',
    {
      ref: id('A name for the team, usable by later commands in this batch.'),
      name: id('The team’s name.'),
    },
    ['name'],
  ),
  variant(
    'patchTeam',
    'Rename a team or change the services it owns.',
    {
      teamId: id('The team.'),
      teamRef: ref('The team'),
      patch: { type: 'object', description: 'name and/or serviceIds.' },
    },
    ['patch'],
  ),
  variant('deleteTeam', 'Remove a team from the directory.', {
    teamId: id('The team.'),
    teamRef: ref('The team'),
    ...cascade,
  }),
  variant(
    'createPerson',
    'Add a person to the directory.',
    {
      ref: id('A name for the person, usable by later commands in this batch.'),
      name: id('The person’s name.'),
      teamIds: { type: 'array', items: { type: 'string' } },
      teamRefs: { type: 'array', items: { type: 'string' } },
    },
    ['name'],
  ),
  variant(
    'patchPerson',
    'Rename a person, change their teams or their kind.',
    {
      personId: id('The person.'),
      personRef: ref('The person'),
      patch: { type: 'object', description: 'name, teamIds and/or kind.' },
    },
    ['patch'],
  ),
  variant('deletePerson', 'Remove a person from the directory.', {
    personId: id('The person.'),
    personRef: ref('The person'),
    ...cascade,
  }),
  variant(
    'createTag',
    'Add a tag to the directory.',
    {
      ref: id('A name for the tag, usable by later commands in this batch.'),
      name: id('The tag.'),
    },
    ['name'],
  ),
  variant(
    'patchTag',
    'Rename a tag.',
    { tagId: id('The tag.'), tagRef: ref('The tag'), name: id('Its new name.') },
    ['name'],
  ),
  variant('deleteTag', 'Remove a tag from the directory.', {
    tagId: id('The tag.'),
    tagRef: ref('The tag'),
    ...cascade,
  }),
  variant(
    'createService',
    'Add a service to the directory.',
    {
      ref: id('A name for the service, usable by later commands in this batch.'),
      name: id('The service.'),
    },
    ['name'],
  ),
  variant(
    'patchService',
    'Rename a service.',
    { serviceId: id('The service.'), serviceRef: ref('The service'), name: id('Its new name.') },
    ['name'],
  ),
  variant('deleteService', 'Remove a service from the directory.', {
    serviceId: id('The service.'),
    serviceRef: ref('The service'),
    ...cascade,
  }),
];

if (VARIANTS.length !== PLAN_COMMAND_KINDS.length) {
  throw new Error(
    `the commands document describes ${String(VARIANTS.length)} kinds; the API has ${String(PLAN_COMMAND_KINDS.length)}`,
  );
}

/**
 * The request body of `POST /api/projects/{id}/commands`, as the OpenAPI
 * document shows it — and therefore exactly what mcp-01's `commands` tool shows
 * a model (mcp-server D5). One variant per {@link PlanCommandKind}, checked
 * against the kinds at module load so a kind added to the API without a
 * sentence here refuses to boot rather than shipping undescribed.
 */
export const PLAN_COMMANDS_BODY: Schema = {
  type: 'object',
  properties: {
    commands: {
      type: 'array',
      maxItems: 200,
      description:
        'The commands, in order. Later commands may name what earlier ones created by `ref`. Applied all or none.',
      items: { oneOf: VARIANTS, discriminator: { propertyName: 'kind' } },
    },
  },
  required: ['commands'],
};
