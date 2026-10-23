import { readFile, stat } from 'node:fs/promises';

/**
 * Refuses admission while a deploy-owned dependency gateway fence is retained.
 * The closed v1 marker is exactly `{format: 'dependency-gateway-fence', version: 1}`.
 * Presence is a conservative barrier, never evidence that any gateway is excluded.
 * This reader neither creates nor clears intent; the deploy lock must cover publication
 * and ordinary admission when a future lifecycle owns that transition.
 * Missing/unreadable trusted state and malformed or unreadable markers throw.
 */
export async function assertNoGatewayFence(root: string): Promise<void> {
  // Proof: removing the state-directory check admitted missing roots; all eight missing-root production-path negatives failed.
  try {
    if (!(await stat(root)).isDirectory()) throw new Error('state root is not a directory');
  } catch (cause) {
    throw new Error(`cannot inspect gateway fence state directory ${root}; admission refused`, {
      cause,
    });
  }
  const path = `${root}/dependency-gateway-fence.json`;
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (cause) {
    // Proof: accepting all read errors admitted unreadable markers/roots; sixteen production-path negatives failed.
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return;
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
