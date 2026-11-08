import type { Stats } from 'node:fs';
import { lstat, opendir, readFile, stat } from 'node:fs/promises';

/**
 * Refuses admission while a deploy-owned dependency backend fence is retained.
 * The closed v1 marker is exactly `{format: 'dependency-backend-fence', version: 1}`.
 * Presence is a conservative barrier, never evidence that any backend is excluded.
 * This reader neither creates nor clears intent; the deploy lock must cover publication
 * and ordinary admission; the explicit managed exclusion lifecycle owns that transition.
 * Missing/unreadable trusted state and malformed, unreadable or symlink markers throw.
 * Directory readability is established using actual process access, including ACLs/privileges,
 * rather than inferring access from mode bits. Marker absence is checked without following links.
 */
export async function assertNoBackendFence(root: string): Promise<void> {
  try {
    if (!(await stat(root)).isDirectory()) throw new Error('state root is not a directory');
    const directory = await opendir(root);
    try {
      await directory.read();
    } finally {
      await directory.close();
    }
  } catch (cause) {
    throw new Error(`cannot inspect backend fence state directory ${root}; admission refused`, {
      cause,
    });
  }
  // Companion records without a marker are corrupt retained attempts, never clean admission.
  // Proof: retained marker/intent/completion production-path negatives all refuse before ordinary swap effects; orphan records never imply clean admission.
  for (const companion of ['dependency-backend-intent.json', 'dependency-backend-complete.json']) {
    const companionPath = `${root}/${companion}`;
    try {
      await lstat(companionPath);
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') continue;
      throw new Error(
        `cannot inspect backend fence companion ${companionPath}; admission refused`,
        { cause },
      );
    }
    throw new Error(
      `retained backend fence companion ${companionPath}; admission refused; explicit recovery required`,
    );
  }
  const path = `${root}/dependency-backend-fence.json`;
  let identity: Stats;
  try {
    identity = await lstat(path);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return;
    throw new Error(`cannot inspect backend fence ${path}; admission refused`, { cause });
  }
  if (!identity.isFile())
    throw new Error(`backend fence ${path} is not a regular file; admission refused`);
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (cause) {
    throw new Error(`cannot read backend fence ${path}; admission refused`, { cause });
  }
  let marker: unknown;
  try {
    marker = JSON.parse(contents);
  } catch (cause) {
    throw new Error(`malformed backend fence ${path}; admission refused`, { cause });
  }
  if (
    marker === null ||
    typeof marker !== 'object' ||
    Array.isArray(marker) ||
    Object.keys(marker).length !== 2 ||
    Reflect.get(marker, 'format') !== 'dependency-backend-fence' ||
    Reflect.get(marker, 'version') !== 1
  )
    throw new Error(`malformed backend fence ${path}; admission refused`);
  throw new Error(`retained backend fence ${path}; admission refused; explicit recovery required`);
}
