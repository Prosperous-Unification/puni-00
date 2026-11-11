import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { exclusionOf } from './allow-list';
import { renameText } from './rename-text';
import { applyRename, git } from './tree';

const ROOT = new URL('../../../', import.meta.url);
const SOLVER = 'libs/wbs/domain/contracts/solver/src/';
const readSource = (path: string): string => readFileSync(new URL(path, ROOT), 'utf8');

it('freezes the entire actual Python 0.4 release without excluding TypeScript host contracts', () => {
  const paths = git(ROOT.pathname, ['ls-files', 'libs/wbs/adapters/solver-py']).trim().split('\n');
  expect(paths.length).toBeGreaterThan(25);
  for (const path of paths) expect(exclusionOf(path), path).toBeDefined();
  expect(readSource('libs/wbs/adapters/solver-py/src/wbs_solver/__init__.py')).toContain(
    '__version__ = "0.4.0"',
  );
  expect(exclusionOf(SOLVER + 'stored-connected-stage.ts')).toBeUndefined();
  expect(exclusionOf(SOLVER + 'wire-types.ts')).toBeUndefined();
});

it('retains actual frozen wire declarations but rewrites unrelated old host declarations in that file', () => {
  const path = SOLVER + 'wire-types.ts';
  const source = readSource(path);
  const renamed = renameText(
    source + '\ninterface Legacy { projectId: string; projects: string[] }\n',
    path,
  );
  expect(renamed).toContain('readonly projectId: string;');
  expect(renamed).toContain('readonly projects: readonly {');
  expect(renamed).toContain('readonly foreignProjectId: string;');
  expect(renamed).toContain("  'projectId',");
  expect(renamed).toContain("  'projects',");
  expect(renamed).toContain("  'foreignProjectId',");
  expect(renamed).toContain('interface Legacy { workPackageId: string; workPackages: string[] }');
});

for (const [file, wire, host] of [
  [
    'validate-connected-solver-request.ts',
    'request.scope.projects.map((workPackage) => workPackage.projectId)',
    'const workPackages = new Set(',
  ],
  [
    'parse-solver-response.ts',
    "scope['projectId'] !== expectedScope.projectId",
    'const legacy = captured.chain.workPackageId;',
  ],
  [
    'revalidate-solver-result.ts',
    'response.scope.projectId !== request.scope.projectId',
    'stage.workPackageId',
  ],
] as const) {
  it('retains only exact wire receiver fields in ' + file, () => {
    const path = SOLVER + file;
    const renamed = renameText(
      readSource(path) + '\nconst legacy = captured.chain.projectId;\n',
      path,
    );
    expect(renamed).toContain(wire);
    expect(renamed).toContain(host);
    expect(renamed).toContain('const legacy = captured.chain.workPackageId;');
  });
}

it('retains the boundary wire key while renaming the stage owner read on the same producer', () => {
  const path = SOLVER + 'connected-boundaries.ts';
  const renamed = renameText(readSource(path), path);
  expect(renamed).toContain('foreignProjectId: incoming ? predecessorOwner : successorOwner,');
  expect(renamed).toContain('stage.workPackageId');
  expect(renamed).toContain('stage.input.order.workPackageIdByWorkItem');
});

it('refuses a missing connected wire identity member rather than silently changing its interpretation', () => {
  const path = SOLVER + 'wire-types.ts';
  const source = readSource(path);
  const anchor =
    "export interface SolverConnectedScopeIdentity {\n  readonly kind: 'connected-stage';\n  readonly projectId: string;";
  expect(source).toContain(anchor);
  const changed = source.replace(anchor, anchor.replace('projectId', 'missingOwner'));
  expect(() => {
    renameText(changed, path);
  }).toThrow('protected wire witness changed');
});

