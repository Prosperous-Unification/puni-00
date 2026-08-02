import { appName, containerName, PORT } from './docker';
import type { Color, Tier } from './state';

/**
 * Pure helpers for the single rendered `site.caddy` — the routing source of
 * truth (design decision 6): a deploy killed between `caddy reload` and the
 * state-file write leaves the file saying one colour while Caddy actually
 * routes to the other, so `observe()` must read the rendered config rather
 * than trust the cache.
 */

/**
 * Which colour of `tier` the rendered site config currently routes to, or
 * `null` if that tier isn't mentioned at all (a fresh/empty file, OR a tier
 * that has never been deployed and so gets `routeBlock`'s honest
 * "not yet deployed" `respond`, which mentions neither colour). Matches on
 * the exact container name as a whole word, so e.g. `gw-01-green` can never
 * be mistaken for `be-01-green`.
 */
export function routedColorFor(tier: Tier, siteCaddyText: string): Color | null {
  const blue = containerName(tier, 'blue');
  const green = containerName(tier, 'green');
  const re = new RegExp(`\\b(${blue}|${green})\\b`);
  const m = re.exec(siteCaddyText);
  if (m?.[1] === undefined) return null;
  return m[1] === green ? 'green' : 'blue';
}

/**
 * The content of one tier's `handle { ... }` block in `site.caddy.tmpl`.
 *
 * `color === null` means "genuinely never deployed" — NOT "assume blue".
 * Guessing a colour here used to be the bug: the very first render for any
 * tier defaulted every OTHER, not-yet-deployed tier to `'blue'` too, and
 * that guess got written into the file as if it were real routing state.
 * The next tier's own first deploy then read that guess back via
 * `routedColorFor` — which has no way to distinguish "genuinely routed to
 * blue" from "defaulted to blue" — and planned a bogus colour *swap*
 * instead of a fresh deploy, failing later at `stop-blue` against a
 * container that never existed.
 *
 * Rendering an honest `respond ... 503` instead keeps that guarantee intact
 * two ways at once: a real client hitting an undeployed route gets a clear,
 * true answer instead of a proxy pointed at a container that was never
 * started; and `routedColorFor` naturally returns `null` for it on the next
 * observe (the block contains neither `<tier>-01-blue` nor `-green`), so
 * the next deploy correctly plans a fresh `from: null` deploy rather than a
 * swap.
 */
function routeBlock(tier: Tier, color: Color | null): string {
  if (color === null) {
    return `respond "${appName(tier)} not yet deployed" 503`;
  }
  const target = `${containerName(tier, color)}:${String(PORT[tier])}`;
  if (tier === 'gw') {
    return [
      `reverse_proxy ${target} {`,
      '\t\t\t# Without this, a config reload severs every live WebSocket',
      '\t\t\t# immediately and the drain loop below has nothing left to drain.',
      '\t\t\tstream_close_delay 310s',
      '\t\t}',
    ].join('\n');
  }
  return `reverse_proxy ${target}`;
}

/** The exact placeholder set `site.caddy.tmpl` requires from `renderTemplate`. */
export function siteContext(
  colors: Record<Tier, Color | null>,
  siteAddress: string,
): Record<string, string> {
  return {
    SITE_ADDRESS: siteAddress,
    BE_ROUTE: routeBlock('be', colors.be),
    GW_ROUTE: routeBlock('gw', colors.gw),
    FE_ROUTE: routeBlock('fe', colors.fe),
  };
}
