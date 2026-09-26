# Design — guide AI project imports

## Help flow

Publish `docs/import-with-ai.md` through an accessible help page. Export / Import → Import with AI opens the same canonical content: choose a client; copy its connection configuration and the verified public `/mcp` URL; sign in and confirm read/write access; provide source material; copy the prompt; review the mapping; approve the write; reconcile the new WBS project. Troubleshoot connection, login, insufficient scope and rejected import separately. Do not offer a token-copy workflow. Explain client account or admin requirements where known and distinguish a one-time copy from synchronization.

The guide carries this client matrix; **status describes documentation, not a successful WBS connection**. Every row begins untested until the live evidence record exists. `U` means the verified public MCP URL. Include a version/date column in the published guide and update it when verified.

| Client                      | Status before live WBS test | Connection/fallback to document                                                                         |
| --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------- |
| Claude Code                 | Documented                  | `claude mcp add --transport http wbs U`; browser OAuth                                                  |
| Claude Desktop              | Documented                  | Remote custom connector; URL U; sign in                                                                 |
| claude.ai                   | Documented                  | Remote custom connector; workspace admin where required                                                 |
| ChatGPT                     | Unverified                  | Developer-mode custom MCP app; exact displayed callback and write/refresh compatibility must be checked |
| Cursor desktop              | Documented                  | `.cursor/mcp.json` remote URL; loopback OAuth                                                           |
| VS Code Copilot             | Documented                  | `.vscode/mcp.json` HTTP server; loopback or exact vscode.dev callback                                   |
| Codex CLI                   | Documented                  | `codex mcp add wbs --url U`; `codex mcp login wbs`                                                      |
| Gemini CLI                  | Documented                  | `httpUrl: U`; `/mcp auth wbs`                                                                           |
| Windsurf                    | Unverified                  | `serverUrl: U`; verify current app/version and callback                                                 |
| JetBrains AI Assistant      | Bridge fallback             | Native remote HTTP is documented, OAuth unclear; use tested pinned stdio bridge                         |
| Junie CLI                   | Documented                  | `.junie/mcp/mcp.json` URL U; `/mcp` Authorize; verify transport/callback                                |
| Zed                         | Documented                  | `context_servers.wbs.url: U`; OAuth without static header                                               |
| Cline                       | Documented                  | `type: streamableHttp`, URL U; Authenticate                                                             |
| Roo Code                    | Bridge fallback             | Native `streamable-http` transport lacks proven OAuth; tested pinned stdio bridge                       |
| Continue                    | Documented                  | YAML `type: streamable-http`, URL U; verify remote callback                                             |
| Goose                       | Documented                  | YAML `type: streamable_http`, `uri: U`; set write scopes                                                |
| Warp desktop                | Documented                  | UI or `.warp/.mcp.json` remote URL; browser OAuth; cloud agent unverified                               |
| Amazon Q Developer CLI      | Documented                  | HTTP URL U with `oauthScopes: [wbs:read, wbs:write]`                                                    |
| GitHub Copilot in JetBrains | Unverified                  | Remote MCP configuration documented; callback/WBS DCR unverified; bridge option                         |
| LM Studio                   | Documented                  | Remote URL U and OAuth; verify exact transport with WBS                                                 |
| Raycast                     | Documented                  | HTTP MCP server URL U, OAuth Dynamic; callback unverified                                               |
| Perplexity                  | Documented                  | Remote Streamable HTTP connector with OAuth; exact standard/Enterprise callback                         |
| Mistral Le Chat / Work      | Unverified                  | Custom MCP Connector URL U; exact callback and WBS interoperability unverified                          |
| Microsoft Copilot Studio    | Unverified                  | Dynamic-discovery MCP tool; installation-specific exact callback required                               |

For desktop stdio clients, document a **pinned and tested** `mcp-remote` bridge with HTTP-only transport and static metadata requesting `wbs:read wbs:write`; adapt the outer wrapper to each client. Do not publish an unexecuted `bunx` snippet as tested. Hosted clients without stdio support do not inherit this fallback.

## Copyable prompt

Preserve the following v1 prompt verbatim in the guide and in-app copy action:

> Import `[source project/link/files]` into a new WBS project named `[name]` using the WBS MCP tools.
>
> First inspect the available tool schemas and source material. Read the source without modifying it. Show a concise mapping preview covering hierarchy, project steps, estimates and units, dependencies, people, dates and source references. List unsupported or ambiguous fields; do not silently discard them or invent estimates.
>
> Use explicit day estimates only. Represent a single day estimate as equal optimistic/realistic/pessimistic values. Ask before converting hours or story points. Preserve unknown estimates as missing.
>
> After I approve the preview, use `postApiProjectsImport` for a complete valid WBS plan document. Alternatively, create the project and steps, then use `postApiProjectsByIdCommands` with ordered commands, `ref`, `parentRef`, `afterRef`, `workItemRef` and `predecessorRef`. Use `postApiDirectoryCommands` only for directory entries actually needed.
>
> Respect request limits. Each command batch is atomic and one undo; multiple batches are not one transaction. Keep the returned ID mapping. After an uncertain timeout, read back before retrying to avoid duplicates.
>
> Finally read back the project, reconcile counts, hierarchy, estimates and dependencies, and report imported, omitted and unresolved records with the WBS project link.

Jira, Linear and Asana use a client-supported source integration or exported files; MS Project uses XML/CSV, not promised native `.mpp`; spreadsheets identify hierarchy, units and predecessor columns. Preserve source IDs as external references. Distinguish effort from duration, and list relationship types unsupported by the current deployed dependency stage. Mark **WBS import tested** only when a record names client version/date, callback, registration method, requested/granted scopes, owned-project read, reversible write, actual refresh and revoked-token rejection.
