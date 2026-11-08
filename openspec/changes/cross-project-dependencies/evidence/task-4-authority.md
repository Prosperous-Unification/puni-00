# Command authority checkpoint

Worktree: /tmp/puni-cross-command-authority; branch feat/cross-project-command-authority; implementation base dd7456145. No Git metadata mutations, commits, pushes, WBS or OpenSpec edits. WorkItemService and the other workers' new files were not edited. This report freezes only the first ordered command-admission slice for root commit and independent Astra review.

## Implemented

- Required CommandCaller/CommandAccess port, principal-based authenticated runner entrypoints, actor/credential derivation inside the runner, explicit legacy wrappers and current legacy-activation refusal.
- SqliteCommandAccess uses the real composed SqliteOrganizationAccess on the process writer. Original verified delegation, binding, authentication and organization-operation evidence is passed intact. It preserves credential-rule refusal fields, compares expected kind/organization/identity, and returns fresh role/access. The redundant current-user equality is identified as defensive redundancy beside the comparison.
- Current resolution occurs inside the existing UoW before project recovery audit, cross-reference checks, fan-out capture, service-graph construction, prelude, compensation or mutation. Authority refusals remain whole-request outcomes; HTTP mappers preserve their typed bodies. Core and mounted app runner constructions both receive the required same commandAccess instance.
- Boot builds browser/organization authority before services, on source.db with the same clock/cookie verifier/revocation reader; auth-dependent native browser verification is attached after services exist. There is no mutable resolver slot, new SQLite connection, nested public UoW, account-store widening or generic Scope authority field.
- Required direct step recovery boundary resolves the principal in its existing transaction and passes fresh access to add/rename/removal operations. Direct admitted project and bare-step wrappers do the same. Calendar-marker callers received the mechanical signature/fresh-access propagation required by the shared recovery boundary; their legacy routing policy is retained.
- Repair discards directly through the fresh repair scope journal; it builds no service graph and receives no broadcaster capability.
- Explicit localCommandAccess fixtures supply local-only tests. They are never a production default. Required caller/type fixtures were updated, including SQLite consumers and portable composition.

## Fresh verification

| Check                                                                                                                    | Outcome                                                                                                | Evidence                                                                     |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Core command, module, composition, transaction boundary, HTTP step/project/work-item/marker and admission tests          | 191 passed                                                                                             | /tmp/command-final-core-tests.log                                            |
| Mounted current-authority + command/directory/step/replay/context/fan-out regressions and backend command service tests  | 188 passed across 8 files                                                                              | /tmp/command-final-backend-tests.log                                         |
| Final strengthened current-authority suite (capture tripwire and push assertions)                                        | 61 passed; 416 assertions                                                                              | /tmp/command-final-authority-tests.log                                       |
| SQLite authority/UoW/coordinator/claim/resource/working-plan regressions                                                 | 149 passed; 1 existing explicit skip                                                                   | /tmp/command-final-sqlite-tests.log                                          |
| Socket-bound credential-rule regression suite, rerun with scoped escalation                                              | 15 passed                                                                                              | /tmp/command-credential-regressions.log                                      |
| Boot/browser-session regressions, rerun with scoped escalation                                                           | 36 passed                                                                                              | /tmp/command-final-boot-tests.log                                            |
| Actual Nx dedicated types: wbs-core, wbs-store-sqlite, wbs-be-01, wbs-store-memory; core/backend module targets included | All 6 tasks passed, no cache hits                                                                      | /tmp/command-verified-types.log                                              |
| Generated Nx graph                                                                                                       | Created /tmp/command-nx-graph.json; socket restriction used Nx's documented in-process plugin fallback | /tmp/command-nx-graph.log                                                    |
| Changed-path ESLint                                                                                                      | Passed; final new test receives an additional isolated lint check                                      | /tmp/command-final-lint.log; /tmp/command-final-authority-lint.log           |
| Changed-path Prettier and git diff --check                                                                               | Passed; final new test also checked separately                                                         | /tmp/command-final-format-check.log; /tmp/command-final-authority-format.log |

