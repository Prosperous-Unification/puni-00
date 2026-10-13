import { hashBytes } from '../evidence/content-manifest';
import { readSelectedBlob } from '../inventory/read-blob';
import type { CandidateSnapshot } from '../inventory/read-candidate';
import type { SpecInput } from './spec-parser';

const MainSpec = /^openspec\/specs\/([a-z][a-z0-9-]*)\/spec\.md$/;
// Proof: admitting archive/held made TEST-AXES-055 parse its malformed archived source and refuse.
const ChangeSpec = /^openspec\/changes\/([a-z][a-z0-9-]*)\/specs\/([a-z][a-z0-9-]*)\/spec\.md$/;

/** Reads immutable regular active specification blobs, excluding archive paths. */
export function readActiveSpecifications(
  repository: string,
  candidate: CandidateSnapshot,
): readonly SpecInput[] {
  const selected: SpecInput[] = [];
  for (const entry of candidate.entries) {
    const main = MainSpec.exec(entry.path);
    const change = ChangeSpec.exec(entry.path);
    const capability = main?.[1] ?? change?.[2];
    if (capability === undefined) continue;
    // Proof: removing this guard let TEST-AXES-056's committed symlink source reach the parser.
    if (entry.mode !== '100644' && entry.mode !== '100755') {
      throw new Error(`canonical specification must be a regular blob: ${entry.path}`);
    }
    // Proof: substituting fixed valid bytes bypassed both TEST-AXES-056 missing/unreadable reader faults.
    const bytes = readSelectedBlob(repository, candidate.entries, entry.blob, entry.path);
    let markdown: string;
    try {
      // Proof: nonfatal decoding lost TEST-AXES-056's named malformed UTF-8 refusal.
      markdown = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (cause) {
      throw new Error(`canonical specification is not UTF-8: ${entry.path}`, { cause });
    }
    selected.push({
      path: entry.path,
      capability,
      markdown,
      digest: hashBytes(bytes),
      kind: main === null ? 'change' : 'main',
    });
  }
  return selected;
}
