import 'dns-packet';

declare module 'dns-packet' {
  export namespace name {
    function decode(bytes: Buffer, offset?: number): string;
    namespace decode {
      let bytes: number;
    }
    function encodingLength(value: string): number;
  }
  export namespace question {
    function encodingLength(value: Question): number;
  }
}
