# Project-address GET refusal declaration follow-up

File: `libs/wbs/domain/contracts/src/http/project-address-shapes.ts`
SHA-256: `7317bc9165c4d96696bbc9d042cfa029b9e9516a48b2db45a9227d4b41482faf`

Changed the shared 400 response schema from only `invalid_query` to `invalid_query | invalid_params | invalid_body`. The GET endpoints have query and (two have) params request boundaries. The adapter can refuse malformed GET bodies with `invalid_body`; the shared refusal now declares all three while retaining the existing `invalid_query` meaning. No backend behavior changed.

Observed red before edit: integrated baseline `getApiProjectAddressesProjects` had `declared: false` where `infrastructure-shapes.test.ts` expected true (root log `/tmp/puni-lookup-shapes-baseline.log`). In this worktree after edit: `bun test libs/wbs/domain/contracts/src/http/infrastructure-shapes.test.ts` 3 pass/0 fail; `bunx prettier libs/wbs/domain/contracts/src/http/project-address-shapes.ts --check` passed; `bunx eslint libs/wbs/domain/contracts/src/http/project-address-shapes.ts` passed. The project-wide `wbs-contracts:lint` Nx target exited nonzero with no ESLint diagnostics printed (`/tmp/puni-wire-contracts-lint.log`), so full lint is unverified.

Exact diff:

```diff
-  { status: 400, schema: responseSchema(type({ error: "'invalid_query'" })) },
+  {
+    status: 400,
+    schema: responseSchema(type({ error: "'invalid_query' | 'invalid_params' | 'invalid_body'" })),
+  },
```
