# shared/ui-saas-01

`@ui/saas-01`: the dense application kit. A complete theme over
[`@ui/core-01`](../ui-core-01/README.md)'s vocabulary and the primitives WBS is
built from. `runtime:browser`, `product:shared`.

Values, scales and every primitive's rules: [DESIGN.md](DESIGN.md). The change
that introduced it: `openspec/changes/design-system-foundation`.

## Registry

`registry.json` lists every primitive file as a shadcn item; `bunx nx run shared-ui-saas-01:registry`
builds the per-item JSON into `dist/registry/ui-saas-01`. shadcn 3.8.5 has no `registry validate`
command; its `build` is the check: it exits 1 on a schema error (`Invalid registry file found`)
and on an item file that does not exist (`ENOENT`). The kit's `build` depends on it. Proof: the
`label` item pointed at `src/missing.tsx` made the target exit 1 on `ENOENT: no such file or
directory` (2026-10-21).

The primitives import `cn` from `@ui/core-01`, so the registry carries core's `cn.ts` as its own
`registry:lib` item, `cn`. The items do not name it in `registryDependencies`: a reference to an
item of the same registry is its hosted URL, and the registry is not hosted yet. Until it is, a
consumer installing an item also installs `cn` and points `@ui/core-01` at it.
