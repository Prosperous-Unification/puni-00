# Observe paths attempts inside the pinned compiler

Retained TypeScript admission needs the actual `compilerOptions.paths` substitution attempt before the compiler probes its candidate. We build a separate deterministic derivative of the pinned `@typescript/old` 6.0.3 executable, with input and output SHA-256 pins and exact replacement counts, and preserve its Apache license and notice. A synchronous host observation can throw to stop resolution; its return value cannot replace a compiler result. Explicit caller origin distinguishes compiler options from the shared `typesVersions` implementation.

Public host probes lose substitution intent and may hide an escaping candidate behind directory checks or fallbacks. Reimplementing resolution would create a second authority for compiler order and normalization. The derivative preserves those compiler decisions at the cost of reviewing and repinning its transformation whenever the upstream executable changes. This first prerequisite emits only paths attempts and remains separate from extraction; it establishes neither resolution completeness nor authenticated runtime ownership.

The owned execution successor evaluates only authenticated captured CommonJS bytes in a fresh VM
context with its own intrinsics and in-context CommonJS objects, absent Node/Bun globals, denied
require and disabled dynamic code/import. Ordinary require or same-realm Function would activate
Node bootstrap and ambient IO before host selection; those alternatives are rejected. Unsupported
required VM policies refuse instead of falling back. The VM is IO composition for authenticated
compiler bytes, not a sandbox for candidate scripts. Full executing closure and protected executor
installation identity remain separate requirements.
