import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'bun:test';

import { protectionOf } from './allow-list';
import { constantSpellingOf, NAMED_RENAMES, PATH_MOVES, RENAME_MAP } from './rename-map';
import { renamePath, renameText } from './rename-text';
import { git, residualsIn, trackedPaths } from './tree';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));

describe('the rename map', () => {
  it('gives every key its five spellings, each in its own case family', () => {
    expect([...RENAME_MAP.keys()]).toEqual(['projects', 'project']);
    for (const [old, spellings] of RENAME_MAP) {
      const plural = old.endsWith('s');
      expect(spellings.sql).toMatch(/^[a-z]+(?:_[a-z]+)+$/);
      expect(spellings.identifier).toMatch(/^[a-z]+(?:[A-Z][a-z]+)+$/);
      expect(spellings.type).toMatch(/^(?:[A-Z][a-z]+)+$/);
      expect(spellings.path).toMatch(/^[a-z]+(?:-[a-z]+)+$/);
      expect(spellings.prose).toMatch(/^[a-z]+(?: [a-z]+)+$/);
      const all = [spellings.sql, spellings.identifier, spellings.type, spellings.path];
      for (const spelling of [...all, spellings.prose]) {
        expect(spelling.toLowerCase().endsWith('s')).toBe(plural);
      }
    }
  });

  it('derives every named rename from the map', () => {
    for (const { from, to, site } of NAMED_RENAMES) {
      const written = site === 'code' ? `use(${from});` : `use('${from}');`;
      const expected = site === 'code' ? `use(${to});` : `use('${to}');`;
      expect(renameText(written, 'named.ts')).toBe(expected);
    }
  });

  it('derives both module moves from the map, and both modules exist today', () => {
    for (const { from, to } of PATH_MOVES) {
      expect(renamePath(from)).toBe(to);
      expect(git(REPO, ['ls-files', '--', `${from}/README.md`]).trim()).toBe(`${from}/README.md`);
    }
  });

  // Proof: before the dated-records glob reached docs/wbs/research, this case named
  // `work_package` and `work-packages` on lines of 2026-10-23-authorization-model.md, written in
  // the new names ahead of the rename (2026-10-25).
  it('collides with no identifier already in the tree while old words remain', () => {
    const targets = [...RENAME_MAP.values()].flatMap((spellings) => [
      spellings.sql,
      spellings.identifier,
      spellings.type,
      spellings.path,
      constantSpellingOf(spellings),
    ]);
    const inScope = new Set(trackedPaths(REPO));
    const collisions = [...new Set([...targets, ...NAMED_RENAMES.map(({ to }) => to)])].flatMap(
      (target) => {
        const run = Bun.spawnSync(['git', 'grep', '-n', '-w', '-F', '-e', target], {
          cwd: REPO,
          stdout: 'pipe',
          stderr: 'pipe',
        });
        // git grep exits 1 for no match; anything else is a broken probe.
        if (run.exitCode === 1) return [];
        if (run.exitCode !== 0) throw new Error(run.stderr.toString());
        return run.stdout
          .toString()
          .split('\n')
          .filter((hit) => {
            const [path = '', , ...line] = hit.split(':');
            return inScope.has(path) && protectionOf(line.join(':')) === undefined;
          })
          .map((hit) => `${target}: ${hit}`);
      },
    );
    // After the mechanical commit no old word remains and every target is the rename's own.
    const oldWordsRemain = residualsIn(REPO).length > 0;
    expect(oldWordsRemain ? collisions : []).toEqual([]);
  }, 30_000);
});

describe('the respelling', () => {
  const cases: readonly [string, string, string][] = [
    ['a.ts', `import { x } from './project-stream';`, `import { x } from './work-package-stream';`],
    [
      'a.ts',
      '// Opens the project and its projects.',
      '// Opens the work package and its work packages.',
    ],
    ['a.ts', '/** @param project the project */', '/** @param workPackage the work package */'],
    ['a.ts', 'const projectId = project.id;', 'const workPackageId = workPackage.id;'],
    ['a.ts', "const PROJECT_ID = 'p1';", "const WORK_PACKAGE_ID = 'p1';"],
    [
      'a.ts',
      "db.run('UPDATE project SET name = ?');",
      "db.run('UPDATE work_package SET name = ?');",
    ],
    ['a.ts', 'const key = `project:${projectId}`;', 'const key = `work-package:${workPackageId}`;'],
    [
      'a.ts',
      "const kind = { subject_kind: 'project' };",
      "const kind = { subject_kind: 'work_package' };",
    ],
    [
      'a.ts',
      'type T = CanonicalProject | Project;',
      'type T = CanonicalWorkPackage | WorkPackage;',
    ],
    ['a.ts', "fetch('/api/projects/' + id);", "fetch('/api/work-packages/' + id);"],
    ['a.ts', "throw new Error('project not found');", "throw new Error('work package not found');"],
    ['a.ts', "case 'project':", "case 'work_package':"],
    ['a.ts', 'const projection = pyproject;', 'const projection = pyproject;'],
    ['a.tsx', '<h1>Projects</h1>', '<h1>Work packages</h1>'],
    [
      'a.tsx',
      '<Foo project={project} title="Project" />',
      '<Foo workPackage={workPackage} title="Work package" />',
    ],
    [
      'a.md',
      'A project holds steps; see `projectId`.',
      'A work package holds steps; see `workPackageId`.',
    ],
    [
      'a.md',
      'See [it](../modules/project/README.md).',
      'See [it](../modules/work-package/README.md).',
    ],
    [
      'a.md',
      '<!-- module-index {"path":"project.resource.ts"} -->',
      '<!-- module-index {"path":"work-package.resource.ts"} -->',
    ],
    ['a.json', '{"project": {"kind": "project"}}', '{"workPackage": {"kind": "work_package"}}'],
    [
      'a.ts',
      "it('[PROJECT-ASSIGNMENT-READS-001] reads project rows')",
      "it('[PROJECT-ASSIGNMENT-READS-001] reads project rows')",
    ],
  ];
  it.each(cases)('respells %s line %s', (path, before, after) => {
    expect(renameText(before, path)).toBe(after);
  });

  it('moves paths by segment', () => {
    expect(renamePath('apps/wbs/fe-01/src/lib/project-stream.ts')).toBe(
      'apps/wbs/fe-01/src/lib/work-package-stream.ts',
    );
    expect(renamePath('openspec/specs/project-assignment-reads/spec.md')).toBe(
      'openspec/specs/work-package-assignment-reads/spec.md',
    );
    expect(renamePath('libs/adapters/solver-py/pyproject.toml')).toBe(
      'libs/adapters/solver-py/pyproject.toml',
    );
  });
});
