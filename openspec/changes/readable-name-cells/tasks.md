## 1. Keep the Name cell readable

- [ ] 1.1 Reserve the notes marker's width in both the rendered name and source textarea when
      notes exist. Browser proof: a long name with notes in `e2e/name-markdown.spec.ts` measures
      the rendered and focused text faces against the marker at a narrow Name column width.
- [ ] 1.2 Strike and mute the number of a done work item without decorating its title, and keep
      the status explanation accurate. Browser proof: `e2e/status.spec.ts` reads the computed
      text decoration of the number and rendered title after choosing Done.

## 2. Verify the change

- [ ] 2.1 Run the focused browser proofs and record their output in `verify.md`.
- [ ] 2.2 Validate OpenSpec, format, and the required h2puni gate on the committed SHA; record
      each output in `verify.md`.
