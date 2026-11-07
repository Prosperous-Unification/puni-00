---
status: proposed
---

# Bind PostgreSQL workflow-store locks to their physical namespaces

A new physical store needs writer exclusion before metadata exists. Proposed: one explicitly configured PostgreSQL schema per store, with the same database-scoped, single-bigint transaction advisory lock derived from that schema name for bootstrap, ordinary writes and controlled maintenance. Retain and verify the derivation version/key with a fresh private incarnation UUID; bind each opened bundle to that incarnation. This completes a proposed private protocol under [ADR0069](0069-postgresql-is-the-second-workflow-store.md), without changing public identities.

## Considered options

| Option                                                      | Benefit                                                                                  | Cost                                                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Schema-derived advisory key, retained and revalidated       | One lock works before and after metadata creation; no shared registry or lock-order pair | Derivation and namespace naming become format commitments; every writer must cooperate      |
| Random retained advisory key plus a separate bootstrap lock | Random keys keep ordinary stores independent                                             | Two coordination identities and a handoff; metadata absence cannot supply the ordinary lock |
| Shared registry plus metadata-row locks                     | Database rows enforce a clear retained lock point                                        | Registry bootstrapping, cross-store lifecycle and permissions become shared dependencies    |

Recommend the first option. Digest collisions only add serialization; qualified namespace access and exact retained-byte comparison still select the store and semantic records. Locking is not execution ownership and cannot stop an administrator who bypasses the protocol. Before ordinary use, the [physical-store design](../../openspec/changes/workflow-postgres-provider/physical-store-design.md) requires real process, corruption, rollback and durability proofs. No operator migration, schema creation or production selection is authorized by this proposed ADR.
