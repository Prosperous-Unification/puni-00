const clientPath = '/usr/local/libexec/puni-registry-maintenance/crane';
const clientPins = {
  x64: '8e75c326adb43b053cfd78b9b987663f8f4fe4557f4d3915905643f25c730992',
  arm64: '1799f559c299f068951822a5efe6689ebab6974f2054d5562e60798fa9db6a55',
} as const;
export function selectRegistryClientArtifact(): { readonly path: string; readonly sha256: string } {
  if (process.arch === 'x64') return { path: clientPath, sha256: clientPins.x64 };
  if (process.arch === 'arm64') return { path: clientPath, sha256: clientPins.arm64 };
  throw new Error('Unsupported fixed registry client architecture');
}
