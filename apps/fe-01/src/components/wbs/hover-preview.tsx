import Markdown from 'react-markdown';

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
      <h1 style={{ fontSize: '1.05em', fontWeight: 600, margin: '0 0 4px' }}>{name}</h1>
      <Markdown>{notes}</Markdown>
    </div>
  );
}
