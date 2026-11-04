# Current-main CI caller corrections — 2026-11-04

CI run `41908825345` at `69b4674b106fc92eded32f0802f92c46fc5a007b`
reported stale frontend input expectations, SQLite fixture command signatures,
and a README count of 79 against 80 generated MCP tools. This correction changes
fixtures and documentation; production authorization and prerequisite checks stay
in place.

The frontend HTTP fixture now expects the supported `fresh-main-20261104`
epoch. Historical negative inputs reverse the current package and lock into the
exact previously supported CTT pair before removing the reviewed CTT additions;
every replacement occurs exactly once and both historical hash boundaries remain
asserted. The HTTP owning module and real Vite producer were not run locally.
Their affected cases require new CI observations.

SQLite fixtures pass authenticated principals to `runWithin`, preserve both
optional credential-pin fields, and narrow command/history refusals before
accessing their details. The race worker throws for unexpected admission refusals.
Leaf claim fixtures select the actual first workflow step; the whole-subtree
claim keeps its original unscoped semantics. No production guard is relaxed. Astra independently reviewed these adaptations
and the frontend expectation changes; its credential-run correction was applied
and re-reviewed.

Fresh local observations, with raw logs retained privately under
`tmp/puni-delivery-evidence/20261104/ci-callers-fix/`:

- Configured uncached `wbs-be-01:prepare-mcp-document`: passed.
- README count test against that freshly generated document: 1 passed,
  37 filtered, 0 failed, 2 assertions.
- Configured forced uncached `tool-remote-scripts:typecheck`: passed.
- Extracted literal-only reconstruction: both package/lock current, CTT and
  historical size/hash boundaries matched; all 7/10 reversal and 1/3 removal
  hunks occurred exactly once. No owning-module import or producer execution.
- First complete shared-occupancy attempt: failed its first memory-store case
  because workflow prerequisites blocked the claim before occupancy assertions.
  This observation is retained; it is not described as a passing test.
- After the reviewed fixture correction, the same complete owning file:
  29 passed, 0 failed, 124 assertions. Astra reviewed the final fixture diff.
- Configured forced uncached `wbs-store-sqlite:typecheck`: passed.
- Four changed TypeScript files: ESLint passed with empty output; Prettier
  reported all unchanged after formatting.

Full CI, the exact-SHA host gate, native acceptance, architectural adoption and
deployment remain unqualified by these local checks. The owner-custody repair
remains an unapplied proposal; its separate current-interface static checks do
not establish native correctness or candidate adoption.

## Backend capacity fixture continuation

The completed backend artifact for run `41908825345` identified three failures
in `directory-capacity.controller.db.test.ts`: all claims reached
`prerequisites_unmet` before the intended directory-capacity assertions. A fresh
focused local run reproduced exactly three failures (one passed, eight filtered).
The fixture now checks and explicitly selects the owning project's first workflow
step at all three claim sites; production workflow and capacity checks are unchanged.
The complete owning file then passed: 12 tests, zero failures, 48 assertions.
Configured forced uncached backend typecheck (including its module prerequisite),
scoped ESLint and Prettier check passed. Astra independently accepted the fixture
correction. Raw before/after receipts
and logs are retained under `tmp/puni-delivery-evidence/20261104/backend-ci-fix/`.

## Observed remote-rest blocker

The completed `nx-gate-log-remote-rest-1` artifact for run `41908825345` now
provides runtime evidence for the previously source-predicted portability issue:
`dependency-activation-storage.test.ts:42` invokes private owner preparation,
which refuses at `dependency-owner-custody.ts:1033` with
`UC2 literal native or safe-R1 admission required before acquisition`. This is
an ordinary CI discovery failure, not successful native admission or closure.
The separately published test-ownership design remains unimplemented pending its
existing approval question. No CI admission, exclusion or native authority was
changed to bypass this refusal.

The same artifact identifies an independent stale Caddy target assertion:
`caddy-target.test.ts:21` expects an inline `bun test src` command, whereas the
configured target invokes `bun run test/run-tests.ts canonical`. Its runner and
Caddy prerequisite require their own precise fixture verification.

The Caddy target fixture now checks the exact canonical command and working
directory, its seven explicit fixture suites plus `src`, the actual discovery
spread in the canonical argv, and exclusion of both executable-only legacy
helpers from that argv. It retains the uncached real-Caddy prerequisite and
all three early-refusal assertions. A fresh isolated run reproduced the old
command assertion failure; the final owning file passed four tests with zero
failures and 17 assertions. Its children stop before the suite, using a fake
Docker executable for the failed-image-preparation case; no real Caddy suite
was launched. Production targets, runners and private native admission remain unchanged. Raw streams and final checks are retained under
`tmp/puni-delivery-evidence/20261104/caddy-target-fix/`.

Astra accepted the final Caddy fixture. Configured forced uncached remote
typecheck, scoped ESLint and Prettier checks passed on that final source.
