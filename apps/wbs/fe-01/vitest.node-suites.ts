import manifest from './vitest.node-suites.json';

/**
 * The suites that need no DOM, and therefore no jsdom.
 *
 * fe-01's whole suite is a **69-second** jsdom run, which is not an inner-loop
 * answer. These are the files that import no component and touch no browser
 * global, so they run under `--environment node` — see `vitest.node.config.ts`
 * and the `test:unit` target.
 *
 * **A list rather than a suffix, and that is a deviation from the plan.** W1-4
 * asked for `*.dom.test.tsx` across 55 files. A list costs nothing to read, no
 * rename, and no churn in every other change's diff — and the objection to it,
 * that a list goes stale, is answered by `src/test-tiers.test.ts` walking the
 * directory and refusing to let this disagree with the evidence in the files.
 * be-01's own tiering learned that the guard is the part that matters: it
 * caught its own first draft's mistake.
 *
 * Paths and per-file reasons live in `vitest.node-suites.json`, relative to `apps/wbs/fe-01`.
 */
export const NODE_SUITES: readonly string[] = manifest.suites.map(({ file }) => file);
