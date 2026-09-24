## ADDED Requirements

### Requirement: Three runtimes own the frontend's services

fe-01 SHALL build one DI Bag runtime per accepted lifetime - application for the
page, session for one signed-in user identity, project for one open project -
outside the React tree, and SHALL publish to delivery only the narrow service
contracts each lifetime exports. A bag, a browser store, a credential, a broad
HTTP client, a repository port and a resource-service SHALL NOT be reachable
from delivery.

#### Scenario: The page's own runtime is built once, above the components

- **WHEN** the application runtime is built
- **THEN** it is built outside the Strict Mode subtree, acquires each owned
  service once, and exposes only its public service contracts

#### Scenario: A module's private bindings stay inside it

- **WHEN** the production installer returns the services of an installed module
- **THEN** the module's private bindings are absent from that surface, and a DI
  failure names them by the module's label

#### Scenario: The session runtime is keyed by identity

- **WHEN** a signed-in identity arrives from either startup identity restoration
  or a password login
- **THEN** the session runtime is keyed by the user id and the credential is
  only an adapter input

#### Scenario: The project runtime is keyed by the selected project

- **WHEN** a project is selected
- **THEN** a project runtime is created for that project id inside the current
  session, and its feed, writer, command and saved-plan services are published
  only while it is current

### Requirement: One retirement per runtime, ordered by lifetime

Every close trigger for one current runtime - route unmount, selection change,
identity change, local exit and page hide - SHALL join one retirement of that
runtime. A development edit that reloads the document retires the page through
its page hide, not through a trigger of its own. Publication SHALL be withdrawn before disposal
starts. A project's retirement SHALL begin before its session's, and the
application's SHALL begin only after both have been started and joined.

#### Scenario: Two triggers retire one runtime once

- **WHEN** two triggers ask to retire the same current runtime
- **THEN** its disposal runs once and both callers observe the same outcome

#### Scenario: Withdrawal precedes disposal

- **WHEN** a runtime is retired
- **THEN** delivery can no longer read its services before its first disposer
  runs, and a completion that arrives late changes nothing a reader sees

### Requirement: A failed or expired retirement refuses the replacement

When a required retirement rejects, or its bounded wait expires, the runtime
owner SHALL refuse the transition: it SHALL NOT build or publish the
replacement, SHALL NOT republish the withdrawn services, and SHALL publish a
fatal state carrying only the sanitized public failure report and its occurrence
handle. The owner SHALL keep observing the disposal that is still running, and
its eventual completion SHALL NOT publish the refused replacement. This governs
every transition inside one document, including any future gated in-document
replacement of the bootstrap module; a document replacement cannot refuse and is
governed by the requirement that names it.

#### Scenario: A disposer rejects during a replacement

- **WHEN** one disposer of the current runtime rejects while a replacement is
  requested
- **THEN** every other disposer is still attempted, the replacement is never
  built, and the fatal state carries the sanitized report and occurrence handle

#### Scenario: A disposal outruns the bounded wait

- **WHEN** a disposer has not settled when the retirement's bounded wait expires
- **THEN** the transition fails, the replacement is never built, and the owner
  still holds the shared disposal promise

#### Scenario: Late completion does not resume a refused transition

- **WHEN** the disposal behind an expired wait later settles
- **THEN** the refused replacement stays unpublished and the fatal state stays
  visible

#### Scenario: A further transition on a refused lifetime is refused

- **WHEN** a lifetime whose retirement failed is asked to transition again
- **THEN** it refuses with the same failure rather than starting over

### Requirement: A superseded or unbuildable transition acquires nothing

Transitions of one lifetime SHALL run one at a time, in request order. A request
for a replacement that a newer request has overtaken SHALL NOT build a runtime
and SHALL be refused as superseded, while a retirement request SHALL join the
transition that overtook it. A request's generation SHALL be rechecked after
every asynchronous step of its transition, not only when it is accepted. When a
replacement's construction fails after its retirement succeeded, the owner SHALL
release everything that construction acquired, publish the sanitized fatal state,
hold no runtime, and remain able to build again — unlike a failed retirement, or
a release that itself fails or outruns its wait, either of which is terminal.

