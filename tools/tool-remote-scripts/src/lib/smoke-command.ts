import { APP_NAME, type Color, PORT, type Tier } from './deploy-contract';
import type { EnvLayout } from './env';
import type { TierState } from './state';

// The app names and the ports come from `@tools/deploy-contract` — the entry
// point the comment here used to say did not exist, while line 9 was already
// importing `@tools/env` out of that same project. The health *paths* stay:
// they are this file's only, and nothing else has a copy of them.
const TIER_HEALTH_PATH: Record<Tier, string> = { be: '/health', gw: '/health', fe: '/' };

/**
 * The in-network URL smoke uses to reach a tier's container.
 *
 * The container prefix comes from the layout, not from TIER_APP alone. Without
 * it, a dev smoke targets `be-01-blue` — PROD's container name — and gets one
 * of two wrong answers: a connection failure (dev's network has no such name,
 * which is what happened on the first dev deploy: three FAIL 0 lines and an
 * aborted operation), or, if the smoke were ever run on prod's network, a
 * green report about prod's containers after deploying dev.
 */
function tierUrl(tier: Tier, path: string, color: Color, layout: EnvLayout): string {
  return `http://${layout.containerPrefix}${APP_NAME[tier]}-${color}:${String(PORT[tier])}${path}`;
}

/**
 * Finding I5(b): wires `tool-smoke` (bundled to `/srv/wbs/bin/smoke.js` —
 * see `tools/tool-smoke/project.json`'s `build` target and
 * `tools/tool-smoke/src/main.ts`'s doc comment) into the deploy path.
 * Design decision 9 says smoke runs "after every deploy"; before this,
 * nothing called it at all.
 *
 * Per-tier colour overrides (`SMOKE_BE_URL`/`SMOKE_GW_URL`/`SMOKE_FE_URL`/
 * `SMOKE_INTERNAL_URL` — see `tools/tool-smoke/src/health.ts`'s
 * `resolveTargets`/`resolveInternalForwardUrl`), not a single `SMOKE_COLOR`:
 * each tier's blue/green state moves independently, and a deploy need not
 * leave all three on the SAME colour even with `--all` (each tier flips its
 * OWN current colour; verified live on h2puni mid-branch, where be/gw were
 * both green and fe was still blue). A single global colour would silently
 * smoke-test the wrong container for whichever tier disagreed. `state` is
 * read back from the server's own just-committed state (never guessed, never
 * operator-supplied), which is what "the deploy knows the colours it just
 * swapped to" means here — a tier with no recorded state (never deployed)
 * is simply left without an override rather than guessed at.
 *
 * The JWT signing key and `INTERNAL_AUTH_SECRET` smoke needs never appear on
 * this command line, and this process (running on the operator's machine,
 * not the server) never reads them: they reach the ephemeral smoke
 * container via `--env-file /srv/wbs/gw-01.secrets.env` on the server side,
 * which already carries exactly those two and nothing else (see
 * `lib/docker.ts`'s `SECRET_KEYS`) — "pass them rather than making an
 * operator supply them" without this process ever handling secret bytes.
 */
export function buildSmokeCommand(
  state: Partial<Record<Tier, TierState>>,
  layout: EnvLayout,
  artifactPath = `${layout.root}/bin/smoke.js`,
): string {
  const overrides: string[] = [];
  const be = state.be?.activeColor;
  const gw = state.gw?.activeColor;
  const fe = state.fe?.activeColor;
  if (be !== undefined) {
    overrides.push(`-e SMOKE_BE_URL=${tierUrl('be', TIER_HEALTH_PATH.be, be, layout)}`);
    overrides.push(`-e SMOKE_INTERNAL_URL=${tierUrl('be', '/internal/forward', be, layout)}`);
    overrides.push(`-e SMOKE_API_URL=${tierUrl('be', '', be, layout)}`);
  }
  if (gw !== undefined)
    overrides.push(`-e SMOKE_GW_URL=${tierUrl('gw', TIER_HEALTH_PATH.gw, gw, layout)}`);
  if (fe !== undefined)
    overrides.push(`-e SMOKE_FE_URL=${tierUrl('fe', TIER_HEALTH_PATH.fe, fe, layout)}`);
  // The signed-in read account is optional and operator-authored on the host
  // (tool-smoke's `resolveReadIdentity`). Absent, the reads print SKIPPED;
  // present but unreadable, `docker run` refuses it and smoke fails.
  const readAccount = `${layout.root}/smoke-read.env`;
  return (
    `cd ${layout.root} && docker run --rm --network ${layout.network} ` +
    `--env-file ${layout.root}/gw-01.secrets.env ` +
    `$(test -e ${readAccount} && printf -- '--env-file %s' ${readAccount}) ` +
    `${overrides.join(' ')} ` +
    `-e SITE_ADDRESS=${layout.siteAddress} ` +
    `-v ${artifactPath}:/smoke.js:ro oven/bun:1.3.14-alpine bun run /smoke.js`
  );
}
