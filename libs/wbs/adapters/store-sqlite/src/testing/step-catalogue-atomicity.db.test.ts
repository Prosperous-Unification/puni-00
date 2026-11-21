import type { StepBound, StepDefinedAndBound } from '@wbs/core';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { expect, spyOn, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { SQLiteDialect } from 'drizzle-orm/sqlite-core';

import type { Drizzle } from '../db';
import { UserRepository } from '../user';
import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

type Attempt<Value> =
  { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly cause: unknown };
async function attempt<Value>(call: () => Value | Promise<Value>): Promise<Attempt<Value>> {
  try {
    return { ok: true, value: await call() };
  } catch (cause: unknown) {
    return { ok: false, cause };
  }
}

/** Exact footprint of these two methods plus persistent schema/full ledger; unrelated tables are not claimed by this oracle. */
function catalogueStorage(db: Drizzle) {
  return {
    definitions: db.all<Record<string, unknown>>(
      sql`SELECT * FROM step_definition ORDER BY id COLLATE BINARY`,
    ),
    bindings: db.all<Record<string, unknown>>(
      sql`SELECT * FROM step_binding ORDER BY id COLLATE BINARY`,
    ),
    values: db.all<Record<string, unknown>>(
      sql`SELECT * FROM work_package_step ORDER BY work_package_id COLLATE BINARY, step_id COLLATE BINARY`,
    ),
    ledger: db.all<Record<string, unknown>>(
      sql`SELECT * FROM __drizzle_migrations ORDER BY name COLLATE BINARY`,
    ),
    schema: db.all<Record<string, unknown>>(
      sql`SELECT type, name, tbl_name, rootpage, sql FROM sqlite_master ORDER BY type COLLATE BINARY, name COLLATE BINARY`,
    ),
  };
}

const TRIGGER = 'qa_catalogue_borrowed_abort';
const DIAGNOSTIC = 'qa catalogue borrowed explicit value refused';

for (const method of ['define', 'bind'] as const) {
  test(
    'sqlite catalogue borrowed ' +
      method +
      ' failure is atomic when its caller catches and commits an unrelated write',
    async () => {
      const fixture = await openSqliteStepCatalogueCase(
        'stepCatalogue.defineAndBindStep:project-empty-materialization',
      );
      const { source, seed } = fixture,
        db = source.db;
      const execution = await attempt(async () => {
        if (method === 'bind') {
          expect(
            (
              await source.stores.stepCatalogue.defineAndBindStep(
                seed.organizationId,
                {
                  id: 'failed-bind-definition',
                  code: 'bind-work',
                  name: 'Bind Work',
                  defaultEstimateUnit: 'workdays',
                  defaultAllowancePercent: 8.25,
                  position: 30,
                },
                {
                  bindingId: 'existing-sibling-binding',
                  scopeKind: 'project',
                  scopeId: seed.siblingProjectId,
                  workItemTypeId: null,
                  position: 10,
                },
                seed.stamp,
              )
            ).ok,
          ).toBe(true);
          expect(
            (
              await source.stores.stepCatalogue.readPackage(
                seed.organizationId,
                seed.siblingWorkPackageId,
              )
            )?.steps.map(({ stepId }) => stepId),
          ).toEqual(['failed-bind-definition']);
        }
        expect(
          (await source.stores.stepCatalogue.readPackage(seed.organizationId, seed.workPackageId))
            ?.steps,
        ).toEqual([]);
        const ledgerBefore = catalogueStorage(db).ledger;
        const expected = await source.uow.run(async ({ stores }) => {
          expect(
            (
              await stores.stepCatalogue.defineAndBindStep(
                seed.organizationId,
                {
                  id: 'outer-survivor',
                  code: 'outer-work',
                  name: 'Outer Work',
                  defaultEstimateUnit: 'minutes',
                  defaultAllowancePercent: 2.5,
                  position: 10,
                },
                {
                  bindingId: 'outer-project-binding',
                  scopeKind: 'project',
                  scopeId: seed.projectId,
                  workItemTypeId: null,
                  position: 5,
                },
                seed.stamp,
              )
            ).ok,
          ).toBe(true);
          expect(
            (
              await stores.stepCatalogue.readPackage(seed.organizationId, seed.workPackageId)
            )?.steps.map(({ stepId }) => stepId),
          ).toEqual(['outer-survivor']);
          const beforeFailure = catalogueStorage(db);
          const triggerSql =
            method === 'define'
              ? "CREATE TEMP TRIGGER qa_catalogue_borrowed_abort BEFORE INSERT ON main.work_package_step WHEN NEW.step_id='failed-define-definition' BEGIN SELECT RAISE(ABORT, 'qa catalogue borrowed explicit value refused'); END"
              : "CREATE TEMP TRIGGER qa_catalogue_borrowed_abort BEFORE INSERT ON main.work_package_step WHEN NEW.step_id='failed-bind-definition' BEGIN SELECT RAISE(ABORT, 'qa catalogue borrowed explicit value refused'); END";
          db.run(sql.raw(triggerSql));
          const armed = db
            .all<{ name: unknown; tableName: unknown; statement: unknown }>(
              sql`SELECT name, tbl_name AS tableName, sql AS statement FROM sqlite_temp_master WHERE name=${TRIGGER}`,
            )
            .at(0);
          expect(armed?.name).toBe(TRIGGER);
          expect(armed?.tableName).toBe('work_package_step');
          if (armed === undefined || typeof armed.statement !== 'string')
            throw new Error('actual catalogue fault trigger is absent');
          expect(armed.statement).toContain(DIAGNOSTIC);
          const rejected = await attempt<StepBound | StepDefinedAndBound>(() =>
            method === 'define'
              ? stores.stepCatalogue.defineAndBindStep(
                  seed.organizationId,
                  {
                    id: 'failed-define-definition',
                    code: 'failed-work',
                    name: 'Failed Work',
                    defaultEstimateUnit: 'workdays',
                    defaultAllowancePercent: 9.5,
                    position: 40,
                  },
                  {
                    bindingId: 'failed-project-binding',
                    scopeKind: 'project',
                    scopeId: seed.projectId,
                    workItemTypeId: null,
                    position: 20,
                  },
                  seed.stamp,
                )
              : stores.stepCatalogue.bindStep(
                  seed.organizationId,
                  {
                    bindingId: 'failed-project-binding',
                    scopeKind: 'project',
                    scopeId: seed.projectId,
                    stepId: 'failed-bind-definition',
                    workItemTypeId: null,
                    position: 20,
                  },
                  seed.stamp,
                ),
          );
          try {
            db.run(sql.raw('DROP TRIGGER temp.qa_catalogue_borrowed_abort'));
          } catch (cleanup: unknown) {
            if (!rejected.ok)
              throw new AggregateError(
                [rejected.cause, cleanup],
                'catalogue method and fault-trigger removal failed',
                { cause: cleanup },
              );
            throw cleanup;
          }
          expect(db.all(sql`SELECT name FROM sqlite_temp_master WHERE name=${TRIGGER}`)).toEqual(
            [],
          );
          expect(rejected.ok).toBe(false);
          if (rejected.ok) throw new Error('actual native catalogue failure resolved');
          expect(rejected.cause).toBeInstanceOf(Error);
          if (!(rejected.cause instanceof Error)) throw rejected.cause;
          const native: unknown = rejected.cause.cause;
          expect(native).toBeInstanceOf(Error);
          if (!(native instanceof Error)) throw native;
          expect(native.message).toBe(DIAGNOSTIC);
          return { commit: true, value: beforeFailure };
        });
        // The caller intentionally commits after catching the exact native failure.
        expect(db.all(sql`SELECT id, code FROM step_definition WHERE id='outer-survivor'`)).toEqual(
          [{ id: 'outer-survivor', code: 'outer-work' }],
        );
        expect(
          db.all(
            sql`SELECT step_id, estimate_unit, allowance_bps, allowance_revision FROM work_package_step WHERE step_id='outer-survivor'`,
          ),
        ).toEqual([
          {
            step_id: 'outer-survivor',
            estimate_unit: 'minutes',
            allowance_bps: 250,
            allowance_revision: 0,
          },
        ]);
        const after = catalogueStorage(db);
        expect(after.definitions).toEqual(expected.definitions);
        expect(after.bindings).toEqual(expected.bindings);
        expect(after.values).toEqual(expected.values);
        expect(after.ledger).toEqual(ledgerBefore);
        expect(after.schema).toEqual(expected.schema);
      });
      const closed = await attempt(() => fixture.close());
      if (!execution.ok) {
        if (!closed.ok)
          throw new AggregateError(
            [execution.cause, closed.cause],
            'catalogue atomicity assertion and actual fixture close failed',
            { cause: closed.cause },
          );
        throw execution.cause;
      }
      if (!closed.ok) throw closed.cause;
    },
  );
}

type CatalogueFixture = Awaited<ReturnType<typeof openSqliteStepCatalogueCase>>;

/** An unexpected manual recovery failure retains the real Source and its directory until process exit; it does not authorize reuse or claim permanent quarantine. */
const retainedRecoveryFixtures = new Set<CatalogueFixture>();

function defineRecoveryStep(fixture: CatalogueFixture, port: CatalogueFixture['port'], id: string) {
  return port.defineAndBindStep(
    fixture.seed.organizationId,
    {
      id,
      code: id,
      name: id,
      defaultEstimateUnit: 'minutes',
      defaultAllowancePercent: 2.5,
      position: 10,
    },
    {
      bindingId: id + '-binding',
      scopeKind: 'project',
      scopeId: fixture.seed.projectId,
      workItemTypeId: null,
      position: 10,
    },
    fixture.seed.stamp,
  );
}

function recoveryAggregate(cause: unknown): AggregateError {
  expect(cause).toBeInstanceOf(AggregateError);
  if (!(cause instanceof AggregateError)) throw cause;
  return cause;
}

const recoveryCases = [
  {
    name: 'rollback-to failure prevents caught-method commit and permits reuse after full rollback',
    cleanup: 'rollback',
    later: 'commit',
    outerFails: false,
  },
  {
    name: 'release failure prevents caught-method commit and permits reuse after full rollback',
    cleanup: 'release',
    later: 'commit',
    outerFails: false,
  },
  {
    name: 'retains recovery failure before a later callback Error',
    cleanup: 'rollback',
    later: 'error',
    outerFails: false,
  },
  {
    name: 'retains recovery failure before a later thrown undefined',
    cleanup: 'rollback',
    later: 'undefined',
    outerFails: false,
  },
  {
    name: 'retains recovery and later callback failures when full rollback fails and fences the next UoW',
    cleanup: 'rollback',
    later: 'error',
    outerFails: true,
  },
] as const;

for (const recoveryCase of recoveryCases) {
  test('sqlite catalogue Source recovery ' + recoveryCase.name, async () => {
    const fixture = await openSqliteStepCatalogueCase(
      'stepCatalogue.defineAndBindStep:project-empty-materialization',
    );
    const { source, seed } = fixture,
      db = source.db;
    let requiresManualRollback = false;
    const needsManualRollback = (): boolean => requiresManualRollback;
    let beforeRecovery: ReturnType<typeof catalogueStorage> | undefined;
    let execution = await attempt(async () => {
      const baseline = catalogueStorage(db);
      beforeRecovery = baseline;
      expect(
        (await source.stores.stepCatalogue.readPackage(seed.organizationId, seed.workPackageId))
          ?.steps,
      ).toEqual([]);
      const cleanupFailure = new Error('qa actual catalogue savepoint cleanup refused');
      const laterFailure = new Error('qa later callback refused');
      const rollbackFailure = new Error('qa actual Source full rollback refused');
      const dialect = new SQLiteDialect();
      const originalRun = db.run.bind(db);
      const controls: string[] = [];
      let isArmed = false,
        cleanupFaults = 0,
        outerFaults = 0;
      let methodFailure: AggregateError | undefined;
      const run = spyOn(db, 'run').mockImplementation((query) => {
        const statement =
          typeof query === 'string' ? query : dialect.sqlToQuery(query.getSQL()).sql;
        if (isArmed) {
          controls.push(statement);
          const selected =
            recoveryCase.cleanup === 'rollback'
              ? 'ROLLBACK TO SAVEPOINT step_catalogue_write'
              : 'RELEASE SAVEPOINT step_catalogue_write';
          if (statement === selected && cleanupFaults === 0) {
            cleanupFaults++;
            throw cleanupFailure;
          }
          if (statement === 'ROLLBACK' && recoveryCase.outerFails && outerFaults === 0) {
            outerFaults++;
            requiresManualRollback = true;
            throw rollbackFailure;
          }
        }
        const written = originalRun(query);
        if (statement === 'BEGIN IMMEDIATE') requiresManualRollback = true;
        if (statement === 'COMMIT' || statement === 'ROLLBACK') requiresManualRollback = false;
        return written;
      });
      try {
        const rejected = await attempt(() =>
          source.uow.run(async ({ stores }) => {
            // A successful actual write must disappear when recovery forces the whole owner to roll back.
            expect(
              (await defineRecoveryStep(fixture, stores.stepCatalogue, 'recovery-prefix')).ok,
            ).toBe(true);
            expect(
              (
                await stores.stepCatalogue.readPackage(seed.organizationId, seed.workPackageId)
              )?.steps.map(({ stepId }) => stepId),
            ).toEqual(['recovery-prefix']);
            db.run(
              sql.raw(
                "CREATE TEMP TRIGGER qa_catalogue_recovery_abort BEFORE INSERT ON main.work_package_step WHEN NEW.step_id='recovery-failed' BEGIN SELECT RAISE(ABORT, 'qa catalogue recovery explicit value refused'); END",
              ),
            );
            const armed = db
              .all<{ name: string; statement: string }>(
                sql`SELECT name, sql AS statement FROM sqlite_temp_master WHERE name='qa_catalogue_recovery_abort'`,
              )
              .at(0);
            expect(armed?.name).toBe('qa_catalogue_recovery_abort');
            expect(armed?.statement).toContain('qa catalogue recovery explicit value refused');
            isArmed = true;
            const method = await attempt(() =>
              defineRecoveryStep(fixture, stores.stepCatalogue, 'recovery-failed'),
            );
            expect(method.ok).toBe(false);
            if (method.ok) throw new Error('actual native materialization failure resolved');
            methodFailure = recoveryAggregate(method.cause);
            const causes: readonly unknown[] = methodFailure.errors;
            expect(causes.length).toBe(2);
            const primary = causes.at(0);
            expect(primary).toBeInstanceOf(Error);
            if (!(primary instanceof Error)) throw primary;
            const native: unknown = primary.cause;
            expect(native).toBeInstanceOf(Error);
            if (!(native instanceof Error)) throw native;
            expect(native.message).toBe('qa catalogue recovery explicit value refused');
            expect(causes.at(1)).toBe(cleanupFailure);
            expect(methodFailure.cause).toBe(cleanupFailure);
            // No intervening catalogue call can mask the owner's pre-COMMIT fence.
            if (recoveryCase.later === 'error') throw laterFailure;
            if (recoveryCase.later === 'undefined') {
              // eslint-disable-next-line @typescript-eslint/only-throw-error -- The unknown-cause boundary must preserve deliberately thrown undefined after an earlier recovery failure.
              throw undefined;
            }
            return { commit: true, value: 'unsafe commit must be refused' };
          }),
        );
        expect(rejected.ok).toBe(false);
        if (rejected.ok) throw new Error('Source committed after failed savepoint recovery');
        expect(cleanupFaults).toBe(1);
        expect(controls.filter((statement) => statement === 'COMMIT')).toEqual([]);
        expect(controls.filter((statement) => statement === 'ROLLBACK')).toEqual(['ROLLBACK']);
        if (methodFailure === undefined)
          throw new Error('actual method recovery failure was not captured');
        let pending: unknown = methodFailure;
        if (recoveryCase.outerFails) {
          const outer = recoveryAggregate(rejected.cause);
          const causes: readonly unknown[] = outer.errors;
          expect(causes.length).toBe(2);
          expect(causes.at(1)).toBe(rollbackFailure);
          expect(outer.cause).toBe(rollbackFailure);
          pending = causes.at(0);
          expect(outerFaults).toBe(1);
        } else {
          expect(outerFaults).toBe(0);
          pending = rejected.cause;
        }
        if (recoveryCase.later === 'commit') {
          expect(pending).toBe(methodFailure);
        } else {
          const later = recoveryAggregate(pending);
          const causes: readonly unknown[] = later.errors;
          expect(causes.length).toBe(2);
          expect(causes.at(0)).toBe(methodFailure);
          expect(causes.at(1)).toBe(recoveryCase.later === 'error' ? laterFailure : undefined);
          expect(later.cause).toBe(recoveryCase.later === 'error' ? laterFailure : undefined);
        }
        if (recoveryCase.outerFails) {
          const controlCount = controls.length;
          let callbackEntered = false;
          const next = await attempt(() =>
            source.uow.run(() => {
              callbackEntered = true;
              return Promise.resolve({ commit: true, value: 'must not enter' });
            }),
          );
          expect(next.ok).toBe(false);
          if (next.ok) throw new Error('unknown writer was reused');
          expect(next.cause).toBe(rejected.cause);
          expect(callbackEntered).toBe(false);
          expect(controls.length).toBe(controlCount);
        } else {
          expect(catalogueStorage(db)).toEqual(baseline);
          expect(
            db.all(
              sql`SELECT name FROM sqlite_temp_master WHERE name='qa_catalogue_recovery_abort'`,
            ),
          ).toEqual([]);
          const reused = await source.uow.run(async ({ stores }) => {
            expect(
              (await defineRecoveryStep(fixture, stores.stepCatalogue, 'recovery-reused')).ok,
            ).toBe(true);
            return { commit: true, value: 'confirmed rollback permits healthy reuse' };
          });
          expect(reused).toBe('confirmed rollback permits healthy reuse');
          expect(
            (
              await source.stores.stepCatalogue.readPackage(seed.organizationId, seed.workPackageId)
            )?.steps.map(({ stepId }) => stepId),
          ).toEqual(['recovery-reused']);
          expect(catalogueStorage(db).ledger).toEqual(baseline.ledger);
          expect(catalogueStorage(db).schema).toEqual(baseline.schema);
        }
      } finally {
        run.mockRestore();
      }
    });
    let didManuallyRecover = false;
    if (needsManualRollback()) {
      // Exactly one test-only cleanup attempt after restoring instrumentation; no production fence is cleared.
      const recovered = await attempt(() => db.run(sql.raw('ROLLBACK')));
      if (!recovered.ok) {
        retainedRecoveryFixtures.add(fixture);
        if (!execution.ok)
          throw new AggregateError(
            [execution.cause, recovered.cause],
            'recovery assertion and native owner cleanup failed; fixture retained',
            { cause: recovered.cause },
          );
        throw recovered.cause;
      }
      didManuallyRecover = true;
    }
    if (didManuallyRecover) {
      const restored = await attempt(() => {
        if (beforeRecovery === undefined) throw new Error('recovery baseline was not retained');
        expect(catalogueStorage(db)).toEqual(beforeRecovery);
      });
      if (!restored.ok)
        execution = execution.ok
          ? restored
          : {
              ok: false,
              cause: new AggregateError(
                [execution.cause, restored.cause],
                'recovery assertion and restored-state check failed',
                { cause: restored.cause },
              ),
            };
    }
    const closed = await attempt(() => fixture.close());
    if (!execution.ok) {
      if (!closed.ok)
        throw new AggregateError(
          [execution.cause, closed.cause],
          'Source recovery assertion and fixture close failed',
          { cause: closed.cause },
        );
      throw execution.cause;
    }
    if (!closed.ok) throw closed.cause;
  });
}

test('sqlite Source refuses public user creation after repair catalogue rollback cannot be confirmed', async () => {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.defineAndBindStep:project-empty-materialization',
  );
  const { source, seed } = fixture,
    db = source.db;
  let requiresManualRollback = false;
  const needsManualRollback = (): boolean => requiresManualRollback;
  const execution = await attempt(async () => {
    const healthyUser = {
      id: 'recovery-healthy-user',
      username: 'recovery-healthy-user',
      passwordHash: null,
      email: null,
      idpIssuer: null,
      idpSub: null,
      createdAt: 101,
    };
    expect(await source.stores.users.create(healthyUser, seed.stamp)).toEqual(healthyUser);
    expect(await source.stores.users.findById(healthyUser.id)).toEqual(healthyUser);
    const baseline = catalogueStorage(db);
    const rollbackFailure = new Error('qa actual repair full rollback refused');
    const dialect = new SQLiteDialect();
    const originalRun = db.run.bind(db);
    const controls: string[] = [];
    let isRepair = false,
      rollbackFaults = 0;
    db.run(
      sql.raw(
        "CREATE TEMP TRIGGER qa_catalogue_repair_abort BEFORE INSERT ON main.work_package_step WHEN NEW.step_id='repair-failed' BEGIN SELECT RAISE(ABORT, 'qa catalogue repair explicit value refused'); END",
      ),
    );
    const armed = db
      .all<{ name: string; statement: string }>(
        sql`SELECT name, sql AS statement FROM sqlite_temp_master WHERE name='qa_catalogue_repair_abort'`,
      )
      .at(0);
    expect(armed?.name).toBe('qa_catalogue_repair_abort');
    expect(armed?.statement).toContain('qa catalogue repair explicit value refused');
    const run = spyOn(db, 'run').mockImplementation((query) => {
      const statement = typeof query === 'string' ? query : dialect.sqlToQuery(query.getSQL()).sql;
      controls.push(statement);
      if (isRepair && statement === 'ROLLBACK' && rollbackFaults === 0) {
        rollbackFaults++;
        throw rollbackFailure;
      }
      const written = originalRun(query);
      if (statement === 'BEGIN IMMEDIATE') requiresManualRollback = true;
      if (statement === 'COMMIT' || statement === 'ROLLBACK') requiresManualRollback = false;
      return written;
    });
    let repair: Attempt<string>;
    try {
      repair = await attempt(() =>
        source.uow.run(() =>
          Promise.resolve({
            commit: false,
            value: 'original transaction refused',
            afterRollback: async ({ stores }) => {
              isRepair = true;
              await defineRecoveryStep(fixture, stores.stepCatalogue, 'repair-failed');
            },
          }),
        ),
      );
    } finally {
      run.mockRestore();
    }
    expect(repair.ok).toBe(false);
    if (repair.ok) throw new Error('actual failed repair resolved');
    const failure = recoveryAggregate(repair.cause);
    const causes: readonly unknown[] = failure.errors;
    expect(causes.length).toBe(2);
    expect(causes.at(1)).toBe(rollbackFailure);
    expect(failure.cause).toBe(rollbackFailure);
    const primary = causes.at(0);
    expect(primary).toBeInstanceOf(Error);
    if (!(primary instanceof Error)) throw primary;
    const native: unknown = primary.cause;
    expect(native).toBeInstanceOf(Error);
    if (!(native instanceof Error)) throw native;
    expect(native.message).toBe('qa catalogue repair explicit value refused');
    expect(rollbackFaults).toBe(1);
    expect(controls).toEqual(['BEGIN IMMEDIATE', 'ROLLBACK', 'BEGIN IMMEDIATE', 'ROLLBACK']);
    expect(requiresManualRollback).toBe(true);
    // The repair's BEGIN succeeded and its rollback never reached native SQLite. Its pre-materialization definition remains on this actual writer.
    expect(db.all(sql`SELECT id FROM step_definition WHERE id='repair-failed'`)).toEqual([
      { id: 'repair-failed' },
    ]);
    expect(
      db.all(sql`SELECT step_id FROM work_package_step WHERE step_id='repair-failed'`),
    ).toEqual([]);
    const beforePublicWrite = catalogueStorage(db);
    const usersBefore = db.all(sql`SELECT * FROM users ORDER BY id COLLATE BINARY`);
    const forbiddenUser = {
      ...healthyUser,
      id: 'recovery-forbidden-user',
      username: 'recovery-forbidden-user',
    };
    const publicWrite = await attempt(() => source.stores.users.create(forbiddenUser, seed.stamp));
    // Intended first RED: current public raw coordinator resolves and inserts into the unknown writer.
    expect(publicWrite.ok).toBe(false);
    if (publicWrite.ok) throw new Error('public user creation resolved on an unconfirmed writer');
    expect(publicWrite.cause).toBe(failure);
    expect(db.all(sql`SELECT id FROM users WHERE id='recovery-forbidden-user'`)).toEqual([]);
    expect(db.all(sql`SELECT * FROM users ORDER BY id COLLATE BINARY`)).toEqual(usersBefore);
    expect(catalogueStorage(db)).toEqual(beforePublicWrite);
    expect(beforePublicWrite.ledger).toEqual(baseline.ledger);
    expect(beforePublicWrite.schema).toEqual(baseline.schema);
  });
  if (needsManualRollback()) {
    // Test cleanup settles the native transaction once, without clearing or testing any invented recovery authority.
    const recovered = await attempt(() => db.run(sql.raw('ROLLBACK')));
    if (!recovered.ok) {
      retainedRecoveryFixtures.add(fixture);
      if (!execution.ok)
        throw new AggregateError(
          [execution.cause, recovered.cause],
          'public writer assertion and native cleanup failed; fixture retained',
          { cause: recovered.cause },
        );
      throw recovered.cause;
    }
  }
  const closed = await attempt(() => fixture.close());
  if (!execution.ok) {
    if (!closed.ok)
      throw new AggregateError(
        [execution.cause, closed.cause],
        'public writer assertion and fixture close failed',
        { cause: closed.cause },
      );
    throw execution.cause;
  }
  if (!closed.ok) throw closed.cause;
});

