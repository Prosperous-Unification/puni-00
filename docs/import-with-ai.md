# Import a project into WBS with an AI client

This guide takes an existing project — from Jira, Linear, Asana, Microsoft Project or a
spreadsheet — into a **new** WBS project through an AI client connected to WBS over MCP. It is a
one-time copy, not a synchronization: later changes to the source do not reach WBS, and WBS never
writes to or deletes from the source. The editor's **Export / Import → Import with AI** opens the
short version of these steps and copies the same prompt.

**Status on 2026-09-27.** No client is marked **WBS import tested**. The public MCP address is
not published yet, so every snippet below writes it as `<WBS_MCP_URL>`; this guide will name it
once the production overlay serves it and a live sign-in, write and refresh through it has been
recorded. Until then the table says only what each vendor documents and what the WBS server
accepts.

## What the WBS server accepts

These are the rules the MCP server enforces today (`apps/wbs/mcp-01/src/oauth.ts`); a client
that breaks one fails at sign-in, not later.

- **Transport:** Streamable HTTP at `<WBS_MCP_URL>`. There is no SSE-only endpoint and no stdio
  server; a client that speaks only stdio needs the [bridge](#desktop-bridge-for-stdio-only-clients).
- **Sign-in:** OAuth 2.1 authorization code with PKCE (`S256`), found by discovery
  (RFC 9728 protected-resource metadata, then RFC 8414 authorization-server metadata). The
  client registers itself by dynamic client registration as a public client
  (`token_endpoint_auth_method: none`); there is no client secret to type in and no token to
  copy. You sign in to WBS in the browser; the client never sees your WBS password.
- **Scopes:** `wbs:read`, `wbs:write` and `wbs:editor`. **An authorization that names no scope
  defaults to `wbs:read`**, and a read-only grant cannot import. Request
  `wbs:read wbs:write`. Most clients ask for every scope WBS advertises, write included; the
  table says where a client needs its scopes set by hand. WBS grants only the scopes your WBS account holds; signing in does not
  widen them.
- **Callbacks (redirect URIs):** a registration is accepted only when every redirect URI is one
  of:
  - a loopback address spelled literally — `http://` or `https://` with host `localhost`,
    `127.0.0.1` or `[::1]`, any port from 1 to 65535, any path, and no `code`, `state`, `iss`
    or `error` query field of its own;
  - or exactly one of these hosted callbacks: `https://claude.ai/api/mcp/auth_callback`,
    `https://claude.com/api/mcp/auth_callback`, `https://vscode.dev/redirect`,
    `https://www.perplexity.ai/rest/connections/oauth_callback`,
    `https://enterprise.perplexity.ai/rest/connections/oauth_callback`.

  Anything else is refused with `invalid_redirect_uri`: a custom scheme such as `cursor://…`,
  ChatGPT's callbacks, and every installation-specific hosted callback (Copilot Studio,
  Mistral, hosted IDEs) until a reviewed entry is added for it.

- **Session length:** access tokens last an hour by default and refresh; a refresh family lasts
  at most 30 days, or 14 days unused. Then the client asks you to sign in again.
- **Organization:** an import must name its destination WBS organization and your current
  WBS role there before anything is written, and **switching organizations requires fresh MCP
  authorization**: disconnect, then sign in again for the other organization. The current MCP
  release does not yet bind a grant to an organization or report one through its tools, so the
  prompt's organization check below cannot pass yet and a client following it stops before
  writing. That is intended until organization-bound grants ship.

## Steps

