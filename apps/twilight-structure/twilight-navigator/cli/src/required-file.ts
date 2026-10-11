import { open, readFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

function errorCode(failure: unknown): unknown {
  return typeof failure === 'object' && failure !== null && 'code' in failure
    ? failure.code
    : undefined;
}

/**
 * The bytes of a required input file. `role` names the file in every refusal.
 *
 * @throws `<role> is missing: <path>` when nothing is at the path, and `<role> is unreadable:
 * <path>` for any other read failure (permissions, a directory), so the two never collapse.
 */
export async function readRequiredBytes(path: string, role: string): Promise<Uint8Array> {
  try {
    return await readFile(path);
  } catch (failure) {
    // Proof: reporting every read failure as unreadable failed `refuses a missing export and names
    // it, through the real entrypoint` and both missing-file dispatch cases (2026-10-11).
    if (errorCode(failure) === 'ENOENT') {
      throw new Error(`${role} is missing: ${path}`, { cause: failure });
    }
    throw new Error(`${role} is unreadable: ${path}`, { cause: failure });
  }
}

/**
 * Strict UTF-8 text of required bytes.
 *
 * @throws `<role> is malformed: <path>` for empty input or invalid UTF-8.
 */
export function decodeRequiredText(bytes: Uint8Array, role: string, path: string): string {
  if (bytes.length === 0) throw new Error(`${role} is malformed: ${path} is empty`);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (failure) {
    throw new Error(`${role} is malformed: ${path} is not UTF-8`, { cause: failure });
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
    return JSON.parse(text) as unknown;
  } catch (failure) {
    throw new Error(`${role} is malformed: ${path} is not JSON`, { cause: failure });
  }
}

/**
 * Creates every file in `files` exclusively with mode 0600, in order, never replacing one.
 * When a later create fails, the files this call already created are removed before the
 * failure is rethrown, so a refused run leaves no partial output.
 *
 * @throws when any target exists or cannot be created or written.
 */
export async function createExclusiveFiles(
  files: readonly { readonly path: string; readonly text: string }[],
): Promise<void> {
  const created: string[] = [];
  try {
    for (const file of files) {
      // Proof: opening with 'w' instead of 'wx' failed `refuses an existing output file and keeps
      // its bytes` and `removes its own first file when the second is occupied` (2026-10-11).
      const opened = await open(file.path, 'wx', 0o600).catch((failure: unknown) => {
        // Proof: rethrowing ENOENT unchanged failed `refuses a missing output directory and
        // names it`: the diagnostic was the raw `ENOENT … open` text (2026-10-11).
        if (errorCode(failure) === 'ENOENT') {
          throw new Error(`output directory is missing: ${dirname(file.path)}`, { cause: failure });
        }
        throw failure;
      });
      created.push(file.path);
      try {
        await opened.writeFile(file.text, 'utf8');
      } finally {
        await opened.close();
      }
    }
  } catch (failure) {
    // Proof: dropping this removal failed `removes its own first file when the second is
    // occupied`: tasks.json stayed beside the occupied plan-reference.json (2026-10-11).
    await Promise.all(created.map((path) => rm(path, { force: true })));
    throw failure;
  }
}
