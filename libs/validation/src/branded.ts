import { type, type Type } from 'arktype';

declare const brand: unique symbol;
export type Branded<Base, Tag extends string> = Base & { readonly [brand]: Tag };

export function brandedString<Tag extends string>(_tag: Tag, constraints = 'string'): Type {
  return type(constraints);
}
