import { runComposedImageScenario } from '../../scripts/connected-composed-image-scenario';

const unix = process.argv.at(2);
const selector = process.argv.at(3);
const inventoryPath = process.argv.at(4);
// Proof: omitting validation lost the malformed-input diagnosis in the external-driver negatives.
if (
  unix === undefined ||
  selector !== 'connected-composed' ||
  inventoryPath === undefined ||
  process.argv.length !== 5
)
  throw new Error('composed image test driver expects socket, connected-composed and inventory');
const callerId = process.env['HOSTNAME'];
// Proof: omitting hostname admission lost its specific refusal in the external-driver negative.
if (callerId === undefined || !/^[0-9a-f]{12}$/.test(callerId))
  throw new Error('composed image test driver requires a 12-hex Docker hostname');

await runComposedImageScenario({ unix, callerId, inventoryPath });
