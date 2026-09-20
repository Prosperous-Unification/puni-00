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
