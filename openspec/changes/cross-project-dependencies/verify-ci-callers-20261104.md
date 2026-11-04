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
