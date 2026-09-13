# Verify — local write invalidation

## Section 1 — explicit completed-operation contract

Verified on 2026-09-13 from `origin/main` `c61b370d`.

| Check                                                                                                    | Result                                                |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Baseline `plan-read-and-write.test.tsx` + `plan-refresh.test.ts`                                         | 2 files, 67 passed                                    |
| Focused Section 1 suite: `local-write.test.ts`, `plan-read-and-write.test.tsx`, `plan-refresh.test.ts`   | 3 files, 69 passed                                    |
| Fast-tier manifest guard plus `local-write.test.ts`                                                      | 2 files, 6 passed                                     |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run fe-01:test --skip-nx-cache`                        | 106 UTC files / 2697 passed; 2 zoned files / 3 passed |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run fe-01:typecheck --skip-nx-cache`                   | succeeded                                             |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run fe-01:lint --skip-nx-cache`                        | succeeded                                             |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate local-write-invalidation --strict --json` | 1 change passed, 0 failed                             |

The first full-suite attempt was sandbox-blocked at
`playwright-config.test.ts > lets a shifted browser login reach authentication through the configured backend origin` with `spawnSync bun EPERM`; its child had produced the expected `401`. The complete result above is the same target rerun outside that process restriction.

### R5 proofs

| Check                                                     | Injected fault                                                             | Watched failure                                 |
| --------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------- |
| `keeps the completed prefix when a later request refuses` | Clear the gesture's completed-resource set when its second request rejects | `expected [] to deeply equal ['tree']`          |
| `refreshes a created tag after its attachment refuses`    | Replace refused-prefix invalidation with an empty resource list            | timed out with tag read count `1`, expected `2` |

The production-page case holds tag creation until the initial directory read is counted, rejects the subsequent attachment with the typed `unknown_tag` refusal, installs the covering directory answer, and asserts both that the picker offers the created tag and that the server row remains unattached. It supplies no socket subscription.

Browser tests and `bin/h2puni-gate.sh` are deferred to Task 3.3, where the packet explicitly requires the whole browser and host gates after all narrowing and race coverage is complete.

## Section 2 — narrow operation families

Verified on 2026-09-13 after rebasing the Section 1 commit onto `origin/main`
`0451b821`. That upstream commit changes only solver/devsync files and has no
frontend overlap.

| Check                                                                                                                        | Result                                                |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Focused Section 2 suite: page writes, reference-set prefixes, cells, steps, settings, marker seam and local-write accounting | 7 files, 250 passed                                   |
| Five legacy team-picker regressions after moving server directory setup before the initial page read                         | 1 file, 5 passed, 119 skipped                         |
| `bunx nx run fe-01:test`                                                                                                     | 107 UTC files / 2706 passed; 2 zoned files / 3 passed |
| `bunx nx run fe-01:typecheck`                                                                                                | succeeded                                             |
| `bunx nx run fe-01:lint`                                                                                                     | succeeded                                             |
| Changed-file `bunx nx format:check --files=...` and `git diff --check`                                                       | succeeded                                             |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate local-write-invalidation --strict --json`                     | 1 change passed, 0 failed                             |

The full suite preceded the no-overlap rebase. Focused tests, lint, format and
OpenSpec were rerun on the rebased tree. The five team-picker cases formerly
added directory entries behind the mounted page, then used an unrelated tree
write as an implicit directory refresh. Their server fixtures now exist before
the page's initial directory response, matching the narrow-scope contract.

### R5 proofs

| Check                                                           | Injected fault                                   | Watched failure                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `estimate refreshes only tree without a socket`                 | Restore `ALL_RESOURCES` for the estimate request | Exact reads included tree, steps, six directory lists and markers instead of only tree |
| `estimate refreshes only tree without a socket`                 | Drop the estimate request's tree obligation      | The server-normalized `· 5` total never appeared                                       |
| `step rename refreshes tree and steps without a socket`         | Declare the rename tree-only                     | The Project Settings list never showed `Remove Build`                                  |
| `fully recovers when a peer already removed the refused step`   | Drop refused-step full recovery                  | Stale `Remove QA` remained visible                                                     |
| Five `keeps ... in the directory when attachment refuses` cases | Declare each create request tree-only            | All five received `['tree']`, expected `['tree', 'directory']`                         |
| `rereads a marker refused because a peer already deleted it`    | Return before refused-marker invalidation        | `chip('launch')` remained a marker span instead of becoming null                       |

The Section 3 race, transport/ownership, browser and host-gate work remains
unverified and unchecked.
