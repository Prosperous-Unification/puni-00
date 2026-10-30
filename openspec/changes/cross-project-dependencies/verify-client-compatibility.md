# Browser dependency compatibility decoding prerequisite

2026-10-23. Isolated clone `/tmp/puni-client-claim`, based on
`fb544208ad7c09d0e5b0015604af39bb665cc9ef`. No primary checkout edits or push.
Parent task 10.1 remains open.

The shared client now validates the existing exact protected-resource 409 admission
envelope and preserves `required` in a typed `dependency_incompatible` boundary
failure. A real browser HTTP client feeding the mounted plan table displays a
compatible-client instruction and exposes no successful export. Ordinary declared
409 conflicts retain their existing typed refusal; malformed envelopes, exempt
operations, other statuses and cancellation retain their own boundary outcomes.

This is not client V1 admission. `project-stream.ts` still opens a legacy socket,
and the current gateway intentionally refuses all offered protocols, as required
by “Gateway upgrades require fresh dependency compatibility admission.” Its immutable
semantics remain empty. Adding a protocol would break DISABLED sockets and falsely
claim support. The mounted test also checks every observed HTTP request omits
`X-WBS-Dependency-Semantics`. No authoring, activation or advertisement changed.

## Fresh focused verification

- `BUN_TMPDIR=/tmp BUN_INSTALL_CACHE_DIR=/tmp/puni-client-bun-cache bun install --frozen-lockfile`:
  exit 0; 1801 installs checked across 1648 packages. Initial default temporary
  directory was read-only; the explicit writable temporary directory resolved it.
- `bun test libs/wbs/domain/contracts/src/http/client.test.ts libs/wbs/domain/contracts/src/dependency-client.test.ts`:
  exit 0; 45 pass, 0 fail, 115 assertions. Includes real protected/exempt shapes,
  malformed/missing/extra/wrong-semantic envelopes, non-409 responses, ordinary
  Retry 409 and cancellation during admission decoding.
- From `apps/wbs/fe-01`, `bunx vitest run --config vitest.config.ts src/components/wbs/plan-read-and-write.test.tsx src/lib/wbs-api.test.ts src/lib/saved-plan-api.test.ts src/app.test.tsx`:
  exit 0; 4 files, 231 tests pass, 41.98 seconds. Includes the production HTTP →
  browser client → project runtime → mounted plan failure path and existing
  dormant/disabled authoring behavior. Vite reports its existing `__dirname`
  native-config warning.
- `bunx tsc --build apps/wbs/fe-01/tsconfig.json --pretty false`: exit 0.
- ESLint over the nine changed TypeScript/TSX files: final exit 0. An initial
  invocation lacked an Nx graph and skipped module-boundary rules. After
  `NX_DAEMON=false bunx nx graph --file=/tmp/puni-client-graph.json`, those rules ran;
  two cancellation-test arrow style errors were corrected before the final pass.
- Prettier checks all changed files; `git diff --check` is clean.
- `openspec validate cross-project-dependencies --json`: exit 0.
- `openspec validate cross-project-dependencies --strict --json`: exit 1 on 18
  pre-existing long-requirement warnings. Restoring the base spec temporarily and
  rerunning strict validation produced the exact same 18 issue objects; no new
  warning was introduced. The base file was then restored to the candidate.

## Watched production-path negatives

Tests were first written against the base. Shared decoding tests failed with
`unexpected_status` instead of the typed compatibility failure. The mounted HTTP
plan test failed because the compatible-client instruction was absent.

After implementation, each fault below was injected independently, observed with
exit 1, and restored. Adjacent production `Proof:` comments identify these tests.

| Injected fault                            | Observed failure                                                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Disable compatibility decoding            | Mounted real HTTP plan test cannot find compatible-client instruction                                                               |
| Bypass plan compatibility presenter       | Same mounted test cannot find instruction                                                                                           |
| Remove two-key closed-envelope check      | Extra-field envelope wrongly becomes `dependency_incompatible`                                                                      |
| Bypass schema validity                    | Wrong/missing semantics and ordinary conflict checks throw while reading an unvalidated required field; Retry regression also fails |
| Remove exact 409 status restriction       | Protected/exempt matrix classifies a 200 admission envelope as incompatibility; existing status/body cleanup tests also fail        |
| Remove operation exemption                | Health's 409 is wrongly classified as dependency incompatibility                                                                    |
| Remove post-validation cancellation check | Cancellation test receives `dependency_incompatible` instead of controlled cancellation                                             |

Fault logs are transient `/tmp/puni-client-fault-*.log`; the table records their
observed effects independently of those local files.

## Limits

No full Nx gate, host gate, frontend production build, browser E2E, secrets scan,
migration lint or independent review was run for this isolated prerequisite.
No backend or gateway source was edited. No false V1 HTTP or WS claim is emitted.
Existing retained sockets, client capability negotiation, complete participant
fencing, activation, semantic support and production authoring remain separate work.

## Integrated review and configured checks

The exact `fadd66a6` packet was independently reviewed by Astra High with no
blocking findings. The reviewer reran 45 shared-client tests, 231 focused
frontend tests, the real mounted compatibility case and a production frontend
TypeScript no-emit check. Review confirmed exact protected 409 decoding,
required/status/header retention through a real `Response`, ordinary conflict
and exemption behavior, actual plan guidance, and no V1 claim or activation.

After integration as feature commit `63f2a26b2`, serial uncached
`bunx nx run-many -t lint typecheck -p wbs-fe-01 --parallel=1 --skip-nx-cache
--outputStyle=static` passed the module prerequisite and both configured
frontend targets in 4m56s. This is an integrated source check, not a full
feature gate; E2E, complete CI and the exact-head h2puni gate remain pending.
