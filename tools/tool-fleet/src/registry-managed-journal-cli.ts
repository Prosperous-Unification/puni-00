import { captureRegistryPressureAlert, readRegistryAlertContext } from './registry-alert-store';
import { createRegistryAuthorityPorts } from './registry-authority-host';
import { registryRenewalSeconds } from './registry-capacity';
import { verifyRegistryClientInstallation } from './registry-client-installation';
import { readTrustedEnrollment } from './registry-enrollment';
import {
  parseRegistryMaintenanceInstallation,
  readRegistryMaintenanceInstallation,
} from './registry-maintenance-installation';
import { executeRegistryCommand, type RegistryJournalPorts } from './registry-managed-journal';
import type { RegistryPressureDelivery } from './registry-pressure-report';
import {
  createRegistryPressureReporter,
  readRegistryPressureIdentity,
  registryPressureDirectory,
  type RegistryPressureIdentity,
} from './registry-pressure-report';

/** Read at most 64 KiB from the authenticated SSH command's stdin before parsing any request. */
async function readRequest(): Promise<unknown> {
  const reader = Bun.stdin.stream().getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      // Proof: oversized stdin command negative fails if this streaming bound is removed.
      if (bytes > 64 * 1024) throw new Error('Registry request exceeds read bound');
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * Owner-only host CLI, invoked over authenticated SSH with one journal directory argument and
 * JSON stdin. Paths and limits come from explicit trusted enrollment, never capacity claims in
 * ordinary requests. Installer-only --validate-installation checks a trusted candidate's schema
 * without opening a journal or loading host ports. --validate-client-installation additionally
 * verifies fixed tools and the physical client profile, still without journal effects or grants.
 * Neither mode establishes live runtime readiness. statfs measures real filesystems; verified mount identity is added by the
 * storage adapter. No command starts an upload, deletes content or changes a live service.
 */
async function main(): Promise<void> {
  const validation = process.argv.at(2);
  if (validation === '--validate-installation' || validation === '--validate-client-installation') {
    const path = process.argv.at(3);
    // Proof: removing the argument-count check fails the additional-arguments CLI test before trusted state can be opened.
    if (process.argv.length !== 4 || path === undefined)
      throw new Error(
        'Usage: registry-managed-journal-cli.ts ' + validation + ' <trusted-candidate>',
      );
    const installed = parseRegistryMaintenanceInstallation(await readTrustedEnrollment(path));
    // Proof: omitting this call makes the actual h4 changed-worker negative accept schema-only verification.
    if (validation === '--validate-client-installation')
      await verifyRegistryClientInstallation(installed);
    process.stdout.write('verified\n');
    return;
  }
  const directory = process.argv.at(2);
  // Proof: --locked CLI negative fails if unknown arguments can bypass this boundary.
  const monitor = process.argv.at(3) === '--monitor';
  if (
    directory === undefined ||
    (process.argv.length !== 3 && !(monitor && process.argv.length === 4))
  )
    throw new Error('Usage: registry-managed-journal-cli.ts <owner-only-journal-directory>');
  if (monitor) {
    const installed = await readRegistryMaintenanceInstallation();
    if (directory !== installed.journalPath)
      throw new Error('Authority directory differs from fixed canonical journal');
    // Proof: removing this production dispatch fails the staged wiring contract; the ordinary process test also runs this same ten-second monitor loop.
    const alerts = await readRegistryAlertContext();
    await monitorRegistryPressure(
      directory,
      createRegistryAuthorityPorts(installed),
      registryPressureDirectory,
      await readRegistryPressureIdentity(installed.machineId),
      { state: 'required', capture: (report) => captureRegistryPressureAlert(alerts, report) },
    );
  }
  const request = await readRequest();
  let ports: ReturnType<typeof createRegistryAuthorityPorts> | undefined;
  const loadPorts = async () => {
    if (ports !== undefined) return ports;
    const installed = await readRegistryMaintenanceInstallation();
    if (directory !== installed.journalPath)
      throw new Error('Authority directory differs from fixed canonical journal');
    ports = createRegistryAuthorityPorts(installed);
    return ports;
  };
  const response = await executeRegistryCommand(directory, request, loadPorts);
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

/** Existing ten-second authority renewal owns each actual check. The volatile report is written after command completion; report failures escape and cannot fabricate permission or notification success. */
export async function monitorRegistryPressure(
  directory: string,
  ports: RegistryJournalPorts,
  reports: string,
  identity: RegistryPressureIdentity,
  delivery: RegistryPressureDelivery,
): Promise<never> {
  const report = createRegistryPressureReporter(identity, delivery);
  for (;;) {
    const response = await report(directory, ports, reports);
    process.stdout.write(
      `${JSON.stringify({ revision: response.state.revision, fenced: response.state.fenced, reason: response.state.fenceReason })}\n`,
    );
    await Bun.sleep(registryRenewalSeconds * 1000);
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (cause) {
    console.error(cause);
    process.exitCode = 1;
  }
}
