# Tasks

- [x] F0 — Freeze fleet contracts, tool versions, and required inputs per [F0](../../../docs/superpowers/plans/2026-09-17-k3s-fleet.md#f0--freeze-contracts-inputs-and-tool-versions).
- [x] F1 — Define desired fleet, operation requests, and stable identities per [F1](../../../docs/superpowers/plans/2026-09-17-k3s-fleet.md#f1--define-desired-fleet-and-stable-identities).
- [x] F2 — Implement complete, fresh provider/Kubernetes observation per [F2](../../../docs/superpowers/plans/2026-09-17-k3s-fleet.md#f2--discover-the-fleet-without-turning-errors-into-absence).
- [x] F3 — Configure hosts and bootstrap/join k3s through Ansible per [F3](../../../docs/superpowers/plans/2026-09-17-k3s-fleet.md#f3--set-up-hosts-and-bootstrap-k3s-immediately). Live on the rootless QEMU provider of the lab helper: three-node worker and platform profiles, stable second pass, firewall reboot persistence, startup refusal and changed-policy activation (verify.md, 2026-09-18). The Multipass provider is not run live.
- [ ] F4 — Provision and enroll arbitrary nodes through persisted operation plans per [F4](../../../docs/superpowers/plans/2026-09-17-k3s-fleet.md#f4--provision-and-enroll-arbitrary-new-nodes). Implementation and local Terragrunt smoke tests are complete; the remote backend and real provider drill remain outstanding. Existing-SSH-host enrollment of a replacement node ran live in the QEMU lab with an idempotent re-apply.
- [ ] F5 — Drain, retire, replace, and upgrade with fencing and capability checks per [F5](../../../docs/superpowers/plans/2026-09-17-k3s-fleet.md#f5--drain-retire-replace-and-upgrade-without-fixed-hosts). Live in the QEMU lab: agent retirement with receipt and no re-registration after reboot, last-capability refusal, fenced dead-node replacement with a new identity and surviving service. HA control-plane removal, upgrade, PDB/local-PV/singleton drains and the dead Node cleanup remain open.

- [x] TG1 — Pin Terragrunt and test the exact source-free unit and executable/environment boundary.
- [x] TG2 — Route provision/destroy preparation, apply, import recovery, state, and output through Terragrunt; bind configuration in plans and preserve existing refusal cases.
- [x] TG3 — Rename fleet targets, update operator documentation, prove exact-release command behavior and failure guards, then run focused validation.
