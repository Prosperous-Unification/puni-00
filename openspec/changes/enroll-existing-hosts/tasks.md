# Tasks

- [x] 1. Placement: `infra/fleet/desired.yaml` names h4claw (server) and h3mon (observability)
      with `operator-input:` machine IDs; `placement.test.ts` fails first, then passes.
- [x] 2. Planner negatives: unresolved operator input, duplicate SSH address, enrollment target
      not observed unenrolled at its identity, another machine at the desired address; each
      watched failing with its guard disabled.
- [x] 3. Static inventory `production-existing-hosts.yml` equal to desired placement and machine
      IDs; budget test fits observability workloads in h3mon's allocatable memory.
- [x] 4. Roles: Ubuntu 24.04 and 26.04, one sized fleet swap file, kubelet reservations and full
      hard-eviction set; QEMU 26.04 lab converges twice with `changed=0`.
- [x] 5. Read-only `preflight.yml` with negatives for interface, machine ID, k3s present, port,
      CIDR overlap and a stopped preserved service.
- [x] 6. `rollback-host.yml` rehearsed on a Docker host in the lab: idempotent, Docker untouched,
      host re-enrolls.
- [x] 7. Runbook `docs/infra/enroll-h4claw-h3mon.md` with ordered commands, backups and rollback.
- [ ] 8. Real hosts: run the runbook after Dany authorizes it; record results here.
