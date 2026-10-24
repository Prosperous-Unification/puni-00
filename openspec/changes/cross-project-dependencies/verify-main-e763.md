# Main e763 integration evidence

The integration merges `e763aa1a3d03c9d87a33fafcfb1224e10094d723` into the isolated feature worktree after CI repair commit `12034abb9a82748b1574be8eb974456f2d00b735`. The user main checkout was not changed.

## Resolutions

- Kept both project address and claim display imports, exports, routes, frontend handling, and tests. The organization harness uses separate named read-only connection bindings for address search and claim observation.
- Kept `createLivePlanStore`'s owned and borrowed `ReadSnapshotLifetime` checks, including expire before commit or rollback and final expiration and close. Main's `db.observeCommitted` remains for detached `ClaimRepository.observeProject`; it was removed only as an unused import from `chain-snapshot.ts`. This matches the bounded architecture review: the two observers have different lifetime guarantees and must remain separate.
- Combined the two meanings of “elsewhere” into one glossary entry: a person's outranking bookings, including another project, and direct connected person constraints. Combined the work-item module index memberships, preserving both typed dependency copying and project claim files.
- Kept one cold product import in the backend Docker config test, which checks both local and OIDC outputs with a 30-second subprocess timeout and a 45-second case budget. The upstream two-import 60-second form was not needed for those two assertions. Kept the mounted worker protocol's 30-second case budget and both observed CI timeout facts.
- Main's claim test fixture now supplies the required local dependency context and a distinct abbreviation for its second project. Its source observation test supplies the backend dependency capability. Both are test fixture updates required by the feature branch's explicit admission contracts.
- The generated MCP document produces 90 tools, matching the merged README count.

## Local verification

- `bunx tsc --build --force` for contracts, core, store-sqlite, be-01, and fe-01: exit 0 after fixture updates.
- `bun test` on `project-claims.test.ts`: 5 pass. The first merged run failed all five because the second fixture project reused a now unique abbreviation; the distinct abbreviation restored them.
- `bun test` on `claim-observation.db.test.ts` and `read-snapshot-lifetime.db.test.ts`: 19 pass, including uncommitted claim isolation, same-snapshot claim/racing-row observation, expiry, and transaction failure paths.
- `bun test` on `connected-live-plan.db.test.ts` and `project-address-search.db.test.ts`: 30 pass, including owned and borrowed rival-publication isolation and connected evidence capture.
- `bun test` on be-01 `services-connected.db.test.ts`, `project-claims-organization.controller.db.test.ts`, and `project-address-search.controller.db.test.ts`: 59 pass, including mounted optimizer handoff, claim access refusal, and address lookup.
- Vitest on `project-stream.test.ts` and `plan-read-and-write.test.tsx`: 133 pass. Vitest on `plan-refresh.test.ts`, `plan-refresh-stream.test.ts`, `dependency-autocomplete.test.tsx`, and project `composition.test.ts`: 90 pass.
- After the generated OpenAPI document was emitted, `bun test apps/wbs/mcp-01/src/generated-document.test.ts`: 15 pass. A direct `toolsFromDocument(readDocument()).length` returned 90. Its first direct run lacked the normally prepared ignored document and failed on that missing fixture; no declaration failed after preparation.
- `bun test tools/tool-devsync/src/module-labels.test.ts`: 6 pass, including the combined module index.
- `./node_modules/.bin/openspec validate --all --json`: 283 passed, 0 failed.
- Scoped ESLint and Prettier checks for resolved files: exit 0.

## Limits

These are focused integration checks. The canonical h2puni gate, full Nx suite, deployment, and CI run are parent-lane work. The CI repair packet records its own remaining bundled peer and cleanup timeout limits in `verify-ci-bun144.md`.
