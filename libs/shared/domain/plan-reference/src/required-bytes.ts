/** Required external bytes have no valid text or JSON representation. */
export class RequiredBytesError extends Error {}

/**
 * Strict UTF-8 text of required bytes.
 *
 * @throws `<role> is malformed: <path>` for empty input or invalid UTF-8.
 */
export function decodeRequiredText(bytes: Uint8Array, role: string, path: string): string {
  if (bytes.length === 0) throw new RequiredBytesError(`${role} is malformed: ${path} is empty`);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (failure) {
    throw new RequiredBytesError(`${role} is malformed: ${path} is not UTF-8`, { cause: failure });
  }
}

/**
 * The parsed JSON of required bytes, still unvalidated.
 *
 * @throws `<role> is malformed: <path>` for empty input, invalid UTF-8 or invalid JSON.
 */
export function parseRequiredJson(bytes: Uint8Array, role: string, path: string): unknown {
  const text = decodeRequiredText(bytes, role, path);
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (failure) {
    throw new RequiredBytesError(`${role} is malformed: ${path} is not JSON`, { cause: failure });
  }
}
