import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import {
  ADOPTED_CAPABILITY,
  AGGREGATE_DECLARATIONS,
  AGGREGATE_TARGETS,
  assertAggregateMembership,
  assertBunLevelCollection,
  assertFrontendLevelCollection,
  assertReportCovers,
  collectedFiles,
  collectVitestPhase,
  conformanceFilesIn,
  FRONTEND_LEVEL_TARGETS,
  KNOWN_OUTSIDE_TEST_ROOTS,
  LEVEL_TARGETS,
  levelOf,
  levelTargetNamed,
  parseLevelCommand,
  passedCitations,
  type ProjectManifest,
  readJUnitReport,
  readManifest,
  readSpec,
  reportPathFrom,
  scenarioIdentifiers,
  scenariosWithoutIdentifier,
  TEST_TARGET_NAME,
  testFilesInProject,
  testFilesUnder,
  uncoveredScenarios,
  UNDECLARED_TEST_TARGETS,
  verifyDeclaredCollections,
  verifyTargetInventory,
  WORKSPACE,
} from './test-levels';

const SQLITE = 'libs/wbs/adapters/store-sqlite';
const SQLITE_CONFORMANCE = 'src/testing/source-conformance.db.test.ts';

/** The conformance files a project's own `test:conformance` target names. */
async function conformanceFilesOf(root: string): Promise<readonly string[]> {
  const manifest = await readManifest(root);
  const command = manifest.targets['test:conformance']?.options?.command;
  return command === undefined ? [] : conformanceFilesIn(command);
}

/** Capture a required asynchronous refusal for a normal synchronous assertion. */
async function rejectionOf(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
    return undefined;
  } catch (cause) {
    return cause;
  }
}

