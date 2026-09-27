- [x] 1. A retirement join (`runtime/retirement-join.ts`) that waits for every retirement handed to
      it, including one handed while it waits, fails with every failure, and refuses one handed
      after it settled.
- [x] 2. The application runtime publishes it as `ApplicationServices.retirements` and awaits it in
      its close; `useRetirementJoin` hands a retirement to the live application.
- [x] 3. `SignedInApp`'s cleanup hands its session's retirement over, failing only when that leave
      left the owner newly terminally fatal; the bootstrap's page hide keeps taking the root down
      first.
- [x] 4. Unit, app and bootstrap cases with production-path negatives, and the bootstrap's generated
      model extended with a signed-in region's session that settles, rejects or never settles.
