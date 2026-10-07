/**
 * The slice of the `jsdom` API the component tests use; the package ships no types and
 * `@types/jsdom` is not a workspace dependency.
 */
declare module 'jsdom' {
  export class JSDOM {
    constructor(html: string, options?: { url?: string });
    readonly window: Window & typeof globalThis;
  }
}
