import { describe, expect, test } from 'bun:test';

import { locateHeroMedia, selectHeroLayer } from './hero-media';

describe('hero media layer', () => {
  test('plays the video unless motion is reduced', () => {
    expect(selectHeroLayer(false, false)).toBe('video');
    expect(selectHeroLayer(true, false)).toBe('poster');
  });

  test('falls back to the gradient once the media fails, whatever the motion preference', () => {
    expect(selectHeroLayer(false, true)).toBe('gradient');
    expect(selectHeroLayer(true, true)).toBe('gradient');
  });

  test('references the media on the site origin', () => {
    expect(locateHeroMedia('https://dev.puni.dev')).toEqual({
      video: 'https://dev.puni.dev/media/hero/background.mp4',
      poster: 'https://dev.puni.dev/media/hero/poster.jpg',
    });
  });
});
