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
