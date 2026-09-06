import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'bun:test';

/**
 * The version pins that can drift apart, held together by a test.
 *
 * Bun's version used to be typed in six places — the CI workflow twice, three
 * app Dockerfiles and the dev-src Dockerfile — and on 2026-09-06 they said
 * three different things: 1.3.14, 1.3.14 and 1.2.20, against a 1.4.0 on the
 * workspace box. Nothing read them side by side, so nothing could say so.
 * `.bun-version` is now the one source: `setup-bun` reads it through
 * `bun-version-file`, and the Dockerfiles, which cannot read a file, are held
 * to it here.
 *
 * Proof: with `apps/be-01/Dockerfile`'s first stage put back to
 * `oven/bun:1.3.14-alpine`, `every Bun image tag equals .bun-version` failed
 * on `- []` / `+ [ "apps/be-01/Dockerfile: 1.3.14" ]` (2026-09-06). And with
 * `bun-version: 1.3.14` put back in place of `bun-version-file` in the
 * `pixels` job, `CI reads the file rather than a literal` failed on
 * `Expected: 0 · Received: 1`.
 */
const WORKSPACE = new URL('../../../', import.meta.url);

async function read(path: string): Promise<string> {
  return readFile(new URL(path, WORKSPACE), 'utf8');
}

/** Every Dockerfile that starts from a Bun image. Listed, so a new one is added here on the day it is written. */
const BUN_DOCKERFILES = [
  'apps/be-01/Dockerfile',
  'apps/gw-01/Dockerfile',
  'apps/fe-01/Dockerfile',
  'deploy/dev-src/Dockerfile',
] as const;

describe('the Bun version', () => {
  it('has one source, and it is a bare version', async () => {
    const pinned = (await read('.bun-version')).trim();
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('every Bun image tag equals .bun-version', async () => {
    const pinned = (await read('.bun-version')).trim();
    const drifted: string[] = [];
    for (const file of BUN_DOCKERFILES) {
      // The version alone: `1.4.2-alpine AS deps` and `1.4.2-debian` are both one pin.
      const tags = [...(await read(file)).matchAll(/^FROM oven\/bun:(\d+\.\d+\.\d+)/gm)].map(
        (m) => m[1],
      );
      // A Dockerfile with no Bun stage is a listing error, not a pass.
      expect(tags.length).toBeGreaterThan(0);
      for (const tag of tags) if (tag !== pinned) drifted.push(`${file}: ${tag}`);
    }
    expect(drifted).toEqual([]);
  });

  it('CI reads the file rather than a literal', async () => {
    const workflow = await read('.github/workflows/ci.yml');
    const literals = workflow.match(/^\s*bun-version:/gm) ?? [];
    expect(literals.length).toBe(0);
    const fromFile = workflow.match(/^\s*bun-version-file: \.bun-version$/gm) ?? [];
    // Both jobs set Bun up; one reading the file and one floating is the drift this exists to stop.
    expect(fromFile.length).toBe((workflow.match(/uses: oven-sh\/setup-bun@/g) ?? []).length);
  });
});
