## Context

This change is the third of four that together are the new setup plan, in one pull
request with [`separate-node-roles`](../separate-node-roles/design.md), which rebuilds the
cluster, and the changes `host-postgres` and `run-ci-on-argo-workflows`. On 2026-11-22 the owner asked for the minimal
setup that can grow (core R45). Offered one host for both roles he first answered "two
hosts", and later that day chose one for the minimal profile: because of power cuts where
he works he needs a remote workstation, and "can have just one for openclaw + workers"
(AH4). Two
hosts are the full profile. He also said that every server is new and every old one is
retired (core R46), which makes h1claw's retirement a step of this change (AH3). Its content was in that change's ninth draft and was
moved out on 2026-11-22, after a ninth review recommended the split; text was moved, not
rewritten, except where the review, the split or a later decision of the owner required it
([verify.md](verify.md#where-this-came-from)).

Read at `origin/main` `b17861f83` on 2026-11-21 and 2026-11-22. What exists today:

- h1claw runs OpenClaw's gateway and its agent sessions as user-level systemd units,
  outside any cluster, with Tailscale for private access. It is retired (R46, AH3).
- The owner's interactive agent sessions run on his laptop.
- The only hosts outside the cluster that the repository knows are gate hosts:
  `playbooks/gate-host.yml` applies the `gate_host` role to the group `gate_hosts`.
- The `base` role, which every k3s node gets, creates the operator account with exactly the
  authorized keys it is given, its sudo boundary, journald limits, kernel settings and
  swap. It sets nothing in `sshd` and no firewall, and its kernel-settings template reads
  the node's capabilities. Its key list, and the gate role's, are operator inputs in `$OPS`,
  not inventory.

**Ids.** This change's own carry the prefix AH: assumptions AH1 to AH4, slice AH-S1,
attended steps AH-A1 to AH-A3, and decisions 1 to 4 of this file. Every other id is the
core change's, [`separate-node-roles`](../separate-node-roles/design.md): R1 to R35, R45,
R46, A1 to A23, its slices and guards, and what is written "core decision n".

## Goals / Non-Goals

**Goals**

- A place for OpenClaw's sessions and a place for the owner's own, outside the cluster: one
  server for both in the minimal profile, a server each in the full one.
- A stated trust for each: what it may hold and who may log in.
- Checks for what the repository can check, and receipts for the rest.

**Non-Goals**

- Installing or migrating OpenClaw, and setting up the workstation's tooling and accounts
  (decision 4).
- Any duty of h1claw (R30): its backup pull and alert relay end with it.
- Anything of the cluster rebuild. Neither host is on the path of a stage.

## Assumptions

A row marked **decided** records the owner's word; the rest are assumed and can be
overruled by id.

| Id  | Assumption                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Alternative and its cost                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AH1 | **Decided.** The owner on 2026-11-22: "let's also add a host for openclaw to this mix". A seventh node role, `agents`: one server, proposed name `h11claw`, outside the k3s cluster and outside the gate pool, prepared by the play of slice AH-S1. Assumed: 4 vCPUs and 8 GiB with the disk its type includes, and no interface on the cluster's private network (decisions 1 and 2). This change provisions and contains the host. Installing OpenClaw and moving its state is a follow-up, proposed name `host-openclaw`: its code and units live in a private repository and are not designed here. The host does not take over h1claw's backup pull or its alert relay; those duties end with h1claw, because backups run in the cluster (R13) and alerts go to Slack | OpenClaw on the CI host. Cost: unattended agent sessions with credentials of their own beside builds whose images production later runs. 16 GiB from the start. Cost: paid before more sessions than today's are measured |
| AH2 | **Decided.** The owner on 2026-11-22: "and a sep host for logged in agent's accounts that i'll access through herdr". An eighth node role, `workstation`: one server, proposed name `h12work`, outside the k3s cluster and outside the gate pool, prepared by the play of slice AH-S1. It is a remote operator workstation: interactive coding-agent sessions logged in to the owner's own accounts run there, and he reaches it from his laptop with `herdr` over SSH. **Decided** the same day: he chose the small size, 4 vCPUs and 8 GiB with the disk its type includes (decision 2). Installing the agent tooling, logging accounts in and setting `herdr` up are the owner's and are not designed here                                                              | The sessions on the agents host of AH1. Cost: the owner's logged-in accounts and keys beside unattended agents                                                                                                            |
| AH3 | **Decided.** The owner on 2026-11-22: "i want all new infra, all old nodes can be retired" (core R46). h1claw is retired by this change, in AH-A3, when OpenClaw's state has moved or he has said it is not wanted. He may still delete it earlier (R30)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Keep h1claw as the OpenClaw host, which the planning session had offered. Cost: none in work; he chose new servers                                                                                                        |
| AH4 | **Decided.** The owner on 2026-11-22, after first answering "two hosts": power cuts where he works demand a remote workstation, and he "can have just one for openclaw + workers". In the minimal profile the roles `agents` and `workstation` share one server, proposed name `h11ops`, outside the cluster and the gate pool; the workstation is needed and is not postponed. Two servers, as AH1 and AH2 describe them, are the full profile and a growth step (decision 3). The shared host cannot keep AH1's rule that the agents host holds no operator credential; decision 1 states what limits that. **Decided** later that day: "shared operator 16GiB", 8 vCPUs and 16 GiB                                                                                      | Two hosts from the start. Cost: one more server. One host at 4 vCPUs and 8 GiB. Cost: the gateway and few sessions at once                                                                                                |

## Decisions

### 1. Two roles outside the cluster, and what each is trusted with

The core change's placement table names both roles and leaves them to this change:

| Role        | Minimal profile (AH4) | Full profile | In the k3s cluster |
| ----------- | --------------------- | ------------ | ------------------ |
| Agents      | `h11ops`, shared      | h11claw      | no                 |
| Workstation | `h11ops`, shared      | h12work      | no                 |

- No agents host and no workstation is a k3s node or a gate host or the server of any
  cluster role. In the full profile neither is the same server as the other. In the minimal
  profile one server, `h11ops`, holds both, and nothing else.
- **The workstation is not optional and is not postponed** (AH4). Power cuts where the owner
  works are the reason he needs a remote place for his sessions, so the shared host is
  created early; nothing in the cluster rebuild waits for it, and it waits for nothing.
- **What sharing gives up, plainly.** The bullets below state each role's trust for a host
  of its own. On the shared host OpenClaw's autonomous agents run on the machine that holds
  the operator's credentials and logged-in sessions, so "the agents host holds no operator
  credential" does not hold there. That is an accepted residual of the minimal profile. What
  limits it, and what the play and the receipt check (decision 3, AH-A1):
  - OpenClaw runs as a Unix user of its own, which has no `sudo`, is in none of the
    operator's groups and not in a container-runtime group, and whose sessions' credentials
    are its own;
  - the operator's home is mode 0700 and what he keeps there is readable by his user only;
  - inbound traffic is SSH by key, on the private access network only (core decision
    12), and no key of the CI host or a cluster workload is
    authorized for either user;
  - the host still has no interface on the cluster's private network, no k3s token and no
    object storage key of the cluster's backups, unless the owner puts one in his own home.

  A local privilege escalation by an agent would cross that line; nothing here prevents
  one. For that reason the controller of core R17 may not run on the shared host: it would
  put the admin key and the age identity of the cluster on the far side of one such
  escalation. No check in the repository can see where the controller runs, so this is a
  rule for the operator, and AH-A1's receipt reads that neither file is on the host. The split to two hosts is the growth step
  (below), and a workstation of its own may be the controller.

- **The agents host is outside the cluster for the CI host's reason** (AH1): unattended
  agent sessions run code there with credentials of their own. It holds no cluster-admin
  credential, no k3s token, no object storage key of the cluster's backups, and no store
  token unless the follow-up grants one by name. It has no interface on the cluster's
  private network (assumed), so it is no path into it: it reaches the
  `puni-user-platform` API by its public name, and Git and the model providers over the
  internet. On the private access network it is the device `tag:operator-host`, which the
  policy grants one thing: the CI cluster's API server proxy, where it may start a gate
  from a template and read its runs. If the follow-up needs a private name, it has to say which. What the
  repository can check, slice AH-S1 checks; the rest is AH-A1's receipt.
- **The workstation is an extension of the operator's laptop** (AH2) and is trusted as the
  laptop is. Unlike the CI host and the agents host it may hold what the owner puts there:
  SSH keys, a kubeconfig, Git credentials and logged-in account sessions. That makes it
  one of the most sensitive hosts. It accepts inbound SSH by key over the private access
  network only, which is how `herdr` reaches it, and serves nothing public. It runs no gate, no
  build and no OpenClaw. No automation of the cluster, the CI host or the agents host may
  log in to it: no key of theirs is among its authorized keys.
- **The controller may run on a workstation of its own**, which is the full profile. R17 of the core change puts the Ansible
  controller on the operator's laptop, and core decision 10 names two things the laptop
  cannot do today: host the rehearsal and build the controller image. A workstation
  created first lifts both, and it takes the new age identity and the admin key off
  h2puni, where code in a gate is root-equivalent. The rule that secrets are decrypted only
  on the controller is unchanged by it: the workstation is then the controller. It is an
  option and is not decided here; AH-A2 records it if the owner takes it. At the size he
  chose, the rehearsal's memory, which the lab profile puts at 16 GiB, does not fit; the
  controller does.

### 2. Budgets

**The shared host** (AH4, minimal profile). 8 vCPUs and 16 GiB, by the owner's decision of
2026-11-22. The two measurements below are its basis: the gateway needs about 2 GiB, and
the work of the owner's sessions is what fills a machine; at this size it holds the gateway
and several sessions that run tests. Its root disk is at least 100 GiB, the minimum the
core change's decision 2 lists for the role: OpenClaw's state is about 21 GiB today, and
the rest is assumed for the sessions' checkouts and temporary files, which filled the
laptop. AH-A1 stops on a smaller disk, whatever provider the server comes from. A rescale
of memory later keeps the disk it has.

**Agents host, on a server of its own** (AH1, full profile). Measured on h1claw on 2026-11-21: 4 vCPUs; 7.75 GiB of memory with
3.2 GiB available; the OpenClaw gateway at about 2 GiB resident; a 75 GB disk at 91%, of
which about 21 GiB is OpenClaw's state. The same shape is assumed, 4 vCPUs and 8 GiB, with
the disk its type includes, which is larger. What moves it to 16 GiB: available memory under
1 GiB with the sessions it runs today, or more sessions at once.

**Workstation, on a server of its own** (AH2, full profile). 4 vCPUs and 8 GiB with the type's included disk, by the owner's
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
- It joins the private access network through the `base` role (core slice 1.8) and
  installs a firewall that drops inbound traffic except SSH on the tailnet interface; no
  public port answers. The `network` role's firewall is written for k3s nodes and their
  enrolled peers, so this is a small rule set of the play's own.
- **The key check is an assert in the play**, not a static check. The authorized keys are an
  `$OPS` input, so no check over the repository can read them. Before any task changes a
  workstation, the play compares the operator keys it was given with the automation keys
  it was given, namely the gate callers' keys of the gate-host input, the build user's key
  and the agents host's own key, by key body, and fails when one appears among the
  operator keys or when the automation list was not given.
- What stays static, in the production placement check: a host in either group is in no
  k3s group, not in `gate_hosts` and not in the other group; neither group's hosts appear
  in `desired.yaml` or among the enrolled private addresses.

Neither role is in a stage. In the minimal profile the owner creates the shared host in
AH-A1, as early as he wants; nothing in the core change waits for it. A host in both groups
gets both groups' rules from the play: the workstation's key assert, with the gate callers'
and the build user's keys as the automation list, and for the agents role a Unix user for
OpenClaw created by the play with no `sudo` and no supplementary group, the operator's home
set to 0700, and a check that fails if that user can read it.

**The growth step to two hosts** (core decision 11). Trigger: the owner wants the controller,
the admin key or another credential of the cluster on his workstation; the first production
user; an agent session found to have read outside its user; or the two kinds of sessions
starving each other. Procedure: AH-A2 creates the second server and applies the play to it
as a workstation alone; the owner moves his sessions and credentials there; the shared host
leaves the workstation group in its inventory revision and its operator home is emptied of
credentials, which is the step's receipt.

**Retiring h1claw** (AH3, AH-A3). The plan retires every old server (R46). h1claw is deleted
by AH-A3 once OpenClaw's follow-up has moved its state to the agents host, or the owner has
said the state is not wanted. Two earlier words of his stand beside that and are not
withdrawn: he may delete h1claw at any time before that step, and the backup windows that
follow are accepted (R30, core decision 7). The escrow that has to precede its deletion is
the core change's task 0.5, and it is not done: on 2026-11-21 a copy of the secret files was
taken off the host with matching checksums, which is not that task's read-back on a second
machine (the core change's verify.md). AH-A3 requires the read-back, and so should a
deletion before that step.

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
> Two roles outside the cluster, prepared by one play, on one shared server at first and on
> a server each later; neither is a k3s node or a gate host. An agents host of its own holds
> no credential of the cluster and is not on its private network. The workstation is trusted
> as the operator's laptop is, may hold his credentials, and accepts no login from
> automation. While they share a server, OpenClaw's agents run beside the operator's
> credentials under a user of their own, and the cluster's controller may not run there. OpenClaw's installation and the workstation's tooling are not
> part of this decision. The backup pull and the alert relay that the old agents host
> carried are not moved: backups run in the cluster and alerts go to Slack.

## Risks / Trade-offs

- **The agents host is contained, OpenClaw is not designed** (AH1). What the sessions do
  with their own credentials is outside this plan.
- **The workstation holds operator credentials on a rented server** (AH2). Its guards are
  SSH by key over the private access network, no public port and no login from automation.
- **A workstation of its own is small** (AH2, full profile). It holds few heavy sessions at
  once, and the laptop's disk was what filled first.
- **On the shared host an agent that escalates locally reaches the operator's credentials**
  (AH4). Separate users and file modes are the limit; the cluster's controller is kept off
  that host for this reason.
- **The key check depends on an input.** The play can compare only the automation keys it
  is given; a key left out of that list is not caught, which is why AH-A2's receipt lists
  the authorized keys as read on the host.

## Open questions for the owner

None. The shared host's size, the tenth draft's question, is decided (AH4).

His to settle at a step: the host's region, when he creates it
(AH-A1). The cluster's region is closer to the apps' API and keeps a private name possible
later; why h1claw is where it is, the planning session does not know. And whether OpenClaw's
state moves from h1claw or starts fresh, which is the follow-up's and has to be settled
before AH-A3.

## Not verified

- Nothing was run against a host. `herdr` was read from its help output only.
- That `base` converges on a host with an empty capability list, and that its kernel
  settings harm nothing on a host that runs no k3s.
- What OpenClaw needs to reach, and so whether "no private interface" holds for it.
- Whether the rehearsal of the core change fits a server of the workstation's size; the lab
  profile's figure says it does not.
