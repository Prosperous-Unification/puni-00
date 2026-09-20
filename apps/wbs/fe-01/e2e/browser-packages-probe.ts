import { createRedactionPolicy, defineException, toReports } from 'application-exception';
import { makeCorj } from 'caught-object-report-json';
import { DiBag } from 'di-bag';

/**
 * What one run of the three libraries inside a browser produced.
 *
 * `reportVersion` may be undefined: corj declares a report's `v` optional, because a
 * compact report may omit fields, and the probe reports what it received rather than
 * asserting that away.
 */
export interface BrowserPackagesProof {
  readonly acquiredAt: number;
  readonly disposed: readonly string[];
  readonly correlated: boolean;
  readonly publicCode: string;
  readonly disclosesTheSecret: boolean;
  readonly reportVersion: string | undefined;
}

/** One options bag, built once, as the adoption plan's reporting contract requires. */
const REPORT_LIMITS = { maxReportSize: 32_768, maxDepth: 4, maxChildren: 16 } as const;

/** The one secret this probe owns, scrubbed wherever its text appears in either report. */
const redact = createRedactionPolicy({ patterns: [/probe-secret/g] });

const ProbeFailed = defineException({
  tag: 'probe/ProbeFailed',
  message: ({ step }: { step: string }) => `the probe failed at ${step}`,
  public: { code: 'PROBE_FAILED', message: 'The probe failed.' },
});

/**
 * Acquire an asynchronous service through the portable factory helpers, dispose it,
 * and report one typed failure twice.
 *
 * Every call here is one the adoption plan says browser code must be able to make:
 * `fromSyncFactory` and `fromAsyncFactory` fix the acquisition mode by name, so the
 * graph needs no `process.getBuiltinModule` classifier — a browser has none — and one
 * `toReports` call correlates the operator's report with the disclosed one under a
 * single occurrence identifier.
 *
 * @returns What the run observed, for an assertion made outside the page.
 */
async function proveTheThreeLibraries(): Promise<BrowserPackagesProof> {
  const disposed: string[] = [];
  const services = DiBag.createBuilder()
    .register({
      clock: DiBag.fromSyncFactory(() => ({ now: () => 1_726_800_000_000 })),
      session: DiBag.withDisposal(
        DiBag.fromAsyncFactory(async ({ clock }: { clock: { now: () => number } }) =>
          Promise.resolve({ at: clock.now() }),
        ),
        () => {
          disposed.push('session');
        },
      ),
    })
    .build();
  const session = await services.resolve('session');
  await services.close();

  const options = { corj: REPORT_LIMITS, redact } as const;
  const reports = toReports(new ProbeFailed({ details: { step: 'probe-secret' } }), {
    diagnostic: options,
    public: options,
  });

  return {
    acquiredAt: session.at,
    disposed,
    correlated: reports.diagnostic.occurrence_id === reports.public.occurrence_id,
    publicCode: reports.public.code,
    disclosesTheSecret: JSON.stringify(reports).includes('probe-secret'),
    reportVersion: makeCorj('a plain string', { maxReportSize: 1024 }).v,
  };
}

// The cast names the one boundary this file has: a bundled module and the page that
// loads it share nothing but this global, and `globalThis` is typed without it.
(
  globalThis as unknown as { browserPackagesProof: Promise<BrowserPackagesProof> }
).browserPackagesProof = proveTheThreeLibraries();
