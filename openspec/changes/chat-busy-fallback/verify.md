# Chat busy and email handoff verification

- The mounted refusal test first failed on the old limit message and passed once the busy message, manual actions and explicit retry after the wait were in place.
- The mounted final-step test first failed because there was no email input. It passes with an immediate email form and checks that the duplicate review controls and chat composer are absent. The existing candidate-and-retry test still covers an unresolved attempt.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx --no-install nx run-many -t test,lint,typecheck,build -p website-fe-01 --output-style=static` passed. The frontend suite reported 188 passing tests and zero failures.
- `bunx --no-install openspec validate chat-busy-fallback --strict` and `git diff --check` passed.
- `bun /tmp/puni-4291-check.mjs` checked both local fixture pages in Chromium, compared the two email forms, and verified the checkmark and two-line confirmation after a synthetic save. The confirmation oracle first failed on the old heading. The live backend did not receive fixture requests. The temporary preview build is separate from production.

`bun /tmp/puni-4291-celebration.mjs` failed on the pre-change receipt because the badge was missing. On the updated preview it verified the animated badge and sparkles, the static reduced-motion state, and the lack of horizontal overflow at 390 px.

The Chat more link and its round trip were removed by `chat-after-submission`, which keeps the chat open after submission.

Repository-wide gates and deployed-environment checks were outside this local preview.
