## Context

This is a dormant extraction from [PR #843](https://github.com/Prosperous-Unification/puni-00/pull/843), not activation of its storage lifecycle. The pure policy and paired tests come from `043f75f0e1e27bdd3e95c6a8d33e323e5e5135fc`; the journal, paired tests and CLI come from reviewed checkpoint `2b1119372ebe11327c22f8a90a8f7ec482cf0494`, before later capacity/privileged lifecycle coupling. The journal receipt comparison receives the later numeric chronology correction with new production-command regressions.

## Goals / Non-Goals

**Goals:** independently reviewable admission/retention decisions, crash-preserved obligations and bounded durable ownership records through one explicit command.

**Non-Goals:** automatic startup, installation, network service, publisher/deployer integration, physical capacity enforcement, verified deletion/backup/recovery or completion of the original rollout.

## Decisions

`registry-policy.ts` consumes unknown boundary input and returns typed admission/refusal or advisory plans without IO. `registry-journal.ts` validates command and canonical state, performs owner/mode checks, holds the kernel lock, and publishes atomic fsynced replacements. `registry-journal-cli.ts` is invoked explicitly with an owner-only directory and bounded JSON stdin. Existing source/test globs include these additions; no registration, dependency or target change is needed.

The current UID and controlled owner-only directory are the local trust boundary. Any authenticated transport remains the invoking operator's responsibility. The module neither authenticates a remote identity nor verifies a supplied path's physical mount isolation. A trusted caller can assert reconciliation and ordered phases; these records alone do not prove server uploads stopped, backups succeeded, content was verified or writers were excluded. Future operational integration must establish those independent boundaries before relying on them.

## Risks / Trade-offs

Schema version one is staged local state, not a replacement for later deployed schemas. Whole rollout files must not overwrite it without deliberate schema and trust-boundary integration. A command may commit before acknowledgement fails; callers must reread after ambiguous outcomes. Kernel flock support is limited to Linux and macOS. Pure plans trust a caller-supplied complete census and cannot establish freshness or deletion safety.

## Migration Plan

None: no caller or installed state is enrolled by this change. The original feature work and PR remain intact. Independent review, remote CI and a canonical exact-revision host gate precede merging this foundation.

## Open Questions

No unresolved decisions block this staged foundation. Physical integration remains in the separate original rollout.
