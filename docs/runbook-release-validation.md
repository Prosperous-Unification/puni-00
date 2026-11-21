# Product release validation

A product release validates the artifacts it ships, their transitive Nx workspace and task dependencies, and its deployment contract. The full repository gate remains an integration check; it is not a product release prerequisite.

## Establish the product scope

Start from the exact released application and deployment-tool projects in the selected source revision. Use the Nx project graph and task dependencies to include required libraries, implicit dependencies and cross-project task edges. Run the complete required test, lint, typecheck and build targets for that scope. A complete isolated product workspace is an acceptable conservative scope when its source closure and required targets are verified.

Use affected selection only with a validated base and previously qualified unchanged artifacts. For a first release, or missing compatibility evidence, validate the complete product closure. A new shared-library dependency expands the scope. Include product-specific browser, packaging, migration and deployment targets even when they are not part of the ordinary four-target run.

Refuse missing roots, empty selections, malformed or partial graphs and missing required checks. Nx CLI exit zero alone is insufficient: it can accompany an unknown project with no tasks or a partial graph after a configuration error. Use the strict graph API and inspect the actual selected tasks, or verify the complete isolated product workspace. Record source identities, roots, resolved projects, commands, integration checks and actual outcomes.

## Keep preflight separate from qualification

Release preflight authorizes a source-bound checked build to begin. It does not claim validation passed and cannot authorize publication. Each release stage waits for its product-specific prerequisites. Build and artifact checks precede publication; the product’s deployment controls precede activation; live acceptance proofs precede final production acceptance. Live acceptance is not a prerequisite for the initial deployment needed to exercise it. Never label a scoped result as a passed full repository gate.

Canonical host admission, locks, capacity floors, immutable source and image binding, resource attribution and failure handling still apply. A redundant owned repository gate can be canceled through its documented controlled end procedure; preserve its canceled outcome and verify complete retirement before reusing resources. Do not turn cancellation into a passing receipt.

## Website release

The private companion assembles the licensed site with exact public app, API, contracts, SQLite and analytics trees. Its existing checks-enabled full profile validates the complete private Nx workspace, including deployment and workspace tooling. That product workspace has no WBS projects. The profile name does not require a separate public monorepo gate.

For the website, source/runtime/image/rehearsal checks precede publication; Fleet validation and the database seal precede application activation; request/notification/log/restore proofs precede final production acceptance.

Keep frozen installation, source formatting, all declared private Nx checks, OpenSpec validation, production-origin builds, site verification, image runtime and gateway checks. Also run migration lint against the complete website up/down SQL inventory. Keep actual image rehearsal/rollback, Fleet checks, schema capture and permanent activation seal, strict public TLS, durable request readback, owner notification, retained logs and backup/restore acceptance. See the [website operations index](website/README.md) for the owning private procedures.

## Repository integration

Full `bin/h2puni-gate.sh <sha>` and CI integration behavior remain available. Shared changes that alter a product's actual dependency closure must be included in that product's scope. Unrelated application suites do not become release prerequisites merely because they share a Git repository.
