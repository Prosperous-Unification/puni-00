import * as kit from './index';

/**
 * Whether a module export is a React component: a function (a plain
 * component, or Radix's `Dialog` root re-exported as `Modal`) or an exotic
 * component object (`forwardRef`), whose React tag is `$$typeof`.
 */
function isComponent(value: unknown): boolean {
  return (
    typeof value === 'function' ||
    (typeof value === 'object' && value !== null && '$$typeof' in value)
  );
}

/** One primitive the kit exports, with the parts named after it (`CardTitle` under `Card`). */
export interface Primitive {
  readonly name: string;
  readonly parts: readonly string[];
}

/**
 * The kit's primitives, read from what `./index` actually exports rather than
 * from a list that could go stale: every PascalCase component export, with
 * each one whose name extends another component's (`ModalContent`, `Modal`)
 * folded in as that one's part. `buttonVariants` and the `*_CLASS` constants
 * are not PascalCase and so are not primitives.
 */
export function listPrimitives(): readonly Primitive[] {
  const components = Object.entries(kit)
    .filter(([name, value]) => /^[A-Z][a-z]/.test(name) && isComponent(value))
    .map(([name]) => name)
    .sort();
  const parents = components.filter(
    (name) => !components.some((other) => other !== name && name.startsWith(other)),
  );
  return parents.map((name) => ({
    name,
    parts: components.filter((other) => other !== name && other.startsWith(name)),
  }));
}

/** A primitive's file stem: `Button` is `button`, as its source and story files are named. */
export function toFileStem(name: string): string {
  return name.replace(/(?<!^)([A-Z])/g, '-$1').toLowerCase();
}
