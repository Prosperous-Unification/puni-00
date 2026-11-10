const pathFailureCodes: ReadonlySet<unknown> = new Set([
  // Proof: filesystem-code-ENOENT; `current lint activation selection > refuses a configured dangling root symlink at its final component` fails with this injected fault and passes after restoration.
  'ENOENT',
  // Proof: filesystem-code-EACCES; `refuses unreadable configured authority selected.json without optional absence` fails with this injected fault and passes after restoration.
  'EACCES',
  // Proof: filesystem-code-EPERM; `models the configured read boundary filesystem failure EPERM` fails with this injected fault and passes after restoration.
  'EPERM',
  // Proof: filesystem-code-EISDIR; `models the configured read boundary filesystem failure EISDIR` fails with this injected fault and passes after restoration.
  'EISDIR',
  // Proof: filesystem-code-ENOTDIR; `models the configured read boundary filesystem failure ENOTDIR` fails with this injected fault and passes after restoration.
  'ENOTDIR',
  // Proof: filesystem-code-ELOOP; `models the configured read boundary filesystem failure ELOOP` fails with this injected fault and passes after restoration.
  'ELOOP',
  // Proof: filesystem-code-EEXIST; `models the configured read boundary filesystem failure EEXIST` fails with this injected fault and passes after restoration.
  'EEXIST',
  // Proof: filesystem-code-ENAMETOOLONG; `models the configured read boundary filesystem failure ENAMETOOLONG` fails with this injected fault and passes after restoration.
  'ENAMETOOLONG',
]);

/** Classify modeled path/access failures without relabeling internal errors or host resource exhaustion. */
export function isFilesystemFailure(cause: unknown): boolean {
  // Proof: filesystem-error-boundary; `preserves an unmodeled filesystem dependency failure {"code":"EACCES"}` fails with this injected fault and passes after restoration.
  return cause instanceof Error && 'code' in cause && pathFailureCodes.has(cause.code);
}
