# Verification

## 2026-09-27

- `env -u CLAUDECODE bun test src/module-labels.test.ts` in `tools/tool-devsync` with only the frontend root added: 4 pass, 1 fail, `Cannot find module …/modules/calendar-markers/module.ts`.
- After declaring the unsealed compositions: 5 pass, 0 fail.
- Each fault applied alone to the committed tree, then restored with `git checkout`:
  - frontend root removed: discovery and sealing tests failed (3 pass, 2 fail), the sealing test listing every declared-unsealed module as having no directory;
  - `PREFERENCES_LABEL` set to `frontend.preference`: `moduleLabel frontend.preference, expected frontend.preferences` (4 pass, 1 fail);
  - Preferences' `module.ts` renamed: `has no module.ts and is not declared unsealed` (4 pass, 1 fail);
  - a `module.ts` added to Project: `declared unsealed, yet has module.ts` (4 pass, 1 fail);
  - `import { DiBag } from 'di-bag'` added to Project's `composition.ts`: `imports di-bag in a module declared unsealed` (4 pass, 1 fail);
  - `module.frontend.gone` declared unsealed: `declared unsealed, yet no such module directory` (4 pass, 1 fail);
  - Plan feed's index line deleted: `holds 0 HTML comments, expected 1` (4 pass, 1 fail);
  - Plan feed's README naming `module.frontend.plan-feeds`: `README names module.frontend.plan-feeds` (4 pass, 1 fail);
  - Plan feed's `modules.json` row indexing Project's README: `does not index it once` and `module.frontend.plan-feed indexes …/project` (4 pass, 1 fail).
- Not run locally: the h2puni gate (the orchestrator runs it on the integration branch).
