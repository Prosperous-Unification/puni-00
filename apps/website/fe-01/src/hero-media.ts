/**
 * Layer Build paints behind the conversation. The site's background video is PUNI's trademark,
 * so Build shows it too: `video` normally, `poster` under `prefers-reduced-motion`, and
 * `gradient` (the page's own night background) once the media fails to load. The media is
 * optional decoration, so failure degrades instead of throwing.
 */
export type HeroLayer = 'video' | 'poster' | 'gradient';

export function selectHeroLayer(prefersReducedMotion: boolean, isMediaFailed: boolean): HeroLayer {
  // Proof: deleting this branch made the hero-media.test.ts gradient case receive 'video'.
  if (isMediaFailed) return 'gradient';
  return prefersReducedMotion ? 'poster' : 'video';
}

/**
 * Hero media is served by the site and referenced at runtime: its licence keeps the files out of
 * this repository.
 */
export function locateHeroMedia(siteOrigin: string): { video: string; poster: string } {
  return {
    video: `${siteOrigin}/media/hero/background.mp4`,
    poster: `${siteOrigin}/media/hero/poster.jpg`,
  };
}
