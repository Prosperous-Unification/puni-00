declare const credentialBrand: unique symbol;

/**
 * An account's bearer token, as a session runtime is built from it: an adapter
 * input for the session's clients and nothing else.
 *
 * Branded so that the architecture check can follow it by type — a string is a
 * string, but a member or a value typed `Credential` in delivery is a route the
 * check refuses (`src/delivery-boundaries.test.ts`). Empty for an identity
 * restored from the access cookie, which a same-origin request carries by
 * itself.
 */
export type Credential = string & { readonly [credentialBrand]: 'credential' };

/**
 * Names the token a login answered, or the empty one of a restored identity, as
 * the credential it is.
 */
export function credentialOf(token: string): Credential {
  // Cast: the token is the login reply's, validated by its route contract where
  // `lib/api.ts` receives it; the brand adds no claim about its contents.
  return token as Credential;
}