#### Scenario: Two replacements are requested in one tick

- **WHEN** two replacements of the same lifetime are requested before either has
  run
- **THEN** exactly one runtime is live afterwards, the superseded request never
  built one, and every runtime that was built other than the live one has been
  retired

#### Scenario: A newer request arrives while the old runtime is being disposed

- **WHEN** a replacement is requested while the disposal started by an earlier
  replacement has not finished
- **THEN** the earlier request builds nothing, is refused as superseded, and only
  the newer request's runtime is published

#### Scenario: A construction acquires something and then fails

- **WHEN** a construction acquires a resource and then throws
- **THEN** everything it acquired is released before the fatal state is
  published, and if that release rejects or outruns its wait the lifetime becomes
  terminal

#### Scenario: A retirement arrives with a replacement

- **WHEN** a retirement is requested while a replacement of the same runtime is
  pending
- **THEN** the retirement joins that transition instead of refusing, and no
  runtime is left without an owner

#### Scenario: The replacement cannot be built

- **WHEN** a replacement's construction throws after the old runtime retired
  successfully
- **THEN** the sanitized fatal state is published, nothing is held, and a later
  transition may build again

### Requirement: A retired runtime gives the reader's browser back

A runtime that owns a browser store SHALL hold it through a revocable handle, and
its retirement SHALL revoke that handle. Every read, write and removal attempted
through a preference handle obtained from a retired runtime SHALL throw, and SHALL
NOT reach the reader's browser. A handle obtained from the current runtime SHALL be
unaffected by the retirement of a previous one.

#### Scenario: A preference written after retirement reaches nothing

- **WHEN** a reader's screen writes a preference through a handle it obtained from a
  runtime that has since been retired
- **THEN** the write throws, the value in the reader's browser is unchanged, and no
  default is written over it

#### Scenario: A preference read after retirement is refused rather than answered

- **WHEN** a read or a removal is attempted through a handle from a retired runtime
- **THEN** it throws rather than answering from the browser, because the answer would
  belong to a runtime nobody owns

#### Scenario: The current runtime keeps its own store

- **WHEN** one runtime is retired and a replacement is published
- **THEN** the replacement's own handles read and write normally, and only the retired
  runtime's handles refuse

### Requirement: A lifecycle refusal is classified, not only worded

Every refusal a preference store raises because its own runtime is no longer the one
publishing it SHALL carry a machine-readable classification naming which lifecycle
state raised it, and the preferences module SHALL export a predicate for recognising
it. A caller that recovers from a lifecycle refusal SHALL narrow on that
classification and SHALL NOT match on message text. Every other failure a store can
raise SHALL remain unclassified and SHALL propagate unchanged.

#### Scenario: The two lifecycle refusals are told apart from each other

- **WHEN** a store refuses because its runtime is withdrawn, and another refuses
  because its own store has already been given back
- **THEN** both refusals are recognised by the module's predicate and each names its
  own lifecycle state, while their messages stay exactly as they were

#### Scenario: An ordinary storage failure is not a lifecycle refusal

- **WHEN** a live store's own read or write fails for a reason of the browser's own,
  such as blocked site data
- **THEN** the module's predicate does not recognise it, and the failure reaches the
  caller unchanged rather than being recovered from

### Requirement: A delivery consumer of preferences degrades visibly when withdrawn

A hook or component reading the runtime's preferences through
`useApplicationServicesState` SHALL render the modelled withdrawn state without
throwing, SHALL report explicitly when its own displayed choice is not being
persisted rather than accepting it silently, SHALL let an unexpected storage
failure propagate unchanged, and, while it stays mounted, SHALL adopt a later
runtime's own saved answer once one is published.

