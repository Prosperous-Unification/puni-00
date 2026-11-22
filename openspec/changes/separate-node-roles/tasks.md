Agent slices (phases 1 to 3) change source and run tests; none touches a host. Attended steps
(A1 to A28) each name who runs them, the command, the receipt, the stop condition and the
rollback. Assumption and decision numbers refer to [design.md](design.md). Every slice that
adds a safety check lands it with a production-path negative, watched failing with the check
removed, and an adjacent `Proof:` comment. Slices 1.1, 1.2, 1.8 and 1.9 and the first revision
of 1.3 landed on 2026-11-22 in source and tests only; no host was touched. Their proofs are in
[verify.md](verify.md#failure-proofs).

`fleet_ansible` is the controller wrapper of
[enroll h4claw and h3mon](../../../docs/infra/enroll-h4claw-h3mon.md#1-prepare-the-controller-on-h2puni),
extended by slice 2.5 and run against the new inventory of slice 1.3, always with `--limit`.
The CI cluster has a `desired.yaml` entry and an inventory of its own (change
`run-ci-on-argo-workflows`, slice CI-S2). The controller is the operator's laptop and no
machine that runs gates (design decision 10). `$OPS` is its owner-only
input directory. "Sync" of a platform unit means
`fleet_ansible --limit m1plat1 --extra-vars puni_sync_units=<units> playbooks/argocd-sync.yml`
(design decision 3). Every step that syncs a unit which exposes a Service on the tailnet
includes one more action: the owner signs the device the Tailscale operator made for it,
and the step reads back that the name answers (design decision 12).

## 0. Decisions

- [ ] 0.1 Owner reads assumptions R1 to R35 and R45 to R55 in design.md and overrules by id.
      This change has no open question. He may overrule R34 (dev is delivered by a
      follow-up change), R35 (the CI cluster is one trust zone), and R49 to R53, which the
      planning session set on 2026-11-22 while he was away: no public SSH rule, the CI
      server's size, no public webhook, Tailnet Lock with `sshd`, the schema hook for
      WBS staging; R55, the bastion as the SSH path with Tailscale kept as the target for
      the interfaces; and the controller on
      his laptop only (design decision 10). Rows marked decided record his
      answers of 2026-11-21 and 2026-11-22. Receipt: the overrules, dated, as decisions in verify.md. Until then only
      slices 1.1, 1.2 and 2.1 to 2.5 may start; the rehearsal 2.7 needs 2.1 to 2.5 and
      follows them.
- [ ] 0.2 File the three decision records from design.md as ADRs under the next free numbers
      once pull requests #935 and #948 and the Harbor record have settled theirs, link them
      from proposal.md, and delete the quoted copies. Test:
      `env -u CLAUDECODE bun test tools/tool-devsync/src/adr-index.test.ts`.
- [ ] 0.3 After 0.1: the Harbor change's owner adds a dated pointer to this change in its
      `proposal.md` and `tasks.md` and makes the amendments of design decision 9. Test:
      `./node_modules/.bin/openspec validate --all --json`.
- [ ] 0.4 After 0.1: tell the owners of pull request #935, of `dash-host-jobs`, of the release
      bootstrap and of the WBS deploy tooling what design decision 9 asks of each: slice
      3.7's list, the withdrawal of the old gate hosts, the solver per environment in every
      ACME issuer (design decision 3), and, for the release bootstrap's owner, whether the
      website takes the staging build path and by which step a merge to its source
      reaches staging with no command. Tell them too that this change edits no path
      the old cluster reconciles, so its pin needs no freeze. Receipt: for each owner, the
      date they were told and what each answered, recorded in verify.md as decisions with
      their owner, in neutral words. No message is copied into the repository.
- [ ] 0.5 Escrow what the new cluster needs (guard 2), before stage 1 and before h1claw is
      deleted (R30). Who: owner. Copy into escrow, from the host that holds each: the backup
      archive key, which lives on h1claw; the registry CA key pair; the object storage
      credentials; the old cluster's age identity. Then, on a machine that never held the
      originals, read each back and compare its fingerprint with the escrow entry
      ([recovery](../../../docs/infra/recovery.md#recovery-secrets)). Receipt: "matched", four
      times and dated, in verify.md; no value and no fingerprint. Stop: any is missing or
      differs; nothing else proceeds and h1claw is not deleted. Rollback: none needed; a copy
      is added and nothing is removed.
- [ ] 0.6 The rules that guard `main` (design decision 3). Who: owner. For this repository and
      for the fleet repository, both before A2; for the WBS deploy repository, if it exists,
      before its first Application is merged, with its own check required. The staging pins
      repository is ruled differently, before the App is installed on it (A23): one ruleset
      with no bypass actor that refuses a forced or deleting push, and one that requires a
      pull request and names the App as its only bypass actor (design decision 9); both
      are read back and neither is proved by pushing. Commands for the other
      repositories: record the tip SHA of `main`; read
      the rules that apply to it with `gh api repos/<repository>/rules/branches/main`; add
      what is missing so that a change needs a pull request and the required checks and no
      push may be direct, forced or deleting; on the fleet repository require its
      `fleet-check`; list the bypass actors. The rules against forced and deleting pushes are
      proved by reading them back, never by pushing. The rule against a direct push is proved
      by one push of an empty commit from an account that is not a bypass actor. Receipt: the
      rules read back for each repository; that push refused; the bypass list, which names
      no agent account; the tip SHA unchanged. Stop: the push is accepted. Then the tip SHA
      has moved by one empty commit: restore it by reverting that commit through a pull
      request, and correct the rule before anything else. Rollback: none needed; no rule is
      loosened. Read on 2026-11-21: this repository's `main` requires a pull request with zero
      approvals and the status checks `gate` and `pixels`, not strict, with no bypass actor
      and no rule against forced or deleting pushes; the fleet repository's `main` had no
      rule. Zero approvals and non-strict checks stay as they are and are listed under Risks
      in design.md.
- [ ] 0.7 The tailnet's settings and its policy (design decision 12), before A1 and after
      slice 1.8. Who: owner, in the vendor's admin console and from his own device.
      Commands: create the tags of design decision 12; turn Tailnet Lock on from his device,
      add a second device of his as a signer, and put the disablement secret in escrow; turn on names with certificates; make one
      OAuth client per cluster for its operator, limited to that operator's tag, and one
      credential that may write the policy file and nothing else, all into `$OPS` and
      escrow; apply `infra/access/policy.hujson` through the API. Receipt: the policy read
      back equals the file at its commit; the lock reads enabled and names two devices of his as
      its signers; the tags listed; no value and no tailnet name. Stop: the policy read
      back differs, or the lock is off. Rollback: apply the file's previous revision; the
      lock is turned off only with the disablement secret, by the owner.

## 1. Fleet model and roles (agent slices)

- [x] 1.1 Add the capabilities `platform-services` and `nonproduction` to `CapabilitySchema`,
      `fleetCapabilities`, `purposeCapabilities.platform` and `RequiredCapabilitiesSchema` in
      `tools/tool-fleet/src/contracts.ts`. Test: `contracts.test.ts` accepts a platform node
      that carries each. Negatives, for each capability: a workers node carrying it is
      refused; a platform cluster whose floor names it with no such node is refused. Fault to
      inject: add each to `purposeCapabilities.workers` and watch its workers negative pass
      wrongly.
- [x] 1.2 Trust-class rules and the platform taint. In the production placement check: the
      `control-plane` node of a platform cluster that requires `platform-services` carries it
      and none of `product`, `nonproduction`, `ingress` and `observability`; no node carries
      both `product` and `nonproduction`; a node may carry `nonproduction` and `ingress`
      beside `observability`, which is the minimal profile's one co-location in this change
      (design decisions 1 and 11); no host in `gate_hosts` is in a k3s group of the same
      inventory. In the `k3s_server` template: a server with `platform-services` writes
      the taint `CriticalAddonsOnly=true:NoSchedule` (R25) and the
      `kube-apiserver-arg` entry `enable-admission-plugins+=PodNodeSelector`, which
      appends to the `NodeRestriction` k3s sets itself (design decision 14), and
      `etcd-expose-metrics: true`, so that etcd's latency can be scraped on the node that
      also carries a database (design, Risks); a server without `platform-services` writes none
      of the three, so the existing servers' configuration is unchanged, and the separated
      firewall of slice 1.8 admits etcd's metrics port, 2381, from the enrolled nodes and the
      pod network alone (amended 2026-11-22 after review). In `validate-enrollment.yml`: the
      CoreDNS step appends the enrollment toleration when it is absent (a JSON patch that adds
      one list entry) where it now replaces the whole list with a strategic patch, so the
      packaged `CriticalAddonsOnly` toleration stays. Test: the template renders the taint;
      the play's contract test reads the patch type; in the rehearsal of 2.7 a one-node server
      registered with both taints brings CoreDNS to Ready, `validate-enrollment.yml` passes,
      and CoreDNS, the metrics server and the volume provisioner are Ready afterwards.
      Negatives, each with its own fault: a server with `product` is refused (fault: drop the
      capability comparison); a server with `observability` is refused (fault: compare
      against the earlier three-name list); a node with `observability`, `nonproduction` and
      `ingress` is accepted (fault: refuse any node with two roles' capabilities and watch
      the minimal fleet fail); a node with `product` and `nonproduction` is refused (fault: check
      the server only); a gate host under `k3s_agents` is refused (fault: skip the gate-host
      comparison); a `platform-services` server whose rendered config lacks the
      taint fails the role test (fault: remove the template branch); a server config without
      `etcd-expose-metrics` fails it (fault: drop the line), and so does an existing server's
      config that has it (fault: write it for every server); a `platform-services` server
      config without the `+=` entry, or with the plain `=` form that would drop
      `NodeRestriction`, fails it (fault: write `=`); the old inventories' rendered server
      configs hold no `kube-apiserver-arg` entry (fault: write the entry for every server); a play whose CoreDNS
      step replaces the toleration list fails the contract test (fault: restore the strategic
      patch). The existing two-node path keeps passing its tests unchanged. Stop: validation
      cannot pass on one node with both taints. Then the cause is reported and the owner
      decides; R25's alternative (selectors and rule 2.4(f) alone) is not applied silently.
      Done 2026-11-22 except the rehearsal part, which is receipt 2.7/A3 (a). The fleet rules
      are in `decodeFleet`, the inventory rules in `inventory-binding.ts`, the template judges in
      `node-access.ts`, run by `tool-fleet:check` and `infra/ansible/tests/node-roles.test.ts`.
      The trust-class rules apply only where the cluster requires `platform-services`: the
      existing inventory keeps h4claw as a gate host and a server. h4claw's rendered server
      configuration is byte-equal to its rendering at `7a0279c7d`, and every host's renders
      are compared with committed goldens under `tools/tool-fleet/src/fixtures/host-renders`.
- [ ] 1.3 Repeats once per server of the platform cluster, after A1, A12 and A16 and before the step that enrolls
      the host, and once more before A17, to give h7obs the capabilities `nonproduction` and
      `ingress` and raise those two floors (minimal profile, once the sum of design decision 2 holds at the reading after A15). The first revision follows the A1 that creates the server that stays: a
      server used for the rehearsal of 2.7 is never recorded. Each revision records the
      node's machine id and private address where the fleet model already records them for
      the two existing nodes (`desired.yaml`, the inventory): that is R5, decided on
      2026-11-21, and its alternative, a private inventory with only the capability
      layout public, stays open to the owner until the first revision is merged; a public address or a
      provider id goes to `$OPS` only and never into this repository. Add the cluster
      `platform-2` (R5) to `infra/fleet/desired.yaml` with its first node and the floor
      `platform-services: 1`; later revisions add each node, raise the floor for its
      capability, and extend `puni_enrolled_private_addresses`. Add
      `infra/ansible/inventory/production-hosts.yml` with the same nodes, the reservations of
      design decision 2, and no CI server: `h8ci` is the one node of the cluster
      `ci-production`, recorded after A9 has created it by slice CI-S2 of the CI change. Each server's tailnet auth key is an input in
      `$OPS`, not a line of the inventory. SSH reaches each server through the bastion
      m2bast1 alone, which is in no k3s group (R17, R55; slice 1.9), and the bastion's
      `ansible_host` is an input in `$OPS` too. The inventory sets
      `puni_private_mtu: 1442`. The `network` role, which sets the interface's MTU from that
      input, asserts before it changes the link that the input does not exceed the MTU the
      interface reports, so a VXLAN sized for 1442 never rides a smaller link; negative: an
      interface reporting 1400 against the input 1442 fails the role before any change
      (fault: compare against the role's 1280 minimum alone, and watch 1442 pass). Each revision records the
      server under the name it was bought with (R3); the placeholders `h6apps`, `h7obs` and
      `h8ci` in these tasks then read as that name. Extend `placement.test.ts` to bind this inventory
      to `platform-2` beside the existing pair. Negatives: a machine id that differs between
      the two files is refused; a node present in one file only is refused. Fault to inject:
      compare node names only and watch the machine-id negative pass wrongly.
      First revision done 2026-11-22: m1plat1 in `platform-2` and `production-hosts.yml`, with the
      bastion of slice 1.9; the revisions for h6apps, h7obs and A17 remain. The binding is
      `tools/tool-fleet/src/inventory-binding.ts`; the cluster and service CIDRs stay k3s's
      10.42.0.0/16 and 10.43.0.0/16, disjoint from 10.10.1.0/24.
- [ ] 1.4 Reservations and coexistence record for a node without Docker services or a
      migration overlap: a record for `h7obs` under `infra/argocd/units/observability`, the
      reservations in the new inventory, MLflow's limit (R15), and, as application
      requests, the non-production rows of design decision 2 that the minimal profile puts
      on that node, the solver's cap included. Test: the observability
      budget test reads the new record. Negative: a reservation in the inventory that differs
      from the record fails. Fault to inject: read the old record for the new node and watch
      the negative pass wrongly.
- [ ] 1.5 `observability-source.ts` takes the cluster as input: the inventory path, the peers
      and the API endpoint come from that cluster's inventory and `desired.yaml` entry, not
      from literals. Test: the existing source tests pass for the old pair unchanged and for
      the new pair. Negative: a peer absent from the named cluster's inventory is refused for
      each cluster. Fault to inject: restore one literal and watch the new cluster's negative
      pass wrongly.

- [ ] 1.7 A registered node's capabilities follow the inventory: its labels and the host
      settings that depend on them (design decisions 1 and 11). k3s applies a node's
      configured labels when it registers, so a capability added or taken later is not
      applied by `join.yml`; and `base` writes `net.ipv4.ip_unprivileged_port_start = 0`
      only where `ingress` is in the node's capabilities when `base` runs
      (`roles/base/templates/k3s-sysctl.conf.j2`), so a node that gains `ingress` after
      its join could not let the non-root Traefik bind 80 and 443. Add a play,
      `playbooks/capabilities.yml`, limited to one node. It first re-applies the
      capability-derived host settings: the `base` role's sysctl template, and the agent's
      or server's configuration file with its label and taint lines, each with its handler.
      A search of `roles/` on 2026-11-22 found three places keyed on
      `puni_node_capabilities`: that template, the two k3s configuration templates, and
      the `solver` role's assertion, which its own playbook runs; the play's contract test
      fails when a fourth appears. It then reads the node's `puni.dev/capability-*`
      labels from the server, adds the ones the inventory names and removes the ones it
      does not, and touches no other label. It refuses to remove a capability while a pod
      that selects it and is not a DaemonSet's is on the node, or while a `Retain` volume
      is bound to the node whose claim's namespace is of an environment that selects that
      capability, whatever its workload's replica count; and it refuses a result the
      placement check of 1.2 would refuse. A DaemonSet's pod leaves by itself when the
      label goes, which is how `ingress` is taken from a node. Test: the play's contract
      test; in the rehearsal of 2.7 a joined agent gains `nonproduction` and `ingress`, a
      pod that selects `nonproduction` is then scheduled there, and a non-root pod on the
      host network binds port 80. Negatives, each with its own fault: a node given
      `ingress` by the play alone, without the host settings, cannot bind port 80 (fault:
      skip the sysctl step, and watch the bind fail in the rehearsal); removing a
      capability with a selecting Deployment pod still on the node is refused (fault: drop
      the pod query); removing `ingress` from a node whose only selecting pod is the
      Traefik DaemonSet's is allowed (fault: count DaemonSet pods, and watch the growth
      step of decision 11 deadlock); removing `nonproduction` while a `Retain` volume of a
      staging namespace is bound to the node, its Deployment at zero replicas, is refused
      (fault: query pods only); a label outside `puni.dev/capability-` set by hand is
      left alone (fault: reconcile every label); a server that would gain `product` is
      refused (fault: skip the placement check). Stop: k3s reverts a label the play set
      when the agent restarts. Then the play's rewrite of the configuration file is what
      holds it, and the restart is part of the test.
- [x] 1.8 Private access on hosts (design decision 12, R47, R49, R52). Lock the Tailscale
      package and its repository key in `infra/versions/toolchain.json`. The `base` role
      installs it and joins the host with the single-use key from `$OPS`, with the tag of
      the host's trust class from the inventory, and reads back that the device is tagged
      and its key does not expire; a second run joins nothing and prints `changed=0`. Every
      run, the first one included, arrives through the bastion on the server's private
      address with the admin key (R55); the tailnet carries no SSH. The same holds for the
      CI server and the operator host. Add to the `network` role an input for the public ports a host may
      serve; for the new inventories anything else that arrives on the public interface is
      dropped in the prerouting hook, before destination NAT, so that a forwarded port such
      as a NodePort is covered and not only what the host itself listens on; the two
      NodePorts of the `otel-gateway` Service are admitted from the enrolled private
      addresses and the CI server's, and from nowhere else; SSH is admitted on the private
      interface from the bastion's address alone and on no other interface; the Kubernetes
      API is admitted on the tailnet interface; the cluster's own ports keep today's rule,
      from the set of enrolled node addresses alone, which never holds the bastion; and for
      the new inventories two rules in a stateful prerouting chain at priority −150, after
      connection tracking and before destination NAT, which accepts
      `ct state established,related` first, then drops `ct state invalid`, and drops new
      connections only, as the public
      drop does: from
      the bastion's address on the private interface everything is dropped but TCP 22 to
      the host's own address, and from a private address that is not an enrolled node,
      traffic to the cluster CIDR, the service CIDR or a NodePort is dropped, the
      `otel-gateway` NodePorts for the CI server and the store's private listener
      excepted by name (design decision 12). The default for existing inventories is
      today's behaviour. Create a local console account that
      `sshd` refuses, its password from `$OPS` (R49). Add `infra/access/policy.hujson` and
      a test that parses it. Tests: the rendered firewall of each new host; the policy
      test. Negatives: a rendered firewall of a new host that admits port 22 on the public
      interface is refused (fault: keep the "retain SSH recovery" rule); one that admits
      SSH on the private interface from an address other than the bastion's is refused
      (fault: admit the whole private range); one that admits SSH on the tailnet interface
      is refused (fault: check the private interface's rules alone); one that admits
      10250 or 8472 from a private address that is not an enrolled node, the bastion
      included, is refused (fault: widen the source to the private range, as an earlier
      draft of this slice did); one that lets the bastion's address reach any port but
      TCP 22, the node exporter's among them, is refused (fault: drop the bastion rule); in
      the rehearsal of 2.7, from a stand-in host on the private network that routes the
      cluster CIDR and the service CIDR via the node, a pod address and a ClusterIP do not
      answer, and from an enrolled node they do (fault: put both rules in the input chain,
      and watch the pod answer); a connection from a server to the bastion's port 22
      completes, and a server's outbound connection to a package mirror on the public
      interface completes (fault: drop without the state match); a non-production
      namespace's egress allow that covers 10.10.1.12 fails rule 2.4(k) (fault: read
      ingress rules alone);
      in the rehearsal of
      2.7 a NodePort Service on a new host does not answer on the public interface and the
      `otel-gateway` ports answer from an enrolled private address only (fault: drop in the
      input hook alone, and watch the forwarded port answer); a host without
      `ingress` that admits 80 or 443 is refused (fault: render the list for every host);
      an old inventory's rendering is byte-equal to today's (fault: change the default); a
      policy file in which a server tag may reach another device, or `tag:ci-trigger`
      anything but the CI cluster's proxy, or in which the Kubernetes operator's tag or its
      proxies' tag may open a connection to another device, is refused (fault: compare tag
      names only); a
      policy file that names a person is refused (fault: skip the check for groups); the
      console account can log in over SSH (fault: drop the `DenyUsers` line).
      Done 2026-11-22 for source and tests. Left at their owners' boundaries: every rehearsal
      negative (2.7); the egress negative of rule 2.4(k) (slice 2.4); the store's private
      listener's exception (pull request #935 defines it); the controller's `ProxyJump` (2.5).
      Amended 2026-11-22 after review. The public side is the declared
      `puni_public_interfaces` (m1plat1: `enp3s0`, its default-route device); the `network` role
      refuses any interface that is not loopback, private, tailnet, pod network (`cni0`,
      `flannel.1`, `veth*`), declared public or a container bridge (`docker0`, `br-*`, whose
      new outbound connections are allowed: the coordinator's decision). New IPv6 on the private interface is dropped by
      the prerouting chain; IPv6 is not switched off by sysctl, because networkd resets
      `disable_ipv6` whenever it configures the link and the role would then refuse to run
      (the coordinator's decision of 2026-11-22, after a second review). Before it limits SSH
      the role requires the private interface to carry the node's address and the play's own
      connection to come from the bastion; the firewall then goes through `tasks/confirmed-firewall.yml`: a
      marker holds the sha256 of the ruleset a fresh controller login confirmed, and whenever
      it differs or the table is not loaded the run saves the live table, arms a timer that
      restores the last confirmed file (or, with none, removes the new one and reloads the
      saved table), loads the rules, and only the fresh login cancels the timer and writes the
      marker. The fresh login is `puni_fresh_user` (the operator) with `puni_fresh_key_file`,
      never `ansible_user`, which is root on a first run; the key file is an input in `$OPS`
      (`puni_operator_private_key_file`, `puni_bastion_admin_private_key_file`), and its
      public half must be one the run installs. A reboot before the timer fires loads the
      unconfirmed file with no timer; the next run finds no marker and arms again. A run that
      finds the revert timer still active stops before it saves anything, because the live
      table is then the unconfirmed one. The operator the fresh login uses comes from
      `roles/base/tasks/operator.yml`, which `playbooks/firewall.yml` runs for a separated
      inventory before the `network` role, so A26 can confirm before A3. The console account comes after a drop-in
      that refuses it and every password, read back from `sshd -T`. Every key list is staged
      from a template loop and counted with `ssh-keygen -lf` before it is installed. Whether
      the public interface uses DHCPv6 or MLD was not read (the read was refused on
      2026-11-22), so only neighbour discovery is accepted there; A26 reads it. The tailnet
      address in the server's certificate names (`tls-san`) is slice 2.5's: the controller
      adds it from the join's read-back before `k3s_server` first runs. Not run on a host: the
      join, the second run's `changed=0`, the timer and the fresh login, and the console
      account's refusal by a live `sshd`.

- [x] 1.9 The bastion as code (R55, design decision 12), after the first revision of 1.3,
      which creates the inventory file, and before A26. m2bast1 was set up by hand on
      2026-11-22. Add it to `infra/ansible/inventory/production-hosts.yml` in a group
      `bastion`, with its private address and its `ansible_host` from `$OPS`, in no k3s
      group and not in `gate_hosts`. Add a role `bastion` and `playbooks/bastion.yml`: the
      user `jump` with the shell `/usr/sbin/nologin` and the jump key alone, which is not
      the servers' admin key; an `sshd` drop-in, named so that it is read before any other,
      that refuses passwords for every user and, for `jump`, sets `PermitTTY no`,
      `AllowAgentForwarding no`, `X11Forwarding no`, `AllowStreamLocalForwarding no`,
      `PermitTunnel no`, `AllowTcpForwarding local` and `PermitOpen` to each server's
      private address and port 22, rendered from the inventory's k3s groups and its hosts
      outside the cluster, a temporary server of A6 included while it exists; the
      operator's own login with a shell, by the bastion's admin key, which is neither the
      jump key nor the servers' admin key (A2), on the same public port; a
      console account as slice 1.8 makes one; and an nftables set that admits TCP 22 on the
      public interface with new connections limited per source address, TCP 22 on the
      private interface from the observability node's address alone, established traffic
      and nothing else inbound, and sends anything out. The play reads `sshd -T -C user=jump,...` back and compares every option above
      with the render. The placement check of 1.2 refuses a `bastion` host in a k3s group or
      in `gate_hosts`, and slice 3.2's outside probes include the bastion, with an alert
      when it stops answering on port 22 (R16); until stage 3 brings the prober, the
      bastion is unprobed. Tests: the role's rendering for the
      production inventory; the play's contract test. Negatives, each with its own fault: a
      `PermitOpen` entry for any port but 22 is refused (fault: render without the port
      check); a server of the inventory missing from `PermitOpen` fails (fault: render from
      a literal list); the `jump` user with a login shell fails the role test (fault: drop
      the shell line); a rendered public port set other than exactly {22} is refused, an
      empty set included (fault: check that 22 is present rather than that it is alone); a
      rendering without the per-source limit on public 22 is refused (fault: drop the
      meter); private 22 admitted from any address but the prober's is refused (fault:
      admit the private range); a
      bastion in `k3s_agents` is refused (fault: skip the `bastion` group in the
      comparison); a fixture host with an earlier drop-in that sets another `PermitOpen` for
      `jump` fails the read-back (fault: compare the rendered file rather than `sshd -T`);
      `AllowTcpForwarding` other than `local` for `jump` is refused (fault: check
      `PermitOpen` alone). Stop: `sshd -T` on the live bastion differs from the render after
      the play; then the difference is reported and nothing is enrolled through it.
      Done 2026-11-22 for source and tests; the outside probe is slice 3.2's and the first run
      is A26. The read-back was tested against a stand-in `sshd`, not a live one. The drop-in
      names the operator and `jump` in `AllowUsers` and refuses root, and the role removes the
      hand-made `10-puni-jump.conf`, whose `AllowUsers root jump` would accumulate; the hand-made
      nftables rules are left for A26 to read and remove.
      Amended 2026-11-22 after review. The sshd change copies aside both drop-ins the
      host has (`00-puni-bastion.conf` of a previous run and the hand-made
      `10-puni-jump.conf`) and is a block whose rescue puts back exactly those, removes the
      new drop-in only where none existed, and reloads; it is entered when validation, the
      read-back (every option, and the `AllowUsers` and `DenyUsers` lines exactly) or a fresh
      controller login as the operator fails. A run that changed nothing fails without
      touching sshd. Tested with a stand-in `sshd` and `ssh`, across two runs. The firewall
      goes through the same confirmed-firewall file as the servers'; its unit is shaped like `nftables.service` and passes `systemd-analyze verify`.
      `MaxAuthTries` is 6, and the controller's fresh login sets `IdentitiesOnly=yes` with one
      key (`tasks/fresh-connection.yml`); slice 2.5's `ProxyJump` settings should set the same.
      IPv6 arriving on the bastion's private interface is dropped; that interface,
      `puni_bastion_private_interface`, is assumed `enp8s0` and the role refuses it unless the
      facts show it carrying 10.10.1.12.

## 2. Argo CD delivery (agent slices)

Slices 2.1 to 2.6, 2.9 and the receipt 2.7/A3 are needed before A3 and A4; 2.8 before stage 3;
2.10 before A17; 2.11 and the receipt 2.7/A27 before A27.

- [ ] 2.1 Locked install and CLI. Vendor the Argo CD v3.6.2 install manifest in
      `infra/argocd/install` with its SHA-256 under `manifests.argocdInstall` in
      `infra/versions/toolchain.json`, lock the `argocd` CLI of the same version under
      `binaries`, and add a schema variant that keeps retained locks readable. The
      kustomization removes Dex, the notifications controller and the ApplicationSet
      controller; pins every image by digest; sets the selector, toleration and the limits of
      R24; sets `kustomize.buildOptions: --enable-helm`, `policy.default: role:readonly`,
      `application.sync.requireOverridePrivilegeForRevisionSync: "true"`,
      `server.rbac.rollback.enforce.enable: "true"`, the local account with the one grant of
      R23 and `admin.enabled: "false"`; adds the NetworkPolicy. Test:
      `contracts.test.ts` accepts the lock and the render has four workloads. Negatives, each
      with its own fault: changed manifest bytes are refused (fault: drop the digest
      comparison); a rendered image without a digest is refused; a render with an Ingress,
      with `admin` enabled or with a default role other than `role:readonly` is refused; a
      policy that grants the account `sync` outside `production/*`, or `override` or
      `rollback` anywhere, is refused (fault: widen the grant to `*/*`); a render without the
      override setting is refused; a render without the rollback setting is refused (fault:
      drop the key); a render with the health customization for `argoproj.io/Application` is
      refused, because the design relies on its absence.
- [ ] 2.2 Wrapper charts. For cert-manager and Traefik: a chart directory under
      `infra/argocd/units` whose `Chart.yaml` names the locked archive as a dependency, whose
      `charts/` holds it, and whose values are those of the existing `HelmRelease`. Its
      `releaseName` is the old release's name, because selectors in the tree name it. Test:
      the locked `helm template --include-crds` output of the wrapper equals the render
      `tool-fleet` already makes of the `HelmRelease`, release name and CRDs included, apart
      from placement, and `helm template` succeeds with the network disabled. Negatives, each
      with its own fault: an archive whose SHA-256 differs from the lock is refused (fault:
      skip the digest comparison); a value that renders differently on a second run fails
      (fault: add a generated value); a wrapper with another release name fails the equality
      test (fault: drop `releaseName`).
- [ ] 2.3 Platform-stage units: `namespaces`, `policy`, `storage` and `issuers` as kustomize
      directories under `infra/argocd/units`, copied from the manifests the Flux stages
      `controllers`, `policy`, `storage` and `platform` render: every namespace, the admission
      and network policy, the storage classes, the registry CA issuer and the staging ACME
      issuer, which gains one HTTP-01 solver per environment, chosen by that environment's
      host names, with a pod template that selects its capability (design decision 3),
      with no Distribution workload (R10), without the `registry-tls` Certificate,
      which is the Harbor unit's, and without the `otel-server` pair, which is slice 2.8's.
      `namespaces` also carries `website-prod-logs`, which no manifest of this repository
      declares today, the staging namespaces and the three dev namespaces of design
      decision 1. The ConfigMap `puni-trusted-workload`
      carries the ignore rule of design decision 3. Test: each directory's render equals the
      old stage's render at this commit, apart from Flux kinds, placement, the issuer's solvers
      and the rows of decision 3's table. Negatives: an ACME issuer with a solver whose pod
      template selects no capability, or the other environment's, fails the `delivery`
      check (fault: read the first solver only); a copy that drops a NetworkPolicy fails the equality test
      (fault: delete one copied object); a `policy` Application without the `solverImages`
      ignore rule and `RespectIgnoreDifferences=true` fails the `delivery` check (fault:
      remove the rule).
- [ ] 2.4 Application graph and the `delivery` check family. Add the root Application and the
      `root` AppProject under `infra/argocd/root`; the `platform`, `staging` and `production`
      AppProjects and one Application file per unit of orders 0 to 3 under
      `infra/argocd/clusters/platform-production`; and `tools/tool-fleet/src/argocd.ts`,
      wired into `tool-fleet:check`. The check refuses each of the following. Each letter has
      its own negative and its own row in `check-faults.ts`, whose fault is that rule removed.
      (a) An Application outside its project's sources or destinations, one of a project
      other than `ci` with a destination other than the in-cluster API (a `ci`
      Application names the CI cluster only, by the CI change's rule), or one with a
      `targetRevision` other than `main` in its file. A `staging` or `production` project whose destinations are not exactly the
      namespaces the `namespaces` unit declares for it, named one by one: a wildcard,
      `argocd`, the store's namespace or any namespace outside that list is refused; one
      that admits a cluster-scoped kind or a Namespace; one without a
      `namespaceResourceWhitelist`, or whose list names a kind its overlays do not render. A
      `staging` project with a source other than the staging pins repository and, until
      their owner moves them, the fleet repository's staging overlays of the website and
      the request app; a `production` project that names the pins repository. A
      `platform` Application whose objects land in an app namespace, unless it is
      `namespaces`, `policy` or `secret-sync`, which write there by design (design decision
      3). A fleet-sourced Application in `platform` other than `public-issuers` at its one
      path. Three negatives of its own: a `staging` project widened to `argocd`; one widened
      to the store's namespace (fault: refuse only a namespace of the other environment, as
      an earlier draft did); and a platform unit other than those three that renders into a
      staging namespace (fault: exempt the whole `platform` project). (b) Automation in the
      wrong place: a `staging`
      Application without automated `prune`, `selfHeal` and a retry policy, or with
      `allowEmpty`; a `production`
      or `platform` Application with automated sync; a root without automated self-heal, or with
      prune; any Application with the resources finalizer. (c) A `puni.dev/sync-order`,
      `puni.dev/needs` or project that is missing or differs from the table of design
      decision 3 or, for a unit of the `ci` project, from the table of the CI change's
      decision 1; a need of the same or a higher order; and a unit ordered at or below the
      unit that provides a Secret it reads, with the same-unit Job exception of that decision.
      (d) A rendered object of a `toolkit.fluxcd.io` group, a remote kustomize base, a
      document with a `sops` key or a Secret object under an Application source path, or a
      sync-wave annotation on an Application. (e) A file that is in an Application's source
      closure and in the closure of a Flux unit under `infra/clusters`, chart archives
      excepted. (f) A pod template without a capability selector, or one that tolerates
      `CriticalAddonsOnly` or every taint without selecting `platform-services`. The three
      node-agent DaemonSets of design decision 1 are exempt by name; a fourth DaemonSet, or a
      Deployment, with a blanket toleration is refused. An ACME issuer whose HTTP-01 solvers
      do not give, for each environment's host names, a pod template that selects that
      environment's capability. (g) A PersistentVolumeClaim, a
      namespace that holds one, or an Elasticsearch, Prometheus or Alertmanager resource
      without `Prune=false` and `Delete=false`. (h) A Distribution workload. (i) A Job that
      carried Flux's `force` annotation without `Force=true,Replace=true`. (j) A kustomize
      unit that inflates a chart whose archive has a `crds/` directory at any depth without
      `includeCRDs: true`, or a Helm source of such a chart with `skipCrds`. (k) A `staging`
      Application whose source is a production overlay, or the reverse; an ExternalSecret
      in one environment whose store path names the other; a pod template of a `staging`
      Application that does not select the capability `nonproduction`, or one of a
      `production` Application that does not select `product`; a rendered object of a
      staging or production Application (an environment value, a ConfigMap value, a
      NetworkPolicy peer, an ExternalName) that names a namespace of the other or a
      Service in one; and an egress allow in a non-production namespace, from the `policy`
      unit or an overlay, that covers the bastion's address, read from the inventory's
      `bastion` group: an egress rule with no `to`, or an `ipBlock` whose CIDR contains
      that address and whose `except` does not exclude it. (l) Anything in the root's source path
      that is not an Application or an AppProject; a `root` project that admits another kind
      or a destination other than the `argocd` namespace; an Application file with an
      `operation` block; an Application in the `root` project other than the root; an
      AppProject file with `roles` or `syncWindows`; a file in the root's path that defines
      an Application or an AppProject named like the root or its project. (m) An
      Ingress, a Traefik `IngressRoute` or `IngressRouteTCP`, or a Certificate of a staging
      or production Application that names a host outside the list the `policy` unit holds
      for its namespace, or that names no host, a wildcard or a host pattern; a host that
      two namespaces' lists share; a staging or production Application that does not
      need `policy`. Slice 2.10 enforces the same list at admission. (n) A PersistentVolumeClaim in the tree that no
      backup CronJob of its unit mounts, unless a short exemption table names it with its
      reason; the table starts with `wbs-mcp` (design decision 7) and the stores an operator
      snapshots. The family also runs as
      `argocd.test.ts` over the repository's real tree, as `platform.test.ts` does for
      `validatePlatform`, and that project's inputs name `infra/argocd/**`, so the required
      `gate` check selects it for a change under that path alone. Negative: a change to one
      file under `infra/argocd` selects the test (fault: drop the input glob). (p) A pod
      template of an observability unit or of `mlflow` without the PriorityClass of slice
      2.8, and a pod template of a staging or dev Application that names any
      `priorityClassName`; negatives: one of each (faults: read the Prometheus stack's
      templates only; allow the cluster's default class by name). (q) No public route but Traefik's
      (design decision 12): an Ingress, an IngressRoute or a Gateway route in a unit of
      the `platform` or `ci` project is refused, except an Ingress of the Tailscale
      operator's class and the `traefik` unit itself; a Service of type LoadBalancer or
      NodePort is refused in a unit of every project, with two exemptions by name: the
      `otel-gateway` Service, whose ports the firewall of slice 1.8 admits from enrolled
      private addresses only, and the store's private listener in whatever form pull
      request #935 gives it; negatives: one of each kind (fault: check Ingress only), a
      NodePort Service in a staging overlay (fault: read the `platform` and `ci`
      projects only), and an Ingress of the operator's class passes. (r) The tenant label (design decision 13):
      a namespace of a `staging`, `production`, CI or database unit without
      `puni.dev/tenant`, and an object in such a namespace that carries another tenant's
      label; negatives: one of each (fault: read namespaces only).
- [ ] 2.5 Bootstrap and sync playbooks, and the controller that runs them.
      `infra/ansible/playbooks/argocd.yml`: require the cluster id, the install digest and
      the secret file list; refuse a host that has a `flux-system` namespace or whose node
      name is in another inventory; create the immutable identity ConfigMap
      `kube-system/puni-cluster-<id>` when the cluster has none, as only the Flux play does
      today, and refuse a cluster that has one for another id; apply the `namespaces` unit;
      decrypt each bootstrap Secret of design decision 5 on the controller with `sops` and
      apply it through the API under `no_log`; apply the install with a server-side apply;
      wait for the workloads; apply `infra/argocd/root`, which is the root Application and its project.
      `playbooks/argocd-sync.yml`: take a list of units; refuse a unit that is in neither
      the `platform` nor the `ci` project, and a unit while one of the units its `puni.dev/needs`
      names is not Synced and Healthy; sync each in order with the locked `argocd` CLI in core
      mode on the server and wait for Synced and Healthy. Its removal mode deletes the
      Application object of a unit of any project, since nothing else can delete a staging or
      production Application, and refuses one that still has a file on `main` or whose live
      source renders more than the marker ConfigMap. The controller: add the locked `sops` binary to
      `infra/controller/Containerfile`. The image that mounts the age identity and the
      admin key is built on the controller itself, the operator's laptop, from a clean
      checkout of a named commit of `main`; `fleet_ansible` refuses to mount them into
      an image whose digest differs from the lock's or from the digest of the
      controller's own build of that commit, which it records beside the lock (design
      decision 10). The same mount carries the jump key and the `ProxyJump` setting for
      every host behind the bastion, and, for `bastion.yml` alone, the bastion's own admin
      key (R55), from `$OPS`, under the same refusal. It is run
      on the operator's laptop only. Add a read-only mount of a fleet repository checkout
      to `fleet_ansible`, named by an input in `$OPS`. Test: `infra/ansible/tests`, including
      a second run of `argocd.yml` with one more secret file, which changes that Secret and
      nothing else; the image test finds `sops` at its locked digest. Negatives, each with
      its own fault: an image at the locked digest with no record of a local build of the
      same commit is refused the keys (fault: compare with the lock alone); a wrong
      install digest is refused; a missing secret file is refused
      before anything is applied; a host with `flux-system` is refused (fault: remove that
      guard); a cluster that already carries another id's ConfigMap is refused and nothing is
      applied (fault: create without reading); a second run on the same cluster leaves the
      ConfigMap unchanged; the sync playbook refuses a production or staging unit (fault:
      drop the project comparison) and a unit one of whose needs is unhealthy (fault: skip
      the needs read), and syncs a unit whose needs are healthy while an unrelated unit of a
      lower order is not (fault: compare orders, as an earlier draft did); the removal mode
      refuses a unit whose file is still on `main` (fault: skip the file read) and removes a
      fixture production Application reduced to its marker (fault: apply the sync mode's
      project comparison to removal).
- [ ] 2.6 Health and recovery for a cluster delivered by Argo CD. `tool-fleet:health` gains a
      rule that reads Applications where the cluster's delivery is Argo CD and no longer
      reports "no Flux objects" there. It fails on a Degraded Application, on a staging
      Application that is OutOfSync and on an Application in the cluster that has no file; it lists a production or platform Application that is
      OutOfSync with how long it has been so, without failing. The recovery manifest and
      `verify-cold-restore` accept such a cluster, and the drill's last step reads the root
      Application. Test: the health and recover suites for both deliveries. Negatives: a
      Degraded Application fails health; an OutOfSync staging Application fails health; an
      Argo CD cluster with no Application fails health. Fault to inject: treat a missing
      Application list as healthy.
- [ ] 2.7 Rehearsal. A k3d lab profile that brings the new tree up with the bootstrap and
      sync playbooks' steps, and the staged build on the QEMU lab. Host: the operator's
      laptop, which has `/dev/kvm`, once it has 60 GiB free; it does not today.
      Otherwise, as design decision 10 states: the k3d part on a server created as in A1,
      and the staged build as a throwaway pass on that server and one temporary server, with
      secrets made for the pass, an uncommitted inventory and a scratch bucket. Both servers
      are deleted afterwards and nothing of them is recorded in this repository.
      Fixture Applications stand in for apps that do not exist yet. The receipt is in four
      parts, each due before the step it names, so that no part waits for units of a later
      stage.
      **2.7/A3**, before A3 and A4, with slices 1.2 and 2.1 to 2.5: (a) validation's result
      on a one-node cluster registered with both taints, and CoreDNS's tolerations after it;
      (b) orders 0 to 3 Synced and Healthy from an empty cluster, synced by the playbook;
      (c) every object of those units OutOfSync after the first sync with no Git change,
      which starts the `ignoreDifferences` list; (d) what cert-manager's hooks did; (e) that
      `argocd-secret` kept the password hash and its generated keys after a sync of `argocd`;
      (f) whether helm followed a linked chart archive; (g) a rewritten `solverImages` left
      alone by a sync of `policy`; (h) the CLI in core mode syncing a platform unit with no
      Argo CD account; (i) with fixture Applications: the local account syncing a production
      one, refused on a platform and a staging one, refused a revision other than the
      Application's, and refused a rollback; a manual edit reverted on staging and left in
      place and reported OutOfSync on production; a merge left unapplied on production until a
      sync; automation switched on in the cluster for a production Application and switched
      off again by the root; an Application file removed and its object left in place; an
      `operation` block refused by the check; a deleted manifest whose claim survived; a unit
      reduced to its marker and synced with prune losing its workloads and keeping its claim,
      then removed by the removal mode; (j) the playbook refusing a unit whose need is
      unhealthy and syncing an unrelated one.
      **2.7/A7**, before A7, with pull request #935's units: orders 4 to 7 Synced and Healthy;
      an ExternalSecret without a value keeping `secret-sync` from Healthy; with the store
      sealed, the units that need `secret-sync` refused and `eck-operator` synced.
      **2.7/A14**, before A13, with slice 2.8: the unit states after each staged join, with
      the firewall refreshed first, and the time of an etcd restore; orders 8 to 12 Synced
      and Healthy; a changed `force` Job recreated; the Velero and Prometheus stack CRDs
      present; whether kustomize inflated a chart from a local archive with the network
      disabled; a Certificate that cannot be issued keeping its unit from Healthy; the
      `otlp-ingress` NetworkPolicy selecting the collector's pods; the rest of the
      `ignoreDifferences` list.
      **2.7/A18**, before A17's sync of slice 2.10 and A18: with slice 1.7, a joined agent
      given `nonproduction` and `ingress` by the capability play, a pod that selects
      `nonproduction` scheduled there afterwards, and the labels still present after the
      agent restarts; Traefik's CRDs present; with
      slice 2.10 and fixtures, a pod in a staging namespace that selects `product` denied,
      an IngressRoute there that names a production host denied, and an object of a kind
      outside the staging project's whitelist refused at sync; with the real staging
      overlays, a merge that changes two dependent staging units at once converging by
      retry, with the retries counted; with a fixture pins repository, a commit of
      rendered manifests applied by a staging Application with no command, and a manifest
      removed from it pruned; a solver-shaped pod in a staging namespace admitted with
      the `nonproduction` selector and denied without it; a route with no host denied; a
      Service of type NodePort in a staging namespace denied at admission; two fixture
      builds of one app finishing in reverse order, the later commit's render staying in
      the pins directory and the earlier one refused; a fixture build whose source commit
      edits an applied migration refused by the render step; a recreated Tailscale proxy pod
      answering again under its name, and what that needed from the owner.
      Stop: a unit cannot become Healthy, or validation cannot pass with one node. Then
      design decisions 3 and 6 are revised before the step that part gates. Fallbacks already
      decided: for (e), the Secret leaves the managed set; for (f), the wrapper holds a copy,
      and Velero uses a committed render. For (a) and (h) there is none: the owner decides
      (slice 1.2, design decision 3).
- [ ] 2.8 Units for orders 8 to 12, before stage 3: the fifteen operator-provided Secrets as
      ExternalSecrets added to `secret-sync` (R22); `otel-certificates`; wrapper charts for
      the ECK operator, the Prometheus stack and the OTel collector; Velero as a kustomize
      unit that inflates its chart and carries the patch of its `postRenderers` and
      `includeCRDs: true`; kustomize units for Elasticsearch, Kibana, `elastic-settings`,
      signals, alerts and the Elasticsearch snapshots, with `Force=true,Replace=true` on the
      three Jobs and the cluster name in the Prometheus stack's values file;
      `ServerSideApply=true` where CRDs need it. The `otel-gateway` Service keeps its two
      NodePorts, because collectors on other clusters, the CI cluster among them, reach
      it on the provider's private network; rule 2.4(q) exempts it by name and the
      firewall of slice 1.8 admits its ports from enrolled private addresses only. One PriorityClass, `puni-observability`,
      above the cluster default, in the first of these units, and named by every pod
      template of the units and of `mlflow`, so that the pods have it from their first
      start in A14 and no later change restarts them (design decision 2; rule 2.4(p)).
      The `alerts` unit carries two node rules: a node's available memory under 1,024 MiB
      for ten minutes, and a container killed for memory, each naming the node. It leaves out the workers
      rule and every rule about an app's backup CronJob; each of those is added by the
      revision that adds its app, and one more rule fires when a production or platform
      Application has been OutOfSync for 24 hours. A table of operator-made Secrets names
      the two that ECK makes for Elasticsearch and the one it makes for Kibana, each with its
      providing unit. Tests and negatives as 2.2 and 2.3, plus, each with its own fault: a
      unit that reads a Secret with no provider (bootstrap entry, ExternalSecret, Certificate
      in the tree, or a row of the operator table) fails the `delivery` check (fault: remove
      one ExternalSecret); a unit ordered at or below its Secret's providing unit fails rule
      (c) (fault: move `signals` to Elasticsearch's order), while the `kibana-objects` Job
      reading its own unit's operator-made Secret passes; an alert rule whose selector names
      a CronJob, namespace or cluster that no unit of the tree renders at that revision fails
      the check (fault: copy the workers rule); an ExternalSecret whose value is absent keeps
      `secret-sync` unhealthy in the lab (fault: mark it healthy by a customization); the
      `otel-server` Issuer ordered at or below `secret-sync` fails rule (c) (fault: move it
      to order 3); Velero's render without the two size limits fails the equality test
      (fault: drop the patch); the Prometheus stack's render without its ten CRDs fails the
      equality test (fault: set `skipCrds`); an observability pod template without the
      PriorityClass fails rule 2.4(p) (fault: set it on one unit only); each node rule
      fires on its `promtool` fixture and is quiet above its threshold (fault: compare
      total memory, not available).
- [ ] 2.9 Runbook `docs/infra/build-platform-cluster.md`: the build from empty servers, with
      every `$OPS` input, the escrow step for each new secret, the receipts of A1 to A8, how
      a change reaches staging, how production and a platform unit are synced and by whom,
      how a change is reverted, what the sync order does and does not cover, how drift is
      seen, how to reach the Argo CD interface over the private access network, the console path
      when that network cannot be used,
      removing a unit in two merges, and the break-glass procedure. Link it from
      `docs/infra/README.md`. Test: the `tool-devsync` document tests and `check-indexes`.
- [ ] 2.10 Containment at admission, before A17 (design decision 3, R34). In the `policy`
      and `namespaces` units of the new tree only: the label `puni.dev/environment` on
      every namespace, reserved by the namespace-label policy; the labels
      `pod-security.kubernetes.io/enforce: restricted` and `enforce-version: latest` on
      every staging and dev namespace, except an environment's solver namespace while it
      has a solver, which carries `warn` and `audit` as `wbs-solver` does today and is held
      by slice 3.8's trusted-hostpath policy; an admission policy, in the form the
      trusted-workload policies use (`ValidatingAdmissionPolicy`), that denies a pod in a
      `staging` or `dev` namespace without the `nonproduction` selector and one in a
      `production` namespace without `product`, with no exemption; an admission policy
      that denies an Ingress, a Traefik `IngressRoute` or `IngressRouteTCP`, or a
      Certificate whose host is not in its namespace's list, or that names no host, a
      wildcard or a host pattern; the lists as one ConfigMap in a platform namespace,
      which the policy's binding names as its parameter; an admission policy that denies a Service of type
      LoadBalancer or NodePort in every staging, dev and production namespace, because
      a pins commit is not read by `gate`; a ResourceQuota and a
      default-deny NetworkPolicy, ingress and egress, in every non-production namespace,
      the three dev ones included, whose egress allows never cover the bastion's address
      (rule 2.4(k)), the quotas summing to no more than the non-production rows of design
      decision 2; an admission policy that denies a pod in a `staging` or `dev` namespace
      that names a `priorityClassName`, so that none can take the class slice 2.8 gives
      the observability units, with which they share a node in the minimal profile; in every app namespace an allow, by `ipBlock`, for Traefik, which runs on
      the host network, to reach pods that carry cert-manager's HTTP-01 solver label, with
      the addresses the k3d case below shows; the `namespaceResourceWhitelist` of the
      `staging` project. Test: the policy suite on disposable k3d and the `delivery`
      check; on k3d also a solver-shaped pod under the default-deny, reached from a
      host-network pod on its own node and from one on another node, with the source
      address each shows recorded in verify.md. Negatives, each with its own fault and
      `Proof:` comment: a pod in a staging namespace that selects `product` is denied
      (fault: match the namespace's name, not its label); a pod in a dev namespace with no
      selector is denied (fault: bind the policy to `staging` alone); a pod in a staging
      namespace that names `puni-observability`, or any class, is denied (fault: deny that
      one name only); a privileged pod,
      and one with a `hostPath`, applied to a staging namespace is refused by Pod Security
      (fault: label the namespace `warn` only); a staging or dev namespace without the
      enforce label, other than a solver namespace that slice 3.8 admits, fails the
      `delivery` check (fault: exempt every namespace whose name begins with `wbs`); a
      solver-shaped pod with no selector is denied and one with its environment's is
      admitted (fault: exempt pods that carry the solver label); a pod on the pod network
      is refused the solver port (fault: allow the whole pod network); an IngressRoute in
      a staging namespace that names a production host is denied (fault: validate Ingress
      alone); a route with no host, and one with a wildcard host, is denied (fault: skip
      a rule that has no host); a Service of type NodePort in a staging namespace is
      denied (fault: deny LoadBalancer alone); a Certificate for a host on no list is denied (fault:
      allow an empty list); a host list placed in the app namespace is not read (fault:
      resolve the parameter in the request's namespace); a namespace relabelled by a
      writer other than the `namespaces` unit is denied (fault: drop the reservation); a
      non-production namespace without a quota or a default-deny fails the `delivery`
      check (fault: exempt the dev namespaces); a staging project whose whitelist is a
      wildcard fails rule 2.4(a). Stop: the host rule cannot be written for Traefik's
      custom resources in that form. Then it is reported, rule 2.4(m) stays the only
      check for those kinds, and the dev follow-up may not admit them. Stop also: Traefik's
      traffic cannot be told from the pod network's by address. Then it is reported, and
      the allow names the solver port for the node addresses the case showed.

- [ ] 2.11 Rancher Manager, before A27 (R54, design decision 14). Lock `charts.rancher` in
      `infra/versions/toolchain.json` as the other chart entries are locked: v2.15.3, its
      URL, its SHA-256 (read as `343888c6…` on 2026-11-22 and read again when locking), the
      images the chart renders by digest, and the k3s minors SUSE's matrix certifies for a
      cluster that hosts that version, `v1.34` to `v1.36`, with the page and the date read;
      the archive goes to `infra/platform/charts` beside the others (R21). Add the kustomize
      unit `infra/argocd/units/rancher`, which inflates the archive with the values of
      design decision 14, deletes the five pre-upgrade objects and the PriorityClass
      `rancher-critical`, and adds the Ingress of the Tailscale operator's class; in the
      `policy` unit, the class `puni-platform-interface` and an admission policy that
      denies a pod in `cattle-system` whose `metadata.name` or `metadata.generateName`
      begins `dashboard-shell-`; in the
      `namespaces` unit, `cattle-system`, `cattle-fleet-system` and
      `cattle-fleet-local-system`, each with the `scheduler.alpha.kubernetes.io/node-selector`
      annotation for the `platform-services` capability (the API server flag is slice
      1.2's, due before A3); a kube-state-metrics alert for a pod in a `cattle-` namespace on another node; its SecretStore and the ExternalSecret `bootstrap-secret` in
      `secret-sync`, landing with A27's revision and not with A7's; the Application file at
      order 7 with its needs; an alert when `rancher-webhook` has no ready pod for ten
      minutes; and, in the runbook of slice 2.9, the step that deletes the
      `rancher.cattle.io` webhook configurations while the webhook is down, and the removal
      order of design decision 14. Rule 2.4(x), lettered after (w): an object of the
      `fleet.cattle.io` group under any source path. Rule 2.4(y), the `rancher` render, at
      any depth of its values and of its rendered objects: other than one replica; an
      Ingress of a class other than the Tailscale operator's, or a Gateway route; a
      `hostname`; a non-empty `bootstrapPassword`; `useBundledSystemChart` off;
      `continuous-delivery` or `turtles` not set to false in `features`; no
      `CATTLE_IMPORTED_CLUSTER_VERSION_MANAGEMENT=false`; a pod template, hook pods
      included, without the platform toleration and capability term; `webhook` or `fleet`
      values without them; an `IMPERATIVE_API_DIRECT` other than "true"; no
      `CATTLE_FLEET_AGENT_DEFAULT_AFFINITY` naming the capability; session and token
      lifetimes above 720 minutes, or an idle session lifetime above 60; a `priorityClassName` other than
      `puni-platform-interface`; a PriorityClass object. The toolchain check refuses a k3s
      pin whose minor the Rancher lock does not list, and a Rancher lock without that list,
      and renders the chart with `helm template --kube-version` set to the k3s pin.
      `tool-fleet:health` fails on a `GitRepo` or a `HelmOp`; on a `Bundle` or a Helm
      release not on the lists of Rancher's own, which A27 records; on a
      `plans.upgrade.cattle.io` object; on a node whose kubelet version is not the pin; on
      a shell pod; and on any pod in a `cattle-` namespace or a namespace Rancher made that
      runs on a node other than the platform node. Tests: the unit's locked render with the
      network disabled holds no Secret, no hook object and no PriorityClass but the plan's,
      and equals the archive's render with those values and those patches; the health and
      toolchain suites. Negatives, each with its own fault and `Proof:` comment: a `Bundle`
      of `fleet.cattle.io` in a unit fails rule (x) (fault: look for `GitRepo` alone); for
      rule (y), one negative per item above, each with the fault that drops that item's
      comparison, and in particular: a render with two replicas set in the deployment
      patch, not in the values (fault: read the values file only); a `fleet` value without
      the toleration (fault: read the top-level values only); the pre-upgrade Job left in
      the render without placement (fault: exempt hook objects); an Ingress of Traefik's
      class (fault: allow any Ingress); a `priorityClassName` left at `rancher-critical`
      (fault: check that a class is set rather than which); `continuous-delivery` left on
      (fault: read `turtles` alone); a k3s pin of `v1.37.0+k3s1` against this lock is
      refused (fault: compare the major alone); a Rancher lock without its list of minors
      is refused (fault: treat a missing list as any minor); a `GitRepo` in `fleet-default`
      fails health (fault: list `fleet-local` alone); a `HelmOp` fails health (fault: list
      `GitRepo` alone); a Helm release in a `cattle-` namespace that is not on the list
      fails health (fault: count every release in a `cattle-` namespace as Rancher's); a
      `plans.upgrade.cattle.io` object fails health (fault: read nodes alone); a node whose
      kubelet version is off the pin fails health (fault: read upgrade plans alone); a
      shell pod fails health (fault: skip `cattle-system`); a `Bundle` not on Rancher's
      list fails health (fault: count every `Bundle` in `fleet-local` as Rancher's); a
      Rancher pod on a second node fails health, with a fixture whose node list puts the
      platform node second (fault: compare against the node list's first entry); a
      `dashboard-shell-` pod is denied at admission (fault: match the name exactly rather
      than by prefix), and one that carries only `generateName` is denied too (fault: match
      `metadata.name` alone); a pod applied to `cattle-system` with a selector for another
      capability is admitted with the namespace's selector added and is never scheduled
      off the platform node (fault: leave the annotation off the namespace); a pod there
      with `puni.dev/capability-platform-services: "false"` is refused (fault: leave the
      annotation off the namespace); `IMPERATIVE_API_DIRECT` patched to "false" fails rule (y) (fault: read
      only the variables the values set). Rehearsal, part **2.7/A27** of slice 2.7, before A27, in two passes on the k3d
      lab. First on a cluster of the tainted server alone, with no agent: `rancher` Synced
      and Healthy from the playbook, every sync finishing with no Pending pod; the Helm
      operation pods, the webhook, Fleet and the local Fleet agent Ready there, the agent's
      affinity read back as the capability; no remote dialer proxy and no
      system-upgrade-controller; `PodNodeSelector` enabled by the k3s server's flag, read in
      the API server's arguments, and a pod without a selector given the namespace's; a
      shell opened in the interface denied; the first login with the password the
      ExternalSecret wrote and no Secret written by Rancher before it; the interface through
      the Tailscale Ingress, websockets included, where the lab has a tailnet; one Namespace
      create refused with the webhook at zero replicas, and accepted again after its
      configurations are deleted; Argo CD's difference for the unit after an hour, which
      starts its `ignoreDifferences` list. Then with one untainted agent added: no Rancher
      pod on it, and health failing when one is moved there by hand. Last, the removal order
      of design decision 14, with Namespace writes working afterwards and API discovery
      reporting no error. Stop: Rancher is not Ready with one replica on the tainted server
      alone, or a pod it starts cannot be placed there. Then the owner decides between
      removing Rancher and accepting the gap, and the decision is recorded in verify.md.

## 3. Custody, probes and what other owners provide (agent slices)

- [ ] 3.1 SQLite custody in the cluster, before A18, which first syncs it (R13, guard 3). A unit
      `sqlite-custody`: a CronJob that applies the retention of
      [recovery](../../../docs/infra/recovery.md#bucket-lifecycle) to the cluster's own
      prefixes as a pure planner plus a thin shell. Beside it, a PrometheusRule template that
      each app's overlay instantiates for its own backup CronJob, so a rule lands with its
      subject. Its source is the pair of kube-state-metrics series the existing
      `PuniSqliteBackupStale` rule reads, `kube_cronjob_status_last_successful_time` and
      `kube_cronjob_created`: it fires when the last success is older than two intervals,
      when the job has never succeeded for that long, and when the series is absent. The new
      cluster's app overlays set `BACKUP_PREFIX` to a value that names the cluster and the
      environment and is neither `sqlite` nor under `sqlite/`. Test: the planner over a
      fixture listing; `tool-deploy:test:backup` with one prune run; the rule under
      `promtool`. Negatives: a snapshot whose report is missing is kept and reported; the
      newest report is never planned for deletion; a listing error deletes nothing; an app
      overlay whose prefix is `sqlite` or begins with `sqlite/` fails the `delivery` check;
      two overlays with one prefix fail it; a staging overlay that reads the object storage
      credential a production overlay reads fails it; a last success older than two intervals fires the
      rule; an absent series fires the rule. Faults to inject, one per negative: delete a
      snapshot without its report; drop the newest-report guard; treat a partial listing as
      complete; refuse only the bare `sqlite`; compare prefixes within one environment only; skip the credential comparison;
      compare the age against four intervals; drop the `absent()` branch.
- [ ] 3.2 Before A14, whose `probes` unit it fills. Outside liveness probes (R16): one probe
      per k3s node, per gate host and for the bastion's port 22 (R55) from the observability
      stack's blackbox exporter, and a
      host timer on the platform node that probes the observability node. The node rules of
      slice 2.8 (available memory, memory kills) are the alerts decision 2's triggers
      name; this slice checks that every k3s node of `desired.yaml` is in their scope.
      Test: the rules render. Negative: a node in `desired.yaml`, a host in `gate_hosts`, or
      a host in `bastion`, with no probe on
      another node fails the `delivery` check. Faults to inject: read `desired.yaml` only and
      watch the gate-host negative pass wrongly; read `desired.yaml` and `gate_hosts` only
      and watch the bastion negative pass wrongly.
- [ ] 3.3 The rewrite of the gate sections of `AGENTS.md` and `docs/infra/gate-hosts.md` is
      slice CI-S8 of the change `run-ci-on-argo-workflows`. Here, after A22: remove h4claw
      and h2puni from them. Test: `infra/ansible/tests` and the document tests.
- [ ] 3.4 After A21 and A22: remove the cluster `platform` and its nodes from `desired.yaml`,
      delete `production-existing-hosts.yml`, reduce `placement.test.ts` and slice 1.5's
      inputs to the new pair, and rewrite `docs/infra/enroll-h4claw-h3mon.md` as a historical
      record. The Flux paths of the old cluster are removed by a later change. Test:
      `bunx nx run tool-fleet:check`.
- [ ] 3.5 Before A18's WBS part and A20. Owner: the WBS deploy tooling's owner; this change
      states what the overlays have to hold and checks it. The `staging` overlay renders namespaces of its own, the solver
      one being `wbs-solver-staging` (slice 3.8), and carries that namespace's parameter
      ConfigMap, whose backend digest the staging build sets when it renders the overlay
      (design decision 1), and renders without a cluster; both
      overlays carry the selector patches of design decision 1, a backup prefix per decision
      7, ExternalSecrets in place of the SOPS Secrets they expect, the stale-backup rule of
      3.1, for staging the schema hook of slice 3.9 with its waves and a Certificate from
      the public-name issuer in place of the ACME staging issuer the overlay names today,
      because the staging build authenticates the backend by that certificate (slice
      3.9), NetworkPolicies that only allow, since each namespace's default-deny is the
      `policy` unit's (slice 2.10), and image references that name Harbor (R28); the WBS alert group is added to `alerts` with each. The `delivery`
      check reads both under rules (f), (g), (k), (m) and (n) and the rules of 3.1. Test: both
      overlays render together into one fixture cluster with no object in common. Negatives:
      an overlay that renders `wbs` or `wbs-solver` for staging is refused; a staging
      overlay whose Certificate names the ACME staging issuer is refused (fault: check
      that an issuer is named); a WBS workload without a selector is refused; a staging value that names `wbs`, `wbs-solver` or a Service in either is
      refused. Faults to inject: compare the two renders by kind only and watch the shared
      namespace pass; search object names only
      and watch the staging value that names a production Service pass.
- [ ] 3.6 Before A15 (R15, guard 1). MLflow keeps a metadata store and an artifact root,
      and the apps' backup runner cannot hold either: it refuses a database without the
      apps' migration table and uploads one file (`tools/tool-fleet/src/backup-sqlite.ts`).
      The layout is read (verify.md, the reading of 2026-11-22): one volume mounted at
      `/mlflow` holds a SQLite metadata store, `/mlflow/mlflow.db`, and the artifact root,
      `/mlflow/artifacts`, which held no file. The slice adds a unit `mlflow` under
      `infra/argocd/units`: the MLflow server pinned by digest and started with those two
      paths, selecting `observability`, with one `Retain` claim mounted at `/mlflow`
      carrying `Prune=false` and `Delete=false`; a backup CronJob of its own, a script on
      `bun:sqlite` in the pattern of `backup-sqlite.ts`, which takes a consistent copy of
      the metadata store with `VACUUM INTO`, runs `PRAGMA integrity_check` on the copy,
      reads the one row of `alembic_version`, the table in which MLflow's schema
      migrations keep the revision, archives the artifact root with a manifest of every
      file's path, size and SHA-256, an empty manifest when there is no file, and writes
      copy, archive, manifest and a report under one stamp to a prefix per decision 7; a
      verify CronJob that restores a stamp into scratch, checks the copy's SHA-256,
      integrity and revision against the report and every artifact against the manifest;
      and the stale-backup rule of 3.1. Test: the pair against a fixture store with two
      runs and three artifacts, and against one with no artifact. Negatives, each with
      its own fault: a stamp whose artifact differs from its manifest fails verify
      (fault: compare file counts); a stamp with metadata and no manifest fails verify,
      an empty artifact root included (fault: verify the metadata alone); a copy whose
      revision differs from the report fails verify (fault: skip the revision read); a
      store without `alembic_version` is refused by the backup (fault: record the
      revision as unknown); the unit without its backup CronJob fails rule 2.4(n)
      (fault: add `mlflow` to that rule's exemption table). Stop: on a copy of the real
      store, taken read-only, `alembic_version` is absent or holds more than one row.
      Then the slice reports before A15.
- [ ] 3.7 Before A23, which A18's WBS part waits for (R20, R31, R35, design decision 9).
      Owners: the WBS deploy tooling's owner for the build entrypoint and a staging
      overlay that renders at a commit; the release bootstrap's owner for whether the
      website takes this path; the owner for the staging pins repository, its two rulesets
      and the App; the change `run-ci-on-argo-workflows` for the trigger, the template and
      the Dagger module that calls this slice's step (its slice CI-S7); this change for the
      render-and-commit step and the promotion check. an earlier draft's workflow, hook
      and lint for a self-hosted runner are not built (R31).
      In this repository: the render step, which renders the app's staging overlay at
      the built commit with the new digests, using the `kustomize` binary locked in
      `infra/versions/toolchain.json` and no cluster, and commits it to the app's
      directory in the pins repository as the App, replacing the directory whole and
      naming the source commit and the digests in the message; and a command,
      `tool-fleet promotion-check`, which reads the source commit that the head of an
      app's pins directory names and refuses a promotion when the app's base or its
      production overlay differs between that commit and `main` in anything but image
      digests (design decision 9).
      Nothing in the step writes to this repository. Test: the render step against a
      fixture overlay and a local bare repository. Negatives, each with its own fault:
      the render step refuses a commit that is not on `main` of the source repository
      (fault: skip the ancestry check); it refuses a render that holds a cluster-scoped
      object, a kind outside the staging project's list or a namespace other than the
      app's staging ones (fault: commit whatever renders); a manifest removed from the
      overlay is absent from the next commit (fault: copy without clearing the
      directory); an image without a digest in the render is refused (fault: accept a
      tag); a render that holds a Secret object is refused (fault: add Secret to the
      project's kind list and rely on that list alone); an empty render, and one whose
      command exits nonzero, is refused and leaves the directory as it was (fault: commit
      the output directory whatever the exit code); a render made with a `kustomize`
      other than the locked one is refused (fault: take the binary from the path); a render
      that holds a Service of type NodePort or LoadBalancer is refused (fault: check
      kinds only); a commit whose source commit is not a descendant of the one the
      directory's head names is refused, so a build that finishes late cannot replace a
      newer render (fault: compare timestamps); a source commit whose migration set for
      the app is not a superset, by name and hash, of that of the commit that serves is
      refused with a message that names the attended path of design decision 9, because
      a removed or edited migration cannot be reversed from the candidate image (fault:
      compare counts only). The commit that serves is the boot commit the render reads
      from the backend's identity route (slice 3.9), and over a zero-replica head the
      baseline's commit; it is not the directory's head, which may name a candidate
      whose migration failed and was reversed. So after B's migration fails and is
      reversed, a corrected C whose set is a superset of serving A's is published
      (fault: compare with the directory's head and watch C refused for differing from
      B). The hook's own capture on the live store stays the check at sync time; a WBS render with a backend replica
      and without the schema hook of slice 3.9, or whose hook image differs from the
      backend's, is refused, and so is a render at zero replicas that carries the hook
      (fault: read the Deployment alone); a directory that holds the `HOLD` marker of design decision 7 is
      left as it is and the step exits nonzero, so a publication during a hold starts no
      writer (fault: clear the directory before looking for the marker); the
      promotion check refuses a base manifest changed since the commit staging ran
      (fault: compare the overlay directory only) and passes a difference of digests
      alone.
- [ ] 3.8 Before A17's solver step and A18's WBS part (R32, R29). The solver bound per
      environment, with one pod caller on a node each. In `tools/tool-remote-scripts`: the
      supervisor's closed caller list gains `k8s_wbs-solver-staging_backend`; in
      `solver-supervisor-image-map.ts` the decoder accepts a null caller image for that name,
      as it does for `wbs-dev-src`, and keeps throwing for `k8s_wbs-solver_backend` and every
      other pod caller, with the existing `Proof:` comment and test kept and a new pair
      beside them. In the new tree's `policy` unit only (the Flux copy is not edited): the
      trusted-hostpath policy admits, per environment, one namespace and one selector
      (`wbs-solver` with `product`; `wbs-solver-staging` with `nonproduction`) and the one
      host directory, and no dev namespace; the namespace-label policy reserves both names;
      each environment has its own parameter ConfigMap and binding, production's left out of
      the tree as today and staging's read from the staging overlay. In the `solver` role:
      the assertion accepts a node that carries exactly one of `product` and
      `nonproduction`, and the non-production inventory gives the staging caller one rule
      with no caller image. The old cluster's play and bundle are unchanged. Test: the
      supervisor's image-map suite, the policy suite on disposable k3d, and the role's tests
      for a product node and a non-production node. Negatives, each with its own fault and
      `Proof:` comment: a staging pod presenting its caller name is refused by a supervisor
      whose list lacks it (fault: accept any name that begins with `k8s_wbs-solver`); a
      production rule with a null caller image is still refused by the decoder (fault: allow
      null for every pod caller); a staging rule with a null caller image decodes; a
      production backend that selects `nonproduction` is denied (fault: compare the selector
      against the union); a pod in the staging namespace with an image from production's
      list only is denied (fault: bind both namespaces to one ConfigMap); a pod in a dev
      namespace that mounts the host directory is denied (fault: admit every non-production
      namespace); a third namespace carrying the trusted label is denied (fault: match the
      label alone); a node with both capabilities fails the role's assertion (fault: accept
      either). Stop: the role's inventory or the copied policy cannot express a rule with no
      caller image or a ConfigMap owned by the overlay. Then the slice stops and reports.
      Staging would need the operator's two writes for each backend, as production does, and
      the owner is told that R20 does not hold for the WBS backend until that is solved.
- [ ] 3.9 Before A23 and A18's WBS part (R20, R53, design decision 9). The staging schema
      hook, so that a merge with a migration reaches WBS staging with no command.
      Owners: this change for the script, the rule and the render step's checks; the WBS
      deploy tooling's owner for carrying the hook in the staging overlay (slice 3.5). In
      `tools/tool-deploy/src/k8s`: a script `staging-schema-hook`, run with `bun` from the
      candidate backend image's own directory, which calls only that image's CLIs. In
      order: it fails when no store is at `DB_PATH`; on an attempt record it never
      captures and never exits 0: for another candidate, or for a record that marks a
      failed reversal, it refuses and prints the manual completion command, and for its
      own candidate it runs the reversal below against the recorded capture, removes the
      record on an equal ledger and exits nonzero; it asks
      `migrate-capabilities-cli.ts` for `capture-v1` and `restore-v1-sha256`; on every
      run, also with nothing pending, it runs `mcp-service-settings-check-cli.ts` and
      `trusted-issuer-audience-check-cli.ts` on the live store with the candidate's
      environment, as the release coordinator does before its snapshot, and fails on
      either refusal or on a candidate that lacks either file; runs
      `migrate-status-cli.ts --capture` with target `staging`, the source commit as
      attempt and the image digest as candidate; exits 0 when the pending set is empty,
      having written nothing; otherwise requires free space on the claim of at least
      twice the store's size plus 1 GiB, takes a
      `VACUUM INTO` snapshot with `integrity_check` and a SHA-256, writes the capture's
      bytes and SHA-256 and the names of the store's schema objects beside it under
      `/data/schema-hook` and an attempt record last;
      runs `migrate-cli.ts`; captures again and requires the applied set to be the
      captured one plus the captured pending one, with nothing pending; removes the
      snapshot kept from the attempt before only now; and then removes the attempt
      record, syncs the directory to disk and reads the record absent before it exits
      0, so that a later sync of the same candidate finds nothing pending and no
      record and reverses nothing that the new backend has since written with. On a
      failure
      after the attempt record it runs
      `migrate-down-cli.ts --capture-file --capture-sha256 --target --attempt --candidate`,
      captures again, requires the complete name and hash ledger and the schema
      objects to equal the first capture's, removes the attempt record and exits
      nonzero; if the reversal or that
      comparison fails it keeps the record and the snapshot, prints the manual
      completion command with the capture's path and SHA-256 and exits nonzero. The
      script is carried byte for byte in a ConfigMap of the staging overlay, as the
      backup runner is, with a test of the equality. The tool also prints the same Job
      as a plain manifest, without the hook annotations, for the attended schema step
      of design decision 9, and for a removal it prints the comparison of that
      decision: the set `--to=<name>` would reverse beside the intended one, and each
      selected `down.sql` statement that drops or deletes from a table holding rows; it
      refuses to print a runnable Job unless the sets are equal, and marks one that
      needs the owner's decision. The staging overlay requests 16 GiB for `wbs-data`
      (design decision 2). Its render holds,
      besides the backend: the parameter ConfigMap in wave -2, listing the candidate
      digest first, then the digest that serves and every digest published since that
      one, with no cap by count, and in that wave also the candidate's
      `wbs-backend-config` and the ConfigMap that carries the candidate's hook script,
      so that a changed script never arrives after its Job. The digest that serves is
      read at render time from the backend's identity route. The backend's health
      document is at `/health` on its own port
      (`libs/wbs/domain/contracts/src/http/infrastructure-shapes.ts`), and the staging
      Ingress sends `/`, and so `/health`, to the frontend and only the `/api` prefix
      to the backend (`deploy/k8s/wbs/overlays/staging/ingress.yaml`), so the public
      `/health` is the frontend's answer and names no backend. The backend therefore
      gains one route at an exact path under its API prefix, `/api/boot-commit`, which
      answers its boot commit and nothing else and which the existing `/api` rule
      already reaches; a path rewrite to `/health` would need a Traefik `Middleware`,
      a kind that neither the staging project's whitelist nor the names policy of
      slice 2.10 admits, and a route needs no new kind. The render asks that route on
      the staging name over HTTPS, verifying the host name against the public roots,
      which the staging certificate of slice 3.5 satisfies and one from the ACME
      staging issuer does not; it accepts a body that is one 40-hex commit and nothing
      else; it takes that commit's render from the pins repository's history and lists
      its digest and the digest of every render published after it, so that a
      candidate that became Healthy between two renders is still admitted when a later
      one is applied; when the route cannot be read, the certificate does not verify,
      the answer is not a commit, or the commit has no render in the history, the
      render publishes nothing for that app and fails. A built image has no `.git`,
      where `apps/wbs/be-01/src/deployed-commit.ts` answers null today: the build
      writes the source commit into the image and that function reads it when there is
      no repository, with its test, so that a built backend names its commit on the
      route and in its health document. The route and the embedded commit are changes
      to the backend in this repository, made by this slice with their tests. While the head of the app's pins directory is
      at zero replicas, which the baseline, the first activation and a hold are,
      nothing serves: the render reads no route and lists the candidate and every
      digest published since the baseline; with a backend replica, the hook Job in wave
      -1, annotated `argocd.argoproj.io/hook: Sync` and
      `hook-delete-policy: BeforeHookCreation`, with `backoffLimit: 0`, no
      `ttlSecondsAfterFinished`, the candidate digest, the backend's service account
      without its token, the backend's `envFrom` of `wbs-backend-config` and
      `wbs-backend-secrets` and nothing more, the controller label, the `nonproduction`
      selector, the data claim and the security context of the release coordinator's
      schema Job; and the Deployment in wave 0. A render at zero replicas, which the
      baseline, A18's first sync and a hold are, holds no hook. Rule 2.4(w), lettered
      after the CI change's (s) to (v): a WBS staging render with a backend replica has
      that hook with the backend's digest, its `envFrom` and those waves; one at zero
      replicas has none; and no production or platform
      Application has a hook that runs a migration. Test: the script against a fixture
      store with the real CLIs, and the rule against rendered fixtures. Negatives, each
      with its own fault and `Proof:` comment: a failing migration leaves the ledger
      equal to the capture and exits nonzero (fault: skip the reversal); a reversal that
      leaves a table behind keeps the attempt record and names the manual command
      (fault: compare the newest name only); an attempt record of another candidate is
      refused (fault: overwrite it); a second run of the same candidate on its own
      record reverses from the recorded capture and exits nonzero (fault: capture
      again); a record that marks a failed reversal is refused with nothing pending
      (fault: exit 0 on an empty pending set); a candidate whose machine grant settings
      are missing on an activated store fails before any write, with nothing pending
      (fault: run the preflights only when something is pending); an unaccepted
      breaking audience fails the same way (fault: skip the second CLI); a candidate
      without the preflight files is refused (fault: skip a missing file); a run with
      nothing pending writes no snapshot
      (fault: snapshot first); a claim with less free space than twice the store plus
      1 GiB is refused before any migration (fault: migrate first); a removal whose
      `--to` set differs from the intended one prints no runnable Job (fault: compare
      the named migration only); a selected `down.sql` that drops a table holding rows
      is marked for the owner (fault: read the table's existence only); a hook in wave 0 or later is refused by the
      rule (fault: read the annotation's presence only); a production overlay with the
      hook is refused (fault: scope the rule to staging files); the ConfigMap's script
      differs from the source by one byte (fault: compare lengths); after a successful
      migration and a write that uses the new schema, a second run of the same
      candidate finds no record, changes nothing and exits 0 (fault: keep the record
      on success); a render after four failed publications still lists the serving
      digest (fault: list the newest three only); with A serving and B's sync in
      progress, renders C, D and E each list B (fault: list only the observed serving
      digest and a fixed number after it); a render that cannot read the serving
      commit, or reads none, publishes nothing (fault: fall back to the newest
      three); the frontend's answer at `/health` on the staging name is not accepted
      as an identity (fault: read `/health`); a route answered under a certificate of
      the ACME staging issuer, or under another host name, publishes nothing (fault:
      skip certificate verification); an answer that is anything but one 40-hex
      commit is refused (fault: search the body for a commit); a built image
      without the embedded commit reports none and its test fails (fault: read `.git`
      only); a render over a zero-replica head reads no route and lists every digest
      since the baseline (fault: require the answer always); the
      script's ConfigMap in wave -1 or later is refused by the rule (fault: check the
      Job's wave only). The rehearsal
      2.7/A18 gains a case: on k3d under Argo CD, an additive migration is applied by a
      new pins commit with no command and the new pod serves; a failing one leaves the
      sync failed, the old pod serving, the ledger equal and no further commit applied
      until a new one arrives; an edit that the old backend acknowledges while that
      failing migration and its reversal run is read afterwards, with no table's row
      count lower than before and no schema object left over; a candidate that would
      refuse to boot fails the sync with the old pod serving; a commit that edits an
      applied migration is refused by the render step; after a successful migration
      the new backend writes with the new schema, the same commit is synced again and
      that write is read afterwards; three failing publications in a row are followed
      by a restart of the serving pod, which is admitted; with A serving, B is
      published and held before it is Healthy while C, D and E are published, B then
      becomes Healthy, E is applied and its hook fails, and a restart of B's pod is
      admitted; the build container reads the identity route of a backend behind an
      Ingress shaped like staging's, with host name verification against a root the
      case trusts, and is refused by the same route under a certificate of another
      issuer and by `/health`; after B's migration fails and is reversed, a corrected
      C is published and applied; the zero-replica baseline is followed by the first
      activation, whose pod is admitted with no route to read; a zero-replica render
      syncs
      with no hook pod; and what a repeated attempt at the same commit does
      under self-heal is observed and recorded. Stop: the hook cannot be made to run
      before the Deployment's wave on this version, the old pod cannot keep serving
      while the Job holds the claim on the same node, or the acknowledged edit is lost. Then schema-changing commits stay
      on the attended path and the owner is told that R20 does not hold for them.

The dev environment's delivery is not in this change: it is the follow-up
`add-dev-environment` (R34, design decision 9). Its first deployment into the namespaces
this change reserves is step A25, so those namespaces are not an open end.

## 4. Attended steps

### Stage 1: platform

- [ ] A1 Create the platform server. Who: owner. Command: the provider console; 8 vCPUs,
      32 GB (R2), the new private network 10.10.1.0/24, Ubuntu 26.04, the admin key. Done
      in part on 2026-11-22: m1plat1 exists at 8 vCPUs, 32 GB and 200 GB, Ubuntu 26.04.1,
      10.10.1.11, with its public SSH closed in the panel firewall and reached through the
      bastion; its receipt is still to be read, through the bastion, and its `free -m`
      replaces the assumed 31,204 MiB of design decision 2 by a commit. Receipt: `/etc/machine-id`, the SSH host key fingerprint, the private address and
      interface and its MTU, `nproc`, `free -m`, `df -h /` and `df -B1 --output=size /`; for
      each server, that the panel firewall allows outbound traffic explicitly, admits
      Tailscale's UDP port inbound so that connections are direct, and holds no other
      inbound public rule but what the role serves, read as yes or no, with no address.
      Stop: the host is not on the private network, answers on any public port, or its root
      filesystem's size in bytes is under its role's minimum, 182 × 2³⁰ bytes here (design
      decision 2). For m1plat1 the exit is already decided: under that floor and at or above
      169 × 2³⁰ bytes, the drill's row of design decision 2 shrinks to 20 GiB by a commit and
      the step goes on; under 169, it stops; the same stop holds for every server this
      plan creates, each against its own minimum, whatever provider it comes from. Rollback: delete the server. A server used
      for the rehearsal of 2.7 is deleted first; this receipt is of the server that stays.
      If the rehearsal runs on m1plat1, its system is reinstalled afterwards and this
      receipt is read after the reinstall, so no machine id of the rehearsal is recorded.
      For this and every server the owner also makes its tailnet auth key, single-use,
      tagged for its trust class and signed from his own device, into `$OPS` (design
      decision 12).
- [ ] A2 Make and escrow the new cluster's secrets (R6), after 0.5 and 0.6. Who: owner.
      Commands: two 64-hex k3s credentials, `age-keygen`, read-only deploy keys for the fleet
      repository and the WBS deploy repository, the Argo CD local account's password and
      the hosts' console account password of slice 1.8, and three distinct keys (R55): the
      bastion's jump key, the servers' admin key and the bastion's own admin key (if a key
      set up by hand on 2026-11-22 serves two of these, a new one replaces it in A26), into
      `$OPS` on the controller,
      which is the operator's laptop; the encrypted files of design decision 5 into the fleet repository's directory;
      a copy of each original into both escrow places. Receipt: "escrowed" per secret beside
      its escrow entry, and "restored on a second machine" for the age identity. Stop: an
      escrow place is unavailable. Rollback: discard the files; nothing uses them yet.
- [ ] A3 Bootstrap the server, after 1.1, 1.2, the first 1.3, A26 and the receipt 2.7/A3. Who:
      operator. Commands:
      `fleet_ansible --limit m1plat1 --extra-vars puni_preflight_stage=before-enrollment playbooks/preflight.yml`,
      `fleet_ansible --limit m1plat1 playbooks/bootstrap.yml` twice (the second prints
      `changed=0`), `playbooks/validate-enrollment.yml`, then preflight with
      `puni_preflight_stage=after-enrollment`. Read both join tokens into `$OPS` and escrow.
      Receipt: the device is tagged `tag:platform` and its key does not expire; SSH answers
      through the bastion and not on the tailnet address, and no public port answers; `kubectl get nodes -o wide` shows m1plat1 Ready with roles `control-plane,etcd` and the internal address 10.10.1.11,
      `flannel.1` with an MTU of 1392,
      the label `puni.dev/capability-platform-services=true`, the taint
      `CriticalAddonsOnly=true:NoSchedule` and no enrollment taint; CoreDNS, the metrics
      server and the volume provisioner Ready; CoreDNS still tolerates `CriticalAddonsOnly`.
      Stop: validation fails or the second bootstrap changes anything.
      Rollback: delete the server and repeat from A1.
- [ ] A4 Argo CD and the units under OpenBao, after 0.6 and slices 2.1 to 2.6 and 2.9. Who:
      operator. Commands:
      `fleet_ansible --limit m1plat1 --extra-vars puni_cluster_id=platform-production --extra-vars @"$OPS/argocd.json" playbooks/argocd.yml`;
      then sync `argocd`, `namespaces`, `policy`, `storage`, `tailscale-operator` and
      `cert-manager`.
      Receipt: `kubectl get applications -n argocd` shows the root and orders 0 to 3 Synced
      and Healthy; the root is in the project `root` and has no prune; every Argo CD and cert-manager pod is on m1plat1; the Kubernetes API answering on the tailnet address; the interface answers
      on its tailnet name and on no public address; the local account logs in and is refused a sync of a
      platform unit; `admin` cannot log in; no Service of type LoadBalancer or Ingress exists
      in `argocd`. Stop: a unit is not Healthy after 20 minutes. Rollback: delete the server.
- [ ] A5 etcd snapshots. Who: operator. Commands: create the new snapshot bucket with
      versioning and the one lifecycle rule of
      [recovery](../../../docs/infra/recovery.md#bucket-lifecycle), and read both back;
      `playbooks/backup.yml` with that bucket and the token fingerprint;
      `k3s etcd-snapshot save`; `tool-fleet:recover record-manifest`. Receipt: the bucket's
      versioning and rule, the snapshot's object key, size and SHA-256, the manifest stored
      with the escrowed secrets. Stop: the role refuses the fingerprint. Rollback: none
      needed.
- [ ] A6 Restore drill, before OpenBao holds anything, after 2.6. Who: operator. `restore.yml`
      refuses a host whose k3s `node-name` is not the planned replacement or is a fenced
      original, so the drill uses a second, temporary server. The controller reaches the
      temporary server through the bastion or the private access network, as it reaches
      any server (R17, R55), so m1plat1 being off costs no path; the temporary server gets
      an auth key as in A1 and an entry in the bastion's `PermitOpen` from slice 1.9's
      play, removed again when it is deleted. Commands: power m1plat1 off and record that as fence evidence;
      create a temporary server as in A1 under another name and prepare it with
      `bootstrap.yml`'s host roles and a k3s config that names it;
      `tool-fleet:recover verify-cold-restore` with the escrowed token; `playbooks/restore.yml`
      limited to it; read the root Application; then delete the temporary server and power
      m1plat1 on. Receipt: time from power-off to the root Synced on the temporary server; the
      fence evidence file; m1plat1 Ready again with its own datastore. Stop: the restore
      refuses, or the root cannot be read. Rollback: delete the temporary server and power
      m1plat1 on; its datastore was not touched.
- [ ] A7 OpenBao, the External Secrets Operator and the first Secrets (R22). Preconditions:
      pull request #935 merged and amended as design decision 9 lists, its own slices
      landed under `infra/argocd`, and the receipt 2.7/A7. Who: operator; owner for the values. Commands: add the
      seal key, the server CA Secret and the rest of #935's bootstrap set to the secret file
      list and run `playbooks/argocd.yml` again; sync `openbao`; follow #935's runbook to
      the point where the store serves and its recovery material is escrowed; sync
      `external-secrets`; the owner writes the registry CA key pair and one canary value into
      the store; sync `secret-sync`, then `issuers`. Receipt: orders 4 to 7 Synced and
      Healthy, `rancher` excepted, which A27 syncs; the canary read back through its ExternalSecret; the registry CA issuer Ready;
      the store's pods on m1plat1; #935's own receipts for seal, escrow and a first snapshot.
      Stop: the store does not serve, or the canary does not arrive. Rollback: reduce the
      three units to their markers and sync, then remove the bootstrap Secrets; the store's
      claim stays until the owner removes it.
- [ ] A8 Measure Argo CD (R24). Who: operator. After 24 hours and one merge that changes the
      tree, read each container's working set and `memory.stat`. Receipt: the per-container
      table in verify.md and the limits kept or changed by a commit. Stop: a container was
      killed for memory. Rollback: raise that limit in Git and sync `argocd`.
- [ ] A24 Break-glass drill (R49), after A3. Who: owner. Commands: on his device, turn
      Tailscale off; confirm that m1plat1 answers on no public port; log in to m1plat1
      through the bastion, which needs no tailnet, and read `kubectl get nodes` there; then,
      as if the bastion were lost, open m1plat1's console in the provider's panel, log in as
      the console account with the password from escrow, and read `tailscale status` and
      `nft list ruleset`; do the same on the bastion's console; turn Tailscale on. No
      firewall rule is added: the console is where the path through the bastion is
      repaired (design decision 12). Receipt: the readings, the time each path took, and the
      ruleset read on the console equal to the one A26 recorded; no value. Stop: the login
      through the bastion or either console login fails, or a public port answered.
      Rollback: none needed.
- [ ] A26 The host firewall of m1plat1 and the bastion as code (R55, design decision 12),
      before A3, after the first revision of 1.3 and slices 1.8 and 1.9. Numbered after A25
      so that the other steps keep their ids. m1plat1 has had no host firewall since it was
      created; until this step the panel firewall, with no public SSH, is its only filter.
      Who: operator; owner for the console and the panel. Commands: first prove the way
      back: the owner logs in on m1plat1's console as the console account and on the
      bastion's console, and both logins are recorded before anything changes. Then
      `fleet_ansible --limit m2bast1 playbooks/bastion.yml` twice, the second printing
      `changed=0`. Then run `playbooks/preflight.yml` limited to m1plat1, which reads the
      private interface's MTU against `puni_private_mtu`. Then, on m1plat1, save the
      current ruleset and the interface's MTU and arm a timer
      (`systemd-run --on-active=10min`) that restores both, stopping the role's MTU unit first; run
      `playbooks/firewall.yml` limited to m1plat1, which renders the `network` role for it
      and sets the MTU; open a second SSH session
      through the bastion, and only from that session stop the timer. Then prove the public
      drop on the host itself: the owner opens the panel firewall for the controller's
      public address alone, the controller probes 22, 6443 and 10250 on the public address,
      the panel rule is removed, and the drop rule's counters are read before and after.
      Receipt: the two console logins; `nft list ruleset` on m1plat1 with counters, admitting
      SSH from 10.10.1.12 alone, the cluster's ports from the enrolled set alone, which does
      not hold 10.10.1.12, the two prerouting rules of slice 1.8 for the bastion and for
      non-enrolled sources, and nothing on the public interface; the interface's MTU at
      1442; the drop counters raised by the probe and no answer to it; the timer
      stopped by the second session; `sshd -T` on the bastion equal to the render. Stop: the
      preflight refuses the MTU; the second session cannot connect, in which case the
      timer restores the ruleset and the MTU by itself;
      a probe is answered; or the panel rule cannot be removed. Rollback: the timer, or from
      the console restore the saved ruleset, correct the input, and run the step again.
      Amended 2026-11-22 after review. The console account the first login uses is created by
      `playbooks/firewall.yml` itself, for a separated inventory, before the `network` role, so
      it exists before A3; on the bastion, `playbooks/bastion.yml` creates its own. Two risks
      to read before the step: the boot window, from the network coming up to the firewall
      unit's start, in which m1plat1 has no host rules (its unit runs after
      `network-online.target`; the panel firewall covers that window, so the panel rule must
      stay until A26's receipt); and a hand-made `/etc/nftables.conf` that begins with
      `flush ruleset`, which, if `nftables.service` is enabled and starts after the fleet's
      unit, removes the fleet's tables at boot. Before the step, read on both hosts whether
      `nftables.service` is enabled and the file's first line; disable the service, or remove
      its flush, on each host first, and record it in the receipt. Also read `networkctl status enp3s0`
      on both hosts for DHCPv6 and MLD before the public drop is applied.
- [ ] A27 Rancher Manager (R54, design decision 14), after A7, slice 2.11 and the receipt
      2.7/A27. Who: operator; owner for the passwords. Commands: the owner generates the
      bootstrap password, puts it in escrow and writes it into OpenBao; merge the revision
      that adds the `rancher` Application file, its ExternalSecret, the annotated `cattle-`
      namespaces and the `policy` objects of slice 2.11; sync `namespaces`, `policy`,
      `secret-sync`, then `rancher`, in that order; the owner signs the device the
      Tailscale operator made for `rancher`, logs in with the bootstrap password, sets the
      administrator's password and escrows it, and sets the server URL to the tailnet name.
      Receipt: `rancher` Synced and Healthy with one replica and no Pending pod; every pod in
      a `cattle-` namespace or a namespace Rancher made, listed with its node, all on
      m1plat1, which health also reads; no shell pod; `kubectl get gitrepos,helmops -A`
      empty; the bundles and the Helm releases in the cluster, which become the lists of
      Rancher's own kept beside the check of slice 2.11; no `plans.upgrade.cattle.io` object
      and no `system-upgrade-controller`; the Rancher pod's `CATTLE_FEATURES` with
      `continuous-delivery` and `turtles` off, and no `cattle-turtles-system` namespace;
      the token and session settings at 720 minutes and the idle session at 60;
      `enable-admission-plugins` with `NodeRestriction` and `PodNodeSelector` in the running
      API server's arguments; a pod in `cattle-system` created with `--dry-run=server`
      returned with the namespace's selector merged in; the local Fleet agent's affinity read
      back as the capability; a shell opened in the interface denied; one
      Ingress, of the Tailscale operator's class, and no Service of type LoadBalancer or
      NodePort in those namespaces; the interface answering on its tailnet name with a valid
      certificate and on no public address; the bootstrap password refused after the first
      login; the version shown as v2.15.3 on k3s v1.36.4+k3s1; "escrowed" for both
      passwords, no value. Stop: a pod Rancher starts runs on another node or stays Pending;
      a `GitRepo` or `HelmOp` exists; Rancher is not Healthy after 20 minutes; Rancher wrote
      a bootstrap Secret of its own. Rollback: the removal order of design decision 14:
      reduce `rancher` to its marker and sync; delete the `rancher.cattle.io` webhook
      configurations and the `APIService` `v1.ext.cattle.io`; list what Rancher made and
      remove its finalizers where they hold; then delete its namespaces and custom resource
      definitions, and remove the unit's file (design decision 3). Receipt of a rollback: a
      Namespace created and deleted, and `kubectl api-resources` with no error.
- [ ] A28 Measure Rancher (R54), as A8 measures Argo CD. Who: operator. After 24 hours and
      one sync of another platform unit, read each container's working set and `memory.stat`
      in the namespaces Rancher made and in `cattle-system`, and again for Argo CD's
      application controller and for the k3s server, which Rancher's watches load. Receipt:
      the per-container table in verify.md, the pods without a limit marked; the limits of
      design decision 14 kept or changed by a commit; the Argo CD controller and k3s server
      readings beside A8's; the platform node's sum of design decision 2 written again with
      A1's `free -m`. Stop: a
      container was killed for memory, or the node's available memory is under 1,024 MiB.
      Rollback: raise that limit in Git and sync `rancher`.
- [ ] Harbor lands on m1plat1 by its own change, amended as design decision 9 lists, synced on
      command at order 14. It is not a step of this change. It is due before A18's WBS part.

### Stage 2: continuous integration

- [ ] A9 Create the CI server. Who: owner creates as in A1, at 12
      vCPUs and 24 GiB (R50): design decision 5 of the change `run-ci-on-argo-workflows`
      shows that one gate does not fit 16 GiB on paper. Receipt:
      the server's memory and its disk, at or above 150 GiB. Stop: a smaller disk.
      Rollback: delete the server. The gate-host role is not applied: the server is not
      enrolled in the host pool (R31). Its identity is recorded afterwards, by slice
      CI-S2 of the CI change, which CI-A1 waits for.
- [ ] A10 Replaced by steps CI-A1 to CI-A4 of the change `run-ci-on-argo-workflows`: the CI
      cluster's bootstrap, its units, its tenant and a full gate through a Workflow. Where
      another step names A10's receipt, it means CI-A4's. The id is kept so that the other
      steps keep theirs.
- [ ] A11 Release builds on the CI cluster. Who: the session that owns the release
      bootstrap, by its own procedure and with a template it writes (the CI change's
      design decision 6). Receipt: one release record that names the CI cluster. Stop: a
      build fails for a reason the old host does not show on the same commit. Rollback:
      keep building release images where they are built today. The staging build path is
      A23 and CI-A5, in stage 4, where its inputs exist.

### Stage 3: observability

- [ ] A12 Create the observability server. Who: owner, as A1, with at least 24 GiB (R2: 12
      vCPUs and 24 GiB assumed, 16 and 32 if the provider has no such class with the
      disk), a root disk of at least 233 GiB and a public IPv4 address for ports 80
      and 443, because it carries the non-production environments in the minimal profile.
      Receipt: as A1. Stop: `free -m` or `df -h /` shows less, or the host has no public
      IPv4 address. Rollback: delete the server.
- [ ] A13 Join it, after its 1.3 revision, 1.4, 1.5, 2.8 and the receipt 2.7/A14. Who: operator. Commands:
      `fleet_ansible --limit m1plat1 playbooks/firewall.yml`, so the server admits the new
      address; preflight limited to h7obs; `fleet_ansible --limit h7obs playbooks/join.yml`
      twice; `fleet_ansible --limit m1plat1 playbooks/validate-enrollment.yml`, whose hosts
      are the bootstrap servers; then a ping with do-not-fragment set at the pod MTU, 1392
      bytes in all (`ping -M do -s 1364`), from a pod on m1plat1 to a pod on h7obs and back;
      then `tool-fleet:health`. Receipt: h7obs Ready with
      `puni.dev/capability-observability=true`, no enrollment taint; both pings answered and
      one of 1393 bytes refused as too large; health passing with no Rancher pod on h7obs,
      the first reading of that check that could fail. Stop: validation fails, a ping at
      1392 is lost, or a Rancher pod runs on h7obs.
      Rollback: `playbooks/rollback-host.yml`, delete the Node object, delete the server.
- [ ] A14 Bring up and measure the stack, after A7 and 3.2. Who: operator; owner for the
      values. Commands: generate the Velero repository password and put it in escrow first;
      the owner writes the fifteen operator-provided values of design decision 5 into
      OpenBao, the webhook address of `#puni-alerts-dev` among them, which he holds; merge the revision that adds the units of orders 8 to 12 and their
      ExternalSecrets; sync `secret-sync`, then those units in order; after 24 hours read
      `kubectl top pods -n observability`, each container's `memory.stat` and each claim's
      use; raise one test alert. Receipt: "escrowed" for the Velero repository password;
      orders 8 to 12 Healthy, `mlflow` and `sqlite-custody` excepted, which A15 and A18
      sync; no alert firing other than the test alert; a metric of the CI
      cluster seen in the platform's Prometheus through the private telemetry path,
      and a connection to the telemetry port on the platform node's public interface
      refused (the receipt the CI change's CI-A2 cannot take, because the receiver
      first exists here); the per-pod memory
      table; disk used and its growth per day; the test alert seen in Alertmanager and in
      `#puni-alerts-dev`; the node's allocatable as read, which replaces the assumed 21,608
      in design.md by a commit. The placement sum of design decision 2 is written out
      after A15, when MLflow runs, with `O` measured over the 24 hours that follow; it is
      written again a day after A18 and a day after A20, when the apps' telemetry arrives.
      If a sum does not hold, the owner decides where non-production goes: this node at
      the next class, or a server of its own (design decision 11). Stop, at each reading:
      a pod is killed for memory, the node's
      available memory falls under 1,024 MiB, the sum does not hold, or the disk would fill within 60 days.
      Rollback: nothing depends on the stack yet. Reduce the units to their markers and sync,
      then remove their Application files (design decision 3). Claims stay.
- [ ] A15 MLflow (R15, guard 1), after A13 and slice 3.6. Who: operator. Commands: on
      h3mon, read again, read-only, how MLflow is started, its two paths, the size of
      the metadata store and the count and total size of the files under the artifact
      root, and compare them with the reading in verify.md; pick one run, and, if the
      artifact root holds a file, one artifact of a run with its SHA-256; the owner
      writes the MLflow backup credentials into OpenBao; merge the `mlflow` unit at zero
      replicas with its backup job suspended, together with its ExternalSecrets; sync
      `secret-sync`, then `mlflow`; stop MLflow on h3mon; take the final copy of the
      metadata store and the artifact root there under one stamp with the unit's own
      tool; restore both together into the unit's claim; merge one replica and the job
      resumed, and sync; run the backup job and the verify job once. Receipt: the layout
      as read at this step; the final stamp, the copy's SHA-256 and revision, and the
      manifest's SHA-256, which is that of the empty manifest when the artifact root
      held no file; the recorded run read back from the new instance; the artifact
      fetched through MLflow with the recorded SHA-256 if one was recorded; one backup
      and one verify under the new prefix, taken after the restore. Stop: the layout
      differs from the reading in kind, which is another backend store, an artifact root
      outside the volume or an object store; the artifact root holds more than 1 GiB,
      which the claim and the hourly archive were not sized for; the artifact's SHA-256
      differs; the verify fails; or a backup under the new prefix predates the restore.
      On the first two the unit is not merged and slice 3.6's owner resizes or redesigns
      first. Rollback: as design decision 7 states for every store: merge the unit at
      zero replicas and sync it, see no pod of the new instance left, only then compare
      its metadata digest and artifact manifest with the final stamp, and start MLflow
      on h3mon again only when they are equal.

### Stage 4: apps

- [ ] A16 Create the production apps server (minimal profile, R45). Who: owner, as A1, at 4
      vCPUs and 8 GiB as the trial of R2,
      with a root disk of at least 50 GiB (design decision 2). Receipt: as A1. Stop: as A1, or the host has no public IPv4 address for ports
      80 and 443. Rollback: delete the server. If the sum of design decision 2 did not hold
      and the owner chose a non-production server of its own, it is created here too, as
      the first growth step of design decision 11, with a root disk of at least 90 GiB.
- [ ] A17 Join h6apps and give h7obs the non-production capabilities, after the 1.3
      revisions for both, slices 1.7 and 2.10, the receipt 2.7/A18, and the sum of design
      decision 2 holding for this node at the reading after A15. Who: operator. Commands: `playbooks/firewall.yml` limited to
      the nodes already joined; then as A13 for h6apps;
      `fleet_ansible --limit h7obs playbooks/capabilities.yml`, which re-applies the host
      settings `ingress` needs and adds `nonproduction` and `ingress` there; sync `namespaces` and `policy`, which now carry slice 2.10; then `playbooks/solver.yml` limited to each, once slice 3.8 has landed and each
      host's Docker can pull the solver image its inventory names (design decision 9: for a
      Harbor reference, Harbor's CA and a pull robot first);
      then merge the revision that adds the `traefik` Application and sync it. Receipt: h6apps
      Ready with `product` and `ingress`, h7obs Ready with `observability`, `nonproduction`
      and `ingress`, neither with `product` and `nonproduction` together;
      `sysctl net.ipv4.ip_unprivileged_port_start` reading 0 on both; the observability
      pods on h7obs untouched by the capability play and by the solver role's Docker
      install, read as their restart counts before and after; a Traefik pod Ready on each and answering on ports 80 and
      443; one supervisor on each node with one pod caller's rule, the non-production one's
      naming no caller image; a pod applied by hand to a staging namespace with the
      `product` selector, denied; `tool-fleet:health` passing with no Rancher pod on either
      node. Stop: Traefik cannot bind 80 or 443, a Rancher pod runs on h6apps or h7obs, that pod is
      admitted, an observability pod restarted, or the sum of design decision 2 did not hold
      at the reading after A15 and the owner has not chosen an exit. Rollback: reduce
      `traefik` to its marker and sync, remove its Application file, then as A13.
- [ ] A18 Staging, on the node that carries `nonproduction`, h7obs in the minimal profile (R29, R45, R26), after 3.1, the receipt 2.7/A18 and the fleet
      repository's directory of design decision 9; its WBS part also after 3.5, 3.8, 3.9, Harbor,
      and A23's receipt or the owner's dated waiver of it: the dev poller is not stopped
      without one of the two, because nothing else would make the tracker follow `main`.
      Its website part waits on no answer about the API's Deployment: its migration
      contract is read from source and its update strategy, replica count and claim
      were read on 2026-11-22 (design decision 9, verify.md), and the step checks
      that the new staging directory keeps them. The request app holds no store.
      Who: operator, with the website's owner; owner for the Secrets. The owner
      writes the staging Secrets of design decision 5 into OpenBao, reading the website's
      present ones with the old cluster's age identity on the controller; the staging backup
      credential is one that cannot read production's backups. Sync `secret-sync`,
      `sqlite-custody` and `public-issuers`. Then, for the website and request app in
      `website-dev` first and WBS staging second: stop the old side (scale the old
      Deployments to zero and suspend the old backup CronJob and its Flux unit; stop the
      Compose dev stack and the dev poller on h2puni); take the final backup of the dev store
      as design decision 7 states and record its file name, stamp and SHA-256; merge the
      staging overlay with the workload at zero replicas and its backup CronJob
      suspended, which for WBS carries no schema hook (slice 3.9); for WBS that overlay has been on `main` since A23's baseline, so read
      the head of the app's pins directory, the baseline or a build after it, which
      must show zero replicas and the suspended job;
      only then merge the app's staging Application file, which the root applies at
      once and which syncs by itself; check the file against the recorded value with
      `sha256sum --check` and restore it into the new claim only if it matches (guard 6);
      compare the restored store's applied-migration ledger with the image about to
      run, by that image's own capture run once as a Job on the claim while the
      workload is at zero. For WBS it is
      `migrate-status-cli.ts --capture --target=<t> --attempt=<a> --candidate=<c>` from
      the candidate image, with `DB_PATH` on the restored store and the three identities
      of this move: it reads every applied row, refuses one whose name or hash is absent
      or changed in the candidate's own scripts, and prints the applied and the pending
      sets. The candidate's `migrate-capabilities-cli.ts` is asked first, as the deploy
      callers do, and answers only whether the image knows `capture-v1`; it carries no
      names. For the website the check is `validateDatabase` of the image about to run,
      which that image's `request-retention-cli.js report` runs read-only before
      anything else (`docs/website/request-retention.md`): it requires integrity,
      exactly the image's migration names and checksums, and the schema they produce.
      The image is the one the old side ran, since the website's pins are not moved by
      this change (R11), so the two sets are expected equal. Only when the check exits 0, for WBS with an
      empty pending set, merge one
      replica and the CronJob resumed; point the names the staging overlay declares
      at that node; wait for the certificates from the issuer each overlay names; run the new
      backup job once. Receipt, per app: the stamp and SHA-256, and the check's "OK"; a
      read of one of staging's own backup objects with the staging credential, and a read of a
      named production object refused with an authorisation error; no pod of the app
      and no backup run on the new side before the restore finished; the restored store's
      check equals the backup's; the capture's output with every applied hash accepted and
      an empty pending set, taken before the first replica; for WBS, the project list of the tracker read back through
      its API, and the WBS owner's word on what `wbs-mcp` held; the pages read back on their
      names with a Ready certificate from the public-name issuer each overlay names,
      which for WBS staging is the one slice 3.5 puts in place of the ACME staging
      issuer, verified against the public roots from outside the cluster; for WBS
      staging the identity route of slice 3.9 read the same way, answering the source
      commit of the render that serves; the solver pod of one
      issuance seen on that node; the node's available memory after the first solve, which
      must stay above 1,024 MiB; one backup and one verify
      under the staging prefix, taken after the restore and holding a restored record; for
      the first app moved, the comparison of design decision 7 made once on the stopped store before any
      edit, reporting equal; then one edit on the new side after the names were pointed,
      the new writer stopped, and the comparison reporting that the stopped store
      differs from the restored stamp; and for WBS staging the same again with an edit
      that touches no row of `event_log`; for that same app, during the hold of design
      decision 7, one merge to `main` that touches the app's paths: the build refused to
      publish, the pins directory's head stayed the hold, and no writer pod started; for each of the three apps, a merge to the app's source
      deployed to staging with no command, or the owner's dated waiver for that app: for
      WBS as a second backend digest with no pin moved by hand and no run of
      `solver.yml`, and once more as a merge that adds a migration, applied by the hook
      of slice 3.9 with no command; for the website and the request app by their
      owner's tooling (design decision 9). Stop: the Application file would be merged while the
      pins directory's head, or for the website the fleet overlay on `main`, is not the
      zero-replica render; the SHA-256 differs; the candidate does not answer `capture-v1`, the
      capture fails, which is an applied migration absent or changed in the candidate,
      or its pending set is not empty: then the workload stays at zero and the
      difference goes through the attended schema Job with its capture and rollback
      (design decision 9); the website API's overlay in the new staging directory has
      more than one replica, a strategy other than `Recreate`, no snapshot before its
      start or a claim that is not on that node; the WBS staging certificate does not
      verify against the public roots;
      the staging credential can read a named production object, or the refusal is anything
      but an authorisation error; the restore differs from the
      backup; a backup under the new prefix predates the restore or is empty; or a
      certificate is not Ready after 15 minutes. Rollback: as design decision 7 states,
      in this order whether or not the names have been pointed. Hold the new side at
      zero in the source Argo CD reads: for WBS the owner merges, into the app's pins
      directory, the render at zero replicas with the backup job suspended and the
      `HOLD` marker; for the website and request app their owner merges the
      zero-replica overlay. See the workload at zero replicas and no pod of the app left
      in its namespace. Only then compare the whole store with the restored stamp, by
      the `.dump` digest of design decision 7. Only then: if the two are equal, point
      the names back where they were moved and start the old side; if they differ,
      recover forward by lifting the hold, or take the stopped writer's final backup,
      restore that onto the old side, check it, start the old side, point the names
      back at it and read the app through each name: the newer data answers there. The
      old writer is never started while the new one runs.
- [ ] A19 The production website and request app (R26), after A18's receipt for them. Who:
      operator, with the website's owner; owner for the Secrets and for the sync. As A18 for
      production: the owner writes the production Secrets into OpenBao; the old side is
      stopped and backed up once; the production Application is merged at zero replicas with
      its backup job suspended, and the owner syncs it; the stamp is restored; the capture
      of A18 is run before any replica and must exit 0 with an empty pending set; one replica
      and the job resumed are merged, and the owner syncs again; the names are pointed at
      h6apps. Receipt: as A18, plus that the merged Application stayed OutOfSync until the
      owner's sync, and that the sync was made with the local account; the node's
      available memory at rest and during one backup run (design decision 2). Stop: as A18, the
      Application syncs without a command, or the node's available memory is under 1,024
      MiB at either reading: then the node is rescaled before A20 adds WBS (design
      decision 11). Rollback: as A18, with h4claw as the old side; the hold is the
      zero-replica overlay merged to `main` and synced by the owner.
- [ ] A20 WBS production, the simple way (R28), after 3.5, Harbor and A18's WBS receipt. Who:
      operator, with the WBS deploy tooling's owner; owner for the Secrets and for the sync.
      As A19 for WBS: Secrets and Harbor's pull credential written into OpenBao; production
      stopped on h2puni; one final backup; the `wbs` Application merged at zero replicas and
      synced by the owner; the stamp restored; the capture of A18 run with the production
      candidate, exit 0 and an empty pending set, before any replica; one replica merged and synced; the name
      pointed at h6apps. Receipt: as A19, plus the WBS alert group present and quiet,
      that h6apps is in no `gate_hosts` group, and the node's available memory at rest,
      during the hourly backup and during one solve, with the owner's decision to keep
      the trial size or rescale (design decision 2). Stop: as A19, the node's available memory under 1,024 MiB at any of those readings, a pod
      killed for memory, or the WBS owner names a step a
      first start needs that this simple move skips. Rollback: as A18, with h2puni as the
      old side; the hold is the zero-replica overlay merged to `main` and synced by the
      owner.

- [ ] A23 The staging build path (R20, R31, R35), in two parts. Numbered last so that
      the other steps keep their ids. **First part**, after A17, slices 3.5 and 3.7 to 3.9,
      Harbor's project and push robot, and task 0.6; before the CI change's CI-A5. Who:
      owner and operator. Commands: create the staging pins repository with its two
      rulesets; seed it, before the App exists, with a baseline for each app the tenant
      builds: with the WBS staging overlay on `main` at zero replicas and its backup job
      suspended (slice 3.5), the operator renders it at a named commit of `main` with
      the locked `kustomize`, and the owner merges that render into the app's
      directory by a pull request, with the source commit named as every later commit
      names it, so the build's first commit has a head to descend from and a migration
      set to compare with (slice 3.7); create the GitHub App with write access to
      contents only, install it on
      that repository alone and name it as the pull-request ruleset's only bypass actor;
      write its key and the push robot's configuration to the tenant's path in the
      store; make a read-only deploy key for the pins repository, add its public half
      there and its encrypted file to the fleet repository's directory, and run
      `playbooks/argocd.yml` again with the longer secret file list (design decision 5).
      Receipt: each app's baseline, its source commit, and that the render shows zero
      replicas, the suspended job and no Secret object; the App's repository list, which
      names the staging pins repository and
      nothing else, and its permissions; both rulesets read back, the one against forced
      and deleting pushes with no bypass actor; the pins repository's deploy key read
      back as read-only, and the repository listed by Argo CD as connected. **Second
      part**: the receipt of CI-A5, a push to `main` building with no command and one
      commit in the pins repository that holds the rendered staging manifests and names
      the source commit and the digests. Where another step names A23's receipt, it means
      both parts. That staging then runs it with no command is A18's receipt. Stop: the
      rulesets do not combine as design decision 9 assumes, the App is installed on
      another repository, or Argo CD cannot read the pins repository. Then the App is
      removed and the owner is asked for the waiver of design decision 9: without it
      A18's WBS part does not start. Rollback: remove the App.

### Stage 5: retirement

- [ ] A21 Delete h4claw and h3mon. Who: owner. Preconditions: A18's and A19's receipts for
      the website and request app; A15's receipt; A10's receipt, no caller launching gates on
      h4claw (slice CI-S8), and the pool owner's withdrawal of h4claw or written confirmation
      that none is needed; a test alert delivered in `#puni-alerts-dev`; the
      word of the session that owns `release-pin.ts` that the old fleet directory may go;
      and the owner's dated sign-off of a list of what the two hosts still hold, each
      entry marked restored, with its receipt, or discarded. The list starts from
      `production-existing-hosts.yml` and is completed by a read-only reading of each
      host: on h4claw the `openhands-app` container and its mounts, the old registry's
      volume and the gate trees; on h3mon the Victoria and Grafana data, the Docker
      services its inventory entry preserves, and MLflow's old stores.
      Commands: delete both servers in the console; remove the old cluster's directory from
      the fleet repository. Receipt: the provider's server list without those names; the two
      confirmations, dated. Stop: a DNS record still points at either host. Rollback: none;
      that is why the preconditions are receipts.
- [ ] A22 Delete h2puni. Who: owner. Preconditions: A18's WBS receipt and A20's receipt, or
      the owner's word for each that the data is not wanted; the owner's dated sign-off of a list of what the host still holds, read from the
      host and marked restored or discarded entry by entry: the two other dev databases
      and the configuration archive (design decision 7), the Compose dev stacks' volumes,
      the gate trees, and any controller input left there; a
      test alert delivered in
      `#puni-alerts-dev`; A11's receipt; A10's receipt,
      no caller launching gates on h2puni, and the pool owner's withdrawal of h2puni or
      written confirmation that none is needed; A23's receipt or the owner's waiver, so that
      retiring the poller left staging following `main` or left that accepted in writing;
      the controller does not run there, and no age identity or admin key of the new
      cluster was ever placed there (design decision 10). Command: delete the server in the console. Receipt: the provider's server
      list. Stop: the staging tracker or WBS production has no verified backup under the new
      cluster's prefixes. Rollback: none; that is why the preconditions are receipts.
- [ ] A25 Dev's first deployment (R34), the milestone that closes the reserved dev
      namespaces. Numbered last so that the other steps keep their ids; it follows A18
      and waits for nothing in stage 5. Precondition: the change `add-dev-environment`
      is merged and its slices have landed. Who: operator, with that change's owner.
      Commands: that change's own steps for its `dev` project and its first
      Application, at a ref a person names. Receipt: one app answering on its dev name
      from that ref, in a namespace this change reserved, with every policy of slice
      2.10 in force and none relaxed; the dev account refused a sync of a staging or
      production Application. Stop: a policy of slice 2.10 would have to be relaxed, or
      a dev pod would need the solver directory. Then that change is amended first.
      Rollback: remove the dev Application; the namespaces and their policies stay.
