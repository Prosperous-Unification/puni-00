## ADDED Requirements

### Requirement: Durable UTC-day caps on drafts and proposal requests

The store SHALL count, in `admission_count`, each created intake draft against `draft:source` (cap 20) and `draft:site` (cap 2,000), and each created proposal request against `proposal:source` (cap 5), `proposal:email` (cap 3, keyed by the SHA-256 of the day salt and the lower-cased email) and `proposal:site` (cap 200), per UTC day. The increment SHALL be a conditional upsert inside the transaction that inserts the draft or submission, so a refused count rolls the insert back and nothing is stored. A replayed submission SHALL NOT be counted again. The signed-in submission path SHALL count `proposal:source` and `proposal:email`. Rows older than the previous UTC day SHALL be deleted by the salt sweep.

#### Scenario: Twenty-first draft from one source

- **WHEN** one source has created 20 drafts today and posts `/intakes` again
- **THEN** the API answers 429 `draft_source_limit` with `Retry-After` to UTC midnight, no `intake_draft` row is written, no cookie is set, and another source's intake answers 201

#### Scenario: Site draft cap

- **WHEN** 2,000 drafts were created today across sources
- **THEN** the next intake from any source answers 429 `draft_site_limit`

#### Scenario: Per-email proposal cap

- **WHEN** three proposal requests today carried the same email, in different letter cases, from different sources
- **THEN** a fourth with that email answers 429 `proposal_email_limit` and leaves no submission, replay or retention-subject row

#### Scenario: Replay does not count

- **WHEN** a submitted proposal is replayed with the same idempotency key and body
- **THEN** the receipt is returned and the day's `proposal:source` count is unchanged

#### Scenario: Two processes, one cap

- **WHEN** two connections on one database each try to create the 20th and 21st draft for one source at the same time
- **THEN** exactly one draft is inserted and the count is 20

#### Scenario: Old counts are swept

- **WHEN** the salt sweep runs on a day two days after a count row's `utc_day`
- **THEN** that row is deleted and yesterday's rows remain
