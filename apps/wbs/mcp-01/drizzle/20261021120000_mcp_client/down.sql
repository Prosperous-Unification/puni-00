-- Reverses 20261021120000_mcp_client. Registered clients are dropped and must register again,
-- exactly as after a restart of a release that keeps them in memory. No credential lives here,
-- so the reversal needs no preflight.
-- Proof: 2026-10-21, replacing the DROP TABLE with `SELECT 1` failed `rolls back to the binding
-- migration, dropping clients, and forward again` (store-migrations.test.ts).
DROP INDEX mcp_client_expires;
DROP INDEX mcp_client_source;
DROP TABLE mcp_client;
