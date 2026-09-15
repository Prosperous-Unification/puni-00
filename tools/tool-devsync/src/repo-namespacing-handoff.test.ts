import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// tool-devsync's `build` target runs shellcheck over `bin/*.sh` and bundles no TypeScript, so the
// buildable-library half of the boundary rule has no output to protect here. The half that does
// apply — `scope:infra` may reach `product:shared` — holds, and workspace-projects.test.ts checks
// it against the real Nx graph.
// eslint-disable-next-line @nx/enforce-module-boundaries -- no TypeScript build to protect
import { parseOrThrow, type } from '@shared/validation';
import { expect, test } from 'bun:test';

import { readProjects } from '../workspace-projects.mjs';

const WORKSPACE = fileURLToPath(new URL('../../../', import.meta.url));
const LEGACY_ROOT =
  /(?:apps\/(?:be-01|fe-01|gw-01|mcp-01|\*+|\$\{[^}]+\})|libs\/(?:auth|config|conformance|contracts|core|domain|observability|realtime|runtime-portable|solver-py|store-memory|store-sqlite|validation|\*+|\$\{[^}]+\}))(?:\/|\b)/g;

/**
 * The one OpenSpec change whose packet is read as current prose rather than as a record of
 * what was once done. Every other unarchived packet keeps its own pre-move evidence in
 * `tasks.md` and `verify.md`, so the tree as a whole is not a source of current paths.
 */
const ACTIVE_OPENSPEC_PACKET = 'openspec/changes/automatic-dev-solver-binding/';

const LegacyAllowlist = type({
  expires: /^\d{4}-\d{2}-\d{2}$/,
  entries: type({ path: 'string>0', reason: 'string>0' }).array(),
});

/**
 * The documents excused from naming pre-move roots, each with why it is frozen. Malformed or
 * absent content throws rather than silently excusing nothing — an empty allowlist would let
 * every legacy reference read as current and pass.
 */
async function readLegacyAllowlist(): Promise<typeof LegacyAllowlist.infer> {
  const path = join(WORKSPACE, 'docs/findings/legacy-path-allowlist.json');
  // Proof: deleting the file failed every consumer here with `ENOENT ... open
  // '<workspace>/docs/findings/legacy-path-allowlist.json'`; replacing `entries` with `{}` failed
  // with `Validation failed: entries must be an array (was object)` (2026-09-15).
  return parseOrThrow(LegacyAllowlist, JSON.parse(await readFile(path, 'utf8')));
}

/** Every tracked Markdown a reader is expected to act on today, before the allowlist is removed. */
function documentCandidates(candidates: Iterable<string>): string[] {
  return [...candidates].filter(
    (path) =>
      path.endsWith('.md') &&
      (path.startsWith('docs/') || !path.includes('/') || path.startsWith(ACTIVE_OPENSPEC_PACKET)),
  );
}

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

async function currentDocuments(
  rootRouterSource?: string,
  candidates = new Set(candidatePaths()),
): Promise<string[]> {
  const readmes = [...candidates].filter(
    (path) =>
      path.endsWith('/README.md') &&
      (path.startsWith('apps/') || path.startsWith('libs/') || path.startsWith('tools/')),
  );
  const historical = new Set((await readLegacyAllowlist()).entries.map(({ path }) => path));
  const discovered = documentCandidates(candidates).filter((path) => !historical.has(path));
  const rootRouted = (await rootRoutedDocuments(rootRouterSource, candidates)).filter(
    (path) => candidates.has(path) && !historical.has(path),
  );
  return [...new Set([...discovered, ...rootRouted, ...readmes])].sort();
}

