import { Link } from '@tanstack/react-router';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The two pages of the signed-in region, and a mark on the one that is showing.
 *
 * Real links rather than buttons that navigate: an address is the whole reason
 * `docs/adr/0004-the-signed-in-region-gets-a-router.md` exists, and a `<button>`
 * cannot be middle-clicked, copied, or opened in a second tab.
 *
 * `aria-current="page"` is the router's own doing — `Link` stamps it on the
 * active one, and that is the whole reason these are `Link`s rather than
 * anchors with an `href`. There is deliberately **no** `activeOptions={{ exact:
 * true }}` on the plan's link: `/` and `/directory` are siblings under the root
 * route rather than parent and child, so `Link` never reads the plan as active
 * on the directory. The option was written, and removing it was watched
 * changing nothing — a guard whose failure cannot be observed is a claim, so it
 * is not here. `app-router.test.tsx`'s `marks only the page that is showing`
 * asserts both ends of the mark and was watched failing against a plain anchor.
 */
export function PageNav() {
  const shape = cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0');
  const marked = { className: 'bg-accent text-accent-foreground' };
  return (
    <nav aria-label="Pages" className="flex shrink-0 items-center gap-1">
      <Link to="/" className={shape} activeProps={marked}>
        Plan
      </Link>
      <Link to="/directory" className={shape} activeProps={marked}>
        Directory
      </Link>
    </nav>
  );
}
