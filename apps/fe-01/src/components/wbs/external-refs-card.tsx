import { refLabelOf } from '@wbs/domain/external-system';

import { type ExternalRefView, type ExternalSystemView, followableHref } from '@/lib/wbs-api';

import { familyDotStyle, familyOf } from './external-ref-marks';
import { HoverCard } from './hover-card';

export interface ExternalRefsCardProps {
  /** The linked work item's number, so the card says whose list this is. */
  number: string;
  /** At least one: a cell with nothing in it opens no card. */
  refs: readonly ExternalRefView[];
  /** The directory's vocabulary, for naming each ref's system. */
  systems: readonly ExternalSystemView[];
}

/**
 * What a system is called on a card line, or its raw name for one this
 * directory has not listed.
 *
 * The raw name and not `Unknown`: a page that read the vocabulary before a peer
 * added a ref through a be-01 holding a sixth system is a swap-window state, and
 * showing the name it was given is more use than a word saying nothing.
 */
const systemWord = (systemId: string, systems: readonly ExternalSystemView[]): string =>
  systems.find((system) => system.id === systemId)?.name ?? systemId;

/**
 * Where a row's work also exists, in full, each entry named and followable.
 *
 * The read half of the ref cell. The cell itself is 40px of marks — it says
 * which systems*, and it cannot say *where* — so this card is the whole list,
 * and it is the surface a reader actually clicks a link on. The editor behind a
 * click on the cell is the other half.
 *
 * **A name, not a URL, is what a line leads with**, since 2026-09-09. Dany:
 * _"i want hovering on links cell to open the dropdown with linked items, i can
 * then hover over the dropdown and see the link's summary + link to click to
 * follow it"_, and _"every link must have a name"_. Before that every line read
 * `jira-issue — https://…/browse/WCN-3887`, which names neither the ticket nor
 * the work. A line now carries the ref's own {@link ExternalRefView.name}, and
 * `refLabelOf(url)` where nobody has typed one — the issue key, the pull
 * request's number, a Confluence page's title. Still nothing fetched: the
 * summary half of Dany's example is the reader's to type, and no column here
 * caches an external system's answer (the proposal's first non-goal).
 *
 * **{@link DependsCard}'s passive surface, and deliberately not its pointer
 * bridge.** That bridge exists to light the *rows* a dependency names while the
 * pointer walks the card, which is a relation this card has none of: a ref
 * points out of the plan. What this card needs from the family is the other
 * half — a `HoverCard` that does not take the pointer, so it can hang over the
 * rows beneath without eating their clicks — plus a `pointer-events: auto` per
 * line, exactly as the depends card gives its own lines, or the links inside a
 * transparent card could never be clicked. Keeping the card open while the
 * pointer travels to it is the **cell wrapper's** job (the Name cell's
 * arrangement: one `position: relative` span holding both the marks and the
 * card, with `mouseleave` on the span), which needs no bridge because the
 * pointer never leaves the wrapper on the way.
 *
 * The tint under the pointer is a rule in `styles.css` keyed on
 * `[data-refs-card-line]:hover`, and not an inline style, because an inline
 * style cannot say `:hover` and a React `onMouseEnter` per line would re-render
 * the card on every row the pointer crosses. It is what makes the line being
 * read the line being pointed at, which is the whole of why the card takes the
 * pointer at all.
 *
 * **A URL that is not `http`/`https` is a line with no link on it** —
 * {@link followableHref} decides, on both surfaces, from one place, and it
 * decides for the name as well as for the address. A name is not a safer place
 * to put a `javascript:` href than a URL is.
 */
export function ExternalRefsCard({ number, refs, systems }: ExternalRefsCardProps) {
  return (
    <HoverCard label={`Where ${number} also exists`}>
      {refs.map((ref) => {
        const href = followableHref(ref.url);
        const word = systemWord(ref.systemId, systems);
        // The name a reader typed, or what the URL calls itself. Computed here
        // rather than stored, so a rule added to `refLabelOf` improves every
        // unnamed ref at once — see its own JSDoc for why that is the opposite
        // bargain from a derived *system*.
        const label = ref.name === '' ? refLabelOf(ref.url) : ref.name;
        return (
          <div
            key={ref.id}
            data-refs-card-line={ref.id}
            // The line takes the pointer, which is what lets the anchors inside
            // a pointer-transparent card be clicked at all, and what lets the
            // `:hover` rule in `styles.css` find this element.
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'baseline',
              gap: 6,
              padding: '3px 4px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <span
              // The same disc the cell draws, from the same paint — see
              // {@link familyDotStyle}. `aria-hidden` because the line's words
              // already name the system: a screen reader that read the mark too
              // would say `Jira` twice per link.
              aria-hidden="true"
              data-ref-mark={familyOf(word)}
              style={{ ...familyDotStyle(familyOf(word)), position: 'relative', top: -1 }}
            />
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 1 }}>
              {href === null ? (
                // Text, not a dead anchor: an `<a>` with no `href` is not a
                // link to a browser or to a screen reader, but it still reads
                // as one to anybody scanning the markup, and this is the
                // surface the rule exists to be visible on.
                <span data-refs-card-name={ref.id} style={{ fontWeight: 500 }}>
                  {label}
                </span>
              ) : (
                <a
                  data-refs-card-name={ref.id}
                  href={href}
                  target="_blank"
                  // Both words, and neither is decoration: `noopener` stops the
                  // opened page reaching back through `window.opener`, and
                  // `noreferrer` stops this plan's URL — which names a project
                  // — being handed to whatever is on the other end.
                  rel="noreferrer noopener"
                  style={{ fontWeight: 500 }}
                >
                  {label}
                </a>
              )}
              <span
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 4,
                  fontSize: '0.75rem',
                  color: 'var(--muted-foreground)',
                  minWidth: 0,
                }}
              >
                <span data-refs-card-system style={{ flexShrink: 0 }}>
                  {word}
                </span>
                <span aria-hidden="true">·</span>
                {href === null ? (
                  <span data-refs-card-url={ref.id}>{ref.url}</span>
                ) : (
                  <a
                    data-refs-card-url={ref.id}
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    // Inherited, so the address reads as the quiet half of the
                    // line: the name above it is the link a reader is meant to
                    // aim at, and two equally loud links per row is a row with
                    // no answer to "which one do I click".
                    style={{ color: 'inherit' }}
                  >
                    {ref.url}
                  </a>
                )}
              </span>
            </span>
          </div>
        );
      })}
    </HoverCard>
  );
}
