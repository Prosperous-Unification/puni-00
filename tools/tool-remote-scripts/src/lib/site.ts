import { containerName } from './docker';
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
 * `null` if that tier isn't mentioned at all (a fresh/empty file). Matches
 * on the exact container name as a whole word, so e.g. `gw-01-green` can
 * never be mistaken for `be-01-green`.
 */
export function routedColorFor(tier: Tier, siteCaddyText: string): Color | null {
  const blue = containerName(tier, 'blue');
  const green = containerName(tier, 'green');
  const re = new RegExp(`\\b(${blue}|${green})\\b`);
  const m = re.exec(siteCaddyText);
  if (m?.[1] === undefined) return null;
  return m[1] === green ? 'green' : 'blue';
}

/** The exact placeholder set `site.caddy.tmpl` requires from `renderTemplate`. */
export function siteContext(
  colors: Record<Tier, Color>,
  siteAddress: string,
): Record<string, string> {
  return {
    SITE_ADDRESS: siteAddress,
    BE_COLOR: colors.be,
    GW_COLOR: colors.gw,
    FE_COLOR: colors.fe,
  };
}
