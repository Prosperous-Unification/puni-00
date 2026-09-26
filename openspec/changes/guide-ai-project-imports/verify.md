# verify — guide-ai-project-imports

## Spec-time commands

The repository-root command bunx @fission-ai/openspec@1.12.0 validate --all --json exited 0: 126 passed, 0 failed. This change was valid. File-scoped bunx prettier --check exited 0 for all six packet files.

## Planned commands — pending implementation

- Focused guide-content and frontend browser tests, then `bun run e2e` for the Import with AI help path.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`, file-scoped `bunx prettier --check`, and `bin/h2puni-gate.sh <sha>` on h2puni at the committed implementation SHA.

## Planned checks — pending implementation

- **Pending:** Guide-content check for every named client, status/version/date, scope and callback cautions, exact copyable prompt, source mapping, troubleshooting and no token-copy or native `.mpp` promise.
- **Pending:** Browser and accessibility checks for Export / Import → Import with AI, working guide link and copy controls.
- **Pending:** Live-client evidence per tested label: version/date, callback, registration, read/write scopes, ordinary-user read and reversible write, actual refresh and revoked-token denial. Clients lacking this remain untested.
- **Pending R5 proof:** Remove a client row or introduce a false tested label; content check must fail. Restore and record output.
- **Pending R5 proof:** Break the in-app guide link or copy prompt; browser check must fail. Restore and add adjacent Proof: comment.
- **Pending:** Public URL and authentication prerequisite from `enable-public-mcp-client-auth`; format, lint, typecheck and host gate. No live client connection or application behavior has been verified at spec time.
