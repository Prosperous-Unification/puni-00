# Tasks

Four slices, in order. Each names the test that proves it and the fault that
test was watched failing under.

## 1. The account menu

- [x] `src/components/chrome/account-menu.tsx` — a menu button named by the
      account, a `role="menu"` named "Signed in as …", one `menuitem`. Hand
      rolled on `ActionsMenu`'s pattern; no Radix menu exists in this repo and
      `F` rejected adding one for the grid's.
- [x] **Test** — `account-menu.test.tsx`, 8 assertions. It exists because the
      pair it replaces had none: nothing in the repository named the "Log out"
      button or the "Signed in as" line, so deleting the way out of the app
      would have left every test green.
- [x] **Negative** — `aria-haspopup` struck: `names its trigger with the account
it belongs to` on `expected null to be 'menu'`.
- [x] **Negative** — the focus effect emptied: `moves the focus onto the item it
opens` on `expected <body>…</body> to be <button …>`.
- [x] **Negative** — the menu's `aria-label` struck: three tests, on `Unable to
find an accessible element with the role "menu" and name "Signed in as
kat"`.
- [x] **Negative** — the Escape branch struck: `closes on Escape and gives the
focus back` on `expected <div role="menu" …> to be null`.
- [x] **Negative** — the outside-press listener struck: `closes on a press
anywhere else`, same message.
- [x] **Negative** — the `contains` guard struck: `leaves a press on its own
trigger to the toggle` — the toggle that can never shut.

## 2. Presence folds into the bar

- [x] `presence-panel.tsx` restyled to a header row's shape: the heading is the
      small grey label, the roster one clipped line. Same section, same heading
      level, same list. The bounded width is structural — an unbounded roster is
      the one thing in the bar that grows with the world.
- [x] The no-reconnect caveat written onto the symbol as a caveat kept, not a
      bug fixed.
- [x] **Test** — `presence-panel.test.tsx`, 5 assertions on a still socket. The
      panel had no test at all before this.
- [x] **Negative** — the heading turned into a `<p>`: two tests, on `Unable to
find an accessible element with the role "heading" and name "Online
(connecting)"`.
- [x] **Negative** — the `<ul>` turned into a `<div>`: `lists who is online` on
      `Unable to find an accessible element with the role "list"`.
- [x] **Negative** — the `who` frame not sent: `asks who is there as soon as the
socket opens` on `expected [] to deeply equal [ '{"type":"who"}' ]`.
- [x] **Negative** — the `(you)` marker struck: `expected [ 'kat', 'sam' ] to
deeply equal [ 'kat (you)', 'sam' ]`.

## 3. The one bar

- [x] `src/components/chrome/app-header.tsx` — `<header>` outside `<main>`,
      brand, the project slot, presence and account.
- [x] `project-page.tsx` renders the bar and a `<main>`; the picker moves into
      it with `min-w-0` so it is the part that gives way; Rename and New project
      become `square` icon buttons **keeping their accessible names**; the
      "Projects" heading and the "Working in …" line are gone.
- [x] `app.tsx` splits its two states: the signed-out page keeps its own layout,
      the signed-in one is a column flex that passes the slots down.
- [x] The toolbar tightened (`mb-1.5`, `gap-x-1.5 gap-y-1`) and marked
      `data-toolbar`; its wrapping is untouched.
- [x] **Test** — three in `project-page.test.tsx`, one browser test in
      `e2e/header.spec.ts` that opens the account menu and signs out.
- [x] **Negative** — `<header>` turned into a `<div>`: 3 tests, on `Unable to
find an accessible element with the role "banner"`.
- [x] **Negative** — the rename button's `aria-label` struck: **9 tests**, on
      `Unable to find an accessible element with the role "button" and name
"Rename"`. That is the contract eleven call sites depend on and none
      stated.
- [x] **Negative** — the presence slot dropped from the bar: `gives the header
the slots the app fills` on `Unable to find an element with the text: who
is here`.

## 4. The frame takes the remainder

- [x] `TABLE_FRAME`: `maxHeight: calc(100vh - 16rem)` → `flex: 1 1 0%`.
- [x] The chain that makes that mean anything: `h-full` on the app's wrapper,
      `min-h-0 flex-1` on `<main>` and on `WbsTable`'s section.
- [x] `styles.css`: the user agent's `body` margin off, and `html`, `body`,
      `#root` given a height of 100% — because `100vh` is not a fraction of
      anything CSS `zoom` scales.
- [x] **Test** — four in `e2e/header.spec.ts`; `table-frame.test.ts` and
      `wbs-table.test.tsx` read the declaration back.
- [x] **Negative** — FAULT F, the `16rem` put back: `gives the table the height
the chrome stopped taking` on `expected 544 to be >= 664`, and `ends the
frame at the bottom of the window` on `expected 133 to be <= 16`.
- [x] **Negative** — FAULT B, the body margin left on: two tests, on 8px and
      10px of page overflow.
- [x] **Negative** — FAULT V, `h-full` back to `h-screen`: `keeps the page from
scrolling at all at 125% zoom` on `expected 200 to be 0`.
- [x] **Negative** — FAULT W, three more controls in the bar: `keeps the header
to one row` on `past: 50` at 900.