#### Scenario: A choice made while withdrawn is not silently accepted as persisted

- **WHEN** a reader chooses an answer while the application services are
  withdrawn, or while the runtime backing an already-read handle is withdrawn
  between renders
- **THEN** the in-tree choice still changes and nothing throws, and the
  consumer's own contract reports that this choice is not being remembered

#### Scenario: Withdrawal while mounted resets to the documented default

- **WHEN** a mounted consumer's runtime is withdrawn
- **THEN** its choice resets to the same default an unread key already produces,
  without waiting for disposal to finish, and a later published runtime's own
  saved answer is adopted once one arrives

#### Scenario: A superseded chooser and an unexpected storage failure

- **WHEN** a caller retains a chooser obtained while one runtime was live and
  invokes it after a later runtime replaced that one, or a live store's own write
  fails for a reason that is not a lifecycle refusal
- **THEN** the retained chooser changes nothing at all, and the storage failure
  propagates unchanged with the displayed choice and the stored bytes untouched

### Requirement: A preference used at an event reaches the runtime live at that event

Delivery code that reads or writes a remembered answer from an event handler, an
effect or an asynchronous continuation SHALL resolve the page's runtime at the
instant of that access rather than at the render that preceded it, and SHALL
reach no runtime other than the one live at that instant. When no runtime is
live, the access SHALL read, drop and write nothing, SHALL NOT throw, and SHALL
report through its own return type that the answer is not being remembered. A
live store's own failure that is not a lifecycle refusal SHALL propagate
unchanged, with nothing shown that the store did not keep. A consumer that
keeps a remembered answer on screen through `useApplicationServicesState` MAY
answer a callback bound under a runtime that has since been replaced by making
no access at all, as the requirement on degrading visibly already states.

#### Scenario: A callback kept from before a replacement reaches only the replacement

- **WHEN** a handler or continuation that was bound while one runtime was live
  runs after a later runtime has replaced it, before anything has re-rendered
- **THEN** any access it makes reaches the replacement's own store and never the
  replaced runtime's, and a reader kept from that earlier render answers the
  replacement

#### Scenario: With no runtime live, the default is shown and reported as not remembered

- **WHEN** a settings section or a last-opened project is read or written while
  no runtime is live, whether none has been published yet or the one that was has
  been withdrawn
- **THEN** the caller's documented default is used, nothing is read, dropped or
  written in any store, nothing throws, and the returned value says the answer
  is not being remembered

#### Scenario: A layout handle built before any runtime follows every runtime

- **WHEN** a layout preference handle built when the page's modules loaded, before
  any runtime existed, is used after runtimes have been published, withdrawn,
  replaced, or left terminally failed
- **THEN** each access reaches only the runtime live at that instant, drops a
  refused value only from that runtime's store, and while none is live answers
  that nothing is remembered without touching any store

### Requirement: Log out stays a local exit

The Log out action SHALL send no request to the server and SHALL retire the
project runtime, then the session runtime, before the signed-out state renders.
If either retirement fails, the signed-out state SHALL NOT render and the fatal
state SHALL be shown instead.

#### Scenario: Log out revokes nothing remotely

- **WHEN** Log out is activated
- **THEN** no logout request is sent, the project and session runtimes are
  retired in that order, and a reload can still restore the same identity

#### Scenario: Log out with a failing retirement

- **WHEN** a project or session disposer rejects during Log out
- **THEN** the signed-out state does not render, no retired service is
  republished, and the fatal state is shown

### Requirement: A restored page rebuilds only after retirement succeeds

A persisted page-hide SHALL begin retirement of the project, session and
application runtimes. A persisted page restoration SHALL join that retirement
and SHALL run the whole bootstrap - runtimes, React root, listeners, identity
restoration - only after it succeeds, preserving the browser address. If it
fails, no bootstrap SHALL be attempted and the fatal state SHALL be shown.

