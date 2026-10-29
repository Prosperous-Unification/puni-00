# Two completed e09e CI corrections

These corrections restore existing test contracts after published CI run
40854272083 at `e09e0c5f511fad7284698f1e68d81aef54906828`.
They start from health checkpoint `65bc7818c900dd486a8b0bde69024abe8d5bb9e6`.
The actual completed backend/workspace logs, complete uploaded Nx artifacts,
exact context comparison and immutable SHA256 manifest are retained under
`/tmp/puni-e09e-ci-failures-20261029/`; its diagnosis hashes to
`2849695dfa13232fd12bfbcdb12ed4cbed27573fd24dd03a2cd25e29186c718a`.
Independent finite scope review:
`/tmp/puni-e09e-ci-two-corrections-independent-scope-20261029.md`, SHA256
`826113d17f30a511eba47f590e7601e1d36cdb4b35c086e67ad964b015cd3074`.

## Actual red and exact corrections

Backend CI reported 4955 pass, 3 skip, one failure: the existing tier owner
found `testing/read-observation.test.ts` opening SQLite without the required
`.db.test.ts` suffix. The suite now has that suffix. Its bytes are identical,
SHA256 `9c97f626bf9d0ed7430d296a958e2353d55915387c51dc09f7953a506b027df1`;
`/tmp/puni-e09e-ci-corrections-byte-identity-20261029.json` records both paths
and hashes. Opener detection, tier runners and all six test behaviors are intact.

Workspace CI failed only the namespacing corpus digest. All 324 occurrences,
six category counts, coverage and empty unclassified list agreed. Comparison
from the accepted pin's commit through e09e identifies exactly one changed
trimmed context: `exhaustive-coverage.test.ts` added `lib: ['ES5']` on its
existing copied-fixture `apps/**/*.ts` selector line. The expected digest now
matches the actual CI observation,
`49b513893d7514e7556162f8c8eefadaad34bc760996e8ed044e78584cd4af2a`, with a
factual adjacent explanation. No scanner check or other expected value changed.

## Focused verification

```sh
# From apps/wbs/be-01
bun test src/test-tiers.test.ts src/testing/read-observation.db.test.ts --timeout=10000
# From the repository root
bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts -t '^every legacy source occurrence and relevant text family is pinned$' --timeout=10000
```

The backend owner and renamed suite passed: **eight tests, 31 assertions**,
`/tmp/puni-e09e-ci-corrections-backend-focused-20261029.log`.

The first local corpus run refused before hashing: the unstaged rename left
Git's cached old filename present, and the unchanged strict scanner threw
`ENOENT` on that missing path. Receipt:
`/tmp/puni-e09e-ci-corrections-digest-focused-20261029.log`.
No missing-path skip, scanner relaxation or further digest update was made.
Root then staged only the byte-identical old/new suite rename, confirmed R100,
unchanged HEAD and matching bytes (terminal `cb2021`, exit 0). The same existing
corpus owner passed after index alignment: **one test, one assertion, 14 filtered**,
`/tmp/puni-e09e-ci-corrections-digest-index-aligned-20261029.log`
(terminal `69c5c2`, exit 0). The digest test itself stayed unchanged between the
initial inventory refusal and this successful run.

Scoped lint and Prettier passed for the two changed test files; whitespace
checking passed. Receipts:
`/tmp/puni-e09e-ci-corrections-lint-20261029.log` and
`/tmp/puni-e09e-ci-corrections-format-20261029.log`.

## Limits

Actual CI supplies red evidence. No new fault campaign, bound change, native
acceptance, fixed-port use, full gate or deployment belongs to this correction.
Root owns Git and normal integration hooks. Passing focused tests does not
establish complete CI, main adoption or deployment acceptance.
