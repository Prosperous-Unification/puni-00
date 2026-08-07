import { type Type, type } from 'arktype';

declare const brand: unique symbol;
export type Branded<Base, Tag extends string> = Base & { readonly [brand]: Tag };

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- Tag encodes nominal brand in call-site type inference; a follow-up will thread it into the return type once ArkType exposes a stable Type<Branded<...>>.
export function brandedString<Tag extends string>(_tag: Tag, constraints = 'string'): Type {
  // ArkType's `type` is overloaded on string *literals* so it can infer the
  // parsed shape; a `string` known only at runtime matches none of them. The
  // cast is the boundary: this function's whole job is to take a constraint
  // expression a caller composed and hand back an opaque `Type`, and the
  // expression is validated by ArkType itself at the call.
  return type(constraints as 'string');
}
