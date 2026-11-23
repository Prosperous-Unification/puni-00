## ADDED Requirements

### Requirement: Operator can mark any submitted request irrelevant

The authenticated status command SHALL allow a request in any workflow status to become Irrelevant. The command SHALL retain the request, contact, brief, submission receipt and prior workflow status. Irrelevant SHALL be terminal in the inbox until a separate reopening workflow exists.

#### Scenario: Mark a closed request irrelevant

- **WHEN** a signed-in operator selects Irrelevant for a Closed request
- **THEN** the inbox displays Irrelevant and the saved request remains readable
- **AND** ordinary status transitions cannot change an Irrelevant request

#### Scenario: Unauthorized status update

- **WHEN** a status update lacks an authorized operator session or CSRF token
- **THEN** the status remains unchanged

### Requirement: Operator can filter the inbox by status

The inbox SHALL show all requests by default and allow selection of each effective status, including Irrelevant.

#### Scenario: Mark a request while a status filter is active

- **WHEN** an operator is viewing one status and marks a matching request Irrelevant
- **THEN** the refreshed list keeps the selected filter and omits that request
- **AND** the request appears when Irrelevant or All statuses is selected
