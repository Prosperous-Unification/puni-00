import { buildGateway } from './composition';
import { loadConfig } from './config';

const cfg = loadConfig();
const app = buildGateway(cfg);
app.listen(cfg.PORT);
console.log(`gw-01 listening on ${String(cfg.PORT)}`);