/** Run the production verifier over one proposed manifest without changing the workspace. */
function auditManifest(
  root: string,
  manifest: ProjectManifest,
): { exitCode: number | null; stderr: string } {
  const scratch = mkdtempSync(join(tmpdir(), 'test-level-audit-'));
  try {
    const path = join(scratch, 'project.json');
    writeFileSync(path, JSON.stringify(manifest));
    const run = Bun.spawnSync(
      ['bun', 'tools/tool-devsync/src/verify-test-levels-cli.ts', '--manifest', root, path],
      { cwd: WORKSPACE.pathname, stdout: 'pipe', stderr: 'pipe' },
    );
    return { exitCode: run.exitCode, stderr: run.stderr.toString() };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function auditNodeManifest(path: string): { exitCode: number | null; stderr: string } {
  const run = Bun.spawnSync(
    ['bun', 'tools/tool-devsync/src/verify-test-levels-cli.ts', '--node-manifest', path],
    { cwd: WORKSPACE.pathname, stdout: 'pipe', stderr: 'pipe' },
  );
  return { exitCode: run.exitCode, stderr: run.stderr.toString() };
}

describe('the level-selection table', () => {
  it('resolves the plain and the database conformance suffixes through target membership', () => {
    expect([
      levelOf(SQLITE_CONFORMANCE, [SQLITE_CONFORMANCE]),
      levelOf('src/testing/source-conformance.test.ts', ['src/testing/source-conformance.test.ts']),
      levelOf('src/assignment-scope.db.test.ts', [SQLITE_CONFORMANCE]),
      levelOf('src/audit.test.ts', [SQLITE_CONFORMANCE]),
    ]).toEqual(['conformance', 'conformance', 'api', 'unit']);
  });

  it('refuses a file that matches no row', () => {
    expect(() => levelOf('e2e/plan.spec.ts', [])).toThrow('matches no row');
  });

  it('reads the conformance files out of the real targets', async () => {
    expect([
      await conformanceFilesOf(SQLITE),
      await conformanceFilesOf('libs/wbs/adapters/store-memory'),
    ]).toEqual([[SQLITE_CONFORMANCE], ['src/testing/source-conformance.test.ts']]);
  });
});

describe('the adopted projects', () => {
  it('registers the frontend Unit and View phases with separate report outputs', () => {
    expect(
      FRONTEND_LEVEL_TARGETS.map((target) => [
        `${target.project}:${target.target}`,
        target.level,
        target.phases.map((phase) => phase.report),
      ]),
    ).toEqual([
      [
        'wbs-fe-01:test:unit:level',
        'unit',
        ['tmp/junit/wbs-fe-01.unit.xml', 'tmp/junit/wbs-fe-01.unit.root.xml'],
      ],
      [
        'wbs-fe-01:test:view:level',
        'view',
        ['tmp/junit/wbs-fe-01.view.utc.xml', 'tmp/junit/wbs-fe-01.view.auckland.xml'],
      ],
    ]);
  });

  it('refuses an undeclared mixed target from a covered project', async () => {
    const manifest = await readManifest('libs/wbs/adapters/store-memory');
    const mixed = {
      ...manifest,
      targets: {
        ...manifest.targets,
        'test:mixed': {
          options: { command: 'bun test src', cwd: 'libs/wbs/adapters/store-memory' },
        },
      },
    };
    expect(
      String(await rejectionOf(verifyTargetInventory('libs/wbs/adapters/store-memory', mixed))),
    ).toContain(
      'wbs-store-memory:test:mixed is an undeclared mixed target collecting conformance and unit',
    );
    const scratch = mkdtempSync(join(tmpdir(), 'test-level-manifest-'));
    try {
      const path = join(scratch, 'project.json');
      writeFileSync(path, JSON.stringify(mixed));
      const run = Bun.spawnSync(
        [
          'bun',
          'tools/tool-devsync/src/verify-test-levels-cli.ts',
          '--manifest',
          'libs/wbs/adapters/store-memory',
          path,
        ],
        { cwd: WORKSPACE.pathname, stdout: 'pipe', stderr: 'pipe' },
      );
      expect(run.exitCode).toBe(1);
      expect(run.stderr.toString()).toContain(
        'wbs-store-memory:test:mixed is an undeclared mixed target collecting conformance and unit',
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('refuses a declared aggregate whose runner loses a member level', async () => {
    const manifest = await readManifest('libs/wbs/adapters/store-memory');
    const targets = {
      ...manifest.targets,
      'test:unit': {
        ...manifest.targets['test:unit'],
        options: {
          ...manifest.targets['test:unit']?.options,
          command: 'bun test src/testing/source-conformance.test.ts --timeout=10000',
        },
      },
    };
    expect(
      String(
        await rejectionOf(
          verifyTargetInventory('libs/wbs/adapters/store-memory', { ...manifest, targets }),
        ),
      ),
    ).toContain('wbs-store-memory:test:unit aggregate members differ');
  });

  it('refuses an aggregate runner filter that narrows executed cases', async () => {
    const manifest = await readManifest('libs/wbs/adapters/store-memory');
    const command = manifest.targets['test:unit']?.options?.command;
    if (command === undefined) throw new Error('memory aggregate command is absent');
    const narrowed = {
      ...manifest,
      targets: {
        ...manifest.targets,
        'test:unit': {
          ...manifest.targets['test:unit'],
          options: {
            ...manifest.targets['test:unit']?.options,
            command: `${command} --test-name-pattern=conformance`,
          },
        },
      },
    };
    expect(
      String(await rejectionOf(verifyTargetInventory('libs/wbs/adapters/store-memory', narrowed))),
    ).toContain('wbs-store-memory:test:unit aggregate members differ');
  });

  it('refuses aggregate membership that omits a collected level', async () => {
    const manifest = await readManifest('libs/wbs/adapters/store-memory');
    const aggregate = AGGREGATE_DECLARATIONS.find(
      (entry) => entry.qualified === 'wbs-store-memory:test:unit',
    );
    if (aggregate === undefined) throw new Error('memory aggregate declaration is absent');
    expect(
      String(
        await rejectionOf(
          assertAggregateMembership('libs/wbs/adapters/store-memory', manifest, {
            ...aggregate,
            levels: ['unit'],
          }),
        ),
      ),
    ).toContain('wbs-store-memory:test:unit aggregate members differ');
    const targets = { ...manifest.targets };
    delete targets['test:unit'];
    expect(
      String(
        await rejectionOf(
          assertAggregateMembership(
            'libs/wbs/adapters/store-memory',
            { ...manifest, targets },
            aggregate,
          ),
        ),
      ),
    ).toContain('wbs-store-memory:test:unit aggregate is missing');
  });

  it('refuses frontend aggregate dependency and Browser member drift', async () => {
    const manifest = await readManifest('apps/wbs/fe-01');
    const frontend = AGGREGATE_DECLARATIONS.find((entry) => entry.qualified === 'wbs-fe-01:test');
    const browser = AGGREGATE_DECLARATIONS.find(
      (entry) => entry.qualified === 'wbs-fe-01:test:browser:level',
    );
    if (frontend === undefined || browser === undefined)
      throw new Error('frontend aggregate declarations are absent');
    const unitMissing = {
      ...manifest,
      targets: {
        ...manifest.targets,
        test: { ...manifest.targets['test'], dependsOn: [] },
      },
    };
    expect(
      String(await rejectionOf(assertAggregateMembership('apps/wbs/fe-01', unitMissing, frontend))),
    ).toContain('wbs-fe-01:test aggregate members differ');
    const viewCommand = manifest.targets['test']?.options?.command;
    if (viewCommand === undefined) throw new Error('frontend aggregate command is absent');
    const filtered = {
      ...manifest,
      targets: {
        ...manifest.targets,
        test: {
          ...manifest.targets['test'],
          options: {
            ...manifest.targets['test']?.options,
            command: `${viewCommand} --testNamePattern=one`,
          },
        },
      },
    };
    expect(
      String(await rejectionOf(assertAggregateMembership('apps/wbs/fe-01', filtered, frontend))),
    ).toContain('wbs-fe-01:test aggregate members differ');
    const commands = manifest.targets['test:browser:level']?.options?.commands;
    if (commands === undefined) throw new Error('Browser aggregate commands are absent');
    const portableMissing = {
      ...manifest,
      targets: {
        ...manifest.targets,
        'test:browser:level': {
          ...manifest.targets['test:browser:level'],
          options: {
            ...manifest.targets['test:browser:level']?.options,
            commands: commands.slice(0, 2),
          },
        },
      },
    };
    expect(
      String(
        await rejectionOf(assertAggregateMembership('apps/wbs/fe-01', portableMissing, browser)),
      ),
    ).toContain('wbs-fe-01:test:browser:level aggregate members differ');
  });

  it('refuses an unknown test target declaration', async () => {
    const manifest = await readManifest('libs/wbs/adapters/store-memory');
    expect(
      String(
        await rejectionOf(
          verifyTargetInventory('libs/wbs/adapters/store-memory', {
            ...manifest,
            targets: {
              ...manifest.targets,
              'test:unknown': { options: { command: 'echo unknown' } },
            },
          }),
        ),
      ),
    ).toContain('unknown test target declaration wbs-store-memory:test:unknown');
  });

  it('refuses a missing required level target', async () => {
    const manifest = await readManifest('libs/wbs/adapters/store-memory');
    const targets = { ...manifest.targets };
    delete targets['test:conformance:level'];
    expect(
      String(
        await rejectionOf(
          verifyTargetInventory('libs/wbs/adapters/store-memory', { ...manifest, targets }),
        ),
      ),
    ).toContain('wbs-store-memory:test:conformance:level is missing from project manifest');
    const noCommand = {
      ...manifest,
      targets: {
        ...manifest.targets,
        'test:unit:level': {
          ...manifest.targets['test:unit:level'],
          options: { ...manifest.targets['test:unit:level']?.options, command: undefined },
        },
      },
    };
    expect(
      String(
        await rejectionOf(
          verifyDeclaredCollections(new Map([['libs/wbs/adapters/store-memory', noCommand]])),
        ),
      ),
    ).toContain('wbs-store-memory:test:unit:level has no declared command');
  });

  it('keeps store-memory conformance separate from its legacy unit aggregate', () => {
    expect(AGGREGATE_TARGETS).toContain('wbs-store-memory:test:unit');
    const names = LEVEL_TARGETS.map(({ project, target }) => `${project}:${target}`);
    expect(names).toContain('wbs-store-memory:test:unit:level');
    expect(names).toContain('wbs-store-memory:test:conformance:level');
    expect(names).toContain('wbs-store-sqlite:test:conformance:level');
  });
  it('keeps every test file outside a declared test root on the known list', async () => {
    const outside: string[] = [];
    for (const root of new Set(LEVEL_TARGETS.map((target) => target.root))) {
      const declared = new Set(
        (
          await Promise.all(
            LEVEL_TARGETS.filter((target) => target.root === root).flatMap((target) =>
              target.testRoots.map((testRoot) => testFilesUnder(root, testRoot)),
            ),
          )
        ).flatMap((files) => files.map((file) => `${root}/${file}`)),
      );
      outside.push(...(await testFilesInProject(root)).filter((file) => !declared.has(file)));
    }
    expect(outside.sort()).toEqual(Object.keys(KNOWN_OUTSIDE_TEST_ROOTS).sort());
  });

  it('accounts for every test-running target as a level, an aggregate or a known exception', async () => {
    const unaccounted: string[] = [];
    const declared = new Set(LEVEL_TARGETS.map(({ project, target }) => `${project}:${target}`));
    for (const root of new Set(LEVEL_TARGETS.map((target) => target.root))) {
      const manifest = await readManifest(root);
      for (const name of Object.keys(manifest.targets)) {
        if (!TEST_TARGET_NAME.test(name)) continue;
        const qualified = `${manifest.name}:${name}`;
        const accounted =
          declared.has(qualified) ||
          // Proof (B-5): with AGGREGATE_TARGETS emptied this case failed naming `wbs-core:test` and
          // `wbs-store-sqlite:test` as unaccounted (2026-09-20).
          AGGREGATE_TARGETS.includes(qualified) ||
          qualified in UNDECLARED_TEST_TARGETS;
        if (!accounted) unaccounted.push(qualified);
      }
    }
    expect(unaccounted.sort()).toEqual([]);
  });
});

describe('declared level targets', () => {
  it('refuses Bun Nx envelope and report drift through the production CLI', async () => {
    const root = SQLITE;
    const manifest = await readManifest(root);
    const entry = manifest.targets['test:api'];
    const command = entry?.options?.command;
    if (entry === undefined || command === undefined)
      throw new Error('SQLite API command is absent');
    const faults: readonly [string, typeof entry][] = [
      ['executor differs from declaration', { ...entry, executor: undefined }],
      ['Nx envelope changes collection', { ...entry, dependsOn: ['test:conformance:level'] }],
      ['Nx envelope changes collection', { ...entry, configurations: { alternate: {} } }],
      ['Nx envelope changes collection', { ...entry, defaultConfiguration: 'alternate' }],
      [
        'Nx envelope changes collection',
        { ...entry, options: { ...entry.options, args: ['--test-name-pattern=NO_MATCH'] } },
      ],
      [
        'Nx envelope changes collection',
        { ...entry, options: { ...entry.options, commands: ['bun test src'] } },
      ],
      [
        'Nx envelope changes collection',
        { ...entry, options: { ...entry.options, env: { TZ: 'Pacific/Auckland' } } },
      ],
      [
        'Nx envelope changes collection',
        { ...entry, options: { ...entry.options, forwardAllArgs: true } },
      ],
      [
        'cwd differs from declaration',
        { ...entry, options: { ...entry.options, cwd: 'wrong/project' } },
      ],
      [
        'report differs from declaration',
        {
          ...entry,
          options: { ...entry.options, command: command.replace('--reporter=junit ', '') },
        },
      ],
      [
        'report differs from declaration',
        {
          ...entry,
          options: {
            ...entry.options,
            command: command.replaceAll('wbs-store-sqlite.api.xml', 'wrong.xml'),
          },
        },
      ],
      [
        'report directory differs from declaration',
        {
          ...entry,
          options: {
            ...entry.options,
            command: command.replace(
              'mkdir -p ../../../../tmp/junit',
              'mkdir -p ../../../../tmp/wrong',
            ),
          },
        },
      ],
    ];
    for (const [fault, changed] of faults) {
      const run = auditManifest(root, {
        ...manifest,
        targets: { ...manifest.targets, 'test:api': changed },
      });
      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain(`error: wbs-store-sqlite:test:api ${fault}`);
    }
  }, 30_000);

  it('refuses frontend runner grammar drift through the production CLI', async () => {
    const root = 'apps/wbs/fe-01';
    const manifest = await readManifest(root);
    const entry = manifest.targets['test:unit:level'];
    const command = entry?.options?.command;
    if (entry === undefined || command === undefined)
      throw new Error('frontend Unit command is absent');
    for (const [, changed] of [
      ['reporter', command.replaceAll('--reporter=junit ', '')],
      ['selection', `${command} --testNamePattern=NO_MATCH`],
      ['timezone', command.replace('TZ=UTC', 'TZ=Pacific/Auckland')],
    ] as const) {
      const run = auditManifest(root, {
        ...manifest,
        targets: {
          ...manifest.targets,
          'test:unit:level': { ...entry, options: { ...entry.options, command: changed } },
        },
      });
      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain(
        'error: wbs-fe-01:test:unit:level runner selection, reporter or phase outputs differ from declaration',
      );
    }
  }, 30_000);

  it('refuses an absent cross-project Browser aggregate member through the CLI', async () => {
    const root = 'libs/wbs/application/core';
    const manifest = await readManifest(root);
    const targets = { ...manifest.targets };
    delete targets['test:browser:portable:level'];
    const run = auditManifest(root, { ...manifest, targets });
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain(
      'error: wbs-fe-01:test:browser:level member wbs-core:test:browser:portable:level is absent',
    );
    const portable = manifest.targets['test:browser:portable:level'];
    if (portable === undefined) throw new Error('portable Browser target is absent');
    const changed = auditManifest(root, {
      ...manifest,
      targets: {
        ...manifest.targets,
        'test:browser:portable:level': {
          ...portable,
          options: { ...portable.options, command: 'echo no-browser' },
        },
      },
    });
    expect(changed.exitCode).toBe(1);
    expect(changed.stderr).toContain(
      'error: wbs-fe-01:test:browser:level member wbs-core:test:browser:portable:level differs from declaration',
    );
    const forwarded = auditManifest(root, {
      ...manifest,
      targets: {
        ...manifest.targets,
        'test:browser:portable:level': {
          ...portable,
          options: { ...portable.options, args: ['--test-name-pattern=NO_MATCH'] },
        },
      },
    });
    expect(forwarded.exitCode).toBe(1);
    expect(forwarded.stderr).toContain(
      'error: wbs-fe-01:test:browser:level member wbs-core:test:browser:portable:level differs from declaration',
    );
    const frontend = await readManifest('apps/wbs/fe-01');
    const browser = frontend.targets['test:browser:level'];
    if (browser === undefined) throw new Error('frontend Browser aggregate is absent');
    const envelope = auditManifest('apps/wbs/fe-01', {
      ...frontend,
      targets: {
        ...frontend.targets,
        'test:browser:level': { ...browser, executor: undefined },
      },
    });
    expect(envelope.exitCode).toBe(1);
    expect(envelope.stderr).toContain(
      'error: wbs-fe-01:test:browser:level aggregate members differ from declaration',
    );
    const extra = auditManifest('apps/wbs/fe-01', {
      ...frontend,
      targets: {
        ...frontend.targets,
        'test:browser:level': {
          ...browser,
          options: { ...browser.options, args: ['--test-name-pattern=NO_MATCH'] },
        },
      },
    });
    expect(extra.exitCode).toBe(1);
    expect(extra.stderr).toContain(
      'error: wbs-fe-01:test:browser:level aggregate members differ from declaration',
    );
  }, 30_000);

  it('refuses a Node list containing a View suite outside NODE_SUITES', () => {
    const realBunx = Bun.which('bunx');
    if (realBunx === null) throw new Error('bunx is required for the Node list fault');
    const scratch = mkdtempSync(join(tmpdir(), 'test-level-node-drift-'));
    try {
      const bin = join(scratch, 'bin');
      mkdirSync(bin);
      const wrapper = join(bin, 'bunx');
      writeFileSync(
        wrapper,
        `#!/bin/sh
"$REAL_BUNX" "$@"
status=$?
[ "$status" -eq 0 ] || exit "$status"
for arg in "$@"; do case "$arg" in --json=*) listing="\${arg#--json=}";; esac; done
case " $* " in *vitest.node.config.ts*) phase=node;; *vitest.view.config.ts*) phase=view;; *) phase=other;; esac
LIST_JSON="$listing" LIST_PHASE="$phase" "$REAL_BUN" -e 'const path=process.env.LIST_JSON; const phase=process.env.LIST_PHASE; const file=process.env.LIST_VIEW; const entries=await Bun.file(path).json(); if(phase==="node") entries.push({file}); if(phase==="view") entries.splice(0,entries.length,...entries.filter(entry=>entry.file!==file)); await Bun.write(path,JSON.stringify(entries));'
`,
      );
      chmodSync(wrapper, 0o755);
      const run = Bun.spawnSync(['bun', 'tools/tool-devsync/src/verify-test-levels-cli.ts'], {
        cwd: WORKSPACE.pathname,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env['PATH'] ?? ''}`,
          REAL_BUNX: realBunx,
          REAL_BUN: process.execPath,
          LIST_VIEW: join(WORKSPACE.pathname, 'apps/wbs/fe-01/src/lib/api.test.ts'),
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(run.exitCode).toBe(1);
      expect(run.stderr.toString()).toContain(
        'error: vitest.node.config.ts collection differs from NODE_SUITES',
      );
      expect(run.stderr.toString()).toContain('apps/wbs/fe-01/src/lib/api.test.ts');
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 30_000);
  it('refuses missing, unreadable and malformed Node suite manifests through the CLI', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'test-level-node-manifest-'));
    try {
      const absent = join(scratch, 'absent.json');
      const missing = auditNodeManifest(absent);
      expect(missing.exitCode).toBe(1);
      expect(missing.stderr).toContain(
        `error: ${absent}: Node suite manifest is missing, unreadable or malformed`,
      );
      const path = join(scratch, 'node.json');
      writeFileSync(path, '{}');
      chmodSync(path, 0o000);
      const unreadable = auditNodeManifest(path);
      expect(unreadable.exitCode).toBe(1);
      expect(unreadable.stderr).toContain(
        `error: ${path}: Node suite manifest is missing, unreadable or malformed`,
      );
      chmodSync(path, 0o600);
      writeFileSync(path, '{broken');
      const malformed = auditNodeManifest(path);
      expect(malformed.exitCode).toBe(1);
      expect(malformed.stderr).toContain(
        `error: ${path}: Node suite manifest is missing, unreadable or malformed`,
      );
      const link = join(scratch, 'linked.json');
      symlinkSync(join(WORKSPACE.pathname, 'apps/wbs/fe-01/vitest.node-suites.json'), link);
      const linked = auditNodeManifest(link);
      expect(linked.exitCode).toBe(1);
      expect(linked.stderr).toContain(
        `error: ${link}: Node suite manifest is missing, unreadable or malformed`,
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('refuses invalid Node suite entries and omitted authority members through the CLI', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'test-level-node-entries-'));
    const root = join(WORKSPACE.pathname, 'apps/wbs/fe-01');
    const manifest = JSON.parse(readFileSync(join(root, 'vitest.node-suites.json'), 'utf8')) as {
      schemaVersion: number;
      suites: { file: string; reason?: string }[];
    };
    const path = join(scratch, 'node.json');
    const directory = join(root, `nonregular-${String(process.pid)}.test.ts`);
    const link = join(root, `escaped-${String(process.pid)}.test.ts`);
    const outside = mkdtempSync(join(tmpdir(), 'test-level-outside-'));
    const parentLink = join(root, `outside-${String(process.pid)}`);
    mkdirSync(directory);
    symlinkSync('/etc/hosts', link);
    writeFileSync(join(outside, 'file.test.ts'), 'export {};\n');
    symlinkSync(outside, parentLink);
    try {
      const first = manifest.suites[0];
      for (const [changed, message] of [
        [
          { ...manifest, schemaVersion: 99 },
          `error: ${path}: Node suite manifest has an invalid schema or version`,
        ],
        [
          { ...manifest, extra: true },
          `error: ${path}: Node suite manifest has an invalid schema or version`,
        ],
        [
          { ...manifest, suites: [] },
          `error: ${path}: Node suite manifest has an invalid schema or version`,
        ],
        [
          { ...manifest, suites: [...manifest.suites, first] },
          `error: ${path}: duplicate Node suite`,
        ],
        [
          { ...manifest, suites: [{ file: '../escape.test.ts' }] },
          `error: ${path}: Node suite path is noncanonical`,
        ],
        [
          { ...manifest, suites: [{ file: 'src\\escape.test.ts' }] },
          `error: ${path}: Node suite path is noncanonical`,
        ],
        [
          { ...manifest, suites: [{ file: 'src/non-test.txt' }] },
          `error: ${path}: Node suite path is noncanonical`,
        ],
        [
          { ...manifest, suites: [{ ...first, reason: ' ' }] },
          `error: ${path}: Node suite manifest has an invalid entry`,
        ],
        [
          { ...manifest, suites: [{ ...first, surprise: true }] },
          `error: ${path}: Node suite manifest has an invalid entry`,
        ],
        [
          { ...manifest, suites: [{ file: 'src/absent.test.ts' }] },
          `error: ${path}: Node suite is missing, nonregular or escapes project`,
        ],
        [
          { ...manifest, suites: [{ file: `nonregular-${String(process.pid)}.test.ts` }] },
          `error: ${path}: Node suite is missing, nonregular or escapes project`,
        ],
        [
          { ...manifest, suites: [{ file: `escaped-${String(process.pid)}.test.ts` }] },
          `error: ${path}: Node suite is missing, nonregular or escapes project`,
        ],
        [
          { ...manifest, suites: [{ file: `outside-${String(process.pid)}/file.test.ts` }] },
          `error: ${path}: Node suite is missing, nonregular or escapes project`,
        ],
        [
          { ...manifest, suites: manifest.suites.slice(1) },
          'error: vitest.node.config.ts collection differs from NODE_SUITES',
        ],
      ] as const) {
        writeFileSync(path, JSON.stringify(changed));
        const run = auditNodeManifest(path);
        expect(run.exitCode).toBe(1);
        expect(run.stderr).toContain(message);
      }
    } finally {
      rmSync(link);
      rmSync(parentLink);
      rmSync(directory, { recursive: true });
      rmSync(outside, { recursive: true, force: true });
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 30_000);

  it('names the Conformance file and both levels when the API selector collects it', async () => {
    const target = LEVEL_TARGETS.find(
      (entry) => entry.project === 'wbs-store-sqlite' && entry.target === 'test:api',
    );
    if (target === undefined) throw new Error('SQLite API declaration is absent');
    const manifest = await readManifest(target.root);
    const command = manifest.targets[target.target]?.options?.command;
    if (command === undefined) throw new Error('SQLite API command is absent');
    const foreign = command.replace(" ! -name 'source-conformance.db.test.ts'", '');
    expect(foreign).not.toBe(command);
    const scratch = mkdtempSync(join(tmpdir(), 'test-level-api-'));
    try {
      const path = join(scratch, 'project.json');
      writeFileSync(
        path,
        JSON.stringify({
          ...manifest,
          targets: {
            ...manifest.targets,
            'test:api': {
              ...manifest.targets['test:api'],
              options: { ...manifest.targets['test:api']?.options, command: foreign },
            },
          },
        }),
      );
      const run = Bun.spawnSync(
        [
          'bun',
          'tools/tool-devsync/src/verify-test-levels-cli.ts',
          '--manifest',
          target.root,
          path,
        ],
        { cwd: WORKSPACE.pathname, stdout: 'pipe', stderr: 'pipe' },
      );
      expect(run.exitCode).toBe(1);
      expect(run.stderr.toString()).toContain(
        'wbs-store-sqlite:test:api is declared api and collects libs/wbs/adapters/store-sqlite/src/testing/source-conformance.db.test.ts, which is conformance',
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
    expect(() => assertBunLevelCollection(target, foreign, [SQLITE_CONFORMANCE])).toThrow(
      'wbs-store-sqlite:test:api is declared api and collects libs/wbs/adapters/store-sqlite/src/testing/source-conformance.db.test.ts, which is conformance',
    );
  });

  it('refuses a selected Bun file that is missing', async () => {
    const target = LEVEL_TARGETS.find(
      (entry) => entry.project === 'wbs-store-sqlite' && entry.target === 'test:api',
    );
    if (target === undefined) throw new Error('SQLite API declaration is absent');
    const manifest = await readManifest(target.root);
    const command = manifest.targets[target.target]?.options?.command;
    if (command === undefined) throw new Error('SQLite API command is absent');
    const absent = command.replace(
      "find src -name '*.db.test.ts' ! -name 'source-conformance.db.test.ts'",
      'printf src/absent.db.test.ts',
    );
    expect(absent).not.toBe(command);
    expect(() => assertBunLevelCollection(target, absent, [SQLITE_CONFORMANCE])).toThrow(
      'collected file is missing or nonregular',
    );
  });

  it('refuses an empty Bun selection instead of crediting no cases', async () => {
    const target = LEVEL_TARGETS.find(
      (entry) => entry.project === 'wbs-store-sqlite' && entry.target === 'test:api',
    );
    if (target === undefined) throw new Error('SQLite API declaration is absent');
    const manifest = await readManifest(target.root);
    const command = manifest.targets[target.target]?.options?.command;
    if (command === undefined) throw new Error('SQLite API command is absent');
    const empty = command.replace(
      "find src -name '*.db.test.ts' ! -name 'source-conformance.db.test.ts'",
      'printf ""',
    );
    expect(empty).not.toBe(command);
    expect(() => assertBunLevelCollection(target, empty, [SQLITE_CONFORMANCE])).toThrow(
      'wbs-store-sqlite:test:api collected no files',
    );
  });

  it('refuses a Bun test file omitted by every declared level target', async () => {
    const root = 'libs/wbs/adapters/store-memory';
    const manifest = await readManifest(root);
    const command = manifest.targets['test:unit:level']?.options?.command;
    if (command === undefined) throw new Error('memory Unit selector is absent');
    const omitted = command.replace(
      "find src -name '*.test.ts' ! -path 'src/testing/source-conformance.test.ts'",
      "find src -name '*.test.ts' ! -name 'space-fixture.test.ts' ! -path 'src/testing/source-conformance.test.ts'",
    );
    expect(omitted).not.toBe(command);
    const scratch = mkdtempSync(join(tmpdir(), 'test-level-omitted-'));
    try {
      const path = join(scratch, 'project.json');
      writeFileSync(
        path,
        JSON.stringify({
          ...manifest,
          targets: {
            ...manifest.targets,
            'test:unit:level': {
              ...manifest.targets['test:unit:level'],
              options: { ...manifest.targets['test:unit:level']?.options, command: omitted },
            },
          },
        }),
      );
      const run = Bun.spawnSync(
        ['bun', 'tools/tool-devsync/src/verify-test-levels-cli.ts', '--manifest', root, path],
        { cwd: WORKSPACE.pathname, stdout: 'pipe', stderr: 'pipe' },
      );
      expect(run.exitCode).toBe(1);
      expect(run.stderr.toString()).toContain(
        'wbs-store-memory level targets do not collect libs/wbs/adapters/store-memory/src/space-fixture.test.ts',
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('collects frontend phase files from the actual Vitest configs as canonical paths', () => {
    for (const target of FRONTEND_LEVEL_TARGETS) {
      for (const phase of target.phases) {
        const files = collectVitestPhase(target.root, phase.config);
        expect(files.length).toBeGreaterThan(0);
        expect(files.every((file) => file.startsWith(`${target.root}/`))).toBe(true);
      }
    }
  }, 30_000);

  it('verifies frontend phase membership and report paths against production commands', async () => {
    const manifest = await readManifest('apps/wbs/fe-01');
    for (const target of FRONTEND_LEVEL_TARGETS) {
      expect(assertFrontendLevelCollection(target, manifest).length).toBeGreaterThan(0);
    }
    await verifyDeclaredCollections();
  }, 30_000);

  it('runs the collection verifier through its production CLI', async () => {
    const manifest = await readManifest('tools/tool-devsync');
    expect(manifest.targets['test-levels:verify']?.options?.command).toBe(
      'bun tools/tool-devsync/src/verify-test-levels-cli.ts',
    );
    const run = Bun.spawnSync(['bun', 'tools/tool-devsync/src/verify-test-levels-cli.ts'], {
      cwd: WORKSPACE.pathname,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(run.exitCode).toBe(0);
    expect(run.stdout.toString()).toContain('Verified declared test collections');
  }, 30_000);

  it('refuses a manifest audit for an unknown project root or identity', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'test-level-identity-'));
    try {
      const manifest = await readManifest('libs/wbs/adapters/store-memory');
      const path = join(scratch, 'project.json');
      writeFileSync(path, JSON.stringify(manifest));
      const unknown = Bun.spawnSync(
        [
          'bun',
          'tools/tool-devsync/src/verify-test-levels-cli.ts',
          '--manifest',
          'wrong/root',
          path,
        ],
        { cwd: WORKSPACE.pathname, stdout: 'pipe', stderr: 'pipe' },
      );
      expect(unknown.exitCode).toBe(1);
      expect(unknown.stderr.toString()).toContain('unknown manifest override project wrong/root');
      writeFileSync(path, JSON.stringify({ ...manifest, name: 'wrong-project' }));
      const mismatch = Bun.spawnSync(
        [
          'bun',
          'tools/tool-devsync/src/verify-test-levels-cli.ts',
          '--manifest',
          'libs/wbs/adapters/store-memory',
          path,
        ],
        { cwd: WORKSPACE.pathname, stdout: 'pipe', stderr: 'pipe' },
      );
      expect(mismatch.exitCode).toBe(1);
      expect(mismatch.stderr.toString()).toContain(
        'manifest identity wrong-project differs from wbs-store-memory',
      );
      writeFileSync(path, '{}');
      const malformed = Bun.spawnSync(
        [
          'bun',
          'tools/tool-devsync/src/verify-test-levels-cli.ts',
          '--manifest',
          'libs/wbs/adapters/store-memory',
          path,
        ],
        { cwd: WORKSPACE.pathname, stdout: 'pipe', stderr: 'pipe' },
      );
      expect(malformed.exitCode).toBe(1);
      expect(malformed.stderr.toString()).toContain(`error: ${path} is not a project manifest`);
      const invalidArgs = Bun.spawnSync(
        ['bun', 'tools/tool-devsync/src/verify-test-levels-cli.ts', '--manifest'],
        { cwd: WORKSPACE.pathname, stdout: 'pipe', stderr: 'pipe' },
      );
      expect(invalidArgs.exitCode).toBe(1);
      expect(invalidArgs.stderr.toString()).toContain('error: usage: verify-test-levels-cli.ts');
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('refuses a frontend root suite omitted by all declared phases', () => {
    const file = `apps/wbs/fe-01/uncollected-${String(process.pid)}.test.ts`;
    const absolute = join(WORKSPACE.pathname, file);
    writeFileSync(absolute, 'export {};\n');
    try {
      const run = Bun.spawnSync(['bun', 'tools/tool-devsync/src/verify-test-levels-cli.ts'], {
        cwd: WORKSPACE.pathname,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(run.exitCode).toBe(1);
      expect(run.stderr.toString()).toContain(`wbs-fe-01 level targets do not collect ${file}`);
    } finally {
      rmSync(absolute);
    }
  }, 30_000);

  it('names a foreign View file in a target declared Unit', async () => {
    const manifest = await readManifest('apps/wbs/fe-01');
    const view = FRONTEND_LEVEL_TARGETS.find((target) => target.level === 'view');
    if (view === undefined) throw new Error('frontend View declaration is absent');
    expect(() => assertFrontendLevelCollection({ ...view, level: 'unit' }, manifest)).toThrow(
      'wbs-fe-01:test:view:level is declared unit and collects apps/wbs/fe-01/',
    );
  }, 30_000);

  it('refuses frontend command, working directory, phase reports and cleanup drift', async () => {
    const manifest = await readManifest('apps/wbs/fe-01');
    const target = FRONTEND_LEVEL_TARGETS.find((entry) => entry.level === 'unit');
    if (target === undefined) throw new Error('frontend Unit declaration is absent');
    const original = manifest.targets[target.target];
    const command = original?.options?.command;
    if (original === undefined || command === undefined)
      throw new Error('frontend Unit command is absent');
    const faults = [
      [
        { ...original, options: { ...original.options, command: undefined } },
        'has no declared command',
      ],
      [
        { ...original, options: { ...original.options, cwd: 'wrong/project' } },
        'cwd differs from declaration',
      ],
      [
        {
          ...original,
          options: {
            ...original.options,
            command: command.replace('vitest.unit-root.config.ts', 'vitest.view.config.ts'),
          },
        },
        'runner selection, reporter or phase outputs differ',
      ],
      [
        {
          ...original,
          options: {
            ...original.options,
            command: command.replace(
              'rm -f ../../../tmp/junit/wbs-fe-01.unit.xml',
              'rm -f ../../../tmp/junit/wrong.xml',
            ),
          },
        },
        'runner selection, reporter or phase outputs differ',
      ],
    ] as const;
    for (const [entry, message] of faults) {
      expect(() =>
        assertFrontendLevelCollection(target, {
          ...manifest,
          targets: { ...manifest.targets, [target.target]: entry },
        }),
      ).toThrow(message);
    }
  });

  it('refuses a frontend file collected in two phases', async () => {
    const manifest = await readManifest('apps/wbs/fe-01');
    const target = FRONTEND_LEVEL_TARGETS.find((entry) => entry.level === 'unit');
    if (target === undefined) throw new Error('frontend Unit declaration is absent');
    const command = manifest.targets[target.target]?.options?.command;
    const first = target.phases[0];
    const second = target.phases[1];
    if (command === undefined) throw new Error('frontend Unit command is absent');
    const repeated = command.replace(second.config, first.config);
    expect(repeated).not.toBe(command);
    expect(() =>
      assertFrontendLevelCollection(
        { ...target, phases: [first, { ...second, config: first.config }] },
        {
          ...manifest,
          targets: {
            ...manifest.targets,
            [target.target]: {
              ...manifest.targets[target.target],
              options: { ...manifest.targets[target.target]?.options, command: repeated },
            },
          },
        },
      ),
    ).toThrow('collects apps/wbs/fe-01/');
  }, 30_000);

  it('refuses bad Vitest list output and removes only its owned temporary directory', () => {
    const script =
      "import { collectVitestPhase } from './tools/tool-devsync/src/test-levels.ts'; collectVitestPhase('apps/wbs/fe-01', 'vitest.unit-root.config.ts');";
    for (const [, body, message] of [
      ['absent', '#!/bin/sh\nexit 0\n', 'output is absent or malformed'],
      [
        'malformed',
        '#!/bin/sh\nfor arg in "$@"; do case "$arg" in --json=*) printf broken > "${arg#--json=}";; esac; done\nexit 0\n',
        'output is absent or malformed',
      ],
      [
        'directory',
        '#!/bin/sh\nfor arg in "$@"; do case "$arg" in --json=*) mkdir "${arg#--json=}";; esac; done\nexit 0\n',
        'output is absent or malformed',
      ],
      [
        'empty',
        '#!/bin/sh\nfor arg in "$@"; do case "$arg" in --json=*) printf "[]" > "${arg#--json=}";; esac; done\nexit 0\n',
        'collected no files',
      ],
      [
        'bad-entry',
        '#!/bin/sh\nfor arg in "$@"; do case "$arg" in --json=*) printf "[{}]" > "${arg#--json=}";; esac; done\nexit 0\n',
        'malformed file',
      ],
      [
        'duplicate',
        '#!/bin/sh\nfor arg in "$@"; do case "$arg" in --json=*) printf "[{\\"file\\":\\"%s\\"},{\\"file\\":\\"%s\\"}]" "$LIST_FILE" "$LIST_FILE" > "${arg#--json=}";; esac; done\nexit 0\n',
        'duplicate file',
      ],
      [
        'outside',
        '#!/bin/sh\nfor arg in "$@"; do case "$arg" in --json=*) printf "[{\\"file\\":\\"/etc/hosts\\"}]" > "${arg#--json=}";; esac; done\nexit 0\n',
        'collected path escapes project',
      ],
      [
        'directory-entry',
        '#!/bin/sh\nfor arg in "$@"; do case "$arg" in --json=*) printf "[{\\"file\\":\\"%s\\"}]" "$LIST_DIRECTORY" > "${arg#--json=}";; esac; done\nexit 0\n',
        'collected file is missing or nonregular',
      ],
      ['failed', '#!/bin/sh\nexit 7\n', 'Vitest collection failed'],
    ] as const) {
      const scratch = mkdtempSync(join(tmpdir(), 'vitest-list-fault-'));
      try {
        const bin = join(scratch, 'bin');
        mkdirSync(bin);
        const wrapper = join(bin, 'bunx');
        writeFileSync(
          wrapper,
          body.replace(
            '#!/bin/sh\n',
            '#!/bin/sh\nfor arg in "$@"; do case "$arg" in --json=*) printf "%s" "${arg#--json=}" > "$LIST_TRACE";; esac; done\n',
          ),
        );
        chmodSync(wrapper, 0o755);
        const call = Bun.spawnSync([process.execPath, '-e', script], {
          cwd: WORKSPACE.pathname,
          env: {
            ...process.env,
            PATH: `${bin}:${process.env['PATH'] ?? ''}`,
            LIST_FILE: join(WORKSPACE.pathname, 'apps/wbs/fe-01/vitest.unit-root.config.ts'),
            LIST_DIRECTORY: join(WORKSPACE.pathname, 'apps/wbs/fe-01/src'),
            LIST_TRACE: join(scratch, 'trace'),
          },
          stdout: 'pipe',
          stderr: 'pipe',
        });
        expect(call.exitCode).toBe(1);
        expect(call.stderr.toString()).toContain(message);
        expect(existsSync(dirname(readFileSync(join(scratch, 'trace'), 'utf8')))).toBe(false);
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    }
  }, 30_000);
  it('refuses a guarded target that clears a different JUnit report', async () => {
    const manifest = await readManifest('libs/wbs/adapters/store-memory');
    const command = manifest.targets['test:unit:level']?.options?.command;
    if (command === undefined) throw new Error('memory Unit level has no command');
    const wrongClear = command.replace(
      'rm -f ../../../../tmp/junit/wbs-store-memory.unit.xml',
      'rm -f ../../../../tmp/junit/wrong.xml',
    );
    expect(wrongClear).not.toBe(command);
    expect(() => parseLevelCommand(wrongClear)).toThrow(
      'guarded level target clears ../../../../tmp/junit/wrong.xml but writes ../../../../tmp/junit/wbs-store-memory.unit.xml',
    );
  });

  // Proof: with the memory Unit command's empty-file guard changed to inspect "never",
  // this production-command case failed because Bun discovered unrelated.test.ts and exited 0.
  // Removing each selected fixture and deleting each selector root also confirms stale JUnit is
  // cleared before the selector can fail (2026-10-09).
  // Proof: on each SQLite API/Unit and core Unit production command, removing rm left stale XML
  // readable; changing `$files` to `never` let Bun run unrelated.test.ts; changing `&& if` to
  // `; if` mislabeled failed find as no-cases. All nine injections failed this case (2026-10-09).
  it('refuses empty or failed selection before Bun runs and clears stale JUnit', async () => {
    const guarded = LEVEL_TARGETS;
    expect(guarded).toHaveLength(6);
    for (const target of guarded) {
      const manifest = await readManifest(target.root);
      const command = manifest.targets[target.target]?.options?.command;
      if (command === undefined)
        throw new Error(`${target.project}:${target.target} has no command`);
      const scratchRoot = mkdtempSync(join(tmpdir(), 'test-level-empty-'));
      try {
        const projectRoot = join(scratchRoot, target.root);
        const report = join(scratchRoot, target.report);
        const sentinel = join(projectRoot, 'unrelated.test.ts');
        const marker = join(projectRoot, 'unrelated-ran');
        mkdirSync(join(projectRoot, 'src/testing'), { recursive: true });
        mkdirSync(join(scratchRoot, 'tmp/junit'), { recursive: true });
        writeFileSync(
          sentinel,
          `import { test } from 'bun:test'; test('unrelated', () => { Bun.write('${marker}', 'ran'); });\n`,
        );

        for (const failure of ['empty', 'selector-error'] as const) {
          writeFileSync(
            report,
            '<testsuites><testsuite><testcase name="stale" file="old"/></testsuite></testsuites>',
          );
          if (failure === 'selector-error') rmSync(join(projectRoot, 'src'), { recursive: true });
          const invocation = Bun.spawnSync(['sh', '-c', command], {
            cwd: projectRoot,
            stdout: 'pipe',
            stderr: 'pipe',
          });
          const output = `${invocation.stdout.toString()}${invocation.stderr.toString()}`;
          expect(
            invocation.exitCode,
            `${target.project}:${target.target} ${failure}: ${output}`,
          ).not.toBe(0);
          if (failure === 'empty')
            expect(output).toContain(`no-cases: ${target.project}:${target.target}`);
          if (failure === 'selector-error') {
            expect(output).toContain('find:');
            expect(output).not.toContain('no-cases:');
          }
          expect(() => readFileSync(report)).toThrow();
          expect(() => readFileSync(marker)).toThrow();
        }
      } finally {
        rmSync(scratchRoot, { recursive: true, force: true });
      }
    }
  }, 30_000);

  // Three shell spawns and three directory walks: the batch-2 brief's rule for a
  // test that spawns more than twice.
  it('collects exactly the files of its own level', async () => {
    const wrong: string[] = [];
    for (const target of LEVEL_TARGETS) {
      const label = `${target.project}:${target.target}`;
      const manifest = await readManifest(target.root);
      const declared = manifest.targets[target.target];
      if (declared === undefined) {
        wrong.push(`${label} is not declared in project.json`);
        continue;
      }
      // Proof (B-9): with only `wbs-core:test:unit`'s `cwd` changed to `libs/wbs/application` this
      // failed on `wbs-core:test:unit runs in libs/wbs/application, not libs/wbs/application/core`.
      // The aggregate `test` target has the same `cwd` line first in the file; two executor attempts
      // patched that one and the case rightly stayed green (2026-09-20).
      if (declared.options?.cwd !== target.root) {
        wrong.push(`${label} runs in ${String(declared.options?.cwd)}, not ${target.root}`);
        continue;
      }
      let selector;
      try {
        selector = parseLevelCommand(declared.options.command ?? '').selector;
      } catch (cause) {
        // Proof (B-3): `--test-name-pattern=NO_MATCH` added to `wbs-store-sqlite:test:api` failed both
        // cases on `command shape: a declared level target may not pass
        // --test-name-pattern=NO_MATCH; only coverage and JUnit reporting flags are allowed`
        // (2026-09-20).
        wrong.push(`${label} command shape: ${(cause as Error).message}`);
        continue;
      }
      const conformance = await conformanceFilesOf(target.root);
      // Proof (B-4): a selector of `find src --bogus-flag` made this throw `the file selector
      // failed` before any array was compared (2026-09-20).
      const collected = collectedFiles(target.root, selector);
      for (const file of collected) {
        const level = levelOf(file, conformance);
        // Proof (B-1): with the `! -name 'source-conformance.db.test.ts'` exclusion removed from
        // `test:api` this failed on `wbs-store-sqlite:test:api is declared api and collects
        // src/testing/source-conformance.db.test.ts, which is conformance` (2026-09-20).
        if (level !== target.level) {
          wrong.push(
            `${label} is declared ${target.level} and collects ${file}, which is ${level}`,
          );
        }
      }
      const owed = (
        await Promise.all(target.testRoots.map((root) => testFilesUnder(target.root, root)))
      )
        .flat()
        .filter((file) => levelOf(file, conformance) === target.level);
      // Proof (B-6): with `! -name 'assignment-scope.db.test.ts'` added to `test:api`'s selector this
      // failed on `wbs-store-sqlite:test:api is declared api and does not collect
      // src/assignment-scope.db.test.ts, which is api` (2026-09-20).
      for (const file of owed.filter((candidate) => !collected.includes(candidate))) {
        wrong.push(
          `${label} is declared ${target.level} and does not collect ${file}, which is ${target.level}`,
        );
      }
    }
    expect(wrong.sort()).toEqual([]);
  }, 30_000);

  it('writes a JUnit report where the declaration says', async () => {
    const missing: string[] = [];
    for (const target of LEVEL_TARGETS) {
      const label = `${target.project}:${target.target}`;
      const manifest = await readManifest(target.root);
      const command = manifest.targets[target.target]?.options?.command;
      if (command === undefined) {
        missing.push(`${label} is not declared in project.json`);
        continue;
      }
      let parsed;
      try {
        parsed = parseLevelCommand(command);
      } catch (cause) {
        missing.push(`${label} command shape: ${(cause as Error).message}`);
        continue;
      }
      const path = reportPathFrom(target.root, target.report);
      const directory = path.slice(0, path.lastIndexOf('/'));
      // Proof (B-2): with `--reporter=junit` removed from `wbs-core:test:unit` this failed on
      // `wbs-core:test:unit does not pass --reporter=junit` (2026-09-20).
      if (!parsed.flags.includes('--reporter=junit')) {
        missing.push(`${label} does not pass --reporter=junit`);
      }
      // Proof (B-7): with only the outfile's basename changed to `wrong.xml` this failed on
      // `wbs-core:test:unit does not write ../../../../tmp/junit/wbs-core.unit.xml` (2026-09-20).
      if (!parsed.flags.includes(`--reporter-outfile=${path}`)) {
        missing.push(`${label} does not write ${path}`);
      }
      // Proof (B-8): with only the `mkdir` directory changed to `../../../../tmp/wrong` this failed
      // on `wbs-core:test:unit does not create ../../../../tmp/junit` (2026-09-20).
      if (parsed.reportDirectory !== directory) {
        missing.push(`${label} does not create ${directory}`);
      }
    }
    expect(missing.sort()).toEqual([]);
  });

  it('refuses a command that names a test file outside its selector', () => {
    expect(() =>
      parseLevelCommand(
        `mkdir -p ../tmp/junit && bun test $(find src -name '*.db.test.ts') ${SQLITE_CONFORMANCE} --reporter=junit`,
      ),
    ).toThrow(`may not pass ${SQLITE_CONFORMANCE}`);
  });

  it('refuses a command that filters which tests run', () => {
    expect(() =>
      parseLevelCommand(
        "mkdir -p ../tmp/junit && bun test $(find src -name '*.db.test.ts') --test-name-pattern=NO_MATCH --reporter=junit",
      ),
    ).toThrow('may not pass --test-name-pattern=NO_MATCH');
  });
});

describe('the adopted capability', () => {
  it('leaves no scenario without an identifier', async () => {
    // Proof (C-3): removing PROJECT-ASSIGNMENT-READS-002 from the specification failed this case,
    // receiving "Assignment write among unrelated projects" instead of an empty list (2026-09-20).
    expect(scenariosWithoutIdentifier(await readSpec(ADOPTED_CAPABILITY))).toEqual([]);
  });

  it('allocates the identifiers once and in order', async () => {
    expect(scenarioIdentifiers(await readSpec(ADOPTED_CAPABILITY))).toEqual([
      'PROJECT-ASSIGNMENT-READS-001',
      'PROJECT-ASSIGNMENT-READS-002',
      'PROJECT-ASSIGNMENT-READS-003',
    ]);
  });

  it('reads a four digit identifier after the ordinal passes 999', () => {
    const specification = '### Requirement: example\n#### Scenario: [EXAMPLE-1000] Later case\n';
    expect(scenariosWithoutIdentifier(specification)).toEqual([]);
    expect(scenarioIdentifiers(specification)).toEqual(['EXAMPLE-1000']);
  });

  it('refuses a specification that holds no scenario', () => {
    expect(() => scenariosWithoutIdentifier('### Requirement: alone\n')).toThrow(
      'no `#### Scenario:`',
    );
  });

  it('refuses a specification that holds no requirement', () => {
    expect(() => scenariosWithoutIdentifier('#### Scenario: [DEMO-001] a\n')).toThrow(
      'no `### Requirement:`',
    );
  });

  it('refuses a specification whose scenario carries no identifier', () => {
    expect(() =>
      scenarioIdentifiers('### Requirement: one\n#### Scenario: [DEMO-001] a\n#### Scenario: b\n'),
    ).toThrow('these scenarios carry no identifier: b');
  });
});

describe('the scenario join', () => {
  const report = (...cases: string[]): string =>
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<testsuites name="bun test">',
      '  <testsuite name="src/a.test.ts" file="src/a.test.ts">',
      ...cases,
      '  </testsuite>',
      '</testsuites>',
      '',
    ].join('\n');
  const passing = (title: string): string =>
    `    <testcase name="${title}" classname="d" time="0.1" file="src/a.test.ts" />`;
  const spec = [
    '### Requirement: one',
    '#### Scenario: [DEMO-001] first',
    '#### Scenario: [DEMO-002] second',
    '#### Scenario: [DEMO-003] third',
    '',
  ].join('\n');
  const citations = (xml: string): ReadonlySet<string> => passedCitations(readJUnitReport(xml));

  /** Bun 1.4.2's own output, copied from a run of a seven-case scratch file. */
  const asBunWritesIt = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<testsuites name="bun test" tests="7" assertions="5" failures="1" skipped="2" time="0.00438912">',
    '  <testsuite name="src/a.test.ts" file="src/a.test.ts" tests="7" assertions="5" failures="1" skipped="2" time="0.001451567" hostname="pop-os">',
    '    <testsuite name="outer group" file="src/a.test.ts" line="3" tests="6" assertions="4" failures="1" skipped="2" time="0" hostname="pop-os">',
    '      <testsuite name="inner group" file="src/a.test.ts" line="4" tests="1" assertions="1" failures="0" skipped="0" time="0" hostname="pop-os">',
    '        <testcase name="[DEMO-001] passes plainly" classname="inner group &gt; outer group" time="0.000018" file="src/a.test.ts" line="5" assertions="1" />',
    '      </testsuite>',
    '      <testcase name="[DEMO-002] has &lt;angle&gt; &amp; &quot;quotes&quot; and &apos;apostrophes&apos;" classname="outer group" time="0.000014" file="src/a.test.ts" line="10" assertions="1" />',
    '      <testcase name="[DEMO-003] has a&#10;newline in its title" classname="outer group" time="0.000015" file="src/a.test.ts" line="14" assertions="1" />',
    '      <testcase name="is skipped" classname="outer group" time="0" file="src/a.test.ts" line="18" assertions="0">',
    '        <skipped />',
    '      </testcase>',
    '      <testcase name="fails on purpose with &lt;tag&gt; &amp; &quot;quotes&quot;" classname="outer group" time="0.000231" file="src/a.test.ts" line="22" assertions="1">',
    '        <failure type="AssertionError" message="expect(received).toBe(expected)&#10;&#10;Expected: 5&#10;Received: 4&#10;">AssertionError: expect(received).toBe(expected)&#10;&#10;Expected: 5&#10;Received: 4&#10;&#10;      at src/a.test.ts:23:15&#10;</failure>',
    '      </testcase>',
    '      <testcase name="is a todo" classname="outer group" time="0" file="src/a.test.ts" line="26" assertions="0">',
    '        <skipped message="TODO" />',
    '      </testcase>',
    '    </testsuite>',
    '    <testcase name="top level case" classname="" time="0.000134" file="src/a.test.ts" line="29" assertions="1" />',
    '  </testsuite>',
    '</testsuites>',
    '',
  ].join('\n');

  it('reads an identifier out of a passing test title', () => {
    expect([
      ...citations(report(passing('[DEMO-001] a cited case'), passing('an uncited case'))),
    ]).toEqual(['DEMO-001']);
  });

  it('names a scenario that no passing test cites', () => {
    expect([
      uncoveredScenarios(spec, citations(report(passing('[DEMO-001] a'), passing('[DEMO-002] b')))),
      uncoveredScenarios(
        spec,
        citations(
          report(passing('[DEMO-001] a'), passing('[DEMO-002] b'), passing('[DEMO-003] c')),
        ),
      ),
    ]).toEqual([['DEMO-003'], []]);
  });

  it('does not count a skipped or a failing test as coverage', () => {
    const skipped =
      '    <testcase name="[DEMO-001] a" classname="d" file="src/a.test.ts"><skipped /></testcase>';
    const failing =
      '    <testcase name="[DEMO-002] b" classname="d" file="src/a.test.ts"><failure message="x">no</failure></testcase>';
    expect(
      uncoveredScenarios(spec, citations(report(skipped, failing, passing('[DEMO-003] c')))),
    ).toEqual(['DEMO-001', 'DEMO-002']);
  });

  it('does not read a citation out of a comment or out of failure text', () => {
    const commented = `    <!-- <testcase name="[DEMO-001] a" file="src/a.test.ts" /> -->`;
    const inText =
      '    <testcase name="[DEMO-003] c" classname="d" file="src/a.test.ts"><failure message="expected name=&quot;[DEMO-002] b&quot;">t</failure></testcase>';
    expect([...citations(report(commented, inText))]).toEqual([]);
  });

  it('reads the report Bun really writes, nesting, escapes and outcomes included', () => {
    expect(readJUnitReport(asBunWritesIt)).toEqual([
      { name: '[DEMO-001] passes plainly', file: 'src/a.test.ts', outcome: 'passed' },
      {
        name: `[DEMO-002] has <angle> & "quotes" and 'apostrophes'`,
        file: 'src/a.test.ts',
        outcome: 'passed',
      },
      {
        name: '[DEMO-003] has a\nnewline in its title',
        file: 'src/a.test.ts',
        outcome: 'passed',
      },
      { name: 'is skipped', file: 'src/a.test.ts', outcome: 'skipped' },
      {
        name: 'fails on purpose with <tag> & "quotes"',
        file: 'src/a.test.ts',
        outcome: 'failed',
      },
      { name: 'is a todo', file: 'src/a.test.ts', outcome: 'skipped' },
      { name: 'top level case', file: 'src/a.test.ts', outcome: 'passed' },
    ]);
    expect([...passedCitations(readJUnitReport(asBunWritesIt))]).toEqual([
      'DEMO-001',
      'DEMO-002',
      'DEMO-003',
    ]);
  });

  it('refuses a report whose root is not testsuites', () => {
    expect(() =>
      readJUnitReport(
        '<?xml version="1.0"?>\n<coverage>\n  <testcase name="[DEMO-001] a" file="src/a.test.ts" />\n</coverage>\n',
      ),
    ).toThrow('root is <coverage>, not <testsuites>');
  });

  it('refuses a testcase whose parent is not a testsuite', () => {
    expect(() =>
      readJUnitReport(
        `<?xml version="1.0"?>\n<testsuites>\n${passing('[DEMO-001] a')}\n</testsuites>\n`,
      ),
    ).toThrow('holds a <testcase> inside <testsuites>, not inside <testsuite>');
  });

  it('refuses a testcase nested inside a failure element', () => {
    expect(() =>
      readJUnitReport(
        report(
          '    <testcase name="outer" file="src/a.test.ts">',
          '      <failure>',
          '        <testcase name="[DEMO-001] a" file="src/a.test.ts"/>',
          '      </failure>',
          '    </testcase>',
        ),
      ),
    ).toThrow('holds a <testcase> inside <failure>, not inside <testsuite>');
  });

  it('refuses an outcome element outside a testcase', () => {
    expect(() => readJUnitReport(report('    <failure message="x">no</failure>'))).toThrow(
      'holds a <failure> inside <testsuite>, not inside <testcase>',
    );
  });

  it('refuses an unsupported element inside a testcase', () => {
    expect(() =>
      readJUnitReport(
        report(
          '    <testcase name="[DEMO-001] a" file="src/a.test.ts"><system-out>x</system-out></testcase>',
        ),
      ),
    ).toThrow('holds an unsupported <system-out> inside a <testcase>');
  });

  it('refuses a testcase hidden inside an outcome element', () => {
    for (const outcome of ['failure', 'error', 'skipped']) {
      expect(() =>
        readJUnitReport(
          report(
            `<testcase name="outer" file="src/a.test.ts"><${outcome}><testsuite>`,
            passing('[DEMO-001] a'),
            `</testsuite></${outcome}></testcase>`,
          ),
        ),
      ).toThrow('holds an unsupported <testsuite> inside a <testcase>');
    }
  });

  it('refuses a namespaced element name', () => {
    expect(() =>
      readJUnitReport(
        report(
          '    <testcase name="[DEMO-001] a" file="src/a.test.ts">',
          '      <x:failure>failed</x:failure>',
          '    </testcase>',
        ),
      ),
    ).toThrow('has a qualified element name <x:failure>');
  });

  it('refuses a namespaced attribute name', () => {
    expect(() =>
      readJUnitReport(
        report('    <testcase name="[DEMO-001] a" file="src/a.test.ts" x:kind="odd" />'),
      ),
    ).toThrow('has a qualified attribute name x:kind on <testcase>');
  });

  it('refuses an xmlns attribute', () => {
    expect(() =>
      readJUnitReport(
        report('    <testcase name="[DEMO-001] a" file="src/a.test.ts" xmlns="urn:test" />'),
      ),
    ).toThrow('has an xmlns attribute on <testcase>');
  });

  it('refuses a document type declaration', () => {
    expect(() =>
      readJUnitReport(
        `<?xml version="1.0"?>\n<!DOCTYPE testsuites>\n<testsuites>\n  <testsuite name="s">\n${passing('[DEMO-001] a')}\n  </testsuite>\n</testsuites>\n`,
      ),
    ).toThrow('has a document type declaration');
  });

  it('refuses a CDATA section', () => {
    expect(() =>
      readJUnitReport(
        report(
          '    <testcase name="[DEMO-001] a" file="src/a.test.ts"><![CDATA[anything]]></testcase>',
        ),
      ),
    ).toThrow('has a CDATA section');
  });

  it('refuses a CDATA section outside the root element', () => {
    expect(() =>
      readJUnitReport(`${report(passing('[DEMO-001] a'))}<![CDATA[trailing junk]]>\n`),
    ).toThrow('has a CDATA section');
  });

  it('refuses a processing instruction after the declaration', () => {
    expect(() => readJUnitReport(report('    <?sortme?>', passing('[DEMO-001] a')))).toThrow(
      'has a processing instruction <?sortme?>',
    );
  });

  it('refuses a testcase that names no test', () => {
    expect(() => readJUnitReport(report('    <testcase file="src/a.test.ts" />'))).toThrow(
      'holds a <testcase> with no name',
    );
  });

  it('refuses a testcase that names no file', () => {
    expect(() => readJUnitReport(report('    <testcase name="[DEMO-001] a" />'))).toThrow(
      'holds a <testcase> with no file',
    );
  });

  it('refuses a report that holds no testcase', () => {
    expect(() => readJUnitReport(report())).toThrow('holds no testcase');
  });

  it('refuses a document with a second root element', () => {
    expect(() => readJUnitReport(`${report(passing('[DEMO-001] a'))}<testsuites />\n`)).toThrow(
      'documents may contain only one root',
    );
  });

  it('refuses a report that is not a JUnit document', () => {
    expect(() => readJUnitReport('[DEMO-001] not xml at all')).toThrow(
      'text data outside of root node',
    );
  });

  it('refuses a malformed XML declaration', () => {
    expect(() =>
      readJUnitReport(
        `<?xml garbage?>\n<testsuites>\n  <testsuite name="s">\n${passing('[DEMO-001] a')}\n  </testsuite>\n</testsuites>\n`,
      ),
    ).toThrow('XML declaration is incomplete');
  });

  it('refuses a declaration whose version is not an XML version', () => {
    expect(() =>
      readJUnitReport(
        `<?xml version="garbage"?>\n<testsuites>\n  <testsuite name="s">\n${passing('[DEMO-001] a')}\n  </testsuite>\n</testsuites>\n`,
      ),
    ).toThrow('version number must match');
  });

  it('refuses a declaration that names no version', () => {
    expect(() =>
      readJUnitReport(
        `<?xml encoding="UTF-8"?>\n<testsuites>\n  <testsuite name="s">\n${passing('[DEMO-001] a')}\n  </testsuite>\n</testsuites>\n`,
      ),
    ).toThrow('expected one of version');
  });

  it('refuses a second XML declaration inside the root', () => {
    expect(() =>
      readJUnitReport(report('    <?xml version="1.0"?>', passing('[DEMO-001] a'))),
    ).toThrow('an XML declaration must be at the start of the document');
  });

  it('refuses text outside the root element', () => {
    expect(() => readJUnitReport(`${report(passing('[DEMO-001] a'))}trailing junk\n`)).toThrow(
      'text data outside of root node',
    );
  });

  it('refuses a malformed processing instruction', () => {
    expect(() => readJUnitReport(report('    <?broken>', passing('[DEMO-001] a')))).toThrow(
      'disallowed character in processing instruction name',
    );
  });

  it('refuses a malformed comment', () => {
    expect(() =>
      readJUnitReport(report('    <!-- bad -- comment -->', passing('[DEMO-001] a'))),
    ).toThrow('malformed comment');
  });

  it('refuses an unterminated comment', () => {
    expect(() =>
      readJUnitReport(`<?xml version="1.0"?>\n<testsuites>\n  <!-- never ends\n`),
    ).toThrow('unclosed tag: testsuites');
  });

  it('refuses an unterminated CDATA section', () => {
    expect(() =>
      readJUnitReport(`<?xml version="1.0"?>\n<testsuites>\n  <![CDATA[never ends\n`),
    ).toThrow('unclosed tag: testsuites');
  });

  it('refuses an entity it does not know', () => {
    expect(() =>
      readJUnitReport(
        report('    <testcase name="[DEMO-001] a" file="src/a.test.ts">&bogus;</testcase>'),
      ),
    ).toThrow('undefined entity');
  });

  it('refuses a repeated attribute', () => {
    expect(() =>
      readJUnitReport(
        report('    <testcase name="[DEMO-001] a" file="src/a.test.ts" name="[DEMO-002] b" />'),
      ),
    ).toThrow('duplicate attribute: name');
  });

  it('refuses two attributes with no whitespace between them', () => {
    expect(() =>
      readJUnitReport(report('    <testcase name="[DEMO-001] a"file="src/a.test.ts" />')),
    ).toThrow('no whitespace between attributes');
  });

  it('refuses an attribute whose value is never closed', () => {
    expect(() =>
      readJUnitReport(
        '<?xml version="1.0"?>\n<testsuites><testsuite name="s"><testcase name="[DEMO-001] a" file="src/a.test.ts" broken="/></testsuite></testsuites>\n',
      ),
    ).toThrow('disallowed character');
  });

  it('refuses an unescaped angle bracket in an attribute value', () => {
    expect(() =>
      readJUnitReport(report('    <testcase name="a < b" file="src/a.test.ts" />')),
    ).toThrow('disallowed character');
  });

  it('refuses an attribute with no value', () => {
    expect(() =>
      readJUnitReport(report('    <testcase name="[DEMO-001] a" file="src/a.test.ts" garbage />')),
    ).toThrow('attribute without value');
  });

  it('refuses a truncated report', () => {
    expect(() =>
      readJUnitReport('<?xml version="1.0"?>\n<testsuites>\n  <testsuite name="s"'),
    ).toThrow('unclosed tag: testsuites');
  });

  it('refuses a report that closes an element that is not open', () => {
    expect(() =>
      readJUnitReport(
        `<?xml version="1.0"?>\n<testsuites>\n  <testsuite name="s">\n${passing('[DEMO-001] a')}\n</testsuites>\n`,
      ),
    ).toThrow('unexpected close tag');
  });

  it('refuses a report that leaves an element open', () => {
    expect(() =>
      readJUnitReport(
        `<?xml version="1.0"?>\n<testsuites>\n  <testsuite name="s">\n${passing('[DEMO-001] a')}\n`,
      ),
    ).toThrow('unclosed tag: testsuite');
  });
});

describe('the report a declared level target wrote', () => {
  it('names a level target that is declared, and refuses one that is not', () => {
    expect(levelTargetNamed('wbs-core:test:unit').report).toBe('tmp/junit/wbs-core.unit.xml');
    expect(() => levelTargetNamed('wbs-core:test')).toThrow('is not a declared level target');
  });

  it('refuses a report naming a file the target does not collect', () => {
    const target = levelTargetNamed('wbs-core:test:unit');
    const cases = [{ name: '[DEMO-001] a', file: 'src/other.test.ts', outcome: 'passed' as const }];
    expect(() => {
      assertReportCovers(target, cases, ['src/a.test.ts']);
    }).toThrow('did not collect src/other.test.ts');
  });
});
