import type { CandidateEntry } from '../inventory/read-candidate';
import type { RuleObservation } from './rule';

export type ServiceKind = 'delivery' | 'feature' | 'repository' | 'resource';

/**
 * The declaration rule K1 asks for: the kind is the filename suffix before the extension. A test file
 * is not matched, because `preferences.feature.test.ts` ends in `.test.ts`, not `.feature.ts`.
 */
// Proof: on 2026-09-20, loosening this to match a kind segment anywhere made the test-file check
// expect one kinded file and receive two.
const KindSuffix = /\.(feature|repository|resource)\.tsx?$/;

/** Wiring, exempt from K2 to K6 by never entering {@link KindGraph.files}. */
const CompositionRootName = 'composition.ts';

export interface KindedFile {
  readonly path: string;
  readonly kind: ServiceKind;
  /** The module directory this file belongs to, candidate-relative. */
  readonly module: string;
}

export interface KindGraph {
  /** Every directory that directly contains a kind-suffixed file, sorted. */
  readonly moduleRoots: readonly string[];
  /**
   * Every file a direction rule may judge, as a source or as a target.
   *
   * **A composition root is absent from this list, and that absence is the whole of its K2-to-K6
   * exemption**: a file with no kind is never a rule's source and never a forbidden target, so no
   * rule needs a guard for it. The taxonomy exempts composition roots because they install modules
   * and supply adapters.
   */
  readonly files: readonly KindedFile[];
  readonly compositionRoots: readonly string[];
}

function directoryOf(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut === -1 ? '' : path.slice(0, cut);
}

/**
 * A path inside a module directory. `''` is the candidate-root module identifier, and a candidate
 * path carries no leading slash, so joining `''` with `/` would build `/README.md` and match
 * nothing.
 */
function modulePath(root: string, name: string): string {
  // Proof: on 2026-09-20, always joining with `/` made the root-module test receive missing-index
  // and missing-contract findings at `.` instead of no findings.
  return root === '' ? name : `${root}/${name}`;
}

function kindOfSuffix(path: string): ServiceKind | undefined {
  const matched = KindSuffix.exec(path);
  if (matched === null) return undefined;
  const declared = matched[1];
  if (declared === 'feature') return 'feature';
  if (declared === 'repository') return 'repository';
  return 'resource';
}

/** The nearest enclosing module root, which is the longest one that contains the directory. */
function moduleOf(directory: string, moduleRoots: readonly string[]): string | undefined {
  let nearest: string | undefined;
  for (const root of moduleRoots) {
    // `''` is the candidate root and contains every directory, so it is exempt from the
    // containment test that a named root must pass.
    // Proof: on 2026-09-20, applying this guard to `''` made the root delivery path resolve to
    // `undefined` instead of the root module.
    if (root !== '' && directory !== root && !directory.startsWith(`${root}/`)) continue;
    // Proof: on 2026-09-20, keeping the first match made `m/inner/view/x.tsx` resolve to
    // `undefined` instead of module `m/inner`.
    if (nearest === undefined || root.length > nearest.length) nearest = root;
  }
  return nearest;
}

/**
 * Resolves every candidate file's kind and module from its path alone. It cannot fail: a file with no
 * suffix and no view directory simply has no kind, and no direction rule applies to it.
 *
 * **This is a suffix-only adapter, and nothing else makes a file accountable.** `INV-CLASSIFY` and
 * `classification-policy.v1.json` classify *content* — source, test, config, migration — and demand
 * no service kind, so an unsuffixed service is debt nowhere in this package; the only inventory that
 * demands a kind is `tools/tool-devsync/src/service-kinds.ts`, over three backend directories, and it
 * is not consulted here. Deleting every suffix in a candidate empties this graph and satisfies every
 * direction rule vacuously.
 *
 * Unsatisfied and recorded rather than claimed: `SERVICE-TAXONOMY-001`, `002` and `003`, which belong
 * to the inventory lane; and the **repository port** half of K3 and K4, because a port lives in an
 * unsuffixed `contract.ts` and is invisible here. A port boundary needs a declared input of its own.
 */
export function resolveKinds(entries: readonly CandidateEntry[]): KindGraph {
  const paths = entries
    .filter((entry) => entry.mode === '100644' || entry.mode === '100755')
    .map((entry) => entry.path);
  const moduleRoots = [
    ...new Set(paths.filter((path) => KindSuffix.test(path)).map(directoryOf)),
  ].sort();
  const files: KindedFile[] = [];
  const compositionRoots: string[] = [];
  for (const path of [...paths].sort()) {
    const directory = directoryOf(path);
    const module = moduleOf(directory, moduleRoots);
    if (module === undefined) continue;
    if (path === modulePath(module, CompositionRootName)) {
      compositionRoots.push(path);
      continue;
    }
    const declared = kindOfSuffix(path);
    if (declared !== undefined) {
      files.push({ path, kind: declared, module });
      continue;
    }
    const view = modulePath(module, 'view');
    // Proof: on 2026-09-20, keeping only the descendant half omitted `m/view/panel.tsx`, while
    // keeping only the direct half omitted `m/view/deep/row.tsx`.
    if (directory === view || directory.startsWith(`${view}/`)) {
      files.push({ path, kind: 'delivery', module });
    }
  }
  return { moduleRoots, files, compositionRoots };
}

/**
 * Every module directory that lacks something the module layout requires.
 *
 * The index comes from the **checked index report**, not from a filename: `readIndexes` skips a
 * `README.md` carrying no `module-index` comment and one whose mode is a symlink, so a module holding
 * an ordinary README has no index at all while a filename check would pass it. The contract must be a
 * regular blob for the same reason — a symlink named `contract.ts` declares nothing.
 */
export function moduleLayoutObservations(
  graph: KindGraph,
  entries: readonly CandidateEntry[],
  indexPaths: ReadonlySet<string>,
): readonly RuleObservation[] {
  const regularFiles = new Set(
    // Proof: on 2026-09-20, accepting every entry mode made the symlinked-contract test receive no
    // missing-contract finding.
    entries
      .filter((entry) => entry.mode === '100644' || entry.mode === '100755')
      .map((entry) => entry.path),
  );
  const observations: RuleObservation[] = [];
  for (const root of graph.moduleRoots) {
    // The candidate root is reported as `.`, the same whole-candidate path `REL-EXTRACT` uses,
    // because `RelativePath` forbids the empty string.
    const reported = root === '' ? '.' : root;
    // Proof: on 2026-09-20, looking for README.md in regular files made the ordinary-README test
    // receive no missing-index finding.
    if (!indexPaths.has(modulePath(root, 'README.md'))) {
      observations.push({ path: reported, message: 'module directory declares no wiki index' });
    }
    // Proof: on 2026-09-20, deleting this requirement made the no-contract test receive no finding.
    if (!regularFiles.has(modulePath(root, 'contract.ts'))) {
      observations.push({ path: reported, message: 'module directory declares no contract file' });
    }
  }
  return observations;
}
