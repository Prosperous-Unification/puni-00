# Deny language-service loaders in preparation-built compilers

Preparation-built PUNI providers retain strict unresolved-import refusal and use a separate, byte-pinned TypeScript transform that disables its unused language-service plugin loader before filesystem resolution. PUNI's compiler operations already use createProgram with explicit hosts and must not execute candidate compiler plugins; the generic vendor loader is outside that contract.

Allowing opaque vendor imports through Bun's build-global setting would also weaken first-party import checks. Keeping the generic loader as an unconfined runtime exception would make a stronger closure claim than the code supports. The narrow denial preserves normal compiler extraction while making the unsupported capability fail explicitly; direct upstream and transformed sentinel controls establish that boundary.

This transform has its own upstream/output identities and delivered license/modification notice. It does not modify installed TypeScript or the historical [paths-observation derivative](0055-observe-paths-attempts-inside-the-pinned-compiler.md). A compiler upgrade requires reviewing and repinning the exact loader transform. The sealed builder remains a source/dependency-byte boundary, not an execution sandbox for approved provider code.
