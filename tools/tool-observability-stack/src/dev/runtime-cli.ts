import { runHistoryCli } from './history-cli';
import { preflightRuntime, renderObserverUnits } from './runtime';

const arguments_ = Bun.argv.slice(2);
if (arguments_[0] === 'history-capture' || arguments_[0] === 'history-verify') {
  await runHistoryCli(arguments_);
} else {
  const operation = arguments_.at(0),
    operand = arguments_.at(1),
    remaining = arguments_.slice(2);
  // Proof: slicing past one extra units argument made Task75 CLI's extra-argument negative fail.
  if (remaining.length > 0) throw new Error('Unexpected runtime arguments');
  if (operation === 'units') console.log(JSON.stringify(renderObserverUnits(operand), null, 2));
  else if (operation === 'preflight' && operand !== undefined)
    console.log(JSON.stringify(await preflightRuntime(operand), null, 2));
  else
    throw new Error(
      'Required: runtime-cli.ts units [full-source-revision] | preflight <local-reviewed-candidate-directory>',
    );
}
