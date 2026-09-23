import { DiBag } from 'di-bag';

import type { RealtimeExports, RealtimeRequirements } from './contract';
import { realtimeModule } from './module';

/**
 * Installs {@link realtimeModule} over supplied requirements and returns only
 * what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Realtime can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through
 * a variable still satisfies {@link RealtimeExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installRealtime(requirements: RealtimeRequirements): RealtimeExports {
  const bag = DiBag.createBuilder()
    .installModule(realtimeModule)
    .register({
      eventLog: DiBag.fromSyncFactory(() => requirements.eventLog),
      clock: DiBag.fromSyncFactory(() => requirements.clock),
      push: DiBag.fromSyncFactory(() => requirements.push),
      maxPerSubscription: DiBag.fromSyncFactory(() => requirements.maxPerSubscription),
      maxAgeMs: DiBag.fromSyncFactory(() => requirements.maxAgeMs),
      maxEvents: DiBag.fromSyncFactory(() => requirements.maxEvents),
      onPushFailed: DiBag.fromSyncFactory(() => requirements.onPushFailed),
    })
    .build();
  // Proof (2026-09-23): building `const exposed = { replayBuffer: ..., broadcaster: ...,
  // replay: ..., bag }` and returning it (structurally assignable to `RealtimeExports`, so
  // `wbs-core:typecheck` still exits 0) left `exposes only the contract exports from its
  // installer` failing on its first assertion — `Object.keys(exposed).sort()` reported an extra
  // `"bag"` entry — 0 pass, 1 fail, 5 filtered out.
  // Proof (2026-09-23): keeping the key list correct but hanging `resolve` on the returned
  // broadcaster (`Object.assign(bag.resolve('broadcaster'), { resolve: bag.resolve.bind(bag) })`)
  // left the same test failing on its SECOND assertion instead (`Expected: true`, `Received: false`),
  // with `wbs-core:typecheck` still exiting 0 on this mutation too.
  return {
    replayBuffer: bag.resolve('replayBuffer'),
    broadcaster: bag.resolve('broadcaster'),
    replay: bag.resolve('replay'),
  };
}
