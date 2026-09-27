# Service kinds policy

[`kinds.json`](kinds.json) records the reviewed kind of each backend service file that does not
yet declare its kind in its filename. It is temporary migration policy: files should eventually
carry a `.feature.ts`, `.resource.ts`, or `.repository.ts` suffix instead.

When a file gains a kind suffix, delete its policy entry in the same commit. Keeping both fails
`no entry classifies a file that already declares its kind by suffix`.

To classify a new unsuffixed backend service, add one entry in path order with its `path` and
`kind`. A feature also names its `capability`, a resource names its glossary `term`, and support
code states its intended `disposition`. Every entry includes a one-line `rationale` naming the
callers, stores or ports read and the capability or glossary term served. A mechanically identified
re-export shim is the sole exception: its disposition begins `re-export shim;` and is the complete
evidence, so it carries no separate rationale.

The kinds, dependency direction and rollout modes are defined by the
[code organization design](../superpowers/specs/2026-09-19-code-organization-design.md).

## Rule policy

[`rule-policy.json`](rule-policy.json) is the repository's Twilight Burokrat rule policy. It states
`observe` for every registered rule and carries the classification policy `INV-CLASSIFY` needs: every
tracked entry must match exactly one content rule, and there is deliberately no catch-all. A new
kind of file needs a reviewed selector here, not a broader one.

`check` refuses a rule policy inside the candidate it judges, so select the policy from a trusted
revision and copy it out before checking:

```sh
policy="$(mktemp -d)/rule-policy.json"
git show origin/main:docs/code-organization/rule-policy.json > "$policy"
bun run apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check committed . HEAD "$policy" --rule INV-CLASSIFY
```

Only `INV-CLASSIFY` has its inputs here; the other rules need policy fields this file does not yet
state, so `check` without `--rule` refuses. The classification rules started as a copy of the wiki
pilot's in [`../wiki-policy/policy.json`](../wiki-policy/policy.json); the two are reviewed
separately and may diverge.
