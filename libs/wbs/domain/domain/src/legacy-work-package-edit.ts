/**
 * Ordinary preactivation edits admit only unrestricted work packages.
 * Scoped writers use their actual granted admission instead; creator/owner
 * metadata grants no authority here. Creation/import and saved-plan header
 * maintenance have their own admitted owners and do not use this predicate.
 *
 * Historical owner-bearing generation's proof record, retained verbatim:
 * Proof: forcing this function to return `true` made `announces nothing for a
 * write it refused` receive an `ok: true` marker instead of the expected
 * `forbidden` refusal; watched 2026-09-22.
 */
export function canEditLegacyWorkPackage(workPackage: { readonly restricted: boolean }): boolean {
  return !workPackage.restricted;
}