#### Scenario: Restoration waits for the retirement it joined

- **WHEN** a page is restored while the retirement started by its persisted hide
  is still running
- **THEN** no runtime, root, listener or identity read happens until that
  retirement succeeds, and then the whole bootstrap runs once

#### Scenario: Restoration after a failed retirement

- **WHEN** the joined retirement rejects or outruns its wait
- **THEN** no bootstrap is attempted and the fatal state is shown

### Requirement: A document replacement starts retirement and promises nothing after it

When a development edit reaches the bootstrap module, or a module above it that
no hot-update boundary accepts, fe-01 SHALL be replaced by a full reload of the
document - a document replacement - and SHALL NOT be updated in place. Before
the old document's pagehide dispatch returns, its bootstrap SHALL have taken down
the React root, withdrawn the application runtime's publication, so that every
preference access through a handle that runtime published throws, and begun that
runtime's disposal, or queued it behind a transition that is already running. The
old document SHALL NOT wait for the disposal; its completion and its failure are
not observed by fe-01 and refuse nothing; the new document's bootstrap SHALL run
regardless, and no terminal refusal SHALL cross from the old document to the new
one. A gated in-document replacement, which holds a replacement module's bootstrap
behind the old runtime's retirement inside one live document, SHALL NOT be
provided until a mechanism for it meets "A failed or expired retirement refuses
the replacement".

#### Scenario: The old document starts retirement before its page hide returns

- **WHEN** a live page with no transition running receives a pagehide that does
  not persist it, as a reload's does, and its runtime's disposal does not settle
- **THEN** by the time the dispatch returns the root has been taken down, the
  runtime is withdrawn, its disposal has begun, and a preference write through a
  handle it published throws, and the dispatch has not waited for the disposal

#### Scenario: An edit to the bootstrap reloads the document

- **WHEN** the bootstrap module, or a module above it with no accepting boundary,
  changes while the development server is serving the page
- **THEN** the page is reloaded as a new document, and no second bootstrap runs
  inside the old one

### Requirement: A project's plan state and announcements live outside React

The plan feed and the plan writer SHALL be built from project-owned stores and
ports - the delivered plan, the busy state, the presence of other readers, a
channel for refusals and a channel for commands issued - and SHALL NOT be handed
a React state setter, a React ref or a toast function. A store SHALL keep its
snapshot the same object until one of its members changes, SHALL tell each
listener once per change and only after the change is made, and SHALL NOT throw
a lifecycle refusal. A channel SHALL deliver each event, in publication order, to
the listeners subscribed when that event's delivery starts, SHALL NOT enter a
listener while it is already running, SHALL NOT deliver to a listener after its
unsubscribe has returned, and SHALL let a listener's failure reach the publisher
after the other listeners have been delivered to. Delivery SHALL select from the
stores and listen to the channels, and what a reader sees SHALL NOT change.

#### Scenario: A listener that publishes, joins or leaves during a delivery

- **WHEN** a listener publishes again, subscribes another listener, or
  unsubscribes one whose turn in the current delivery has not come, from inside
  that delivery
- **THEN** the new event reaches every listener after the current one, the new
  listener hears only later events, the removed listener hears nothing more, and
  no listener is entered twice at once

#### Scenario: Busy is told once per change

- **WHEN** a gesture raises busy while it is already raised, or lowers it while
  it is already lowered, or a listener raises and lowers it from inside its own
  notification
- **THEN** a listener is told exactly once for each change of the value, after
  the change, and reads the value as it stands at that instant

#### Scenario: A publication that says nothing new changes nothing

- **WHEN** the plan feed publishes the same tree, directory and markers, an equal
  step list in a new array and the same failure cause in a new wrapper, or the
  stream reports the connection or the presence list it already reported
- **THEN** the delivered plan or the presence keeps the same snapshot object and
  no listener is told, and a publication that does change a member replaces the
  snapshot once, keeps every other member as it was, and tells each listener once
