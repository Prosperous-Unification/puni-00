import {
  ObservabilityPreflightRefusal,
  runObservabilityPreflight,
} from './observability-preflight';

try {
  await runObservabilityPreflight(process.argv.slice(2));
} catch (failure) {
  // Proof: forwarding the transport failure failed `transport errors cannot forward credential-bearing input or error causes`.
  console.error(
    failure instanceof ObservabilityPreflightRefusal
      ? failure.message
      : 'observability preflight: required-input-unavailable',
  );
  process.exit(1);
}
