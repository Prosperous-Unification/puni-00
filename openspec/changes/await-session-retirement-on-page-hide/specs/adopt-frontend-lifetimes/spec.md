## ADDED Requirements

### Requirement: Page hide's application retirement awaits the session's

fe-01 SHALL let a component hand a retirement it started to the live application runtime, and the
application runtime's retirement SHALL wait for every retirement handed to it, under the
application's own retirement budget. The signed-in region SHALL hand its session's retirement to the
application when it goes, failing when that retirement left the session terminally fatal where it
was not before. The application's retirement SHALL fail, terminally, when a handed retirement failed
or did not settle within the budget. On page hide the bootstrap SHALL take the React root down
before it retires the application, so the region's cleanup finds the application live, and a
persisted restoration SHALL rebuild only after that retirement succeeded.

#### Scenario: A session still closing holds the application's retirement

- **WHEN** the page is hidden while a signed-in region's session is still giving its project back
- **THEN** the application runtime is not retired, and no restoration publishes a new one, until
  the session has been given back

#### Scenario: A session that cannot be given back fails the application

- **WHEN** the session the region handed over is left terminally fatal, or never settles within the
  application's budget
- **THEN** the application's retirement fails terminally and a restoration draws the sanitized fatal
  page instead of rebuilding

#### Scenario: A session already drawn as fatal

- **WHEN** the region goes while its session is already terminally fatal and drawn as such
- **THEN** the application's retirement is not failed by it

#### Scenario: A retirement handed to no live application

- **WHEN** a retirement is handed over while the application is not live, or after its retirement
  has settled
- **THEN** the hand-over throws rather than handing it to nobody
