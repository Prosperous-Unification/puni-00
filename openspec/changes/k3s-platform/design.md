# Design

F3, F6, F7, F9, F10, and F12 of [the fleet plan](../../../docs/superpowers/plans/2026-09-17-k3s-fleet.md) implement this change. Ansible owns operating-system and k3s state. Flux owns controllers and long-lived Kubernetes objects after bootstrap, ordered through explicit dependencies.

Ordinary namespaces enforce Restricted Pod Security, quotas, dedicated service accounts, default-deny network policy, and no worker API token. The solver backend and source-run forge use separate trusted namespaces with admission limited to exact host roots, controller identities, approved digests, and capable nodes. Local k3d proves application/platform paths; disposable Ubuntu VMs prove Ansible/systemd/firewall/host-mount paths.

Recovery begins from recorded k3s token, SOPS key, toolchain, desired fleet, and backup manifests, then proves infrastructure and application state including known WBS rows, migrations, registry pulls, Elastic queries, and admission policy.
