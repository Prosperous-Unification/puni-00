import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';

import { readProjects } from '../workspace-projects.mjs';

const WORKSPACE = fileURLToPath(new URL('../../../', import.meta.url));
const LEGACY_ROOT =
  /(?:apps\/(?:be-01|fe-01|gw-01|mcp-01)|libs\/(?:auth|config|conformance|contracts|core|domain|observability|realtime|runtime-portable|solver-py|store-memory|store-sqlite|validation))(?:\/|\b)/g;

const CURRENT_MARKDOWN = [
  'AGENTS.md',
  'HUMAN_README.md',
  'LLM_README.md',
  'docs/adr/0008-tags-accumulate-down-the-tree.md',
  'docs/adr/0009-a-work-item-type-does-not-inherit-at-all.md',
  'docs/adr/0012-a-write-carries-its-actor-as-an-argument.md',
  'docs/adr/0014-ports-live-in-a-framework-free-core-lib.md',
  'docs/adr/0016-a-tied-sibling-position-is-legal-and-the-row-id-resolves-it.md',
  'docs/adr/0018-the-dev-deploy-trigger-owns-solver-compatibility-preparation.md',
  'docs/adr/0024-a-done-work-item-draws-its-facts-not-its-slices.md',
  'docs/auth-integration.md',
  'docs/capacity.md',
  'docs/findings/current.md',
  'docs/local-dev.md',
  'docs/refactoring/tasks.md',
  'docs/runbook-dev-deploy.md',
  'openspec/changes/automatic-dev-solver-binding/proposal.md',
  'openspec/changes/automatic-dev-solver-binding/specs/deployment-pipeline/spec.md',
  'openspec/changes/dual-optimized-scheduler/supervisor-amendment.md',
] as const;

const EXPECTED_ALIASES = [
  '@wbs/auth',
  '@wbs/be-01',
  '@wbs/config',
  '@wbs/conformance',
  '@wbs/conformance/*',
  '@wbs/contracts',
  '@wbs/contracts/solver/build-request',
  '@wbs/contracts/solver/materialise-optimized',
  '@wbs/contracts/solver/optimized-result',
  '@wbs/contracts/solver/parse-solver-response',
  '@wbs/contracts/solver/plan-infeasible',
  '@wbs/contracts/solver/quantised-baseline',
  '@wbs/contracts/solver/revalidate-solver-result',
  '@wbs/contracts/solver/solver-failure-disposition',
  '@wbs/contracts/solver/supervisor-protocol',
  '@wbs/contracts/ws-frames',
  '@wbs/core',
  '@wbs/core/*',
  '@wbs/deploy-contract',
  '@wbs/domain',
  '@wbs/domain/arrange-siblings',
  '@wbs/domain/assumed-duration',
  '@wbs/domain/canonical-schedule-input',
  '@wbs/domain/deadline-offsets',
  '@wbs/domain/dependency-reach',
  '@wbs/domain/effective-service',
  '@wbs/domain/effective-tag',
  '@wbs/domain/effective-team',
  '@wbs/domain/external-system',
  '@wbs/domain/is-within',
  '@wbs/domain/label-mismatch',
  '@wbs/domain/marker-color',
  '@wbs/domain/priority-band',
  '@wbs/domain/progress',
  '@wbs/domain/stored-vocabularies',
  '@wbs/domain/tree-order',
  '@wbs/domain/workday',
  '@wbs/gw-01',
  '@wbs/observability',
  '@wbs/realtime',
  '@wbs/runtime-portable',
  '@wbs/runtime-portable/testing',
  '@wbs/store-memory',
  '@wbs/store-memory/*',
  '@wbs/store-sqlite',
  '@wbs/store-sqlite/*',
  '@wbs/tool-compose',
  '@wbs/tool-env',
  '@wbs/tool-test-scratch',
  '@wbs/validation',
  '@wbs/validation/fixtures',
] as const;

