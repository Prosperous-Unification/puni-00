# An import is its own route, not a command batch

`POST /api/projects/:id/commands` is "the one way to write to a plan" — every
edit, all-or-none, one undo — and a plan import is a write to a plan, so the
obvious shape was a batch. We gave the import its own route,
`POST /api/projects/import`, for three reasons that are each enough. The batch
caps at 200 commands (`MOST_COMMANDS_IN_A_BATCH`) because it holds the
process-wide write lock (ADR 0007), and a plan of a few hundred rows needs
thousands of commands — one per estimate, assignee and dependency — so an
import would be many batches, not atomic across them and undoable one slice at
a time. A batch acts on a project that exists; an import creates the project,
which no command does and which the journal has no undo for. And a batch's ids
are refs the caller mints; an import's are a whole file's vocabulary, resolved
in one pass before anything is written.

The doctrine narrows rather than breaks: the batch is the one way to write to
an **existing** plan. `POST /api/projects` and `POST /api/projects/import` are
the two ways a plan comes to exist.

**Considered**: raising the cap and adding a `createProject` command (rejected:
the cap protects the lock, and undo of a creation would need project deletion,
which does not exist); fe-01 sending batches of 200 (rejected: a refusal at
batch three leaves a half plan the reader cannot tell from a whole one).
