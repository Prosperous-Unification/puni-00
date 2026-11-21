import { openTestSource } from '@wbs/store-memory/testing/owned-source-fixture';
import { testStepParallels } from '@wbs/store-memory/testing/service-fixtures';

import { type AppOptions, buildApp } from '../app';
import { testAuthService } from './auth-fixture';
import { testCalendarMarkerService } from './calendar-marker-fixture';
import { testCapacityService } from './capacity-fixture';
import { testClock } from './clock-fixture';
import { testDirectoryService } from './directory-fixture';
import {
  refusingEmailVerification,
  refusingInvitations,
  refusingJoinRequests,
  refusingTestEmailDelivery,
} from './email-verification-fixture';
import { testHistoryService } from './history-fixture';
import { testLoginThrottle } from './login-throttle-fixture';
import { refusingOnboarding } from './onboarding-fixture';
import {
  legacyOrganizationAccess,
  refusingDomains,
  refusingEnterpriseConnections,
  refusingMemberships,
  refusingRestoreApprovals,
} from './organization-access-fixture';
import { refusingPlanExports } from './plan-export-fixture';
import { testPriorityBandService } from './priority-band-fixture';
import { refusingProjects } from './project-fixture';
import { testReplay } from './replay-fixture';
import { testSavedPlanService } from './saved-plan-fixture';
import { refusingSpaceRead, refusingSpaces } from './space-fixture';
import { testStepService } from './step-fixture';
import { testWorkItemService } from './work-item-fixture';
import { refusingWorkPackageAddressSearch } from './work-package-address-search-fixture';
import { createLegacyWorkPackageObservation } from './work-package-fixture';
import { testWorkPackageService } from './work-package-fixture';
import { refusingWorkPackageRanks } from './work-package-rank-fixture';
import { testWrites } from './writes-fixture';

/**
 * An app on the thirteen test doubles, for the callers that want the routes
 * and none of the behaviour behind them.
 *
 * Shared fixture for route composition and generated-document publication tests.
 * The document CLI consumes shared descriptors directly and needs no app fixture.
 *
 * Route registration touches no service, which is what makes the doubles
 * honest here rather than a shortcut: a real service would mean a database
 * file, migrations and a temp directory to produce the same answer.
 *
 * `overrides` is spread last, so a caller that cares about one service — an
 * auth service that answers a particular identity, say — names that one and
 * inherits the rest.
 */
export function testApp(overrides: Partial<AppOptions> = {}): ReturnType<typeof buildApp> {
  // An overridden service is the one the batch graph hands out too, so a
  // route that runs through `writes` (a work package PATCH, a step removal) meets the
  // same service the caller named rather than a double beside it.
  const workItems = overrides.workItems ?? testWorkItemService(openTestSource());
  const directory = overrides.directory ?? testDirectoryService();
  const capacity = overrides.capacity ?? testCapacityService();
  const priorityBands = overrides.priorityBands ?? testPriorityBandService();
  const workPackages = overrides.workPackages ?? testWorkPackageService();
  const history = overrides.history ?? testHistoryService();
  const steps = overrides.steps ?? testStepService();
  const calendarMarkers = overrides.calendarMarkers ?? testCalendarMarkerService();
  return buildApp({
    projects: refusingProjects,
    planExports: refusingPlanExports,
    workPackageObservation: createLegacyWorkPackageObservation(workPackages, history),
    workPackageAddressSearch: refusingWorkPackageAddressSearch,
    organizations: legacyOrganizationAccess,
    memberships: refusingMemberships,
    sharedPeopleRestoreApprovals: refusingRestoreApprovals,
    domains: refusingDomains,
    enterpriseConnections: refusingEnterpriseConnections,
    emailVerification: refusingEmailVerification,
    invitations: refusingInvitations,
    joinRequests: refusingJoinRequests,
    spaces: refusingSpaces,
    spaceRead: refusingSpaceRead,
    workPackageRanks: refusingWorkPackageRanks,
    emailDelivery: refusingTestEmailDelivery,
    onboarding: refusingOnboarding,
    appOrigin: 'http://localhost',
    loginThrottle: testLoginThrottle(),
    auth: testAuthService(),
    workPackages,
    workItems,
    savedPlans: testSavedPlanService(),
    steps,
    directory,
    capacity,
    priorityBands,
    history,
    stepParallels: testStepParallels(),
    calendarMarkers,
    replay: testReplay().replay,
    admitDependencyClient: () => null,
    probeDatabase: () => 'ok',
    internalAuthSecret: 'x'.repeat(32),
    // The same doubles the routes were given: on the fixtures there is one set
    // of stores and no turn to hold, so the batch's graph and the routes' are
    // the same objects. See {@link testWrites}.
    writes: testWrites(undefined, {
      workItems,
      directory,
      capacity,
      priorityBands,
      workPackages,
      steps,
      calendarMarkers,
    }),
    migrationsApplied: true,
    ...overrides,
    clock: overrides.clock ?? testClock,
  });
}
