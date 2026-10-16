# Workspace gate time budget

## Problem

PR #535 run `38858776285` exhausted the workspace gate's 60-minute job budget after its
ordinary Nx step passed. Cancellation interrupted Gate head pinning and skipped later required
checks, preventing a complete admission verdict.

## Outcome

Give `gate_workspace` a finite 90-minute budget so hosted CI can execute the remaining checks.
Record the observed run timing and await fresh hosted evidence for the corrected head.

## Non-goals

Changing check commands, required verdicts, other job budgets, or Tool Wiki activation policy.

## Constraints

Preserve the intentionally skipped trusted-wiki lint. Use lightweight local format and configuration
checks; full Nx, browser, and Burokrat work remain hosted because of local RAM constraints.
