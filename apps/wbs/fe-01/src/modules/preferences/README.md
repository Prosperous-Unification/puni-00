# Preferences

Everything this browser remembers for its reader: the palette they chose, whether the chart shows
its detail, which project they had open, how wide each column was, which settings tab they were
on. Fourteen keys, and the one rule that governs all of them.

The service is plain TypeScript and imports no React, which is rule F1 of the code organization
design in `docs/superpowers/specs/2026-09-19-code-organization-design.md`. It is a repository, a
resource-service and a feature-service in one module, because the resource exclusively owns the
repository and the feature exclusively owns the resource.

## What it owns

- The names of all fourteen keys, in `preference-keys.ts`, and nothing else names one.
- The three stored shapes, and which key uses which: JSON for eleven of them, bare text for the
  remembered project id and for the settings modal's open section.
- The one refusal rule the whole app shares: a stored value that is no longer the expected type
  takes its key with it, and the caller's own default stands. This is deliberately not the
  "unknown is not OK" throw of rule R5 — the alternative is a page nobody can open until they
  clear storage by hand, over the colour of a stripe.
- The named answers delivery asks for, so that no screen names a key or picks a shape.

## What it does not own

The guards. Which three words a theme may be, and which five sections a settings modal has, are
those callers' own domain rules and stay with them. Per-entry sanitising is theirs too: the width
store drops entries for columns a reader no longer has, and must not write the sanitised set back.

Recovery from a store that refuses access. A browser with site data blocked throws out of the
adapter and out of everything above it, exactly as the hand-written stores always did. Turning
that into a silent default would be a behaviour change with its own intent.

## Invariants

Every key name and every stored byte format is a compatibility fact: readers have this data in
their browsers now. Renaming a key, or writing JSON where bare text stands, silently loses
whatever that reader had said. The two bare-text keys cannot become JSON.

## Relationships

The exported types are in `contract.ts`; the repository adapter is
`browser-storage.repository.ts`, which also holds the revocable store the module owns; the
resource is `preferences.resource.ts`; the named answers are `preferences.feature.ts`.
`module.ts` is the sealed DI Bag module — exports `preferences` and `remembered`, keeps
`preferencesStore` private under the `frontend.preferences` label, and requires `browserStore`
from its host, which is `apps/wbs/fe-01/src/runtime/application-runtime.ts`. That runtime is the
only instance: delivery reads `remembered` through `useApplicationServicesState` or, at the instant
of an event, `useApplicationServicesReader`, and there is no module-load duplicate any more.
`apps/wbs/fe-01/src/lib/remembered.ts` keeps the generic factory for the layout module, which
builds a store per project id, resolves the runtime's `preferences` from its lifetime slot at every
call, and is the reason `preferences` is a public export at all.

This module carries **no** `module-index` block yet, and adding one is its own packet: the
`docs/wiki-policy` registration and the index that names these files land together, for the reason
`libs/wbs/application/core/src/module/plan-history/README.md` gives.

## Checks

The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`, for
`preferences.resource.test.ts`, `preferences.feature.test.ts` and `module.test.ts`. The adapter's
own suite, `browser-storage.repository.test.ts`, names browser globals and therefore runs in the
`test` target instead. The behaviour this extraction preserves is proved by the theme,
layout, chart, settings and project page suites in that same target.
