# Settings tab border regression at seven tabs

CI run [39751505011](https://github.com/Prosperous-Unification/puni-00/actions/runs/39751505011), browser shard 4, tested feature SHA `833ceff80` and failed two `settings-vocabulary.spec.ts` F-117 cases (light and dark): the assertion expected six `0px` borders but the new General settings section rendered seven zero-border tabs. The shard reported 107 passed, 39 skipped, 2 failed. This is a count-bound test failure; the computed seventh border was `0px`.

The assertion now requires at least one rendered tab and checks every rendered tab has a computed top border of `0px`. On the corrected feature worktree, `bunx playwright test --config apps/wbs/fe-01/playwright.config.ts --grep 'the section tabs wear no border of their own'` passed both light and dark cases (2/2). Temporarily replacing the tab class `border-0` with `border-2` made the light case fail at the every-tab assertion (`Expected: true`, `Received: false`); the original source was restored and `git diff` showed no production change. Prettier, exact-file ESLint and `git diff --check` passed.

The current full CI run still contains the old SHA and remains failed. The new test commit requires fresh CI; no full browser gate claim is made here.
