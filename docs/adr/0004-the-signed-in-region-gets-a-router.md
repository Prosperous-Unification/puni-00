# The signed-in region gets a router, and the auth gate stays above it

fe-01 has been one page for its whole life: `app.tsx` decides whether an account is signed
in and, if it is, renders the project. The directory page is the second page, and the
cheapest way to reach it was a piece of state in `app.tsx` naming which one to draw. We
introduced **TanStack Router** with code-based routes instead — `/` is the project,
`/directory` is the directory — mounted **below** the auth gate rather than around it, so
the URL is the navigation state and the gate stays the one place that answers "is anybody
signed in?".

Two things made a router worth its weight over the state variable. A page you cannot link
to or refresh onto is not a page: Dany asked for somewhere to manage people, and somewhere
means an address. And the state variable is a decision that gets harder to reverse every
time a component reads it — by the third page it is a hand-rolled router with none of a
router's contracts, which is the shape this codebase has been burned by before.

## Considered Options

**A branch in `app.tsx`.** No dependency, an afternoon's work, and no address: a refresh
returns to the project, the header link cannot be a link, and the browser's back button
means nothing. Rejected on the deep-link requirement alone.

**`react-router`.** The default answer, the largest community, and the one every reader
already knows. Rejected because this repo picks the novel tool on purpose (Bun, Elysia,
ArkType, Dagger) and because its type story for params is retrofitted rather than built in.

**TanStack Router, file-based.** Same library, codegen'd route tree from a directory of
files. Rejected for two pages: it adds a generator and a watched artifact to the Vite
build, and the whole benefit is saved typing we do not have enough routes to feel.

## Consequences

Routing owns only the signed-in region. A signed-out deep link to `/directory` renders the
auth form and continues to the asked-for page once the account is in, because the router is
mounted inside the branch the gate already chose — the gate is not a route, has no
redirect, and cannot be reached by URL.

The packaged build now has a behavior no source-run test can see: a deep link is a request
for a path the static server has no file for. The image's Caddyfile already answers it
(`try_files {path} /index.html`), which means the thing keeping `/directory` working on a
refresh in prod is one line of a config nothing had ever exercised. That line is now
covered by a proof against the built artifact rather than by the Vite dev server, which
serves the fallback for free and would have proved nothing.

The alternative rejected in passing was routing the auth gate too — `/sign-in` as a route
with a redirect. It would have been more conventional and would have made the gate
linkable, but it buys a redirect loop to get wrong in exchange for a page nobody asks for
by address.
