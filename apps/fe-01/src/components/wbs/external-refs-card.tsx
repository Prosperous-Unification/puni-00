import { type ExternalRefView, type ExternalSystemView, followableHref } from '@/lib/wbs-api';

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
 * Where a row's work also exists, in full, each entry followable.
 *
 * The read half of the ref cell. The cell itself is 40px of marks — it says
 * which systems*, and it cannot say *where* — so this card is the whole list,
 * and it is the surface a reader actually clicks a link on. The editor behind a
 * click on the cell is the other half.
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
 * Every line is `system — url`, and the url rather than a title, because
 * nothing is fetched: a ref is a link and this tool has never seen what is on
 * the other end of it (the proposal's first non-goal).
 *
 * **A URL that is not `http`/`https` is a line with no link on it** —
 * {@link followableHref} decides, on both surfaces, from one place.
 */
export function ExternalRefsCard({ number, refs, systems }: ExternalRefsCardProps) {
  return (
    <HoverCard label={`Where ${number} also exists`}>
      {refs.map((ref) => {
        const href = followableHref(ref.url);
        const word = systemWord(ref.systemId, systems);
        return (
          <div key={ref.id} data-refs-card-line={ref.id} style={{ pointerEvents: 'auto' }}>
            <span data-refs-card-system>{word}</span>
            {' — '}
            {href === null ? (
              // Text, not a dead anchor: an `<a>` with no `href` is not a link
              // to a browser or to a screen reader, but it still reads as one to
              // anybody scanning the markup, and this is the surface the rule
              // exists to be visible on.
              <span data-refs-card-url={ref.id}>{ref.url}</span>
            ) : (
              <a
                data-refs-card-url={ref.id}
                href={href}
                target="_blank"
                // Both words, and neither is decoration: `noopener` stops the
                // opened page reaching back through `window.opener`, and
                // `noreferrer` stops this plan's URL — which names a project —
                // being handed to whatever is on the other end.
                rel="noreferrer noopener"
              >
                {ref.url}
              </a>
            )}
          </div>
        );
      })}
    </HoverCard>
  );
}
