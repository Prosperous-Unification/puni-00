import { preflightRuntime, renderObserverUnits } from './runtime';

const arguments_ = Bun.argv.slice(2);
const operation = arguments_.at(0),
  directory = arguments_.at(1),
  remaining = arguments_.slice(2);
if (remaining.length > 0) throw new Error('Unexpected runtime arguments');
if (operation === 'units' && directory === undefined)
  console.log(JSON.stringify(renderObserverUnits(), null, 2));
else if (operation === 'preflight' && directory !== undefined)
  console.log(JSON.stringify(await preflightRuntime(directory), null, 2));
else
  throw new Error(
    'Required: runtime-cli.ts units | preflight <local-reviewed-candidate-directory>',
  );
