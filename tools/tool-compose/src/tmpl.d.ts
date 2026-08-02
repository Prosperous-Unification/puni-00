// `index.ts` imports `.tmpl` files as raw text with `with { type: 'text' }`
// (Bun inlines them at bundle time). TypeScript has no built-in type for a
// `*.tmpl` module, so this declares one.
declare module '*.tmpl' {
  const content: string;
  export default content;
}
