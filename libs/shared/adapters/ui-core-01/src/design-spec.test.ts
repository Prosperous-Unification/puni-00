import { readdir, readFile } from 'node:fs/promises';

import { describe, expect, it } from 'bun:test';

const here = new URL('./', import.meta.url);
const designSpec = await readFile(new URL('../DESIGN.md', here), 'utf8');

/** Every kit directory beside core: `ui-<kit>` under `libs/shared/adapters`, core excluded. */
async function kitAliases(): Promise<readonly string[]> {
  const entries = await readdir(new URL('../../', here), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && /^ui-(?!core-)/.test(entry.name))
    .map((entry) => `@ui/${entry.name.slice('ui-'.length)}`)
    .sort();
}

describe('core DESIGN.md', () => {
  it('names every kit beside it', async () => {
    const aliases = await kitAliases();
    expect(aliases.length).toBeGreaterThan(0);
    // Proof: deleting the `@ui/saas-01` row from the Kits table made this read
    // `["@ui/saas-01"]` and fail (2026-10-21).
    expect(aliases.filter((alias) => !designSpec.includes(`\`${alias}\``))).toEqual([]);
  });

  it('documents every brand constant brand.css declares', async () => {
    const brand = await readFile(new URL('./brand.css', here), 'utf8');
    const names = [...brand.matchAll(/^\s*(--brand-[a-z0-9-]+):/gm)].map(([, name]) => name);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => !designSpec.includes(`\`${name}\``))).toEqual([]);
  });
});
