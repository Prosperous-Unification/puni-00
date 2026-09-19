---
status: proposed
---

# Services have a kind and one direction

Every service is one of four kinds: repository, resource-service, feature-service or delivery. Dependencies run one way, delivery to feature to resource to repository, with the pure domain library under all of them; layering is strict, so a feature-service never reaches a repository, no kind imports a sibling of the same kind from another module, and the same four kinds apply to the frontend and backend. Uniform rules with no judgment calls suit agent-written code, and a bypass would make a resource's invariants optional.

## Considered options

**Relaxed layering, where a feature may reach a repository when the resource-service would only forward.** Rejected because every exception needs a judgment, and the rule would then be unenforceable by a tool.

**Vertical slices with no uniform layers.** Rejected because the repository already has rings, ports and a unit of work that slices would cut across.

**Package by layer across the whole application.** Rejected because it hides user value, which is the organizing idea.

## Consequences

Plain create and rename operations take three hops. Dany chose that cost on 2026-09-19. A resource is an aggregate, not a table; table-sized resources would turn the layer into pass-through code.
