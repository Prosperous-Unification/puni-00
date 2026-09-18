# Work-view prototype

Throwaway, simulated UI. Question: which information hierarchy makes it easiest
to talk to the secretary, see workers and intervene while inspecting delivered
work and its evidence?

Three structurally different layouts share one route, selected by ?variant=A,
?variant=B or ?variant=C: work overview, conversation first and delivery board.
The floating bottom switcher and left/right arrows cycle layouts. Arrow keys
inside text fields keep editing normally.

There is no Twilight application page yet. This standalone preview therefore
lives beside the assistant vocabulary, without modifying the existing WBS app.
It uses plain CSS, the repository's system-font approach and no new dependency.

Run from this worktree:

    bun docs/assistant/work-view-prototype.mjs

Open http://127.0.0.1:4387/prototype/work-view?variant=A.

Try renaming a worker, opening its conversation, sending a demo message, searching
for “database” or “focus”, opening a report and answering the shortcut question.
Names keep stable worker IDs across variant changes. All content is fictional,
all state is in memory, and no agent, deployment or external service is called.

The prototype must remain on the throwaway branch prototype/twilight-work-view.
The main decision map links to it; no layout has been selected and no production
implementation is supplied.

## Verification

2026-09-08: inspected all three layouts in local Chromium at 1480×1000 and
390×844. A one-off browser smoke exercised renaming, direct messaging and its
secretary copy, a tool-output search hit, the report dialog, URL-based variant
navigation and preserving arrow keys while typing. All passed with no page errors
or horizontal overflow. The initial search interaction closed its own dialog on
Enter; preventing that key's default activation fixed the observed failure.

Formatting and the server's ESLint check passed. The final restarted server
returned HTTP 200 with the current preview. No application build, full repository gate, live-agent call,
cloud-browser acceptance or deployment was run for this throwaway mock.

Screenshots: [overview](work-view-prototype-A.png),
[conversation](work-view-prototype-B.png), [delivery board](work-view-prototype-C.png).
