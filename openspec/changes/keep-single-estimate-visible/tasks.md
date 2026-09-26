## 1. Flip the flat-trio oracle first

- [x] 1.1 Change the existing says a flat trio once assertion at plan-estimates.test.tsx:934 to require visible input text and no duplicate final span. Add a parent roll-up assertion. Watch both fail before changing rendering.
- [x] 1.2 Update folded estimate rendering to keep equal shorthand and roll-up text visible and suppress only the duplicate final span. Preserve focus, refused input and distinct-result presentation.
- [x] 1.3 Run focused component and browser checks; inject a transparent-text or duplicate-span fault, watch the matching test fail, restore, and place an adjacent Proof: comment on the production check.

## 2. Verify the packet

- [x] 2.1 Run focused tests, format, lint, typecheck, OpenSpec validation and the applicable host gate. Record commands, outcomes, skipped checks and witnessed R5 proofs in verify.md.
