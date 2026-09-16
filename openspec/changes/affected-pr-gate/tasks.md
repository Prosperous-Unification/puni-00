Ordered TDD slices. Every slice's oracle reads the production `.github/workflows/ci.yml`
through `Bun.YAML.parse` or as text; there is no copy of the workflow to assert against.

## 1. Gate scope per event

- [ ] 1.1 Extend `tools/tool-devsync/src/toolchain-pins.test.ts` with the gate-scope oracle:
      the `Gate mode` step maps `pull_request` to `nx affected` with the payload base SHA and
      `push`/`merge_group`/`workflow_dispatch` to `nx run-many`, and the mapped set equals the
      workflow's `on:` subscriptions — test: `bunx nx test tool-devsync --skip-nx-cache`, red
      before the workflow changes.
- [ ] 1.2 Add the `Gate mode` step and the affected branch of the Nx gate step to the
      workflow, keeping its three-part shape and `--exclude=tool-wiki` — test:
      the same suite green; `gate-entrypoints.test.ts` stays green on both tool-wiki literals.
- [ ] 1.3 Safety check: the `*)` arm refuses an event with no gate rule — test: the mapped set
      equals the subscribed set and the refusal arm is present; negative: delete the `*)` arm
      from the production workflow, observe the pin suite fail, restore, record the observed
      expectation in `verify.md`.
- [ ] 1.4 Safety check: Tool Wiki's targets run on a pull request when `tool-wiki` is affected,
      read from `nx show projects --affected --json` via `jq` — test: the pin suite asserts the
      `jq` membership read and both tool-wiki commands inside the affected branch; negative:
      remove the tool-wiki branch, observe the pin suite fail; and separately confirm the
      `grep`-on-`--sep` form the brief proposed can never match, since `nx show projects`
      emits JSON on a non-TTY.

## 2. Browser shards follow the switch

- [ ] 2.1 Extend `tools/tool-git-hooks/src/hooks/pixels-workflow.test.ts` with the shard-scope
      oracle: a `pixels_mode` job computes the boot-set membership, `pixels_shard` is gated on
      its output, and `pixels` needs both jobs — test: `bunx nx test tool-git-hooks` with
      `--skip-nx-cache`, red before the workflow changes.
- [ ] 2.2 Add `pixels_mode`, gate `pixels_shard` on it and rewrite the `pixels` aggregate so a
      skip is only accepted when the scope job said the stack is unaffected — test: the same
      suite green, existing shard/matrix/artifact assertions untouched.
- [ ] 2.3 Safety check: `pixels` refuses a skip it cannot explain — test: the aggregate script
      requires `needs.pixels_mode.result` to be `success` and matches its reported verdict;
      negative: reduce the script to `test "${{ needs.pixels_shard.result }}" = success`,
      observe the pin suite fail, restore.

## 3. Evidence

- [ ] 3.1 `verify.md` records every command with its result line, both failure proofs with the
      observed expectations, and the live-run rows — a pull-request run's task list as a strict
      subset, a `push` run's full list, the throwaway negative pull request, and the first
      `merge_group` run — left pending with their exact steps until the ruleset exists.
