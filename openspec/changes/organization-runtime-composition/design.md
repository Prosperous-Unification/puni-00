## Composition decisions

Keep the scheduler's shared supervisor and signal handlers, background failure
source, stopping state, explicit resolver configuration and scheduling override.
Add SMTP parsed configuration alongside these fields in config and both
entrypoints; boot constructs its verification-only adapter without replacing
DNS resources. The lockfile is the union of dns-packet and exact nodemailer10.1.2.

The browser-process fixture keeps the existing fourth DNS argument and takes
SMTP configuration as an additional fifth argument. Its SMTP boot caller is
updated; DNS callers keep their existing meaning. Organization harness changes
retain both retained-proof methods and purpose-aware mail capture.

The combined boot test uses an injected DNS outage to exercise a real scheduled
retained-proof transition and a controlled native TLS relay to observe the
boot-bound SMTP adapter. It also observes one shared listener stop and no
background failure. It is a composition proof; route-level token consumption,
invitation refusal and DNS/SMTP cleanup details remain covered by their focused
source suites. It does not claim live ownership or inbox delivery.
