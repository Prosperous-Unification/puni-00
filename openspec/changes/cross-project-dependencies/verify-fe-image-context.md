# Frontend image build context repair — 2026-10-23

The frontend's `project.json` now declares `wbs-be-01` and `wbs-gw-01` as
implicit dependencies so changed backend or gateway code reaches frontend CI.
The frontend Dockerfile retained its slim context: it copied the frontend and
libraries, but neither sibling project's Nx metadata. On draft PR head
`7ec0e7035`, [infra-check 39898917870](https://github.com/Prosperous-Unification/puni-00/actions/runs/39898917870)
failed before Kubernetes started, at `RUN bunx nx run wbs-fe-01:build`. The lab
uses `docker build -q` and reported only the outer Dockerfile failure, so that
CI log alone did not identify the inner cause.

Local reproduction used the same Dockerfile and checkout with Docker's plain
progress. The first build with default networking was interrupted during
`bun install`; it did not reach Nx and is not a diagnostic of the CI failure.
The host-network build installed the locked dependencies and then failed at
Nx project-graph construction: both implicit dependencies named nonexistent
projects. After copying their two `project.json` files into the build stage,
the next build passed graph construction but failed trying to build absent
`apps/wbs/be-01/src` and `apps/wbs/gw-01/src`. Those are two distinct observed
negatives, not a claim that the CI runner printed either inner error.

The Dockerfile now includes the two sibling project declarations for graph
resolution and invokes the frontend Nx target with
`--excludeTaskDependencies`. That flag affects only this slim image build;
ordinary workspace/CI Nx targets still run their dependency graph. The final
`docker build --progress=plain -f apps/wbs/fe-01/Dockerfile -t
wbs-fe-01:diag-7ec-fixed3 .` exited 0 with Docker's default network and
exported the runtime image. Its frontend Nx target transformed 1,140 modules
and Vite completed. The local full log is
`/tmp/puni-fe-docker-fixed3-7ec.log`; the two red diagnostics are
`/tmp/puni-fe-docker-host-7ec.log` and
`/tmp/puni-fe-docker-fixed-7ec.log`.

The subsequent exact-head [infra-check 39902390854](https://github.com/Prosperous-Unification/puni-00/actions/runs/39902390854)
on pushed `9b3bca6bfc3b0491b93f76bb609f61910d02278c` completed successfully:
`fleet-check` job `120246662147` and `k3s-rehearsal` job `120248356554` both
reported success. The rehearsal ran from 04:55:44 to 05:15:57 UTC on
2026-10-23. This closes the image-context and real rehearsal check for that
checkpoint; later code changes still need their own exact-head gate.
