# Tasks

- [x] P0 — Record the scope, package name, rename map, freeze ruling, and registry availability per [P0](../../../docs/superpowers/plans/2026-09-17-twilight-burokrat-package.md#p0--record-scope-and-the-rename-boundary).
- [x] P1 — Establish the independently installable boundary with watched executable negatives per [P1](../../../docs/superpowers/plans/2026-09-17-twilight-burokrat-package.md#p1--establish-the-independently-installable-boundary).
- [x] P2 — Package the trusted toolkit and prove digest/activation failures per [P2](../../../docs/superpowers/plans/2026-09-17-twilight-burokrat-package.md#p2--package-the-existing-toolkit-and-preserve-activation-semantics).
- [x] P3 — Install and certify the tarball outside the monorepo per [P3](../../../docs/superpowers/plans/2026-09-17-twilight-burokrat-package.md#p3--prove-the-tarball-outside-the-monorepo).
- [ ] P4 — Transfer and release exactly the tested artifact per [P4](../../../docs/superpowers/plans/2026-09-17-twilight-burokrat-package.md#p4--release-exactly-the-package-that-was-tested).
  - [x] Release planner, tag-triggered `twilight-burokrat-release.yml` that verifies then publishes the same tarball, dry run, and every refusal in verify.md.
  - [ ] Publish `twilight-burokrat@0.1.0`. Prepared: the tarball from `bunx nx run twilight-burokrat:pack` (latest recorded: `2aadf267…4ed83` at `9ce66b7e`, see the consumer verify.md) and the release workflow, which rebuilds and verifies at the tag. Blocked on the root/package license, npm ownership, the protected `twilight-burokrat-release` environment with `NPM_TOKEN`, and the tag ruleset. Next: `git tag twilight-burokrat-v0.1.0 <reviewed main SHA> && git push origin twilight-burokrat-v0.1.0`, then `bun info twilight-burokrat@0.1.0 dist.integrity` against the release record.

## Declaration closure repair (2026-10-15)

- [x] C1 — Watch nested instance traversal and exclusion regressions fail; implement bounded importer-relative closure collection shared by all three producers.
- [x] C2 — Record the reviewed release-owned roots; watch packed external extraction with nonempty selectors and public declarations fail before adding them.
- [x] C3 — Prove missing, unreadable, decoy, unrelated package and digest corruption refusals on production paths; record watched faults and adjacent Proof comments.
- [x] C4 — Run focused package/policy checks, source lint, typecheck, formatting and OpenSpec validation; repeat the same-policy full packaged survey with exact executable identity and remaining refusals.
- [ ] C5 — Obtain Astra review, commit and push a draft PR; do not merge or publish the package.
