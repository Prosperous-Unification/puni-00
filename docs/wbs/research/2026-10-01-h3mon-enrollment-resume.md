# Proposed h3mon enrollment resume addendum

**Status: awaiting operator review; not an authorization to execute. No host,
secret, provider API or playbook action occurred while preparing this note.**

Task: **070.03, Register h3mon as the observability node**
(`23ebe0bf-1906-4918-b919-8927d1b8c808`). Its h4claw counterpart is 070.02;
conditional h2puni dev/autotest use is 070.04. The enrollment runbook's historical
“WBS 070.3” h2puni reference is stale and must not change this mapping.

Sources: [enrollment procedure](../../infra/enroll-h4claw-h3mon.md) and
[verification record](../../../openspec/changes/enroll-existing-hosts/verify.md).
This proposed addendum stays in research until the interrupted-run decisions are
approved; it does not replace the operational procedure.

## Recorded position, not a current host assessment

The real-host record is dated 2026-09-27. h4claw bootstrapped, repeated with
`changed=0`, passed its after-enrollment preflight and was Ready with
`puni.io/enrollment=pending:NoSchedule`. h3mon was unchanged. Both hosts had passed
before-enrollment preflight. Provider snapshots were absent; `/etc` tarballs,
a VictoriaMetrics snapshot and Docker inventories were recorded. The operator
session's permission policy refused CA-bound join-token transfer. h3mon join,
two-node validation, final preflight and steps 6–8 did not run.

The QEMU rehearsal and local automation tests establish procedure behavior on
fixtures, not the present state or recoverability of these hosts.

## Safe next checkpoint and missing decisions

**Next: Dany authorizes a read-only resume/state-refresh checkpoint. Do not start
with `join.yml`.** Confirm the reviewed checkout/controller pin, pinned host keys,
authorized account and existing inventory before using them. The historical run
used the operator laptop through h2puni; the runbook describes an h2puni controller.
Select the reviewed controller arrangement explicitly, without changing h2puni's
production/build/gate role.

Two prerequisites still need decisions or inputs beyond ordinary execution approval:

1. **Recovery baseline.** Obtain authorized provider access/tooling and exact server
   names, and approve the recovery baseline before further enrollment changes.
   Recommended: a verified pre-join h3mon provider snapshot and a clearly labeled
   post-bootstrap h4claw snapshot, with Dany explicitly accepting that the latter
   cannot recover h4claw's lost pre-enrollment state. This is a proposed amendment
   to step 3, not an assertion that its original prerequisite was met. Retain the
   original tarballs/inventories and record any new backup separately; do not
   overwrite the only pre-change artifacts by blindly rerunning step 3. If that
   baseline is not approved or cannot be established, hold. No automatic rollback
   or rebootstrap is proposed.
2. **Permitted token transfer.** Dany must authorize an operator-permitted path to
   populate the existing secured controller variables with h4claw's CA-bound join
   tokens and confirm the required escrow. The recorded policy refusal must be
   resolved, not bypassed through another agent, carrier or command. Do not print
   tokens in notes/logs, regenerate bootstrap credentials, or put secrets in git.

## Authorized checkpoints, in order

Each row needs Dany's authorization for that specific procedure step. Authorization
of a state refresh does not authorize snapshots, secret transfer, join, validation,
platform installation or reboot. The commands below are proposed, **not run**.

| Checkpoint                        | Authorized work                                                                                                                                                                        | Required evidence before continuing                                                                                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State refresh                     | Existing h4claw: after-enrollment preflight. Unchanged h3mon: before-enrollment preflight.                                                                                             | Expected machine IDs/private addresses, preserved listeners/containers, network/port suitability and trusted inventory. Stop on disagreement; do not rewrite inventory to bless an unexpected host. |
| Runbook step 3 recovery amendment | Establish and record the approved provider snapshots and retained application/config backups.                                                                                          | Snapshot identity, host identity, time, recoverable state and retention recorded without credentials. A post-bootstrap h4 snapshot is not labeled pre-k3s.                                          |
| Remaining step 4                  | Complete only the approved CA-bound token transfer into protected controller variables.                                                                                                | Operator confirmation of permitted transfer and secured storage; no token content in the verification note. Leave h4claw's enrollment taint intact.                                                 |
| Step 5                            | Join h3mon; repeat join; run two-node enrollment validation; run both-host after-enrollment preflight.                                                                                 | Second join `changed=0`; both nodes Ready with expected identities/addresses; prescribed validation succeeds before it removes taints; final preflight succeeds for both hosts.                     |
| Step 6                            | Check actual h3mon swap, cgroup memory cap and Kubernetes allocatable memory.                                                                                                          | `/swap.puni` 4 GiB active; `kubepods.slice/memory.max` equals physical capacity minus 1408 MiB; allocatable memory recorded. Preserve the runbook's no-pod-swap requirement.                        |
| Later step 8                      | After the separately authorized intervening platform work, reboot one host at a time and rerun after-enrollment preflight; compare preserved observability behavior with the baseline. | Ready state and preserved services survive reboot; Grafana/Victoria checks succeed. Record the actual evidence, not merely command exit codes.                                                      |

Stage-correct state-refresh commands, using the already reviewed controller function:

```sh
fleet_ansible --limit h4claw --extra-vars puni_preflight_stage=after-enrollment playbooks/preflight.yml
fleet_ansible --limit h3mon --extra-vars puni_preflight_stage=before-enrollment playbooks/preflight.yml
```

The original both-host **before-enrollment** check is inappropriate now: it must
refuse h4claw because k3s already exists. If h3mon no longer matches its recorded
unenrolled state, stop for reconciliation rather than changing the stage to pass.

## Preservation, stopping and scope

Keep Docker, Victoria, Grafana, MLflow and OTel on h3mon, and OpenHands/SSH on
h4claw. Use the runbook's configured preserved-listener/container checks and
record any discrepancy. An identity, convergence, memory or preservation failure
stops progression. A rollback is a separate authorized action using the runbook's
existing constraints, including retained MTU/fstab evidence and the connecting
account restriction; this addendum authorizes no destructive recovery.

Step 7 remains a separate platform gate: hcloud versus alternative storage,
compatible node/cloud-provider configuration, and Flux/SOPS/platform inputs are
unresolved. Node registration is not proof that observability workloads, memory
pressure, backups or restore drills passed. Keep those results distinct; do not
close 070.03 on a Ready node alone or claim steps 7–8 complete.

**Recommendation:** no new h3mon placement architecture is needed. The existing
procedure is actionable once the recovery-baseline decision, permitted token
transfer, inputs and step-specific authorizations are resolved and fresh preflight
agrees with the recorded starting state. Until then, keep 070.03 awaiting operator
decisions; neither the earlier apply authorization nor local test success supplies
permission for the remaining host actions.