const EXPECTED_PROJECTS = [
  ['apps/wbs/be-01', 'wbs-be-01'],
  ['apps/wbs/fe-01', 'wbs-fe-01'],
  ['apps/wbs/gw-01', 'wbs-gw-01'],
  ['apps/wbs/mcp-01', 'wbs-mcp-01'],
  ['libs/wbs/adapters/auth', 'wbs-auth'],
  ['libs/wbs/adapters/config', 'wbs-config'],
  ['libs/wbs/adapters/observability', 'wbs-observability'],
  ['libs/wbs/adapters/realtime', 'wbs-realtime'],
  ['libs/wbs/adapters/runtime-portable', 'wbs-runtime-portable'],
  ['libs/wbs/adapters/solver-py', 'wbs-solver-py'],
  ['libs/wbs/adapters/solver-supervisor-protocol', 'wbs-solver-supervisor-protocol'],
  ['libs/wbs/adapters/store-memory', 'wbs-store-memory'],
  ['libs/wbs/adapters/store-sqlite', 'wbs-store-sqlite'],
  ['libs/wbs/application/conformance', 'wbs-conformance'],
  ['libs/wbs/application/core', 'wbs-core'],
  ['libs/wbs/domain/contracts', 'wbs-contracts'],
  ['libs/wbs/domain/domain', 'wbs-domain'],
  ['libs/wbs/domain/validation', 'wbs-validation'],
  ['tools/dev', 'tool-dev-setup'],
  ['tools/test/scratch', 'tool-test-scratch'],
  ['tools/tool-bootstrap', 'tool-bootstrap'],
  ['tools/tool-compose', 'tool-compose'],
  ['tools/tool-dagger', 'tool-dagger'],
  ['tools/tool-deploy', 'tool-deploy'],
  ['tools/tool-devsync', 'tool-devsync'],
  ['tools/tool-git-hooks', 'tool-git-hooks'],
  ['tools/tool-observability-stack', 'tool-observability-stack'],
  ['tools/tool-remote-scripts', 'tool-remote-scripts'],
  ['tools/tool-secrets', 'tool-secrets'],
  ['tools/tool-smoke', 'tool-smoke'],
  ['tools/tool-wiki', 'tool-wiki'],
] as const;

const CLASSIFIED_LEGACY_SOURCE_CONFIG = [
  ['.github/workflows/ci.yml', 'dated proof comment'],
  ['docs/wiki-policy/policy.json', 'historical source selectors and baseline tuples'],
  ['lefthook.yml', 'watched-fault proof comment'],
  ['tools/tool-dagger/src/main.ts', 'watched-fault proof comments'],
  ['tools/tool-deploy/src/migrations.ts', 'revision-local migration transition and proofs'],
  ['tools/tool-git-hooks/src/hooks/corpus-version-lint.ts', 'revision-local corpus transition'],
  ['tools/tool-wiki/src/admission/authority-store.ts', 'watched-fault proof comment'],
  ['tools/tool-wiki/src/admission/claims.ts', 'watched-fault proof comments'],
  ['tools/tool-wiki/src/contracts/records.ts', 'negative-example diagnostics'],
] as const;

const CLASSIFIED_LEGACY_DOCUMENTATION = [
  ['docs/2026-08-30-agent-loop-audit.md', 'dated audit'],
  ['docs/2026-08-30-sustainability-audit.md', 'dated audit'],
  ['docs/2026-09-02-refactoring-handoff.md', 'dated refactoring handoff'],
  ['docs/2026-09-02-refactoring-plan.md', 'dated refactoring plan'],
  ['docs/2026-09-02-refactoring-review/A-be-repository.md', 'dated review'],
  ['docs/2026-09-02-refactoring-review/B-be-service-controller.md', 'dated review'],
  ['docs/2026-09-02-refactoring-review/C-fe-wbs-table.md', 'dated review'],
  ['docs/2026-09-02-refactoring-review/D-fe-rest.md', 'dated review'],
  ['docs/2026-09-02-refactoring-review/E-gw-mcp-libs.md', 'dated review'],
  ['docs/2026-09-02-refactoring-review/F-tools-tests.md', 'dated review'],
  ['docs/2026-09-02-refactoring-review/README.md', 'dated review index'],
  ['docs/2026-09-05-ports-and-adapters-history.md', 'dated architecture history'],
  ['docs/2026-09-05-ports-and-adapters-plan.md', 'dated architecture plan'],
  ['docs/findings/checks-that-cannot-fail.md', 'historical incident catalogue'],
  ['docs/local-dev.md', 'historical measured path'],
  ['docs/plans/2026-08-07-table-ui-cleanup.md', 'dated plan'],
  ['docs/plans/2026-08-08-tailwind-spike-verify.md', 'dated verification'],
  ['docs/plans/2026-08-09-resource-planning.md', 'dated plan'],
  ['docs/plans/2026-09-13-tool-wiki-precedents-and-extraction.md', 'dated research'],
  ['docs/refactoring/verify.md', 'historical refactoring verification'],
  ['docs/refactoring/w4-4/extraction-map.md', 'historical extraction evidence'],
  ['docs/refactoring/w4-4/verify.md', 'historical extraction verification'],
  ['docs/runbook-dev-deploy.md', 'dated 2026-08-31 incident'],
  ['docs/state/TASK-347-http-endpoint-port.md', 'historical task state'],
  ['docs/superpowers/plans/2026-08-02-compose-blue-green-HANDOVER.md', 'frozen legacy plan'],
  ['docs/superpowers/plans/2026-08-02-compose-blue-green-deploy.md', 'frozen legacy plan'],
  ['docs/superpowers/plans/2026-08-04-cheap-dev-deploy.md', 'frozen legacy plan'],
  ['docs/superpowers/plans/2026-08-24-password-login.md', 'frozen legacy plan'],
  [
    'docs/superpowers/specs/2026-08-02-compose-blue-green-deploy-design.md',
    'frozen legacy specification',
  ],
  [
    'docs/superpowers/specs/2026-09-05-be01-route-auth-metadata-design.md',
    'frozen legacy specification',
  ],
] as const;

