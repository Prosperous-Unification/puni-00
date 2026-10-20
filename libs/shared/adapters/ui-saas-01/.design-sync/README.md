# Claude Design sync config

`config.json` is read by `/design-sync`, which Dany runs from this kit's directory
([runbook](../../../../../docs/runbook-screen-design.md)). Its keys (`shape`, `srcDir`, `cssEntry`,
and the unset `extraEntries`, `componentSrcMap`, `projectDir`, `provider`) were read from the
command's bundled source on 2026-10-21; they are not publicly documented and are unverified until
the first sync runs. `shape: storybook` makes the sync import each `*.stories.tsx` and show every
story as a card; `cssEntry` is the catalogue's own stylesheet, Tailwind over `src/` plus the kit
theme. The sync resolves the kit through `../package.json`, whose entry is `src/index.ts`.
