import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'bun:test';
import ts from 'typescript';

import { EXCLUDED_PATHS, PROTECTED_LINES } from './allow-list';
import { renameText } from './rename-text';
import { git, trackedPaths } from './tree';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * Lines of the tree already in the new sense, which `apply` must leave byte-identical. Each is
 * read back from its file, so a witness outlived by its code fails here too.
 */
const NEW_SENSE_WITNESSES: readonly { readonly path: string; readonly line: string }[] = [
  {
    path: 'CONTEXT-MAP.md',
    line: '  development and client projects. Client content and authority remain isolated.',
  },
];

describe('the allow-list', () => {
  // Proof: a `\bprojectType\b` pattern, whose only lines sit in excluded project.json files,
  // failed this case naming that pattern before it was dropped (2026-10-25).
  it('holds every line pattern to at least one line outside the excluded paths', () => {
    const lines = trackedPaths(REPO).flatMap((path) => {
      const bytes = readFileSync(join(REPO, path));
      return bytes.subarray(0, 8192).includes(0) ? [] : bytes.toString('utf8').split('\n');
    });
    const outlived = PROTECTED_LINES.filter(
      ({ pattern }) => !lines.some((line) => pattern.test(line)),
    ).map(({ pattern }) => pattern.source);
    expect(outlived).toEqual([]);
  }, 30_000);

  it('excludes no glob that matches nothing tracked', () => {
    const tracked = git(REPO, ['ls-files', '-z']).split('\0').filter(Boolean);
    const unused = EXCLUDED_PATHS.filter(({ glob }) => {
      const matcher = new Bun.Glob(glob);
      return !tracked.some((path) => matcher.match(path));
    }).map(({ glob }) => glob);
    expect(unused).toEqual([]);
  });

  // Proof: removing the `client projects` pattern made apply respell the CONTEXT-MAP.md line as
  // "client work packages"; removing the `[PROJECT-ASSIGNMENT-READS-nnn]` pattern made it respell
  // the core test's "requested project" as "requested work package"; each failed here
  // (2026-10-25).
  it('leaves every new-sense witness line as it stands in the tree', () => {
    for (const { path, line } of NEW_SENSE_WITNESSES) {
      expect(readFileSync(join(REPO, path), 'utf8').split('\n')).toContain(line);
      expect(renameText(line, path)).toBe(line);
    }
  });
});

describe('permission-era rename boundaries', () => {
  it('preserves a catalogue permission while renaming an old package argument on the same line', () => {
    const source = "authorize(principal, 'project.manage_budgets', projectId);";
    expect(renameText(source, 'libs/wbs/application/core/src/service/authorize.ts')).toBe(
      "authorize(principal, 'project.manage_budgets', workPackageId);",
    );
  });

  it('does not let a new package kind hide an unrelated old package argument', () => {
    const source = "authorize({kind: 'work_package', chain}, projectId);";
    expect(renameText(source, 'libs/wbs/application/core/src/service/authorize.ts')).toBe(
      "authorize({kind: 'work_package', chain}, workPackageId);",
    );
  });

  it('keeps the actual future ProjectChain parent field distinct from the current package id', () => {
    const path = 'libs/wbs/domain/domain/src/access-role.ts';
    const source = readFileSync(join(REPO, path), 'utf8');
    const renamed = renameText(source, path);
    expect(renamed.includes('export interface ProjectChain {')).toBe(true);
    expect(renamed.includes('export interface WorkPackageChain {')).toBe(true);
    const chain = /export interface WorkPackageChain \{([^}]+)\}/.exec(renamed)?.[1];
    expect(chain).toBeDefined();
    expect(chain).toContain('readonly projectId: string;');
    expect(chain).toContain('readonly workPackageId: string;');
  });

  it('renames the actual unrelated captured planning chain field', () => {
    const path = 'libs/wbs/application/core/src/module/work-item/work-item.resource.ts';
    const old = 'projectId: captured.chain.projectId,';
    const renamed = 'workPackageId: captured.chain.workPackageId,';
    const witnesses = readFileSync(join(REPO, path), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line === old || line === renamed);
    expect(witnesses).toHaveLength(1);
    const current = witnesses.at(0);
    if (current === undefined) throw new Error('actual planning-chain witness absent');
    expect(renameText(old, path)).toBe(renamed);
    expect(renameText(current, path)).toBe(renamed);
  });
});

it('the actual renamed ScopeChain compiles distinct parent and package identities', () => {
  const path = 'libs/wbs/domain/domain/src/access-role.ts';
  const renamed = renameText(readFileSync(join(REPO, path), 'utf8'), path);
  const begin = renamed.indexOf('export type ScopeChain =');
  const end = renamed.indexOf('export interface InterimPackageChain');
  expect(begin).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(begin);
  const contents =
    renamed.slice(begin, end) +
    '\n' +
    [
      "const parent: ProjectChain = {level: 'project', organizationId: 'org', spaceId: null, projectId: 'engagement'};",
      "const child: WorkPackageChain = {level: 'work_package', organizationId: 'org', spaceId: null, projectId: parent.projectId, workPackageId: 'package'};",
      'const parentIdentity: string = child.projectId;',
      'const packageIdentity: string = child.workPackageId;',
    ].join('\n');
  const filename = '/scope-chain-rename-proof.ts';
  const options: ts.CompilerOptions = { noLib: true, noResolve: true, strict: true };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (requested) =>
    requested === filename
      ? ts.createSourceFile(filename, contents, ts.ScriptTarget.Latest, true)
      : undefined;
  const program = ts.createProgram([filename], options, host);
  const compiled = program.getSourceFile(filename);
  if (compiled === undefined) throw new Error('actual ScopeChain compiler source absent');
  expect(
    program.getSemanticDiagnostics(compiled).map((diagnostic) => ({
      code: diagnostic.code,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    })),
  ).toEqual([]);
});

it('closed catalogue spans do not treat punctuation as a permission wildcard', () => {
  expect(renameText("read('projectXread', projectId);", 'a.ts')).toBe(
    "read('workPackageXread', workPackageId);",
  );
  expect(renameText("read('project.read.extra', projectId);", 'a.ts')).toBe(
    "read('workPackage.read.extra', workPackageId);",
  );
});

it('keeps exact permission-model bytes while still rewriting an injected old planning field', () => {
  const path = 'libs/wbs/domain/domain/src/access-role.ts';
  const source = readFileSync(join(REPO, path), 'utf8');
  expect(renameText(source, path) === source).toBe(true);
  const injected = '\nconst legacyProjectId = captured.chain.projectId;\n';
  expect(renameText(source + injected, path)).toBe(
    source + '\nconst legacyWorkPackageId = captured.chain.workPackageId;\n',
  );
});
