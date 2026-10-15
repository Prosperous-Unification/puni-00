## 1. Private ownership regression

- [x] 1.1 RED: `forge Nx workspace state > starts independently of poisoned worktree ownership without changing its database` observes real installed Nx waiting on a conflicting continuous-task owner, then fails to start independently with the baseline overlay. Bound child process groups and deadlines.
- [x] 1.2 GREEN: bind the private workspace directory in the forge overlay, retaining daemon disabling, limits, requests and security. Extend `binds the committed overlay to one environment` to assert effective state and exact mounts.
- [x] 1.3 Remove the overlay setting and observe both assertions fail, restore, and add adjacent `Proof:` comments. Verify original ownership rows and database bytes unchanged on the private path.

## 2. Evidence and checks

- [x] 2.1 Document dated ownership recovery and separate cold-start OOM in `docs/infra/local.md`.
- [ ] 2.2 Run focused tests, scoped tool-devsync test/lint/typecheck/build, formatting and OpenSpec validation; record fresh output and limits in `verify.md`. Focused regression, scoped lint/typecheck/build, formatting and OpenSpec passed; full `tool-devsync:test` remains unverified after the bounded 600-second run exited 124.
