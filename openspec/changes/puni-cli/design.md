## Context

At `origin/main` d49fdad84 the three CLIs already use Optique 1.3.6. They expose `navigatorParser`, `dashParser` and Burokrat's `installedGrammar.parser`. The installed Burokrat grammar differs from its source validator grammar. Dash performs additional coherence validation after parsing and keeps a lazy MCP-token execution path. Burokrat verifies a packaged toolkit and then executes its validator or hashed launcher. Application/product lint boundaries forbid unrestricted app-to-app imports.

## Goals / Non-Goals

Compose a discoverable, installable PUNI command without changing who owns planning, static judgment and runtime effects. Embed client operations, preserving existing failure, trust and startup contracts. Historical records remain verifiable; source checkout paths and legacy binaries are absent from the final client interface.

## Decisions

**C1. Public spelling.** The user-specified canonical namespaces/aliases are binding. Optique is the intended library, consistent with ADR 0064. Root-only usage failures exit 2; known namespaces retain their existing exit contracts, including Dash non-release `ops` exit 64. Diagnostics identify `puni` and the selected canonical namespace.

**C2. Composition and ownership.** `apps/puni/cli` owns the root parser, dispatch and installation. Existing providers publish separate grammar and runtime facades through exact `@puni/<tool>/grammar` and `@puni/<tool>/runtime` aliases. Their implementation remains provider-owned. `apps/puni/eslint.product.mjs` follows the existing judge-facade precedent: exact grammar aliases only for root grammar composition, exact runtime aliases only for dispatch, and a separate packaging facade only where the builder requires one. All inherited ring/runtime/product/scope constraints remain in force. A real boundary fixture must reject private provider imports and runtime imports from the grammar file.

**C3. One grammar.** The root composes real typed grammars through Optique commands with aliases, not remainder-argv forwarding. Complete the seven delegated Burokrat grammars from `twilight-cli-optique` 3.4. Dash's current coherence rules become a shared validation function invoked by every executor path. Context-aware formatting supplies the actual invocation prefix rather than rewriting an already formatted error string.

**C4. Import-safe execution.** Provider startup moves behind `import.meta.main`; exported executors accept typed requests and explicit invocation context. The root dynamically imports only the selected runtime. Burokrat uses its installed executor and verified toolkit boundary, never a direct source-validator shortcut. Navigator remains offline; Burokrat grammar/help reads no clock or authority state. Tests inject external IO only at existing boundaries.

**C5. Installed runtime.** The PUNI builder creates Bun-targeted assets from the provider facades, alongside their required non-code assets and trusted dependency closure. Paths resolve from the installed artifact. The public package exposes only `puni`; new package/release names use PUNI. Transitional old entrypoints exist only while callers migrate and are removed from final bins/current client docs.

**C6. Helpers and secrets.** Pool import receives `[process.execPath, installedEntrypoint, 'dash']` as helper prefix and appends `mcp token`. Alias choice does not leak into generated integrations. Preserve shell quoting for external client configuration formats that require a command string; the first-party executed helper itself is Bun. Exercise the actual stored invocation with paths containing spaces and secret sentinels.

**C7. Trust migration.** The Bun launcher/bootstrap port is coordinated with `bun-scripts`. Changed role bytes, role filenames or descriptor shape produce a new toolkit/release/activation version; supported historical decoders verify old bytes without relabeling/re-hashing them as a new release. Installed validation, trusted-toolkit closure checks and candidate isolation remain before execution. Tamper and candidate-controlled-environment negatives must survive through the packaged root.

**C8. Client inventory.** Client exposure means an operation appears in current installation/operation instructions, is emitted into a client integration, or ships as an executable asset. Such operations get an owning namespace and installed-artifact test. Internal development/CI/gate scripts still convert to Bun under `bun-scripts`; no operation is omitted merely because its old entrypoint lived in `tools/` or an application directory.

## Risks / Trade-offs

Importing provider runtimes during grammar construction would break help isolation and token-helper startup. Generic app allow rules would weaken boundaries. Renaming toolkit files without a new identity would invalidate historical trust. Static command inventories can miss generated/embedded scripts, so acceptance compares concrete consumers and generated artifacts with the inventory.

## Migration Plan

Land provider facades and root grammar, then import-safe lazy execution, complete delegated grammars, Bun trusted packaging, client-operation embedding, consumer/name migration and installed verification. Retain migration scaffolding only until its callers move. Run each provider's existing tests, root packaged tests, boundary negatives and required gates. No package publication or deployment result is inferred from local build success.

## Open Questions

None blocking implementation. Assumptions C1–C8 are recorded under the user's instruction to proceed proactively; discovered contradictions are resolved against the explicit goal and current contracts with a recorded ruling.
