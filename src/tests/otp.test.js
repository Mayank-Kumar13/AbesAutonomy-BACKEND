import test from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import OtpToken from '../models/OtpToken.js';
import * as authController from '../controllers/authController.js';
import env from '../config/env.js';
import app from '../app.js';
import request from 'supertest';

// Mock the fetch call in emailService (so we don't actually hit Brevo)
let originalFetch = global.fetch;
let sentEmails = [];

test.before(async () => {
  // Setup MongoDB Memory Server or just a local test db
  const testDbUri = env.MONGODB_URI + '_test';
  await mongoose.connect(testDbUri);
  await User.deleteMany({});
  await OtpToken.deleteMany({});
  
  global.fetch = async (url, options) => {
    if (url === 'https://api.brevo.com/v3/smtp/email') {
      sentEmails.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({}) };
    }
    return originalFetch(url, options);
  };
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  global.fetch = originalFetch;
});

test.afterEach(async () => {
  await User.deleteMany({});
  await OtpToken.deleteMany({});
  sentEmails = [];
});

test('OTP System Flow', async (t) => {
  await t.test('Should register user and send OTP via Brevo', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123'
    });
    
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(sentEmails.length, 1);
    assert.strictEqual(sentEmails[0].to[0].email, 'test@example.com');
    
    // Check DB
    const user = await User.findOne({ email: 'test@example.com' });
    assert.ok(user);
    assert.strictEqual(user.emailVerified, false);
    
    const otpRec = await OtpToken.findOne({ userId: user._id });
    assert.ok(otpRec);
  });

  await t.test('Should verify OTP successfully', async () => {
    const user = await User.create({ name: 'Test', email: 'test2@example.com', password: 'password123' });
    const otp = '123456';
    const otpHash = await bcrypt.hash(otp, 10);
    await OtpToken.create({
      userId: user._id,
      otpHash,
      purpose: 'signup',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    const res = await request(app).post('/api/auth/verify-otp').send({
      userId: user._id,
      otp: '123456',
      purpose: 'signup'
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    
    // Check DB
    const updatedUser = await User.findById(user._id);
    assert.strictEqual(updatedUser.emailVerified, true);
    
    const otpRec = await OtpToken.findOne({ userId: user._id });
    assert.strictEqual(otpRec, null, 'OTP should be deleted after success');
  });

  await t.test('Should enforce max attempts and delete OTP', async () => {
    const user = await User.create({ name: 'Test', email: 'test3@example.com', password: 'password123' });
    const otpHash = await bcrypt.hash('123456', 10);
    await OtpToken.create({
      userId: user._id,
      otpHash,
      purpose: 'signup',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/auth/verify-otp').send({
        userId: user._id,
        otp: '000000', // wrong
        purpose: 'signup'
      });
      assert.strictEqual(res.status, 400);
    }

    // Next one should say expired or deleted
    const resFinal = await request(app).post('/api/auth/verify-otp').send({
      userId: user._id,
      otp: '123456', // correct but too late
      purpose: 'signup'
    });
    assert.strictEqual(resFinal.status, 400);
    assert.match(resFinal.body.message, /Too many incorrect attempts/);
    
    const otpRec = await OtpToken.findOne({ userId: user._id });
    assert.strictEqual(otpRec, null);
  });

  await t.test('Should enforce 60-second cooldown on resend', async () => {
    const user = await User.create({ name: 'Test', email: 'test4@example.com', password: 'password123' });
    
    const res1 = await request(app).post('/api/auth/resend-otp').send({
      userId: user._id,
      purpose: 'signup'
    });
    assert.strictEqual(res1.status, 200);
    
    const res2 = await request(app).post('/api/auth/resend-otp').send({
      userId: user._id,
      purpose: 'signup'
    });
    assert.strictEqual(res2.status, 400);
    assert.match(res2.body.message, /Please wait/);
  });
});
