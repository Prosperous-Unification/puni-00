export interface DaggerArgSpec {
  flags?: Record<string, string | number | boolean>;
  positional?: string[];
}

export function daggerArgs(spec: DaggerArgSpec): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(spec.flags ?? {})) {
    if (typeof v === 'boolean') {
      if (v) out.push(`--${k}`);
    } else {
      out.push(`--${k}`, String(v));
    }
  }
  for (const p of spec.positional ?? []) out.push(p);
  return out;
}
