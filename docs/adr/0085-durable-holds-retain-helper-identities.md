---
status: accepted
---

# Durable holds retain helper identity through cleanup

Dash helpers protect compute after their frontend exits, so frontend liveness cannot authorize release. Keep the historical hold token and use one exclusively published, tagged decision for Ready, cancellation or retirement; retain the complete helper PID, boot and start identity until qualified process termination and log-first generation cleanup succeed. This lets a restarted controller reconcile an interrupted cleanup without treating diagnostic text or numeric wait status as authority.

A parent heartbeat would end legitimate protection when its frontend dies. Deleting Ready at settlement strands a physical log without a helper identity after a crash; a separate identity sidecar adds another publication and cleanup race. Retaining the helper's tagged decision keeps that witness within the existing arbitration path, while an unidentifiable reservation stays visibly blocked.

New admission and adoption still require the live helper, current Ready and matching canonical holder records. Ledger authorization withdraws the hold; actual process termination authorizes physical cleanup. A dead guard marks lost authority before cleanup and replacement, preserving charged compute and its reservations.
