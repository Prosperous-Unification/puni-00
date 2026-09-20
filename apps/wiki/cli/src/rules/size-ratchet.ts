import { readCandidateBlob } from '../inventory/read-blob';
import type { CandidateEntry } from '../inventory/read-candidate';
import type { RuleObservation, RuleOutcome } from './rule';

/** One file the consumer has accepted above the ceiling, with the size it may not exceed. */
export interface PinnedSize {
  readonly path: string;
  readonly maximum: number;
}

export interface SizeCeilings {
  readonly ceiling: number;
  /** Candidate-relative directory prefixes whose production source is measured. */
  readonly roots: readonly string[];
  readonly pinned: readonly PinnedSize[];
}

/**
 * Lines as `wc -l` counts them: the number of newline bytes. A file with no final newline counts one
 * fewer than its visible lines; every text file in this repository ends in one, because the
 * repository formats with Prettier.
 */
export function countLines(bytes: Uint8Array): number {
  // Proof: on 2026-09-20, returning zero made the over-ceiling test receive `findings: []`.
  let lines = 0;
  for (const byte of bytes) {
    if (byte === 0x0a) lines += 1;
  }
  return lines;
}

/** Production source: TypeScript that is neither a declaration file nor a test. */
export function isMeasuredSource(path: string): boolean {
  // Proof: on 2026-09-20, measuring every path made the excluded-source test receive two findings.
  if (path.endsWith('.d.ts')) return false;
  if (path.includes('.test.') || path.includes('.spec.')) return false;
  return path.endsWith('.ts') || path.endsWith('.tsx');
}

function underOneRoot(path: string, roots: readonly string[]): boolean {
  // Proof: on 2026-09-20, using `path.startsWith(root)` made `src2/big.ts` a finding under `src`.
  return roots.some((root) => path === root || path.startsWith(`${root}/`));
}

/**
 * Measures every production source file under the policy's roots and reports the three ways the
 * ratchet is broken: an unpinned file over the ceiling, a pinned file over its pin, and a pinned
 * file that has fallen to or under the ceiling and must leave the list, so the list only shrinks.
 *
 * A pin naming a path the candidate does not measure is a stale record, not candidate debt, so it is
 * a failure to evaluate: no mode may report this rule clean while its policy is out of date.
 */
export function measureSizes(
  repository: string,
  entries: readonly CandidateEntry[],
  ceilings: SizeCeilings,
): RuleOutcome<readonly RuleObservation[]> {
  const measured = new Map<string, number>();
  for (const entry of entries) {
    if (entry.mode !== '100644' && entry.mode !== '100755') continue;
    if (!isMeasuredSource(entry.path)) continue;
    if (!underOneRoot(entry.path, ceilings.roots)) continue;
    measured.set(entry.path, countLines(readCandidateBlob(repository, entry.blob, entry.path)));
  }
  const pinnedByPath = new Map(ceilings.pinned.map((pin) => [pin.path, pin.maximum]));
  // Proof: on 2026-09-20, deleting this loop made the stale-pin test exit 0 instead of 1.
  for (const pinnedPath of pinnedByPath.keys()) {
    if (!measured.has(pinnedPath)) {
      return {
        ok: false,
        reason: `the size policy pins ${pinnedPath}, which the candidate does not measure`,
      };
    }
  }
  const observations: RuleObservation[] = [];
  for (const [path, lines] of [...measured].sort(([left], [right]) => (left < right ? -1 : 1))) {
    const maximum = pinnedByPath.get(path);
    if (maximum === undefined) {
      // Proof: on 2026-09-20, comparing with `>=` reported 40 lines at a ceiling of 40.
      if (lines > ceilings.ceiling) {
        observations.push({
          path,
          message: `${String(lines)} lines exceeds the ceiling ${String(ceilings.ceiling)}`,
        });
      }
      continue;
    }
    // Proof: on 2026-09-20, adding 1000 to the maximum made the grown-pin test receive no finding.
    if (lines > maximum) {
      observations.push({
        path,
        message: `${String(lines)} lines exceeds its pinned maximum ${String(maximum)}`,
      });
      continue;
    }
    // Proof: on 2026-09-20, deleting this branch made the shrunk-pin test receive no finding.
    if (lines <= ceilings.ceiling) {
      observations.push({
        path,
        message: `${String(lines)} lines is at or under the ceiling ${String(ceilings.ceiling)}: remove the pin`,
      });
    }
  }
  return { ok: true, report: observations };
}
