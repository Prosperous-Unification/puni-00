# Verification: app guided conversion

## Task 1: quiet app masthead (2026-10-31)

Implemented in isolated worktree81ab from ade6a6007d1443ff7e0793530e96e5231b3d7228. The approved reference is the rendered https://dev.puni.dev landing, measured through Chromium; no licensed Astro/theme source was read or copied. The app uses owned React/CSS and its existing self-hosted fonts.

Header placement is now `flow | overlay`. Flow occupies one page row; Build overlays the masthead and reserves that same top inset in main. The obsolete rail and its desktop thread offset are removed. Start over remains beneath the masthead, including its wrapping confirmation at320px. Night/light tones, current-page semantics, skip navigation and moon-to-dot fallback remain.

### Commands and evidence

- `bun test apps/website/fe-01/src/chrome.test.ts`: RED2fail/2pass (plain labels and placement name), then GREEN4pass/0fail/22assertions.
- `env -u FORCE_COLOR -u NO_COLOR NX_DAEMON=false bunx nx run-many -t test,lint,typecheck,build -p website-fe-01 --skip-nx-cache --output-style=static`: exit0;141tests/0fail/428assertions, all4app targets and4dependency build targets passed. Log `/tmp/puni-masthead-nx-final.log`. An earlier run caught a nullable test expectation; it was corrected before this fresh full focused run.
- Existing `browser/screens.mjs` runs use `PUNI_SCREENS_PORT_OFFSET=200`, `PUNI_SCREENS_STRICT=1`, `PUNI_BROWSER_EXECUTABLE=/home/df/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell` and isolated fixture APIs3318/3319/apps4418/4419. Providers are canned demo/disabled, with no external inference. Fixture setup is retained in `/tmp/puni-masthead-stack.ts`.
- Old-header RED: `PUNI_SCREENS_ONLY=header-parity PUNI_SCREENS_DIR=/tmp/puni-masthead-red bun apps/website/fe-01/browser/screens.mjs` exited1; all15Build/manual/operator comparisons failed at1440/1024/768/390/320. Log `/tmp/puni-masthead-red.log`.
- Initial GREEN: `PUNI_SCREENS_ONLY=header-parity,menu,start-over,build-disabled,build-paused,build-live,loading,error,manual,operator,build-media-failed PUNI_SCREENS_DIR=/tmp/puni-masthead-green bun apps/website/fe-01/browser/screens.mjs` exited0;53OK checks:35actual app-state captures,15parity comparisons, Menu/tab order and Start over. All35states hadCLS0.000. This run predates the added painted masthead audit and expanded narrow keyboard loop.
- Painted audit GREEN: `PUNI_SCREENS_ONLY=menu,build-media-failed,operator PUNI_SCREENS_DIR=/tmp/puni-masthead-audit bun apps/website/fe-01/browser/screens.mjs` exited0;8state captures and390pxMenu/tab checks. Minimum sampled text contrast14.07:1night,17.28:1light,19.08:1open Menu. Text nodes are sampled separately from the decorative moon. Open navigation intentionally overlays the thread; Start over hit testing runs with the menu closed. This samples rendered surfaces, not every possible video frame.
- Final strict browser rerun with the same initial GREEN selection and `/tmp/puni-masthead-final` includes painted text/44px/hit tests plus768/390/320Menu keyboard order/Escape/focus restoration. Exit0;57OK checks:35actual app-state captures,15parity comparisons,6narrow keyboard/Menu checks and Start over. All35states hadCLS0.000; minimum sampled masthead/control text contrast13.84:1. Log `/tmp/puni-masthead-final.log`. A preceding attempt found the focus audit had scrolled long manual forms past the header; sampling now explicitly restores the masthead viewport first.

- `bunx eslint apps/website/fe-01/browser/screens.mjs`: exit0; `/tmp/puni-masthead-browser-lint.log`.
- `bunx prettier --check` on all8named source/spec files: exit0; `/tmp/puni-masthead-format.log`.
- `bunx openspec validate app-guided-conversion`: exit0with the existing long Task2requirement warning. `--strict` exits1solely for that >500-character “Guide requests toward existing offers” warning. The binding spec is unchanged; parent/Task2must resolve the warning before a strict final change validation. Logs `/tmp/puni-masthead-openspec{,-normal}.log`.

### R5 production-path negatives

Every mutation below changed the real app source, ran the browser against it, and was restored byte-identically with `cmp` before the final pass. Existing safety proofs remain in place; new proof comments sit beside the changed checks.

| Check                                           | Injected fault and observed failure                                                                                                                                                                                                                                                                                                                                    | Evidence                              |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Measured parity                                 | Original numbered rail failed all15route-width comparisons; both desktop positioning and all narrow panel geometry failed.                                                                                                                                                                                                                                             | `/tmp/puni-masthead-red.log`          |
| Text contrast,44pxidentity, Start over hit test | Appended night ink#303030,20pxbrand minimum and zero Build top inset. All4media-failed captures reported1.49:1text, small PUNI and covered Start over; exit1.                                                                                                                                                                                                          | `/tmp/puni-masthead-fault-css.log`    |
| Required parity part                            | Removed the real `.brand` class. Parity threw `Required masthead reference/app part missing`; exit1.                                                                                                                                                                                                                                                                   | `/tmp/puni-masthead-fault-absent.log` |
| Exact labels and parity cardinality             | Removed Blog from real navigation. All4operator captures reported the3remaining labels; desktop and768pxparity reported `link count differs`, including the open panel. Chromium subsequently closed during manual768before the rest of this intentionally failing run. That infrastructure interruption is retained and is not represented as a completed strict run. | `/tmp/puni-masthead-fault-links.log`  |

### Review captures

The first GREEN captures were visually inspected for desktop spacing, narrow Menu and320pxconfirmation. Final captures use width-specific filenames (the initial parity open-menu filenames were reused by successive narrow widths).

- `/tmp/puni-masthead-final/parity-app-build-1440.png`
- `/tmp/puni-masthead-final/app-build-disabled-320.png`
- `/tmp/puni-masthead-final/app-start-over-confirm-320.png`
- `/tmp/puni-masthead-final/app-menu-open-320.png`
- `/tmp/puni-masthead-final/parity-site-header-1440.png`
- `/tmp/puni-masthead-final/parity-site-menu-open-320.png`

### Unverified work

Independent Task1review is owned by the parent. Full h2gate, required CI, private projection, live development delivery, real-provider activation and all Task2/3work remain pending. No h4tests/builds/jobs, full local monorepo gate, paid calls, provider-secret reads, push, deployment, Google-account changes or production activation occurred. Full locked dependency installation in81ab was not recertified: the parent's failed ENOSPCinstall was replaced with verified lock-identical hardlinked5270dependencies, recorded in the SDDledger. Populated operator inbox and scoped-contact browser journeys were not rerun for this masthead-only slice; existing mounted app tests passed. H.264 playback is not certified by this headless-shell run; media failure and fallback were tested.
