## Local verification

The baseline is integration commit `f99b1dbb93ed8d13ad71538be1a4f88aad15d8eb`, with the reviewed release head and main as its two parents. The integration used ordinary Git hooks and preserved all 25 incoming blob and mode pairs.

The bounded local runs used a 4 GiB memory limit, zero swap, a 200% CPU quota, 128 tasks and a 150-second service budget. The capture retained native statuses, full output, resource samples and physical settlement for each test stage.

| Checks                                                                                                | Observed result                                                                                                                         |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Capacity and aggregate tests against the original workflow                                            | Native 1, 25 pass, 1 fail. The tuple assertion expected the Fleet image selector and received `ubuntu-24.04`.                           |
| Capacity and aggregate tests with both selectors                                                      | Native 0, 26 pass, 0 fail. Provisioning compares all fields except the heavy Python version, which the tuple assertion checks directly. |
| Workflow, affected/full selection, partition, aggregate, pixels, corpus and native provisioning tests | Native 0, 255 pass, 0 fail.                                                                                                             |
| Production PR merge-base consumers, heavy scope and recorder contracts                                | Native 0, 85 pass, 0 fail.                                                                                                              |
| Scoped ESLint with the actual Nx project graph                                                        | Native 0. The graph-dependent rule ran.                                                                                                 |
| Uncached `tool-git-hooks:typecheck`                                                                   | Native 0 with one TSGo builder and one checker.                                                                                         |

The first post-edit run passed the tuple assertion and failed the first-seven-step provisioning comparison. Its diff named only the changed `python-version`. The repaired comparison retains exact step order, action identities, all other inputs and native provisioning.

## Production-path failure proofs

The Bun test parses the actual CI workflow. Each injected fault ran in its own capture, returned native 1 with 25 passing tests and one failing test, and restored the exact workflow bytes.

| Fault in `gate_heavy`                                   | Assertion that failed                                                | Observation                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Replaced the runner selector with `ubuntu-24.04`        | Python jobs pin the Fleet and standard hosted runtime tuples         | Received the old runner literal.                                            |
| Replaced the Python selector with `3.14.4`              | Python jobs pin the Fleet and standard hosted runtime tuples         | Received the old Python literal.                                            |
| Widened both selectors to include `tool-devsync`        | Python jobs pin the Fleet and standard hosted runtime tuples         | Received a runner selector granting the new tuple to the second owner.      |
| Changed the setup cache dependency to `requirements.in` | Every runtime keeps exact checkout and native provisioning before Nx | The tuple passed. The exact provisioning diff showed the altered lock path. |

## Commands

The Bun test runs used `--preload ./tools/test/scratch/preload.ts`. The focused tuple and fault runs used `--timeout=10000`. The broader runs used `--timeout=60000`.

- `tools/tool-git-hooks/src/hooks/{ci-capacity-workflow,gate-workflow,pixels-workflow,corpus-lint-workflow,ci-plan,ci-runtime-partitions,ci-runtime-selection,pr-merge-base}.test.ts`
- `tools/tool-devsync/src/toolchain-pins.test.ts`
- `bun --no-env-file ./node_modules/.bin/nx show project tool-git-hooks --json`
- `bunx --no-install eslint tools/tool-git-hooks/src/hooks/ci-capacity-workflow.test.ts`
- `bun --no-env-file ./node_modules/.bin/nx run tool-git-hooks:typecheck --excludeTaskDependencies --skip-nx-cache --parallel=1 '--args=--builders 1 --checkers 1'`
- `bunx --no-install prettier --check` on the two source paths and four OpenSpec artifacts, then `git diff --check`
- `./node_modules/.bin/openspec validate qualify-fleet-ubuntu-26 --type change --strict --json --no-interactive` and `./node_modules/.bin/openspec validate --all --json --no-interactive`

## Hosted and canonical qualification

The required hosted checks and full canonical host gate remain pending on the exact published source. The complete hosted Fleet run must demonstrate native provisioning, the production resource scope and all selected test, lint, typecheck and build work. The local checks covered the workflow and its contracts. The Fleet suite and the full repository gate were deferred to hosted and canonical execution.
