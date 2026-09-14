import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';

import { readProjects } from '../workspace-projects.mjs';

const WORKSPACE = fileURLToPath(new URL('../../../', import.meta.url));
const LEGACY_ROOT =
  /(?:apps\/(?:be-01|fe-01|gw-01|mcp-01|\*+|\$\{[^}]+\})|libs\/(?:auth|config|conformance|contracts|core|domain|observability|realtime|runtime-portable|solver-py|store-memory|store-sqlite|validation|\*+|\$\{[^}]+\}))(?:\/|\b)/g;

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
  ['docs/adr/0008-tags-accumulate-down-the-tree.md', 'historical diff observation'],
  ['docs/adr/0009-a-work-item-type-does-not-inherit-at-all.md', 'historical diff observation'],
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
  '{workspaceRoot}/**/*',
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

async function currentDocuments(): Promise<string[]> {
  const readmes = candidatePaths().filter(
    (path) =>
      path.endsWith('/README.md') &&
      (path.startsWith('apps/') || path.startsWith('libs/') || path.startsWith('tools/')),
  );
  const historical = new Set<string>(CLASSIFIED_LEGACY_DOCUMENTATION.map(([path]) => path));
  const rootRouted = (await rootRoutedDocuments()).filter((path) => !historical.has(path));
  return [...new Set([...CURRENT_MARKDOWN, ...rootRouted, ...readmes])].sort();
}

async function rootRoutedDocuments(): Promise<string[]> {
  const candidates = new Set(candidatePaths());
  const source = await readFile(join(WORKSPACE, 'LLM_README.md'), 'utf8');
  const destinations = [
    ...localMarkdownDestinations(source),
    ...[...source.matchAll(/`([^`\s]+\.md)`/g)].map((match) => match[1]),
  ];
  const routed: string[] = [];
  for (const destination of destinations) {
    const path = decodeURIComponent(destination.split(/[?#]/, 1)[0]).replace(/^\//, '');
    const candidate = candidates.has(path)
      ? path
      : candidates.has(`${path}/README.md`)
        ? `${path}/README.md`
        : undefined;
    if (candidate?.endsWith('.md') === true) routed.push(candidate);
  }
  return [...new Set(routed)].sort();
}

function localMarkdownDestinations(source: string): string[] {
  const destinations: string[] = [];
  for (const match of source.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)/g)) {
    destinations.push(match[1].replace(/^<|>$/g, ''));
  }
  for (const match of source.matchAll(/^\s*\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm)) {
    destinations.push(match[1].replace(/^<|>$/g, ''));
  }
  return destinations.filter(
    (destination) => !/^[a-z][a-z0-9+.-]*:/i.test(destination) && !destination.startsWith('//'),
  );
}

function documentAnchors(source: string): Set<string> {
  const anchors = new Set<string>();
  const collisions = new Map<string, number>();
  for (const match of source.matchAll(
    /<(?:a|[a-z][a-z0-9-]*)\s+[^>]*(?:id|name)=["']([^"']+)["'][^>]*>/gi,
  )) {
    anchors.add(match[1]);
  }
  for (const match of source.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const visible = match[1]
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/[`*_~]/g, '')
      .toLocaleLowerCase('en-US');
    const base = visible
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .trim()
      .replace(/\s+/g, '-');
    const collision = collisions.get(base) ?? 0;
    collisions.set(base, collision + 1);
    anchors.add(collision === 0 ? base : `${base}-${String(collision)}`);
  }
  return anchors;
}

async function currentDocumentLinkFailures(): Promise<string[]> {
  const candidates = new Set(candidatePaths());
  const failures: string[] = [];
  for (const sourcePath of await currentDocuments()) {
    const source = await readFile(join(WORKSPACE, sourcePath), 'utf8');
    for (const destination of localMarkdownDestinations(source)) {
      const hashAt = destination.indexOf('#');
      const encodedPath = hashAt === -1 ? destination : destination.slice(0, hashAt);
      const encodedAnchor = hashAt === -1 ? '' : destination.slice(hashAt + 1);
      const decodedPath = decodeURIComponent(encodedPath.split('?', 1)[0]);
      let targetPath =
        decodedPath.length === 0
          ? sourcePath
          : decodedPath.startsWith('/')
            ? posix.normalize(decodedPath.slice(1))
            : posix.normalize(posix.join(posix.dirname(sourcePath), decodedPath));
      if (!candidates.has(targetPath) && candidates.has(`${targetPath}/README.md`)) {
        targetPath = `${targetPath}/README.md`;
      }
      if (!candidates.has(targetPath)) {
        failures.push(`${sourcePath} -> ${destination} (absent ${targetPath})`);
        continue;
      }
      if (encodedAnchor.length === 0 || !targetPath.endsWith('.md')) {
        continue;
      }
      const anchors = documentAnchors(await readFile(join(WORKSPACE, targetPath), 'utf8'));
      const anchor = decodeURIComponent(encodedAnchor);
      if (!anchors.has(anchor))
        failures.push(`${sourcePath} -> ${destination} (absent #${anchor})`);
    }
  }
  return failures;
}