1. **Choose a client** from the [table](#client-support) and add the WBS server as its row and
   linked vendor page show.
2. **Sign in and confirm access.** Start the client's sign-in, log in to WBS in the browser and
   approve. Then ask the client to list your WBS projects. Confirm the destination organization
   the sign-in is bound to, your current WBS role in it (it must allow creating projects), and
   that the grant includes `wbs:write` — a successful list proves only `wbs:read`.
3. **Provide the source** as [prepared below](#prepare-the-source).
4. **Copy the [prompt](#the-import-prompt)**, fill in its brackets and send it. Review the
   mapping preview it returns: destination organization and role, hierarchy, steps, estimates
   and units, dependencies, people, dates, source references, and what it cannot map.
5. **Approve** the named destination organization and the write. The client creates a new WBS
   project (appending to an existing one only if you explicitly ask), then reads it back and
   reports what it imported, omitted and could not resolve, with the project link. Open the
   project and check the reconciliation against it.

## The import prompt

Copy the block as it is and fill in the bracketed fields. The editor's copy button hands out the
same text.

```text
Import `[source project/link/files]` into a new WBS project named `[name]` using the WBS MCP tools.

Confirm the destination WBS organization `[organization]` bound to my current MCP grant and my current WBS role. If it is wrong or cannot be verified, stop; switching organizations requires fresh MCP authorization.

First inspect the available tool schemas and source material. Read the source without modifying it. Show a concise mapping preview naming the destination organization, my role, and covering hierarchy, project steps, estimates and units, dependencies, people, dates and source references. List unsupported or ambiguous fields; do not silently discard them or invent estimates.

Use explicit day estimates only. Represent a single day estimate as equal optimistic/realistic/pessimistic values. Ask before converting hours or story points. Preserve unknown estimates as missing.

After I approve the preview and the named destination organization, use `postApiProjectsImport` for a complete valid WBS plan document. Alternatively, create the project and steps, then use `postApiProjectsByIdCommands` with ordered commands, `ref`, `parentRef`, `afterRef`, `workItemRef` and `predecessorRef`. Use `postApiDirectoryCommands` only for directory entries actually needed.

Respect request limits. Each command batch is atomic and one undo; multiple batches are not one transaction. Keep the returned ID mapping. After an uncertain timeout, read back before retrying to avoid duplicates.

Finally read back the project, reconcile counts, hierarchy, estimates and dependencies, and report imported, omitted and unresolved records with the WBS project link.
```

## Prepare the source

The client reads the source without modifying it. Keep source IDs: the prompt asks the client
to store them as external references on the imported items.

### Jira, Linear and Asana

Connect the source through the client's own supported integration (for example its Jira,
Linear or Asana connector), or attach an export (CSV or JSON) from the source. WBS has no
native adapter for these tools. Name the issue types or levels that make up the hierarchy.
Story points are not days: the client asks before converting them, and leaves an estimate
missing rather than inventing one.

### Microsoft Project

Export to XML (File → Save As → XML) or CSV. Native `.mpp` files are not supported. Say
whether durations are effort or elapsed time: WBS estimates are effort in working days, and a
duration is not an effort estimate.

### Spreadsheets

Export to CSV or attach the sheet. Tell the client which columns hold the hierarchy (an
outline number or parent column), the estimate and its unit, and the predecessors.

### Dependencies WBS cannot represent

WBS dependencies are finish-to-start between work items. Start-to-start, finish-to-finish,
start-to-finish, lags and leads are listed as unsupported in the preview and reported after the
import; they are not approximated.

## Client support

**Status** says what the vendor documents about connecting to a remote MCP server with OAuth,
checked against the WBS rules above on the date in **Checked**. It says nothing about a
successful connection to WBS:

- **Documented** — the vendor documents remote Streamable HTTP with OAuth sign-in, and nothing
  known conflicts with the WBS rules above; where the vendor publishes its callback, WBS
  accepts it.
- **Bridge fallback** — native remote OAuth is missing or unestablished; use the
  [desktop bridge](#desktop-bridge-for-stdio-only-clients).
- **Unverified** — documented in part, but the callback, registration or transport is not
  established or not accepted yet.
- **Unsupported** — WBS refuses the client's callback today.

A client becomes **WBS import tested** only after a recorded live connection naming the client
version and date, the exact callback, the registration method, requested and granted scopes,
the grant-bound organization and role observed at the live request, a read of an owned
project, a reversible write, an actual refresh and the rejection of a revoked token.

| Client                      | Status          | Checked    | Connect                                                                                                                                                                                                 | Callback and scopes                                                                                                                                                                  | Source                                                                                                                                                                                                                                                                                            |
| --------------------------- | --------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code                 | Documented      | 2026-09-27 | `claude mcp add --transport http wbs <WBS_MCP_URL>`, then `/mcp` or `claude mcp login wbs`                                                                                                              | Loopback `http://localhost:<port>/callback`, accepted. Requests the resource's advertised scopes unless `oauth.scopes` is set                                                        | [Claude Code MCP](https://code.claude.com/docs/en/mcp)                                                                                                                                                                                                                                            |
| Claude Desktop              | Documented      | 2026-09-27 | Customize → Connectors → Add custom connector → URL `<WBS_MCP_URL>` → Connect                                                                                                                           | `https://claude.ai/api/mcp/auth_callback`, accepted. Requests the advertised scopes. Anthropic's cloud connects, so the URL must be public                                           | [Custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) (updated 2026-08-11)                                                                                                                                                     |
| claude.ai                   | Documented      | 2026-09-27 | As Claude Desktop. On Team and Enterprise an Owner adds it under Organization settings → Connectors first; members then connect                                                                         | `https://claude.ai/api/mcp/auth_callback`, accepted                                                                                                                                  | [Custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) (updated 2026-08-11)                                                                                                                                                     |
| ChatGPT                     | Unsupported     | 2026-09-27 | Developer mode app with URL `<WBS_MCP_URL>` (Pro, Plus, Business, Enterprise, Edu)                                                                                                                      | `https://chatgpt.com/connector_platform_oauth_redirect` or `https://chatgpt.com/connector/oauth/{id}`; **WBS refuses both** until a live connection shows the exact URI              | [Developer mode](https://developers.openai.com/api/docs/guides/developer-mode), [ChatGPT auth](https://developers.openai.com/plugins/build/auth)                                                                                                                                                  |
| Cursor desktop              | Bridge fallback | 2026-09-27 | `.cursor/mcp.json`: `{"mcpServers":{"wbs":{"url":"<WBS_MCP_URL>"}}}`                                                                                                                                    | Registration by DCR includes `cursor://anysphere.cursor-mcp/oauth/callback`, which WBS refuses, so native sign-in fails; use the bridge                                              | [Cursor MCP](https://cursor.com/docs/mcp), [DCR callback report](https://forum.cursor.com/t/mcp-oauth-dcr-still-uses-custom-scheme-callback-on-3-13-25-breaks-standards-compliant-providers/167372)                                                                                               |
| VS Code Copilot             | Bridge fallback | 2026-09-27 | `.vscode/mcp.json`: `{"servers":{"wbs":{"type":"http","url":"<WBS_MCP_URL>"}}}`                                                                                                                         | Registration by DCR lists `https://insiders.vscode.dev/redirect` beside `https://vscode.dev/redirect` and loopback; WBS refuses the whole registration for the first. Use the bridge | [VS Code MCP servers](https://code.visualstudio.com/docs/agent-customization/mcp-servers) (updated 2026-09-16), [DCR source](https://github.com/microsoft/vscode/blob/main/src/vs/base/common/oauth.ts)                                                                                           |
| Codex CLI                   | Documented      | 2026-09-27 | `codex mcp add wbs --url <WBS_MCP_URL>` (signs in at once); again with `codex mcp login wbs --scopes wbs:read,wbs:write`                                                                                | Loopback `http://127.0.0.1/callback…`, accepted. `--scopes` or `scopes` in `config.toml` sets scopes                                                                                 | [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)                                                                                                                                                                                                                                |
| Gemini CLI                  | Documented      | 2026-09-27 | `settings.json`: `{"mcpServers":{"wbs":{"httpUrl":"<WBS_MCP_URL>"}}}` (`httpUrl` is Streamable HTTP; `url` is SSE), then `/mcp auth wbs`                                                                | Loopback `http://localhost:<port>/oauth/callback`, accepted. `oauth.scopes` sets scopes. Checks the `iss` WBS sends                                                                  | [Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server/) (2026-09-02)                                                                                                                                                                                                                       |
| Windsurf                    | Unverified      | 2026-09-27 | Now Devin Desktop. Cascade: `mcp_config.json` `{"mcpServers":{"wbs":{"serverUrl":"<WBS_MCP_URL>"}}}`; Devin Local: `devin mcp add wbs <WBS_MCP_URL>`, `devin mcp login wbs --scopes wbs:read,wbs:write` | Callback not published                                                                                                                                                               | [Cascade MCP](https://docs.devin.ai/desktop/cascade/mcp), [Devin CLI MCP](https://docs.devin.ai/cli/extensibility/mcp/configuration)                                                                                                                                                              |
| JetBrains AI Assistant      | Bridge fallback | 2026-09-27 | Settings → Tools → AI Assistant → Model Context Protocol → Add, Streamable HTTP, `{"mcpServers":{"wbs":{"url":"<WBS_MCP_URL>"}}}`                                                                       | No MCP OAuth yet (issue LLM-25012 open); use the bridge                                                                                                                              | [AI Assistant MCP](https://www.jetbrains.com/help/ai-assistant/mcp.html) (2026.2)                                                                                                                                                                                                                 |
| Junie CLI                   | Documented      | 2026-09-27 | `.junie/mcp/mcp.json`: `{"mcpServers":{"wbs":{"url":"<WBS_MCP_URL>"}}}`, then `/mcp` → wbs → Authorize                                                                                                  | Callback and scopes not published                                                                                                                                                    | [Junie MCP](https://junie.jetbrains.com/docs/junie-cli-mcp-configuration.html) (updated 2026-09-25)                                                                                                                                                                                               |
| Zed                         | Documented      | 2026-09-27 | `settings.json`: `{"context_servers":{"wbs":{"url":"<WBS_MCP_URL>"}}}` with no Authorization header                                                                                                     | Loopback `http://127.0.0.1:<port>/callback`, accepted. Requests the advertised scopes                                                                                                | [Zed MCP](https://zed.dev/docs/ai/mcp), [callback source](https://github.com/zed-industries/zed/blob/main/crates/oauth_callback_server/src/oauth_callback_server.rs)                                                                                                                              |
| Cline                       | Documented      | 2026-09-27 | `cline_mcp_settings.json`: `{"mcpServers":{"wbs":{"type":"streamableHttp","url":"<WBS_MCP_URL>"}}}`, then Authenticate                                                                                  | Loopback `http://127.0.0.1:1456–1461/mcp/oauth/callback`, accepted. Requests the advertised scopes                                                                                   | [Cline MCP](https://docs.cline.bot/mcp/mcp-overview), [OAuth source](https://github.com/cline/cline/blob/main/apps/vscode/src/services/mcp/McpOAuthManager.ts)                                                                                                                                    |
| Roo Code                    | Bridge fallback | 2026-09-27 | Discontinued 2026-05-15, repository archived. Last shape: `{"mcpServers":{"wbs":{"type":"streamable-http","url":"<WBS_MCP_URL>"}}}`                                                                     | Never gained MCP OAuth; bridge only                                                                                                                                                  | [Roo Code MCP](https://roocodeinc.github.io/Roo-Code/features/mcp/using-mcp-in-roo/) (2026-05-15)                                                                                                                                                                                                 |
| Continue                    | Bridge fallback | 2026-09-27 | YAML `mcpServers: [{name: WBS, type: streamable-http, url: <WBS_MCP_URL>}]`                                                                                                                             | Registers `http://localhost:3000` with a `state` query of its own, which WBS refuses; use the bridge                                                                                 | [Continue MCP](https://docs.continue.dev/customize/deep-dives/mcp), [OAuth source](https://github.com/continuedev/continue/blob/main/core/context/mcp/MCPOauth.ts)                                                                                                                                |
| Goose                       | Documented      | 2026-09-27 | `config.yaml`: `extensions: {wbs: {name: WBS, type: streamable_http, uri: <WBS_MCP_URL>, enabled: true, timeout: 300}}`                                                                                 | Loopback `http://127.0.0.1:<port>/oauth_callback`, accepted. Requests the advertised scopes                                                                                          | [Goose extensions](https://goose-docs.ai/docs/getting-started/using-extensions), [OAuth source](https://github.com/aaif-goose/goose/blob/main/crates/goose/src/oauth/mod.rs)                                                                                                                      |
| Warp desktop                | Documented      | 2026-09-27 | Warp Drive → MCP Servers → Add `{"wbs":{"url":"<WBS_MCP_URL>"}}`, or `.warp/.mcp.json`; sign-in opens the browser                                                                                       | Callback and scopes not published. Cloud agents not covered                                                                                                                          | [Warp MCP](https://docs.warp.dev/agents/capabilities/mcp/) (updated 2026-09-24)                                                                                                                                                                                                                   |
| Amazon Q Developer CLI      | Documented      | 2026-09-27 | Now Kiro CLI. `.kiro/settings/mcp.json`: `{"mcpServers":{"wbs":{"url":"<WBS_MCP_URL>","oauthScopes":["wbs:read","wbs:write"]}}}`                                                                        | Loopback `http://127.0.0.1:<port>`, accepted. **Set `oauthScopes`**: the default asks for OIDC scopes WBS refuses                                                                    | [Kiro MCP configuration](https://kiro.dev/docs/mcp/configuration/) (updated 2026-09-25)                                                                                                                                                                                                           |
| GitHub Copilot in JetBrains | Unverified      | 2026-09-27 | Copilot Chat → Agent → tools → Add MCP Tools; `mcp.json`: `{"servers":{"wbs":{"url":"<WBS_MCP_URL>"}}}`                                                                                                 | DCR announced; callback not published. Bridge is an option                                                                                                                           | [Copilot MCP in JetBrains](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/extend-copilot-chat-with-mcp?tool=jetbrains), [OAuth changelog](https://github.blog/changelog/2025-11-18-enhanced-mcp-oauth-support-for-github-copilot-in-jetbrains-eclipse-and-xcode/) |
| LM Studio                   | Documented      | 2026-09-27 | `mcp.json`: `{"mcpServers":{"wbs":{"url":"<WBS_MCP_URL>"}}}`                                                                                                                                            | Loopback `http://127.0.0.1:33389/mcp-oauth-callback`, accepted. Scopes not published                                                                                                 | [LM Studio remote MCP](https://lmstudio.ai/docs/integrations/mcp-remote)                                                                                                                                                                                                                          |
| Raycast                     | Unverified      | 2026-09-27 | Install MCP Server → HTTP → URL `<WBS_MCP_URL>` → OAuth Dynamic → Sign In                                                                                                                               | Callback not published for MCP; accepted only if it is loopback                                                                                                                      | [Raycast MCP](https://manual.raycast.com/ai/model-context-protocol)                                                                                                                                                                                                                               |
| Perplexity                  | Documented      | 2026-09-27 | Settings → Connectors → Custom connector → Remote → URL `<WBS_MCP_URL>` → OAuth                                                                                                                         | `https://www.perplexity.ai/rest/connections/oauth_callback` and the `enterprise.` one, both accepted. Vendor page refused our fetch; callbacks from a partner guide                  | [Custom remote connectors](https://www.perplexity.ai/help-center/en/articles/13915507-adding-custom-remote-connectors), [Qlik guide](https://community.qlik.com/t5/Official-Support-Articles/Connect-Perplexity-ai-to-Qlik-MCP-server/ta-p/2552671)                                               |
| Mistral Le Chat / Work      | Unsupported     | 2026-09-27 | Admin: Connectors → Add Connector → Custom MCP Connector → name, URL `<WBS_MCP_URL>`                                                                                                                    | Hosted callback not published and not on WBS's list, so WBS refuses it until a reviewed entry is added                                                                               | [Mistral MCP connectors](https://docs.mistral.ai/vibe/work/connectors/mcp-connectors)                                                                                                                                                                                                             |
| Microsoft Copilot Studio    | Unsupported     | 2026-09-27 | Tools → Add tool → MCP → URL `<WBS_MCP_URL>` → OAuth 2.0 → Dynamic discovery                                                                                                                            | Installation-specific `https://global.consent.azure-apim.net/redirect/…`, not on WBS's list                                                                                          | [Copilot Studio MCP](https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-add-existing-server-to-agent) (updated 2026-08-19)                                                                                                                                                            |

### Desktop bridge for stdio-only clients

A desktop client that can start a local stdio server but cannot sign in natively can reach
WBS through [`mcp-remote`](https://github.com/punkpeye/mcp-remote), pinned to `0.14.3`
(published 2026-09-21). It speaks Streamable HTTP only, asks for `wbs:read wbs:write` itself,
and listens on `http://localhost:<port>/oauth/callback`, which WBS accepts:

```json
{
  "mcpServers": {
    "wbs": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@0.14.3",
        "<WBS_MCP_URL>",
        "--transport",
        "http-only",
        "--static-oauth-client-metadata",
        "{\"scope\":\"wbs:read wbs:write\"}"
      ]
    }
  }
}
```

Put the same `command` and `args` in the client's own stdio format. **This bridge has not yet
been run against WBS**, so a bridge fallback row is no more tested than the others. Hosted
clients (claude.ai, ChatGPT, Perplexity, Mistral, Copilot Studio) cannot start a local process
and do not get this fallback.

## Troubleshooting

### The client cannot connect

Check the URL ends in `/mcp` and uses `https`. Pick Streamable HTTP (often labelled "HTTP"),
not SSE. A registration refused with `invalid_redirect_uri` means the client's callback is not
one WBS accepts (see [the rules](#what-the-wbs-server-accepts)); a desktop client can use the
bridge instead, a hosted one cannot. `temporarily_unavailable` is a capacity limit: wait a
minute and retry.

### Sign-in fails

Sign in with the WBS account that should own the new project. `access_denied` after login
means the account holds no `wbs:read`, or login was cancelled. If the browser never returns to
the client, the client's callback listener was closed or blocked; restart the sign-in from the
client. After 30 days, or 14 days unused, sign in again. Never paste a token from the browser
into the client; if a client asks for one, use the bridge instead.

### Writes are refused for scope

A tool error naming `insufficient_scope` means the grant lacks `wbs:write`. Most clients request
the scopes the server advertises; some request none, which WBS reads as `wbs:read`. Set the
client's scope setting to `wbs:read wbs:write` where it has one, remove the connection, and
authorize again. If WBS still grants only `wbs:read`, your WBS account cannot write.

### The import is rejected

A rejected command batch writes nothing and names the first refused command with `at` and
`kind`; fix it and resend. A batch holds at most 200 commands, so a large plan is several
batches, and each batch is its own undo: batches are not one transaction. After a timeout,
read the project back before retrying, or the retry duplicates what already landed.
