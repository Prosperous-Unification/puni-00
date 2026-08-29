import type { Element } from 'hast';
import type { CSSProperties, ReactNode } from 'react';
import { useMemo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * The plugins the name is parsed with, as one module-level array.
 *
 * `remark-gfm` is here for **strikethrough**, which the spec asks for and
 * CommonMark has no syntax for. It brings GFM's tables and autolinks along with
 * it: a table is a block and is caught by {@link RENDERED_AS_SOURCE} below, and
 * an autolink is an `<a>`, which is the one thing this component already has an
 * opinion about.
 *
 * A constant rather than a literal in the JSX because a new array every render
 * re-parses the source every render, on every row of the table at once.
 */
const INLINE_PLUGINS = [remarkGfm];

/**
 * The source text one parsed element was made from.
 *
 * This is what keeps a name honest. A component that rendered a block's own
 * children instead would silently eat the marker — `# Ship it` would read as
 * the words `Ship it` and nobody would ever learn a `#` had been typed — so
 * every block element renders the characters the parser consumed instead.
 *
 * @throws When the element carries no source position. `react-markdown` parses
 * a string and `mdast-util-to-hast` carries the offsets through, so an element
 * without them is not a name this component can be honest about; a fallback
 * here would be the marker eaten by another route (`AGENTS.md`, R5).
 */
export function blockSourceOf(node: Element | undefined, source: string): string {
  const at = node?.position;
  const from = at?.start.offset;
  const to = at?.end.offset;
  if (from === undefined || to === undefined) {
    throw new Error(
      `InlineMarkdown cannot show the source of a <${node?.tagName ?? '?'}> the parser gave no position`,
    );
  }
  return source.slice(from, to);
}

/**
 * Every tag `react-markdown` can produce that is **not** part of the inline
 * grammar, each rendered as its own source text by {@link blockSourceOf}.
 *
 * The five tags this list deliberately omits are the whole allowlist — `em`,
 * `strong`, `code`, `del`, `a` — plus `p`, which is not passed through either:
 * it is rendered as a fragment, so a cell gets no block box and no margin,
 * which is what keeps a row one line high.
 *
 * The list is written out rather than derived because a tag
 * this map forgets is a marker silently eaten — the exact failure D1 exists to
 * stop. Several entries can only be reached through a parent that is already in
 * this list (`li` under `ul`, `td` under `table`, the `code` inside a `pre`) and
 * so never mount at all; they are listed anyway, because "unreachable" is a
 * claim about today's parser.
 *
 * `img` is here for a reason of its own: a picture is not inline text, and one
 * loaded into a 28px row is a row whose height a name decided.
 */
const RENDERED_AS_SOURCE = [
  'blockquote',
  'br',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'input',
  'li',
  'ol',
  'pre',
  'section',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
] as const;

/**
 * How a link is drawn in a name: the palette's own ink and an underline, in
 * both faces, so the two readings of one name look like one thing.
 *
 * Not the user agent's link colour, which is `-webkit-link` blue on a light
 * page and a periwinkle nothing names on a dark one — the same fault
 * `dark-mode.spec.ts` holds the header's links to.
 */
const LINK_INK: CSSProperties = { color: 'var(--primary)', textDecoration: 'underline' };

/** What a link renders as, which is not the same on every face — see {@link InlineMarkdownProps}. */
interface LinkProps {
  href?: string | undefined;
  children?: ReactNode;
}

/**
 * A link in a table cell: its text, its styling, and its href in the tooltip.
 *
 * **Not an `<a>`, deliberately.** The Name cell's own click opens the editor
 * and the grid's tab order is a matrix of cells; an anchor inside one would put
 * a second click target in the cell and a tab stop inside the grid, between a
 * name and the next column. The hover preview is where a link is followable —
 * {@link InlineMarkdownProps.linksFollowable}.
 */
function LinkAsText({ href, children }: LinkProps) {
  return (
    <span data-name-link title={href} style={LINK_INK}>
      {children}
    </span>
  );
}

/** A link on a face that has room for one: the hover preview's. */
function LinkFollowable({ href, children }: LinkProps) {
  return (
    <a data-name-link href={href} title={href} style={LINK_INK} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

/**
 * The components map for one name: what the parser is allowed to make of it.
 *
 * Built per source string because {@link blockSourceOf} needs the source to
 * slice — the map is the only place the two meet.
 */
function inlineComponents(source: string, linksFollowable: boolean): Components {
  const asSource = ({ node }: { node?: Element }): ReactNode => blockSourceOf(node, source);
  // Collected into a record of its own and spread, rather than assigned one key
  // at a time into a `Components`. `components[tag] = …` with `tag` a union of
  // twenty-three tag names makes the compiler build the union of twenty-three
  // prop types, and it refuses: `TS2590: Expression produces a union type that
  // is too complex to represent`. Every value here is the same component, which
  // reads only `node` — so the record says that once instead of per key.
  const blocks: Partial<Record<(typeof RENDERED_AS_SOURCE)[number], typeof asSource>> = {};
  for (const tag of RENDERED_AS_SOURCE) blocks[tag] = asSource;
  return {
    ...blocks,
    // The wrapper markdown always makes, rendered as a fragment: no block box,
    // no margin, and so no height of its own in a cell.
    p: ({ children }) => <>{children}</>,
    a: linksFollowable ? LinkFollowable : LinkAsText,
  };
}

export interface InlineMarkdownProps {
  /** The name, as it is stored: the raw source, never composed into a larger document. */
  children: string;
  /**
   * Whether a link is an anchor somebody can follow.
   *
   * False everywhere the name is drawn inside the grid — see
   * {@link LinkAsText} — and true on the hover preview, which is a card with
   * room for a click of its own.
   */
  linksFollowable?: boolean;
}

/**
 * A work item's name, read as **inline** markdown: emphasis, strong, inline
 * code, strikethrough and links, and nothing else.
 *
 * One component for all four faces — the Name cell at rest, the hover preview's
 * heading, the plan cards and the chart's row label — because a rule spread
 * across four renderers is four rules that agree until one is edited.
 *
 * Block syntax does not parse: a `#`, a `-`, a `>`, a fence, a table or a rule
 * renders as the characters somebody typed, through {@link blockSourceOf}. Raw
 * HTML is text for the reason `hover-preview.tsx` gives about notes —
 * `react-markdown` renders React elements and passes no HTML through, and there
 * is no `rehype-raw` here either.
 *
 * The name is passed as the **whole** source, never concatenated into a larger
 * document. Where a heading is wanted, the heading is an element the caller
 * writes around this one: see `hover-preview.tsx`.
 */
export function InlineMarkdown({ children, linksFollowable = false }: InlineMarkdownProps) {
  const components = useMemo(
    () => inlineComponents(children, linksFollowable),
    [children, linksFollowable],
  );
  return (
    <Markdown remarkPlugins={INLINE_PLUGINS} components={components}>
      {children}
    </Markdown>
  );
}

/**
 * A name, drawn the way a grid draws it — the argument `CellInput`'s
 * `renderFirstLine` takes.
 *
 * A module constant rather than a lambda at each call site for two reasons, one
 * of them load-bearing: `columns` in `wbs-table.tsx` must depend on nothing that
 * is rebuilt per render, or every cell remounts and the focus is lost
 * (`LLM_README.md`'s first landmine); and the table and the phone's cards draw
 * a name the same way because it is the same function, not because two call
 * sites agree today.
 */
export const renderName = (name: string): ReactNode => <InlineMarkdown>{name}</InlineMarkdown>;
