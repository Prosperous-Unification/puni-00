Ordered slices for `bin/heavy-lock-lib.sh`. Case numbers are `bin/heavy-lock.test.sh`'s.

## 1. Exclusive claim

- [x] 1.1 Negative first: case 28a/28b race two claimants under a `mkdir` shim that sleeps 0.3s
      and always exits 0, counting holders; 28c/28d plant a live old-format record. Watched
      failing on the `mkdir` claim: `28a: 2 of two claimants hold the lock …`, same for 28b,
      `28c … want exit 75, got 0`, `28d: the old-format holder's record was replaced or removed`.
- [x] 1.2 Claim through `acquire_heavy_flock` (perl `flock(2)` on fd 9), decide the record under
      it, release the record before the flock, run the command with fd 9 closed.
- [x] 1.3 Refuse 70 without perl — case 28e/28f.
- [x] 1.4 R5 proof: `acquire_heavy_flock` short-circuited to `return 0` fails 28a and 28b three
      runs out of three.

## 2. Record

- [x] 2.1 Findings entry in `docs/findings/checks-that-cannot-fail-puni-00.md`.
