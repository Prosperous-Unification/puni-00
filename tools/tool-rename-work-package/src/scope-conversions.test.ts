import { readFileSync } from 'node:fs';

import { expect, it } from 'bun:test';

import { renameText } from './rename-text';

function readSource(path: string): string {
  return readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
}

it('keeps the future GrantScope arm while renaming the old SQL row in its mixed documentation', () => {
  const path = 'libs/wbs/application/core/src/ports/access-grants.ts';
  const renamed = renameText(readSource(path), path);
  expect(renamed.includes("{ readonly kind: 'project'; readonly projectId: string }")).toBe(true);
  expect(renamed.includes('every project scope')).toBe(true);
  expect(renamed.includes("today's `project`")).toBe(false);
});

it('keeps the future AccessTarget arm and its structurally wider parent-field documentation', () => {
  const path = 'libs/wbs/application/core/src/ports/access-decisions.ts';
  const renamed = renameText(readSource(path), path);
  expect(renamed.includes("{ readonly kind: 'project'; readonly chain: ProjectChain }")).toBe(true);
  expect(renamed.includes('a `projectId` on a structurally wider chain')).toBe(true);
});

it('keeps only the new scopeRows SQL namespace and parent access while renaming real package-table reads', () => {
  const path = 'libs/wbs/adapters/store-sqlite/src/access-decisions.ts';
  const source = readSource(path);
  const renamed = renameText(source, path);
  expect(renamed.includes("target.kind === 'project'")).toBe(true);
  expect(renamed.includes("('project', ${target.chain.projectId})")).toBe(true);
  expect(renamed.includes('FROM work_package wp')).toBe(true);
  expect(renamed.includes('JOIN work_package_organization wpo')).toBe(true);
  expect(
    renameText(source + '\nconst legacy = captured.chain.projectId;\n', path).endsWith(
      '\nconst legacy = captured.chain.workPackageId;\n',
    ),
  ).toBe(true);
});

it('keeps grant scope conversion fields without preserving old package-table ownership or SQL prose', () => {
  const path = 'libs/wbs/adapters/store-sqlite/src/access-grant.ts';
  const renamed = renameText(readSource(path), path);
  expect(renamed.includes("return { scopeKind: 'project', scopeId: scope.projectId }")).toBe(true);
  expect(renamed.includes("return { kind: 'project', projectId: row.scopeId }")).toBe(true);
  expect(renamed.includes('workPackageOrganization.resourceId')).toBe(true);
  expect(renamed.includes("today's `project` row")).toBe(false);
  expect(renamed.includes('No project entity exists yet, so a project scope never does.')).toBe(
    true,
  );
});

it('keeps future role and grant CHECK kinds while renaming the old audit subject on the same schema', () => {
  const path = 'libs/wbs/adapters/store-sqlite/src/schema.ts';
  const source = readSource(path);
  const renamed = renameText(source, path);
  for (const receiver of ['objectKind', 'scopeKind']) {
    const check = 'sql`${t.' + receiver + "} IN ('organization', 'project', 'work_package')`";
    expect(source.includes(check), 'actual current CHECK witness ' + receiver).toBe(true);
    expect(renamed.includes(check), 'retained new-kind CHECK ' + receiver).toBe(true);
  }
  expect(renamed.includes("sql`${t.subjectKind} IN ('work_package', 'sso_connection'")).toBe(true);
});

it('keeps actual future-scope fixture fields without retaining the old project table snapshot', () => {
  const path = 'libs/wbs/adapters/store-sqlite/src/access-decisions.db.test.ts';
  const renamed = renameText(readSource(path), path);
  expect(renamed.includes("grant('project', 'proj', 'user', 'ada', 'project-contributor')")).toBe(
    true,
  );
  expect(renamed.includes("spaceId: null, projectId: 'proj'")).toBe(true);
  expect(renamed.includes("expect(failure.message).toContain('project')")).toBe(true);
  expect(renamed.includes("            'work_package',\n            'command_journal',")).toBe(
    true,
  );
  const store = 'libs/wbs/adapters/store-sqlite/src/access-grant-store.db.test.ts';
  expect(
    renameText(readSource(store), store).includes("draft({ kind: 'project', projectId: 'wp-a' }"),
  ).toBe(true);
});

it('keeps current role-model kind fixtures without giving the fixture file a generic project-kind exemption', () => {
  const path = 'libs/wbs/domain/domain/src/access-role.test.ts';
  const source = readSource(path);
  const count = (text: string) => [...text.matchAll(/'project'/g)].length;
  expect(count(source)).toBe(6);
  expect(count(renameText(source, path))).toBe(6);
  const old = "\nconst legacy = {kind: 'project', projectId: 'old'};\n";
  expect(
    renameText(source + old, path).endsWith(
      "\nconst legacy = {kind: 'work_package', workPackageId: 'old'};\n",
    ),
  ).toBe(true);
});

it('refuses a named access table with no table-name argument as a changed witness', () => {
  const path = 'libs/wbs/adapters/store-sqlite/src/schema.ts';
  const source = readSource(path);
  const start = source.indexOf('export const accessRole = sqliteTable(');
  const end = source.indexOf('export type AccessRoleRow', start);
  if (start < 0 || end < 0) throw new Error('actual access-role declaration absent');
  const changed =
    source.slice(0, start) + 'export const accessRole = sqliteTable();\n' + source.slice(end);
  expect(() => {
    renameText(changed, path);
  }).toThrow('protected witness changed');
});

for (const binding of [
  '{ const project = oldPlanning; use(project); }',
  '{ const atProject = oldPlanning; use(atProject); }',
  'function nested(project: unknown) { use(project); }',
  '{ const { project } = oldPlanning; use(project); }',
  '{ try {} catch (atProject) { use(atProject); } }',
]) {
  it('refuses shadowed new-target fixture bindings: ' + binding, () => {
    const path = 'libs/wbs/adapters/store-sqlite/src/access-decisions.db.test.ts';
    const source = readSource(path);
    const anchor = '    const project: AccessTarget = {';
    expect(source.split(anchor)).toHaveLength(2);
    const changed = source.replace(anchor, binding + '\n' + anchor);
    expect(() => renameText(changed, path)).toThrow('fixture binding must occur exactly once');
  });
}
