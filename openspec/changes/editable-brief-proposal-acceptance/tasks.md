# Tasks

- [x] 1.1 Build card: save on blur, saved and refused lines, privacy line, pending label. Tests in
      `conversation-harness.test.tsx`; negatives: drop `onBlur`, show saved regardless, delete the
      privacy line.
- [x] 1.2 API: storage failure during submission and operator sign-in without a password
      (`server.test.ts`); negatives: swallow the store error, delete the unconfigured guard.
- [x] 1.3 Manual brief: no "previous submission" notice for the request just refused; operator
      inbox keeps the brief's line breaks.
- [x] 1.4 Browser acceptance `browser/proposal-flow.mjs` at four widths; screenshots reviewed.
