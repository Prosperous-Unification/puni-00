## ADDED Requirements

### Requirement: Import with AI guidance previews and reconciles a one-time copy

The canonical `docs/import-with-ai.md` guide SHALL explain how to connect an AI client to the verified public WBS MCP URL, authenticate with read/write scope, inspect source material without modifying it, preview the mapping, obtain user approval, import and read back the result. It SHALL create a new WBS project by default and present append as an explicit choice. It SHALL include the copyable import prompt specified in the change design, source-specific preparation for Jira, Linear, Asana, MS Project XML/CSV and spreadsheets, and troubleshooting for connection, login, scope and rejected-import failures. It SHALL not instruct users to copy browser tokens, infer story-point-to-day conversion, promise `.mpp` support or silently discard unsupported fields.

#### Scenario: A source mapping is ambiguous

- **GIVEN** a source with story points, unknown estimates or unsupported dependency types
- **WHEN** a user follows the prompt before approving a write
- **THEN** the client previews the ambiguity, preserves unknowns and asks before conversion
- **AND** unsupported records are listed rather than silently omitted

#### Scenario: An uncertain import response is reconciled

- **GIVEN** a timed-out import or command batch with an unknown outcome
- **WHEN** the guide's recovery steps are followed
- **THEN** the project is read back before retrying to avoid duplicate work
- **AND** final counts, hierarchy, estimates and dependencies are reported with omissions and a project link

### Requirement: Client support claims carry evidence

The guide SHALL have a per-client row for Claude Code, Claude Desktop, claude.ai, ChatGPT, Cursor desktop, VS Code Copilot, Codex CLI, Gemini CLI, Windsurf, JetBrains AI Assistant, Junie CLI, Zed, Cline, Roo Code, Continue, Goose, Warp desktop, Amazon Q Developer CLI, GitHub Copilot in JetBrains, LM Studio, Raycast, Perplexity, Mistral Le Chat / Work and Microsoft Copilot Studio. Each row SHALL carry documented, bridge fallback or unverified status, a version/date where checked, and client-specific connection constraints. It SHALL mark a client **WBS import tested** only after a recorded live public connection with client version, exact callback, registration method, requested/granted scopes, owned-project read, reversible write, actual refresh and revoked-token rejection.

#### Scenario: Documentation exists without interoperability proof

- **GIVEN** a vendor documents remote MCP but no live WBS write/refresh record exists
- **WHEN** the guide lists that client
- **THEN** it may say documented but SHALL not say WBS import tested

#### Scenario: A client needs a bridge

- **GIVEN** a desktop client whose native OAuth is not established
- **WHEN** its row offers a stdio bridge
- **THEN** the guide identifies a pinned, tested bridge and its explicit read/write scope request
- **AND** it does not claim that hosted clients can use the desktop bridge
