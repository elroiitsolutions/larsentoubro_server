import assert from 'assert';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { normalizeIndianPhoneNumber, sendGuestSmsOtp } from '../src/services/sms.service.js';
import { requestGuestPhoneOtp, verifyGuestPhoneOtp } from '../src/services/otp.service.js';
import { Otp } from '../src/models/otp.model.js';
import { LoginLog } from '../src/models/loginLog.model.js';

console.log('--- Running Guest Mobile SMS OTP Feature Tests ---');

// 1. Test Phone Number Normalization
console.log('Testing phone number normalization...');
const test1 = normalizeIndianPhoneNumber('9876543210');
assert.strictEqual(test1.isValid, true);
assert.strictEqual(test1.clean10, '9876543210');
assert.strictEqual(test1.e164, '+919876543210');

const test2 = normalizeIndianPhoneNumber('+91 98765 43210');
assert.strictEqual(test2.isValid, true);
assert.strictEqual(test2.clean10, '9876543210');

const test3 = normalizeIndianPhoneNumber('09876543210');
assert.strictEqual(test3.isValid, true);
assert.strictEqual(test3.clean10, '9876543210');

const test4 = normalizeIndianPhoneNumber('123456');
assert.strictEqual(test4.isValid, false);

const test5 = normalizeIndianPhoneNumber('5876543210'); // Starts with 5 (invalid in India)
assert.strictEqual(test5.isValid, false);
console.log('✓ Test 1 Passed: Indian phone number normalization and validation logic verified.');

// 2. Connect to MongoDB to test complete OTP lifecycle
async function runIntegrationTests() {
    try {
        await mongoose.connect(env.MONGO_URI);
        console.log('Connected to MongoDB for integration tests.');

        const testPhone = '9876543210';

        // Clean up any test records
        await Otp.deleteMany({ phone: testPhone });
        await LoginLog.deleteMany({ userPhone: testPhone });

        // Step 1: Request Guest OTP
        console.log('Testing requestGuestPhoneOtp...');
        const reqResult = await requestGuestPhoneOtp(testPhone, { ip: '127.0.0.1', userAgent: 'TestRunner' });
        assert.strictEqual(reqResult.success, true);
        assert.strictEqual(reqResult.phone, testPhone);
        assert.ok(reqResult.devOtp, 'devOtp should be present in development mode');
        const generatedOtp = reqResult.devOtp;
        console.log(`✓ OTP successfully generated: ${generatedOtp}`);

        // Step 2: Cooldown test (requesting immediately should throw 429)
        let cooldownHit = false;
        try {
            await requestGuestPhoneOtp(testPhone);
        } catch (err) {
            cooldownHit = true;
            assert.strictEqual(err.status, 429);
            console.log('✓ Test 2 Passed: 60-second resend cooldown strictly enforced.');
        }
        assert.strictEqual(cooldownHit, true);

        // Step 3: Verify with invalid OTP
        let invalidHit = false;
        try {
            await verifyGuestPhoneOtp(testPhone, '000000');
        } catch (err) {
            invalidHit = true;
            assert.strictEqual(err.status, 400);
            console.log('✓ Test 3 Passed: Invalid OTP attempt correctly rejected.');
        }
        assert.strictEqual(invalidHit, true);

        // Step 4: Verify with correct OTP
        const verifyResult = await verifyGuestPhoneOtp(testPhone, generatedOtp, { ip: '127.0.0.1', userAgent: 'TestRunner' });
        assert.strictEqual(verifyResult.success, true);
        assert.ok(verifyResult.token, 'Token must be issued');
        assert.strictEqual(verifyResult.user.role, 'Guest');
        assert.strictEqual(verifyResult.user.phone, testPhone);
        assert.deepStrictEqual(verifyResult.user.allowedPages, ['/qr-scanner']);

        // Verify JWT token
        const decoded = jwt.verify(verifyResult.token, env.JWT_SECRET);
        assert.strictEqual(decoded.role, 'Guest');
        assert.deepStrictEqual(decoded.allowedPages, ['/qr-scanner']);
        console.log('✓ Test 4 Passed: Guest OTP verified and JWT token issued with scoped permissions.');

        // Step 5: Check LoginLog
        const logEntry = await LoginLog.findOne({ userPhone: testPhone });
        assert.ok(logEntry, 'LoginLog must be created for Guest login');
        assert.strictEqual(logEntry.role, 'Guest');
        assert.strictEqual(logEntry.status, 'Success');
        console.log('✓ Test 5 Passed: Guest login logged in LoginLog audit trail.');

        // Cleanup
        await Otp.deleteMany({ phone: testPhone });
        await LoginLog.deleteMany({ userPhone: testPhone });

        console.log('\n=============================================');
        console.log('ALL GUEST MOBILE SMS OTP TESTS PASSED (5/5)!');
        console.log('=============================================\n');
    } finally {
        await mongoose.disconnect();
    }
}

runIntegrationTests().catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
});

