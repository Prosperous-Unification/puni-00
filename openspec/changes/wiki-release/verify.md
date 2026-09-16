# Verification Report

**Change**: `wiki-release`
**Verified at**: `2026-09-16 (branch `change/wiki-release`, base 84a4fd63)`
**Verifier**: Claude Fable 5.1, under the W7 controller

> Partial. Slices 1-5 are implemented and verified here. Slice 6 is operator work Dany runs against
> a real consumer repository; its rows stay empty until then. This change is not archivable until
> slice 6 is recorded.

---

## 1. Structural Validation

- [x] `openspec validate --all --json` — all items `"valid": true`

```
{"totals": {"items": 85, "passed": 85, "failed": 0}}
```

| Item           | Type   | Issues |
| -------------- | ------ | ------ |
| `wiki-release` | change | none   |

---

## 2. Task Completion

- [ ] Every `- [ ]` in tasks.md is now `- [x]`

| Task                   | Reason incomplete                                             | Blocks archive? |
| ---------------------- | ------------------------------------------------------------- | --------------- |
| 6.1 operator procedure | Dany tags, releases and adopts the toolkit in a real consumer | yes             |

---

## 3. Delta Spec Sync

| Capability     | Sync status | Note                                                    |
| -------------- | ----------- | ------------------------------------------------------- |
| `wiki-release` | ✗ pending   | ADDED requirements sync at archive, after slice 6 lands |

---

## 4. Failure Proofs

| Check (file:line)                                               | Fault injected                                                                   | Test that observed the failure                                                       | Result                                                     |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| manifest join, `trusted-wiki.yml` / `ci.yml` provisioning       | join `if` deleted from both steps                                                | `activation provisioning refuses an archive the configured version does not name`    | exit 0, root exported for a foreign archive                |
| selection shape, both provisioning steps                        | shape `if` deleted; `selected.json` directory `../decoy` with a planted manifest | `activation provisioning refuses a selection that leaves the extracted archive root` | exit 0, joined a manifest the pinned archive never carried |
| `bin/tool-wiki-lint.sh:38` runtime absence                      | refusal replaced by a non-failing assignment                                     | `the archived runtime closure is the launcher default and its absence is refused`    | exit 0, route ran with no TypeScript closure               |
| `trusted-wiki.yml` `Install archived launcher` descriptor shape | shape `if` deleted; descriptor `../decoy-launcher.sh` with a real decoy          | `the trusted workflow installs the launcher its archive root names`                  | exit 0, installed the decoy as the admission entrypoint    |
| `release.ts` `assertReleaseTag` (T1)                            | `if (false && …)`                                                                | `refuses a tag that is not at HEAD, unknown, or malformed`                           | packed an archive at exit 0                                |
| `release.ts` `assertTagAtHead` T2                               | `if (false && …)`                                                                | same case                                                                            | refused as `not at HEAD: undefined != <head>`              |
| `release.ts` `assertTagAtHead` T3                               | `if (false && …)`                                                                | same case                                                                            | packed the wrong commit's bytes at exit 0                  |
| `release.ts` `assertCleanCheckout` T4                           | `if (false && …)`                                                                | `refuses a checkout whose bytes are not the ones the tag names`                      | packed an edited launcher at exit 0                        |
| `release.ts` `assertReleaseRuntime` T5                          | `if (false && …)`                                                                | `refuses an operator runtime and a destination it cannot honestly use`               | packed under a drifted `bunVersion` at exit 0              |
| `release.ts` `assertDestinationFree` T8                         | `if (false && …)`                                                                | same case                                                                            | second run wrote into an occupied destination at exit 0    |
| `release-cli.ts` T6 non-standalone bundle                       | none — see the comment at the throw site                                         | none                                                                                 | **no observed negative**; `Bun.build` cannot reach it here |
| `relocation-activation.ts` R21 toolkit message                  | `riskStratum ?? 'risk.public-admission'`                                         | `a strata file that stratifies no policy review refuses by name`                     | invented the stratum and prepared an activation            |
| `prepare-activation-cli.ts` toolkit role digest                 | `if (false && …)`                                                                | `a toolkit role altered after packing refuses before anything is prepared`           | reached a later, unrelated failure instead of the name     |
| `gate-entrypoints.test.ts` consumer template byte identity      | a comment appended to the template                                               | `Nx, host gate, CI and lefthook select the whole tree without caching`               | the two texts printed side by side                         |
| same, `wiki-release.yml` `contents: write` scope                | narrowed to `contents: read`                                                     | same case                                                                            | permission pin failed                                      |
| same, release action refs 40-hex                                | `softprops/action-gh-release@v2`                                                 | same case                                                                            | ref pin failed                                             |
| five rewritten `trusted-wiki.yml` pins                          | the pre-7.2 workflow text                                                        | same case                                                                            | each literal failed                                        |
| step-order pin                                                  | guard step moved after provisioning                                              | evaluated against the mutated text                                                   | FAIL as required                                           |
| `bun-version` equals `.bun-version`                             | compared against a drifted `1.3.9`                                               | evaluated against the mutated value                                                  | FAIL as required                                           |

- [x] Every check in this change has a row
- [x] Each negative test reaches the production call path, not a copy of it
- [x] Where code distinguishes filesystem state, both absence AND unreadability were tested
      (the launcher's runtime default covers absence; the toolkit role digest covers alteration)
- [x] No row relies on an exit code alone; each names the observed wrong behaviour

**Honest exception**: T6 has no observed negative. `Bun.build` with no `external` configuration
either inlines every bare specifier or fails the build, so this repository cannot currently emit a
bundle that reaches the check. It is recorded as a contract guard at its throw site and in
`docs/findings/checks-that-cannot-fail.md`'s terms, not claimed as proven.

---

## 5. Gate Output

CI is the merge gate; locally the wiki project's own targets plus the entrypoint suites were run.

```
bunx nx test wiki-cli --skip-nx-cache        → 619 pass, 0 fail (dispatch A final, commit f6cf72f6)
bunx nx run wiki-cli:lint:source             → Successfully ran
bunx nx run wiki-cli:typecheck               → Successfully ran
bunx nx test tool-devsync --skip-nx-cache    → Successfully ran
bash bin/h2puni-gate.test.sh                 → all cases passed (19-21 included)
bunx nx format:check --all                   → exit 0
bunx @fission-ai/openspec@1.3.0 validate --all --json → 85/85
```

The final full-suite numbers for the dispatch-B commits are in
`.superpowers/sdd/2026-09-15-agentic-scalability-plan/task-7.1-report.md`, which records every
command with its result line.

---

## 6. Implementation Signal

- [x] No unstaged files in the worktree at each commit
- [ ] Relevant commits pushed — the controller pushes and opens the PR

**Commit range**: `84a4fd63..HEAD` on `change/wiki-release`

---

## Decision

- [ ] ✅ PASS
- [x] ⚠️ PASS WITH WARNINGS — slices 1-5 are verified; slice 6 is operator work and T6 carries no
      observed negative. Neither blocks review; both block archive.
- [ ] ❌ FAIL

**Next step**: controller review, then the exact-head h2puni gate, then Dany decides whether to tag
`wiki-v0.0.1` and adopt the toolkit in a consumer repository. This session created no tag and no
release.
