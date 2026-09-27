import { parseOrThrow, type } from '@shared/validation';

import { RelativePath } from '../contracts/records';
import { readCandidateBlob } from '../inventory/read-blob';
import type { CandidateSnapshot } from '../inventory/read-candidate';

/**
 * One reviewed kind for a file that does not declare its kind by filename suffix. `support` is code
 * that is not a service at all, such as a re-export shim; it is recorded so the file is accounted
 * for, and no direction rule judges it.
 */
const KindInventoryEntryRecord = type({
  path: RelativePath,
  kind: "'delivery'|'feature'|'repository'|'resource'|'support'",
  'capability?': 'string>=1',
  'term?': 'string>=1',
  'disposition?': 'string>=1',
  'rationale?': 'string>=1',
}).onUndeclaredKey('reject');

const KindInventoryRecord = type({
  reviewed: /^\d{4}-\d{2}-\d{2}$/,
  entries: KindInventoryEntryRecord.array(),
}).onUndeclaredKey('reject');

export type KindInventoryEntry = Pick<typeof KindInventoryEntryRecord.infer, 'path' | 'kind'>;

function isRegular(mode: string): boolean {
  return mode === '100644' || mode === '100755';
}

/**
 * Reads the kind inventory the rule policy names from the **selected candidate's blob**, never the
 * checkout, so a working-tree edit cannot change what a committed candidate is judged against.
 *
 * The inventory is candidate content, like a filename suffix: it declares kinds, it does not select
 * rules or modes, so reading it from the candidate does not let a candidate choose its own policy.
 * @throws Error when the inventory is absent or not a regular file, is not UTF-8 JSON, fails the
 *   schema, classifies one path twice, or lists a path that is not a regular file in the candidate.
 */
export function readKindInventory(
  repository: string,
  candidate: CandidateSnapshot,
  path: string,
): readonly KindInventoryEntry[] {
  const regular = new Map(
    candidate.entries.filter((entry) => isRegular(entry.mode)).map((entry) => [entry.path, entry]),
  );
  const stored = regular.get(path);
  // Proof: on 2026-09-27, returning no entries here made the absent-inventory CLI test receive
  // `unevaluated: []` for F1.
  if (stored === undefined) {
    throw new Error(`kind inventory ${path} is not a regular file in the selected candidate`);
  }
  // Outside the try: an unreadable blob is a Git failure, not a malformed inventory.
  // Proof: on 2026-09-27, reading the checkout's file instead made the selected-revision CLI test
  // receive `findings: []`.
  const bytes = readCandidateBlob(repository, stored.blob, path);
  let input: unknown;
  // Proof: on 2026-09-27, rethrowing the parser's error unchanged made the malformed-inventory CLI
  // test receive only `JSON Parse error: Expected '}'`.
  try {
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`malformed kind inventory JSON ${path}: ${detail}`, { cause });
  }
  const { entries } = parseOrThrow(KindInventoryRecord, input);
  const classified = new Set<string>();
  for (const entry of entries) {
    // Proof: on 2026-09-27, deleting this check made the duplicate-path CLI test receive
    // `unevaluated: []` for F1.
    if (classified.has(entry.path)) {
      throw new Error(`kind inventory ${path} classifies ${entry.path} twice`);
    }
    classified.add(entry.path);
    // Proof: on 2026-09-27, deleting this check made the stale-path CLI test receive
    // `unevaluated: []` for F1.
    if (!regular.has(entry.path)) {
      throw new Error(
        `kind inventory ${path} lists ${entry.path}, which is not a regular file in the selected candidate`,
      );
    }
  }
  return entries.map((entry) => ({ path: entry.path, kind: entry.kind }));
}
