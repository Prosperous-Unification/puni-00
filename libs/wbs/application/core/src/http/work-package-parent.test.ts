import { createWorkPackage, importWorkPackage, validateSchema } from '@wbs/contracts';
import { expect, it } from 'bun:test';

import { classifyParentBodyFailure } from './work-package-parent';

it('requires the explicit parent on the actual current create contract', async () => {
  const checked = await validateSchema(createWorkPackage.body, { name: 'Package' });
  expect(checked.issues).toBeDefined();
});

it.each([
  [{ name: 'P' }, 'project_required'],
  [{ name: 'P', projectId: null }, 'project_required'],
  [{ name: 'P', projectId: 42 }, 'invalid_body'],
  [{ name: 'P', projectId: '' }, 'invalid_body'],
  [{ name: 'P', projectId: '  ' }, 'invalid_body'],
  [{ name: 42, projectId: null }, 'invalid_body'],
  [{ name: 'P', extra: true }, 'invalid_body'],
  [{ projectId: null }, 'invalid_body'],
] as const)('classifies actual complete create issues for %j', async (body, error) => {
  const checked = await validateSchema(createWorkPackage.body, body);
  if (checked.issues === undefined)
    throw new Error('fixture unexpectedly passed structural validation');
  expect(
    classifyParentBodyFailure({ code: 'invalid_body', rejected: body, issues: checked.issues }),
  ).toEqual<unknown>({ ok: false, status: 422, body: { error } });
});
it.each([
  [{ document: {} }, 'project_required'],
  [{ document: {}, projectId: null }, 'project_required'],
  [{ document: {}, projectId: 42 }, 'invalid_body'],
  [{ projectId: null }, 'invalid_body'],
  [{ document: {}, extra: true }, 'invalid_body'],
] as const)('classifies actual closed import envelope issues for %j', async (body, error) => {
  const checked = await validateSchema(importWorkPackage.body, body);
  if (checked.issues === undefined)
    throw new Error('fixture unexpectedly passed envelope validation');
  expect(
    classifyParentBodyFailure({ code: 'invalid_body', rejected: body, issues: checked.issues }),
  ).toEqual<unknown>({ ok: false, status: 422, body: { error } });
});
it('retains malformed JSON400 and refuses invalid bodies even without schema issues', () => {
  expect(classifyParentBodyFailure({ code: 'invalid_json', rejected: undefined })).toEqual({
    ok: false,
    status: 400,
    body: { error: 'invalid_json' },
  });
  expect(classifyParentBodyFailure({ code: 'invalid_body', rejected: { name: 'P' } })).toEqual({
    ok: false,
    status: 422,
    body: { error: 'invalid_body' },
  });
});
it('accepts only explicit parent create and envelope, retaining the nested document unclassified', async () => {
  expect(
    (await validateSchema(createWorkPackage.body, { name: 'P', projectId: 'parent' })).issues,
  ).toBeUndefined();
  const document = { document: { format: 'wbs-plan', version: 999, exportedAt: 'bad' } };
  const checked = await validateSchema(importWorkPackage.body, { projectId: 'parent', document });
  expect(checked.issues).toBeUndefined();
  if (checked.issues === undefined)
    expect(checked.value).toEqual({ projectId: 'parent', document });
});

it('classifies a modeled invalid body without structural issues as422 rather than throwing', () => {
  expect(classifyParentBodyFailure({ code: 'invalid_body', rejected: undefined })).toEqual({
    ok: false,
    status: 422,
    body: { error: 'invalid_body' },
  });
});
