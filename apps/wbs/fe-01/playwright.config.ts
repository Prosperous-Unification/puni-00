import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig, devices } from '@playwright/test';

import { ordinaryServerDescriptors, parseOrdinaryPortShift } from './playwright.ordinary-servers';

/**
 * The repository root, which is where this config has to be run from.
 *
 * Relative paths in a Playwright config resolve against the config file for
 * some options and against the process's working directory for others — and
 * `webServer.cwd` is the second kind, which is the one that decides which
 * `.env` three servers read. Rather than guess, the working directory is
 * pinned: `bun run e2e` and `nx run wbs-fe-01:e2e` both run from the workspace
 * root, and anything else is refused here instead of starting a stack against
 * the wrong directory and failing forty seconds later on a signup 502.
 */
const repoRoot = process.cwd();
if (!existsSync(join(repoRoot, 'apps', 'wbs', 'fe-01', 'playwright.config.ts'))) {
  throw new Error(
    `The layout gate must be run from the workspace root; this is ${repoRoot}. ` +
      `Use \`bun run e2e\` (or \`nx run wbs-fe-01:e2e\`), never \`bunx playwright test\` ` +
      `from inside apps/wbs/fe-01 — the three dev servers are started relative to this path.`,
  );
}

const isCi = process.env['CI'] !== undefined;

/**
 * How far this run's three servers stand from their usual ports.
 *
 * Zero in CI and by default, where the ports are free and the URLs in every
 * runbook are the real ones. Non-zero is how a developer runs the gate while
 * `bun run dev` holds 3100/3200/4200: `reuseExistingServer` is true off CI, so
 * an unshifted local run does not start a stack at all — it measures whatever
 * already answers, which on 2026-08-09 was another checkout entirely
 * (`LLM_README.md`'s landmine). Shifting is the honest alternative to killing
 * somebody's dev server.
 *
 * A shift moves **all three** tiers together and rewrites the URLs they hold
 * about each other. Moving one is worse than moving none: be-01 would mint
 * tokens for a gw-01 it cannot reach, and the failure arrives forty seconds
 * later as a socket that never opens.
 *
 * **Two concurrent runs need shifts more than 100 apart, not merely
 * different.** The tiers themselves sit 100 apart, so shift `S` occupies
 * `3100+S / 3200+S / 4200+S` and any two shifts differing by exactly 100
 * overlap — the higher run's be-01 lands on the lower run's gw-01. Two agents
 * were given 1200 and 1300 on 2026-08-30 and one gate refused with
 * `http://localhost:4400/health is already used`, which is `CI=1` doing its
 * job: `reuseExistingServer` is false there, so Playwright refused rather than
 * measuring the other checkout's stack.
 *
 * The check below cannot catch that case and is not meant to: it compares a
 * shift against the **defaults**, which a config can know, and says nothing
 * about what else is running on the host, which it cannot. Space assignments
 * by 500 and the question does not arise.
 *
 * Nor can it know what else the *machine* listens on. Shift 1700 puts fe-01 on
 * **5900**, which on macOS is Screen Sharing — a root-owned listener a user's
 * `lsof` cannot see, so a pre-flight port check finds it free and Playwright
 * then reports `Port 5900 is already in use` (2026-08-30). A shift is a
 * proposal about a host, and the host has the last word: if a run refuses on a
 * port you believe is free, check for a privileged listener before you doubt
 * the config.
 *
 * **And it cannot know what the browser refuses to talk to.** Shift 1800 puts
 * fe-01 on **6000**, X11's port, which is on Chromium's own blocked list: the
 * three servers start, the port is genuinely free, and every navigation fails
 * on `net::ERR_UNSAFE_PORT` before an assertion runs (2026-08-31). That list is
 * the browser's and changes with it, so it is not encoded here — 6000, 6665–6669
 * and 10080 are the ones a four-digit shift can reach. **1900 is the known-good
 * neighbour**, at 5000/5100/6100.
 *
 * @throws When `E2E_PORT_SHIFT` is set to something that is not a
 * non-negative integer below 10000. An unusable shift silently read as zero is
 * a run against the dev server wearing the costume of an isolated one.
 */
