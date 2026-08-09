import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HoverPreview } from './hover-preview';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/** The preview over one work item, and the element it rendered into. */
function previewOf(name: string, notes: string): HTMLElement {
  render(<HoverPreview name={name} notes={notes} number="010" />);
  return screen.getByRole('tooltip');
}

describe('the hover preview reads as one document', () => {
  itDom('renders the name as a level-one heading over the notes’ markdown', () => {
    const preview = previewOf('Strip the old wiring', '## Risks\n\n- the fuse box is *old*');

    expect(preview.querySelector('h1')?.textContent).toBe('Strip the old wiring');
    // The notes still render as markdown under it, at their own level: a
    // preview whose name heading swallowed the notes would pass the line
    // above and fail here.
    expect(preview.querySelector('h2')?.textContent).toBe('Risks');
    expect(preview.querySelector('li em')?.textContent).toBe('old');
  });

  itDom('a name containing markdown and HTML reads as typed', () => {
    // The name is a work item's name, not a document somebody wrote: it goes
    // into the heading as text. Concatenating it into the markdown source
    // would put every name through a parser that eats the punctuation people
    // do type — asterisks, brackets, underscores — and shows something other
    // than the cell does.
    //
    // The emphasis in the name is what makes this test able to see that, and
    // it was added because the version without it could not. Proof: the
    // heading rendered as markdown source instead — the body made
    // `<Markdown>{`# ${name}\n\n${notes}`}</Markdown>` — and with the name
    // `# not a heading <script>` the test **passed**, because `# # x` is a
    // heading whose content is the literal `# x`. With `*not*` in the name it
    // failed on `expected '# not a heading <script>alert(1)</script> and not
    // emphasis' to be '# not a heading <script>alert(1)</script> and *not*
    // emphasis'` and on `expected <em>not</em> to be null` — the parser
    // reaching into a name. Watched, 2026-08-09.
    const typed = '# not a heading <script>alert(1)</script> and *not* emphasis';
    const preview = previewOf(typed, 'and the note is *rendered*');

    const heading = preview.querySelector('h1');
    expect(heading?.textContent).toBe(typed);
    // Text and only text: no element the markdown parser made out of it.
    expect(heading?.querySelector('em')).toBeNull();
    expect(preview.querySelector('script')).toBeNull();
    // The notes keep their markdown — the name being literal is a property of
    // the heading, not of the whole preview.
    expect(preview.querySelector('em')?.textContent).toBe('rendered');
  });

  itDom('renders raw HTML in a note as the text somebody typed', () => {
    const preview = previewOf(
      'Strip',
      '<img src=x onerror="alert(1)"> and <script>alert(2)</script>',
    );

    expect(preview.querySelector('img')).toBeNull();
    expect(preview.querySelector('script')).toBeNull();
    expect(preview.textContent).toContain('alert(1)');
  });
});
