import { readFileSync } from 'node:fs';

import type { PlanDocumentV11 } from '@wbs/contracts';
export interface FixtureEndpoint {
  kind?: string;
  scope: string;
  workItem?: string;
  step?: string;
  projectId: string;
  workPackageId: string;
  workItemId: string;
  stepId?: string;
  display: {
    projectName: string;
    workPackageName: string;
    abbreviation: string;
    workItemName: string;
    address: string;
    stepName?: string;
  };
}
export interface ExportFixture {
  document: { version: number };
  project: { id: string };
  workPackage: { id: string };
  workItems: PlanDocumentV11['workItems'];
  steps: PlanDocumentV11['steps'];
  typedDependencies: {
    id: string;
    type: string;
    predecessor: FixtureEndpoint;
    successor: { kind?: string; scope: string; workItem: string; step?: string };
  }[];
  stepBlockages: { workItemId: string; stepId: string; blockedAt: number }[];
  connected: {
    mode: string;
    projects: { revision: number }[];
    workPackages: { revision: number }[];
    placement: {
      kind: string;
      stages: { boundary: { version: number } }[];
      baseline: { start: number }[];
    };
  };
  projectRevision: number;
  workPackageRevision: number;
}
/** Mutable test inputs deliberately cover both accepted generations and malformed variants. */
export function readExportFixture(version: 12 | 13 | 14): ExportFixture {
  const path =
    version === 12
      ? new URL(
          '../../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-document12-connected.txt',
          import.meta.url,
        )
      : new URL('../fixtures/plan-export.v' + String(version) + '.json', import.meta.url); // Test fixture boundary: each case deliberately mutates decoded JSON before the production decoder.
  return JSON.parse(readFileSync(path, 'utf8')) as ExportFixture;
}
