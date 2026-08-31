<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The gutter fits the names

- [x] 1.1 `measureLabelGutterPx` measures every word the file will draw in its
      gutter through an attached `<svg>` and `getComputedTextLength`, and
      answers the widest `x + width + pad`, floored at `LABEL_COLUMN_PX`. It
      **throws** where the document cannot measure text; `vitest.setup.ts`
      grows a deterministic ruler, as it already does for `matchMedia`. Test:
      `e2e/gantt.spec.ts` `a name longer than the gutter ends before the first
day column`, which mounts the downloaded file back into the page and
      compares the label's `getBBox` right edge against the divider's `x1` in
      the file's own user units; negative: the measurement thrown away, watched
      failing on `expected 176 to be greater than 176`.
- [x] 1.2 The gutter is measured **inside** `buildStandaloneGanttSvg`, from the
      same `rowWords`/`hierarchyIndentFor` arithmetic the drawing pass uses, and
      every `LABEL_COLUMN_PX` in that function becomes it — test:
      `gantt-panel.test.tsx` `moves the divider, the axis and the chart together
for a name that does not fit`, plus the existing download cases, which
      keep their `176` because short names keep the floor; negative: the axis
      alone put back on the constant, watched failing on `expected -165 to be
20`.

## 2. The Export menu offers the chart

- [x] 2.1 `GanttPanel` takes `registerSvgDownload`, hands its host the act while
      it is mounted and hands back `null` on the way out — test:
      `wbs-table.test.tsx` `downloads the chart as an .svg from the Export
menu`; negative: the cleanup emptied, watched failing the closed-chart
      case on `expected [] to deeply equal [ Array(1) ]` — the stale downloader
      finds no live `<svg>`, returns, and the button does nothing at all.
- [x] 2.2 The Export menu's `Download chart as SVG` spends it, or pushes
      {@link NO_CHART_TO_DOWNLOAD} where nothing is registered — test: `refuses
the chart the menu has no drawing of, and says where it is`; negative: the
      guard replaced by a silent `download?.()`, watched failing on the same
      missing toast.

## 3. Gate

- [x] 3.1 The whole Nx gate — `test lint typecheck build` at `--parallel=2`,
      excluding `tool-bootstrap` — **exit 0** over 22 projects, fe-01 63 files
      and 1995 tests. `bunx openspec validate --all` says **28 passed, 0
      failed**. Prettier over the whole workspace is clean. The whole Playwright
      gate under `CI=1` on shifted ports is **263 passed, 0 failed, 1 skipped in
      7.9m, exit 0**. `bin/h2puni-gate.sh` exits 127 on this host and was not
      run; `tool-bootstrap:test` is the pre-existing host timeout, named in
      `verify.md`.
