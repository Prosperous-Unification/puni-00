## Slice 0 spikes, 2026-10-21

Run in a throwaway Bun project outside the workspace
(`bun init -y`, then `bun add --exact` of the pin set below), Bun 1.4.2, Node 24.20.0 for the
one cross-check. Sources are not kept in the repository; the commands and outputs are.

### 0.3 Pin set installs and typechecks under Bun

`bun add --exact ai@7.0.147 @ai-sdk/anthropic@4.0.84 @ai-sdk/openai@4.0.98
@openrouter/ai-sdk-provider@3.1.0 @ai-sdk/harness@1.0.158 @ai-sdk/harness-claude-code@1.0.162
@ai-sdk/harness-codex@1.0.160 @ai-sdk/harness-acp@1.0.97 @ai-sdk/code-mode@1.0.104
ai-sdk-sandbox-local@0.1.2 @agentclientprotocol/sdk@2.0.0 arktype@2.2.9 zod@4.6.7`:
28 packages, no peer warnings, exit 0.

One file importing every package, building a `createProviderRegistry` over Anthropic, OpenAI
and OpenRouter, resolving `anthropic:claude-opus-5-5`, and defining one `tool()` with a Zod
schema and one with an ArkType schema: `bunx tsc -p tsconfig.json` (TypeScript 5.9.3,
`strict`, `moduleResolution: bundler`) exit 0.

### 0.2 Code mode runs under Bun

`experimental_codeModeTool` inside `generateText` with `MockLanguageModelV3` emitting one
`code_mode` call whose `js` fetches two host tools and returns their difference, both tools
routed through `experimental_toolCallers`:

```
host tool calls: inv:sku_123,dem:sku_123
step0 tool parts: [{"type":"tool-result","toolCallId":"c1","toolName":"code_mode",...,"output":{"gap":8},"dynamic":false}]
final: done | steps: 2
```

Identical result under `node --experimental-strip-types`. Two facts for the adapter: the
tool's input field is `js`, not `code`; every public export carries the `experimental_`
prefix. Decision: code mode is available to the `api-model` adapter on Bun; the fallback in
design A6 is not needed.

### 0.1 Claude Code harness session on a local sandbox under Bun

`ai-sdk-sandbox-local` 0.1.2 implements the older sandbox surface (`getPortUrl`, no
`getPortEndpoint`), so the Claude Code harness takes its "basic sandbox" path and needs the
bridge port on the harness factory, not on `createSession`:

```ts
const harness = createClaudeCode({
  port: 4123,
  portEndpoint: { url: 'ws://127.0.0.1:4123' },
});
const local = createLocalSandbox({ cwd, ports: [4123] });
const net = await local.createSession();
const session = await agent.createSession({ sandboxSession: net });
```

Output: `harness session created` at 0.2 s with `sessionId`, `sessionWorkDir`,
`underlyingSession`; `destroy()` and `stop()` clean. The first attempt without the port
settings spent 49.6 s before refusing (the bridge's package install into
`<cwd>/claude-code-<id>/` happens before the check). The harness also warns: "The sandbox
implementation does not support configuring request transformations, so credential
brokering does not work. Falling back to less secure credential forwarding." On a local
sandbox that is acceptable: the host is the trust boundary.

**Not run:** a live prompt through the session. It would spend model tokens, which needs
Dany's explicit go. Until then 0.1 is open on the live half only; the Bun and sandbox half
is answered and design A7's fallback is not needed.

## Accepted plan reconciliation, 2026-10-21

Updated planning only: unified CTT hints; S7a/S7b delivery dependencies; immutable binding
manifests; worker/effect reconciliation; abstract persistence with SQLite as the current
adapter choice. Earlier spike observations above are retained as historical evidence.
They do not verify the new coordinator or prove live executor/recovery behavior.

Validation for this planning amendment:

- `bunx @fission-ai/openspec@1.12.0 validate twilight-agentic-workflows --strict`: exit 0, change valid. This validates this change only, not every unrelated OpenSpec in the monorepo.
- `bunx prettier@3.9.6 --check` on the changed Markdown: exit 0, all matched files use Prettier code style.
- WBS command-batch preflight: 129 resulting items, 117 dependency edges, no explicit dependency cycle; retained item IDs and existing unrelated plan content. Remote read-back verified all 31 note/name updates, six new items and 19 new dependency edges; 129 items, 117 edges, no schedule error.

No product implementation, deployment, paid prompt or runtime recovery test is part of
this documentation update.

## S0 execution baseline — 2026-10-22

User authorized the agentic-workflows foundation and an ongoing goal. Codex thread
`01a15f10-7287-7993-aa10-09e737cd64b4` works on `feat/agentic-foundation` in the isolated
`.worktrees/agentic-foundation` checkout, based on `origin/main` `d6f43af62`, with the
current `origin/plan/twilight-agentic-workflows` planning branch merged locally.

The separate multi-tenant workstream owns onboarding, login, machine credentials,
fleet identity provisioning, organization limits, compute providers and activation.
This work consumes those boundaries. Existing cross-project dependency and CTT library
implementations remain with their current sessions. Initial implementation is S0
RunStore/ArtifactStore semantics, memory conformance and SQLite durability (6a.1–6a.2).

Fresh preparation evidence:

- Live agentic project read: no step or subtree claims. No Codex agent person exists
  in the directory; the S0 parent notes record this session's ownership without using
  another fleet's person. Row `030.09` Dev is `in_progress`, confirmed by a fresh read.
- Bun `1.4.2`; locked OpenSpec `1.14.3`. OpenSpec status/apply identifies `sdd-lean`,
  ready, 2/35 tasks complete. Artifact readiness is not implementation completion.
- Initial frozen install failed with `EROFS accessing temporary directory`. With
  `BUN_TMPDIR=/tmp BUN_INSTALL_CACHE_DIR=/tmp/puni-agentic-bun-cache`,
  `bun install --frozen-lockfile` exited 0: 1801 installs across 1648 packages checked,
  no changes. No lockfile or dependency version changed.
- `bun test apps/twilight-structure/twilight-dash/cli/src/no-ambient-clock.test.ts
apps/twilight-structure/twilight-dash/cli/src/activation/observation-commands.db.test.ts
--timeout=60000`: 11 passed, 0 failed, 67 assertions, 1.73 seconds. This is the
  focused pre-change baseline, including absence/unreadability and bootstrap behavior.

Full host gate, CI, product implementation, R5 fault injection, live executor prompts,
deployment, second-provider durability and runtime recovery remain unverified here.
