## Context

This change is the third of three that together are the new setup plan. It is stacked on
[`separate-node-roles`](../separate-node-roles/design.md), which rebuilds the cluster, and
beside the change `host-postgres`. Its content was in that change's ninth draft and was
moved out on 2026-11-22, after a ninth review recommended the split; text was moved, not
rewritten, except where the review, the split or a later decision of the owner required it
([verify.md](verify.md#where-this-came-from)).

Read at `origin/main` `b17861f83` on 2026-11-21 and 2026-11-22. What exists today:

- h1claw runs OpenClaw's gateway and its agent sessions as user-level systemd units,
  outside any cluster, with Tailscale for private access. The owner will delete it (R30).
- The owner's interactive agent sessions run on his laptop.
- The only hosts outside the cluster that the repository knows are gate hosts:
  `playbooks/gate-host.yml` applies the `gate_host` role to the group `gate_hosts`.
- The `base` role, which every k3s node gets, creates the operator account with exactly the
  authorized keys it is given, its sudo boundary, journald limits, kernel settings and
  swap. It sets nothing in `sshd` and no firewall, and its kernel-settings template reads
  the node's capabilities. Its key list, and the gate role's, are operator inputs in `$OPS`,
  not inventory.

**Ids.** This change's own carry the prefix AH: assumptions AH1 and AH2, slice AH-S1,
attended steps AH-A1 and AH-A2, and decisions 1 to 4 of this file. Every other id is the
core change's, [`separate-node-roles`](../separate-node-roles/design.md): R1 to R35, A1 to
A23, its slices and guards, and what is written "core decision n".

## Goals / Non-Goals

**Goals**

- A place for OpenClaw's sessions and a place for the owner's own, each on a server of its
  own and neither in the cluster.
- A stated trust for each: what it may hold and who may log in.
- Checks for what the repository can check, and receipts for the rest.

**Non-Goals**

- Installing or migrating OpenClaw, and setting up the workstation's tooling and accounts
  (decision 4).
- Any duty of h1claw (R30).
- Anything of the cluster rebuild. Neither host is on the path of a stage.

## Assumptions

A row marked **decided** records the owner's word; the rest are assumed and can be
overruled by id.

| Id  | Assumption                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Alternative and its cost                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AH1 | **Decided.** The owner on 2026-11-22: "let's also add a host for openclaw to this mix". A seventh node role, `agents`: one server, proposed name `h11claw`, outside the k3s cluster and outside the gate pool, prepared by the play of slice AH-S1. Assumed: 4 vCPUs and 8 GiB with the disk its type includes, and no interface on the cluster's private network (decisions 1 and 2). This change provisions and contains the host. Installing OpenClaw and moving its state is a follow-up, proposed name `host-openclaw`: its code and units live in a private repository and are not designed here. The host does not take over h1claw's backup pull or its alert relay; those duties end with h1claw, because backups run in the cluster (R13) and alerts go to Slack | OpenClaw on the CI host. Cost: unattended agent sessions with credentials of their own beside builds whose images production later runs. 16 GiB from the start. Cost: paid before more sessions than today's are measured |
| AH2 | **Decided.** The owner on 2026-11-22: "and a sep host for logged in agent's accounts that i'll access through herdr". An eighth node role, `workstation`: one server, proposed name `h12work`, outside the k3s cluster and outside the gate pool, prepared by the play of slice AH-S1. It is a remote operator workstation: interactive coding-agent sessions logged in to the owner's own accounts run there, and he reaches it from his laptop with `herdr` over SSH. **Decided** the same day: he chose the small size, 4 vCPUs and 8 GiB with the disk its type includes (decision 2). Installing the agent tooling, logging accounts in and setting `herdr` up are the owner's and are not designed here                                                              | The sessions on the agents host of AH1. Cost: the owner's logged-in accounts and keys beside unattended agents                                                                                                            |

## Decisions

### 1. Two roles outside the cluster, and what each is trusted with

The core change's role table names both roles and leaves them to this change:

| Role        | Host    | Capabilities               | In the k3s cluster |
| ----------- | ------- | -------------------------- | ------------------ |
| Agents      | h11claw | none: it is not a k3s node | no                 |
| Workstation | h12work | none: it is not a k3s node | no                 |

- No agents host and no workstation is a k3s node or a gate host, and neither is the same
  server as the other or as any other role.
- **The agents host is outside the cluster for the CI host's reason** (AH1): unattended
  agent sessions run code there with credentials of their own. It holds no cluster-admin
  credential, no k3s token, no object storage key of the cluster's backups, and no store
  token unless the follow-up grants one by name. It has no interface on the cluster's
  private network (assumed), so it is no path into it: it reaches the
  `puni-user-platform` API by its public name, and Git and the model providers over the
  internet. If the follow-up needs a private name, it has to say which. What the
  repository can check, slice AH-S1 checks; the rest is AH-A1's receipt.
- **The workstation is an extension of the operator's laptop** (AH2) and is trusted as the
  laptop is. Unlike the CI host and the agents host it may hold what the owner puts there:
  SSH keys, a kubeconfig, Git credentials and logged-in account sessions. That makes it
  one of the most sensitive hosts. It accepts inbound SSH by key only, or only over a
  private overlay if the owner uses one, and serves nothing public. It runs no gate, no
  build and no OpenClaw. No automation of the cluster, the CI host or the agents host may
  log in to it: no key of theirs is among its authorized keys.
- **The controller may run on the workstation.** R17 of the core change puts the Ansible
  controller on the operator's laptop, and core decision 10 names two things the laptop
  cannot do today: host the rehearsal and build the controller image. A workstation
  created first lifts both, and it takes the new age identity and the admin key off
  h2puni, where code in a gate is root-equivalent. The rule that secrets are decrypted only
  on the controller is unchanged by it: the workstation is then the controller. It is an
  option and is not decided here; AH-A2 records it if the owner takes it. At the size he
  chose, the rehearsal's memory, which the lab profile puts at 16 GiB, does not fit; the
  controller does.

### 2. Budgets

**Agents host** (AH1). Measured on h1claw on 2026-11-21: 4 vCPUs; 7.75 GiB of memory with
3.2 GiB available; the OpenClaw gateway at about 2 GiB resident; a 75 GB disk at 91%, of
which about 21 GiB is OpenClaw's state. The same shape is assumed, 4 vCPUs and 8 GiB, with
the disk its type includes, which is larger. What moves it to 16 GiB: available memory under
1 GiB with the sessions it runs today, or more sessions at once.

**Workstation** (AH2). 4 vCPUs and 8 GiB with the type's included disk, by the owner's
decision of 2026-11-22. Measured on his laptop that day, the agent processes themselves are
light, 29 of them at about 3.3 GiB resident, but their work used 21 GiB of memory and
filled a 460 GB disk, so this size holds few heavy sessions at once, and the server can be
resized upward later.

### 3. Preparing a host that is not a k3s node

No play prepares such a host today, and `base` alone does not give what decision 1 states.
Slice AH-S1 adds one play, `playbooks/base-host.yml`, for two new inventory groups,
`agents_hosts` and `workstation_hosts`:

- It applies `base` with an empty capability list, set in the play, so the kernel-settings
  template renders without a fact of the fleet model and without the ingress branch.
- It turns password and keyboard-interactive login off in `sshd`, which `base` does not
  touch.
- It installs a firewall that drops inbound traffic except SSH. The `network` role's
  firewall is written for k3s nodes and their enrolled peers, so this is a small rule set
  of the play's own.
- **The key check is an assert in the play**, not a static check. The authorized keys are an
  `$OPS` input, so no check over the repository can read them. Before any task changes a
  workstation, the play compares the operator keys it was given with the automation keys
  it was given, namely the gate callers' keys of the gate-host input, the build user's key
  and the agents host's own key, by key body, and fails when one appears among the
  operator keys or when the automation list was not given.
- What stays static, in the production placement check: a host in either group is in no
  k3s group, not in `gate_hosts` and not in the other group; neither group's hosts appear
  in `desired.yaml` or among the enrolled private addresses.

Neither host is in a stage. The owner creates each when he wants (AH-A1, AH-A2); nothing in
the core change waits for either, and h1claw may be deleted before or after (R30), with one
exception that is his to settle first: OpenClaw's state (open question 1).

### 4. Follow-ups

**OpenClaw on the agents host (follow-up, proposed name `host-openclaw`; AH1).** Not designed
here; its code is in a private repository. It has to decide: the units and their user; how
the host is reached privately, which is Tailscale today; which credentials the sessions hold
and where they live; whether OpenClaw's state moves from h1claw or starts fresh; and what,
if anything, the host may reach on the private network or read from the store. It does not
bring back the backup pull or the alert relay.

**The workstation's setup (AH2).** The owner's: agent tooling, logged-in accounts and
`herdr`, a terminal workspace manager for coding agents with an SSH remote mode (read from
its help output at version 0.9.5; nothing else of it was verified). A follow-up at most,
proposed name `set-up-operator-workstation`, if he wants any of it in the repository.

## Decision record (becomes an ADR at merge)

It stays here until a number is free, as the core change's two do (task AH-0.2).

> # Agent sessions run on hosts of their own, outside the cluster
>
> Unattended agent sessions ran on a host that also pulled the backups and relayed the
> alerts, and the owner's own sessions ran on his laptop. On 2026-11-22 the owner asked for
> a host for OpenClaw and for a separate remote workstation for his logged-in agent
> accounts. They are the seventh and eighth node roles.
>
> ## Considered options
>
> - OpenClaw on the CI host: unattended sessions with credentials of their own beside the
>   builds whose images production later runs.
> - The owner's sessions on the agents host: his logged-in accounts and keys beside
>   unattended agents.
> - Either as a workload of the cluster: agent code inside the cluster that holds the secret
>   store and production.
>
> ## Consequences
>
> Two more servers, each prepared by one play and neither a k3s node or a gate host. The
> agents host holds no credential of the cluster and is not on its private network. The
> workstation is trusted as the operator's laptop is, may hold his credentials, and accepts
> no login from automation. OpenClaw's installation and the workstation's tooling are not
> part of this decision. The backup pull and the alert relay that the old agents host
> carried are not moved: backups run in the cluster and alerts go to Slack.

## Risks / Trade-offs

- **The agents host is contained, OpenClaw is not designed** (AH1). What the sessions do
  with their own credentials is outside this plan.
- **The workstation holds operator credentials on a rented server** (AH2). Its guards are
  SSH by key, no public service and no login from automation.
- **The workstation is small** (AH2). It holds few heavy sessions at once, and the laptop's
  disk was what filled first.
- **The key check depends on an input.** The play can compare only the automation keys it
  is given; a key left out of that list is not caught, which is why AH-A2's receipt lists
  the authorized keys as read on the host.

## Open questions for the owner

1. The agents host (AH1): its region, the cluster's or the one h1claw is in today. The
   cluster's region is closer to the apps' API and keeps a private name possible later;
   why h1claw is where it is, the planning session does not know. And whether OpenClaw's
   state moves from h1claw or starts fresh, which has to be settled before h1claw is
   deleted if the state is wanted.
2. The workstation (AH2): its region.

## Not verified

- Nothing was run against a host. `herdr` was read from its help output only.
- That `base` converges on a host with an empty capability list, and that its kernel
  settings harm nothing on a host that runs no k3s.
- What OpenClaw needs to reach, and so whether "no private interface" holds for it.
- Whether the rehearsal of the core change fits a server of the workstation's size; the lab
  profile's figure says it does not.
