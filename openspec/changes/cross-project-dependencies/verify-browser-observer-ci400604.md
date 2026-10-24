# Browser observer CI repair

Manual CI run `40060433745`, job `120772691624`, tested reviewed head `05fd381f5664945478a1da07d9e58919742916d2`. Layout passed; the dedicated cross-project step failed after nine passing cases. The desktop FF case's unawaited `response.json()` observer raced its first reload and Chromium reported `Network.getResponseBody: No resource with given identifier found`. The step lasted 1m52s, so this was a browser response lifecycle failure, not a job budget timeout. The original job log is `/tmp/puni-ci05fd-pixels4-plain.log`.

The test now waits for the browser's installed tree sequence to have a matching captured work-items response before each FF navigation. It also awaits all body reads already started by the observer. HTTP command acceptance, persisted relationship identity, selected FF type, DOM state and post-completion assertions remain in the same real browser case. The observer still propagates a failed body read; none is ignored.

Local proof on the actual dedicated fixture:

- Unchanged test: focused FF case passed, one test, 21.3s.
- Inject a one-second delay before each observer body read: the original FF case failed at `response.json()` with the same `Network.getResponseBody` error, one failure, exit 1.
- Keep the delay and add the installed-sequence/pending-read barriers: the same FF case passed, one test, 28.5s.
- Remove the delay: the complete dedicated target passed 10/10 in 1.6m; the FF case passed in 12.2s.
- Scoped ESLint, Prettier and `bunx tsc --build --force apps/wbs/fe-01/tsconfig.e2e.json` exited 0.

This local browser proof does not establish final merged hosted acceptance or cross-project step timing on GitHub Actions. No host, Docker or workflow dispatch action was taken.
