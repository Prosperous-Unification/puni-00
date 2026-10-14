# verify — session-features

Branch `ui-review/session-features` from main `b144be17d`. UI review finding F-002, decision D1.
Bun tests ran under `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`; e2e with `E2E_PORT_SHIFT=500`.

## Red first

| Test                                                     | Before the change                                                                                                                                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/wbs/be-01/src/session-features.db.test.ts`         | 0 pass, 5 fail: `features` absent on every row; broken marker `Expected: 500, Received: 200`                                                                                            |
| `apps/wbs/fe-01/src/lib/session-features.test.tsx`       | 3 fail, 2 pass: each "reported off" case issued its read (Spaces: `expected 'Could not reach the server. Try again.' to contain 'Spaces need an organization'`)                         |
| `apps/wbs/fe-01/e2e/quiet-load.spec.ts` (on `b144be17d`) | 3 fail: `/` `GET /api/onboarding 403`; `/organization` five panel 403s and `GET /api/organization 409`; `/spaces` `GET /api/spaces 409`; each with Chromium's "Failed to load resource" |

## R5 negatives (each watched, then restored)

| Injected fault                                                 | Observed                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `readSessionFeatures` answers `onboarding: true` always        | session-features.db.test.ts 2 pass, 3 fail (both pre-activation rows, broken marker) |
| `organizations` from the marker alone (no selection check)     | 4 pass, 1 fail: the activated `disabled` row                                         |
| marker refusal caught and reported as `onboarding: false`      | 4 pass, 1 fail: `Expected: 500, Received: 200`                                       |
| OnboardingScreen reads whatever the feature says               | `expected [ { …(2) } ] to deeply equal []`                                           |
| OrganizationPage starts with no loss whatever the feature says | the inactive state is never found (panels mounted, their reads failed)               |
| SpacesPage reads and polls whatever the feature says           | `expected [ …(2) ] to deeply equal []`                                               |
| `App` does not pass the session read's `features` on           | quiet-load.spec.ts `/` fails with `GET /api/onboarding 403`                          |

## Commands

| Command                                                                                                  | Result                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run-many -t lint:fast typecheck -p wbs-contracts wbs-core wbs-store-sqlite wbs-be-01 wbs-fe-01` | Successfully ran (after `eslint --fix` sorted two imports)                                                                                      |
| `bunx nx run-many -t typecheck -p wbs-mcp-01 wbs-gw-01 wbs-conformance wbs-store-memory`                 | Successfully ran                                                                                                                                |
| `bunx nx run-many -t test -p wbs-be-01 wbs-contracts wbs-core wbs-store-sqlite`                          | contracts, core, store-sqlite green; be-01 2258 pass, 1 fail (`oidc.integration.test.ts` expected the old `/me` body), fixed and rerun: 57 pass |
| `bunx nx run wbs-fe-01:test` (with `test:unit`)                                                          | 74 + 194 + 4 test files passed                                                                                                                  |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                 | 190 items, 190 passed                                                                                                                           |

## Integration restack (2026-10-14)

Restacked standalone #442 exact head `0762e60915346af9d686a0aaf90132e5a861d6c3`
onto reviewed #405+#417 candidate `dde93acd308d071422d76c857b7325c015cdeeb9`.
The feature provider encloses the complete organization runtime tree; scoped space clients
and #417 refusal presentation/recovery are preserved. The feature test uses the mandatory
organization resource fixture and the accessible `Open All projects` recovery link.

The first integrated quiet-load run failed all three pages on
`GET /api/organization/memberships 403`: the legacy gate mounted membership choices
before its asynchronous runtime startup settled. With organizations reported off the
gate now waits for that runtime without mounting membership choices. Absent features
retain their existing fallback; activated membership discovery remains authoritative.

Fresh focused verification on the reviewed parent:

- Backend session/features/auth/route tests: 114 pass, 0 fail across six files. The initial
  sandbox run had one listener `EPERM`; rerun with localhost permission passed.
- Frontend session features, onboarding, organization page/gate, spaces and app:
  84 pass across six files.
- Quiet-load Chromium acceptance: 3 pass, including `/organization` recovery composition.
- Dedicated activated organization browser acceptance: 1 pass; ports 7300/7301/7400
  were confirmed free before startup.
- Nx scoped lint:fast/typecheck for contracts/core/sqlite/backend/frontend: 13 successful
  tasks, four cache hits on final rerun; initial run had zero cache hits.
- OpenSpec: 191 passed, zero failed. Composed frontend files pass Prettier; diff check clean.
- Watched negatives, restored: forcing feature reachability true gave 3 frontend failures
  (2 pass); forcing activation true gave 3 backend failures (2 pass); removing the transient
  gate guard failed the new inactive-runtime test on one observed membership request.
- Production comparison: backend, store, core, contracts and feature hook are byte-identical
  to standalone #442. Four frontend surfaces compose parent changes; the gate guard is
  the additional production change required by their integration.

Full host gate, full suites and publishing are delegated to the root integration review;
this worker does not run the host gate, push or merge.

## Review fixes (Fable review of #442 at `92c1808dd`, MERGE AFTER FIXES)

On top of `92c1808dd`, add-only commits.

1. The organization gate's startup guard now holds only while the legacy runtime is `loading`.
   New case `shows the lost state and Sign out when a legacy runtime is refused with
organizations off` (`organization-gate.test.tsx`, the reviewer's probe through
   `runtime.resourceScope.refuse({ error: 'unauthenticated' })`). Watched: with the guard on every
   state it fails `Unable to find role="button" and name "Sign out"` (body "Loading
   organization…"); with the guard removed `starts the inactive deployment runtime without
reading membership choices` fails `expected "vi.fn()" to not be called at all, but actually
been called 1 times`. Fixed: 9 pass. Spec sentence narrowed to the startup window, with a
   scenario.
2. Adjacent `Proof:` lines on `readSessionFeatures` (`app.ts`) and `OnboardingRepository.isActive`
   naming the faults recorded in `session-features.db.test.ts`.
3. `readFeatures()` moved below the invalid-token 401. New case `refuses an invalid bearer 401
even when the activation marker is broken`: with the read restored above the refusal,
   `Expected: 401, Received: 500` (5 pass, 1 fail); fixed 6 pass. Spec scenario added.
