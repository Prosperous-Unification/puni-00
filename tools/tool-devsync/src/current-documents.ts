import { readFile } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseOrThrow, type } from '@shared/validation';

import { readProjects } from '../workspace-projects.mjs';

const LEGACY_ROOT =
  /(?:apps\/(?:be-01|fe-01|gw-01|mcp-01|\*+|\$\{[^}]+\})|libs\/(?:auth|config|conformance|contracts|core|domain|observability|realtime|runtime-portable|solver-py|store-memory|store-sqlite|validation|\*+|\$\{[^}]+\}))(?:\/|\b)/g;

/**
 * What the three per-document checks need to run: the tracked tree and the real Nx project
 * names, plus every product those projects declare, which the alias-prefix rule reads.
 */
interface DocumentContext {
  readonly candidates: ReadonlySet<string>;
  readonly projectNames: ReadonlySet<string>;
  readonly products: ReadonlySet<string>;
}

/**
 * Bind current-document checks to one actual Git checkout, including admitted untracked
 * files. Reads, malformed exemption state, and unmerged indexes throw.
 * Existing regression tests consume the same helpers as {@link validateDocuments}.
 */
export function createDocumentChecks(repository: string) {
  const WORKSPACE = resolve(repository);
  /**
   * The one OpenSpec change whose packet is read as current prose rather than as a record of
   * what was once done. Every other unarchived packet keeps its own pre-move evidence in
   * `tasks.md` and `verify.md`, so the tree as a whole is not a source of current paths.
   */
  const ACTIVE_OPENSPEC_PACKET = 'openspec/changes/automatic-dev-solver-binding/';

  async function documentContext(
    candidates: ReadonlySet<string> = new Set(candidatePaths()),
  ): Promise<DocumentContext> {
    const projects = await readProjects(WORKSPACE);
    return {
      candidates,
      projectNames: new Set(projects.map(({ name }) => name)),
      products: new Set(
        projects.flatMap(({ tags }) =>
          tags
            .filter((tag) => tag.startsWith('product:'))
            .map((tag) => tag.slice('product:'.length)),
        ),
      ),
    };
  }

  /**
   * Every check a current document has to pass, each reporting what it found in **one** document.
   * An exemption names the checks it excuses, so excusing a stale `nx` selector never also excuses
   * a pre-move path or a dead link in the same file.
   */
  const DOCUMENT_CHECKS = {
    'legacy-root': legacyRootFailures,
    'nx-selector': staleSelectorFailures,
    links: localLinkFailures,
  } as const satisfies Record<
    string,
    (path: string, context: DocumentContext) => Promise<string[]>
  >;

  type DocumentCheck = keyof typeof DOCUMENT_CHECKS;

  // DOCUMENT_CHECKS is a closed object: its keys are exactly DocumentCheck.
  const DOCUMENT_CHECK_NAMES = Object.keys(DOCUMENT_CHECKS) as DocumentCheck[];

  const CheckExemptions = type({
    expires: /^\d{4}-\d{2}-\d{2}$/,
    entries: type({
      path: 'string>0',
      reason: 'string>0',
      excuses: type
        .enumerated(...DOCUMENT_CHECK_NAMES)
        .array()
        .atLeastLength(1),
    }).array(),
  });

  /**
   * The documents exempted from named current-document checks, each with why it is frozen and which
   * checks it escapes. Malformed or absent content throws rather than silently exempting nothing —
   * an empty file would let every stale reference read as current and pass. The check names are
   * taken from {@link DOCUMENT_CHECKS}, so an unknown or empty `excuses` is refused here.
   */
  async function readCheckExemptions(): Promise<typeof CheckExemptions.infer> {
    const path = join(WORKSPACE, 'docs/findings/current-document-check-exemptions.json');
    // Proof: deleting the file failed every consumer here with `ENOENT ... open
    // '<workspace>/docs/findings/current-document-check-exemptions.json'`; replacing `entries` with
    // `{}` failed with `Validation failed: entries must be an array (was object)`; an `excuses: []`
    // failed with `value at [0].excuses must be non-empty` and an `excuses: ['nope']` with
    // `must be "legacy-root", "links" or "nx-selector" (was "nope")` (2026-09-15).
    // Proof: replacing this read/parse with empty exemptions failed four production CLI
    // regressions: absent, unreadable, malformed and unknown-check state (2026-10-22).
    return parseOrThrow(CheckExemptions, JSON.parse(await readFile(path, 'utf8')));
  }

  /** The documents whose entry excuses `check` — and no document excused only from another check. */
  async function exemptedFrom(check: DocumentCheck): Promise<Set<string>> {
    const { entries } = await readCheckExemptions();
    return new Set(
      entries.filter(({ excuses }) => excuses.includes(check)).map(({ path }) => path),
    );
  }

  /** Every tracked Markdown a reader is expected to act on today. */
  function documentCandidates(candidates: Iterable<string>): string[] {
    return [...candidates].filter(
      (path) =>
        path.endsWith('.md') &&
        (path.startsWith('docs/') ||
          !path.includes('/') ||
          path.startsWith(ACTIVE_OPENSPEC_PACKET)),
    );
  }

  /**
   * Refuse an unmerged index. `git ls-files --cached` lists a conflicted path once per stage, so
   * during a merge conflict the enumeration below reports that file two or three times and every
   * count and digest built on it is silently wrong. A half-finished merge is not a state these
   * oracles can describe, so they throw rather than count.
   *
   * @throws Error naming each unmerged path when the index holds any.
   */
  function refuseUnmergedIndex(unmergedListing: string): void {
    const paths = [
      ...new Set(
        unmergedListing
          .split('\0')
          .filter(Boolean)
          .map((entry) => entry.slice(entry.indexOf('\t') + 1)),
      ),
    ].sort();
    if (paths.length > 0) {
      throw new Error(`cannot enumerate candidate source: index is unmerged: ${paths.join(', ')}`);
    }
  }

  function readGitOutput(argv: readonly string[]): string {
    const invocation = Bun.spawnSync(['git', ...argv], {
      cwd: WORKSPACE,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (invocation.exitCode !== 0) {
      throw new Error(
        `cannot enumerate candidate source: ${new TextDecoder().decode(invocation.stderr)}`,
      );
    }
    return invocation.stdout.toString();
  }

  function candidatePaths(): string[] {
    // Proof: changing the unmerged probe to `ls-files --cached -z` made the legacy-occurrence
    // production path throw `cannot enumerate candidate source: index is unmerged:` followed by
    // the tracked paths; restoring the probe returned the filtered sweep to 14 pass (2026-09-21).
    refuseUnmergedIndex(readGitOutput(['ls-files', '--unmerged', '-z']));
    return readGitOutput(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
      .split('\0')
      .filter(Boolean);
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
    const rootRouted = (await rootRoutedDocuments(rootRouterSource, candidates)).filter((path) =>
      candidates.has(path),
    );
    return [...new Set([...documentCandidates(candidates), ...rootRouted, ...readmes])].sort();
  }

  async function legacyRootFailures(path: string): Promise<string[]> {
    const source = await readFile(join(WORKSPACE, path), 'utf8');
    return [...source.matchAll(LEGACY_ROOT)].map((match) => `${path}:${match[0]}`);
  }

  async function staleSelectorFailures(path: string, context: DocumentContext): Promise<string[]> {
    const failures: string[] = [];
    const lines = (await readFile(join(WORKSPACE, path), 'utf8')).split('\n');
    for (const [offset, line] of lines.entries()) {
      if (line.includes('historical path)')) continue;
      const commandSelectors = [
        ...line.matchAll(/\bnx run ([a-z0-9-]+):/g),
        ...line.matchAll(/\bnx (?:test|lint|build|typecheck) ([a-z0-9-]+)/g),
      ];
      for (const match of commandSelectors) {
        if (!context.projectNames.has(match[1])) {
          failures.push(`${path}:${String(offset + 1)}:${match[1]}`);
        }
      }
    }
    return failures;
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
        // GitHub replaces each space with its own hyphen, so `F8 — Build` is `f8--build`.
        // Proof: collapsing runs with `\s+` reported docs/infra/deployment.md's GitHub-valid
        // `#f8--build-the-wbs-kubernetes-release-transaction` link absent, and excused three dated
        // docs whose links were already GitHub-valid (2026-09-18).
        .replace(/\s/g, '-');
      const collision = collisions.get(base) ?? 0;
      collisions.set(base, collision + 1);
      anchors.add(collision === 0 ? base : `${base}-${String(collision)}`);
    }
    return anchors;
  }

  async function localLinkFailures(
    sourcePath: string,
    context: DocumentContext,
  ): Promise<string[]> {
    const { candidates } = context;
    const failures: string[] = [];
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
      if (encodedAnchor.length === 0 || !targetPath.endsWith('.md')) continue;
      const anchors = documentAnchors(await readFile(join(WORKSPACE, targetPath), 'utf8'));
      const anchor = decodeURIComponent(encodedAnchor);
      if (!anchors.has(anchor))
        failures.push(`${sourcePath} -> ${destination} (absent #${anchor})`);
    }
    return failures;
  }

  /** Every failure `check` finds across the current documents it is not excused from. */
  async function currentDocumentFailures(
    check: DocumentCheck,
    context: DocumentContext,
    rootRouterSource?: string,
  ): Promise<string[]> {
    const exempted = await exemptedFrom(check);
    const failures: string[] = [];
    for (const path of await currentDocuments(rootRouterSource, new Set(context.candidates))) {
      if (exempted.has(path)) continue;
      failures.push(...(await DOCUMENT_CHECKS[check](path, context)));
    }
    return failures;
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
    const context = await documentContext(candidates);
    failures.push(...(await currentDocumentFailures('links', context, rootRouterSource)));
    return failures;
  }

  /** Refuse stale, out-of-scope or unnecessary check exemptions rather than suppressing work. */
  async function exemptionFailures(context: DocumentContext): Promise<string[]> {
    const { entries, expires } = await readCheckExemptions();
    const failures: string[] = [];
    // Proof: disabling expiry enforcement failed the expired-exemptions CLI regression
    // because the exact expiry refusal disappeared (2026-10-22).
    if (entries.length > 0 && !(new Date(expires).getTime() > Date.now())) {
      failures.push(`current-document exemptions expired: ${expires}`);
    }
    const current = new Set(await currentDocuments(undefined, new Set(context.candidates)));
    for (const { path, excuses } of entries) {
      if (!context.candidates.has(path)) {
        // Proof: removing this failure made the absent-document exemption CLI regression
        // report success instead of refusing the nonexistent document (2026-10-22).
        failures.push(`absent exemption document: ${path}`);
        continue;
      }
      // Proof: removing this guard let a frozen OpenSpec record carry a links exemption;
      // the production non-current-exemption CLI regression failed (2026-10-22).
      if (!current.has(path)) failures.push(`non-current exemption document: ${path}`);
      for (const check of excuses) {
        if ((await DOCUMENT_CHECKS[check](path, context)).length === 0) {
          // Proof: removing this failure let a valid guide suppress its links check;
          // the unneeded-exemption CLI regression failed on exit 0 (2026-10-22).
          failures.push(`unneeded exemption: ${path}:${check}`);
        }
      }
    }
    return failures;
  }

  /** Run the production index checker against this checkout, without its regression suite. */
  function checkIndexes(): void {
    const cli = fileURLToPath(
      new URL('../../../apps/twilight-structure/twilight-burokrat/cli/src/cli.ts', import.meta.url),
    );
    const invocation = Bun.spawnSync(
      [process.execPath, 'run', cli, 'check-indexes', 'working', WORKSPACE, 'HEAD'],
      { cwd: WORKSPACE, env: process.env, stdout: 'pipe', stderr: 'pipe' },
    );
    const stderr = invocation.stderr.toString();
    if (invocation.exitCode !== 0 || stderr.length > 0) {
      throw new Error(`document index validation failed: ${stderr}`);
    }
  }

  return {
    DOCUMENT_CHECKS,
    DOCUMENT_CHECK_NAMES,
    candidatePaths,
    checkIndexes,
    currentDocumentFailures,
    currentDocumentLinkFailures,
    currentDocuments,
    documentContext,
    exemptedFrom,
    exemptionFailures,
    readCheckExemptions,
    rootRoutedDocuments,
  };
}

/**
 * Validate current paths, documented Nx project selectors, local links/anchors, exemption
 * integrity and production index memberships in the supplied actual checkout.
 * @throws Error for invalid documents or missing, unreadable or malformed required state.
 */
export async function validateDocuments(repository: string): Promise<void> {
  const checks = createDocumentChecks(repository);
  const context = await checks.documentContext();
  const failures = await checks.exemptionFailures(context);
  // Proof: omitting legacy-root or nx-selector independently made its production CLI
  // fault regression receive exit 0 instead of its exact refusal (2026-10-22).
  for (const check of ['legacy-root', 'nx-selector'] as const) {
    failures.push(...(await checks.currentDocumentFailures(check, context)));
  }
  // Proof: removing this call failed all three CLI negatives for an absent local path,
  // absent anchor and absent inline-code root route (2026-10-22).
  failures.push(...(await checks.currentDocumentLinkFailures()));
  if (failures.length > 0)
    throw new Error(`current-document validation failed:\n${failures.join('\n')}`);
  // Proof: removing the index check let an absent.md membership pass; the production
  // index-membership CLI regression failed on exit 0 (2026-10-22).
  checks.checkIndexes();
}
