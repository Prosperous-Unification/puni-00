import type { ApiModelClass, SelectedActivity } from '@twilight-burokrat/contracts';
import type { createProviderRegistry, ToolSet } from 'ai';

import { assertInteger } from '../runs/record-codecs';

export type ApiModelRegistry = Pick<ReturnType<typeof createProviderRegistry>, 'languageModel'>;
export type ApiModel = ReturnType<ApiModelRegistry['languageModel']>;

/** Concrete caller-supplied capabilities and retained instructions; static selection grants no spending authority. */
export interface ApiModelSettings {
  readonly selection: SelectedActivity;
  readonly model: ApiModel;
  readonly instructions: string;
  readonly tools: ToolSet;
  readonly maxSteps: number;
  readonly maxOutputTokens: number;
}

/**
 * Composes accepted API settings with explicit local model/tool capabilities without starting a model call.
 * @throws When selected settings or required capabilities are missing or corrupted. Original prompt byte hashes are retained, never recomputed from decoded text.
 */
export function resolveApiModelSettings(options: {
  selection: SelectedActivity;
  models: ApiModelRegistry;
  tools: ToolSet;
}): ApiModelSettings {
  const { selection, models, tools } = options;
  // Proof: guard removal accepted a trusted dependency fault changing the accepted API executor tag; the actual accepted tool selection also lost its named diagnostic.
  if (selection.settings.executor !== 'api-model') throw new Error('expected api-model selection');
  const settings: ApiModelClass = selection.settings;
  // Proof: removing retained text/path checks accepted corrupted SelectedActivity prompt fields in the settings boundary test.
  if (
    selection.prompt === null ||
    typeof selection.prompt.text !== 'string' ||
    selection.prompt.path !== settings.prompt
  )
    throw new Error('missing or corrupted accepted API prompt');
  // Proof: removing either limit check accepted its zero/unsafe value in the settings boundary test.
  assertInteger(settings.limits.maxSteps, 1);
  assertInteger(settings.limits.maxOutputTokens, 1);
  // Proof: copying supplied extras into this dictionary failed the exact selected-tool exposure test.
  const selectedTools: ToolSet = {};
  const capabilities: Readonly<Record<string, ToolSet[string] | null | undefined>> = tools;
  for (const name of settings.tools) {
    // Proof: bypassing own-property lookup admitted an inherited tool; removing absence/null rejection admitted a missing/null selected tool.
    const capability = Object.hasOwn(capabilities, name) ? capabilities[name] : undefined;
    if (capability === undefined || capability === null)
      throw new Error('missing selected tool capability');
    Object.defineProperty(selectedTools, name, { value: capability, enumerable: true });
  }
  return Object.freeze({
    selection,
    model: models.languageModel<string>(settings.model),
    instructions: selection.prompt.text,
    tools: Object.freeze(selectedTools),
    maxSteps: settings.limits.maxSteps,
    maxOutputTokens: settings.limits.maxOutputTokens,
  });
}
