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
const harness = createClaudeCode({ port: 4123, portEndpoint: { url: 'ws://127.0.0.1:4123' } });
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