it('refuses a changed exact wire receiver witness before treating another old package field as wire', () => {
  const path = SOLVER + 'parse-solver-response.ts';
  const source = readSource(path);
  const changed = source.replace('expectedScope.projectId', 'unrelated.projectId');
  expect(changed).not.toBe(source);
  expect(() => {
    renameText(changed, path);
  }).toThrow('protected wire witness changed');
});

it('separates explicit connected producer wire keys from local package ownership values', () => {
  const path = SOLVER + 'build-connected-solver-request.ts';
  const source = readSource(path)
    .replace('fixed.push({ projectId,', 'fixed.push({ projectId: projectId,')
    .replace(
      'occupancy.push({ personId: slice.personId, projectId,',
      'occupancy.push({ personId: slice.personId, projectId: projectId,',
    );
  const renamed = renameText(source, path);
  expect(renamed).toContain('fixed.push({ projectId: workPackageId, key, start, finish });');
  expect(renamed).toContain(
    'occupancy.push({ personId: slice.personId, projectId: workPackageId, key, start, finish });',
  );
  expect(renamed).toContain('projectId: stage.workPackageId,');
  expect(renamed).toContain('projects: stage.workPackages');
  expect(renamed).toContain('bytes(left.projectId, right.projectId)');
  expect(renamed).toContain(
    'bookings.push({ start, end: finish, workPackageId, workItemId: slice.workItemId });',
  );
});

it('refuses an ambiguous shorthand at a mixed wire producer rather than preserving its host value', () => {
  const path = SOLVER + 'build-connected-solver-request.ts';
  const source = readSource(path).replace(
    'projectId: projectId, key, start, finish',
    'projectId, key, start, finish',
  );
  expect(() => {
    renameText(source, path);
  }).toThrow('wire producer requires explicit property mapping');
});

for (const file of [
  'wire-types.ts',
  'validate-connected-solver-request.ts',
  'parse-solver-response.ts',
  'revalidate-solver-result.ts',
  'connected-boundaries.ts',
  'build-connected-solver-request.ts',
]) {
  it('uses the same wire interpretation before and after a mechanical pass: ' + file, () => {
    const path = SOLVER + file;
    const once = renameText(readSource(path), path);
    expect(renameText(once, path)).toBe(once);
  });
}

it('actual apply leaves all tracked Python release and schema bytes unchanged while renaming host DTOs', () => {
  const root = scratchSync('rename-frozen-solver-');
  git(root, ['init', '-q']);
  const frozen = git(ROOT.pathname, [
    'ls-files',
    'libs/wbs/adapters/solver-py',
    'libs/wbs/domain/contracts/solver/solver-wire.v1.json',
    'libs/wbs/domain/contracts/solver/solver-wire.v2.json',
    'libs/wbs/domain/contracts/solver/solver-wire.v3.json',
    'libs/wbs/domain/contracts/solver/solver-wire.v4.json',
    'libs/wbs/domain/contracts/solver/solver-wire.v5.json',
  ])
    .trim()
    .split('\n');
  const bytes = frozen.map((path) => ({ path, bytes: readFileSync(new URL(path, ROOT)) }));
  for (const retained of bytes) {
    mkdirSync(dirname(join(root, retained.path)), { recursive: true });
    writeFileSync(join(root, retained.path), retained.bytes);
  }
  const host = SOLVER + 'stored-connected-stage.ts';
  mkdirSync(dirname(join(root, host)), { recursive: true });
  writeFileSync(join(root, host), 'interface Host { projectId: string; projects: string[] }');
  const image = 'apps/wbs/be-01/Dockerfile';
  mkdirSync(dirname(join(root, image)), { recursive: true });
  writeFileSync(join(root, image), readSource(image));
  git(root, ['add', '-A']);
  const once = applyRename(root, ['libs/wbs', image]);
  expect(once.rewritten).toBe(1);
  expect(readFileSync(join(root, host), 'utf8')).toBe(
    'interface Host { workPackageId: string; workPackages: string[] }',
  );
  for (const retained of bytes)
    expect(readFileSync(join(root, retained.path)), retained.path).toEqual(retained.bytes);
  expect(readFileSync(join(root, image), 'utf8')).toBe(readSource(image));
  expect(applyRename(root, ['libs/wbs', image])).toEqual({ moved: 0, rewritten: 0 });
});

