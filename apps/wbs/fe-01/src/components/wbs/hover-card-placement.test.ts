import { describe, expect, it } from 'vitest';

import {
  besidePlacement,
  diagonalPlacement,
  sidewaysPlacement,
  surfacePlacement,
} from './hover-card-placement';

const CARD = { width: 260, height: 60 };
const FRAME = { left: 0, right: 1000, top: 0, bottom: 800 };

describe('diagonal placement geometry', () => {
  it.each([
    [
      'right and below',
      { left: 100, right: 240, top: 200, bottom: 226 },
      CARD,
      FRAME,
      { left: 240, top: 226 },
    ],
    [
      'left near the far edge',
      { left: 860, right: 980, top: 200, bottom: 226 },
      CARD,
      FRAME,
      { left: 600, top: 226 },
    ],
    [
      'above a low row',
      { left: 100, right: 240, top: 770, bottom: 796 },
      CARD,
      FRAME,
      { left: 240, top: 710 },
    ],
    [
      'nonzero frame clamps both axes',
      { left: 310, right: 330, top: 150, bottom: 176 },
      CARD,
      { left: 300, right: 420, top: 100, bottom: 200 },
      { left: 300, top: 100 },
    ],
    [
      'oversized card stays at the near frame edges',
      { left: 10, right: 30, top: 30, bottom: 58 },
      CARD,
      { left: 0, right: 200, top: 0, bottom: 100 },
      { left: 0, top: 40 },
    ],
    [
      'ties choose right and below',
      { left: 450, right: 550, top: 350, bottom: 450 },
      { width: 500, height: 400 },
      FRAME,
      { left: 500, top: 400 },
    ],
  ] as const)('%s', (_name, clear, card, frame, expected) => {
    expect(diagonalPlacement(clear, card, frame)).toEqual(expected);
  });
});

describe('surface placement geometry', () => {
  const card = { width: 300, height: 120 };
  const viewport = { width: 1000, height: 800 };

  it.each([
    [
      'below the mark with its gap',
      { left: 100, right: 120, top: 200, bottom: 228 },
      viewport,
      { left: 100, top: 234 },
    ],
    [
      'above a low mark',
      { left: 100, right: 120, top: 750, bottom: 774 },
      viewport,
      { left: 100, top: 624 },
    ],
    [
      'clamped at the right edge',
      { left: 950, right: 970, top: 200, bottom: 228 },
      viewport,
      { left: 700, top: 234 },
    ],
    [
      'clamped at both near edges',
      { left: 10, right: 30, top: 30, bottom: 58 },
      { width: 200, height: 100 },
      { left: 0, top: 0 },
    ],
    [
      'exact fit below remains below',
      { left: 100, right: 120, top: 650, bottom: 674 },
      viewport,
      { left: 100, top: 680 },
    ],
  ] as const)('%s', (_name, anchor, frame, expected) => {
    expect(surfacePlacement(anchor, card, frame)).toEqual(expected);
  });
});

describe('beside placement geometry', () => {
  const card = { width: 300, height: 120 };

  it.each([
    [
      'right of the list',
      { left: 100, right: 300, top: 200 },
      { width: 1000, height: 800 },
      { left: 306, top: 200 },
    ],
    [
      'left and clamped above the bottom edge',
      { left: 400, right: 600, top: 750 },
      { width: 800, height: 800 },
      { left: 94, top: 680 },
    ],
    [
      'no placement when neither side fits',
      { left: 200, right: 400, top: 200 },
      { width: 600, height: 800 },
      null,
    ],
    [
      'clamped at the top',
      { left: 100, right: 300, top: -20 },
      { width: 1000, height: 800 },
      { left: 306, top: 0 },
    ],
    [
      'exact fit on the right',
      { left: 100, right: 300, top: 200 },
      { width: 606, height: 800 },
      { left: 306, top: 200 },
    ],
    [
      'exact fit on the left',
      { left: 306, right: 506, top: 200 },
      { width: 600, height: 800 },
      { left: 0, top: 200 },
    ],
  ] as const)('%s', (_name, anchor, viewport, expected) => {
    expect(besidePlacement(anchor, card, viewport)).toEqual(expected);
  });
});

describe('sideways placement geometry', () => {
  const frame = { left: 0, right: 1400, top: 100, bottom: 900 };

  it.each([
    [
      'right with the frame height cap',
      { left: 300, right: 420, top: 150, bottom: 176 },
      CARD,
      frame,
      { side: 'right', align: 'top', maxHeight: 720 },
    ],
    [
      'left near the far edge',
      { left: 1283, right: 1381, top: 150, bottom: 176 },
      CARD,
      frame,
      { side: 'left', align: 'top', maxHeight: 720 },
    ],
    [
      'horizontal tie chooses right',
      { left: 700, right: 700, top: 150, bottom: 176 },
      { width: 900, height: 60 },
      frame,
      { side: 'right', align: 'top', maxHeight: 720 },
    ],
    [
      'bottom alignment for a low row',
      { left: 300, right: 420, top: 870, bottom: 896 },
      CARD,
      frame,
      { side: 'right', align: 'bottom', maxHeight: 720 },
    ],
    [
      'vertical tie chooses top',
      { left: 300, right: 420, top: 490, bottom: 510 },
      CARD,
      frame,
      { side: 'right', align: 'top', maxHeight: 410 },
    ],
    // Proof: lowering the production floor from 160 to 90 failed this case
    // on maxHeight 155 versus expected 160 (2026-10-16). The frame supplies
    // only 155px, so the constant rather than available room determines it.
    [
      'scrolling height floor',
      { left: 10, right: 30, top: 145, bottom: 155 },
      CARD,
      { left: 0, right: 1000, top: 0, bottom: 300 },
      { side: 'right', align: 'top', maxHeight: 160 },
    ],
    [
      'small frame overrides the scrolling floor',
      { left: 10, right: 30, top: 40, bottom: 60 },
      CARD,
      { left: 0, right: 1000, top: 0, bottom: 100 },
      { side: 'right', align: 'top', maxHeight: 90 },
    ],
  ] as const)('%s', (_name, cell, card, container, expected) => {
    expect(sidewaysPlacement(cell, card, container)).toEqual(expected);
  });
});
