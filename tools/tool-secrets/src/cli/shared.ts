import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..', '..');
export const DEFAULT_SOPS_FILE = resolve(REPO_ROOT, 'tools/tool-secrets/src/production.env.sops');

export function requireConfiguredSops(path = DEFAULT_SOPS_FILE): void {
  if (!existsSync(path)) {
    throw new Error(`SOPS file missing: ${path}`);
  }
}

export async function assertRealCiphertext(path = DEFAULT_SOPS_FILE): Promise<void> {
  requireConfiguredSops(path);
  const content = await readFile(path, 'utf8');
  if (!content.includes('sops_mac') && !content.includes('ENC[')) {
    throw new Error(
      `Refusing to proceed: ${path} is a placeholder. ` +
        `Run \`sops --encrypt --age <recipient> <plain.env> > ${path}\` first.`,
    );
  }
}
