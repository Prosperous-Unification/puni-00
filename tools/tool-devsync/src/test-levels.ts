import { lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { type JUnitCase } from '@shared/test-evidence';
import { classifyTestFile, type TestLevel as ClassifiedTestLevel } from '@shared/test-levels';

export { type CaseOutcome, type JUnitCase, readJUnitReport } from '@shared/test-evidence';

/** The workspace root, from this file's own location. */
export const WORKSPACE = new URL('../../../', import.meta.url);

/**
 * The levels of the level-selection table the adopted projects can reach.
 *
 * Manual, Architecture, Performance, Browser and View exist in the table and are
 * not reachable from the adopted projects' test roots, so {@link levelOf} throws
 * rather than guessing when a file matches no row it knows.
 */
export type TestLevel = ClassifiedTestLevel;

/** One Nx target declared to run exactly one level. */
export interface LevelTarget {
  readonly project: string;
  /** The project's root, workspace-relative. It is also the target's `cwd`. */
  readonly root: string;
  readonly target: string;
  readonly level: TestLevel;
  /** Where this target's JUnit report lands, workspace-relative. */
  readonly report: string;
  /** Directories under `root` this target's level is enumerated from. */
  readonly testRoots: readonly string[];
}

/**
 * The level targets adopted by the first increment of the test-axes change.
 *
 * Each added project is audited for complete source collection. Adding a row
 * obliges that target to collect exactly the files {@link levelOf} puts at its level.
 */
export const LEVEL_TARGETS: readonly LevelTarget[] = [
  // Proof: removing this registration failed shared-validation's canonical Unit collection test
  // with the production lookup's not-a-declared-level refusal (2026-10-17).
  {
    project: 'shared-validation',
    root: 'libs/shared/domain/validation',
    target: 'test:unit:level',
    level: 'unit',
    report: 'tmp/junit/shared-validation.unit.xml',
    testRoots: ['src'],
  },
  {
    project: 'wbs-store-sqlite',
    root: 'libs/wbs/adapters/store-sqlite',
    target: 'test:api',
    level: 'api',
    report: 'tmp/junit/wbs-store-sqlite.api.xml',
    testRoots: ['src'],
  },
  {
    project: 'wbs-store-sqlite',
    root: 'libs/wbs/adapters/store-sqlite',
    target: 'test:unit',
    level: 'unit',
    report: 'tmp/junit/wbs-store-sqlite.unit.xml',
    testRoots: ['src'],
  },
  {
    project: 'wbs-core',
    root: 'libs/wbs/application/core',
    target: 'test:unit',
    level: 'unit',
    report: 'tmp/junit/wbs-core.unit.xml',
    testRoots: ['src'],
  },
  {
    project: 'wbs-store-memory',
    root: 'libs/wbs/adapters/store-memory',
    target: 'test:unit:level',
    level: 'unit',
    report: 'tmp/junit/wbs-store-memory.unit.xml',
    testRoots: ['src'],
  },
  {
    project: 'wbs-store-memory',
    root: 'libs/wbs/adapters/store-memory',
    target: 'test:conformance:level',
    level: 'conformance',
    report: 'tmp/junit/wbs-store-memory.conformance.xml',
    testRoots: ['src'],
  },
  {
    project: 'wbs-store-sqlite',
    root: 'libs/wbs/adapters/store-sqlite',
    target: 'test:conformance:level',
    level: 'conformance',
    report: 'tmp/junit/wbs-store-sqlite.conformance.xml',
    testRoots: ['src'],
  },
];

/** A Vitest phase with its production config and separate JUnit output. */
export interface FrontendPhase {
  readonly config: string;
  readonly report: string;
  readonly timezone: 'UTC' | 'Pacific/Auckland';
  readonly isSerial: boolean;
}

/** A frontend target whose phases all belong to one test level. */
export interface FrontendLevelTarget {
  readonly project: string;
  readonly root: string;
  readonly target: string;
  readonly level: 'unit' | 'view';
  readonly phases: readonly [FrontendPhase, ...FrontendPhase[]];
}

/** Frontend Unit and View commands retain their existing names and report paths. */
export const FRONTEND_LEVEL_TARGETS: readonly FrontendLevelTarget[] = [
  {
    project: 'wbs-fe-01',
    root: 'apps/wbs/fe-01',
    target: 'test:unit:level',
    level: 'unit',
    phases: [
      {
        config: 'vitest.node.config.ts',
        report: 'tmp/junit/wbs-fe-01.unit.xml',
        timezone: 'UTC',
        isSerial: false,
      },
      {
        config: 'vitest.unit-root.config.ts',
        report: 'tmp/junit/wbs-fe-01.unit.root.xml',
        timezone: 'UTC',
        isSerial: false,
      },
    ],
  },
  {
    project: 'wbs-fe-01',
    root: 'apps/wbs/fe-01',
    target: 'test:view:level',
    level: 'view',
    phases: [
      {
        config: 'vitest.view.config.ts',
        report: 'tmp/junit/wbs-fe-01.view.utc.xml',
        timezone: 'UTC',
        isSerial: true,
      },
      {
        config: 'vitest.zoned.config.ts',
        report: 'tmp/junit/wbs-fe-01.view.auckland.xml',
        timezone: 'Pacific/Auckland',
        isSerial: true,
      },
    ],
  },
];

/** Read the FE-owned Node tier manifest as external project metadata. */
export function readNodeSuiteManifest(
  path = new URL('apps/wbs/fe-01/vitest.node-suites.json', WORKSPACE).pathname,
): ReadonlySet<string> {
  let source: unknown;
  try {
    // Proof: disabling this check made the linked manifest CLI fault accept
    // the symlinked JSON and exit zero.
    if (!lstatSync(path).isFile()) throw new Error('not a regular file');
    // Proof: replacing this read with the committed manifest made the missing,
    // unreadable and malformed override CLI cases miss their named refusals.
    source = JSON.parse(readFileSync(path, 'utf8'));
  } catch (cause) {
    throw new Error(`${path}: Node suite manifest is missing, unreadable or malformed`, { cause });
  }
  // Proof: malformed/version/unknown-field CLI fixtures lose their named
  // refusal when this strict manifest-shape boundary is disabled.
  if (
    typeof source !== 'object' ||
    source === null ||
    Array.isArray(source) ||
    Object.keys(source).sort().join(',') !== 'schemaVersion,suites' ||
    !('schemaVersion' in source) ||
    source.schemaVersion !== 1 ||
    !('suites' in source) ||
    !Array.isArray(source.suites) ||
    source.suites.length === 0
  )
    throw new Error(`${path}: Node suite manifest has an invalid schema or version`);
  const root = resolve(WORKSPACE.pathname, 'apps/wbs/fe-01');
  const files = new Set<string>();
  const suites: readonly unknown[] = source.suites;
  for (const entry of suites) {
    // Proof: disabling entry shape and reason validation made the malformed
    // entry and blank-reason manifest CLI fixtures miss their named refusals.
    if (
      typeof entry !== 'object' ||
      entry === null ||
      Array.isArray(entry) ||
      !('file' in entry) ||
      typeof entry.file !== 'string' ||
      Object.keys(entry).some((key) => key !== 'file' && key !== 'reason') ||
      ('reason' in entry && (typeof entry.reason !== 'string' || entry.reason.trim() === ''))
    )
      throw new Error(`${path}: Node suite manifest has an invalid entry`);
    const file = entry.file;
    // Proof: disabling the traversal segment check made the ../escape CLI
    // case miss its named noncanonical-path refusal.
    if (
      file.startsWith('/') ||
      /^[A-Za-z]:/.test(file) ||
      file.includes('\\') ||
      file.split('/').some((segment) => segment === '' || segment === '.' || segment === '..') ||
      !BUN_TEST_FILE.test(file)
    )
      throw new Error(`${path}: Node suite path is noncanonical: ${file}`);
    const canonical = `apps/wbs/fe-01/${file}`;
    // Proof: disabling this check made the repeated-suite CLI case exit zero.
    if (files.has(canonical)) throw new Error(`${path}: duplicate Node suite ${canonical}`);
    const absolute = resolve(root, file);
    try {
      // Proof: disabling the realpath equality made the symlinked parent
      // directory CLI case miss its named project-escape refusal.
      if (!lstatSync(absolute).isFile() || realpathSync(absolute) !== absolute)
        throw new Error('not an unsymlinked regular file');
    } catch (cause) {
      throw new Error(
        `${path}: Node suite is missing, nonregular or escapes project: ${canonical}`,
        { cause },
      );
    }
    files.add(canonical);
  }
  return files;
}

/** Verifies one Bun level target's actual selector. */
export function assertBunLevelCollection(
  target: LevelTarget,
  command: string,
  conformance: readonly string[],
): readonly string[] {
  const label = `${target.project}:${target.target}`;
  const collected = collectedFiles(target.root, parseLevelCommand(command).selector);
  // Proof: disabling this guard made the empty SQLite API selector negative
  // return [] instead of naming a no-files refusal.
  if (collected.length === 0) throw new Error(`${label} collected no files`);
  const membership = new Set(conformance.map((file) => `${target.root}/${file}`));
  const canonical: string[] = [];
  for (const file of collected) {
    const path = canonicalTestPath(
      target.root,
      join(new URL(`${target.root}/`, WORKSPACE).pathname, file),
    );
    const level = classifyTestFile(path, {
      frontendSourceRoot: 'apps/wbs/fe-01/src',
      manualProcedures: new Set(),
      conformanceFiles: membership,
      architectureFixtures: new Set(),
      performanceFiles: new Set(),
      browserFiles: new Set(),
      frontendNodeSuites: new Set(),
    });
    // Proof: removing this guard made the CLI accept a SQLite API selector that
    // collects source-conformance.db.test.ts; the named CLI negative saw exit 0.
    // Proof: removing this guard made shared-validation's API-in-Unit production audit
    // exit zero; "refuses api files in the Unit collection" failed (2026-10-17).
    if (level !== target.level)
      throw new Error(
        `${label} is declared ${target.level} and collects ${path}, which is ${level}`,
      );
    canonical.push(path);
  }
  return canonical;
}

/** Admit only the existing Nx execution envelope of a covered level target. */
export function assertLevelEnvelope(
  target: LevelTarget | FrontendLevelTarget,
  manifest: ProjectManifest,
): string {
  const label = `${target.project}:${target.target}`;
  const declared = manifest.targets[target.target];
  if (declared === undefined) throw new Error(`${label} is missing from project manifest`);
  // Proof: deleting SQLite API's executor made the CLI pass when this guard was disabled.
  if (declared.executor !== 'nx:run-commands')
    throw new Error(`${label} executor differs from declaration`);
  // Proof: adding a Conformance dependency or options.args test-name filter made
  // the CLI pass when this envelope guard was disabled.
  if (
    Object.keys(declared).some(
      (key) => !['executor', 'cache', 'inputs', 'options', 'outputs'].includes(key),
    ) ||
    Object.keys(declared.options ?? {}).some(
      (key) => !['command', 'cwd', 'env', 'forwardAllArgs'].includes(key),
    ) ||
    declared.options?.forwardAllArgs ||
    (declared.options?.env !== undefined &&
      JSON.stringify(declared.options.env) !== JSON.stringify({ CLAUDECODE: '0', AGENT: '0' }))
  )
    throw new Error(`${label} Nx envelope changes collection`);
  // Proof: changing SQLite API's cwd made the named CLI cwd negative fail when removed.
  if (declared.options?.cwd !== target.root)
    throw new Error(`${label} cwd differs from declaration`);
  const command = declared.options.command;
  if (command === undefined) throw new Error(`${label} has no declared command`);
  return command;
}

/** Admit the report identity that a Bun target actually writes. */
export function assertBunReport(target: LevelTarget, command: string): void {
  const label = `${target.project}:${target.target}`;
  const parsed = parseLevelCommand(command);
  const report = reportPathFrom(target.root, target.report);
  // Proof: changing both clear and write paths to wrong.xml made the named CLI
  // report negative pass when this identity guard was disabled. Removing the
  // outfile-family count made the duplicate-output CLI negative fail.
  // Proof: removing this identity guard made shared-validation's same-clear/write wrong.xml
  // command pass "refuses a different report identity" without throwing (2026-10-17).
  if (
    parsed.flags.filter((flag) => flag === '--reporter=junit').length !== 1 ||
    parsed.flags.filter((flag) => flag.startsWith('--reporter-outfile=')).length !== 1 ||
    parsed.flags.filter((flag) => flag === `--reporter-outfile=${report}`).length !== 1
  )
    throw new Error(`${label} report differs from declaration`);
  // Proof: changing only SQLite API's mkdir directory made the named CLI
  // report-directory negative pass when this guard was disabled.
  if (parsed.reportDirectory !== report.slice(0, report.lastIndexOf('/')))
    throw new Error(`${label} report directory differs from declaration`);
}

/** Collects a Vitest phase from its production config. */
export function collectVitestPhase(
  root: string,
  config: string,
  timezone: FrontendPhase['timezone'] = 'UTC',
  isSerial = false,
): readonly string[] {
  const directory = mkdtempSync(join(tmpdir(), 'test-level-vitest-'));
  let listing: unknown;
  try {
    const output = join(directory, 'list.json');
    const invocation = Bun.spawnSync(
      [
        'bunx',
        'vitest',
        'list',
        '--filesOnly',
        `--json=${output}`,
        '--config',
        config,
        ...(isSerial ? ['--no-file-parallelism', '--maxWorkers=1'] : []),
        '--testTimeout=30000',
        '--hookTimeout=30000',
      ],
      {
        cwd: new URL(`${root}/`, WORKSPACE).pathname,
        env: { ...process.env, TZ: timezone, VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true' },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    // Proof: disabling this guard made the injected exit-7 Vitest fault
    // report absent JSON instead of the named runner failure.
    if (invocation.exitCode !== 0)
      throw new Error(
        `${root}/${config}: Vitest collection failed: ${invocation.stderr.toString()}`,
      );
    try {
      // Vitest 5 exits zero with empty piped stdout; --json=<file> is its actual
      // collection output. Proof: replacing this read with [] made the absent-output
      // production collector negative fail instead of naming malformed output.
      listing = JSON.parse(readFileSync(output, 'utf8'));
    } catch (cause) {
      throw new Error(`${root}/${config}: Vitest collection output is absent or malformed`, {
        cause,
      });
    }
  } finally {
    // Proof: removing cleanup left the owned Vitest list directory behind in the
    // named absent-output production collector negative.
    rmSync(directory, { recursive: true, force: true });
  }
  // Proof: disabling this guard made the empty-list injected Vitest negative
  // miss its named no-files refusal.
  if (!Array.isArray(listing) || listing.length === 0)
    throw new Error(`${root}/${config}: Vitest collected no files`);
  const files = listing.map((entry: unknown) => {
    // Proof: disabling this shape guard made the bad-entry Vitest negative
    // fail with a TypeError instead of the named malformed-file refusal.
    if (
      typeof entry !== 'object' ||
      entry === null ||
      !('file' in entry) ||
      typeof entry.file !== 'string'
    )
      throw new Error(`${root}/${config}: Vitest collection has a malformed file`);
    return canonicalTestPath(root, entry.file);
  });
  // Proof: disabling this guard made the repeated-file injected Vitest
  // negative miss its named duplicate refusal.
  if (new Set(files).size !== files.length)
    throw new Error(`${root}/${config}: Vitest collected a duplicate file`);
  return files.sort();
}

/** Exact admitted frontend target command, derived from its declared phases. */
export function renderFrontendCommand(target: FrontendLevelTarget): string {
  const reports = target.phases.map((phase) => reportPathFrom(target.root, phase.report));
  const first = reports[0];
  const directory = first.slice(0, first.lastIndexOf('/'));
  const runs = target.phases.map(
    (phase) =>
      `TZ=${phase.timezone} bunx vitest run --config ${phase.config}${phase.isSerial ? ' --no-file-parallelism --maxWorkers=1' : ''} --testTimeout=30000 --hookTimeout=30000 --reporter=junit --outputFile=${reportPathFrom(target.root, phase.report)}`,
  );
  return `mkdir -p ${directory} && rm -f ${reports.join(' ')} && ${runs.join(' && ')}`;
}

/** Verify actual Vitest phases, declared JUnit outputs and classifier membership. */
export function assertFrontendLevelCollection(
  target: FrontendLevelTarget,
  manifest: ProjectManifest,
  declaredNode = readNodeSuiteManifest(),
): readonly string[] {
  const label = `${target.project}:${target.target}`;
  const command = assertLevelEnvelope(target, manifest);
  // Proof: removing exact command equality made the CLI accept removed JUnit
  // reporter, added test-name selection and changed timezone fixtures.
  if (command !== renderFrontendCommand(target))
    throw new Error(`${label} runner selection, reporter or phase outputs differ from declaration`);
  const nodePhase = FRONTEND_LEVEL_TARGETS.flatMap((entry) => entry.phases).find(
    (phase) => phase.config === 'vitest.node.config.ts',
  );
  if (nodePhase === undefined) throw new Error('frontend Node phase is absent');
  const nodeFiles = new Set(
    collectVitestPhase(target.root, nodePhase.config, nodePhase.timezone, nodePhase.isSerial),
  );
  const extra = [...nodeFiles].find((file) => !declaredNode.has(file));
  const missing = [...declaredNode].find((file) => !nodeFiles.has(file));
  // Proof: removing this independent membership join let the intercepted
  // real Vitest list put src/lib/api.test.ts in Node and still pass the CLI.
  const mismatch = extra ?? missing;
  if (mismatch !== undefined)
    throw new Error(`vitest.node.config.ts collection differs from NODE_SUITES: ${mismatch}`);
  const all = new Set<string>();
  for (const phase of target.phases) {
    for (const file of collectVitestPhase(
      target.root,
      phase.config,
      phase.timezone,
      phase.isSerial,
    )) {
      // Proof: disabling this guard made the repeated Node phase negative
      // miss its named duplicate-phase-file refusal.
      if (all.has(file)) throw new Error(`${label} collects ${file} in two phases`);
      all.add(file);
      const level = classifyTestFile(file, {
        frontendSourceRoot: `${target.root}/src`,
        manualProcedures: new Set(),
        conformanceFiles: new Set(),
        architectureFixtures: new Set(),
        performanceFiles: new Set(),
        browserFiles: new Set(),
        frontendNodeSuites: declaredNode,
      });
      // Proof: disabling this guard let the View target declared Unit pass
      // the named foreign-View-file negative.
      if (level !== target.level)
        throw new Error(
          `${label} is declared ${target.level} and collects ${file}, which is ${level}`,
        );
    }
  }
  return [...all].sort();
}

/**
 * Audit one covered project's Bun target inventory, actual selectors, report
 * identities and complete source collection. Frontend phases are audited by
 * {@link verifyDeclaredCollections} after this shared inventory boundary.
 *
 * @throws when a required target is absent, a selector admits another level or
 * omits a source test, or the command envelope or report identity differs.
 */
export async function verifyBunProjectCollection(
  root: string,
  manifest: ProjectManifest,
): Promise<void> {
  await verifyTargetInventory(root, manifest);
  const conformance = conformanceFilesIn(
    manifest.targets['test:conformance']?.options?.command ?? '',
  );
  const bunFiles = new Set<string>();
  for (const target of LEVEL_TARGETS.filter((entry) => entry.root === root)) {
    const command = assertLevelEnvelope(target, manifest);
    assertBunReport(target, command);
    for (const file of assertBunLevelCollection(target, command, conformance)) bunFiles.add(file);
  }
  if (bunFiles.size > 0) {
    for (const file of await testFilesUnder(root, 'src')) {
      const canonical = `${root}/${file}`;
      // Proof: omitting space-fixture.test.ts from the memory Unit selector made
      // the production CLI pass when this complete-collection guard was removed.
      // Proof: removing this guard made shared-validation's narrowed selector omit added.test.ts
      // and exit zero; the complete Unit inventory test failed (2026-10-17).
      if (!bunFiles.has(canonical))
        throw new Error(`${manifest.name} level targets do not collect ${canonical}`);
    }
  }
}

/** Check every covered project and refuse omitted frontend source or root tests. */
export async function verifyDeclaredCollections(
  overrides: ReadonlyMap<string, ProjectManifest> = new Map(),
  nodeManifestPath?: string,
): Promise<void> {
  const roots = new Set([...LEVEL_TARGETS, ...FRONTEND_LEVEL_TARGETS].map((target) => target.root));
  const declaredNode = readNodeSuiteManifest(nodeManifestPath);
  const manifests = new Map<string, ProjectManifest>();
  for (const root of roots) manifests.set(root, overrides.get(root) ?? (await readManifest(root)));
  for (const root of roots) {
    const manifest = manifests.get(root);
    if (manifest === undefined) throw new Error(`${root} manifest is absent`);
    await verifyBunProjectCollection(root, manifest);
    if (root === 'apps/wbs/fe-01') {
      const collected = new Set(
        FRONTEND_LEVEL_TARGETS.flatMap((target) =>
          assertFrontendLevelCollection(target, manifest, declaredNode),
        ),
      );
      const all = await testFilesInProject(root);
      const expected = all.filter((path) => {
        const under = path.slice(root.length + 1);
        return under.startsWith('src/') || !under.includes('/');
      });
      for (const file of expected) {
        // Proof: removing this guard let the production CLI accept an injected
        // frontend root suite omitted by all four configured phases.
        if (!collected.has(file)) throw new Error(`wbs-fe-01 level targets do not collect ${file}`);
      }
    }
  }
  assertBrowserAggregateMembers(manifests);
}

/** Resolve all Browser aggregate members in their owning project manifests. */
export function assertBrowserAggregateMembers(
  manifests: ReadonlyMap<string, ProjectManifest>,
): void {
  const members = [
    [
      'apps/wbs/fe-01',
      'wbs-fe-01',
      'test:browser:ordinary:level',
      'bun tools/tool-devsync/src/browser-level.ts ordinary',
    ],
    [
      'apps/wbs/fe-01',
      'wbs-fe-01',
      'test:browser:packaged:level',
      'bun tools/tool-devsync/src/browser-level.ts packaged',
    ],
    [
      'libs/wbs/application/core',
      'wbs-core',
      'test:browser:portable:level',
      'bun tools/tool-devsync/src/browser-level.ts portable',
    ],
  ] as const;
  for (const [root, project, target, command] of members) {
    const entry = manifests.get(root)?.targets[target];
    // Proof: deleting the core portable target made the production CLI pass
    // when this cross-project member guard was removed.
    if (entry === undefined)
      throw new Error(`wbs-fe-01:test:browser:level member ${project}:${target} is absent`);
    if (
      entry.executor !== 'nx:run-commands' ||
      entry.options?.command !== command ||
      entry.options.forwardAllArgs !== false ||
      Object.keys(entry).some((key) => !['executor', 'cache', 'options'].includes(key)) ||
      Object.keys(entry.options).some((key) => !['command', 'forwardAllArgs'].includes(key))
    )
      throw new Error(
        `wbs-fe-01:test:browser:level member ${project}:${target} differs from declaration`,
      );
  }
}

/** Refuses unknown test targets in covered projects. */
export async function verifyTargetInventory(
  root: string,
  manifest: ProjectManifest,
): Promise<void> {
  const declared = new Set(
    [...LEVEL_TARGETS, ...FRONTEND_LEVEL_TARGETS].map(
      ({ project, target }) => `${project}:${target}`,
    ),
  );
  for (const name of Object.keys(manifest.targets)) {
    if (!TEST_TARGET_NAME.test(name)) continue;
    const qualified = `${manifest.name}:${name}`;
    if (
      declared.has(qualified) ||
      AGGREGATE_TARGETS.includes(qualified) ||
      qualified in UNDECLARED_TEST_TARGETS
    )
      continue;
    const command = manifest.targets[name]?.options?.command;
    if (command?.startsWith('bun test src')) {
      const conformance = new Set(
        conformanceFilesIn(manifest.targets['test:conformance']?.options?.command ?? '').map(
          (file) => `${root}/${file}`,
        ),
      );
      const levels = new Set(
        (await testFilesUnder(root, 'src')).map((file) =>
          classifyTestFile(`${root}/${file}`, {
            frontendSourceRoot: 'apps/wbs/fe-01/src',
            manualProcedures: new Set(),
            conformanceFiles: conformance,
            architectureFixtures: new Set(),
            performanceFiles: new Set(),
            browserFiles: new Set(),
            frontendNodeSuites: new Set(),
          }),
        ),
      );
      // Proof: bypassing this refusal lost the injected `test:mixed` target's
      // named mixed-level diagnostic; the later unknown-target guard still refused it.
      if (levels.size > 1)
        throw new Error(
          `${qualified} is an undeclared mixed target collecting ${[...levels].sort().join(' and ')}`,
        );
    }
    // Proof: removing this refusal made the injected test:unknown target pass
    // the named inventory negative instead of naming that target.
    throw new Error(`unknown test target declaration ${qualified}`);
  }
  for (const target of [...LEVEL_TARGETS, ...FRONTEND_LEVEL_TARGETS].filter(
    (entry) => entry.root === root,
  )) {
    // Proof: removing this guard made the named missing-Conformance-target
    // inventory negative resolve with no refusal.
    // Proof: removing this guard made shared-validation's missing-target inventory resolve;
    // its required-target assertion failed (2026-10-17).
    if (manifest.targets[target.target] === undefined)
      throw new Error(`${target.project}:${target.target} is missing from project manifest`);
  }
  for (const aggregate of AGGREGATE_DECLARATIONS.filter((entry) =>
    entry.qualified.startsWith(`${manifest.name}:`),
  )) {
    await assertAggregateMembership(root, manifest, aggregate);
  }
}

/** Verify a legacy aggregate's actual runner entry and complete declared levels. */
export async function assertAggregateMembership(
  root: string,
  manifest: ProjectManifest,
  aggregate: AggregateTarget,
): Promise<void> {
  const name = aggregate.qualified.slice(manifest.name.length + 1);
  const entry = manifest.targets[name];
  // Proof: disabling this guard made the missing memory aggregate fixture
  // fail with a TypeError instead of the named missing-target refusal.
  if (entry === undefined) throw new Error(`${aggregate.qualified} aggregate is missing`);
  if (aggregate.qualified === 'wbs-fe-01:test:browser:level') {
    const expected = [
      'bunx nx run wbs-fe-01:test:browser:ordinary:level',
      'bunx nx run wbs-fe-01:test:browser:packaged:level',
      'bunx nx run wbs-core:test:browser:portable:level',
    ];
    // Proof: disabling this equality made the missing portable Browser
    // member fixture miss its named aggregate refusal.
    if (
      entry.executor !== 'nx:run-commands' ||
      entry.options?.parallel !== false ||
      entry.options.forwardAllArgs !== false ||
      JSON.stringify(entry.options.commands) !== JSON.stringify(expected) ||
      Object.keys(entry).some((key) => !['executor', 'cache', 'options'].includes(key)) ||
      Object.keys(entry.options).some(
        (key) => !['commands', 'parallel', 'forwardAllArgs'].includes(key),
      )
    )
      throw new Error(`${aggregate.qualified} aggregate members differ from declaration`);
    return;
  }
  if (aggregate.qualified === 'wbs-fe-01:test') {
    const command = entry.options?.command ?? '';
    const expectedCommand =
      'TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000 && TZ=Pacific/Auckland bunx vitest run --config vitest.zoned.config.ts --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000';
    // Proof: disabling the Unit dependency check made the frontend aggregate
    // fixture with no test:unit dependency miss its named refusal.
    if (
      entry.executor !== 'nx:run-commands' ||
      entry.options?.cwd !== root ||
      JSON.stringify(entry.dependsOn) !== JSON.stringify(['test:unit']) ||
      command !== expectedCommand ||
      Object.keys(entry).some((key) => !['executor', 'dependsOn', 'options'].includes(key)) ||
      Object.keys(entry.options).some((key) => !['command', 'cwd'].includes(key))
    )
      throw new Error(`${aggregate.qualified} aggregate members differ from declaration`);
    const unit = manifest.targets['test:unit'];
    // Proof: deleting or replacing FE test:unit with `echo no-tests` made the
    // named production CLI dependency assertion fail when this join was removed.
    if (
      unit?.executor !== 'nx:run-commands' ||
      unit.options?.cwd !== root ||
      unit.options.command !==
        'TZ=UTC bunx vitest run --config vitest.node.config.ts --testTimeout=30000 --hookTimeout=30000' ||
      Object.keys(unit).some((key) => !['executor', 'options'].includes(key)) ||
      Object.keys(unit.options).some((key) => !['command', 'cwd'].includes(key))
    )
      throw new Error('wbs-fe-01:test:unit dependency differs from declaration');
    return;
  }
  const command = entry.options?.command ?? '';
  const scope = aggregate.qualified === 'wbs-store-sqlite:test' ? 'all' : 'src';
  const expectedCommand =
    scope === 'all'
      ? 'bun test --coverage --coverage-reporter=lcov --timeout=30000'
      : 'bun test src --coverage --coverage-reporter=lcov --timeout=10000';
  // Proof: removing this envelope check made the memory aggregate's missing
  // executor and options.args CLI faults miss their named refusals.
  if (
    entry.executor !== 'nx:run-commands' ||
    Object.keys(entry).some(
      (key) => !['executor', 'cache', 'inputs', 'options', 'outputs'].includes(key),
    ) ||
    Object.keys(entry.options ?? {}).some((key) => !['command', 'cwd'].includes(key))
  )
    throw new Error(`${aggregate.qualified} aggregate members differ from declaration`);
  // Proof: removing this check made the mutated memory test:unit runner selecting
  // only Conformance and a separate test-name-filter mutation pass their named negatives.
  if (entry.options?.cwd !== root || command !== expectedCommand)
    throw new Error(`${aggregate.qualified} aggregate members differ from declaration`);
  const files =
    scope === 'all'
      ? await testFilesInProject(root)
      : (await testFilesUnder(root, 'src')).map((file) => `${root}/${file}`);
  const conformance = new Set(
    conformanceFilesIn(manifest.targets['test:conformance']?.options?.command ?? '').map(
      (file) => `${root}/${file}`,
    ),
  );
  const levels = new Set(
    files.map((file) =>
      classifyTestFile(file, {
        frontendSourceRoot: 'apps/wbs/fe-01/src',
        manualProcedures: new Set(),
        conformanceFiles: conformance,
        architectureFixtures: new Set(),
        performanceFiles: new Set(),
        browserFiles: new Set(),
        frontendNodeSuites: new Set(),
      }),
    ),
  );
  // Proof: removing this equality made the named omitted-Conformance aggregate
  // negative resolve, though the real memory runner collects both levels.
  if (JSON.stringify([...levels].sort()) !== JSON.stringify([...aggregate.levels].sort()))
    throw new Error(`${aggregate.qualified} aggregate members differ from declaration`);
}

/** Canonical workspace path of a regular collected test file inside its declared project. */
function canonicalTestPath(root: string, path: string): string {
  const workspaceRoot = WORKSPACE.pathname;
  const projectRoot = resolve(workspaceRoot, root);
  const absolute = resolve(path);
  // Proof: disabling this guard made the injected /etc/hosts Vitest listing
  // pass the named project-escape negative with exit 0.
  if (
    !isAbsolute(path) ||
    (absolute !== projectRoot && !absolute.startsWith(`${projectRoot}${sep}`))
  )
    throw new Error(`${root}: collected path escapes project: ${path}`);
  try {
    // Proof: deleting a selected file must refuse collection instead of treating the
    // missing path as an empty passing target.
    // Proof: removing this check made both the missing-selected-file negative
    // and the Vitest directory-entry negative miss their named refusals.
    if (!statSync(absolute).isFile()) throw new Error('not a regular file');
  } catch (cause) {
    throw new Error(`${root}: collected file is missing or nonregular: ${path}`, { cause });
  }
  return relative(workspaceRoot, absolute).split(sep).join('/');
}

/** An intentionally composed test target and the levels it may contain. */
export interface AggregateTarget {
  readonly qualified: string;
  readonly levels: readonly TestLevel[];
}

/** Existing mixed/legacy targets keep their names and explicit level membership. */
export const AGGREGATE_DECLARATIONS: readonly AggregateTarget[] = [
  { qualified: 'wbs-store-sqlite:test', levels: ['unit', 'api', 'conformance'] },
  { qualified: 'wbs-core:test', levels: ['unit'] },
  { qualified: 'wbs-store-memory:test', levels: ['unit', 'conformance'] },
  { qualified: 'wbs-store-memory:test:unit', levels: ['unit', 'conformance'] },
  { qualified: 'wbs-fe-01:test', levels: ['unit', 'view'] },
  { qualified: 'wbs-fe-01:test:browser:level', levels: ['browser'] },
];

export const AGGREGATE_TARGETS: readonly string[] = AGGREGATE_DECLARATIONS.map(
  ({ qualified }) => qualified,
);

/**
 * Test-running targets of an adopted project that are neither a level target nor
 * an aggregate, each with the reason.
 *
 * The partition case leaves no remainder, so a new test target has to arrive in
 * one of these three lists.
 */
export const UNDECLARED_TEST_TARGETS: Readonly<Record<string, string>> = {
  'shared-validation:test':
    'Preserved legacy runner without a JUnit report; no isolated level evidence credit.',
  'shared-validation:test:unit':
    'Preserved legacy runner without a JUnit report; no isolated level evidence credit.',
  'wbs-store-sqlite:test:conformance':
    'Conformance level. Its exact command is pinned by workspace-targets.test.ts, so it cannot ' +
    'gain a JUnit report in this increment.',
  'wbs-store-memory:test:conformance':
    'Pinned legacy Conformance command; test:conformance:level adds isolated JUnit output.',
  'wbs-core:test:portable':
    'Browser level, run by Playwright from libs/wbs/application/core/playwright.config.ts.',
  'wbs-core:test:browser:portable:level':
    'Browser adapter has its own collection and publication contract; this Bun/Vitest slice does not certify it.',
  'wbs-fe-01:test:unit': 'Legacy Node-only Vitest target without a JUnit report.',
  'wbs-fe-01:test:performance:level':
    'Performance adapter has a separate runner and non-certifying evidence contract.',
  'wbs-fe-01:test:browser:ordinary:level':
    'Ordinary Browser adapter has a separate runner and publication contract.',
  'wbs-fe-01:test:browser:packaged:level':
    'Packaged Browser adapter has a separate runner and publication contract.',
  'wbs-fe-01:e2e': 'Legacy Browser Playwright target without this slice’s report binding.',
  // Proof: deleting this classification made the named organization Browser inventory
  // test fail and the production verifier refuse `wbs-fe-01:e2e-organization`.
  'wbs-fe-01:e2e-organization':
    'Real-backend organization Browser Playwright target without this slice’s report binding.',
  'wbs-fe-01:e2e-packaged': 'Legacy packaged Browser target without this slice’s report binding.',
};

/**
 * Test files of an adopted project that lie outside its declared test roots.
 *
 * A list rather than a rule, for the reason `vitest.node-suites.ts` gives: the
 * entry carries why, and the case that reads it walks the tree, so the list
 * cannot go stale.
 */
export const KNOWN_OUTSIDE_TEST_ROOTS: Readonly<Record<string, string>> = {
  // Proof: deleting this entry failed "keeps every test file outside a declared test root on the
  // known list", naming portable-composition.spec.ts as an unexpected outside file (2026-09-20).
  'libs/wbs/application/core/testing/portable-composition.spec.ts':
    'Browser: collected by libs/wbs/application/core/playwright.config.ts (testDir ./testing, ' +
    'testMatch portable-composition.spec.ts) and run by wbs-core:test:portable, which this ' +
    'increment does not declare as a level target.',
};

/** Bun's own default test-file matcher, so enumeration sees what the runner sees. */
export const BUN_TEST_FILE = /(?:\.|_)(?:test|spec)\.[cm]?[jt]sx?$/;

/** Nx target names that run a test runner. */
export const TEST_TARGET_NAME = /^(?:test|integration|e2e)(?:[:-].+)?$/;

/** Directories never walked when enumerating a project's test files. */
const NEVER_WALKED = new Set(['node_modules', 'dist', 'coverage', 'test-results']);

/** One Nx target as a project manifest spells it. */
export interface ManifestTarget {
  readonly executor?: string;
  readonly dependsOn?: readonly string[];
  readonly configurations?: Readonly<Record<string, unknown>>;
  readonly defaultConfiguration?: string;
  readonly options?: {
    readonly command?: string;
    readonly commands?: readonly string[];
    readonly cwd?: string;
    readonly args?: readonly string[];
    readonly env?: Readonly<Record<string, string>>;
    readonly forwardAllArgs?: boolean;
    readonly parallel?: boolean;
  };
}

/** One project manifest, reduced to what this module reads. */
export interface ProjectManifest {
  readonly name: string;
  readonly targets: Readonly<Record<string, ManifestTarget | undefined>>;
}

/**
 * One project's `project.json`, read from the workspace.
 *
 * Test boundary: the manifest is Nx's own schema and Nx validates it; this reads
 * the three fields the cases compare.
 *
 * @throws when the manifest is absent or unreadable.
 */
export async function readManifest(root: string): Promise<ProjectManifest> {
  const text = await readFile(new URL(`${root}/project.json`, WORKSPACE), 'utf8');
  return JSON.parse(text) as ProjectManifest;
}

/**
 * The test files a project's `test:conformance` target names.
 *
 * Read from the command rather than declared, because the command is the
 * authority row 2 of the level-selection table points at. Explicit './' operands are
 * normalized to the same project-relative identity used by collected source paths.
 */
export function conformanceFilesIn(command: string): readonly string[] {
  // Proof: removing explicit-prefix normalization made the production level verifier refuse
  // `wbs-store-sqlite:test aggregate members differ from declaration` after literal './' adoption.
  return [...command.matchAll(/\S+(?:\.|_)(?:test|spec)\.[cm]?[jt]sx?/g)].map(([path]) =>
    path.startsWith('./') ? path.slice(2) : path,
  );
}

/**
 * The level of one test file of an adopted project, by the level-selection
 * table, in precedence order.
 *
 * @param projectRelativePath the path the runner names the file with
 * @param conformanceFiles what the project's `test:conformance` target names
 * @throws when no row matches, because an unclassified test file is scenario
 * TEST-AXES-001 and a default would hide it.
 */
export function levelOf(
  projectRelativePath: string,
  conformanceFiles: readonly string[],
): TestLevel {
  return classifyTestFile(projectRelativePath, {
    frontendSourceRoot: 'apps/wbs/fe-01/src',
    manualProcedures: new Set(),
    conformanceFiles: new Set(conformanceFiles),
    architectureFixtures: new Set(),
    performanceFiles: new Set(),
    browserFiles: new Set(),
    frontendNodeSuites: new Set(),
  });
}

/** Every file Bun's runner would collect under `root`/`dir`, `root`-relative and sorted. */
export async function testFilesUnder(root: string, dir: string): Promise<string[]> {
  const found: string[] = [];
  const base = join(new URL(`${root}/`, WORKSPACE).pathname, dir);
  const glob = new Bun.Glob('**/*');
  for await (const entry of glob.scan({ cwd: base })) {
    if (entry.split('/').some((segment) => NEVER_WALKED.has(segment))) continue;
    if (BUN_TEST_FILE.test(entry)) found.push(`${dir}/${entry}`);
  }
  return found.sort();
}

/** Every file Bun's runner would collect anywhere under `root`, workspace-relative and sorted. */
export async function testFilesInProject(root: string): Promise<string[]> {
  const found: string[] = [];
  const glob = new Bun.Glob('**/*');
  for await (const entry of glob.scan({ cwd: new URL(`${root}/`, WORKSPACE).pathname })) {
    if (entry.split('/').some((segment) => NEVER_WALKED.has(segment))) continue;
    if (BUN_TEST_FILE.test(entry)) found.push(`${root}/${entry}`);
  }
  return found.sort();
}

/* ─── slice B adds everything below this line ────────────────────────────── */

/**
 * The only flags a declared level target may pass to Bun's runner.
 *
 * An allow-list and not a shape check: `--test-name-pattern`, `--preload`,
 * `--config`, `--bail` and `--todo` all change which tests run, so a target
 * carrying one would satisfy the file-level isolation check while running a
 * different set — a check that cannot fail. `--timeout=<ms>` changes only how long each test may
 * run, and every Bun test command must state one (`docs/test-budgets.md`).
 */
export const ALLOWED_LEVEL_FLAG =
  /^--(?:coverage|coverage-reporter=lcov|reporter=junit|reporter-outfile=\S+|timeout=\d+)$/;

/** The parts of a declared level target's command. */
export interface LevelCommand {
  /** The directory the command creates before running, as the command spells it. */
  readonly reportDirectory: string;
  /** The shell expression inside `$( … )` that names the files to run. */
  readonly selector: string;
  /** Every flag after the selector, in order. */
  readonly flags: readonly string[];
}

/**
 * Declared targets use a file selector and JUnit flags. New find-based targets
 * remove the old report and refuse an empty selection before launching Bun.
 * The older command shape remains accepted for unchanged pinned targets.
 *
 * Anchored on purpose. A positional argument after the selector is how a target
 * quietly gains a file of another level without the selector saying so, and a
 * second command substitution is a second selection rule.
 *
 * @throws when the command has any other shape, or carries a flag outside
 * {@link ALLOWED_LEVEL_FLAG}.
 */
export function parseLevelCommand(command: string): LevelCommand {
  // Proof: replacing the memory Unit guard's `$files` test with `never` made the
  // production target negative run an unrelated test and exit 0 (2026-10-09).
  const guarded =
    /^mkdir -p (\S+) && rm -f (\S+) && files=\$\(([^()]*)\) && if \[ -z "\$files" \]; then echo 'no-cases: ([^']+)' >&2; exit 1; fi && bun test \$files((?: \S+)*)$/.exec(
      command,
    );
  const legacy = /^mkdir -p (\S+) && bun test \$\(([^()]*)\)((?: \S+)*)$/.exec(command);
  const parsed = guarded ?? legacy;
  if (parsed === null) {
    throw new Error(
      `a declared level target must use a guarded file selector or the pinned legacy command shape; got: ${command}`,
    );
  }
  const reportDirectory = parsed[1];
  const selector = guarded === null ? parsed[2] : parsed[3];
  const rest = guarded === null ? parsed[3] : parsed[5];
  const flags = rest.split(/\s+/).filter(Boolean);
  const refused = flags.filter((flag) => !ALLOWED_LEVEL_FLAG.test(flag));
  if (refused.length > 0) {
    throw new Error(
      `a declared level target may not pass ${refused.join(', ')}; only coverage, JUnit reporting and timeout flags are allowed`,
    );
  }
  if (guarded !== null) {
    const report = flags.find((flag) => flag.startsWith('--reporter-outfile='))?.slice(19);
    // Proof: disabling this equality made "refuses a guarded target that clears a different
    // JUnit report" fail: a mutated production command clearing wrong.xml did not throw.
    if (report !== guarded[2]) {
      throw new Error(
        `guarded level target clears ${guarded[2]} but writes ${report ?? 'no report'}`,
      );
    }
  }
  return { reportDirectory, selector, flags };
}

/**
 * The files one declared level target collects, by running the command's own
 * selector in the target's working directory.
 *
 * The selector is run rather than re-implemented: a second copy of the selection
 * rule is the drift this check exists to catch. One leading `./` is removed only
 * for canonical project-relative identities; execution retains the literal operands.
 *
 * @throws when the selector fails.
 */
export function collectedFiles(root: string, selector: string): readonly string[] {
  const run = Bun.spawnSync(['sh', '-c', selector], {
    cwd: new URL(`${root}/`, WORKSPACE).pathname,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (run.exitCode !== 0) {
    throw new Error(`${root}: the file selector failed: ${run.stderr.toString()}`);
  }
  // Proof: removing one-prefix normalization failed the canonicalization and real level
  // collection assertions in test-levels.test.ts (2026-10-14).
  return run.stdout
    .toString()
    .split(/\s+/)
    .filter(Boolean)
    .map((file) => file.replace(/^\.\//, ''))
    .sort();
}

/** The report path a target writes, spelled the way its own working directory must spell it. */
export function reportPathFrom(root: string, report: string): string {
  return `${'../'.repeat(root.split('/').length)}${report}`;
}

/* ─── slice C adds everything below this line ─────────────────────────────── */

/** The capability whose scenarios this increment allocates identifiers for. */
export const ADOPTED_CAPABILITY = 'project-assignment-reads';

/** The shape of every scenario identifier: the capability's name, then an ordinal. */
export const SCENARIO_IDENTIFIER = /^\[([A-Z][A-Z0-9-]*-\d{3,})\] \S/;

/** @throws when `specMarkdown` holds no requirement or no scenario heading. */
function assertSpecification(specMarkdown: string): void {
  // Proof (C-4): deleting this guard failed "refuses a specification that holds no requirement"
  // with `Received function did not throw` and `Received value: []` (2026-09-20).
  if (!/^### Requirement: /m.test(specMarkdown)) {
    throw new Error('the capability specification holds no `### Requirement:` heading');
  }
  // Proof (C-1): deleting this guard failed "refuses a specification that holds no scenario"
  // with `Received function did not throw` and `Received value: []` (2026-09-20).
  if (!/^#### Scenario: /m.test(specMarkdown)) {
    throw new Error('the capability specification holds no `#### Scenario:` heading');
  }
}

/** Scenario headings of one capability specification that carry no identifier. */
export function scenariosWithoutIdentifier(specMarkdown: string): readonly string[] {
  assertSpecification(specMarkdown);
  return [...specMarkdown.matchAll(/^#### Scenario: (.*)$/gm)]
    .filter(([, title]) => !SCENARIO_IDENTIFIER.test(title))
    .map(([, title]) => title);
}

/**
 * Scenario identifiers of one capability specification, in document order.
 *
 * @throws when the text is not a capability specification, or when any scenario
 * heading carries no identifier. A ledger that silently skips the scenarios it
 * cannot name reports full coverage over a specification it never read.
 */
export function scenarioIdentifiers(specMarkdown: string): readonly string[] {
  const unidentified = scenariosWithoutIdentifier(specMarkdown);
  // Proof (C-2): deleting this guard failed "refuses a specification whose scenario carries no
  // identifier" with `Received function did not throw` and `[ "DEMO-001" ]` (2026-09-20).
  if (unidentified.length > 0) {
    throw new Error(`these scenarios carry no identifier: ${unidentified.join('; ')}`);
  }
  return [...specMarkdown.matchAll(/^#### Scenario: \[([A-Z][A-Z0-9-]*-\d{3,})\]/gm)].map(
    ([, id]) => id,
  );
}

/**
 * One capability specification, read from the workspace.
 *
 * @throws when the specification is absent or unreadable.
 */
export async function readSpec(capability: string): Promise<string> {
  return readFile(new URL(`openspec/specs/${capability}/spec.md`, WORKSPACE), 'utf8');
}

/* ─── slice D adds everything below this line ─────────────────────────────── */

/**
 * The scenario identifiers cited by a test that ran **and passed**.
 *
 * A skipped or failing test cites a scenario it did not prove, so it does not
 * cover it.
 */
export function passedCitations(cases: readonly JUnitCase[]): ReadonlySet<string> {
  const cited = new Set<string>();
  for (const one of cases) {
    // Proof (D-1): deleting this guard failed the skipped-or-failing coverage case because both
    // DEMO-001 and DEMO-002 disappeared from the uncovered list; the failure-text case failed too
    // (2026-09-20).
    // Proof (E-2): skipping PROJECT-ASSIGNMENT-READS-001 and regenerating the API report made its
    // coverage row `**no**` while the other two stayed `yes` (2026-09-20).
    if (one.outcome !== 'passed') continue;
    // Proof (E-1): removing PROJECT-ASSIGNMENT-READS-001 from the passing API test title and
    // regenerating its report made only that scenario's coverage row `**no**` (2026-09-20).
    const id = SCENARIO_IDENTIFIER.exec(one.name)?.[1];
    if (id !== undefined) cited.add(id);
  }
  return cited;
}

/** The capability's scenario identifiers that no passing test cites, in document order. */
export function uncoveredScenarios(
  specMarkdown: string,
  cited: ReadonlySet<string>,
): readonly string[] {
  return scenarioIdentifiers(specMarkdown).filter((id) => !cited.has(id));
}

/**
 * @throws when the report names a file the target does not collect — the report
 * of another target, or of a run against another tree.
 */
export function assertReportCovers(
  target: LevelTarget,
  cases: readonly JUnitCase[],
  collected: readonly string[],
): void {
  const known = new Set(collected);
  const foreign = [...new Set(cases.map(({ file }) => file))].filter((file) => !known.has(file));
  // Proof (E-3): replacing the API report with the SQLite Unit report made the coverage command
  // refuse its seven foreign files and say it was the report of another run (2026-09-20).
  if (foreign.length > 0) {
    throw new Error(
      `${target.project}:${target.target} did not collect ${foreign.sort().join(', ')}; ` +
        `${target.report} is the report of another run`,
    );
  }
}

/**
 * @throws when a file the report names has changed since the report was written.
 *
 * The design's manual-report rule in the small: a report goes stale when
 * something it measured changed, and a stale report read as coverage is a
 * green row for a test nobody ran. A heuristic, and stated as one: it compares
 * the modification times of the test files the report itself names, not of
 * their production dependencies and not of the specification, so a changed
 * dependency with an unchanged test file does not make the report stale here.
 */
export async function assertReportIsCurrent(
  target: LevelTarget,
  cases: readonly JUnitCase[],
): Promise<void> {
  const written = (await stat(new URL(target.report, WORKSPACE))).mtimeMs;
  const stale: string[] = [];
  for (const file of new Set(cases.map(({ file }) => file))) {
    const source = (await stat(new URL(`${target.root}/${file}`, WORKSPACE))).mtimeMs;
    if (source > written) stale.push(file);
  }
  // Proof (E-5): appending a trailing newline to assignment-scope.db.test.ts after its report was
  // written made the coverage command name the stale file and the API target to rerun (2026-09-20).
  if (stale.length > 0) {
    throw new Error(
      `${target.report} is older than ${stale.sort().join(', ')}; rerun ${target.project}:${target.target}`,
    );
  }
}

/** One declared level target, by its `project:target` name. */
export function levelTargetNamed(qualified: string): LevelTarget {
  const found = LEVEL_TARGETS.find(({ project, target }) => `${project}:${target}` === qualified);
  // Proof (E-9): naming aggregate target `wbs-core:test` made the coverage command refuse it as
  // not a declared level target (2026-09-20).
  if (found === undefined) throw new Error(`${qualified} is not a declared level target`);
  return found;
}
