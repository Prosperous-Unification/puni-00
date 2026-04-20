import { type Type, type } from 'arktype';

declare const brand: unique symbol;
export type Branded<Base, Tag extends string> = Base & { readonly [brand]: Tag };

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- Tag encodes nominal brand in call-site type inference; a follow-up will thread it into the return type once ArkType exposes a stable Type<Branded<...>>.
export function brandedString<Tag extends string>(_tag: Tag, constraints = 'string'): Type {
  return type(constraints);
}
