## Why

WBS070.14's 2026-10-15 disposable F9 acceptance found two distinct failures: the first cold container was OOMKilled at the committed 2Gi limit, then its automatic restart waited on four Nx serve ownership records persisted under the mounted worktree's `/src/.nx`. Installed Nx 23.2.1 tracks continuous tasks there even with `NX_DAEMON=false`.

## Outcome

Forge containers use `NX_WORKSPACE_DATA_DIRECTORY=/tmp/puni-forge-nx/workspace-data` in their writable container layer. A replacement container starts with fresh ownership state and can launch its own tasks independently of the mounted worktree's existing Nx ownership. The original worktree database remains untouched. Keep daemon disabling explicit.

## Non-Goals

Fixing or claiming resolution of cold-start OOM, changing `bin/dev.sh`, concurrency, memory limits, the source Dockerfile, shared Compose deployment, task caches, or broad `nx reset`. This change does not establish complete F9 acceptance.

## Constraints

Keep the 2Gi limit, 768Mi/250m requests, Restricted security settings and exact mounted roots. No volume, including `emptyDir`, may cover the private workspace state: such a volume survives container restart within the same Pod. Prove the behavior with installed Nx continuous-task ownership, a bounded subprocess fixture, effective bound overlay assertions, and a removed-setting negative. Keep cold-start failure evidence distinct from recovery evidence.

## Capabilities

### New Capabilities

- `forge-restart-state`: container-local Nx ownership for source-run forge recovery.

## Bounded rehearsal diagnostic extension (2026-10-16)

Add a reusable Bun driver for an owned disposable app lab. Preserve the first fresh-worktree startup, including OOM/restart history and node cgroup memory/RSS samples; independently report cold readiness, PID1 replacement, full checker, denied ingress, exact restoration, restored checker and cleanup. An overall pass requires all stages, including a first container reaching readiness without restart. Keep the production checker, source image, resource limits and startup behavior unchanged. Missing observations fail closed; warm retries cannot replace first outcomes. This is diagnostic tooling, not an OOM fix.
