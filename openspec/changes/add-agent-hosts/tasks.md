One agent slice (AH-S1) changes source and runs tests; it touches no host. Attended steps
(AH-A1 and AH-A2) each name who runs them, the command, the receipt, the stop condition and
the rollback. Ids with the prefix AH are this change's and refer to [design.md](design.md);
every other id is the core change's, [`separate-node-roles`](../separate-node-roles/tasks.md).
`fleet_ansible` and `$OPS` mean what that change's tasks.md says. Every safety check lands
with a production-path negative, watched failing with the check removed, and an adjacent
`Proof:` comment. Nothing here has been done yet.

## 0. Decisions

- [ ] AH-0.1 Owner reads assumptions AH1 and AH2 and the two open questions in design.md and
      overrules by id. Receipt: the overrules and the answers, dated and quoted, in
      verify.md.
- [ ] AH-0.2 File the decision record from design.md as an ADR under the next free number,
      once the core change's two have theirs, link it from proposal.md, and delete the
      quoted copy. Test: `env -u CLAUDECODE bun test tools/tool-devsync/src/adr-index.test.ts`.

## 1. Hosts outside the cluster (agent slice)

- [ ] AH-S1 Before AH-A1 and AH-A2 (AH1, AH2, design decision 3). Two inventory groups,
      `agents_hosts` and `workstation_hosts`, and a play `playbooks/base-host.yml` for them
      and for no other group. The play sets an empty capability list and applies the
      `base` role; turns `PasswordAuthentication` and `KbdInteractiveAuthentication` off in
      an `sshd` drop-in and validates the configuration before reloading; and installs a
      firewall whose inbound policy is drop, with SSH admitted. For a host in
      `workstation_hosts` it first asserts, before any task that changes the host, that an
      input list of automation public keys was given and that none of them, compared by
      key body, is among the operator keys it is about to install; the list holds the
      gate callers' keys, the build user's key and the agents host's key. In the
      production placement check: a host in either group is in no k3s group, not in
      `gate_hosts` and not in the other group; neither group's hosts appear in
      `desired.yaml` or in `puni_enrolled_private_addresses`. Each host's inventory
      revision follows its creation, as the core change's slice 1.3 does for a server.
      Test: `infra/ansible/tests`, with the rendered `sshd` drop-in, firewall and
      kernel-settings file of a fixture host, and `placement.test.ts`. Negatives, each
      with its own fault: an agents host under `k3s_agents` is refused (fault: skip the
      group comparison); a workstation under `gate_hosts` is refused (fault: compare
      against k3s groups only); one host in both groups is refused; an agents host's
      address among the enrolled private addresses is refused (fault: read `desired.yaml`
      only); the play fails for a workstation whose operator keys include a gate caller's
      key or the build user's (fault: drop the assert); it fails for one whose operator
      keys include the agents host's key (fault: compare the gate and build keys only);
      it fails when the automation list is absent (fault: treat a missing list as empty);
      the rendered `sshd` drop-in leaves password login on (fault: remove the task) and
      the test sees it; the rendered firewall admits a port other than SSH (fault: add
      one) and the test sees it; the kernel-settings file of a fixture host carries the
      ingress line (fault: give the host the `ingress` capability) and the test sees it;
      the play run against a k3s node is refused (fault: remove the group guard).

## 2. Attended steps

Neither is on the path of any stage of the core change, and neither waits for h1claw's
deletion or holds it up (R30, AH1, AH2), except for OpenClaw's state (open question 1).

- [ ] AH-A1 The agents host (AH1), after slice AH-S1. Who: owner creates, when he chooses, in
      the region of open question 1, with 4 vCPUs and 8 GiB, the admin key and no private
      network attached; operator applies. Commands:
      `fleet_ansible --limit h11claw playbooks/base-host.yml` twice. Receipt: as the core
      change's A1, without a private address; the second run prints `changed=0`; no k3s
      unit, no kubeconfig, no k3s token, no object storage key and no file of task 0.5's
      escrow list on the host; no interface on the cluster's private network; password
      login refused; only SSH answers from outside. Stop: the host has a private
      interface, or any of those files. Rollback: delete the server. Installing OpenClaw
      is the follow-up `host-openclaw`.
- [ ] AH-A2 The workstation (AH2), after slice AH-S1. Who: owner creates, when he chooses, in
      the region of open question 2, with 4 vCPUs and 8 GiB; operator applies the play as
      in AH-A1 for `h12work`, with the automation key list in `$OPS`. Receipt: as the
      core change's A1; the second run prints `changed=0`; its authorized keys as read on
      the host, which are operator keys only; password login refused; only SSH answers
      from outside; no gate launcher, no runner and no OpenClaw unit on it. Stop: the
      play's assert fails, or a key of the CI host, the agents host or a cluster workload
      is authorized there. Rollback: delete the server. Tooling, accounts and `herdr` are
      the owner's. If he moves the controller there (R17), that is recorded in verify.md
      with the date.
