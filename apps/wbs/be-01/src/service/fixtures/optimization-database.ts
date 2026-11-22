import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll } from 'bun:test';

import { migrateOrganizationCatalogueFixture } from '../../testing/organization-catalogue-fixture';

/** Migrates and closes one real catalogue database before this suite, then gives each solver scenario an independent file. */
export function prepareOptimizationDatabase(): (path: string) => void {
  let completedDirectory: string | undefined;
  let template: string;
  beforeAll(() => {
    const directory = mkdtempSync(join(tmpdir(), 'wbs-optimization-template-'));
    template = join(directory, 'catalogue.db');
    migrateOrganizationCatalogueFixture(template);
    // Proof: publishing cleanup before the injected migration failure removed the retained catalogue.db.
    completedDirectory = directory;
  });
  afterAll(() => {
    if (completedDirectory !== undefined) rmSync(completedDirectory, { recursive: true });
  });
  return (path) => {
    copyFileSync(template, path);
  };
}
