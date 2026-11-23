import { readSpaceRollUps } from '@wbs/contracts';
import {
  bindCatalogueStep,
  createProject,
  listStepCatalogue,
  readWorkPackage,
} from '@wbs/contracts';

import type { Answer, OrganizationHarness } from './organization-harness';

/**
 * Maps fixture package addresses to their actual engagement parents. An absent package address
 * is an intentionally unknown/project request ID; a present package with a broken parent throws.
 * This is test request construction, never an authority or production compatibility adapter.
 */
export function readProjectIds(harness: OrganizationHarness, addresses: string): string {
  return addresses
    .split(',')
    .map((address) => {
      const row = harness.sqlite
        .query<{ project_id: unknown; parent_id: unknown }, [string]>(
          'SELECT wp.project_id,parent.id AS parent_id FROM work_package wp LEFT JOIN project parent ON parent.id=wp.project_id WHERE wp.id=?',
        )
        .get(address);
      if (row === null) return address;
      if (
        typeof row.project_id !== 'string' ||
        row.project_id === '' ||
        row.parent_id !== row.project_id
      )
        throw new Error('fixture package parent is absent or malformed');
      return row.project_id;
    })
    .join(',');
}

/**
 * Existing package schedule assertions consume only their subject figures after validating the
 * actual grouped HTTP reply. New project tests assert the raw wire groups separately. Refusals
 * retain their exact status/body. No production route or client emits this test-only projection.
 */
export async function readPackageFigures(pending: Promise<Answer>): Promise<Answer> {
  const answer = await pending;
  if (answer.status !== 200) return answer;
  const checked = await readSpaceRollUps.responses[0].schema.validator['~standard'].validate(
    answer.body,
  );
  if (checked.issues !== undefined)
    throw new Error('invalid grouped project rollup fixture reply', { cause: checked.issues });
  const rollUps = Object.fromEntries(
    checked.value.projects.flatMap((group) =>
      group.workPackages.map((child) => [child.workPackage.id, child.rollUp]),
    ),
  );
  return { ...answer, body: { rollUps } };
}

/** Preserves ordinary fixture requests and projects only the current grouped roll-up surface. */
export function readSpaceFigures(pending: Promise<Answer>, route: string): Promise<Answer> {
  return new URL(route, 'http://fixture.test').pathname.endsWith('/roll-ups')
    ? readPackageFigures(pending)
    : pending;
}

/** Uses the real harness call, preserving identity/method/body for every retained scheduling test. */
export function readSpaceReply(
  harness: OrganizationHarness,
  ...request: Parameters<OrganizationHarness['call']>
): Promise<Answer> {
  return readSpaceFigures(harness.call(...request), request[2]);
}

/** Validates the mounted Work Package read after fixture Project bindings have been written. */
export async function readFixturePackage(
  harness: OrganizationHarness,
  username: string,
  id: string,
) {
  const answer = await harness.call(username, 'GET', `/api/work-packages/${id}`);
  if (answer.status !== 200)
    throw new Error('fixture work package read refused', { cause: answer });
  const checked = await readWorkPackage.responses[0].schema.validator['~standard'].validate(
    answer.body,
  );
  if (checked.issues !== undefined)
    throw new Error('fixture work package reply malformed', { cause: checked.issues });
  return checked.value;
}

