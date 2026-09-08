/** The UTF-8 byte length stored in saved-plan headers and used by quotas. */
export function bodyByteLength(bytes: string): number {
  return new TextEncoder().encode(bytes).length;
}
