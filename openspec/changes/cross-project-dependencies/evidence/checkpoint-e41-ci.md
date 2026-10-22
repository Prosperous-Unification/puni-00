# CI checkpoint e41: failures and assigned corrections

Run [39699842555](https://github.com/Prosperous-Unification/puni-00/actions/runs/39699842555)
for `e41e8d343` completed with failure. All four browser shards, their aggregate,
and the activated-organization browser check passed. Infrastructure run
39699842661 passed. These are checkpoint results, not a final feature gate.

The workspace failed five test targets: SQLite store, backend, frontend, MCP,
and tool-devsync. Observed corrections are assigned as follows:

- Solver/backend compatibility lane: explicit rollback lists omit the added
  external-dependency migration; one abbreviation ledger expectation omits the
  later migration. Preserve exact ordering and rollback checks, and distinguish
  fixture omissions from any actual rollback defect.
- Command lane: replay/actor fixture integration and exact service-kind inventory
  entries for the new helpers. No removal of behavioral or inventory checks.
- Frontend lane: two existing real-API fixture files fail response validation
  or never open the initial stream. Investigate the actual fixture boundary.
- Root documentation: MCP README claims 84 tools while the generated document
  derives 87; update the count and describe the three address reads.

Twilight's 11 pilot-policy tests all encounter undeclared binary content in a
saved proof log before reaching their intended checks. Two publication logs
contain literal NUL bytes. Their readable copies now display literal
`\u0000`; Base64 companions preserve exact original bytes and hashes in
[the encoding record](task-7-publication-proofs/ENCODING.md).
No scanner rule or test is disabled. A fresh configured pilot-policy run is
required before claiming the issue resolved.

Complete CI artifacts were downloaded to `/tmp/puni-e41-ci-artifacts` and the
readable workspace log to `/tmp/puni-e41-workspace-clean.log`. Raw CI output
remains available through the linked run. Full green CI, subsequent skipped
checks, solver image smoke and deployment have not been established.
