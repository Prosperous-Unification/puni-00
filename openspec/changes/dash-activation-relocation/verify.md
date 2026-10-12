# dash-activation-relocation verification

Observed commands, results and R5 proofs per slice. Bun tests run under
`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

## S0: split without behaviour change

| Injected fault                                                        | Observed failure                                         |
| --------------------------------------------------------------------- | -------------------------------------------------------- |
| `export { ProcessReviewInvoker } from './review/invoker'` in facade   | surface equality `+ "ProcessReviewInvoker"`              |
| `Date.now()` appended to `review/invocation-journal.ts`               | scan `review/invocation-journal.ts reads a clock`        |
| `bun:sqlite` import in `review/invocation-journal.ts`                 | scan `review/invocation-journal.ts imports bun:sqlite`   |
| `new Database(process.env.PARSER_PATH ?? ':memory:')` in declarations | scan `relationships/declarations.ts opens a SQLite file` |

Each fault was restored and the test passed again.

Finding: the test `retained raw tuple mismatch refuses before the digest dependency is touched`
spies on `hashBytes` through a module namespace. It still passed with a `hashBytes` call injected
before the tuple check, both on main `21a6bd537` and after S0. The spy never intercepts, so its
`not.toHaveBeenCalled` assertion proves nothing. This change does not fix it.
