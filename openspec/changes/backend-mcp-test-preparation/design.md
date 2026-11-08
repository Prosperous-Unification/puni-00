# Backend-owned producer and input closure

prepare-mcp-document reuses the unchanged BE emitter with its MCP source destination, cache:false and declared workspace-relative output. test, test:unit and test:store depend on this local target. MCP already depends on backend; adding a reverse task/project edge is avoided because affected selection projects task edges into project dependencies.

mcpAgentRuntime names the emitter and finite imported production closure from MCP main/loopback and Dash entrypoint's token branch, including imported SQL assets. Existing ^production covers shared aliases/document descriptors and sharedGlobals covers locked tooling. Consuming targets reference the family directly for hashes; ordering alone is insufficient. Unrelated tests/generated output are excluded. Existing Dash broad MCP inputs can independently broaden affected selection, so incremental equality must be compared to a detached graph removing only the new contribution; global unrelated-test exclusion is not claimed.

The local producer is required by the feature artifact-only MCP contract. Root independently ran unchanged main6bf with absent source document before/after and observed its existing Swarm selected case succeed through in-memory document generation. Producer backport applicability is withdrawn; cache-input closure applicability is a separately reviewed question.

## Single emitting task

MCP:prepare is a noncached installed nx:noop alias with its existing output declaration and an explicit dependency on BE:prepare-mcp-document. Existing MCP callers remain unchanged. The combined ordinary task graph has exactly one emitting task and no cycle; this removes the two-writer scheduling possibility without changing emitter or runtime code.
