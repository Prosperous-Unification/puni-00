import type { ScopingEdit } from '@website/store-sqlite';

/** Strict external edit boundary; revision matching remains inside the store transaction. */
export function parseScopingEdit(input: unknown): { revision: number; edit: ScopingEdit } | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const fields = Object.fromEntries(Object.entries(input));
  const revision: unknown = fields['revision'];
  // Proof: removing nonnegative revision validation admitted the mounted negative revision edit.
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) return null;
  const kind: unknown = fields['kind'];
  if ((kind === 'accept_candidate' || kind === 'decline_email') && Object.keys(fields).length === 2)
    return { revision, edit: { kind } };
  // Proof: removing exact fields admitted the mounted extra-field brief edit.
  if (Object.keys(fields).length !== 3) return null;
  if (kind === 'references') {
    const references: unknown = fields['references'];
    // Proof: raising this bound admitted the mounted 4,001-character reference edit.
    if (references === null || (typeof references === 'string' && references.length <= 4000))
      return { revision, edit: { kind, references } };
  }
  const brief: unknown = fields['brief'];
  // Proof: raising this bound admitted the mounted 8,001-character canonical edit.
  if (kind === 'brief' && typeof brief === 'string' && brief.length <= 8000)
    return { revision, edit: { kind, brief } };
  return null;
}
