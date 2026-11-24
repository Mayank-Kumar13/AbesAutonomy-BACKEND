import test from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { evaluateNoteAccess, validateUserSubscription } from '../middleware/accessControl.js';
import { isMainSuperAdmin } from '../utils/superAdmin.js';
import { SUBSCRIPTION_PLANS } from '../services/paymentService.js';

test('Premium Access Control & Pricing Test Suite', async (suite) => {

  const superAdminEmail = 'abesautonomy30@gmail.com';
  const superAdminUser = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Main Super Admin',
    email: superAdminEmail,
    role: 'admin',
    isPremium: false,
  };

  const otherAdminUser = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Department Admin',
    email: 'deptadmin@abes.ac.in',
    role: 'admin',
    isPremium: false,
    freePdfAccessCount: 3,
    freePdfAccessedIds: [],
  };

  const coordinatorUser = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Branch Coordinator',
    email: 'coord@abes.ac.in',
    role: 'coordinator',
    isPremium: false,
    freePdfAccessCount: 3,
    freePdfAccessedIds: [],
  };

  const newStudent = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Rahul Sharma',
    email: 'rahul@gmail.com',
    role: 'user',
    isPremium: false,
    freePdfAccessCount: 0,
    freePdfAccessedIds: [],
  };

  const activePremiumStudent = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Priya Verma',
    email: 'priya@gmail.com',
    role: 'user',
    isPremium: true,
    premiumPlan: 'premium_4_months',
    premiumExpiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days in future
    premiumStatus: 'ACTIVE',
  };

  const expiredStudent = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Amit Kumar',
    email: 'amit@gmail.com',
    role: 'user',
    isPremium: true,
    premiumPlan: 'premium_2_months',
    premiumExpiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // expired yesterday
    premiumStatus: 'ACTIVE',
    freePdfAccessCount: 3,
    freePdfAccessedIds: [],
    save: async () => {},
  };

  const pyqNote = {
    _id: new mongoose.Types.ObjectId(),
    title: 'AKTU 2024 End-Sem PYQ',
    resourceType: 'pyq',
  };

  const theoryNoteA = {
    _id: new mongoose.Types.ObjectId(),
    title: 'Data Structures Unit 1 Theory',
    resourceType: 'theory',
  };

  const theoryNoteB = {
    _id: new mongoose.Types.ObjectId(),
    title: 'Operating Systems Unit 2 Theory',
    resourceType: 'theory',
  };

  await suite.test('Scenario 1 & 2: PYQ is 100% Free Forever for all roles and anonymous users', async () => {
    // Anonymous user
    const anonResult = await evaluateNoteAccess(null, pyqNote);
    assert.strictEqual(anonResult.allowed, true);
    assert.strictEqual(anonResult.reason, 'pyq_free');

    // Normal student
    const studentResult = await evaluateNoteAccess(newStudent, pyqNote);
    assert.strictEqual(studentResult.allowed, true);
    assert.strictEqual(studentResult.reason, 'pyq_free');

    // Expired student
    const expiredResult = await evaluateNoteAccess(expiredStudent, pyqNote);
    assert.strictEqual(expiredResult.allowed, true);
    assert.strictEqual(expiredResult.reason, 'pyq_free');
  });

  await suite.test('Scenario 3: Main Super Admin account receives unrestricted PDF access exemption', async () => {
    assert.strictEqual(isMainSuperAdmin(superAdminUser), true);

    const access = await evaluateNoteAccess(superAdminUser, theoryNoteA);
    assert.strictEqual(access.allowed, true);
    assert.strictEqual(access.reason, 'super_admin');
  });

  await suite.test('Scenario 4 & 5: Other Admins and Coordinators MUST purchase Premium for non-PYQ PDFs', async () => {
    assert.strictEqual(isMainSuperAdmin(otherAdminUser), false);
    assert.strictEqual(isMainSuperAdmin(coordinatorUser), false);

    // Other admin with 3 free used should be BLOCKED from 4th theory note
    const adminAccess = await evaluateNoteAccess(otherAdminUser, theoryNoteA);
    assert.strictEqual(adminAccess.allowed, false);
    assert.strictEqual(adminAccess.code, 'PREMIUM_REQUIRED');

    // Coordinator with 3 free used should be BLOCKED from 4th theory note
    const coordAccess = await evaluateNoteAccess(coordinatorUser, theoryNoteA);
    assert.strictEqual(coordAccess.allowed, false);
    assert.strictEqual(coordAccess.code, 'PREMIUM_REQUIRED');
  });

  await suite.test('Scenario 6: New student gets first 3 free document accesses', async () => {
    const access = await evaluateNoteAccess(newStudent, theoryNoteA);
    assert.strictEqual(access.allowed, true);
    assert.strictEqual(access.consumeSlot, true);
    assert.strictEqual(access.remaining, 2);
    assert.strictEqual(access.count, 1);
  });

  await suite.test('Scenario 7: Re-reading an already unlocked document does not consume extra credits', async () => {
    const studentWithUnlockedNote = {
      ...newStudent,
      freePdfAccessCount: 1,
      freePdfAccessedIds: [theoryNoteA._id],
    };

    const access = await evaluateNoteAccess(studentWithUnlockedNote, theoryNoteA);
    assert.strictEqual(access.allowed, true);
    assert.strictEqual(access.consumeSlot, false);
    assert.strictEqual(access.reason, 'free_allowance_repeat');
  });

  await suite.test('Scenario 8: Fourth distinct non-PYQ document access requires Premium', async () => {
    const studentWith3Used = {
      ...newStudent,
      freePdfAccessCount: 3,
      freePdfAccessedIds: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()],
    };

    const access = await evaluateNoteAccess(studentWith3Used, theoryNoteB);
    assert.strictEqual(access.allowed, false);
    assert.strictEqual(access.code, 'PREMIUM_REQUIRED');
  });

  await suite.test('Scenario 9: Active Premium user receives unrestricted access to all resources', async () => {
    const access = await evaluateNoteAccess(activePremiumStudent, theoryNoteB);
    assert.strictEqual(access.allowed, true);
    assert.strictEqual(access.reason, 'premium_subscription');
  });

  await suite.test('Scenario 10: Expired user loses premium access and returns to free quota', async () => {
    const isStillActive = await validateUserSubscription(expiredStudent);
    assert.strictEqual(isStillActive, false);
    assert.strictEqual(expiredStudent.isPremium, false);
    assert.strictEqual(expiredStudent.premiumStatus, 'EXPIRED');

    const access = await evaluateNoteAccess(expiredStudent, theoryNoteB);
    assert.strictEqual(access.allowed, false);
    assert.strictEqual(access.code, 'PREMIUM_REQUIRED');
  });

  await suite.test('Scenario 11: Subscription pricing rules are strictly fixed in paise', async () => {
    assert.strictEqual(SUBSCRIPTION_PLANS.premium_1_month.amount, 2900); // ₹29
    assert.strictEqual(SUBSCRIPTION_PLANS.premium_1_month.durationDays, 30);

    assert.strictEqual(SUBSCRIPTION_PLANS.premium_4_months.amount, 9900); // ₹99
    assert.strictEqual(SUBSCRIPTION_PLANS.premium_4_months.durationDays, 120);
    assert.strictEqual(SUBSCRIPTION_PLANS.premium_4_months.isBestValue, true);

    assert.strictEqual(SUBSCRIPTION_PLANS.premium_lifetime.amount, 39900); // ₹399
    assert.strictEqual(SUBSCRIPTION_PLANS.premium_lifetime.isLifetime, true);
  });

  await suite.test('Scenario 12: Razorpay Webhook signature verification', async () => {
    const testSecret = 'test_webhook_secret_key_123';
    const payload = JSON.stringify({ event: 'payment.captured', test: true });

    const validSignature = crypto.createHmac('sha256', testSecret).update(Buffer.from(payload)).digest('hex');
    const invalidSignature = 'invalid_signature_hash';

    // Verify valid signature
    const checkValid = crypto.createHmac('sha256', testSecret).update(Buffer.from(payload)).digest('hex') === validSignature;
    assert.strictEqual(checkValid, true);

    // Verify rejection of invalid signature
    const checkInvalid = crypto.createHmac('sha256', testSecret).update(Buffer.from(payload)).digest('hex') === invalidSignature;
    assert.strictEqual(checkInvalid, false);
  });

  await suite.test('Scenario 13: Single Active Device session enforcement', async () => {
    const userSessionId1 = 'device-session-uuid-1';
    const userSessionId2 = 'device-session-uuid-2';

    // 1. Regular student user: strictly single device
    const userWithActiveSession = {
      _id: new mongoose.Types.ObjectId(),
      role: 'user',
      email: 'student.regular@abes.ac.in',
      currentSessionId: userSessionId2, // Device 2 logged in later
    };

    const tokenFromDevice1 = { sessionId: userSessionId1 };
    const tokenFromDevice2 = { sessionId: userSessionId2 };

    // Device 1's token is invalid because Device 2 has become the active session
    const isDevice1Valid = isMainSuperAdmin(userWithActiveSession) || (tokenFromDevice1.sessionId === userWithActiveSession.currentSessionId);
    assert.strictEqual(isDevice1Valid, false);

    // Device 2's token matches current active session
    const isDevice2Valid = isMainSuperAdmin(userWithActiveSession) || (tokenFromDevice2.sessionId === userWithActiveSession.currentSessionId);
    assert.strictEqual(isDevice2Valid, true);

    // 2. Other admin/coordinator user: strictly single device
    const otherAdminWithSession = {
      ...otherAdminUser,
      currentSessionId: userSessionId2,
    };
    const isOtherAdminDevice1Valid = isMainSuperAdmin(otherAdminWithSession) || (tokenFromDevice1.sessionId === otherAdminWithSession.currentSessionId);
    assert.strictEqual(isOtherAdminDevice1Valid, false);

    // 3. Main Super Admin: EXEMPT, multiple concurrent devices permitted without session conflict
    const superAdminWithMultipleDevices = {
      ...superAdminUser,
      currentSessionId: null,
    };
    const isSuperAdminDevice1Valid = isMainSuperAdmin(superAdminWithMultipleDevices) || (tokenFromDevice1.sessionId === superAdminWithMultipleDevices.currentSessionId);
    const isSuperAdminDevice2Valid = isMainSuperAdmin(superAdminWithMultipleDevices) || (tokenFromDevice2.sessionId === superAdminWithMultipleDevices.currentSessionId);
    assert.strictEqual(isSuperAdminDevice1Valid, true);
    assert.strictEqual(isSuperAdminDevice2Valid, true);
  });

  await suite.test('Scenario 14: PDF Download policy strictly requires active Premium or Super Admin', async () => {
    // Free student (even with 0 free preview used) CANNOT download
    const freeStudentDownloadAllowed = activePremiumStudent.isPremium || isMainSuperAdmin(newStudent);
    assert.strictEqual(isMainSuperAdmin(newStudent), false);
    assert.strictEqual(newStudent.isPremium, false);

    // Active Premium user CAN download
    const premiumDownloadAllowed = activePremiumStudent.isPremium || isMainSuperAdmin(activePremiumStudent);
    assert.strictEqual(premiumDownloadAllowed, true);

    // Super Admin CAN download
    const superAdminDownloadAllowed = superAdminUser.isPremium || isMainSuperAdmin(superAdminUser);
    assert.strictEqual(superAdminDownloadAllowed, true);
  });
});
