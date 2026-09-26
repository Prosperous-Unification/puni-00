## 1. Refresh outcomes

- [x] 1.1 `SessionRefreshRefused` in `wbs-client.ts`; `refreshSession` rejects with it for a missing family and a provider refusal. Tests: `oauth.test.ts` ended/unrefreshable session and store-failure identity; negatives with `Proof:`.

## 2. Tool-call boundary

- [x] 2.1 `server.ts`: an unexpected refresh rejection is reported and the session kept; a refused one ends the session unreported. Tests first in `server.test.ts`; negatives with `Proof:`.
- [x] 2.2 `server.ts`: a rejected session end is reported as tool content, not a protocol error. Test first; negative with `Proof:`.
- [x] 2.3 `main.test.ts`: both failures through the production composition write one redacted operator line.

## 3. Close

- [x] 3.1 `verify.md` with commands, results and proofs; host gate.
