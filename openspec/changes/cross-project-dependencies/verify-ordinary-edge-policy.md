# Mandatory ordinary policy source evidence

Scope: P1 source prerequisite only. No host mutation, policy initialization,
installation, adoption, store scan, dormancy proof, P2 restoration verifier or P3
compatible controller is claimed. Parent 10.2-S4 remains open.

TDD observed missing reader/export failures before implementation; startup parser
assertions failed against legacy string return and rejected policy mode. The real
drain fixture missing-policy test first failed at missing manifest, then passed
with policy admission before the manifest read. Socket-based process tests require
an unsandboxed local run: the sandbox returns `listen EPERM`, which is not a
runtime regression.

The policy tests cover closed namespace, unsupported phases, state binding,
missing/unreadable/malformed/oversized/symlink/nonregular files, canonical state,
nonenumerable state, opened/path replacement, final path/metadata drift,
nonblocking FIFO refusal, exclusive initialization, marker and held-lock refusal,
file/directory sync failure and independent readback failure. Failed publication
retains evidence. CLI tests cover config boundary refusal, policy preflight,
lifetime locks through SIGTERM/SIGKILL and dry-run-default initialization.
Installer tests cover policy refusal before publication and preservation of policy
bytes/inode. Strict unit/drain tests refuse legacy argv. The disposable creator
uses the shared startup parser and policy admission; its scratch policy is
initialized explicitly before the service starts.

Watched production omissions, each observed exit 1, are retained as individual
logs in [evidence/ordinary-edge-policy](evidence/ordinary-edge-policy):
`closed-policy`, `canonical-state`, `bounded-policy`, `opened-identity`,
`final-identity`, `nonblocking-open`, `nofollow-open`, `readable-directory`,
`exclusive-init`, `init-lock`, `init-marker`, `file-sync`, `directory-sync`,
`independent-readback`, `runtime-policy`, `policy-runtime-marker`,
`cli-policy-mode`, `readonly-policy-check`, `installer-policy`, `adopted-unit`,
`read-parent-identity`, `init-parent-identity`, `relative-publication`, `private-parse`,
`publication-identity`, `publication-parent`, `startup-arguments`, `readonly-marker`,
`fixture-policy-admission`. The relative-publication mutation concretely created
`edge-policy.json` in the swapped foreign directory and the test failed on that
foreign publication. The reader parent mutation admitted a same-inode hardlinked
policy under a replaced parent. Native directory-relative publication is Linux x64
only, matching the existing proven primitive; other ABIs refuse.
An initial opened-identity proof survived because a later boundary refused; its
test now requires the opened-file boundary and the repeated omission fails.
An initial preflight omission survived a valid-policy-only test; missing-policy
coverage was added and the repeated omission fails. All source files were
restored after each mutation.

Final source validation (local, authorized socket-capable execution):

- Focused `bun test` over policy, initializer, admission, actual CLI, supervisor,
  installer, unit observer, exclusion, drain transport and creator: **194 pass,
  0 fail**, 12 files, 909 expectations. Exact command/output: `focused-tests.log`.
- Configured `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run
tool-remote-scripts:lint`, `:typecheck` and `:build`: passed; named logs retained.
- `bunx openspec validate cross-project-dependencies --json`: valid; existing
  requirement-length warnings remain in `openspec.log`.
- Full integrated suite and exact-SHA host gates are deferred to parent integration
  after the independent observer fix is combined. No host acceptance was run here.

The frozen review commit is recorded by the parent review request; subsequent
review evidence will be a separate commit.
