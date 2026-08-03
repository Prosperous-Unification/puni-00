// The single bundled smoke entry point — finding I5's fix.
//
// Before this, `nx run tool-smoke:smoke` ran `bun run
// tools/tool-smoke/src/{health,ws-ping}.ts` against `-v $PWD:/app`, which
// requires the whole repo checked out on the deploy target. h2puni has no
// checkout (design decision 3: images are built off-host by Dagger and
// published by digest), so that target could never actually run there.
//
// Bundled the same way `tool-remote-scripts` already ships `swap.js` (see
// that project's `build` target and `swap.ts`'s own doc comment): `bun
// build` inlines every import into one file, so shipping this single file
// to `/srv/wbs/bin/smoke.js` is enough — nothing else needs to reach the
// server separately. `tools/tool-deploy/src/deploy.ts` runs it after every
// tier has swapped (design decision 9's "after every deploy"), on a
// throwaway `docker run --network wbs-net` container — smoke has to run
// inside that network to reach be-01/gw-01/fe-01 and Caddy by container-DNS
// name (see health.ts's and ws-ping.ts's own doc comments for why a public
// check could only ever fail).
//
// Runs both suites to completion regardless of whether the first one
// failed — partial diagnostic output is strictly better than none — and
// exits non-zero if either failed. Design decision 10: a smoke failure must
// report loudly and exit non-zero, but must NOT trigger an automatic
// rollback (an automatic rollback on a flaky smoke check is worse than a
// human looking at a report) — so this file only ever reports and exits; it
// has no rollback machinery of its own, and `tool-deploy` calls it strictly
// after every tier has already committed its swap.
import { runHealthSuite } from './health';
import { runWsSuite } from './ws-ping';

/**
 * Runs one suite to a boolean, converting a thrown error (e.g.
 * `requireInternalAuthSecret`/`mintToken`'s "must be set" guards) into a
 * loud, reported failure rather than an uncaught rejection that would abort
 * `main` before the OTHER suite ever got to run — see this file's own doc
 * comment: "runs both suites to completion regardless of whether the first
 * one failed."
 */
async function runSuite(name: string, run: () => Promise<boolean>): Promise<boolean> {
  try {
    return await run();
  } catch (e: unknown) {
    console.error(`[smoke] ${name} suite threw: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

async function main(): Promise<void> {
  const healthOk = await runSuite('health', runHealthSuite);
  const wsOk = await runSuite('ws', runWsSuite);
  console.log(`[smoke] ${healthOk && wsOk ? 'ok' : 'FAIL'}`);
  if (!healthOk || !wsOk) process.exit(1);
}

if (import.meta.main) {
  await main();
}
