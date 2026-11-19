import { readFileSync } from 'node:fs';

import { expect, test } from 'bun:test';

import {
  PLAN_DOCUMENT_EXTERNAL_VERSION,
  PLAN_DOCUMENT_VERSION,
  planDocument,
  planDocumentRequest,
} from './plan-document-shapes';

const spellings: Readonly<Record<string, string>> = {
  project: 'workPackage',
  projects: 'workPackages',
  projectId: 'workPackageId',
  projectName: 'workPackageName',
  projectAbbreviation: 'workPackageAbbreviation',
  projectRevision: 'workPackageRevision',
  targetProjectId: 'targetWorkPackageId',
  idleProjects: 'idleWorkPackages',
};
function rename(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rename);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => [spellings[key] ?? key, rename(field)]),
  );
}
/** Constructed current controls; the original published fixture bytes remain untouched. */
function document(version: 15 | 16) {
  const name =
    version === 15 ? 'legacy-document11-ordinary.txt' : 'legacy-document12-connected.txt';
  const path = new URL(
    '../../../../../../openspec/changes/wbs-work-packages/fixtures/' + name,
    import.meta.url,
  );
  const body = rename(JSON.parse(readFileSync(path, 'utf8'))) as {
    document: { version: number };
    workPackage: Record<string, unknown>;
    connected?: { placement: { stages?: { boundary: { version: number } }[] } };
  };
  body.document.version = version;
  for (const stage of body.connected?.placement.stages ?? []) stage.boundary.version = 2;
  Reflect.deleteProperty(body.workPackage, 'ownerId');
  body.workPackage['projectId'] = 'engagement-project';
  return { ...body, project: { id: 'engagement-project', name: 'Engagement project' } };
}

test('current ordinary and connected documents reserve versions fifteen and sixteen', () => {
  expect(PLAN_DOCUMENT_VERSION).toBe(15);
  expect(PLAN_DOCUMENT_EXTERNAL_VERSION).toBe(16);
});
for (const version of [15, 16] as const) {
  test('current document ' + String(version) + ' requires ownerless parent metadata', () => {
    const body = document(version);
    expect(planDocument.allows(body)).toBe(true);
    expect(body.workPackage).not.toHaveProperty('ownerId');
    const withoutProject = structuredClone(body);
    Reflect.deleteProperty(withoutProject, 'project');
    expect(planDocument.allows(withoutProject)).toBe(false);
    const withoutParent = structuredClone(body);
    Reflect.deleteProperty(withoutParent.workPackage, 'projectId');
    expect(planDocument.allows(withoutParent)).toBe(false);
    expect(
      planDocument.allows({ ...body, workPackage: { ...body.workPackage, projectId: '' } }),
    ).toBe(false);
    expect(planDocument.allows({ ...body, project: { id: 42, name: 'wrong identity' } })).toBe(
      false,
    );
    expect(planDocument.allows({ ...body, project: { id: 'engagement-project', name: 42 } })).toBe(
      false,
    );
    const writable = structuredClone(body);
    Reflect.deleteProperty(writable, 'project');
    Reflect.deleteProperty(writable, 'workPackage');
    const checked = planDocumentRequest.validator['~standard'].validate(writable);
    if (checked instanceof Promise) throw new Error('unexpected asynchronous plan request');
    expect(checked.issues).toBeUndefined();
  });
}
