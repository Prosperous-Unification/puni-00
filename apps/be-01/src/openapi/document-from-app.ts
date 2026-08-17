import { OPENAPI_SPEC_PATH } from './openapi-plugin';

/** Where the emitted document is committed, read by the writer and the test. */
export const OPENAPI_DOCUMENT_FILE = new URL('../../openapi.json', import.meta.url).pathname;

/**
 * The document, asked of a built app the way a client asks for it.
 *
 * Read over `app.handle` rather than by calling the plugin's generator: that is
 * the only route this change adds, and a check that reads the generator directly
 * would stay green with the route unmounted. Both callers — `emit-openapi-cli.ts` and
 * `openapi-document.test.ts` — go through here so the writer and the check cannot
 * disagree about what "the document" is.
 *
 * @throws if the route answers anything but 200, or answers something that is not
 * a JSON object. An empty document is the failure this whole change exists to
 * prevent, so it must not come back as one.
 */
export async function documentFromApp(app: {
  handle: (request: Request) => Promise<Response>;
}): Promise<Record<string, unknown>> {
  const res = await app.handle(new Request(`http://localhost${OPENAPI_SPEC_PATH}`));
  if (res.status !== 200) {
    throw new Error(
      `${OPENAPI_SPEC_PATH} answered ${String(res.status)}, so no document could be read`,
    );
  }
  const document: unknown = await res.json();
  if (typeof document !== 'object' || document === null || Array.isArray(document)) {
    throw new Error(`${OPENAPI_SPEC_PATH} answered something that is not a document object`);
  }
  return document as Record<string, unknown>;
}

/**
 * One serialisation, used by the writer and by the check.
 *
 * Two spaces and a trailing newline is what prettier writes for JSON, and
 * `nx format:check --all` reads this file — a document the writer emits in any
 * other shape fails the gate rather than the check it was written for.
 */
export function serialiseDocument(document: Record<string, unknown>): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
