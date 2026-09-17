import { join } from 'node:path';

import { runVmLab } from '../../tools/tool-fleet/src/lab';

await runVmLab(process.argv.slice(2), join(import.meta.dir, '../..'));