const portShift = parseOrdinaryPortShift(process.env['E2E_PORT_SHIFT']);
const fePort = 4200 + portShift;
const runDatabase = join(repoRoot, 'tmp', `e2e-${String(Date.now())}.db`);
mkdirSync(join(repoRoot, 'tmp'), { recursive: true });
const servers = ordinaryServerDescriptors(repoRoot, portShift, isCi, runDatabase);

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.(?:spec|e2e)\.ts/,
  // Named explicitly because CI uploads this exact path as the run's artifact,
  // and the screenshot the widths are judged from is written into it.
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCi,
  // Zero, deliberately. `.github/workflows/ci.yml` rules a retry out of the
  // gate for a reason that applies here twice over: a layout check people
  // re-run until it is green is a check that cannot fail wearing a different
  // hat. A flake in this spec is a bug in this spec.
  retries: 0,
  /**
   * How long one **case** may take, and 120s on CI against 60s here.
   *
   * Raised with `expect.timeout` below and for the same measured reason, after
   * raising that one alone moved the failure rather than fixing it: run
   * 33377448974 lost `the successor bar moves when the project changes its
   * reach` at exactly **1.0m** — the old cap, reached because a case that makes
   * several cross-process waits can now spend 30s on any one of them.
   *
   * A cap is not a budget anybody should hit. It exists to stop a hung case
   * holding the gate for ever, and 120s still does that: the slowest honest
   * case in this suite runs in about 22s on the runner.
   */
  timeout: isCi ? 120_000 : 60_000,
  /**
   * How long one assertion may wait, and **30s on CI against 10s here**.
   *
   * The zero above stays zero: a check people re-run until it is green is a
   * check that cannot fail wearing a different hat, and that rule is right. A
   * longer wait is not a retry and does not weaken anything — a wrong
   * assertion still fails, just later. Nothing here re-runs.
   *
   * Measured, not guessed. Four CI runs on 2026-08-31 each lost **one** case
   * out of 260, and a different one each time: `dark-mode`'s seed, then
   * `name-cell`'s `a peer's longer name arriving…` twice, then `gantt`'s
   * `flips a surface above a bar that has no room below it`. Every one was a
   * wait on cross-process work — a create round trip, a websocket delivery, a
   * layout settling — and every one passed 3/3 alone. The runner takes
   * **11–12 minutes where this Mac takes 7**, and a 10s budget written on the
   * Mac is a budget for the wrong machine.
   *
   * **This was mistaken for a regression and cost a revert**, and the proof
   * that it was not is worth keeping: `e2eed4c` and `909b71f` have
   * **byte-identical trees** (`git rev-parse e2eed4c^{tree}` equals
   * `909b71f^{tree}` — the second is a clean revert of the two commits between
   * them). The first passed CI and the second failed it. No code change can
   * explain that, so no code change was the cause.
   *
   * The per-test 30s bumps written during that hour are removed in favour of
   * these two figures — numbers scattered across spec files are places for the
   * next person to disagree with the config.
   */
  expect: { timeout: isCi ? 30_000 : 10_000 },
  reporter: isCi
    ? [
        ['list'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['junit', { outputFile: join(repoRoot, 'tmp', 'junit', 'wbs-fe-01.browser.ordinary.xml') }],
      ]
    : [
        ['list'],
        ['junit', { outputFile: join(repoRoot, 'tmp', 'junit', 'wbs-fe-01.browser.ordinary.xml') }],
      ],
  use: {
    baseURL: `http://localhost:${String(fePort)}`,
    // The browser's region, pinned, because two checks in `keyboard.spec.ts`
    // type a date into a native `<input type="date">` digit by digit and the
    // field's segment order is the locale's. `05202026` is 20 May 2026 only
    // where the order is month-day-year; on an `en-UA` host Chrome renders
    // `dd.mm.yyyy` and the same keystrokes save 2026-02-05, so both cases fail
    // for the tester's region rather than for the code. Measured on a
    // developer's Mac, 2026-08-29: 203 passed / 3 failed, two of them these.
    //
    // `en-US` and not the host's, deliberately: this gate is a contract about
    // what the application draws, and a contract that means something different
    // per tester is not one. A check that a reader's own region is honoured
    // would be a different test, and it does not exist yet.
    locale: 'en-US',
    timezoneId: 'UTC',
    // Both of these are for determinism generally. **Neither fixes the two
    // date-typing cases in `keyboard.spec.ts`, and that was measured, not
    // assumed.** On an `en_UA` host those two type `05202026` into a native
    // `<input type="date">` and save `2026-02-05` instead of `2026-05-20`,
    // because Chrome renders the control's segment order from something
    // neither `locale` nor `--lang=en-US` reaches — both were tried, and both
    // left the pair failing identically (2 failed | 16 passed).
    //
    // **Fixed in the tests on 2026-08-30, which is where this comment always
    // said the fix belonged.** `keyboard.spec.ts` now reads the order this
    // Chrome actually draws off a throwaway `<input type="date">` before it
    // types into a real one (`dateSegmentOrder`), so the pair is green on this
    // `dd.mm.yyyy` host and stays green on a US one. The two settings below are
    // kept for the determinism they do buy; neither is load-bearing for dates
    // any more, and the paragraph above is left standing because it is the
    // measurement that sent the fix to the right place.
    launchOptions: { args: ['--lang=en-US'] },
    screenshot: 'only-on-failure',
    // Keep the diagnostic trace when a check fails, but do not archive a trace
    // for every passing layout assertion. With 194 passing checks, `on` made
    // the CI artifact about 540 MB and its upload dominated the job runtime.
    trace: 'retain-on-failure',
    video: 'off',
  },
  // Chromium only. One engine that can lay a table out is the whole ask; three
  // would be three times the runtime for a check about this application's
  // geometry rather than about browser differences.
  projects: [
    {
      name: 'chromium',
      // `chromium-regular` owns `lifetime-bfcache.spec.ts`: it needs the
      // regular Chromium channel this default project's own
      // `chromium-headless-shell` build cannot restore a page from
      // back/forward cache under (050-7-e's own plan document, section 4.7).
      // Excluded here rather than left to collide with that project's own
      // `testMatch`, which would otherwise also pick it up and fail it under
      // the wrong browser.
      testIgnore: /lifetime-bfcache\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        // After the spread, not in the top-level `use`: a project's options
        // win over the file's, and `Desktop Chrome` carries a 1280x720
        // viewport of its own that would silently replace this one.
        //
        // The default for tests that do not care, and the screenshot the
        // widths are judged by. Since 2026-08-08 the table is `width: 100%`
        // with a minimum of about 1106px for a two-role plan, so nothing
        // scrolls sideways here at all — the tests that need a scrolling frame
        // set their own narrow viewport, and the matrix sets 1280 and 1512.
        viewport: { width: 1400, height: 900 },
      },
    },
    // `chromium-regular` (`lifetime-bfcache.spec.ts`) is added to `projects`
    // only when a planner opts in with `PLAYWRIGHT_CHROMIUM_REGULAR=1` —
    // never unconditionally. CI already installs regular Chromium alongside
    // `chromium-headless-shell` (`.github/workflows/ci.yml`'s own `bunx
    // playwright install --with-deps chromium` installs both), so this is a
    // verification-policy choice, not an availability one: this file's own
    // `webServer`/`e2e` target run unconditionally in CI, and an
    // always-present project here would run this one narrow bfcache
    // regression on every ordinary `bunx playwright test` invocation — a
    // scope decision this packet does not make unilaterally. See this
    // packet's own plan document, section 4.7, for the exact command.
    ...(process.env['PLAYWRIGHT_CHROMIUM_REGULAR'] === '1'
      ? [
          {
            name: 'chromium-regular',
            testMatch: /lifetime-bfcache\.spec\.ts/,
            use: { ...devices['Desktop Chrome'], channel: 'chromium' },
          },
        ]
      : []),
  ],
  // Every port and every cross-tier URL below comes from `portShift`, and none
  // of them is written twice: an environment variable that moved a listener
  // without moving what points at it is the shift half-applied, which boots
  // three servers that cannot talk to each other.
  webServer: servers,
});
