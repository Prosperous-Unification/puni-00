---
status: accepted
---

# Public and private monorepos share a portable project contract

Dany chose a private companion repository, `puni-pr-00`, on 2026-09-27 and required projects to be copyable between it and `puni-00` on demand. Both repositories will use the same relative project layout and a versioned management baseline so a project and its declared local dependencies retain their source paths, Nx targets and compatible toolchain when transferred. This replaces the standalone `puni-site` destination for the licensed Astro/Novaform website; its new home is `puni-pr-00/apps/website/site`.

## Considered options

- **Managed private checkout inside `puni-00`:** convenient from one working directory, but source discovery, credentials, build artifacts and publication need separate treatment inside a public workspace. Current project discovery is rooted in local `apps`, `libs` and `tools`; an arbitrary nested checkout is not an established managed-project interface.
- **Private companion with independently copied configuration:** preserves privacy but allows gates, dependency versions and project conventions to drift, undermining copyability.
- **Private companion consuming the same versioned baseline:** selected. A pinned, explicitly inventoried set of shared tooling/configuration has one update path; repository identity, visibility, product inventory, credentials and deployment settings remain repository-specific. This follows the [client repository template contract](../twilight-structure/client-repositories.md#template-contract), whose complete implementation is still future work.

## Consequences

Copying means transferring the selected project and its declared local dependency closure at unchanged `apps/` and `libs/` paths. Shared configuration versions, package requirements, aliases and target semantics must be compatible; collisions and missing dependencies are reported before modifying the destination. A clean-clone acceptance fixture must prove transfers in both directions with the same test, lint, typecheck and build commands.

The repositories have independent Git histories, CI credentials, protected release environments and source revision receipts. Public CI must work without private credentials. A repository-management entrypoint can delegate a private build using explicit authorization and pinned revisions; it must not silently include private sources in a public scan, cache, artifact or release. Novaform and any project depending on its restricted source remain private and are ineligible for public promotion.

Creating the private repository establishes its ownership and visibility only. Bootstrap, shared-baseline extraction, bidirectional transfer tests and release integration must pass before claiming that projects are portable. Existing `puni-site` is left unchanged; no repository deletion or history rewrite is part of this decision.
