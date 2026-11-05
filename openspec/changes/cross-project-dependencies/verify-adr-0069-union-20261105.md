# Subsequent ADR0069 collision after the ef860 main union

PR863 run41969919400 workspace job127055663164 failed the unchanged
`adr-index.test.ts` and dependent actual-document-target controls. Root inspected
the complete uploaded workspace artifact13390822928 (ZIP SHA256
`73b06cb0c521f942341f426a34b9f6ef5d8cad2300d80ec9196657181261fd8b`;
full log SHA256
`a4916bd2bff015a153794bb7dc3880b1a944c5bc2368194337e0a6b361ae90f0`).
Main's new PostgreSQL ADR0069 collides with the feature monotone-activation ADR.
The earlier0066–0068 repair remains correct for its own baseline and is not
rewritten as if it covered this later main union.

Root reproduced the existing ADR-index test against d8f9c6837 with controlled
Bun1.4.4, no env files, empty Bun config and scratch preload:0pass/1fail,
1assertion, duplicate69 and missing74. No guard, expected census or decision
was changed. The mechanical repair renames only the feature ADR0069 to0074
and repairs live Markdown navigation links. The renamed ADR bytes remain
exactly identical, SHA256 `625ed0aa14d3fdc19a0cfe2409d47737a83af755cd6082d6a0ed18c9bf167b55`.
Main's PostgreSQL ADR is unchanged. Current proposal/design labels follow0074;
dated historical verification labels retain the number used at execution, with
links repaired to the current file. Historical patches and raw evidence remain
unchanged. This is a documentation identity repair, not architecture adoption.

The after-fix existing consumer and committed-tree document-target integration
results will be recorded only after their original execution completes.

## Committed-tree verification

Against committed086ecab09, the unchanged ADR-index and full actual-document-
target test files completed7pass/0fail/41assertions in73.49s. All six target
controls ran, including actual configured target success and local-link, ADR,
retired-root and root-payload negative cases. Original session13705 exited0
and scratch teardown returned. The60-second case annotations were preserved;
CLI default remained10000ms. This is the repaired committed tree, not a pass
inferred from the working-copy index. Normal commit hooks and the current
document/index checker passed. Broader CI remains independently required.
