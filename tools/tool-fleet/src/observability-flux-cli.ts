import { join } from 'node:path';

import { type } from 'arktype';

import {
  bindObservabilitySource,
  FluxRefusal,
  readFluxInput,
  refuseFlux,
  validateFluxPacket,
} from './observability-flux';
import { observeFluxReconciliation } from './observability-flux-observation';

const Request = type({
  packetRequest: 'unknown',
  packetDirectory: 'string>0',
  source: 'unknown',
  'target?': 'unknown',
  '+': 'reject',
});
try {
  const [action, requestPath, receiptPath, ...extra] = process.argv.slice(2);
  if (!['bind', 'observe'].includes(action) || !requestPath || !receiptPath || extra.length)
    refuseFlux('arguments-refused');
  const tools = process.env['PUNI_PARITY_TOOLS'];
  if (tools === undefined) refuseFlux('pinned-tools-absent');
  const request = Request(await readFluxInput(requestPath));
  if (request instanceof type.errors) refuseFlux('request-malformed');
  const root = join(import.meta.dir, '../../..');
  const packet = await validateFluxPacket(
    root,
    tools,
    request.packetRequest,
    request.packetDirectory,
  );
  const binding = await bindObservabilitySource(
    packet,
    request.source,
    action === 'bind' ? receiptPath : `${receiptPath}.binding.json`,
  );
  const receipt =
    action === 'bind'
      ? binding
      : await observeFluxReconciliation(root, packet, binding, request.target, receiptPath);
  console.log(JSON.stringify(receipt));
} catch (failure) {
  // Proof: logging raw packet-read failure exposed PRIVATE-MARKER in the CLI path-privacy negative.
  console.error(
    `observability Flux: ${failure instanceof FluxRefusal ? failure.message : 'validation-refused'}`,
  );
  process.exitCode = 1;
}
