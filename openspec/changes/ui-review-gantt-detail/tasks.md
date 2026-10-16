## 1. The default follows the plan on screen (F-088)

- [x] 1.1 Failing hook test: links known, then unknown, then known decides again, both ways
- [x] 1.2 Failing panel test: generation 0 between two plans decides the switch again
- [x] 1.3 Unlatch `opening` in `useGanttDetail` when the links become unknown again
- [x] 1.4 Companion: a remembered answer survives the unlatch (proven with the unlatch clearing it)
- [x] 1.5 Browser guard: header picker switch between a plan with links and one without, both ways

## 2. The spec says what the switch opens on (F-089)

- [x] 2.1 Delta amending "One switch draws every mark the chart holds back"
- [x] 2.2 `bunx @fission-ai/openspec@1.12.0 validate --all --json`