function isRelevantSourceConfig(path: string): boolean {
  if (
    path === 'tools/tool-devsync/src/repo-namespacing-handoff.test.ts' ||
    path.endsWith('/README.md') ||
    path.endsWith('.md')
  ) {
    return false;
  }
  const basename = posix.basename(path);
  const isConfigurationName =
    basename === 'Dockerfile' ||
    basename.endsWith('.Dockerfile') ||
    basename.startsWith('Caddyfile') ||
    /^\.[a-z0-9.-]+$/i.test(basename);
  const isTextExtension =
    /\.(?:[cm]?[jt]sx?|py|sh|json|ya?ml|toml|ini|conf|service|caddy|sql)$/i.test(path);
  const isOwnedFamily =
    /^(?:\.github|apps|libs|tools|bin|deploy|ops)\//.test(path) ||
    path.startsWith('docs/wiki-policy/') ||
    !path.includes('/');
  return isOwnedFamily && (isConfigurationName || isTextExtension || path.startsWith('bin/'));
}

async function legacySourceOccurrences(): Promise<{
  categories: Record<string, number>;
  coverage: {
    applicationLibraryToolReadmes: number;
    dockerfiles: string[];
    extensionlessScripts: boolean;
    policyJson: boolean;
    python: boolean;
  };
  digest: string;
  occurrences: number;
  unclassified: string[];
}> {
  const contexts: string[] = [];
  const categories: Record<string, number> = {};
  const unclassified: string[] = [];
  const relevantPaths = candidatePaths().filter(isRelevantSourceConfig);
  for (const path of relevantPaths) {
    const lines = (await readFile(join(WORKSPACE, path), 'utf8')).split('\n');
    for (const [offset, line] of lines.entries()) {
      for (const match of line.matchAll(LEGACY_ROOT)) {
        const context = `${path}:${String(offset + 1)}:${match[0]}:${line.trim()}`;
        contexts.push(context);
        const category = /^(?:apps|libs)\/\*+\//.test(match[0])
          ? 'current recursive selector'
          : path.includes('/drizzle/') && path.endsWith('.sql')
            ? 'frozen migration evidence'
            : /(?:\.test\.[^/]+|\.test\.sh)$/.test(path) || path.includes('/fixtures/')
              ? 'test fixture or proof'
              : [
                    'docs/wiki-policy/bootstrap-policy.json',
                    'docs/wiki-policy/modules.bootstrap.json',
                    'docs/wiki-policy/relationships.bootstrap.json',
                  ].includes(path)
                ? 'historical bootstrap policy or mapping'
                : path === 'docs/wiki-policy/policy.json'
                  ? 'historical policy selector or baseline'
                  : [
                        '.dockerignore',
                        '.github/workflows/ci.yml',
                        'lefthook.yml',
                        'tools/tool-dagger/src/main.ts',
                        'tools/tool-deploy/src/migrations.ts',
                        'tools/tool-git-hooks/src/hooks/corpus-version-lint.ts',
                        'tools/tool-wiki/src/admission/authority-store.ts',
                        'tools/tool-wiki/src/admission/claims.ts',
                        'tools/tool-wiki/src/contracts/records.ts',
                      ].includes(path)
                    ? 'production proof or revision transition'
                    : 'UNCLASSIFIED';
        categories[category] = (categories[category] ?? 0) + 1;
        if (category === 'UNCLASSIFIED') unclassified.push(context);
      }
    }
  }
  contexts.sort();
  return {
    categories,
    coverage: {
      applicationLibraryToolReadmes: (await currentDocuments()).filter(
        (path) =>
          path.endsWith('/README.md') &&
          (path.startsWith('apps/') || path.startsWith('libs/') || path.startsWith('tools/')),
      ).length,
      dockerfiles: relevantPaths.filter((path) => {
        const basename = posix.basename(path);
        return basename === 'Dockerfile' || basename.endsWith('.Dockerfile');
      }),
      extensionlessScripts: relevantPaths.includes('bin/dev-ports.sh'),
      policyJson: relevantPaths.includes('docs/wiki-policy/policy.json'),
      python: relevantPaths.some((path) => path.endsWith('.py')),
    },
    digest: createHash('sha256').update(JSON.stringify(contexts)).digest('hex'),
    occurrences: contexts.length,
    unclassified,
  };
}