Core test command selected explicit source files via rg --files and ./ prefixes. Backend command selected ./apps/... test files. SQLite command selected ./libs/... test files. Dedicated type command: NX_DAEMON=false bunx nx run-many -t typecheck -p wbs-core,wbs-store-sqlite,wbs-be-01,wbs-store-memory --parallel=2. Formatting/lint used the exact /tmp/command-changed-paths.txt manifest.

## Production-boundary proof evidence

The real composed app uses a held writer turn. Request admission finishes first; the harness's separate rival SQLite connection then revokes the exact binding, removes/demotes membership, or installs a session policy. An injected clock moves pending work across cookie expiry or policy expiry. Releasing the same app's writer yields typed refusal before observation. The matrix includes project batch, directory batch, undo, redo, step prelude, project patch, step add/rename/remove, bare admitted step removal and direct core runner. It snapshots every non-SQLite-internal table after the injected authority change and compares it after refusal, including both relationship tables, all revisions, recovery audit, journal/history and event/sequencer rows. Its final strengthening arms a throwing fan-out capture and asserts no gateway push. Real direct-runner tests cover expected kind/org/user mismatch, read scope, legacy-after-activation, missing trusted marker and malformed membership.

Initial TDD reds: direct read-only runner returned ok:true instead of insufficient_scope; direct admitted-write authority was ignored and reached a throwing graph. Both restored green before broader checks.

Independent watched mutations (all restored, each selected assertion failed):

- Execute current resolver replaced by request access: batch/directory/prelude/direct queued revocation produced 4 failing assertions.
- Replay current resolver replaced by request access: queued undo and redo produced 2 failing assertions.
- Direct project current resolver bypass: queued project revocation failed its mounted status assertion.
- Recovery step current resolver bypass: queued step revocation failed its mounted status assertion.
- Legacy marker comparison forced pre-activation: explicit legacy-after-activation assertion received success.
- Expected-kind comparison removed: scoped expectation/current legacy assertion received success.
- Expected-organization comparison removed: exact context assertion received success.
- Expected-user comparison removed: exact context assertion received success.
- Execute and replay write-scope guards removed independently: real direct read-only assertions failed.
- Fresh repair journal discard omitted: the next undo stayed stale instead of answering nothing_to_undo.

Logs: /tmp/command-proof-*.log; summaries /tmp/command-proofs.log and /tmp/command-scope-proofs.log. Adjacent Proof comments identify the relevant injected fault and tests. The current-user check is explicit defensive redundancy because the real SqliteOrganizationAccess derives current identity from the same principal; it is not claimed as independently necessary policy.

## Failures corrected and setup limits

- Required port/signature changes initially exposed fixture type errors. All named actual dedicated type targets are now green.
- Initial matrix fixture mistakes (project create status, session-policy required columns/minimum bound) were corrected before their cases were claimed. Attempts to mutate immutable organization ownership/activation were rejected by existing production constraints and were discarded as invalid fault models. Expected-context comparison is tested directly using real verified principal evidence; it is not represented as a legal database downgrade.
- The boot fan-out fixture previously replaced only request organizations with a permissive stub. Current revalidation correctly refused that inconsistency. The fixture now uses an explicit trusted direct-context local identity and real SQLite request/transaction authority; 36 boot/browser cases pass.
- Existing organization-activation rollback expectations omitted the already checked-in 20261022211000_add_external_dependencies migration. Actual failure is retained in /tmp/command-sqlite-regressions.log. The only correction adds that exact name to the complete rollback list and updates the exact reapplied last name; no migration source or identity/hash/set assertion was weakened. Final SQLite suite is green.
- The socket-restricted sandbox initially prevented the credential-rule JWKS Bun.serve setup (EPERM), then cleanup also failed. The focused suite was rerun successfully with scoped escalation. Boot socket fixtures likewise ran with scoped escalation.
- A first broad Bun path-filter invocation collected newly emitted dist/out-tsc test JavaScript and failed import resolution there. Explicit ./ source file selection removed that test-invocation ambiguity; the final source run has 191 passing tests.
- Initial changed-path lint/import order and one final Prettier line-wrap failure were corrected; final checks are green.

