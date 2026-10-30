# Task 3.2 — scoped MCP/HTTP parity test packet

Reviewed test-only commit `234aa2cdd` was integrated as `4644ed62e` on the feature branch. The packet adds a generated-schema assertion covering both endpoint project IDs and a booted test that sends one scoped external dependency command through generated MCP and direct HTTP, observing the same dormant 409 response. It does not activate authoring or complete task 3.2.

Astra independently approved the packet after 17 boot/generated tests passed, both MCP TypeScript checks and lint/format passed. It removed the nested endpoint project ID and watched the transport test fail (MCP 404 versus HTTP 409); it removed one generated schema field and watched the document test fail. Reviewer logs: `/tmp/puni-mcp-review-{tests,types,lint,format}.log` and fault logs `/tmp/puni-mcp-equivalence-{strip-project-id,remove-schema-project-id}.log` in the integration environment.

On the integrated feature HEAD `4644ed62e`, `bun test apps/wbs/mcp-01/src/generated-document.test.ts apps/wbs/mcp-01/src/organization-delegation.boot.test.ts` passed 17/17, 62 assertions; `bunx tsc --noEmit -p apps/wbs/mcp-01/tsconfig.spec.json` passed. An initial sandboxed boot test failed at `Bun.serve` with `EPERM: listen`; the unsandboxed rerun passed. The exact source hashes are:

- `apps/wbs/mcp-01/src/generated-document.test.ts`: `33f378dd9e72ff7e9bfd72d119d4fce559eac0d193a004c823202f473d924efa`
- `apps/wbs/mcp-01/src/organization-delegation.boot.test.ts`: `3290cedeec79ba290fb82b4b7d32ab1feea91a085bf7f84fe13a29e2b8f9b883`

Full mounted positive external authoring, final CI and exact-SHA h2puni gate remain open.
