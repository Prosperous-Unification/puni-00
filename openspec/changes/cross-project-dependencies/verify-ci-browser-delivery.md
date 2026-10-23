# Bounded CI browser delivery scheduling

Date: 2026-10-23. Base: `f7957a5390f20b715ff63857277b9efd8dd2ac23`.
Branch: `proof/ci-cross-project-browser`.

The production `pixels_shard` job now runs
`bunx nx run wbs-fe-01:e2e-cross-project` exactly once, with
`${{ matrix.shard == 4 }}`. The ordinary Playwright config already excludes
`cross-project-refresh.real.spec.ts`; its dedicated config retains one worker
and zero retries. Eight ordinary shards, organization acceptance on shard 1,
disabled fail-fast and the stable required aggregate are preserved.

Shard 4 had 31 ordinary cases and a 5m40s job in hosted run
[39902390852](https://github.com/Prosperous-Unification/puni-00/actions/runs/39902390852).
The finite shard budget rises from 25 to 35 minutes because later run
[39951248349](https://github.com/Prosperous-Unification/puni-00/actions/runs/39951248349)
canceled shard 3 after ten minutes installing Chromium and 112 passing cases.
These prior hosted observations motivated scheduling; they do not prove the new
candidate's hosted completion.

## Watched production-workflow negatives

The initial amended oracle failed on the original 25-minute budget. After
raising only that budget it failed on zero dedicated commands. The complete
workflow then passed. Each following independent fault changed the actual
`.github/workflows/ci.yml`, ran the same production-workflow oracle and was restored:

| Injected fault                 | Observed failure              | Evidence                                                                    |
| ------------------------------ | ----------------------------- | --------------------------------------------------------------------------- |
| Remove dedicated run command   | Expected length 1, received 0 | [command removal](evidence/ci-browser-delivery/command-removal.log.txt)     |
| Duplicate dedicated command    | Expected length 1, received 2 | [duplicate command](evidence/ci-browser-delivery/duplicate-command.log.txt) |
| Invert condition to shard != 4 | Expected == 4, received != 4  | [condition inversion](evidence/ci-browser-delivery/condition-flip.log.txt)  |
| Restore 25-minute timeout      | Expected 35, received 25      | [old budget](evidence/ci-browser-delivery/25-minute-restoration.log.txt)    |

Each mutation exited 1 with 0 pass / 1 fail. Adjacent `Proof:` comments record
the observed faults. Command:
`bun test --preload ./tools/test/scratch/preload.ts --timeout=10000 tools/tool-git-hooks/src/hooks/pixels-workflow.test.ts -t 'runs every browser shard'`.

## Local verification

- Focused `pixels-workflow`, `gate-workflow` and `pr-merge-base` Bun suites with
  the scratch preload and 10-second timeout: exit 0, **62 pass / 0 fail,
  429 assertions**.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-git-hooks:lint --skip-nx-cache`:
  exit 0, configured target executed successfully.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-git-hooks:typecheck --skip-nx-cache`:
  exit 0, configured target executed successfully.

Standalone `actionlint` is unavailable on this machine and is not a configured
required gate for this workflow. The production YAML oracle and changed-file
Prettier validate the local workflow shape; hosted CI remains necessary.
No browser run, full Nx gate, full-repository format check, secrets/migration CI
or canonical `bin/h2puni-gate.sh <sha>` ran in this bounded packet. No complete CI,
host gate, product activation or full parent Task 5.2/11.x completion is claimed.
Normal commit hooks, changed-file format, whitespace and OpenSpec validation
outcomes are recorded below after execution. No push or integration is performed.

- `bunx openspec validate --all --json`: exit 0, **274 passed / 0 failed**
  (256 changes, 18 specs).
- Changed-file Prettier check and `git diff --check`: exit 0.

Normal commit hooks passed on implementation commit `fb94ffcc7`: ESLint,
Prettier, plaintext secrets, private nesting and both author-trailer stages.
The Tool Wiki hook returned its explicit inactive/non-certifying outcome because
no external activation root is provisioned; no Tool Wiki certification is claimed.
Migration and doc-cap hooks visibly skipped because no matching files changed.
