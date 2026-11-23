import { join, resolve } from 'node:path';

import { runChecked } from './check-cli';
import { resolveController } from './check-provision';
import { readToolchain } from './contracts';

/**
 * Prints the docker reference of the locked fleet controller, resolved as `tool-fleet:check`
 * resolves it ({@link resolveController}): by manifest digest where the store keeps it, else by
 * the config digest the verified `dist/tool-fleet/controller.oci` names. infra-check.yml passes
 * it to `infra/ansible/tests/controller-run.sh`; an unresolvable image throws.
 */
const root = resolve(import.meta.dir, '../../..');
const toolchain = await readToolchain(join(root, 'infra/versions/toolchain.json'));
process.stdout.write(
  `${await resolveController(
    toolchain.controller.image,
    toolchain.controller.digest,
    join(root, 'dist/tool-fleet/controller.oci'),
    runChecked,
  )}\n`,
);