## Deliberately not claimed

The existing skipped case is assignSubtree on the memory store, beyond the batch > refuses a stale undo once another account changed one of its leaves; it was not changed. The working-plan performance fixture was typechecked after its required resolver injection; no new benchmark claim is made.

No full host gate, build, e2e, deployment, publication or merge was run; root owns the normal-hook commit and final isolated host gate. Endpoint projectId wire additions, checked remote endpoint evidence/context, connected graph facade/derivation/fan-out, remote revision history/replay, external authoring, live wrapper integration and activation remain later ordered slices. Existing local-only foreign-reference guards and external-authoring dormancy are preserved. This is not feature completion or mounted external-positive proof.

Final manifest verified with sha256sum -c /tmp/puni-command-authority-sha256.txt: every path OK. Implementation files are frozen for review.

## Frozen path manifest (61 files; SHA-256)

```text
1360cf03b189faf2a40ff94879dd0e74596b5dee85fac2488c7fea1d1d31785b  apps/wbs/be-01/src/app.ts
aeb620ea5b9e4dd377b6a98a0c4e92c2a4a830d63271812a1097c46f3bb777bc  apps/wbs/be-01/src/boot.db.test.ts
a1d241e98689309127e8bbd6db4b0a2a1db96632adb84c0d80b82dfff9ee5149  apps/wbs/be-01/src/boot.ts
47152715e43967c0ff6fd163df34477ceef301b7d8afff5c8c0d71bcf5027044  apps/wbs/be-01/src/controller/command-current-authority.controller.db.test.ts
cb5341a3ce707909de4842be674dba7ddde4adefc1392226a380af2a6d622c6b  apps/wbs/be-01/src/controller/command-organization.controller.db.test.ts
cbaf99861f719c22c93cd9811031769ff5eb5e72cd5d65d80b979fc283f5229f  apps/wbs/be-01/src/controller/fanout-command.controller.db.test.ts
53b00990085e3ff882b8fb5ff69788c794bf1d775f8aea4dc4dc3383324b2b06  apps/wbs/be-01/src/http/elysia/work-item.test.ts
bde5a552ec33f3aa7c69616621937a3312bc1b06ee142a54912358900b1d405c  apps/wbs/be-01/src/service/announcement-ownership.db.test.ts
0dc0fa12cf2b70546ac91ea7862016566ce35f461123fbd7e26cf451d5c17110  apps/wbs/be-01/src/service/optimization-coordinator.model.db.test.ts
d570b41391adda5d398667790b54b1531c187822f12ddcef4f3284f221218c69  apps/wbs/be-01/src/service/plan-commands.db.test.ts
7a3d2515c65a4f00f3178444bebbbff25cec01d9f079dcf8e4f14c84b88c0b16  apps/wbs/be-01/src/services.db.test.ts
958fd8024c3979c829cc15005fb0cb45338cb831c90a1e296dd3ac47a47cabff  apps/wbs/be-01/src/services.ts
8d2f6f0146895a8e4864370578db633338c8520710e0c42f3a7cd3ee5ebeaefd  apps/wbs/be-01/src/testing/organization-harness.ts
8fd8a111305369d10e891b143cadb7999dd790aa6c6c895dd81ad5b360a6b18d  libs/wbs/adapters/store-sqlite/src/assignee-commands.db.test.ts
72fefcb280f4cd167f6bcdfc239e786a6f00933ff03d3962a8cd47cdb0d8b7be  libs/wbs/adapters/store-sqlite/src/claim-occupancy-race.db.test.ts
44c0c7d0097601a75749ab516e5606e867bb36caea39c8fa571adc33950311c8  libs/wbs/adapters/store-sqlite/src/claim-race.db.test.ts
7242659943debe61649141d009b2a503074f7ba84776dab0de34b93d530d4b46  libs/wbs/adapters/store-sqlite/src/command-access.ts
2f05f4d24f6f5f8ba20da4e52e117c54286a224cb282da6f7a687321127885ee  libs/wbs/adapters/store-sqlite/src/index.ts
0bae5d858d663a78b3eadd401afc72f1d524209224b9df6e170742fd271e591b  libs/wbs/adapters/store-sqlite/src/organization-activation.db.test.ts
4e9719ede76a5813feb4bfb0f65d7586dfbe119435a16ef77e3c0a43151f3cea  libs/wbs/adapters/store-sqlite/src/resource-occupancy.db.test.ts
3be45be132ce3397dc0b2288cfecb7c3638d6c8b85d40d275e8fada4d61b7c78  libs/wbs/adapters/store-sqlite/src/working-plan-order.db.test.ts
f74cc6d92ff49992d1c33fa21cff58a0b2b42a25d3fef62f7613d6e189e02a8d  libs/wbs/adapters/store-sqlite/src/working-plan-performance.test.ts
72ec46db685d0d643dca385c60719a54aa5c353e25bc7426631b9e0c297a6628  libs/wbs/adapters/store-sqlite/src/write-coordinator.db.test.ts
a73dd3f0d3f81a28ad39cb7138a04eb3be8d04aca26c3412e83f23f02a04727b  libs/wbs/application/core/src/compose.test.ts
bd7b8ede73e11fc21f58a3834d8e60347113196e31c1b9dd195fb0f4e606ffd1  libs/wbs/application/core/src/compose.ts
36a21634e7db1f85c9fa5304cff306f77389c9872acd3d44c60eaa268b0e9a86  libs/wbs/application/core/src/http/calendar-marker.routes.ts
f926413ddc8032c127f9dafe58fb8ce4b80738d7b3cbd9dadbba469930ef229a  libs/wbs/application/core/src/http/project.routes.test.ts
2dc3fbb2ac53c620dda527bcc9ba4703f7dec7be453a54344c36ccd72302361f  libs/wbs/application/core/src/http/project.routes.ts
5760bd8c2380e2bbd601ff5edc6fbfbdbec8b19e5383fd66cb3b62d59550d2b7  libs/wbs/application/core/src/http/recovery-write.ts
9cb3c5e1ccbdb61eb6e7cb2efbfec8ec8724a873adffa3644268cc449f8d36e2  libs/wbs/application/core/src/http/step.routes.test.ts
085375194df1895426bee8f63daddd860c1579fd77d6e0c1f1140307e55adb3b  libs/wbs/application/core/src/http/step.routes.ts
2c546c370c218a1d531532370be94342b486e19edccb6d6a999e0463cd68bbe0  libs/wbs/application/core/src/http/work-item.routes.test.ts
f9d40da7269c40547360d3a5ec551c8bcc764b31b7d04150e247e0b14e895a76  libs/wbs/application/core/src/http/work-item.routes.ts
c1793e12f2d45a563514ed829779f50651b1a14602b602185fe4fac6f0147241  libs/wbs/application/core/src/index.ts
519ddb0fdd3b6270492df0528326a4fc6ae8cd0d813c492f000132436c819114  libs/wbs/application/core/src/module/plan-commands/admitted-scope.resource.ts
0962c207b0dc061f2e68de883f4a6b270f91c17468cee0a0b1dfa4d213e9df99  libs/wbs/application/core/src/module/plan-commands/admitted-write.test.ts
f5b437ae4b0016db0eb6a0f6b06b8b2cb42ec4c2ade91153321899c7b1268342  libs/wbs/application/core/src/module/plan-commands/admitted-write.ts
7df28b38ab25f7cc1d2f5e4b2f90dbdc67effd00ca6a24f6af4dbd973123b432  libs/wbs/application/core/src/module/plan-commands/assignee-calendar.test.ts
99a702dc5f94e0573c5d34f8da8a3760deee983106cbc4f7caf2e2644425cdb5  libs/wbs/application/core/src/module/plan-commands/check.ts
1165b8472df06370817f0f5563de864db519d70dbfee0f3efc8bd540c9593333  libs/wbs/application/core/src/module/plan-commands/claim-command.test.ts
23cd5b12f20e0619acd0122cf7b3f9c2471dec4b67a2e7ec55eba71e8a0e372c  libs/wbs/application/core/src/module/plan-commands/composition.ts
2f407ecebb5242acc635745d44a5118f95c4da6f33a41b3b786cf030dc5fa20f  libs/wbs/application/core/src/module/plan-commands/module.test.ts
9f19ce449bcfb59a2d62793a07d61dfa5cd54ea459760def82982dc9597d6e6c  libs/wbs/application/core/src/module/plan-commands/plan-command-admission.test.ts
97781d13296b7ae0073afb28c0745e739431a8704fa6a1711d0fe432c11b091f  libs/wbs/application/core/src/module/plan-commands/plan-command-scope.test.ts
6af9c2096d45c8b8941018efeccdf46324bde94a0fb4ec288b7a10b7f0dc60b2  libs/wbs/application/core/src/module/plan-commands/plan-commands.feature.ts
032082493a79d642468f626334d2460f02b67de79678acee5c7c17a8f6090f39  libs/wbs/application/core/src/module/plan-commands/plan-commands.test.ts
7e0b4cb94217ac615d6b83fb2df7245b2f73055c1bc00af5aaccf1f824c60d22  libs/wbs/application/core/src/module/plan-commands/resource-command.test.ts
8c4bf93be6cc0bbefc3ab3789c370d59d44ddb5b89188f8c42bc237a8e95ab73  libs/wbs/application/core/src/module/plan-commands/resource-schedule.test.ts
79b4be8ad6a5ace857df8b5b70d23984fe4d22a2a77af8972d51f404fda8ddbd  libs/wbs/application/core/src/module/plan-commands/run-command-batch.ts
da28ea3a0418db0440767399ead9309a2115ed2a31e8b9c0cdef912bf2ce933d  libs/wbs/application/core/src/module/plan-commands/step-blockage.test.ts
71a8b6e642ebf43f50a743ac34fc8f145a8ab8ff9b44ad1e81103e03b91c1747  libs/wbs/application/core/src/module/plan-commands/working-plan.test.ts
54b115e662533d7b36cd1352a11fdf6f0c15f72d4704a7fdd6f390a64d0fdd8c  libs/wbs/application/core/src/module/transaction-boundary.types.test.ts
c5a7cd24e67a22fea10cb456605a72c5540fd6a602841ab9354e39372ca1422c  libs/wbs/application/core/src/module/work-item/delete-step-parallel.test.ts
7608ad34118d96b9112f47b202c6e807eb99700adf91327a27a8a27fa5e2bed7  libs/wbs/application/core/src/module/work-item/duplicate-step-parallel.test.ts
dd902321cdfdd823ec65839888176cc26d8d9ac53535a8a580e5ff1febc48c43  libs/wbs/application/core/src/module/work-item/first-child-step-parallel.test.ts
42e6798801e48014c4ba0b6f558f8741fae48c81f8b3cce4f423c96b184e6045  libs/wbs/application/core/src/module/work-item/move-step-parallel.test.ts
6f8b7d976fb3e790a1580a5c1b4e5e7117abb3f7d9e2c8cd7be5dc43389e37ba  libs/wbs/application/core/src/ports/command-access.ts
c69129481b95f7eb15771684da30ae0f2ca91aa61350f951005e928237fabc53  libs/wbs/application/core/src/testing/organization-access-fixture.ts
0907c4eb3b979f5120232d414b5962c3c90405aa9af0b96582b70ec01d6b9c86  libs/wbs/application/core/src/testing/writes-fixture.ts
d32c42d4f6bb8cbb0efd9939efe4ad1bd43d2a9e83f2b01ba12ee6438000a2b4  libs/wbs/application/core/src/use-cases/admission.test.ts
9382f3eeec2bd928d2f421043c2902026c3e60de96f1001c081fe258f4788616  libs/wbs/application/core/testing/portable-composition.ts
```
