import { Label } from '@ui/saas-01';
import { useId } from 'react';

import type { PlanImportControl } from './use-plan-import';

/** One-attempt consent; current project settings permission is always checked by the server. */
export function PlanImportOptions({ control }: { control: PlanImportControl }): React.JSX.Element {
  const explanation = useId();
  return (
    <div className="px-2 py-1.5">
      <Label className="flex min-h-9 cursor-pointer items-center gap-2 max-md:min-h-11">
        <input
          type="checkbox"
          aria-describedby={explanation}
          checked={control.defineMissing}
          // Proof: permanently enabling this control exposed it without an
          // actual project (catalogue-browser-fault-choice-disabled-v1).
          disabled={control.busy || !control.canImport}
          onChange={(event) => {
            control.setDefineMissing(event.currentTarget.checked);
          }}
        />
        Define missing steps
      </Label>
      <p id={explanation} className="text-muted-foreground mt-1 text-xs">
        Creating steps and adding them to this project requires project settings permission.
      </p>
    </div>
  );
}
