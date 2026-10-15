## 1. Private ownership regression

- [x] 1.1 RED: `forge Nx workspace state > starts independently of poisoned worktree ownership without changing its database` observes real installed Nx waiting on a conflicting continuous-task owner, then fails to start independently with the baseline overlay. Bound child process groups and deadlines.
- [x] 1.2 GREEN: bind the private workspace directory in the forge overlay, retaining daemon disabling, limits, requests and security. Extend `binds the committed overlay to one environment` to assert effective state and exact mounts.
- [x] 1.3 Remove the overlay setting and observe both assertions fail, restore, and add adjacent `Proof:` comments. Verify original ownership rows and database bytes unchanged on the private path.

## 2. Evidence and checks

- [x] 2.1 Document dated ownership recovery and separate cold-start OOM in `docs/infra/local.md`.
- [x] 2.2 Run focused tests, scoped tool-devsync test/lint/typecheck/build, formatting and OpenSpec validation; record fresh output and limits in `verify.md`. The 2026-10-15 attempt timed out at 600 seconds; the separate 2026-10-16 bounded run passed all 637 tests in 813.73 seconds. Scoped compile, formatting, OpenSpec and watched fault receipts are recorded in verify.md.

## 3. Bounded first-attempt diagnostic driver

- [x] 3.1 RED/GREEN: exercise the production rehearsal orchestration with controlled external observations; preserve cold OOM, reject foreign UID/unchanged identity, omitted ingress negative and restoration mismatch.
- [ ] 3.2 Add bounded Bun CLI for owned disposable fresh-worktree labs, node memory/RSS observation, exact identity/policy/browser evidence and always-run cleanup; keep the existing checker and runtime limits unchanged.
- [x] 3.3 Watch removed-check faults fail, restore guards, run focused checks and full tool-devsync:test separately within a realistic deadline.
- [x] 3.4 Run one instrumented fresh-worktree disposable lab if tools/capacity/ownership permit; record each stage independently and precise unavailable evidence.

## 4. Astra review: safe split and executable boundaries

- [x] 4.1 Remove automatic lab creation and teardown until tool-fleet supplies creation receipts. Inventory all Docker resource kinds, prove seeded network/volume refusal, and prove the disabled CLI preserves a post-inventory resource. No cooperating-only lock is treated as ownership.
- [x] 4.2 Add finite process-group SIGKILL deadlines and an explicit exit ceiling. Exercise a real TERM-ignoring process and descendant plus direct-exit descendants; watch the TERM-only mutation fail. Automatic startup and remote sampler paths are removed.
- [x] 4.3 Exercise real command fixtures for foreign node UID, PID zero/one, non-PID1, every surviving cleanup resource and kubeconfig mutation. Continue all independent verifications after a failure; watch each guard removal fail.
- [ ] 4.4 Design and implement creation receipts in the owning tool-fleet lifecycle before re-enabling 3.2. This is an explicit follow-up architecture boundary, outside this bounded diagnostic packet.
- [ ] 4.5 Record final focused/static/OpenSpec checks and an exact committed full tool-devsync:test run if feasible; preserve original failed live outcomes.

- [x] 4.6 Replace existsSync absence inference with lstat and ENOENT-only absence; prove unreadable state directory failure and continued kubeconfig verification with a chmod-000 command-boundary fixture and a watched swallowed-error mutation.
