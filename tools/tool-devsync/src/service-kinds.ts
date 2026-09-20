import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// tool-devsync's `build` target runs shellcheck over `bin/*.sh` and bundles no TypeScript, so the
// buildable-library half of the boundary rule has no output to protect here. The half that does
// apply — `scope:infra` may reach `product:shared` — holds, and workspace-projects.test.ts checks
// it against the real Nx graph.
// eslint-disable-next-line @nx/enforce-module-boundaries -- no TypeScript build to protect
import { parseOrThrow, type } from '@shared/validation';

/** The reviewed classification, relative to the workspace root. */
export const KINDS_POLICY_PATH = 'docs/code-organization/kinds.json';

/** The directories whose non-test TypeScript files must each carry a kind. */
export const SERVICE_ROOTS = [
  'libs/wbs/application/core/src/service',
  'libs/wbs/application/core/src/use-cases',
  'apps/wbs/be-01/src/service',
] as const;

/** The filename endings that declare a kind on the file itself, so no policy entry is owed. */
// Proof: removing `.repository.ts` failed "a file that declares its kind by suffix owes no policy
// entry, wherever it lives" at its suffix-declared inventory (2026-09-20).
export const KIND_SUFFIXES = ['.feature.ts', '.repository.ts', '.resource.ts'] as const;

/**
 * How every re-export shim's disposition starts.
 *
 * Shims are classified mechanically — the file contains nothing but `export … from` — so they are
 * the one group that owes no written rationale. {@link entriesMissingRationale} reads this prefix
 * to tell the two groups apart, which is why it is a constant rather than a phrase in a document.
 */
export const SHIM_DISPOSITION_PREFIX = 're-export shim;';

/** One reviewed classification of one file that carries no kind suffix. */
export const KindEntry = type({
  path: 'string>0',
  // Proof: widening this to `string` failed "a policy that fails the schema is refused with the
  // failing field" at its ValidationError assertion (2026-09-20).
  kind: "'delivery' | 'feature' | 'repository' | 'resource' | 'support'",
  'capability?': 'string>0',
  'term?': 'string>0',
  'disposition?': 'string>0',
  'rationale?': 'string>0',
});
export type KindEntry = typeof KindEntry.infer;

/** The whole policy file: the date it was last reviewed and every entry. */
export const KindsPolicy = type({
  reviewed: /^\d{4}-\d{2}-\d{2}$/,
  entries: KindEntry.array(),
});

/**
 * The entries whose kind is asserted without the field that makes it checkable, as
 * `<path>: <field>`, sorted.
 *
 * Rule K9 is the reason: a feature that names no capability and a resource that names no glossary
 * term are claims nobody can test. A support entry owes the disposition that says where the file
 * should end up instead.
 */
export function entriesMissingRequiredField(entries: readonly KindEntry[]): readonly string[] {
  const missing: string[] = [];
  for (const entry of entries) {
    // Proof: deleting this clause failed "a kind asserted without the field that makes it
    // checkable is named" at its expected missing-fields array (2026-09-20).
    if (entry.kind === 'feature' && entry.capability === undefined) {
      missing.push(`${entry.path}: capability`);
    }
    // Proof: deleting this clause failed "a kind asserted without the field that makes it
    // checkable is named" at its expected missing-fields array (2026-09-20).
    if (entry.kind === 'resource' && entry.term === undefined) missing.push(`${entry.path}: term`);
    // Proof: deleting this clause failed "a kind asserted without the field that makes it
    // checkable is named" at its expected missing-fields array (2026-09-20).
    if (entry.kind === 'support' && entry.disposition === undefined) {
      missing.push(`${entry.path}: disposition`);
    }
  }
  return missing.sort();
}

/**
 * The entries that owe a one-line rationale and do not carry one, sorted.
 *
 * Every classification but a re-export shim is a reading of the file's callers, its stores and the
 * glossary, and that reading is the only evidence a reviewer has: no check can prove a kind right.
 * A shim is exempt because its disposition already states the whole of its evidence.
 */
export function entriesMissingRationale(entries: readonly KindEntry[]): readonly string[] {
  // Proof: dropping the `rationale === undefined` conjunct failed "every entry but a re-export
  // shim owes a written rationale" at its expected paths array (2026-09-20).
  return entries
    .filter(
      ({ disposition, rationale }) =>
        rationale === undefined && !(disposition ?? '').startsWith(SHIM_DISPOSITION_PREFIX),
    )
    .map(({ path }) => path)
    .sort();
}

/** True when the filename itself declares the kind, which is what rule K1 asks for. */
export function declaresKindBySuffix(path: string): boolean {
  return KIND_SUFFIXES.some((suffix) => path.endsWith(suffix));
}