async function rootRoutedDocuments(
  rootRouterSource?: string,
  candidates = new Set(candidatePaths()),
): Promise<string[]> {
  const source = rootRouterSource ?? (await readFile(join(WORKSPACE, 'LLM_README.md'), 'utf8'));
  const destinations = [
    ...localMarkdownDestinations(source),
    ...[...source.matchAll(/`([^`\s]+\.md)`/g)].map((match) => match[1]),
  ];
  const routed: string[] = [];
  for (const destination of destinations) {
    const path = decodeURIComponent(destination.split(/[?#]/, 1)[0]).replace(/^\//, '');
    const isExplicitRoute =
      !/[{}*?[\]]/.test(path) &&
      (/^(?:apps|docs|libs|openspec|tools)\//.test(path) ||
        path === 'AGENTS.md' ||
        path === 'HUMAN_README.md');
    if (!isExplicitRoute) continue;
    const candidate = candidates.has(`${path}/README.md`) ? `${path}/README.md` : path;
    if (candidate.endsWith('.md')) routed.push(candidate);
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

async function currentDocumentLinkFailures(
  rootRouterSource?: string,
  candidates = new Set(candidatePaths()),
): Promise<string[]> {
  const failures: string[] = [];
  for (const routedPath of await rootRoutedDocuments(rootRouterSource, candidates)) {
    if (!candidates.has(routedPath)) {
      failures.push(`LLM_README.md -> ${routedPath} (absent ${routedPath})`);
    }
  }
  for (const sourcePath of await currentDocuments(rootRouterSource, candidates)) {
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

  // The five documents that record a pre-move path as evidence — the root-source block and the
  // 2026-08-31 runbook incident among them — carry their excuse in the allowlist instead of a
  // second list here; changing one of them rewrites evidence rather than repairing navigation.
  // Proof: rewriting the root-source path to its current namespace made root-migration.test.ts
  // fail 14 cases behind the exact router.landmines.001 payload mismatch (2026-09-14).
  // Proof: adding `` see `libs/domain/src/x.ts` `` to docs/capacity.md failed here naming
  // `docs/capacity.md:libs/domain/`, the discovered document that carries no excuse (2026-09-15).
  expect(references).toEqual([]);
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
  const historical = new Set((await readLegacyAllowlist()).entries.map(({ path }) => path));
  const current = new Set(await currentDocuments());
  const omitted = (await rootRoutedDocuments()).filter(
    (path) => !historical.has(path) && !current.has(path),
  );

  // Proof: the fixed list omitted six live LLM routes, including all three production runbooks;
  // this actual root-router comparison failed with their exact paths before discovery was wired.
  expect(omitted).toEqual([]);
});

test('absent inline-code root routes survive extraction', async () => {
  const missingRoute = 'docs/missing-runbook.md';
  const rootRouter = '`docs/runbook-prod-deploy.md` -> `docs/missing-runbook.md`';
  const candidates = new Set(candidatePaths());

  // Proof: injecting this absent inline-code destination into the root router returned only
  // the 18 existing routes until extraction stopped filtering destinations by candidate membership.
  expect(await rootRoutedDocuments(rootRouter, candidates)).toContain(missingRoute);
});

test('absent inline-code root routes fail validation by exact name', async () => {
  const missingRoute = 'docs/missing-runbook.md';
  const rootRouter = '`docs/runbook-prod-deploy.md` -> `docs/missing-runbook.md`';
  const candidates = new Set(candidatePaths());

  // Proof: the injected missing route previously produced no link failures; this exact
  // LLM_README.md diagnostic failed until routed destinations were validated before reads.
  expect(await currentDocumentLinkFailures(rootRouter, candidates)).toContain(
    `LLM_README.md -> ${missingRoute} (absent ${missingRoute})`,
  );
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

test('every alias has an allowed prefix and resolves to a tracked file', async () => {
  const base = JSON.parse(await readFile(join(WORKSPACE, 'tsconfig.base.json'), 'utf8')) as {
    compilerOptions: { paths: Record<string, string[]> };
  };
  const tracked = new Set(candidatePaths());
  const failures: string[] = [];
  for (const [alias, targets] of Object.entries(base.compilerOptions.paths)) {
    if (!/^@(wbs|shared|tools)\//.test(alias)) failures.push(`${alias}: prefix`);
    for (const target of targets) {
      const path = target.replace(/^\.\//, '').replace(/\/\*$/, '');
      const exists = tracked.has(path) || [...tracked].some((file) => file.startsWith(`${path}/`));
      if (!exists) failures.push(`${alias}: ${target} is not tracked`);
    }
  }

  // The two application entry aliases name an `src/index.ts` no application has and are imported
  // nowhere; `docs/2026-08-30-sustainability-audit.md` already records them as dead. They are
  // pinned rather than excused by a looser rule, so a third dead alias still fails here.
  // Proof: the two rows below are themselves the observed production failure — the rule found
  // them in the real tsconfig.base.json (2026-09-15). Injecting `@wbs/config` ->
  // ./libs/wbs/adapters/config/src/missing.ts added `@wbs/config: ... is not tracked`, and an
  // `@acme/x` -> ./libs/acme/src/index.ts alias added both `@acme/x: prefix` and its untracked
  // target (2026-09-15).
  expect(failures).toEqual([
    '@wbs/be-01: ./apps/wbs/be-01/src/index.ts is not tracked',
    '@wbs/gw-01: ./apps/wbs/gw-01/src/index.ts is not tracked',
  ]);
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
      'current recursive selector': 30,
      'frozen migration evidence': 19,
      'historical bootstrap policy or mapping': 65,
      'historical policy selector or baseline': 39,
      'production proof or revision transition': 18,
      'test fixture or proof': 98,
    },
    coverage: {
      applicationLibraryToolReadmes: 17,
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
    // Proof: leaving the pre-extraction digest here failed this test with the
    // observed `1f86dba5...` against the same occurrence count, because every
    // context carries its line number and the extraction shifted the recursive
    // selectors in workspace-inventory.test.ts down (2026-09-15).
    // Proof: leaving `1f86dba5.../262/23` here after the product lint policy moved out of
    // the root config failed on the observed `e705fb7a.../269/30` — the seven new
    // `apps/*/eslint.product.mjs` and `libs/*/eslint.product.mjs` selectors in nx.json and
    // lint-policy-cache.test.ts, all classified, none unclassified.
    // Proof: leaving `e705fb7a...` here after discovery moved into product-policies.mjs failed
    // on the observed `ae034489...` at the same 269/30 — the new nx.json and cache-test lines
    // carry no selector of their own and only shift the ones below them (2026-09-15).
    // Proof: leaving `ae034489...` here after the allowlist input joined this project's test
    // inputs failed on the observed `61b47ae3...` at the same 269/30 — the new
    // `{workspaceRoot}/docs/findings/legacy-path-allowlist.json` line carries no selector of its
    // own and only shifts the `apps/**` and `libs/**` ones below it (2026-09-15).
    digest: '61b47ae3309642a494eb46ddb3a2729425977a9493182dcbeacd0f8850845875',
    occurrences: 269,
    unclassified: [],
  });
});

test('every legacy documentation reference is classified', async () => {
  const allowlist = await readLegacyAllowlist();
  const excused = new Set(allowlist.entries.map(({ path }) => path));
  const candidates = new Set(candidatePaths());
  const unclassified: string[] = [];
  for (const path of documentCandidates(candidates)) {
    if ((await readFile(join(WORKSPACE, path), 'utf8')).match(LEGACY_ROOT) === null) continue;
    if (!excused.has(path)) unclassified.push(path);
  }

  // Proof: adding `` see `libs/domain/src/x.ts` `` to docs/capacity.md failed here naming that
  // exact document; dropping docs/local-dev.md from the allowlist file failed here naming that
  // exact path (2026-09-15).
  expect(unclassified).toEqual([]);

  // An entry for a path that no longer exists excuses nothing and hides that the document was
  // already repaired or deleted.
  // Proof: adding an entry for the absent docs/local-dev-gone.md failed here with that exact
  // path/reason row (2026-09-15).
  expect(allowlist.entries.filter(({ path }) => !candidates.has(path))).toEqual([]);
});

test('the legacy documentation allowlist has not expired', async () => {
  const allowlist = await readLegacyAllowlist();

  // Proof: setting expires to 2020-01-01 while 39 entries were still excused failed here with
  // received 1577836800000 against the run's own clock (2026-09-15).
  if (allowlist.entries.length > 0) {
    expect(new Date(allowlist.expires).getTime()).toBeGreaterThan(Date.now());
  }
});
