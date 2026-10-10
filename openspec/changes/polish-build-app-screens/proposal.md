# Polish the Build app screens

## Why

A UI audit of the Build app (`apps/website/fe-01`) found that it neither flows nor looks like the PUNI site. When Google sign-in is off, Build sends a visitor to the manual brief, and the manual brief offers "Explore with AI" straight back to Build. Network failures show the browser's raw "Failed to fetch". Saved-request, manual and error screens repeat themselves, use a heavier type scale and brown underlined links, and lack page titles, a current-page marker and focus management.

## Outcome

Every app screen reads as the same product as the site, built from PUNI's own tokens: Inter Tight display at a lighter weight with moderate tracking, Geist body, a `[ LABEL ]` eyebrow, pill buttons, a centered wordmark with a Menu disclosure on narrow screens, and a fuller footer. Visitors can never loop between Build and the manual brief, unreachable-API errors are plain and recoverable, and every route sets its title and moves focus to its h1.

## Non-goals

No API, contract, storage or retention change. No new routes. No licensed theme code, markup, class names or assets. Live Google and OpenRouter behavior is out of scope.

## Constraints

Public repository. Keep existing labels used by the explicit-send browser regression. Targets are at least 44px, with no horizontal overflow at 320px and CLS below 0.05. The manual brief keeps its 4,000-character limit: the API accepts 8,000, but concept generation reads only the first 4,000.
