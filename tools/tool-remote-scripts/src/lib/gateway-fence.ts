import type { Stats } from 'node:fs';
import { lstat, opendir, readFile, stat } from 'node:fs/promises';

/**
 * Refuses admission while a deploy-owned dependency gateway fence is retained.
 * The closed v1 marker is exactly `{format: 'dependency-gateway-fence', version: 1}`.
 * Presence is a conservative barrier, never evidence that any gateway is excluded.
 * This reader neither creates nor clears intent; the deploy lock must cover publication
 * and ordinary admission; the explicit managed exclusion lifecycle owns that transition.
 * Missing/unreadable trusted state and malformed, unreadable or symlink markers throw.
 * Directory readability is established using actual process access, including ACLs/privileges,
 * rather than inferring access from mode bits. Marker absence is checked without following links.
 */
export async function assertNoGatewayFence(root: string): Promise<void> {
  // Proof: removing the state-directory check admitted missing roots; all eight missing-root production-path negatives failed.
  try {
    if (!(await stat(root)).isDirectory()) throw new Error('state root is not a directory');
    // Proof: removing this actual directory read admitted mode-0111 state roots; eight production-path negatives failed.
    const directory = await opendir(root);
    try {
      await directory.read();
    } finally {
      await directory.close();
    }
  } catch (cause) {
    throw new Error(`cannot inspect gateway fence state directory ${root}; admission refused`, {
      cause,
    });
  }
  // Proof: ignoring companions admitted both orphan records in mounted ordinary admission negatives.
  // Companion records without a marker are corrupt retained attempts, never clean admission.
  for (const companion of ['dependency-gateway-intent.json', 'dependency-gateway-complete.json']) {
    const companionPath = `${root}/${companion}`;
    try {
      await lstat(companionPath);
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') continue;
      throw new Error(
        `cannot inspect gateway fence companion ${companionPath}; admission refused`,
        { cause },
      );
    }
    throw new Error(
      `retained gateway fence companion ${companionPath}; admission refused; explicit recovery required`,
    );
  }
  const path = `${root}/dependency-gateway-fence.json`;
  let identity: Stats;
  try {
    // Proof: replacing lstat with stat admitted dangling marker links; eight production-path negatives failed.
    identity = await lstat(path);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return;
    throw new Error(`cannot inspect gateway fence ${path}; admission refused`, { cause });
  }
  // Proof: removing this check misclassified valid-target and dangling symlinks; sixteen diagnostic negatives failed.
  if (!identity.isFile())
    throw new Error(`gateway fence ${path} is not a regular file; admission refused`);
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (cause) {
    throw new Error(`cannot read gateway fence ${path}; admission refused`, { cause });
  }
  let marker: unknown;
  try {
    marker = JSON.parse(contents);
  } catch (cause) {
    throw new Error(`malformed gateway fence ${path}; admission refused`, { cause });
  }
  // Proof: removing this closed grammar classified extra fields, wrong versions and arrays as valid retained intent; twenty-four diagnostic negatives failed.
  if (
    marker === null ||
    typeof marker !== 'object' ||
    Array.isArray(marker) ||
    Object.keys(marker).length !== 2 ||
    Reflect.get(marker, 'format') !== 'dependency-gateway-fence' ||
    Reflect.get(marker, 'version') !== 1
  )
    throw new Error(`malformed gateway fence ${path}; admission refused`);
  // Proof: removing this refusal admitted all eight valid present-marker runs/direct executions and their effects.
  throw new Error(`retained gateway fence ${path}; admission refused; explicit recovery required`);
}
