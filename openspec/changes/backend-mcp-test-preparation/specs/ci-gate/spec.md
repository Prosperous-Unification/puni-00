## ADDED Requirements

### Requirement: Backend tests prepare their MCP source document

Backend full, unit and store test targets SHALL require the local noncached prepare-mcp-document target, invoking the unchanged DB-free emitter and declaring the MCP source document output. Producer failure SHALL prevent the consuming test; no BE-to-MCP task or project edge SHALL be added.

#### Scenario: Source document is absent

- **WHEN** an ordinary Nx backend test invocation selects the existing Swarm case from an absent generated-document state
- **THEN** the local producer runs before the real MCP child and the selected scenario succeeds
- **AND** omitting the prerequisite reproduces the real missing-document failure; exact restoration recovers success

### Requirement: Backend test hashes and affected selection bind spawned production code

The three consuming targets SHALL include the finite actual MCP/Dash production closure and producer/shared contract descriptors through direct named inputs and existing sound dependency inputs. Ignored generated JSON and unrelated test files SHALL NOT be added to the new family. Backend cache policy, existing inputs and graph acyclicity SHALL remain intact.

#### Scenario: Consumed runtime or descriptor changes

- **WHEN** a representative emitter, shared descriptor, MCP runtime/SQL asset or Dash token-helper changes
- **THEN** actual native Nx task hashes and production affected selection account for that consumer
- **AND** unrelated MCP-test selection remains equal to the inherited graph with only the new family removed

### Requirement: MCP preparation shares one backend-owned emitter

MCP prepare callers SHALL retain their ordinary target while MCP:prepare becomes a noncached nx:noop alias depending only on backend prepare-mcp-document. The combined backend/MCP ordinary test graph SHALL be acyclic and contain exactly one emitting task, preserving the existing MCP-to-backend dependency direction.

#### Scenario: Both ordinary test owners are scheduled

- **WHEN** native Nx builds the combined backend and MCP test task graph
- **THEN** both prerequisite paths coalesce at the same backend emitting task
- **AND** restoring an independent MCP emitter makes the owning graph negative fail
