import type { PlanDocumentRequest } from '@wbs/contracts';
import { describe, expect, it } from 'vitest';

import { CatalogWithdrawnError, type ProjectCatalogRoutes } from './contract';
import { createProjectCatalog } from './project-catalog.feature';

/** Catalog routes that record every request and answer at once. */
function recordedRoutes() {
  const sent: string[] = [];
  const routes: ProjectCatalogRoutes = {
    listProjects: () => {
      sent.push('list');
      return Promise.resolve([]);
    },
    createProject: (name) => {
      sent.push(`create:${name}`);
      return Promise.resolve({ id: 'p9', name, restricted: false, abbreviation: 'PLAN' });
    },
    openProject: (id) => {
      sent.push(`open:${id}`);
      return Promise.resolve();
    },
    renameProject: (id, name) => {
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

describe('the project catalog', () => {
  it('sends each gesture through its own route while its session is current', async () => {
    const { sent, routes } = recordedRoutes();
    const catalog = createProjectCatalog({ routes, isCurrent: () => true });

    await catalog.list();
    await catalog.create('Shed');
    await catalog.markOpened('p1');
    await catalog.rename('p1', 'Barn');
    expect(await catalog.setAbbreviation('p1', 'puni2')).toBe('PUNI2');

    expect(sent).toEqual([
      'list',
      'create:Shed',
      'open:p1',
      'rename:p1:Barn',
      'abbreviation:p1:puni2',
    ]);
  });

  it('sends nothing once its session is withdrawn, and says so', async () => {
    const { sent, routes } = recordedRoutes();
    let current = true;
    const catalog = createProjectCatalog({ routes, isCurrent: () => current });
    current = false;

    const refusals = await Promise.allSettled([
      catalog.list(),
      catalog.create('Shed'),
      catalog.markOpened('p1'),
      catalog.rename('p1', 'Barn'),
      catalog.setAbbreviation('p1', 'puni2'),
      catalog.importPlan({} as PlanDocumentRequest),
    ]);

    expect(sent).toEqual([]);
    expect(
      refusals.map(
        (each) => each.status === 'rejected' && each.reason instanceof CatalogWithdrawnError,
      ),
    ).toEqual([true, true, true, true, true, true]);
  });
});
