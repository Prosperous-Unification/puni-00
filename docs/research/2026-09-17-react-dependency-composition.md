# React dependency composition

Research date: 2026-09-17. Scope: WBS `fe-01`, its React/Vite/TanStack
Router component layer, and the proposed `di-bag` adoption.

## Recommendation

Keep `di-bag` out of the current frontend adoption. This is a local architectural
judgment based on the existing typed injection seams and the framework guidance
below, not a React prohibition or a claim about container prevalence across all
frontend frameworks. Dependency injection means supplying a dependency from
outside its consumer; a standalone container is one possible mechanism. TanStack
explicitly supports injection through router context without requiring another
container. [TanStack Router context](https://tanstack.com/router/latest/docs/framework/react/guide/router-context)

## Evidence and application

- React recommends trying explicit props and component composition before
  context. Context is useful when distant components need the same information;
  it is not the automatic answer to every chain of props. For this app, continue
  passing narrow API contracts through props, adding focused React providers
  where shared access warrants them. The final sentence is our application of
  the guidance. [React: before you use context](https://react.dev/learn/passing-data-deeply-with-context#before-you-use-context)
- TanStack Router documents typed router context for clients, loader functions,
  and mutation services, and recommends injecting fetching implementations.
  Hooks themselves cannot run in loaders or `beforeLoad`; values obtained in a
  React component can be passed through router context. This already supplies
  an appropriate route boundary for dependencies. [Router context](https://tanstack.com/router/latest/docs/framework/react/guide/router-context)
- Locally, `SignedInRegion` accepts optional `ProjectApi` and `DirectoryApi`
  implementations; `RouteContext` carries them to route components, which pass
  them to pages. `AppRouter` supplies context through `RouterProvider`.
  These existing seams support the recommendation to keep explicit composition.
  [Current router](../../apps/wbs/fe-01/src/app-router.tsx)
- Dependency resolution does not provide React subscriptions. React recommends
  built-in state where suitable; when integrating an external mutable store,
  `useSyncExternalStore` connects a subscription and stable snapshots to renders.
  Thus a container could provide a store instance, but would not replace its
  reactive adapter. [React: useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)
- Resource ownership must still match React lifetimes. Effects synchronize with
  external systems and clean up before replacement setup and on unmount.
  Strict Mode runs an additional development setup/cleanup cycle, so connections
  and subscriptions need repeatable setup and corresponding teardown. A
  container's disposal API would still require explicit integration with that
  lifecycle. [React: useEffect](https://react.dev/reference/react/useEffect)

## When to reconsider

Reconsider a standalone container if the browser gains a substantial headless
application core: for example, an offline synchronization engine with workers,
storage adapters, and independently owned service lifetimes. This is a proposed
decision threshold, not a framework rule. `di-bag` documents factory composition,
dependency checking, scopes, and explicit resource disposal; those capabilities
could become useful at that core's composition root. Keep React consumers on
narrow interfaces and retain explicit subscription/lifecycle adapters.
[di-bag 0.3.0 published package](https://www.npmjs.com/package/di-bag/v/0.3.0)

## Evidence limits

Official framework documentation was read on the research date. Package claims
were checked against the downloaded `di-bag` 0.3.0 tarball's `README.md` and
`package.json`, not its documentation website. Local frontend source was
inspected; no runtime, browser, performance, compatibility, or full repository
gate checks were run for this documentation research. This note does not assert
that the current frontend is free of lifecycle or state-management defects.
