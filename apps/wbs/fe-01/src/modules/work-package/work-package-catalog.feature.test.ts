import type { PlanDocumentRequest } from '@wbs/contracts';
import { describe, expect, it } from 'vitest';

import type { CreatedProjectWithWorkPackage } from '@/lib/wbs-api';

import { CatalogWithdrawnError, type WorkPackageCatalogRoutes } from './contract';
import { createWorkPackageCatalog } from './work-package-catalog.feature';

const combinedCreation: CreatedProjectWithWorkPackage = {
  project: {
    id: 'project-created',
    organizationId: 'org-a',
    spaceId: null,
    spacePosition: null,
    name: 'New mission',
    revision: 0,
    createdAt: 1,
    updatedAt: null,
    createdBy: 'creator-a',
    workPackageCount: 1,
  },
  workPackage: {
    id: 'package-created',
    projectId: 'project-created',
    name: 'First delivery',
    abbreviation: 'FIRST',
    restricted: false,
    estimateMethod: 'pert',
    depReach: 'whole-item',
    pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
    estimateRounding: 'ceil',
    startDate: null,
    solutionRef: null,
    revision: 0,
    createdAt: 1,
    optimizationEnabled: false,
    scheduleEngine: 'fast',
    scheduleObjective: 'pri',
    budgetFactor: 1,
  },
  steps: [],
};

/** Catalog routes that record every request and answer at once. */
function recordedRoutes() {
  const sent: string[] = [];
  const routes: WorkPackageCatalogRoutes = {
    listProjects: () => {
      sent.push('projects');
      return Promise.resolve([
        {
          id: 'fixture-project',
          organizationId: 'fixture-organization',
          spaceId: null,
          spacePosition: null,
          name: 'Fixture project',
          revision: 0,
          createdAt: 1,
          updatedAt: null,
          createdBy: null,
          workPackageCount: 0,
        },
      ]);
    },
    listWorkPackages: () => {
      sent.push('list');
      return Promise.resolve([]);
    },
    createProjectWithWorkPackage: (projectName, workPackageName) => {
      sent.push('combined:' + projectName + ':' + workPackageName);
      return Promise.resolve({
        ...combinedCreation,
        project: { ...combinedCreation.project, name: projectName },
        workPackage: { ...combinedCreation.workPackage, name: workPackageName },
      });
    },
    createWorkPackage: (projectId, name) => {
      sent.push(`create:${projectId}:${name}`);
      return Promise.resolve({
        id: 'p9',
        projectId,
        name,
        restricted: false,
        abbreviation: 'PLAN',
      });
    },
    openWorkPackage: (id) => {
      sent.push(`open:${id}`);
      return Promise.resolve();
    },
    renameWorkPackage: (id, name) => {
      sent.push(`rename:${id}:${name}`);
      return Promise.resolve();
    },
    setAbbreviation: (id, abbreviation) => {
      sent.push(`abbreviation:${id}:${abbreviation}`);
      return Promise.resolve(abbreviation.toUpperCase());
    },
    importPlan: () => {
      sent.push('import');
      return Promise.reject(new Error('not_in_this_suite'));
    },
  };
  return { sent, routes };
}

describe('the work package catalog', () => {
  it('sends each gesture through its own route while its session is current', async () => {
    const { sent, routes } = recordedRoutes();
    const catalog = createWorkPackageCatalog({ routes, isCurrent: () => true });

    expect(await catalog.listProjects()).toMatchObject([{ id: 'fixture-project' }]);
    await catalog.list();
    await catalog.create('project-a', 'Shed');
    expect(await catalog.createProjectWithWorkPackage('New mission', 'First delivery')).toEqual(
      combinedCreation,
    );
    await catalog.markOpened('p1');
    await catalog.rename('p1', 'Barn');
    expect(await catalog.setAbbreviation('p1', 'puni2')).toBe('PUNI2');

    expect(sent).toEqual([
      'projects',
      'list',
      'create:project-a:Shed',
      'combined:New mission:First delivery',
      'open:p1',
      'rename:p1:Barn',
      'abbreviation:p1:puni2',
    ]);
  });

  it('sends nothing once its session is withdrawn, and says so', async () => {
    const { sent, routes } = recordedRoutes();
    let current = true;
    const catalog = createWorkPackageCatalog({ routes, isCurrent: () => current });
    current = false;

    const refusals = await Promise.allSettled([
      catalog.listProjects(),
      catalog.list(),
      catalog.create('project-a', 'Shed'),
      catalog.createProjectWithWorkPackage('New mission', 'First delivery'),
      catalog.markOpened('p1'),
      catalog.rename('p1', 'Barn'),
      catalog.setAbbreviation('p1', 'puni2'),
      catalog.importPlan('project-a', {} as PlanDocumentRequest, { defineMissing: false }),
    ]);

    expect(sent).toEqual([]);
    expect(
      refusals.map(
        (each) => each.status === 'rejected' && each.reason instanceof CatalogWithdrawnError,
      ),
    ).toEqual([true, true, true, true, true, true, true, true]);
  });
});

it('forwards a completed combined response after withdrawal for the page to suppress', async () => {
  const { routes } = recordedRoutes();
  let current = true;
  let finish: (creation: CreatedProjectWithWorkPackage) => void = () => {
    throw new Error('Combined route was not dispatched');
  };
  routes.createProjectWithWorkPackage = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const catalog = createWorkPackageCatalog({ routes, isCurrent: () => current });
  const pending = catalog.createProjectWithWorkPackage('New mission', 'First delivery');
  current = false;
  finish(combinedCreation);
  await expect(pending).resolves.toEqual(combinedCreation);
});
