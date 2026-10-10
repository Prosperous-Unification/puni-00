## ADDED Requirements

### Requirement: Site background and monotext header on Build

The Build route SHALL render the site's background video behind the whole page, streamed from the configured site origin at `/media/hero/background.mp4` with `/media/hero/poster.jpg` as poster, under a dark scrim. Under `prefers-reduced-motion: reduce` it SHALL show the poster instead of the video. When the media fails to load it SHALL show the page's own night gradient; the media is optional decoration and its failure SHALL NOT throw or block the conversation. The video element SHALL NOT carry a `crossorigin` attribute and the repository SHALL NOT contain the video or poster files. The header SHALL render the `[n]` numbered monotext navigation, the PUNI wordmark followed by the moon image from the site origin (`/media/brand/moon.avif` with `/media/brand/moon.webp`), falling back to the existing dot when the image fails. The manual brief and operator routes SHALL keep their light body; the manual brief's header sits on a night band that uses the same media layer.

#### Scenario: Normal motion

- **WHEN** Build loads in a browser without a reduced-motion preference and the site origin serves the media
- **THEN** a muted, looping, autoplaying video sourced from the site origin is present under a scrim and the conversation remains readable

#### Scenario: Reduced motion

- **WHEN** Build loads with `prefers-reduced-motion: reduce`
- **THEN** no video element is rendered and the poster image from the site origin is shown under the scrim

#### Scenario: Media unavailable

- **WHEN** the site origin answers 404 for the video and poster
- **THEN** the layer switches to the gradient class, no page error is reported, and the conversation is unaffected

#### Scenario: Moon fallback

- **WHEN** the moon image fails to load
- **THEN** the wordmark shows the dot and the header keeps its layout

### Requirement: App header matches the site header

Every app route (Build, the manual brief and the operator page) SHALL render one header whose geometry and type match the live site's header (dev.puni.dev, measured in Chrome on 2026-10-06) within 2 px at 1440, 1024, 768, 390 and 320 px wide. From 992 px the header SHALL show the `[-] Navigation` rail and the `[1]`–`[4]` links stacked at the left in Geist 18px/27px rows of 52.8 px, and the PUNI wordmark centred in Inter Tight 800 at 36px with the moon at 0.82em; below 992 px it SHALL show the wordmark at the left (28.8px at 600 px and below) and a 44 px `Menu ☰` button at the right whose panel lists the same links in Geist 19.2px/28.8px rows. The header's horizontal measure SHALL follow the site's container breakpoints (768, 992, 1280, 1440 and 1920 px). The night and light tones SHALL differ only in colour. Build stays marked current with `aria-current` and, like the site, without a visual mark. Escape SHALL close the open panel and return focus to the button, and the tab order on narrow screens SHALL stay skip link, brand, Menu.

#### Scenario: Wide desktop

- **WHEN** the site's Home and any app route load at 1440×900 in Chrome
- **THEN** the wordmark, moon, rail label and each nav link occupy the same boxes within 2 px with the same font family, size, line height and weight

#### Scenario: Open menu on a phone

- **WHEN** the site's Menu and the app's Menu are opened at 390×844
- **THEN** the button, panel title and the four links occupy the same boxes within 2 px with the same type

#### Scenario: Narrow desktop

- **WHEN** an app route loads at 1024×768
- **THEN** the rail is shown as on the site rather than the Menu button, and the Build conversation sits to the rail's right instead of under it

### Requirement: Conversation harness layout

Build SHALL present the conversation as a full-height thread with user and assistant messages, a status row for thinking, streaming, stopped and error states, and a composer pinned to the bottom in the site's liquid-glass style: transparent with blur and a hairline border, never a white fill. `Enter` SHALL send and `Shift+Enter` SHALL insert a newline. While a reply streams, the composer SHALL show a Stop control. The layout SHALL work from 320 px up without horizontal overflow, keep the composer visible above a mobile virtual keyboard, keep every interactive target at least 44 px, and move focus to the thread heading on load.

#### Scenario: Streaming reply

- **WHEN** a reply is streaming
- **THEN** the assistant message grows as deltas arrive, the status row shows a streaming indicator, Stop is available and Send is not

#### Scenario: Stop

- **WHEN** the visitor presses Stop mid-stream
- **THEN** the client posts the cancel request with the operation identity, stops reading the stream, shows `Stopped` with Retry and leaves the partial text visibly marked as interrupted

#### Scenario: Retry after Stop

- **WHEN** the visitor presses Retry on a stopped reply, before or after a reload
- **THEN** exactly one stream request is sent with the stopped operation's identity and the same message

#### Scenario: Mobile keyboard

- **WHEN** the viewport is 390 px wide and the visual viewport shrinks by 300 px
- **THEN** the composer remains fully visible and the latest message stays in view

#### Scenario: Narrow screen

- **WHEN** the viewport is 320 px wide
- **THEN** no element overflows horizontally and every control is at least 44 px tall

