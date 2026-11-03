/** Minimal test-only browser API; jsdom ships no TypeScript declarations. */
declare module 'jsdom' {
  export const CookieJar: new () => object;
  export class JSDOM {
    constructor(html: string, options?: { url?: string; referrer?: string; cookieJar?: object });
    readonly window: Window & typeof globalThis;
  }
}
