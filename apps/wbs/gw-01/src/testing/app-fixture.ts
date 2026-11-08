import { type AppOptions, buildApp as buildProductionApp } from '../app';

/** Existing socket scenarios run against explicitly disabled dependency authority. */
export function buildApp(
  opts: AppOptions,
  makeLogger?: Parameters<typeof buildProductionApp>[1],
): ReturnType<typeof buildProductionApp> {
  const fetchBackend = opts.fetchImpl ?? globalThis.fetch;
  return buildProductionApp(
    {
      ...opts,
      fetchImpl: (url, init) =>
        url.endsWith('/internal/gateway/dependency-admission')
          ? Promise.resolve(new Response(null, { status: 204 }))
          : fetchBackend(url, init),
    },
    makeLogger,
  );
}
