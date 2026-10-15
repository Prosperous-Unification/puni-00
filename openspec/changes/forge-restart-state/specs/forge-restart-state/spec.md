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
