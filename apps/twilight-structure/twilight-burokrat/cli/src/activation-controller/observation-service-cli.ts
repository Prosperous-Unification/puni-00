import { reportObservationServiceDiagnostic, runObservationService } from './observation-service';

const configurationPath = process.argv.at(2);
if (configurationPath === undefined || process.argv.length !== 3) {
  reportObservationServiceDiagnostic({
    kind: 'observation-service-failure',
    code: 'service-config-invalid',
    action: 'inspect protected observation service configuration',
  });
  process.exit(64);
}
process.exit(await runObservationService(configurationPath));