/** A TypeScript source file a reader is expected to classify: no declarations, no tests. */
function isClassifiableSource(path: string): boolean {
  // Proof: replacing each of the `.ts`, `.d.ts`, `.test.` and `.spec.` predicates with `true`, one
  // at a time, failed "candidates are the non-test TypeScript files under the roots and nothing
  // else" at its expected candidates array (2026-09-20).
  return (
    path.endsWith('.ts') &&
    !path.endsWith('.d.ts') &&
    !path.includes('.test.') &&
    !path.includes('.spec.')
  );
}

/**
 * Every tracked path matching one pathspec, in Git's own order.
 *
 * @throws When `git ls-files` exits non-zero, naming the pathspec, the root and Git's message.
 *   An unreadable tree is never read as an empty one.
 */
async function trackedMatching(workspaceRoot: string, pathspec: string): Promise<string[]> {
  const child = Bun.spawn(['git', '-C', workspaceRoot, 'ls-files', '-z', '--', pathspec], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [listing, failure, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  // Proof: replacing this condition with `false` failed "a workspace Git cannot read is refused,
  // not read as an empty inventory" at its expected `git ls-files exited 128` message (2026-09-20).
  if (code !== 0) {
    throw new Error(
      `cannot list ${pathspec} in ${workspaceRoot}: git ls-files exited ${String(code)}: ${failure.trim()}`,
    );
  }
  return listing.split('\0').filter((path) => path.length > 0);
}

/**
 * Every backend service file that owes a policy entry, sorted and without duplicates.
 *
 * A file whose name ends in a kind suffix is excluded: it has already declared its kind, and
 * asking for an entry as well would mean deleting the entry again in the commit that adds the
 * suffix. {@link listSuffixDeclaredFiles} covers those.
 *
 * @throws When `git ls-files` fails, or when one of {@link SERVICE_ROOTS} tracks no file at all —
 *   a renamed root would otherwise silently shrink the inventory to nothing.
 */
export async function listServiceCandidates(workspaceRoot: string): Promise<readonly string[]> {
  const candidates = new Set<string>();
  for (const root of SERVICE_ROOTS) {
    const tracked = await trackedMatching(workspaceRoot, root);
    // Proof: replacing this condition with `false` failed "a service root that tracks nothing is
    // refused, not read as an empty inventory" at its expected stale-root message (2026-09-20).
    if (tracked.length === 0) {
      throw new Error(`${root} tracks no file in ${workspaceRoot}: the service roots are stale`);
    }
    for (const path of tracked) {
      // Proof: replacing the suffix predicate with `true` failed "a file that declares its kind by
      // suffix owes no policy entry, wherever it lives" at its candidate inventory (2026-09-20).
      if (isClassifiableSource(path) && !declaresKindBySuffix(path)) candidates.add(path);
    }
  }
  return [...candidates].sort();
}

/**
 * Every tracked file anywhere in the workspace whose name declares its kind, sorted.
 *
 * Empty today and expected to stay empty until a module task renames its first file; an empty
 * listing is therefore not an error here, unlike in {@link listServiceCandidates}.
 *
 * @throws When `git ls-files` fails.
 */
export async function listSuffixDeclaredFiles(workspaceRoot: string): Promise<readonly string[]> {
  const declared = new Set<string>();
  for (const suffix of KIND_SUFFIXES) {
    for (const path of await trackedMatching(workspaceRoot, `*${suffix}`)) {
      if (isClassifiableSource(path)) declared.add(path);
    }
  }
  return [...declared].sort();
}

/**
 * Reads and validates the classification policy.
 *
 * @throws When the file is absent or unreadable, is not JSON, fails the schema, or classifies one
 *   path twice. Never defaults: an empty policy would read as "nothing needs classifying".
 */
export async function readKinds(workspaceRoot: string): Promise<readonly KindEntry[]> {
  const path = join(workspaceRoot, KINDS_POLICY_PATH);
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (cause) {
    // Proof: returning `[]` here failed both "an absent policy is refused, naming the file" and
    // "an unreadable policy is refused, naming the file" at their refusal assertions (2026-09-20).
    throw new Error(`cannot read the service kinds policy at ${path}`, { cause });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (cause) {
    // Proof: returning `[]` here failed "a policy that is not JSON is refused, naming the file"
    // at its refusal assertion (2026-09-20).
    throw new Error(`the service kinds policy at ${path} is not JSON`, { cause });
  }
  const { entries } = parseOrThrow(KindsPolicy, parsed);
  const classified = new Set<string>();
  const twice = new Set<string>();
  for (const { path: entryPath } of entries) {
    if (classified.has(entryPath)) twice.add(entryPath);
    classified.add(entryPath);
  }
  // Proof: replacing this condition with `false` failed "a policy that classifies one path twice
  // is refused, naming the path" at its expected duplicate-path message (2026-09-20).
  if (twice.size > 0) {
    throw new Error(
      `the service kinds policy at ${path} classifies twice: ${[...twice].sort().join(', ')}`,
    );
  }
  return entries;
}
