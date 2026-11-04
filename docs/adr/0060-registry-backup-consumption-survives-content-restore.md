# Registry backup consumption survives content restore

Backup effect consumption lives in a root-owned sibling of captured `contents/`
on the same bounded journal filesystem. Persisting each consumed ticket inside
the canonical journal or captured tree would change the source being admitted;
`/run` would lose crash history, while a host-root spool would escape the journal
capacity boundary. Restoring captured contents therefore cannot refund or recreate
consumed allowances: missing effect state requires explicit reviewed enrollment
and reconciliation, and installed worker access remains an activation proof.