const HANDOFF_TEST_INPUTS = [
  '{workspaceRoot}/AGENTS.md',
  '{workspaceRoot}/HUMAN_README.md',
  '{workspaceRoot}/LLM_README.md',
  '{workspaceRoot}/docs/**/*.md',
  '{workspaceRoot}/docs/wiki-policy/*.json',
  '{workspaceRoot}/lefthook.yml',
  '{workspaceRoot}/openspec/changes/automatic-dev-solver-binding/**/*.md',
  '{workspaceRoot}/openspec/changes/dual-optimized-scheduler/supervisor-amendment.md',
  '{workspaceRoot}/openspec/changes/repo-namespacing/preflight-inventory.md',
  '{workspaceRoot}/tsconfig.base.json',
  '{workspaceRoot}/apps/wbs/be-01/drizzle/**/*',
] as const;

async function filesBelow(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(path)));
    else files.push(path);
  }
  return files.sort();
}

function gitBlob(bytes: Uint8Array): string {
  return createHash('sha1')
    .update(`blob ${String(bytes.byteLength)}\0`)
    .update(bytes)
    .digest('hex');
}

function candidatePaths(): string[] {
  const invocation = Bun.spawnSync(
    ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: WORKSPACE,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  if (invocation.exitCode !== 0) {
    throw new Error(
      `cannot enumerate candidate source: ${new TextDecoder().decode(invocation.stderr)}`,
    );
  }
  return new TextDecoder().decode(invocation.stdout).split('\0').filter(Boolean);
}

function isCurrentSourceConfig(path: string): boolean {
  if (!/\.(?:[cm]?[jt]sx?|json|ya?ml|sh)$/.test(path)) return false;
  return !(
    /(?:^|\/)fixtures\//.test(path) ||
    /(?:^|\/)drizzle\//.test(path) ||
    /\.test\.[^.]+$/.test(path) ||
    path.startsWith('.superpowers/') ||
    path.startsWith('docs/experiment-evidence/') ||
    path.startsWith('notes/') ||
    path.startsWith('openspec/') ||
    [
      'docs/wiki-policy/bootstrap-policy.json',
      'docs/wiki-policy/modules.bootstrap.json',
      'docs/wiki-policy/relationships.bootstrap.json',
    ].includes(path)
  );
}

test('current documentation and active solver packets use namespaced roots', async () => {
  const references: string[] = [];
  for (const path of CURRENT_MARKDOWN) {
    const source = await readFile(join(WORKSPACE, path), 'utf8');
    for (const match of source.matchAll(LEGACY_ROOT)) references.push(`${path}:${match[0]}`);
  }

  // The 2026-08-31 runbook incident records the path at observation time; changing that one
  // reference would rewrite evidence rather than repair current navigation.
  expect(references).toEqual([
    'docs/local-dev.md:apps/fe-01',
    'docs/runbook-dev-deploy.md:apps/be-01/',
  ]);
});

test('the production index checker resolves current Markdown links and anchors', () => {
  const cli = fileURLToPath(new URL('../../tool-wiki/src/cli.ts', import.meta.url));
  const invocation = Bun.spawnSync(
    [process.execPath, 'run', cli, 'check-indexes', 'working', WORKSPACE, 'HEAD'],
    { cwd: WORKSPACE, env: process.env, stdout: 'pipe', stderr: 'pipe' },
  );

  // Proof: replacing the findings index link with `current.md#missing` made this actual-candidate
  // check exit 1 with `Markdown anchor absent ... #missing` (2026-09-14).
  expect(new TextDecoder().decode(invocation.stderr)).toBe('');
  expect(invocation.exitCode).toBe(0);
}, 30_000);

test('the public alias manifest remains complete and stable', async () => {
  const config = JSON.parse(await readFile(join(WORKSPACE, 'tsconfig.base.json'), 'utf8')) as {
    compilerOptions: { paths: Record<string, unknown> };
  };

  // Proof: deleting `@wbs/validation/fixtures` made this actual-candidate manifest fail with the
  // complete received key list (2026-09-14).
  expect(Object.keys(config.compilerOptions.paths).sort()).toEqual([...EXPECTED_ALIASES]);
});

test('the recursive Nx root and name manifest remains complete', async () => {
  const projects = (await readProjects(WORKSPACE)).map(({ root, name }) => [root, name] as const);

  // Proof: replacing `wbs-domain` with an unqualified name made this actual-candidate manifest
  // fail with the differing complete tuple (2026-09-14).
  expect(projects).toEqual([...EXPECTED_PROJECTS]);
});

test('every migration keeps its expected namespaced path and Git blob', async () => {
  const inventory = await readFile(
    join(WORKSPACE, 'openspec/changes/repo-namespacing/preflight-inventory.md'),
    'utf8',
  );
  const expected = [...inventory.matchAll(/^([0-9a-f]{40}) apps\/be-01\/drizzle\/(.+)$/gm)]
    .map(([, blob, suffix]) => [`apps/wbs/be-01/drizzle/${suffix}`, blob] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const migrationRoot = join(WORKSPACE, 'apps/wbs/be-01/drizzle');
  const observed = await Promise.all(
    (await filesBelow(migrationRoot)).map(async (path) => {
      const workspacePath = relative(WORKSPACE, path);
      return [workspacePath, gitBlob(await readFile(path))] as const;
    }),
  );

  // Proof: omitting one moved `down.sql` made this actual-candidate manifest fail with the exact
  // absent path while retaining the other 91 path/blob tuples (2026-09-14).
  expect(observed).toEqual(expected);
});

test('every legacy source and configuration reference is classified', async () => {
  const observed: (readonly [string, string])[] = [];
  const categories = new Map<string, string>(CLASSIFIED_LEGACY_SOURCE_CONFIG);
  for (const path of candidatePaths().filter(isCurrentSourceConfig)) {
    if ((await readFile(join(WORKSPACE, path), 'utf8')).match(LEGACY_ROOT) === null) continue;
    observed.push([path, categories.get(path) ?? 'UNCLASSIFIED']);
  }

  // Proof: adding a stale `apps/be-01` reference to tools/dev/setup.ts made this complete
  // actual-candidate inventory fail with that path classified as UNCLASSIFIED (2026-09-14).
  expect(observed).toEqual([...CLASSIFIED_LEGACY_SOURCE_CONFIG]);
});

test('every legacy documentation reference is classified', async () => {
  const observed: (readonly [string, string])[] = [];
  const categories = new Map<string, string>(CLASSIFIED_LEGACY_DOCUMENTATION);
  const documentation = candidatePaths().filter(
    (path) => path.startsWith('docs/') && path.endsWith('.md'),
  );
  for (const path of documentation) {
    if ((await readFile(join(WORKSPACE, path), 'utf8')).match(LEGACY_ROOT) === null) continue;
    observed.push([path, categories.get(path) ?? 'UNCLASSIFIED']);
  }

  // Proof: restoring a stale `apps/be-01` path in docs/capacity.md made this actual-candidate
  // inventory fail with that current document classified as UNCLASSIFIED (2026-09-14).
  expect(observed).toEqual([...CLASSIFIED_LEGACY_DOCUMENTATION]);
});

test('the Nx test target watches every handoff verification input', async () => {
  const manifest = JSON.parse(
    await readFile(join(WORKSPACE, 'tools/tool-devsync/project.json'), 'utf8'),
  ) as { targets: { test: { inputs: string[] } } };
  const handoffInputs = new Set<string>(HANDOFF_TEST_INPUTS);
  const configured = manifest.targets.test.inputs.filter((input) => handoffInputs.has(input));

  // Proof: omitting the docs glob let a stale docs/capacity.md path reuse a green local-cache
  // entry; restoring this watched input made the same candidate execute and fail (2026-09-14).
  expect(configured).toEqual([...HANDOFF_TEST_INPUTS]);
});
