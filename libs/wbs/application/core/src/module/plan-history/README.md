# Plan history

This module is not yet registered as a wiki module: `docs/wiki-policy/policy.json` needs a
trusted boundary for `module.application.plan-history`, and
`apps/wiki/cli/src/policy/pilot-policy.test.ts` pins both the mapping length and the exact set of
discovered index identifiers. Adding the `module-index` block before those land fails that suite,
so registration is its own packet.

The plan's history, read. This is the first sealed DI Bag module in the core: `module.ts` seals
the graph and exports `history` alone, `check.ts` is the only place that builds a bag, and
`contract.ts` states the two repository ports a host must supply — preserved K3 debt, not
compliance. Private bindings are named under the `application.plan-history` label, so a DI failure
says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module;
`libs/wbs/application/core/src/index.ts` and
`libs/wbs/application/core/src/service/history.service.ts` keep the former
`@wbs/core/service/history.service` names. Workspace-relative paths rather than Markdown links:
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` resolves a relative link against the
file that carries it, and this listing is quoted inside a plan document at another depth.
