import type { CSSProperties } from 'react';
import Markdown, { type Components } from 'react-markdown';

export interface HoverPreviewProps {
  /** The work item's name, shown as the heading — as text, never as markdown source. */
  name: string;
  notes: string;
  /** Named in the popover so a hover on a busy table says which row it belongs to. */
  number: string;
}

/**
 * The rendered reading of one work item, shown on hover over its Name cell:
 * the name as a level-one heading, the notes as markdown under it.
 *
 * At rest the cell shows the name alone and the notes take no height, so this
 * is where a note is read at all — and the name is repeated here because a
 * preview of the notes on their own is a page of text with no title, hanging
 * beside a row whose name it does not say.
 *
 * The name is put into the heading as **text**. Composing `# ${name}` into the
 * markdown source would be a second parser over a field nobody writes markdown
 * in: a name starting with `#`, or holding an underscore or a bracket, would
 * read here as something other than what the cell shows.
 *
 * `react-markdown` renders to React elements and does **not** pass raw HTML
 * through — no `rehype-raw` here, deliberately. Notes are written by one
 * person and read by everyone else on the project, so a note containing a
 * `<script>` or an `onerror` attribute must render as the text somebody typed
 * and nothing else. That is the whole reason this is a markdown renderer
 * rather than `dangerouslySetInnerHTML` over a converted string.
 */
/** The name's own size, which every heading a note makes stays under. */
const NAME_SIZE_EM = 1.3;

/**
 * A note's headings, sized under the name.
 *
 * The browser's defaults are sized for a page — `h2` is 1.5em — and the name
 * above the notes is not a page's `h1`: left at defaults, a note opening with
 * `## Risks` read as the preview's title and the name as its footnote. The
 * elements keep their levels (an `h2` stays an `h2`; the first test asserts
 * it), only their size is brought under {@link NAME_SIZE_EM}, in their own
 * order. `h4`–`h6` default to 1em and below, already under all of these.
 *
 * Proof: the `h2` entry deleted, `the name out-sizes every heading a note
 * makes` failed on `expected 1.15 to be greater than NaN`; the `h1` entry
 * deleted, on `expected 1.3 to be greater than NaN` — a note heading with no
 * declared size is one the browser sizes over the name. Watched, 2026-08-09.
 */
function noteHeadingSized(level: 'h1' | 'h2' | 'h3', fontSize: string): Components[typeof level] {
  const style: CSSProperties = { fontSize, fontWeight: 600, margin: '8px 0 4px' };
  const Level = level;
  const NoteHeading: Components[typeof level] = (heading) => (
    <Level style={style}>{heading.children}</Level>
  );
  return NoteHeading;
}

const noteHeadings: Components = {
  h1: noteHeadingSized('h1', '1.15em'),
  h2: noteHeadingSized('h2', '1.08em'),
  h3: noteHeadingSized('h3', '1.02em'),
};

export function HoverPreview({ name, notes, number }: HoverPreviewProps) {
  return (
    <div
      role="tooltip"
      aria-label={`Notes for ${number}, rendered`}
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        zIndex: 20,
        minWidth: 260,
        maxWidth: 420,
        maxHeight: 320,
        overflowY: 'auto',
        background: 'var(--popover)',
        color: 'var(--popover-foreground)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '6px 10px',
        boxShadow: '0 4px 14px oklch(0 0 0 / 14%)',
        textAlign: 'left',
        fontWeight: 400,
      }}
    >
      {/*
        Sized here rather than left to the browser's default `h1`, which is
        `2em` and would put a name across three lines of a 420px popover.
      */}
      <h1 style={{ fontSize: `${String(NAME_SIZE_EM)}em`, fontWeight: 700, margin: '0 0 4px' }}>
        {name}
      </h1>
      <Markdown components={noteHeadings}>{notes}</Markdown>
    </div>
  );
}
