import { basename, dirname } from 'node:path';

import type { BundleFile } from './deploy-contract';
import {
  SOLVER_SUPERVISOR_BUN_VERSIONS,
  SOLVER_SUPERVISOR_SERVICE,
} from './solver-supervisor-install-contract';

export function quoteInstallShell(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

/**
 * Immutable expected identities retained even when transport acknowledgement is lost.
 * Proof: omitting attempt/hash evidence failed all five generated publication-failure negatives.
 */
export function describeSolverSupervisorInstallEvidence(
  files: readonly BundleFile[],
  hashes: readonly string[],
  staging: string,
): string {
  return `attempt=${staging}; expected SHA-256: ${files.map((file, index) => `${hashes[index]}  ${file.remote}`).join('; ')}`;
}

/**
 * Generates the one host publication interval. Local mode requires FD3 from
 * the validated Bun launcher; remote mode opens canonical edge.lock itself.
 * Hashes are immutable invocation evidence, never recomputed after transport.
 * Private destination siblings are verified before any renameSync publication;
 * its rename(2) boundary never recovers EXDEV with copying. The transport Bun
 * stays available until cleanup, even after the installed runtime is replaced.
 * A failed interval requires manual inspection.
 */
export function buildSolverSupervisorInstallOperation(
  files: readonly BundleFile[],
  hashes: readonly string[],
  staging: string,
  socketPath: string,
  local: boolean,
): string {
  const quote = quoteInstallShell;
  const staged = files.map((_, index) => `${staging}/${String(index)}`);
  const siblingDirectories = files.map(
    (file, index) => `${dirname(file.remote)}/.solver-${basename(staging)}-${String(index)}`,
  );
  const siblings = siblingDirectories.map((directory) => `${directory}/payload`);
  // Proof: removing private config-parent mode failed the first-install mode assertion.
  const parentModes = new Map<string, '0700' | '0755'>();
  for (const [index, file] of files.entries()) {
    const parent = dirname(file.remote);
    parentModes.set(parent, index === 2 || parentModes.get(parent) === '0700' ? '0700' : '0755');
  }
  // Proof: replacing renameSync with copying, or publishing transport paths, failed real cross-device inode preservation.
  const rename =
    'import { renameSync } from "node:fs"; renameSync(process.argv[1], process.argv[2]);';
  const state = local ? '"$WBS_EDGE_STATE"' : quote('/home/puni1/wbs/state');
  const lock = `${state}/edge.lock`;
  const checkHashes = (paths: readonly string[]) =>
    paths
      .map(
        (path, index) =>
          `printf '%s  %s\\n' ${quote(hashes[index])} ${quote(path)} | sha256sum -c -`,
      )
      .join('\n');
  return `set -eu
installation_evidence=${quote(describeSolverSupervisorInstallEvidence(files, hashes, staging))}
publishing=0
${siblingDirectories.map((_, index) => `sibling_${String(index)}=''`).join('\n')}
# Proof: cleanup failure cannot report success; collision cleanup must preserve uncreated sibling directories.
trap 'status=$?; if [ "$status" -ne 0 ]; then printf "%s\\n" "$installation_evidence" >&2; fi; if [ "$status" -ne 0 ] && [ "$publishing" -eq 1 ]; then printf "%s\\n" "partial or uncertain solver supervisor installation; inspect all four installed hashes and service readiness under edge.lock before retry; no automatic rollback" >&2; fi; cleanup_failed=0; for owned in ${siblingDirectories.map((_, index) => `"$sibling_${String(index)}"`).join(' ')} ${quote(staging)}; do if [ -n "$owned" ]; then if ! rm -rf -- "$owned"; then printf "%s\\n" "failed to remove invocation staging: $owned" >&2; cleanup_failed=1; fi; fi; done; if [ "$cleanup_failed" -ne 0 ]; then printf "%s\\n" "$installation_evidence" "partial or uncertain solver supervisor staging cleanup; inspect invocation-owned paths before retry" >&2; if [ "$status" -eq 0 ]; then status=1; fi; fi; exit "$status"' EXIT
# Proof: omitting each directory/symlink/regular-file guard independently failed its named generated-shell negative.
if [ ! -d ${state} ]; then echo 'invalid canonical edge state: expected directory' >&2; exit 1; fi
if [ -L ${state} ]; then echo 'invalid canonical edge state: symlink' >&2; exit 1; fi
if [ ! -f ${lock} ]; then echo 'invalid canonical edge lock: expected regular file' >&2; exit 1; fi
if [ -L ${lock} ]; then echo 'invalid canonical edge lock: symlink' >&2; exit 1; fi
# Proof: omitting readability admitted a genuine inherited lock made unreadable after acquisition.
if [ ! -r ${lock} ]; then echo 'invalid canonical edge lock: unreadable' >&2; exit 1; fi
${
  local
    ? `# The Bun boundary verifies the inherited open description and maps it to FD3.
# Proof: omitting comparison admitted shell-foreign FD3; separate assignments refuse broken stat instead of comparing two empty strings.
inherited_identity=$(stat -Lc '%d:%i' /proc/self/fd/3)
canonical_identity=$(stat -Lc '%d:%i' ${lock})
test "$inherited_identity" = "$canonical_identity"`
    : `exec 9< ${lock}
# Proof: omitting flock let the real mv/hash/service competitors take edge.lock.
flock -n 9`
}
for marker in edge-owner.json edge-owner.pending; do
  # Proof: replacing this listing with absence admitted execute-only trusted state.
  retained=$(find ${state} -mindepth 1 -maxdepth 1 -name "$marker" -print)
  # Proof: omitting refusal admitted all eight retained marker shapes.
  if [ -n "$retained" ]; then printf '%s\\n' "shared edge owner admission closed: $marker; no activation" >&2; exit 1; fi
done
# Proof: omitting staged hashes admitted corrupted config bytes in the generated operation.
${checkHashes(staged)}
# Proof: omitting version refusal admitted a correctly hashed unsupported staged runtime.
case "$(${quote(staged[0])} --version)" in
  ${SOLVER_SUPERVISOR_BUN_VERSIONS.map(quote).join('|')}) ;;
  *) printf '%s\\n' 'staged solver Bun runtime is not supported' >&2; exit 1 ;;
esac
# Proof: installer-policy omission published despite policy refusal; solver-supervisor-install-operation.test.ts exited 1.
# Explicit first adoption initializes policy separately; normal installation only reads it.
WBS_EDGE_STATE=${state} ${quote(staged[0])} ${quote(staged[1])} --check-edge-policy
# Proof: unlocking before first-install parent creation failed its real lock competitor.
# Destination parents are first-install mutations and belong inside edge admission.
${[...parentModes].map(([parent, mode]) => `install -d -m ${mode} -- ${quote(parent)}`).join('\n')}
# Proof: recording a sibling before successful mkdir removed another attempt's retained directory.
# Proof: changing sibling mkdir to 0755 failed the copy privacy control.
# Track only successfully created directories; a collision must not remove another attempt's paths.
${siblingDirectories.map((directory, index) => `mkdir -m 0700 -- ${quote(directory)}\nsibling_${String(index)}=${quote(directory)}\ncp -- ${quote(staged[index])} ${quote(siblings[index])}`).join('\n')}
# Proof: independently omitting each chmod failed exact installed modes; staged unit starts at 0600.
chmod 0755 -- ${quote(siblings[0])} ${quote(siblings[1])}
chmod 0600 -- ${quote(siblings[2])}
chmod 0644 -- ${quote(siblings[3])}
# Proof: omitting sibling hashes or inserting an early rename admitted corruption or changed original bytes before refusal.
# Every destination-local copy must be verified before the first final rename.
${checkHashes(siblings)}
# Proof: omitting sibling runtime refusal admitted the path-dependent unsupported sibling runtime.
case "$(${quote(siblings[0])} --version)" in
  ${SOLVER_SUPERVISOR_BUN_VERSIONS.map(quote).join('|')}) ;;
  *) printf '%s\\n' 'sibling solver Bun runtime is not supported' >&2; exit 1 ;;
esac
publishing=1
# node:fs renameSync is rename(2), with no cross-device copy/unlink recovery.
${files.map((file, index) => `${quote(staged[0])} -e ${quote(rename)} -- ${quote(siblings[index])} ${quote(file.remote)}`).join('\n')}
# Proof: omitting readback admitted post-rename corruption.
${checkHashes(files.map((file) => file.remote))}
systemctl --user daemon-reload
systemctl --user enable ${SOLVER_SUPERVISOR_SERVICE}
systemctl --user restart ${SOLVER_SUPERVISOR_SERVICE}
solver_probe=0
# Proof: omitting socket readiness admitted no-socket; shortening the bound failed the 40-probe service negative.
until systemctl --user is-active --quiet ${SOLVER_SUPERVISOR_SERVICE} && test -S ${quote(socketPath)}; do
  solver_probe=$((solver_probe + 1))
  if [ "$solver_probe" -ge 40 ]; then printf '%s\\n' 'solver supervisor service/socket did not become ready' >&2; exit 1; fi
  sleep 0.25
done
publishing=0`;
}
