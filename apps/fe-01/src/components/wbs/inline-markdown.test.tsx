import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { blockSourceOf, InlineMarkdown } from './inline-markdown';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/** One name, rendered the way every face renders it. */
function nameAs(source: string, linksFollowable = false): HTMLElement {
  const { container } = render(
    <InlineMarkdown linksFollowable={linksFollowable}>{source}</InlineMarkdown>,
  );
  return container;
}

describe('a name reads as inline markdown', () => {
  itDom('renders emphasis, strong, inline code and strikethrough', () => {
    const drawn = nameAs('Ship *now*, **hard**, `fast` and ~~later~~');

    expect(drawn.querySelector('em')?.textContent).toBe('now');
    expect(drawn.querySelector('strong')?.textContent).toBe('hard');
    expect(drawn.querySelector('code')?.textContent).toBe('fast');
    expect(drawn.querySelector('del')?.textContent).toBe('later');
    // The markers themselves are gone — that is what "rendered" means here.
    expect(drawn.textContent).toBe('Ship now, hard, fast and later');
  });

  itDom('leaves a plain name exactly as it is, in no block box', () => {
    const drawn = nameAs('Strip the old wiring');

    expect(drawn.textContent).toBe('Strip the old wiring');
    // The `p` markdown always wraps a paragraph in is a fragment here: a block
    // box in a 28px cell is a margin the name decided, which is the whole of
    // D3. jsdom cannot see the margin; it can see the element that carries it.
    expect(drawn.querySelector('p')).toBeNull();
  });
});

describe('block markdown in a name is shown, not eaten', () => {
  /**
   * The negative for the whole of D1.
   *
   * Proof: `RENDERED_AS_SOURCE` emptied in `inline-markdown.tsx`, so every
   * block element renders its children the way `react-markdown` renders them
   * by default. Watched failing, 2026-08-29:
   *
   * - `a heading marker is shown, not eaten` on
   *   `expected 'not a heading' to be '# not a heading'`
   * - `a list marker is shown, not eaten` on
   *   `expected '\nbuy milk\n' to be '- buy milk'`
   * - `a fence, a rule, a quote and a table are shown, not eaten` on
   *   `expected 'fence\n' to be '```\nfence\n```'`
   * - `inline emphasis still renders beside a block marker it was typed with`
   *   on `expected 'not a heading' to be '# *not* a heading'`
   * - `an image is shown as its source rather than loaded` on
   *   `expected <img …(2)></img> to be null`
   *
   * The marker disappearing is exactly the fault the map exists for: a name
   * that is not inline markdown must read as it was typed, and a renderer that
   * quietly drops a `#` gives the reader no way to know it did.
   */
  itDom('a heading marker is shown, not eaten', () => {
    const drawn = nameAs('# not a heading');

    expect(drawn.textContent).toBe('# not a heading');
    // Not "the `#` is present somewhere" — no element the parser made, either.
    // `# # x` is a heading whose content is the literal `# x`, which is how the
    // last test written over this ground came to be vacuous (`AGENTS.md`, R5,
    // `N name-title-body`).
    expect(drawn.querySelector('h1')).toBeNull();
  });

  itDom('a list marker is shown, not eaten', () => {
    const dashed = nameAs('- buy milk');
    expect(dashed.textContent).toBe('- buy milk');
    expect(dashed.querySelector('ul')).toBeNull();
    expect(dashed.querySelector('li')).toBeNull();

    const numbered = nameAs('1. buy milk');
    expect(numbered.textContent).toBe('1. buy milk');
    expect(numbered.querySelector('ol')).toBeNull();
  });

  itDom('a fence, a rule, a quote and a table are shown, not eaten', () => {
    const fenced = nameAs('```\nfence\n```');
    expect(fenced.textContent).toBe('```\nfence\n```');
    expect(fenced.querySelector('pre')).toBeNull();

    const ruled = nameAs('---');
    expect(ruled.textContent).toBe('---');
    expect(ruled.querySelector('hr')).toBeNull();

    const quoted = nameAs('> not a quote');
    expect(quoted.textContent).toBe('> not a quote');
    expect(quoted.querySelector('blockquote')).toBeNull();

    const tabled = nameAs('| a | b |\n| - | - |\n| 1 | 2 |');
    expect(tabled.querySelector('table')).toBeNull();
    expect(tabled.textContent).toContain('| a | b |');
  });

  itDom('inline emphasis still renders beside a block marker it was typed with', () => {
    // The block rule is per element, not per name: a name that opens with a
    // heading marker is one block, and its source is shown whole — markers and
    // emphasis alike, because nothing inside it was parsed.
    const drawn = nameAs('# *not* a heading');

    expect(drawn.textContent).toBe('# *not* a heading');
    expect(drawn.querySelector('em')).toBeNull();
  });

  itDom('an image is shown as its source rather than loaded', () => {
    // Not a block, and here for a reason of its own: a picture in a 28px row is
    // a row whose height the name decided.
    const drawn = nameAs('look ![a cat](http://x.test/cat.png)');

    expect(drawn.querySelector('img')).toBeNull();
    expect(drawn.textContent).toBe('look ![a cat](http://x.test/cat.png)');
  });

  itDom('raw HTML stays text', () => {
    const drawn = nameAs('a <script>alert(1)</script> and <b>bold</b>');

    expect(drawn.querySelector('script')).toBeNull();
    expect(drawn.querySelector('b')).toBeNull();
    expect(drawn.textContent).toBe('a <script>alert(1)</script> and <b>bold</b>');
  });

  itDom('refuses to guess at the source of an element the parser gave no position', () => {
    // The one unknown this component can meet: `blockSourceOf` has no source to
    // slice and cannot fall back on the children without eating the marker it
    // exists to show. R5 — unknown is not OK.
    //
    // Proof: the `throw` replaced by `return ''`, this failed on `expected
    // [Function] to throw an error`. Watched, 2026-08-29.
    expect(() =>
      blockSourceOf({ type: 'element', tagName: 'h1', properties: {}, children: [] }, '# x'),
    ).toThrow(/no position/);
    expect(() => blockSourceOf(undefined, '# x')).toThrow(/no position/);
  });
});

describe('a link in a name', () => {
  /**
   * Proof: `a` mapped to `LinkFollowable` unconditionally — a real `<a href>`
   * in the cell. Watched failing, 2026-08-29, on
   * `expected <a data-name-link="true" …(5)></a> to be null`. An anchor is a
   * tab stop as well as a click target, which is the half of this a browser is
   * the only witness to.
   */
  itDom('is not followable and adds no tab stop where the grid draws it', () => {
    const drawn = nameAs('see [the plan](http://x.test/)');

    expect(drawn.querySelector('a')).toBeNull();
    const link = drawn.querySelector('[data-name-link]');
    expect(link?.textContent).toBe('the plan');
    // The href is readable — it is just not clickable from a cell.
    expect(link?.getAttribute('title')).toBe('http://x.test/');
    // No tab stop: nothing in the cell the keyboard can land on but the box.
    expect(drawn.querySelector('[tabindex]')).toBeNull();
  });

  itDom('is followable on the face that asks for it', () => {
    const drawn = nameAs('see [the plan](http://x.test/)', true);

    const link = drawn.querySelector('a');
    expect(link?.getAttribute('href')).toBe('http://x.test/');
    expect(link?.getAttribute('rel')).toBe('noreferrer');
  });
});