test('current documentation and active solver packets use namespaced roots', async () => {
  const references: string[] = [];
  for (const path of await currentDocuments()) {
    const source = await readFile(join(WORKSPACE, path), 'utf8');
    for (const match of source.matchAll(LEGACY_ROOT)) references.push(`${path}:${match[0]}`);
  }

  // The 2026-08-31 runbook incident records the path at observation time; changing that one
  // reference would rewrite evidence rather than repair current navigation.
  expect(references).toEqual([
    'docs/adr/0008-tags-accumulate-down-the-tree.md:libs/domain/',
    'docs/adr/0009-a-work-item-type-does-not-inherit-at-all.md:libs/domain/',
    'docs/local-dev.md:apps/fe-01',
    'docs/runbook-dev-deploy.md:apps/be-01/',
  ]);
});

test('current Nx commands select existing qualified projects', async () => {
  const projectNames = new Set((await readProjects(WORKSPACE)).map(({ name }) => name));
  const staleSelectors: string[] = [];
  for (const path of await currentDocuments()) {
    const lines = (await readFile(join(WORKSPACE, path), 'utf8')).split('\n');
    for (const [offset, line] of lines.entries()) {
      if (line.includes('historical path)')) continue;
      const commandSelectors = [
        ...line.matchAll(/\bnx run ([a-z0-9-]+):/g),
        ...line.matchAll(/\bnx (?:test|lint|build|typecheck) ([a-z0-9-]+)/g),
      ];
      for (const match of commandSelectors) {
        const selector = match[1];
        if (!projectNames.has(selector)) {
          staleSelectors.push(`${path}:${String(offset + 1)}:${selector}`);
        }
      }
    }
  }

  // Proof: the pre-review current commands named `be-01`, `gw-01`, `fe-01`, and `validation`;
  // this oracle failed with their five exact locations instead of trusting path-only checks.
  expect(staleSelectors).toEqual([]);
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

test('every routed current document resolves its local links and anchors', async () => {
  // Proof: adding `[fault](missing-round-one.md)` to non-index guide docs/capacity.md made this
  // complete current-document reader fail with its exact source, destination, and absent path.
  // Proof: adding a missing link to newly discovered docs/runbook-prod-deploy.md failed with its
  // exact routed source/destination, proving root discovery feeds this reader (2026-09-14).
  expect(await currentDocumentLinkFailures()).toEqual([]);
});

test('every root-routed current document participates in handoff checks', async () => {
  const historical = new Set<string>(CLASSIFIED_LEGACY_DOCUMENTATION.map(([path]) => path));
  const current = new Set(await currentDocuments());
  const omitted = (await rootRoutedDocuments()).filter(
    (path) => !historical.has(path) && !current.has(path),
  );

  // Proof: the fixed list omitted six live LLM routes, including all three production runbooks;
  // this actual root-router comparison failed with their exact paths before discovery was wired.
  expect(omitted).toEqual([]);
});

test('every Dockerfile naming variant participates in source inventory', () => {
  const dockerfile = /(?:^|\/)(?:Dockerfile|[^/]+\.Dockerfile)$/;
  const candidates = candidatePaths().filter((path) => dockerfile.test(path));
  const inventoried = candidatePaths()
    .filter(isRelevantSourceConfig)
    .filter((path) => dockerfile.test(path));

  // Proof: exact-basename matching omitted solver-orphan-fixture.Dockerfile from this manifest;
  // this test failed with that exact missing app path before suffix matching was added.
  expect(inventoried).toEqual(candidates);
});

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

test('every legacy source occurrence and relevant text family is pinned', async () => {
  // Proof: injecting executable `const roundOneFault = 'apps/be-01/src'` into the already
  // classified tool-dagger main changed the pinned occurrence count/digest and failed this test.
  // Proof: changing solver-orphan-fixture.Dockerfile line 4 to `COPY apps/be-01/...` failed with
  // that exact UNCLASSIFIED context, count 262, and digest 116ba02b... (2026-09-14).
  expect(await legacySourceOccurrences()).toEqual({
    categories: {
      'current recursive selector': 22,
      'frozen migration evidence': 19,
      'historical bootstrap policy or mapping': 65,
      'historical policy selector or baseline': 39,
      'production proof or revision transition': 18,
      'test fixture or proof': 98,
    },
    coverage: {
      applicationLibraryToolReadmes: 16,
      dockerfiles: [
        'apps/wbs/be-01/Dockerfile',
        'apps/wbs/be-01/scripts/solver-orphan-fixture.Dockerfile',
        'apps/wbs/fe-01/Dockerfile',
        'apps/wbs/gw-01/Dockerfile',
        'deploy/dev-src/Dockerfile',
      ],
      extensionlessScripts: true,
      policyJson: true,
      python: true,
    },
    digest: '0b4393e5b99993b8be5c481455f61612d06048de0bdbcff1bfca47f697fdf669',
    occurrences: 261,
    unclassified: [],
  });
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

  // Proof: without the all-candidate input, adding an old root to the previously unwatched
  // bin/dev-ports.sh replayed a green local cache; restoring it executed and failed the target.
  expect(configured).toEqual([...HANDOFF_TEST_INPUTS]);
});
