## 1. Reproduce and align

- [x] 1.1 Reproduce the old edge 413 with measured synthetic notes JSON-RPC; add failing candidate and rendered exact-route tests — tests: dev-caddy.test.ts, site.test.ts, Caddy integration.
- [x] 1.2 Align exact `/mcp` to 4,194,304 bytes and preserve the 64KB fallback — tests: Caddy exact and OAuth boundaries; negatives: restored old cap, removed/raised resource cap, widened OAuth cap.

## 2. Make evidence durable

- [x] 2.1 Require the pinned Caddy integration through tool-remote-scripts:test — tests: required target wiring and missing-tool refusal; negatives: remove dependency or break required executable.
- [x] 2.2 Prove configuration parity and source overwrite — tests: both Caddy configurations; negatives: update only one configuration and remove source overwrite.
- [x] 2.3 Record focused Bun/Nx, format, OpenSpec checks, proofs, and unverified host/CI checks in verify.md.
