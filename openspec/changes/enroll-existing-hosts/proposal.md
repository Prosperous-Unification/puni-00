# Intent

## Problem

The production desired fleet held documentation addresses and pending identities, while the two
hosts chosen for the platform cluster already exist: h4claw and h3mon run Ubuntu 26.04, Docker
and, on h3mon, Victoria, Grafana and MLflow. The roles accepted only Ubuntu 24.04, disabled every
swap device, gave the kubelet the whole host's memory, and assumed a fresh machine. Nothing read a
host before enrollment, and nothing returned one to its prior state.

## Desired outcome

Desired state names the real placement (Twilight Dash WBS 070.1, 070.2): h4claw is the single
platform server, h3mon an observability agent; h2puni and h1claw stay outside k3s. A read-only
preflight play records each host's facts and refuses an unfit target; the roles keep one sized
swap file, cap pods below host memory and support 26.04; a rollback play removes a failed first
enrollment without touching Docker. The operator runbook lists every command, in order, with
backups and rollback. Unread machine IDs are explicit operator inputs that no operation accepts.

## Non-goals

- Touching any real host; applying is authorized separately.
- Automating the first server of an SSH-only cluster through `tool-fleet:apply`.
- Joining h2puni (WBS 070.3) or retiring Victoria (070.9).
- Moving Victoria, Grafana or MLflow into k3s.

## Constraints

Preflight mutates nothing. Pods never swap. Every default eviction threshold stays set. The
QEMU lab proves 26.04, the swap file, kubelet reservations, Docker coexistence, rollback and a
second convergence with `changed=0` before any host apply.
