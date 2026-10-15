# Compose audits run in initialized containers

Compose backend admission audits the observed persistent mount namespace through fixed metadata-only Docker exec in already-initialized containers. Audited targets retain default capabilities and a private PID namespace. Docker init reaps forced scanner descendants; enabling it on existing Caddy, registry and backend containers requires attended recreation, which the swap never performs automatically.

A fresh Source rebind missed a retained private alias. A DAC_READ_SEARCH-only proc-root helper failed on shipped default-cap Caddy/registry; expanding helper capabilities was rejected. BusyBox find can return0 after stat failures, and timeout can orphan a grandchild. Verified private sessions, strict per-entry receipts, ACK/reap and bounded group cleanup address these observed contracts.

Source access is code-read-only rather than filesystem-enforced RO. Static exclusion assumes trusted nonadversarial quiescence, tasks retaining the Docker-created namespace, stable persistent aliases and no open deleted SQLite aliases; it does not claim hostile-process containment or protection against transient topology/inode ABA. [verifyContainerNamespace](../../tools/tool-remote-scripts/src/lib/mount-audit.ts) owns this protocol, and [the production runbook](../runbook-prod-deploy.md) owns the maintenance prerequisite and refusals.
