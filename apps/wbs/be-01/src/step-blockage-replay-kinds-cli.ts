import { STEP_BLOCKAGE_REPLAY_CAPABILITIES } from '@wbs/core/service/replay-capabilities';

// Proof: poisoning @wbs/core's barrel fails the CLI subprocess regression before this leaf import.
console.log(JSON.stringify([...STEP_BLOCKAGE_REPLAY_CAPABILITIES, 'step_blockage_activation_v1']));
