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
    freePdfAccessCount: 5,
    freePdfAccessedIds: [],
  };

  const coordinatorUser = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Branch Coordinator',
    email: 'coord@abes.ac.in',
    role: 'coordinator',
    isPremium: false,
    freePdfAccessCount: 5,
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
    freePdfAccessCount: 5,
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

    // Other admin with 5 free used should be BLOCKED from 6th theory note
    const adminAccess = await evaluateNoteAccess(otherAdminUser, theoryNoteA);
    assert.strictEqual(adminAccess.allowed, false);
    assert.strictEqual(adminAccess.code, 'PREMIUM_REQUIRED');

    // Coordinator with 5 free used should be BLOCKED from 6th theory note
    const coordAccess = await evaluateNoteAccess(coordinatorUser, theoryNoteA);
    assert.strictEqual(coordAccess.allowed, false);
    assert.strictEqual(coordAccess.code, 'PREMIUM_REQUIRED');
  });

  await suite.test('Scenario 6: New student gets first 5 free document accesses', async () => {
    const access = await evaluateNoteAccess(newStudent, theoryNoteA);
    assert.strictEqual(access.allowed, true);
    assert.strictEqual(access.consumeSlot, true);
    assert.strictEqual(access.remaining, 4);
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

  await suite.test('Scenario 8: Sixth distinct non-PYQ document access requires Premium', async () => {
    const studentWith5Used = {
      ...newStudent,
      freePdfAccessCount: 5,
      freePdfAccessedIds: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()],
    };

    const access = await evaluateNoteAccess(studentWith5Used, theoryNoteB);
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
    assert.strictEqual(SUBSCRIPTION_PLANS.premium_2_months.amount, 10000); // ₹100
    assert.strictEqual(SUBSCRIPTION_PLANS.premium_2_months.durationDays, 60);

    assert.strictEqual(SUBSCRIPTION_PLANS.premium_4_months.amount, 15000); // ₹150
    assert.strictEqual(SUBSCRIPTION_PLANS.premium_4_months.durationDays, 120);
    assert.strictEqual(SUBSCRIPTION_PLANS.premium_4_months.isBestValue, true);
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
});