/** Creates an actual engagement/package and explicitly installs the fixture's two catalogue steps. */
export async function createFixturePackage(
  harness: OrganizationHarness,
  username: string,
  name: string,
  send: (method: string, route: string, body?: unknown) => Promise<Answer> = (
    method,
    route,
    body,
  ) => harness.call(username, method, route, body),
): Promise<string> {
  const mode = harness.sqlite
    .query<{ state: string }, []>('SELECT state FROM organization_activation WHERE singleton=1')
    .get();
  if (mode === null) throw new Error('fixture activation marker absent');
  if (mode.state === 'pre_activation')
    return await createLegacyFixturePackage(harness, username, name, send);
  if (mode.state !== 'activated') throw new Error('fixture activation marker malformed');
  const made = await send('POST', '/api/projects', {
    name: name + ' engagement',
    workPackage: { name },
  });
  if (made.status !== 201)
    throw new Error('fixture project birth refused: ' + JSON.stringify(made));
  const checked = await createProject.responses[0].schema.validator['~standard'].validate(
    made.body,
  );
  if (checked.issues !== undefined)
    throw new Error('fixture project reply malformed', { cause: checked.issues });
  const workPackage = checked.value.workPackage;
  if (workPackage === undefined) throw new Error('fixture project birth omitted requested package');
  const listed = await send('GET', '/api/organization/steps');
  if (listed.status !== 200)
    throw new Error('fixture catalogue read refused: ' + JSON.stringify(listed));
  const catalogue = await listStepCatalogue.responses[0].schema.validator['~standard'].validate(
    listed.body,
  );
  if (catalogue.issues !== undefined)
    throw new Error('fixture catalogue malformed', { cause: catalogue.issues });
  for (const [position, code, stepName] of [
    [10, 'fixture-dev', 'Dev'],
    [20, 'fixture-qa', 'QA'],
  ] as const) {
    const definition = catalogue.value.definitions.find((entry) => entry.code === code);
    const bound = await send('POST', '/api/organization/step-bindings', {
      scopeKind: 'project',
      scopeId: checked.value.project.id,
      workItemTypeId: null,
      position,
      ...(definition === undefined
        ? {
            define: {
              code,
              name: stepName,
              position,
              defaultEstimateUnit: 'workdays',
              defaultAllowanceBps: 0,
            },
          }
        : { stepId: definition.id }),
    });
    if (bound.status !== 201) throw new Error('fixture step binding refused', { cause: bound });
    const binding = await bindCatalogueStep.responses[0].schema.validator['~standard'].validate(
      bound.body,
    );
    if (binding.issues !== undefined)
      throw new Error('fixture step binding malformed', { cause: binding.issues });
  }
  return workPackage.id;
}

/** Explicit migrated legacy storage for preactivation reader scenarios; no implicit production parent or steps. */
async function createLegacyFixturePackage(
  harness: OrganizationHarness,
  username: string,
  name: string,
  send: (method: string, route: string, body?: unknown) => Promise<Answer>,
): Promise<string> {
  let organization = harness.sqlite
    .query<{ id: string }, []>('SELECT id FROM organization ORDER BY created_at,id LIMIT 1')
    .get();
  if (organization === null) {
    harness.organization('fixture-legacy-org');
    organization = { id: 'fixture-legacy-org' };
  }
  const organizationId = organization.id,
    projectId = crypto.randomUUID(),
    actorId = harness.userId(username);
  harness.sqlite.run('UPDATE organization SET legacy=1 WHERE id=?', [organizationId]);
  harness.sqlite.run(
    'INSERT INTO project(id,organization_id,name,revision,created_at,created_by,space_id,space_position) VALUES(?,?,?,0,100,?,NULL,NULL)',
    [projectId, organizationId, name + ' engagement', actorId],
  );
  const made = await send('POST', '/api/work-packages', { name, projectId });
  if (made.status !== 200)
    throw new Error('explicit legacy fixture package birth refused: ' + JSON.stringify(made));
  const row = harness.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM work_package WHERE project_id=?')
    .get(projectId);
  if (row === null) throw new Error('legacy fixture package absent');
  await harness.publicWrites().uow.run(async ({ stores }) => {
    const catalogue = await stores.stepCatalogue.readCatalogue(organizationId);
    if (catalogue === null) throw new Error('legacy fixture catalogue owner absent');
    for (const [position, code, stepName] of [
      [10, 'fixture-dev', 'Dev'],
      [20, 'fixture-qa', 'QA'],
    ] as const) {
      const definition = catalogue.definitions.find((entry) => entry.code === code);
      const binding = {
        bindingId: crypto.randomUUID(),
        scopeKind: 'project' as const,
        scopeId: projectId,
        workItemTypeId: null,
        position,
      };
      const written =
        definition === undefined
          ? await stores.stepCatalogue.defineAndBindStep(
              organizationId,
              {
                id: crypto.randomUUID(),
                code,
                name: stepName,
                position,
                defaultEstimateUnit: 'workdays',
                defaultAllowancePercent: 0,
              },
              binding,
              { at: 100, by: actorId },
            )
          : await stores.stepCatalogue.bindStep(
              organizationId,
              { ...binding, stepId: definition.id },
              { at: 100, by: actorId },
            );
      if (!written.ok)
        throw new Error('explicit legacy fixture step binding refused', { cause: written });
    }
    return { commit: true, value: undefined };
  });
  return row.id;
}
