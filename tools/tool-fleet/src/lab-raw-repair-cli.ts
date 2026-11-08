import { prepareRawRepair, RawRepairRefusal, settleFailedRepair } from './lab-raw-repair';

try {
  const arguments_ = process.argv.slice(2);
  const requestPath = arguments_.at(0);
  const requestDigest = arguments_.at(1);
  if (requestPath === undefined || requestDigest === undefined || arguments_.length !== 2) {
    throw new RawRepairRefusal('invalid-arguments');
  }
  if (requestPath === '--settle-failed-repair') {
    const reader = Bun.stdin.stream().getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.length;
        if (bytes >= 65536) throw new RawRepairRefusal('invalid-arguments');
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    const payload = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      payload.set(chunk, offset);
      offset += chunk.length;
    }
    await Bun.write(Bun.stdout, JSON.stringify(settleFailedRepair(payload, requestDigest)) + '\n');
  } else {
    await Bun.write(
      Bun.stdout,
      JSON.stringify(prepareRawRepair(requestPath, requestDigest)) + '\n',
    );
  }
} catch (failure) {
  // Proof: adjacent source CLI tests require literal diagnostics with forced/disabled terminal color.
  await Bun.write(
    Bun.stderr,
    (failure instanceof RawRepairRefusal ? failure.message : 'raw repair: producer-refused') + '\n',
  );
  process.exitCode = 1;
}
