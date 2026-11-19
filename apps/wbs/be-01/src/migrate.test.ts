import {openTestSource} from '@wbs/store-memory/testing/owned-source-fixture';
import { testStepParallels } from '@wbs/store-memory/testing/service-fixtures';
import { describe, expect, it } from 'bun:test';

import { buildApp } from './app';
import { testAuthService } from './testing/auth-fixture';
import { testCalendarMarkerService } from './testing/calendar-marker-fixture';
import { testCapacityService } from './testing/capacity-fixture';
import { testClock } from './testing/clock-fixture';
import { testDirectoryService } from './testing/directory-fixture';
import {
  refusingEmailVerification,
  refusingInvitations,
  refusingJoinRequests,
  refusingTestEmailDelivery,
} from './testing/email-verification-fixture';
import { testHistoryService } from './testing/history-fixture';
import { testLoginThrottle } from './testing/login-throttle-fixture';
import { refusingOnboarding } from './testing/onboarding-fixture';
import {
  legacyOrganizationAccess,
  refusingDomains,
  refusingEnterpriseConnections,
  refusingMemberships,
  refusingRestoreApprovals,
} from './testing/organization-access-fixture';
import { refusingPlanExports } from './testing/plan-export-fixture';
import { testPriorityBandService } from './testing/priority-band-fixture';
import { refusingProjects } from './testing/project-fixture';
import { testReplay } from './testing/replay-fixture';
import { testSavedPlanService } from './testing/saved-plan-fixture';
import { refusingSpaces } from './testing/space-fixture';
import { testStepService } from './testing/step-fixture';
import { testWorkItemService } from './testing/work-item-fixture';
import { refusingWorkPackageAddressSearch } from './testing/work-package-address-search-fixture';
import { refusingWorkPackageObservation } from './testing/work-package-fixture';
import { testWorkPackageService } from './testing/work-package-fixture';
import { refusingWorkPackageRanks } from './testing/work-package-rank-fixture';
import { testWrites } from './testing/writes-fixture';

describe('migrate lifecycle', () => {
  it('exposes 503 before migrations complete then 200 after', async () => {
    const state = { migrationsApplied: false };
    const app = buildApp({
      projects: refusingProjects,
      planExports: refusingPlanExports,
      workPackageObservation: refusingWorkPackageObservation,
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
      workPackageRanks: refusingWorkPackageRanks,
      emailDelivery: refusingTestEmailDelivery,
      onboarding: refusingOnboarding,
      clock: testClock,
      loginThrottle: testLoginThrottle(),
      appOrigin: 'http://localhost',
      directory: testDirectoryService(),
      capacity: testCapacityService(),
      priorityBands: testPriorityBandService(),
      history: testHistoryService(),
      stepParallels: testStepParallels(),
      calendarMarkers: testCalendarMarkerService(),
      auth: testAuthService(),
      workPackages: testWorkPackageService(),
      workItems: testWorkItemService(openTestSource()),
      savedPlans: testSavedPlanService(),
      steps: testStepService(),
      replay: testReplay().replay,
      admitDependencyClient: () => null,
      probeDatabase: () => 'ok',
      internalAuthSecret: 'x'.repeat(32),
      writes: testWrites(undefined,{workItems:testWorkItemService(openTestSource())}),
      get migrationsApplied() {
        return state.migrationsApplied;
      },
    });

    const pre = await app.handle(new Request('http://localhost/health'));
    expect(pre.status).toBe(503);

    state.migrationsApplied = true;
    const post = await app.handle(new Request('http://localhost/health'));
    expect(post.status).toBe(200);
  });
});
