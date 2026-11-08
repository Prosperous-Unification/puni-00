## Why

PR 660's browser shard2 was cancelled twice at the 25-minute job limit. Attempt1
spent11min27s fetching system dependencies and logged133/150 successful cases;
the single unchanged retry spent10min40s fetching and logged103/150 successes.
Neither completed a failed testcase or a final suite verdict. A passing shard's
layout took21.4 minutes. The current four shards schedule 625cases, so combining
observed setup and layout costs can exceed 25 minutes.

## What Changes

Set the finite pixels_shard job budget to 35 minutes and pin that production YAML
field in the existing workflow contract test. Keep the current four shards,
per-test limits, zero Playwright retries, browser scope, activated-organization
step, artifacts and required pixels verdict propagation. The job still fails
or cancels on its actual test/service outcome. Root retains both failed attempts.

A larger runner or redistribution is a separate capacity decision. Chromium binary
caching alone does not address the measured system-package download. This narrow
budget adjustment lets the full checks produce their verdict within the observed
combined range, while retaining an explicit upper bound. It does not claim every
runner/network delay is diagnosed or that every future run fits35 minutes.

## Impact

Bad or hung jobs may consume up to10 additional runner minutes per shard. Normal
successful jobs stop when complete. No application behavior, credentials, providers,
activation or deployment changes. This internal correction joins the later cohesive
agentic candidate; originalPR 660 remains immutable and CI-red at its own head.
