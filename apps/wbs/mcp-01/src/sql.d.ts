// store-migrations.ts imports each paired migration as text so `bun build` inlines it and the
// running process never reads SQL from a path the bundle does not ship.
declare module '*.sql' {
  const text: string;
  export default text;
}
