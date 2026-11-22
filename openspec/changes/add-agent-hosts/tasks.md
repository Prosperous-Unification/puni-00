One agent slice (AH-S1) changes source and runs tests; it touches no host. Attended steps
(AH-A1 to AH-A3) each name who runs them, the command, the receipt, the stop condition and
the rollback. Ids with the prefix AH are this change's and refer to [design.md](design.md);
every other id is the core change's, [`separate-node-roles`](../separate-node-roles/tasks.md).
`fleet_ansible` and `$OPS` mean what that change's tasks.md says. Every safety check lands
with a production-path negative, watched failing with the check removed, and an adjacent
`Proof:` comment. Nothing here has been done yet.

## 0. Decisions

- [ ] AH-0.1 Owner reads assumptions AH1 to AH4 and what design.md leaves him to settle at
      a step, and overrules by id. Receipt: the overrules and the answers, dated, as decisions in
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
      firewall whose inbound policy is drop, with SSH admitted on the private interface from
      the bastion's address only (core slice 1.8, R55), and adds the host to the bastion's
      `PermitOpen` (core slice 1.9). For a host in
      `workstation_hosts` it first asserts, before any task that changes the host, that an
      input list of automation public keys was given and that none of them, compared by
      key body, is among the operator keys it is about to install; the list holds the
      gate callers' keys, the build user's key and the agents host's key. In the
      production placement check: a host in either group is in no k3s group and not in
      `gate_hosts`; a host may be in both groups, which is the minimal profile's shared
      host (AH4), and then the play also creates OpenClaw's Unix user with no `sudo` entry
      and no supplementary group, sets the operator's home to 0700, and fails if that user
      can read a file there; neither group's hosts appear in
      `desired.yaml` or in `puni_enrolled_private_addresses`. Each host's inventory
      revision follows its creation, as the core change's slice 1.3 does for a server.
      Test: `infra/ansible/tests`, with the rendered `sshd` drop-in, firewall and
      kernel-settings file of a fixture host, and `placement.test.ts`. Negatives, each
      with its own fault: an agents host under `k3s_agents` is refused (fault: skip the
      group comparison); a workstation under `gate_hosts` is refused (fault: compare
      against k3s groups only); on a host in both groups, an OpenClaw user with a `sudo`
      entry, in the operator's group or in `docker` fails the play (fault: create the user
      with the operator's groups), and an operator home that the OpenClaw user can list
      fails it (fault: leave the home at its default mode); an agents host's
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

Neither role is on the path of any stage of the core change. In the minimal profile AH-A1
creates the one shared host; AH-A2 is the growth step to two (design decision 3). AH-A3
retires h1claw (AH3).

- [ ] AH-A1 The shared host for OpenClaw and the owner's sessions (AH4, minimal profile),
      after slice AH-S1. Who: owner creates, as early as he wants, in the region he
      chooses, with 8 vCPUs and 16 GiB (AH4) and a root disk of at least 100 GiB, with the admin key and no private network attached;
      operator applies, with the host in both groups and the automation key list in
      `$OPS`. Commands:
      `fleet_ansible --limit h11ops playbooks/base-host.yml` twice. Receipt: as the core
      change's A1, without a private address; the second run prints `changed=0`; no k3s
      unit, no kubeconfig, no k3s token, no object storage key and no file of task 0.5's
      escrow list on the host; no interface on the cluster's private network; password
      login refused; only SSH answers from outside; the authorized keys of the operator's
      user as read on the host, operator keys only; OpenClaw's user present with no `sudo`
      entry and no supplementary group, and a listing of the operator's home refused to
      it; no gate launcher and no runner on the host. Stop: the host has a private
      interface, any of those files, a key of the CI host or a cluster workload
      authorized, the OpenClaw user can read the operator's home, or `df -h /` shows less
      than the minimum. Rollback: delete the
      server. Installing OpenClaw is the follow-up `host-openclaw`; tooling, accounts and
      `herdr` are the owner's. The controller (R17) does not run here: the receipt reads
      that no age identity of the cluster and no admin key is on the host (design
      decision 1).
- [ ] AH-A2 Growth step only: a workstation of its own (AH2, design decision 3). Who:
      owner creates, at one of the triggers, in a region he chooses, with 4
      vCPUs and 8 GiB; operator applies the play for `h12work` as a workstation alone,
      with the automation key list in `$OPS`, which now holds the shared host's key too;
      the owner moves his sessions and credentials; the shared host's inventory revision
      takes it out of the workstation group. Receipt: as the
      core change's A1; the second run prints `changed=0`; its authorized keys as read on
      the host, which are operator keys only; password login refused; SSH answers through
      the bastion and not on the tailnet address, and no public port answers; `herdr`
      connects through the bastion; no gate launcher, no runner and no OpenClaw unit on it. Stop: the
      play's assert fails, or a key of the CI host, the agents host or a cluster workload
      is authorized there. Rollback: delete the server. Tooling, accounts and `herdr` are
      the owner's. If he moves the controller there (R17), that is recorded in verify.md
      with the date.
- [ ] AH-A3 Delete h1claw (AH3, core R46). Who: owner. Preconditions: the receipt of the
      core change's task 0.5, the read-back of the escrowed values on a second machine,
      which has not been taken yet; and either the follow-up `host-openclaw`
      has its receipt that OpenClaw runs on the agents host with the state it needs, or the
      owner's dated word that the state is not wanted. Command: delete the server in the
      console. Receipt: the provider's server list without it; which of the two
      preconditions held, dated. Stop: a store on an old host still has h1claw's pull as
      its only off-host backup and the owner has not accepted that window; he has, on
      2026-11-21 (R30), so this stop applies only if he withdraws it. Rollback: none; that
      is why the preconditions are receipts. He may delete it earlier than this step's place
      in the order (R30), and then the same preconditions hold: what R30 lets him skip is
      waiting for the backups to move, not the escrow read-back or his recorded yes or no
      on OpenClaw's state. With either goes his dated sign-off of a list of what the host
      still holds, read from the host and marked moved or discarded entry by entry:
      OpenClaw's state, the pulled backup sets, the secret files, and repository work that
      is not pushed.
