# Twilight Structure

Start with the [delivery plan](../../openspec/changes/twilight-control-plane/tasks.md).
It builds the smallest usable FE/BE/MCP loop, then adds the client-repo planning
backend and full factory capabilities in dependency order.

Current outcome: the first SDLC was tried on this request, and the plan was reviewed
and revised through Claude Fable 5.1 with no remaining blocking correction. The
[verification record](../../openspec/changes/twilight-sdlc-pilot/verify.md)
separates observed checks from future runtime tests. Product code is not implemented.

The subsequent [branch-review hardening](../../openspec/changes/twilight-review-hardening/proposal.md)
amends the proposed contracts and repairs the repository workflow. The earlier
review receipts describe their original snapshots; current acceptance obligations
are in the linked design/specs/tasks.

| Need                                           | Read                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| What the user asked for                        | [Requirement catalog](spec.md)                                                  |
| Chosen working answers and reopen conditions   | [Assumptions](assumptions.md)                                                   |
| How the SDLC is run                            | [Stages and focus profile](sdlc-stages.md)                                      |
| What end users operate, configure, and inspect | [Product experience](product-experience.md)                                     |
| How clients and puni-00 share the setup        | [Client repositories and Backlog-backed WBS](client-repositories.md)            |
| Runtime architecture and first contracts       | [Control-plane design](../../openspec/changes/twilight-control-plane/design.md) |
| What we borrowed, rejected, or need to prove   | [Research index](research.md)                                                   |
| How knowledge stays navigable and trustworthy  | [Wiki maintenance](knowledge.md), [repo wiki](../wiki/README.md)                |
| Domain words                                   | [Twilight glossary](CONTEXT.md), [context map](../../CONTEXT-MAP.md)            |

Next execution starts with Task 1 of the delivery plan. The Backlog/WBS storage
migration has an explicit prerequisite: the WBS refactor landing revision and
its verified repository interface. No migration is performed by this trial.