### Requirement: Explicit first Send

Build SHALL show the saved Home request pre-filled and read-only in the composer with a single Send action. Mounting, reloading, returning from optional sign-in or any passive event SHALL NOT send a stream request. Pressing Send SHALL send exactly one initial operation with the server-owned identity and show the Home request as the first user message. A failed initial request SHALL remain retryable under the same identity after reload, and no different first message SHALL be possible until the initial operation completes.

#### Scenario: Nothing before Send

- **WHEN** Build mounts and is reloaded with a saved Home request whose initial operation has not started
- **THEN** zero `POST /conversation/stream` requests occur

#### Scenario: One initial POST

- **WHEN** the visitor presses Send
- **THEN** exactly one `POST /conversation/stream` with `initial: true` occurs and the thread shows the Home request as the first user message

#### Scenario: Dropped initial POST

- **WHEN** the initial POST fails before reaching the API and the page reloads
- **THEN** the composer still shows the read-only Home request, the ordinary composer is unavailable, and Retry resends the same identity

### Requirement: Reload, retry and visible states

Build SHALL restore the saved conversation from the API on reload without another paid call. A retry of a pending operation SHALL reuse its identity. Build SHALL render distinct states for `loading`, `ready`, `streaming`, `stopped`, `error` (with Retry and Back to Home), `exhausted`, `disabled`, `handed_off` and `expired` (redirect to Home with the existing reason). Network failures SHALL use the existing plain unreachable copy. An impossible state SHALL reach the error boundary.

#### Scenario: Reload after a reply

- **WHEN** the page reloads after one completed reply
- **THEN** both saved messages reappear, no stream request is sent and the composer is ready

#### Scenario: Stream error

- **WHEN** the stream ends with an error chunk
- **THEN** the error state names that the response could not be confirmed, offers Retry, and the saved history is unchanged

### Requirement: Inline conversion affordances

When the server reports stage `contact`, `exhausted` or a completed brief, Build SHALL show, under the thread, an editable `[ YOUR BRIEF ]` card pre-filled with the server-stored brief, an email field and a `Request a proposal` action that uses the existing proposal submission with the draft claim and CSRF. At stage `exhausted` the composer SHALL be replaced by one line naming the reason and the card SHALL remain. After submission Build SHALL show the receipt state. The card SHALL never show a price, date or contract field. Assistant replies SHALL be shown without their `[brief]` and `[/brief]` marker lines, saved or streaming.

#### Scenario: Contact stage

- **WHEN** `GET /conversation` reports stage `contact` with a stored brief
- **THEN** the brief card, email field and proposal action are rendered under the thread and the composer stays open

#### Scenario: Brief markers hidden

- **WHEN** the `brief` reply streams and is saved with its markers
- **THEN** the thread never shows `[brief]` or `[/brief]`, and the card holds only the marked body

#### Scenario: Exhausted

- **WHEN** `GET /conversation` reports stage `exhausted` with reason `turns`
- **THEN** the composer is replaced by the limit line and the brief card with the proposal action remains usable

#### Scenario: Exhausted reasons

- **WHEN** the reason is `turns`, `conversation_spend`, `source_spend` or `site_spend`
- **THEN** the closed line names that limit in its own words and always points to sending the brief to a person

#### Scenario: Proposal submitted from the harness

- **WHEN** the visitor submits a valid email and brief from the card
- **THEN** one proposal is stored through the existing route, the receipt is shown and no further stream request is possible

### Requirement: Disabled provider state

When `GET /conversation` reports `provider: 'disabled'`, Build SHALL show the Home request as the first message, one clearly labelled system row stating that AI chat is not switched on and that a person reads every brief, a `Shape your brief` link to the manual brief, and no composer. It SHALL NOT label anything as a live AI reply. When it reports `provider: 'demo'`, Build SHALL run the live harness and label the conversation and every reply `Simulated`.

#### Scenario: No key configured

- **WHEN** the API runs with `OPENROUTER_ENABLED=0` and `DEMO_AUTH=0`
- **THEN** Build shows the disabled row and the manual link, and no stream request is sent on Send because there is no Send

### Requirement: Start over

Build SHALL offer a quiet `[ Start over ]` action for a saved anonymous request. Activating it SHALL ask inline, without a browser dialog, `Discard this request?` with `[ Keep ]` and `[ Discard ]`, move focus to `Keep`, and return focus to `Start over` on `Keep`. `Discard` SHALL call the draft discard route and then navigate to the site's `/#request` Home prompt. Every control SHALL be keyboard operable and at least 44 px. A refused discard SHALL show its reason and keep the conversation.

#### Scenario: Discard

- **WHEN** the visitor confirms `Discard`
- **THEN** the draft cookie is gone, the browser lands on the site's `/#request`, and reopening Build redirects to Home with `entry=missing`

#### Scenario: Keep

- **WHEN** the visitor chooses `Keep`
- **THEN** nothing is sent, the conversation is unchanged and focus returns to `Start over`
