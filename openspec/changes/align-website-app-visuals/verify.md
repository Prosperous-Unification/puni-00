# Verification

Implemented in an isolated public worktree from canonical website commit `f3f6ca201ebed85d73e52c8948c113da29c6be39`. The private site and its licensed theme files were not changed or imported. The only React edit replaces the old circular `P` with a small, separated gold dot beside the existing PUNI header wordmark; request, account, chat, concept and operator behavior are unchanged.

## Visual evidence

`node /tmp/puni-fe-visual-baseline.mjs` captured the previous manual, studio and operator views at 1440px and 390px using explicit mocked API responses. The old computed body was `rgb(23, 33, 29)` in DM Sans; the header was `rgb(17, 27, 23)`, with green controls. Screenshots: `/tmp/puni-fe-before-{manual,studio,operator}-{1440,390}.png`.

`node /tmp/puni-fe-narrow-check.mjs` inspected the updated views at 320, 390, 768 and 1440px, including a populated operator inbox. All twelve route/width combinations had `scrollWidth` equal to viewport width, Geist body, Inter Tight heading, and no page errors. The populated inbox initially overflowed by 24px at 320px; changing only its grid minimum fixed it, and the rerun passed. Screenshots: `/tmp/puni-fe-final-{manual,studio,operator}-{320,390,768,1440}.png`. The original green header assertion would fail the current expected dark `rgb(11, 9, 21)` check; the before and after browser observations make that visual check breakable.

`node /tmp/puni-fe-state-check.mjs` observed a focused brief field border `rgb(169, 98, 20)` and visible focus shadow, a disabled empty-brief proposal action, and a visible API error state. `node /tmp/puni-fe-built-font-check.mjs` loaded the production build's `/manual` route; both Vite-emitted font requests under `/assets/` returned 200, `document.fonts.check` accepted Geist and Inter Tight, and the 390px view had no overflow. Screenshot: `/tmp/puni-fe-production-manual-390.png`. `node /tmp/puni-fe-brand-focus-check.mjs` then checked the final built wordmark and focus treatment: the gold dot began 2.27px after the final letter, the header link's focus outline was bright gold `rgb(246, 174, 76)`, the light-surface retry link's outline was darker `rgb(169, 98, 20)`, and there were no page errors or horizontal overflow. Screenshot: `/tmp/puni-fe-final-brand-focus-390.png`. These visual checks use mocked API responses and do not establish a live account, model or submission integration.

## Source and checks

The two variable fonts and adjacent OFL notices are under `apps/website/fe-01/src/assets/fonts/`, with upstream links in their README. `fc-scan` identified the copied files as Geist and Inter Tight. The [Google Fonts Geist record](https://github.com/google/fonts/tree/main/ofl/geist) and [Inter Tight record](https://github.com/google/fonts/tree/main/ofl/intertight) list OFL notices. The private source files and public copies have matching SHA-256 digests. Vite emitted `assets/Geist-variable-Cz_WRCMl.ttf` and `assets/InterTight-variable-BjjQnp0H.ttf`; compiled CSS references both under `/assets/`, which the existing dev gateway routes to the app. No theme stylesheet or media was transferred.

- `bun test apps/website/fe-01/src --timeout=30000`: 2 passed, 0 failed, 7 assertions.
- `bunx tsc --build --force apps/website/fe-01/tsconfig.json`: passed.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run website-fe-01:lint --skip-nx-cache`: passed with the project graph available; the direct ESLint attempt had warned that its module-boundary rule lacked a graph, so that direct result was not treated as final lint evidence.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run website-fe-01:build --skip-nx-cache`: passed; Vite built 18 modules and emitted both hashed fonts.
- `bunx prettier --check apps/website/fe-01/src/style.css apps/website/fe-01/src/main.tsx apps/website/fe-01/index.html apps/website/fe-01/src/assets/fonts/README.md openspec/changes/align-website-app-visuals`: passed.
- `bunx @fission-ai/openspec@1.13.0 validate align-website-app-visuals --json`: one change passed with no issues. `git diff --check`: passed.

After the focus and wordmark refinement, the focused Nx build and lint targets passed again with cache disabled. Prettier, OpenSpec validation and `git diff --check` also passed on the final diff. Behavior tests and typecheck above cover the unchanged React behavior.

The first unprivileged Nx runs exited 0 after socket warnings without printing target execution. They were not used as proof; focused direct checks and the later visible Nx lint/build targets above provide the evidence. A deployed app, real API journey and exact-host gateway font requests remain for the release operator.
