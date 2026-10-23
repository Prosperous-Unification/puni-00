import { access, readdir, readFile } from 'node:fs/promises';

import { describe, expect, it } from 'bun:test';

const kit = new URL('../', import.meta.url);

/** The slice of a shadcn `registry.json` this test reads; anything else is the CLI's to check. */
interface Registry {
  readonly items: readonly { readonly name: string; readonly files: readonly { path: string }[] }[];
}

/** Whether `registry.json` has the shape {@link Registry} names; the file is the one input read. */
function isRegistry(value: unknown): value is Registry {
  if (typeof value !== 'object' || value === null || !('items' in value)) return false;
  const { items } = value;
  return (
    Array.isArray(items) &&
    items.every(
      (entry: unknown) =>
        typeof entry === 'object' &&
        entry !== null &&
        'name' in entry &&
        typeof entry.name === 'string' &&
        'files' in entry &&
        Array.isArray(entry.files) &&
        entry.files.every(
          (file: unknown) =>
            typeof file === 'object' &&
            file !== null &&
            'path' in file &&
            typeof file.path === 'string',
        ),
    )
  );
}

async function readRegistry(): Promise<Registry> {
  const parsed: unknown = JSON.parse(await readFile(new URL('registry.json', kit), 'utf8'));
  if (!isRegistry(parsed)) throw new Error('registry.json has no items with names and file paths');
  return parsed;
}

/**
 * The primitive source files: what a consumer installs. Tests, stories, test
 * support, the barrel and the stylesheet are the kit's own and never shipped.
 */
async function listPrimitiveSources(): Promise<readonly string[]> {
  const names = await readdir(new URL('src/', kit));
  return names
    .filter((name) => /\.tsx?$/.test(name))
    .filter((name) => !/\.(test|stories|testing)\.tsx?$/.test(name) && name !== 'index.ts')
    .map((name) => `src/${name}`)
    .sort();
}

describe('the kit registry', () => {
  it('names every primitive source file in exactly one item', async () => {
    const registry = await readRegistry();
    const paths = registry.items.flatMap(({ files }) => files.map(({ path }) => path));
    const sources = await listPrimitiveSources();
    expect(sources.length).toBeGreaterThan(5);
    // Proof: deleting the `label` item made this read `["src/label.tsx"]` and fail (2026-10-21).
    expect(sources.filter((source) => !paths.includes(source))).toEqual([]);
    expect(sources.filter((source) => paths.filter((path) => path === source).length > 1)).toEqual(
      [],
    );
  });

  it('points every item at a file that exists', async () => {
    const registry = await readRegistry();
    const missing: string[] = [];
    for (const { files } of registry.items) {
      for (const { path } of files) {
        try {
          await access(new URL(path, kit));
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
          missing.push(path);
        }
      }
    }
    // Proof: pointing the `control` item at `src/missing.ts` made this read
    // `["src/missing.ts"]` and fail (2026-10-21).
    expect(missing).toEqual([]);
  });
});
