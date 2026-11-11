## Context

An initial read-only scan at d49fdad84 found 302 candidate files: 256 runtime candidates, 22 verification candidates, 3 historical candidates, 14 browser candidates and 7 configuration candidates. This is a seed, not a completeness proof: filename/shebang/main detection misses generated script strings, inline CI/Ansible logic and unrecognized entrypoints. `script-inventory.md` retains the seed and the limitations; executable acceptance requires the complete consumer inventory.

## Goals / Non-Goals

Convert all first-party executable logic to Bun, including internal CI/dev/gates, while the linked `puni-cli` change embeds client operations. Preserve ownership, trust, process lifetime, argument boundaries and safety behavior. Browser code, third-party executable implementations, declarative configuration and historical evidence are not language-port targets.

## Decisions

**B1. Scope assumption.** The broader reading of the request includes first-party internal scripts, not only shipped client scripts. Runtime entrypoint content and active consumers determine scope, not extension alone. A Bun-supported `node:` import is supported library usage, not a Node executable requirement.

**B2. Inventory ownership.** Track each executable's owner, current runtime/callers, replacement, client exposure and verification. Include package/Nx/CI/container/Ansible callers, remote payloads and generated helpers. Classification and validation are production code with controlled fixture repositories that exercise unknown/new/generated entries. Historical/adversarial script bytes are explicitly modeled test inputs; they are not accepted as new active shell implementations or shipped client launchers.

**B3. Process behavior.** Use Bun process/file APIs with explicit argv and environment. Model success, expected nonzero outcomes, cancellation and bounded convergence explicitly. Missing required tools and malformed/unreadable trusted state fail. Keep secret-bearing input out of diagnostics. Preserve signal forwarding, child ownership and cleanup across process trees; a port that only spawns the old shell/Node body is incomplete.

**B4. Gate ownership and locking.** Port gate and heavy-lock semantics together before switching callers. Retain checkout under the host-wide lock, complete pinned-SHA receipt, frozen install, required full checks, queue bounds, permission/dirty-tree refusals and cleanup on cancellation. Use host-supported exclusive-lock primitives through an explicit owned process/descriptor lifetime rather than an existence-only lockfile. Rehearse competing processes and injected child/cleanup failures.

**B5. Deployment recovery modes.** Ordinary additive migrations keep full applied-name/hash capture and exact-addition reversal with final ledger comparison. Explicitly approved stop-the-world windows retain their specified snapshot/previous-code restoration sequence and writer exclusion; they do not attempt ordinary additive rollback. Every failed recovery is loud and names the pinned manual completion procedure. Language conversion changes no migration policy.

**B6. Trusted toolkit and remote bootstrap.** Coordinate the Bun launcher with `puni-cli`'s new artifact identities; historical trusted bytes retain their old identity. Remote first-party scripts require Bun before execution, without a hidden Bash fallback. External tools remain explicit prerequisites, and their exit codes prove only their documented contracts. Bootstrap, installation and generated payload tests exercise the delivered bytes and path selection.

## Risks / Trade-offs

Locks, signals, shell quoting, env inheritance and working-directory assumptions are behavior, so direct translation without process-level tests is insufficient. First-party shell fragments hidden in YAML or generated strings require consumer traversal. Tests that intentionally supply hostile/historical scripts need explicit fixture classification without a broad executable exemption.

## Migration Plan

Complete inventory and production coverage guard, introduce shared process/file primitives as their first consumers require them, then port gate/locks, development/release operations, trusted toolkit/bootstrap, infrastructure/remote/application operator scripts and verification runners. Switch each consumer only after its controlled rehearsal and negative proofs pass. Embed client operations through `puni-cli`. Finish with an active-consumer census and exact-commit gates; remove old active script bodies only after callers move.

## Open Questions

None blocking implementation. B1 records the proactive scope assumption. Host-specific observations and actual activation receipts are verification work, not assumed from local tests.
