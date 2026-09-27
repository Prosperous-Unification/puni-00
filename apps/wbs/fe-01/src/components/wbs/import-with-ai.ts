/**
 * Where the canonical Import with AI guide is published: `docs/import-with-ai.md` on `main` of
 * the public puni-00 repository. The in-app help links here rather than repeating the per-client
 * table, which changes whenever a vendor does.
 */
export const IMPORT_WITH_AI_GUIDE_URL =
  'https://github.com/Prosperous-Unification/puni-00/blob/main/docs/import-with-ai.md';

/**
 * The approved v1 import prompt, verbatim from the `guide-ai-project-imports` design.
 *
 * The guide carries the same text in its fenced `text` block; `import-with-ai-guide.test.ts`
 * fails when the two differ, so the copy button can never hand out a prompt the guide no longer
 * says. Bracketed fields are for the reader to fill in.
 */
export const IMPORT_WITH_AI_PROMPT = [
  'Import `[source project/link/files]` into a new WBS project named `[name]` using the WBS MCP tools.',
  '',
  'Confirm the destination WBS organization `[organization]` bound to my current MCP grant and my current WBS role. If it is wrong or cannot be verified, stop; switching organizations requires fresh MCP authorization.',
  '',
  'First inspect the available tool schemas and source material. Read the source without modifying it. Show a concise mapping preview naming the destination organization, my role, and covering hierarchy, project steps, estimates and units, dependencies, people, dates and source references. List unsupported or ambiguous fields; do not silently discard them or invent estimates.',
  '',
  'Use explicit day estimates only. Represent a single day estimate as equal optimistic/realistic/pessimistic values. Ask before converting hours or story points. Preserve unknown estimates as missing.',
  '',
  'After I approve the preview and the named destination organization, use `postApiProjectsImport` for a complete valid WBS plan document. Alternatively, create the project and steps, then use `postApiProjectsByIdCommands` with ordered commands, `ref`, `parentRef`, `afterRef`, `workItemRef` and `predecessorRef`. Use `postApiDirectoryCommands` only for directory entries actually needed.',
  '',
  'Respect request limits. Each command batch is atomic and one undo; multiple batches are not one transaction. Keep the returned ID mapping. After an uncertain timeout, read back before retrying to avoid duplicates.',
  '',
  'Finally read back the project, reconcile counts, hierarchy, estimates and dependencies, and report imported, omitted and unresolved records with the WBS project link.',
].join('\n');