for (const graph of ['plain', 'bound', 'exported', 'close'] as const) {
  test(
    'sqlite Source public writer ' +
      graph +
      ' rechecks recovery after queueing while physical close remains available',
    async () => {
      const fixture = await openSqliteStepCatalogueCase(
        'stepCatalogue.defineAndBindStep:project-empty-materialization',
      );
      const { source, seed } = fixture,
        db = source.db;
      const users =
        graph === 'bound'
          ? source.bindLivePlans({ schedulerOf: () => fastScheduler }).stores.users
          : graph === 'exported'
            ? new UserRepository(db, source.gate)
            : source.stores.users;
      let requiresManualRollback = false;
      const needsManualRollback = (): boolean => requiresManualRollback;
      let closeState: 'open' | 'closed' | 'unknown' = 'open';
      const currentCloseState = (): 'open' | 'closed' | 'unknown' => closeState;
      const execution = await attempt(async () => {
        const healthyUser = {
          id: 'queued-healthy-user',
          username: 'queued-healthy-user',
          passwordHash: null,
          email: null,
          idpIssuer: null,
          idpSub: null,
          createdAt: 101,
        };
        expect(await users.create(healthyUser, seed.stamp)).toEqual(healthyUser);
        const baseline = catalogueStorage(db);
        const usersBefore = db.all(sql`SELECT * FROM users ORDER BY id COLLATE BINARY`);
        db.run(
          sql.raw(
            "CREATE TEMP TRIGGER qa_catalogue_queued_repair_abort BEFORE INSERT ON main.work_package_step WHEN NEW.step_id='queued-repair-failed' BEGIN SELECT RAISE(ABORT, 'qa queued repair explicit value refused'); END",
          ),
        );
        expect(
          db
            .all<{ statement: string }>(
              sql`SELECT sql AS statement FROM sqlite_temp_master WHERE name='qa_catalogue_queued_repair_abort'`,
            )
            .at(0)?.statement,
        ).toContain('qa queued repair explicit value refused');
        const rollbackFailure = new Error('qa queued repair full rollback refused');
        const atRepair = Promise.withResolvers<undefined>();
        const releaseRepair = Promise.withResolvers<undefined>();
        const dialect = new SQLiteDialect();
        const originalRun = db.run.bind(db);
        const controls: string[] = [];
        let isRepair = false,
          rollbackFaults = 0;
        const run = spyOn(db, 'run').mockImplementation((query) => {
          const statement =
            typeof query === 'string' ? query : dialect.sqlToQuery(query.getSQL()).sql;
          controls.push(statement);
          if (isRepair && statement === 'ROLLBACK' && rollbackFaults === 0) {
            rollbackFaults++;
            throw rollbackFailure;
          }
          const written = originalRun(query);
          if (statement === 'BEGIN IMMEDIATE') requiresManualRollback = true;
          if (statement === 'COMMIT' || statement === 'ROLLBACK') requiresManualRollback = false;
          return written;
        });
        let owner: Promise<Attempt<string>> | undefined;
        let queued: Promise<Attempt<unknown>> | undefined;
        try {
          owner = attempt(() =>
            source.uow.run(() =>
              Promise.resolve({
                commit: false,
                value: 'refused before repair',
                afterRollback: async ({ stores }) => {
                  atRepair.resolve(undefined);
                  await releaseRepair.promise;
                  isRepair = true;
                  await defineRecoveryStep(fixture, stores.stepCatalogue, 'queued-repair-failed');
                },
              }),
            ),
          );
          // The actual owner has rolled back but still holds the coordinator, and no recovery failure exists yet.
          const entered = await Promise.race([
            atRepair.promise.then(() => ({ kind: 'entered' }) as const),
            owner.then((outcome) => ({ kind: 'settled', outcome }) as const),
          ]);
          if (entered.kind === 'settled') {
            if (!entered.outcome.ok) throw entered.outcome.cause;
            throw new Error('actual UoW settled before entering repair');
          }
          expect(controls).toEqual(['BEGIN IMMEDIATE', 'ROLLBACK']);
          const forbiddenUser = {
            ...healthyUser,
            id: 'queued-forbidden-user',
            username: 'queued-forbidden-user',
          };
          queued =
            graph === 'close' ? undefined : attempt(() => users.create(forbiddenUser, seed.stamp));
          // Calling create above enters its real gate synchronously before the repair is released.
          expect(db.all(sql`SELECT id FROM users WHERE id='queued-forbidden-user'`)).toEqual([]);
          releaseRepair.resolve(undefined);
          const rejected = await owner;
          expect(rejected.ok).toBe(false);
          if (rejected.ok) throw new Error('queued native repair failure resolved');
          const failure = recoveryAggregate(rejected.cause);
          const causes: readonly unknown[] = failure.errors;
          expect(causes.length).toBe(2);
          expect(causes.at(1)).toBe(rollbackFailure);
          expect(failure.cause).toBe(rollbackFailure);
          const primary = causes.at(0);
          expect(primary).toBeInstanceOf(Error);
          if (!(primary instanceof Error)) throw primary;
          const native: unknown = primary.cause;
          expect(native).toBeInstanceOf(Error);
          if (!(native instanceof Error)) throw native;
          expect(native.message).toBe('qa queued repair explicit value refused');
          expect(rollbackFaults).toBe(1);
          expect(controls).toEqual(['BEGIN IMMEDIATE', 'ROLLBACK', 'BEGIN IMMEDIATE', 'ROLLBACK']);
          expect(needsManualRollback()).toBe(true);
          expect(
            db.all(sql`SELECT id FROM step_definition WHERE id='queued-repair-failed'`),
          ).toEqual([{ id: 'queued-repair-failed' }]);
          const beforeQueuedWrite = catalogueStorage(db);
          if (queued !== undefined) {
            const publicWrite = await queued;
            // First oracle also catches an entry-only guard: the call queued before the failure was recorded.
            expect(publicWrite.ok).toBe(false);
            if (publicWrite.ok)
              throw new Error('queued public write resolved on the failed writer');
            expect(publicWrite.cause).toBe(failure);
            expect(db.all(sql`SELECT id FROM users WHERE id='queued-forbidden-user'`)).toEqual([]);
            expect(db.all(sql`SELECT * FROM users ORDER BY id COLLATE BINARY`)).toEqual(
              usersBefore,
            );
            expect(catalogueStorage(db)).toEqual(beforeQueuedWrite);
            expect(beforeQueuedWrite.ledger).toEqual(baseline.ledger);
            expect(beforeQueuedWrite.schema).toEqual(baseline.schema);
          }
        } finally {
          releaseRepair.resolve(undefined);
          if (owner !== undefined) await owner;
          if (queued !== undefined) await queued;
          run.mockRestore();
        }
        if (graph === 'close') {
          // The same recorded failure is still present; no manual rollback or registry clear precedes physical close.
          closeState = 'unknown';
          const closed = await attempt(() => source.close());
          if (!closed.ok) throw closed.cause;
          expect(closed.ok).toBe(true);
          closeState = 'closed';
          requiresManualRollback = false;
          expect(closed.value).toBeUndefined();
        }
      });
      if (currentCloseState() === 'unknown') {
        retainedRecoveryFixtures.add(fixture);
        if (!execution.ok) throw execution.cause;
        throw new Error('actual Source close custody is unknown; fixture retained');
      }
      if (needsManualRollback()) {
        const recovered = await attempt(() => db.run(sql.raw('ROLLBACK')));
        if (!recovered.ok) {
          retainedRecoveryFixtures.add(fixture);
          if (!execution.ok)
            throw new AggregateError(
              [execution.cause, recovered.cause],
              'queued writer assertion and native cleanup failed; fixture retained',
              { cause: recovered.cause },
            );
          throw recovered.cause;
        }
      }
      const closed = await attempt(() => fixture.close());
      if (!execution.ok) {
        if (!closed.ok)
          throw new AggregateError(
            [execution.cause, closed.cause],
            'queued writer assertion and fixture close failed',
            { cause: closed.cause },
          );
        throw execution.cause;
      }
      if (!closed.ok) throw closed.cause;
    },
  );
}
