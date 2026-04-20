import { errors as joseErrors, jwtVerify } from 'jose';

export interface JwtVerifierOptions {
  current: Uint8Array;
  previous?: Uint8Array;
}

export interface JwtClaims {
  sub: string;
  [k: string]: unknown;
}

export class JwtVerifier {
  constructor(private readonly opts: JwtVerifierOptions) {}

  async verify(token: string): Promise<JwtClaims> {
    try {
      const { payload } = await jwtVerify(token, this.opts.current);
      return payload as JwtClaims;
    } catch (err) {
      if (err instanceof joseErrors.JWSSignatureVerificationFailed && this.opts.previous) {
        const { payload } = await jwtVerify(token, this.opts.previous);
        return payload as JwtClaims;
      }
      throw err;
    }
  }
}
