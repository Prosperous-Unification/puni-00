// @vitest-environment node
//
// Same reason as `vite-config.test.ts`: importing the real `vite` pulls in
// esbuild, which refuses to load where `new TextEncoder().encode('') instanceof
// Uint8Array` is false — and under jsdom it is. This file runs a Vite build, so
// it needs the node realm twice over.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import { build, type Rollup } from 'vite';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `src/styles.css` compiled by the same plugin `vite.config.ts` ships, over the
 * same source tree, and never written to disk.
 *
 * A real build rather than an assertion about the text of the stylesheet: what
 * is being checked is which rules come out the other end — that the tracer class
 * written in `app.tsx` is found by the scanner and emitted, and that nothing
 * from Tailwind's base layer is. A string test over `styles.css` would compare
 * the file against a paraphrase of itself and pass with the scanner switched
 * off.
 *
 * @throws When the build emits no CSS asset at all, rather than letting every
 * assertion below run against an empty string and report the absence of
 * preflight in a bundle that has nothing in it.
 */
async function compileStylesheet(): Promise<string> {
  const built = await build({
    configFile: false,
    root: appRoot,
    logLevel: 'silent',
    plugins: [tailwindcss()],
    build: {
      write: false,
      rollupOptions: { input: resolve(appRoot, 'src/styles.css') },
    },
  });
  // `build` is overloaded: a watcher for `build.watch`, one bundle or an array
  // of them otherwise. This config sets no watcher and one input, so the
  // narrowing below is a shape check on a union the compiler cannot collapse.
  const outputs = (Array.isArray(built) ? built : [built]) as Rollup.RollupOutput[];
  const css = outputs
    .flatMap((bundle) => bundle.output)
    .filter((chunk): chunk is Rollup.OutputAsset => chunk.type === 'asset')
    .filter((asset) => asset.fileName.endsWith('.css'))
    .map((asset) => (typeof asset.source === 'string' ? asset.source : ''))
    .join('\n');
  if (css.trim() === '') {
    throw new Error('the Tailwind build emitted no CSS; there is nothing here to assert on');
  }
  return css;
}

const stylesheet = await compileStylesheet();

/*
 * Proof, watched 2026-08-09 by injecting one fault at a time and reverting it.
 * The runs are in `docs/plans/2026-08-08-tailwind-spike-verify.md`.
 *
 *   - `className="tracking-tight"` off the `h1` in `app.tsx`: 1 failed,
 *     `expected '@layer properties{@supports (((-webki…' to contain
 *     '.tracking-tight'`. The scanner is reading the app's markup rather than
 *     emitting a fixed set.
 *   - `source(none)` and the three `@source` lines out of `styles.css`: 1
 *     failed, `expected '…' not to contain '.tracking-widest'` — automatic
 *     detection walked up to the git root and found the name in a file that is
 *     not markup. That containment is the reason those lines exist.
 *   - the two imports replaced by `@import 'tailwindcss'`: 3 failed — `not to
 *     contain 'border-box'`, `not to match /font:\s*inherit/`, and `to match
 *     /@layer[^;{]*\bbase\b[^;{]*;/`, the base layer no longer a statement but a
 *     block full of reset. What that fault does to a real browser is the layout
 *     gate's answer, not this file's.
 */
describe('the Tailwind stylesheet this app ships', () => {
  it('compiles the tracer class written on the brand heading', () => {
    expect(stylesheet).toContain('.tracking-tight');
    expect(stylesheet).toContain('letter-spacing');
  });

  it('emits nothing for a utility no file under src asks for', () => {
    // A sibling of the tracer, so the pair differ in exactly one thing: whether
    // the app's markup uses it. This file is excluded from the scan by
    // `styles.css` — it was not at first, and naming the class here was enough
    // to put it in the bundle and fail this assertion on itself.
    expect(stylesheet).not.toContain('.tracking-widest');
  });

  // Two tests rather than one with two assertions, and the reason is worth
  // stating: `expect` throws on the first failure, so the second line of a
  // two-assertion test is never evaluated in the run that proves the first can
  // fail. Watched — the `border-box` half failed and the `font: inherit` half
  // was never reached, which is a check nobody has seen break.
  it('brings no box-sizing reset with it', () => {
    // Preflight's first rule, `*, ::before, ::after { box-sizing: border-box }`.
    expect(stylesheet).not.toContain('border-box');
  });

  it('leaves form controls the font the browser gives them', () => {
    // Preflight's `button, input, … { font: inherit }`. This is the line the
    // table's geometry cannot survive: `table-frame.ts` sizes the `not-before`
    // column from what Chromium makes an unconstrained `input[type=date]` in
    // the table's own font, and inheriting the page font changes that number.
    expect(stylesheet).not.toMatch(/font:\s*inherit/);
  });

  it('leaves the base layer declared and empty, for a scoped reset to land in', () => {
    // Declared: the layer order is the whole reason a component library's reset
    // can be added later without outranking the utilities. Empty: `@layer base`
    // never opens a block here.
    expect(stylesheet).toMatch(/@layer[^;{]*\bbase\b[^;{]*;/);
    expect(stylesheet).not.toMatch(/@layer\s+base\s*\{/);
  });
});
