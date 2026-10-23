/** A fake WBS API key minted at run time: the plaintext-secrets hook refuses a key literal. */
export function fakeCredential(): string {
  return `wbs_mk_${crypto.randomUUID()}.${'k'.repeat(43)}`;
}
