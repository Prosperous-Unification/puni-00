## ADDED Requirements

### Requirement: Container-local Nx ownership

The forge source container SHALL set `NX_WORKSPACE_DATA_DIRECTORY` to `/tmp/puni-forge-nx/workspace-data` in its writable layer and SHALL retain `NX_DAEMON=false`. No volume SHALL cover the private state directory. The Pod SHALL retain its 2Gi memory limit, 768Mi memory and 250m CPU requests, and Restricted container security settings.

#### Scenario: Existing worktree ownership

- **WHEN** the mounted worktree contains a live or reused-PID ownership record for a continuous task
- **THEN** the container's installed Nx starts its own task using private workspace state without modifying the mounted worktree's ownership database

#### Scenario: Automatic container restart

- **WHEN** the forge container terminates and Kubernetes replaces it within the same Pod
- **THEN** its writable layer contains fresh Nx workspace state and previous-container ownership does not suppress task launch

### Requirement: Recovery evidence remains bounded

The regression fixture SHALL use installed Nx ownership and continuous-task execution, verify the existing ownership conflict without the private setting, and bound subprocess lifetime and process-group cleanup. Recovery documentation SHALL distinguish ownership recovery from the unresolved cold-start OOM at 2Gi.

#### Scenario: Private setting removed

- **WHEN** the private workspace setting is removed from the effective overlay
- **THEN** the real Nx fixture waits on the conflicting ownership and fails its independent-start assertion within its deadline

### Requirement: First-attempt recovery rehearsal

The bounded Bun rehearsal SHALL retain the first cold startup outcome and node memory observations separately from later PID1 recovery and checker outcomes. Overall acceptance SHALL require readiness without any first-container restart or OOM. Missing required evidence SHALL fail acceptance. It SHALL refuse a different Pod UID, an unchanged container identity, or a non-incremented restart count as recovery.

#### Scenario: Cold OOM followed by automatic readiness

- **WHEN** the first container OOMKills and a later container becomes ready
- **THEN** cold startup and overall acceptance fail while the later readiness remains recorded

#### Scenario: Replacement identity is foreign

- **WHEN** recovery observes a foreign Pod UID or unchanged container identity
- **THEN** the recovery verdict fails within its deadline

### Requirement: Independent ingress and cleanup verdicts

The rehearsal SHALL save the exact NetworkPolicy spec, deny ingress, require a nonzero full checker attributable to ingress, restore and read back the exact saved spec, and rerun the full checker successfully. An index, MCP, gateway or browser ingress failure is admissible evidence. Omitted negative checks or restoration mismatches SHALL fail acceptance. Cleanup SHALL always run, report its own verdict, and verify absence of owned namespace, claim Leases and lab-labelled resources.

#### Scenario: MCP is the first denied route

- **WHEN** the denied full checker first fails at the MCP origin challenge
- **THEN** the ingress negative succeeds and exact restoration and restored positive still run

#### Scenario: Restoration differs

- **WHEN** policy readback differs from the saved spec
- **THEN** restoration fails and overall acceptance fails even if a later checker succeeds
