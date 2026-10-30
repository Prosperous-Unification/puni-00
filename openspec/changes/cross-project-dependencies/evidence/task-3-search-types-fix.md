Approve the isolated test-only narrowing fix in `3451ca740586201b7be031cb1603d031e7926a0d`, reviewed in `/tmp/puni-cross-api`.

The tree was already clean when reviewed; the formerly unstaged change is now committed. The sole diff in `libs/wbs/adapters/store-sqlite/src/project-address-search.db.test.ts:53` assigns the already narrowed `retained` reader to `const captured` and closes over that same reference in the two assertions. It preserves both retained `capture('a1')` and retained `access` rejection checks, including the exact `snapshot is closed` message. No capability is reacquired and no production/runtime behavior changes.

Reviewed the exact commit diff and surrounding test. No tests/typecheck were rerun for this mechanical alias change, and no files or Git metadata were changed by this reviewer. This approval does not supersede the separate connected-capture lifetime finding.
