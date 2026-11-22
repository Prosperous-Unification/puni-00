import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { HISTORICAL_TREE as REPO } from './historical-tree.spec';
import { isProtectedSpan, readProtectedSpans } from './protection';
import { constantSpellingOf, NAMED_RENAMES, PATH_MOVES, RENAME_MAP } from './rename-map';
import { renamePath, renameText } from './rename-text';
import { git, residualsIn, trackedPaths } from './tree';

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

  it('derives both module moves from the map, and both modules exist in the historical input', () => {
    for (const { from, to } of PATH_MOVES) {
      expect(renamePath(from)).toBe(to);
      expect(git(REPO, ['ls-files', '--', `${from}/README.md`]).trim()).toBe(`${from}/README.md`);
    }
  });

  // Proof: before the dated-records glob reached docs/wbs/research, this case named
  // `work_package` and `work-packages` on lines of 2026-10-23-authorization-model.md, written in
  // the new names ahead of the rename (2026-10-25).
  it('adds no collisions beyond the historical migration assertions while old words remain', () => {
    const targets = [...RENAME_MAP.values()].flatMap((spellings) => [
      spellings.sql,
      spellings.identifier,
      spellings.type,
      spellings.path,
      constantSpellingOf(spellings),
    ]);
    const inScope = new Set(trackedPaths(REPO));
    const documents = new Map<
      string,
      { text: string; spans: ReturnType<typeof readProtectedSpans> }
    >();
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
            const [path = '', ordinal = '', ...line] = hit.split(':');
            if (!inScope.has(path)) return false;
            let document = documents.get(path);
            if (document === undefined) {
              const text = readFileSync(join(REPO, path), 'utf8');
              document = { text, spans: readProtectedSpans(text, path) };
              documents.set(path, document);
            }
            const index = Number(ordinal) - 1;
            if (!Number.isSafeInteger(index) || index < 0) throw new Error('invalid git grep line');
            const offset =
              index === 0 ? 0 : document.text.split('\n').slice(0, index).join('\n').length + 1;
            const text = line.join(':');
            const word = new RegExp('(?<![A-Za-z0-9_])' + target + '(?![A-Za-z0-9_])', 'g');
            return [...text.matchAll(word)].some(
              (match) =>
                !isProtectedSpan(
                  document.spans,
                  offset + match.index,
                  offset + match.index + target.length,
                ),
            );
          })
          .map((hit) => `${target}: ${hit}`);
      },
    );
    expect(residualsIn(REPO).length).toBeGreaterThan(0);
    // Historical migration fixtures already assert the new SQL names. Pin every hit;
    // do not exclude their file or accept arbitrary collisions.
    expect(collisions).toEqual([
      "work-packages: libs/wbs/adapters/store-sqlite/src/work-package-rename.db.test.ts:31:      '../../../../../openspec/changes/wbs-work-packages/fixtures/rename-before.json',",
      "work-packages: libs/wbs/adapters/store-sqlite/src/work-package-rename.db.test.ts:195:      '../../../../../openspec/changes/wbs-work-packages/fixtures/outgoing-store.json',",
      "work-packages: libs/wbs/adapters/store-sqlite/src/work-package-rename.db.test.ts:313:      '../../../../../openspec/changes/wbs-work-packages/fixtures/command-json.json',",
      "work-packages: libs/wbs/adapters/store-sqlite/src/work-package-rename.db.test.ts:416:      '../../../../../openspec/changes/wbs-work-packages/fixtures/schema-exceptions.json',",
      "work-packages: libs/wbs/adapters/store-sqlite/src/work-package-rename.db.test.ts:591:      '../../../../../openspec/changes/wbs-work-packages/fixtures/command-json-duplicates.json',",
      "work-packages: libs/wbs/adapters/store-sqlite/src/work-package-rename.db.test.ts:623:      '../../../../../openspec/changes/wbs-work-packages/fixtures/rename-integrity.json',",
      "work-package: libs/wbs/adapters/store-sqlite/src/work-package-rename.db.test.ts:40:  directory = mkdtempSync(join(tmpdir(), 'work-package-rename-'));",
      "work_package_id: libs/wbs/adapters/store-sqlite/src/work-package-rename.db.test.ts:291:        .query('SELECT COUNT(*) AS n FROM saved_plan WHERE work_package_id=?')",
      'work_package_id: libs/wbs/adapters/store-sqlite/src/work-package-rename.db.test.ts:508:        "SELECT abbreviation FROM work_package_abbreviation WHERE work_package_id=\'rename-next\'",',
      "restricted_work_package_recovery: libs/wbs/adapters/store-sqlite/src/work-package-rename.db.test.ts:564:      \"INSERT INTO organization_audit(id,organization_id,actor_id,action,subject_kind,subject_id,detail,created_at) VALUES('new-recovery','rename-org','rename-owner','restricted_work_package_recovery','work_package','rename-p','{}',2)\",",
    ]);
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
      "it('[PROJECT-ASSIGNMENT-READS-001] reads work package rows')",
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

describe('SQL template spellings', () => {
  it('uses SQL vocabulary in a tagged predicate without SQL statement keywords', () => {
    expect(renameText("const clause = sql`${row.kind} IN ('project')`;", 'a.ts')).toBe(
      "const clause = sql`${row.kind} IN ('work_package')`;",
    );
  });
  it('recognizes a generic SQL tag without changing interpolation identifiers to SQL spelling', () => {
    expect(renameText("sql<Promise<number>>`${projectId} = 'project'`", 'a.ts')).toBe(
      "sql<Promise<number>>`${workPackageId} = 'work_package'`",
    );
  });
  it('retains the outer SQL site across a nested ordinary template interpolation', () => {
    expect(renameText("sql`${`planning project ${projectId}`} = 'project'`", 'a.ts')).toBe(
      "sql`${`planning work package ${workPackageId}`} = 'work_package'`",
    );
  });
  it('leaves an ordinary IN template and an unrelated tag in prose vocabulary', () => {
    expect(renameText('`IN project`', 'a.ts')).toBe('`IN work package`');
    expect(renameText('not_sql`${projectId} IN project`', 'a.ts')).toBe(
      'not_sql`${workPackageId} IN work package`',
    );
  });
});

it('regex backticks cannot leak a template site into later real object literals', () => {
  const source =
    "const capture = /^\\| `([^`]+)`/.exec(line);\nconst legacy = {kind: 'project', projectId: 'old'};";
  expect(renameText(source, 'a.ts')).toBe(
    "const capture = /^\\| `([^`]+)`/.exec(line);\nconst legacy = {kind: 'work_package', workPackageId: 'old'};",
  );
});
