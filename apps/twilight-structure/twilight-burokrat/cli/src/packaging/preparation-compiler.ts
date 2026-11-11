import { hashBytes } from '../evidence/content-manifest';
import { compilerUpstreamIdentity, replaceCompilerSection } from './compiler-derivative';

const loaderSource =
  '      require: (baseDir, moduleName) => {\n        try {\n          const modulePath = resolveJSModule(moduleName, baseDir, nodeSystem);\n          return { module: require(modulePath), modulePath, error: void 0 };\n        } catch (error2) {\n          return { module: void 0, modulePath: void 0, error: error2 };\n        }\n      }';
// Proof: c26-compiler-loader-policy; injected fault failed `preserves normal compiler use while refusing the actual plugin loader before execution`; the same named test(s) passed after restoration.
const disabledLoader =
  '      require: (_baseDir, _moduleName) => ({\n        module: void 0,\n        modulePath: void 0,\n        error: new Error("PUNI language-service plugin loading disabled")\n      })';
const outputIdentity = 'c5929df1a9242faa483917053cc8c08b1b9cb0e15fb630bd9eb6565488808874';
const licenseIdentity = 'a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47';
const upstreamNoticeIdentity = '1af3c68039c57e539422da82a4faada506ce6d0ea6f90e0b699d02dbcdb7a90c';
const modificationNotice =
  '\nTypeScript 6.0.3, Copyright Microsoft Corporation. Apache License 2.0.\nModified by Prosperous Unification: language-service plugin loading disabled before resolution in preparation-built providers.\n';

export interface PreparationCompiler {
  readonly source: string;
  readonly manifest: {
    readonly kind: 'language-service-plugins-disabled';
    readonly upstream: string;
    readonly output: string;
    readonly license: string;
    readonly notice: string;
  };
  readonly license: Uint8Array;
  readonly notice: Uint8Array;
}

/**
 * Preserve PUNI's createProgram/bounded-host contract while removing the unused generic
 * language-service loader before either filesystem resolution or module execution. The exact
 * site census and all pinned byte identities are checked before any output is returned. This
 * separate preparation derivative leaves installed bytes and the historical paths-observation
 * derivative unchanged. Callers must deliver both returned license and combined notice.
 */
export function prepareCompiler(
  upstream: string,
  license: Uint8Array,
  notice: Uint8Array,
): PreparationCompiler {
  const source = replaceCompilerSection(upstream, loaderSource, disabledLoader);
  // Proof: c26-compiler-upstream; injected fault failed `refuses changed compiler upstream bytes`; the same named test(s) passed after restoration.
  if (hashBytes(upstream) !== compilerUpstreamIdentity)
    throw new Error('preparation compiler upstream identity differs');
  // Proof: c26-compiler-output; injected fault failed `refuses a broken transform dependency before returning compiler bytes`; the same named test(s) passed after restoration.
  if (hashBytes(source) !== outputIdentity)
    throw new Error('preparation compiler output identity differs');
  // Proof: c26-compiler-license; injected fault failed `refuses changed compiler license bytes`; the same named test(s) passed after restoration.
  if (hashBytes(license) !== licenseIdentity)
    throw new Error('preparation compiler license identity differs');
  // Proof: c26-compiler-notice; injected fault failed `refuses changed compiler notice bytes`; the same named test(s) passed after restoration.
  if (hashBytes(notice) !== upstreamNoticeIdentity)
    throw new Error('preparation compiler notice identity differs');
  const combinedNotice = Buffer.concat([notice, Buffer.from(modificationNotice)]);
  return {
    source,
    manifest: {
      kind: 'language-service-plugins-disabled',
      upstream: compilerUpstreamIdentity,
      output: outputIdentity,
      license: licenseIdentity,
      notice: hashBytes(combinedNotice),
    },
    license: license.slice(),
    notice: combinedNotice,
  };
}
