## ADDED Requirements

### Requirement: Harness usage is imported once per request

Dash SHALL read Claude Code transcripts (recursively, so subagent transcripts under a session
directory count) and Codex rollouts from explicitly named directories for a period bounded by
two required instants and produce usage rows with harness, harness version, session id,
request or turn id, model, instant, branch when recorded, and token counts in the categories
`input`, `cacheWrite`, `cacheWriteExtended`, `cacheRead` and `output`. A Claude Code request
SHALL contribute one row however many transcript lines repeat it, taking the last line's usage
because `output_tokens` grows while a response streams; a repeated request id whose input or
cache counts differ, or whose output falls, SHALL refuse the run naming the file and line. A
Codex rollout SHALL contribute one row per `token_count` event whose cumulative
`total_token_usage` advanced, the row being that advance per category, so repeated events add
nothing and a restarted counter starts a new epoch; a category that falls while the total does
not SHALL refuse the run naming the file and line. A directory that is absent or unreadable, or
an entry missing a field Dash reads, SHALL refuse the run naming the file and line. A line that
is not JSON SHALL be skipped and listed in the output as an unreadable line, never silently
dropped, because a session that is still writing leaves such lines. Rows whose categories are
all zero SHALL be dropped.

#### Scenario: A streamed response repeats its usage

- **WHEN** a transcript holds three assistant lines with one request id whose `output_tokens`
  read 8, 8 and 20
- **THEN** the import yields one row with output 20 that names the third line

#### Scenario: A repeated request id disagrees

- **WHEN** two lines share a request id and differ in `cache_read_input_tokens`
- **THEN** the run refuses and the error names the transcript path and the second line

#### Scenario: Codex rows are cumulative advances

- **WHEN** a rollout's last `token_count` event is written twice
- **THEN** the import yields one row for it and the repeat adds no tokens

#### Scenario: A Codex category falls

- **WHEN** a rollout's cumulative `cached_input_tokens` falls while `total_tokens` holds
- **THEN** the run refuses naming the rollout and line

#### Scenario: A torn line in a live transcript

- **WHEN** a transcript's second line is not JSON
- **THEN** the import yields the other rows and lists that path and line as unreadable, and
  the breakdown states the count

### Requirement: Usage is priced from a versioned rate card and unknowns stay visible

Dash SHALL price each row from a rate card file that states its currency and, per
provider and model, per-million prices for the five categories with a source and access
date. The rate card's digest SHALL be the price identity in the output. A row whose model
is not in the card, or whose non-zero category has no price, SHALL be reported as unpriced
with its token counts and reason; it MUST NOT be summed as zero. Priced amounts SHALL be
integer micro-units of the card's currency.

#### Scenario: An unlisted model

- **WHEN** a row names `codex-auto-review` and the card has no such entry
- **THEN** the breakdown lists its tokens under unpriced with reason `unknown-model` and
  the priced total excludes it

#### Scenario: Extended cache writes on Claude

- **WHEN** a Claude row has `ephemeral_1h_input_tokens` and the card prices
  `cacheWriteExtended`
- **THEN** those tokens are priced at the extended rate and the 5-minute tokens at
  `cacheWrite`

### Requirement: Accepted outcomes are read from the default branch's merge history

Dash SHALL list accepted outcomes as first-parent merge commits on `main` within the
period whose subject names a pull request number and head branch, with the merge instant,
and SHALL collect the head branches of merges nested inside each as member branches. A
merge whose subject does not name a pull request SHALL be listed with no branches. The
repository path is explicit; a path that is not a git repository refuses.

#### Scenario: A plan branch carries nested pull requests

- **WHEN** `main` merges pull request 10 from `plan/x`, and `plan/x` had merged pull
  requests 8 and 9 from `feat/a` and `feat/b`
- **THEN** outcome 10 lists `plan/x`, `feat/a` and `feat/b` as its branches and 8 and 9 are
  not separate outcomes

### Requirement: Usage is attributed by stated rules with a reported remainder

Dash SHALL attribute each priced row to at most one outcome: first by a session that
referenced exactly one accepted pull request number in tool output, then by branch
equality with an outcome's branches, else unattributed with one reason among
`on-default-branch`, `no-branch`, `branch-not-accepted` and `ambiguous-references`. The
breakdown SHALL report per outcome the attributed cost, tokens, sessions, harnesses and
models, and overall the priced total, the unpriced tokens, the attributed cost, coverage,
the unattributed cost by reason, the blended cost per accepted outcome, and the rate card
digest and period. Coverage below one SHALL never be presented as complete.

#### Scenario: A session that opened two pull requests

- **WHEN** a session's tool output references pull requests 5 and 6, both accepted, and its
  rows carry branch `feat/five`
- **THEN** its rows are unattributed with reason `ambiguous-references` and the coverage
  figure excludes them

#### Scenario: Blended figure without attribution

- **WHEN** the period has priced cost of 118.00 and two accepted outcomes, and no row is
  attributable
- **THEN** the breakdown states blended cost per accepted outcome 59.00, coverage 0 and the
  whole priced cost under unattributed

### Requirement: The command writes a reproducible breakdown and refuses to overwrite

`account-outcomes` SHALL take `--repository`, `--since`, `--until`, `--rate-card`,
`--output` and one or more `--claude-projects` and `--codex-sessions` directories, parse
its whole grammar before reading anything, write `harness-usage.json`,
`efficiency-breakdown.json` and `efficiency-breakdown.md` as canonical JSON and Markdown
into a new output directory, and print the blended figure, coverage and unpriced volume on
one line. An existing output path, a missing flag, a duplicate flag, an unknown flag or an
`--until` not after `--since` SHALL refuse before any read.

#### Scenario: The output already exists

- **WHEN** `--output` names an existing directory
- **THEN** the command refuses and writes nothing
