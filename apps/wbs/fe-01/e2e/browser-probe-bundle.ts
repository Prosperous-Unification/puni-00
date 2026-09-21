import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, type Rollup } from 'vite';

/** `apps/wbs/fe-01`, wherever the caller's working directory is. */
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The config this app is deployed with, not one assembled here.
 *
 * The distinction is the whole point, and it is `src/styles.test.ts`'s: a probe built
 * through a config of its own would keep passing while `vite.config.ts` grew a plugin
 * or an alias that changed what a browser receives.
 */
const SHIPPED_CONFIG = resolve(appRoot, 'vite.config.ts');

/**
 * How Vite names a module it refused to bundle for a browser.
 *
 * It does not fail such a build: it replaces the module with a stub that throws when
 * the page loads it, names the stub `__vite-browser-external:<specifier>`, and warns.
 * The warning is not usable as evidence — under `vitest` it reaches neither `onwarn`
 * nor a custom logger, while the stub module is in the output either way (both watched
 * 2026-09-20) — so the module identity is what this file reports.
 */
const BROWSER_EXTERNAL = '__vite-browser-external:';

/** One browser build of a probe entry, by what went into it. */
export interface BrowserProbeBundle {
  readonly code: string;
  /** Every module the chunk was built from: which file of a package the build chose. */
  readonly modules: readonly string[];
  /** The specifiers Vite refused to bundle for a browser, `node:util/types` and the like. */
  readonly externalizedForBrowser: readonly string[];
}

/**
 * Build the probe for the browser through the shipped config, in this process.
 *
 * Nothing is written: `write: false` over the config's own `outDir`, so a test run
 * never touches `dist/apps/wbs/fe-01`.
 *
 * **The module identities are the evidence, not the bundle text and not a warning.**
 * The correct bundle already contains the string `node:util/types`, because di-bag
 * passes it to `process.getBuiltinModule` at run time, so the text cannot tell the two
 * builds apart; and the warning Vite prints for an externalized module never arrives
 * inside `vitest` (see {@link BROWSER_EXTERNAL}).
 *
 * **Which file of a package was chosen is a separate question**, answered by `modules`
 * rather than by searching the code: nanoid's browser entry and corj's token module
 * both contain `crypto.getRandomValues`, so the text cannot tell them apart.
 *
 * @param entry The probe's source file, relative to `apps/wbs/fe-01`.
 * @returns The single emitted chunk's code, the modules it was built from, and the
 * specifiers that reached browser code from a Node host.
 * @throws When the build emits anything other than one chunk, rather than letting an
 * assertion pass over a bundle nobody identified.
 */
export async function buildBrowserProbeBundle(entry: string): Promise<BrowserProbeBundle> {
  const built = await build({
    configFile: SHIPPED_CONFIG,
    root: appRoot,
    logLevel: 'silent',
    build: {
      write: false,
      rollupOptions: { input: resolve(appRoot, entry) },
      // The shipped config splits React and the router into a `vendor` chunk, which is
      // right for a deployed application and wrong for a probe: a page served from one
      // `addScriptTag` cannot load three files. The split is off for this build alone;
      // every plugin, alias and resolve condition is still the shipped config's, which is
      // what these probes are about.
      //
      // `codeSplitting: false` and not an empty `groups` array: Vite merges an inline
      // config into the file's by concatenating arrays, so `groups: []` left the shipped
      // `vendor` group exactly where it was.
      // Proof: deleting `rolldownOptions` emitted 3 chunks for
      // `e2e/fault-boundary-probe.ts`, and the helper rejected that build (2026-09-21).
      rolldownOptions: {
        input: resolve(appRoot, entry),
        output: { codeSplitting: false },
      },
    },
  });
  // `build` is overloaded — a watcher for `build.watch`, one bundle or an array
  // otherwise — and this call sets no watcher, so the cast is a shape check on a union
  // the compiler cannot collapse. `src/styles.test.ts` names the same boundary.
  const outputs = (Array.isArray(built) ? built : [built]) as Rollup.RolldownOutput[];
  const chunks = outputs
    .flatMap((bundle) => bundle.output)
    .filter((entry): entry is Rollup.OutputChunk => entry.type === 'chunk');
  // Proof: adding the empty probe as a second entry on 2026-09-20 failed all three
  // registered cases with `the browser build of the three libraries emitted 2 chunks,
  // not one` — the message this one replaces, over the entry this helper now takes.
  if (chunks.length !== 1) {
    throw new Error(
      `the browser build of ${entry} emitted ${String(chunks.length)} chunks, not one`,
    );
  }
  const modules = Object.keys(chunks[0].modules);
  return {
    code: chunks[0].code,
    modules,
    externalizedForBrowser: modules
      .filter((id) => id.startsWith(BROWSER_EXTERNAL))
      .map((id) => id.slice(BROWSER_EXTERNAL.length)),
  };
}