it('reserves only JSON golden corpus paths for explicit version edits, never neighboring TypeScript helpers', () => {
  const root = SOLVER.slice(0, -4) + 'fixtures/';
  for (const path of [
    'manifest.json',
    'request/valid-two-slices.json',
    'response/valid-infeasible.json',
  ])
    expect(exclusionOf(root + path), root + path).toBeDefined();
  expect(exclusionOf(root + 'request/producer.ts')).toBeUndefined();
  expect(exclusionOf(root + 'helper.ts')).toBeUndefined();
});

it('pins the reviewed golden corpus to its complete actual manifest before explicit metadata upgrades', () => {
  const directory = new URL('../fixtures/', new URL(SOLVER + 'wire-types.ts', ROOT));
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8')) as {
    fixtures: { file: string }[];
  };
  const actual = ['request', 'response'].flatMap((branch) =>
    readdirSync(new URL(branch + '/', directory)).map((name) => branch + '/' + name),
  );
  const named = manifest.fixtures.map((entry) => entry.file);
  expect(new Set(named).size).toBe(named.length);
  expect([...named].sort()).toEqual([...actual].sort());
  for (const file of actual)
    expect(exclusionOf('libs/wbs/domain/contracts/solver/fixtures/' + file)).toBeDefined();
});

it('controlled connected corpus JSON keeps frozen wire spellings through actual apply while sibling helper rewrites', () => {
  const root = scratchSync('rename-controlled-wire-corpus-');
  git(root, ['init', '-q']);
  const directory = 'libs/wbs/domain/contracts/solver/fixtures/request';
  mkdirSync(join(root, directory), { recursive: true });
  const json = '{"scope":{"projectId":"p","projects":[{"projectId":"p"}]}}';
  writeFileSync(join(root, directory, 'controlled-connected.json'), json);
  writeFileSync(join(root, directory, 'helper.ts'), 'const projectId = oldPlanning;');
  git(root, ['add', '-A']);
  expect(applyRename(root, [directory])).toEqual({ moved: 0, rewritten: 1 });
  expect(readFileSync(join(root, directory, 'controlled-connected.json'), 'utf8')).toBe(json);
  expect(readFileSync(join(root, directory, 'helper.ts'), 'utf8')).toBe(
    'const workPackageId = oldPlanning;',
  );
});

it('does not assign frozen wire meaning to a same-basename file below an unreviewed directory', () => {
  const source = readSource(SOLVER + 'wire-types.ts');
  const renamed = renameText(source, SOLVER + 'legacy/wire-types.ts');
  expect(renamed).toContain('readonly workPackageId: string;');
  expect(renamed).not.toContain('readonly projectId: string;');
});

for (const name of ['CONNECTED_SOLVER_SCOPE_KEYS', 'SOLVER_BOUNDARY_KEYS']) {
  for (const shape of ['callable', 'nested-callable']) {
    it('refuses unsupported wire key-array ownership: ' + name + ':' + shape, () => {
      const path = SOLVER + 'wire-types.ts';
      const source = readSource(path);
      const start = source.indexOf('export const ' + name + ' = [');
      const end = source.indexOf('] as const;', start);
      if (start < 0 || end < 0) throw new Error('actual wire array absent');
      const statement = source.slice(start, end + '] as const;'.length);
      const changed =
        shape === 'callable'
          ? statement.replace('= [', '= (() => [').replace('] as const;', '] as const)();')
          : statement.replace('= [', '= [() => "projectId",');
      expect(() => {
        renameText(
          source.slice(0, start) + changed + source.slice(end + '] as const;'.length),
          path,
        );
      }).toThrow('protected wire key array is not literal string data');
    });
  }
}
