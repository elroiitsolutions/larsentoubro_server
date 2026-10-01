import assert from 'assert';
import jwt from 'jsonwebtoken';

// Mock test for Guest User permissions and server-side tool validity calculation logic
console.log('--- Running Guest User Feature Tests ---');

// 1. Test JWT Generation for Guest Role
const JWT_SECRET = 'test_secret_key_123';
const guestPayload = {
    id: 'guest_user_id',
    email: 'guest@lnt.com',
    role: 'Guest',
    name: 'Guest User',
    allowedPages: ['/qr-scanner']
};

const token = jwt.sign(guestPayload, JWT_SECRET);
const decoded = jwt.verify(token, JWT_SECRET);

assert.strictEqual(decoded.role, 'Guest', 'Role should be Guest');
assert.strictEqual(decoded.email, 'guest@lnt.com', 'Email should match guest email');
console.log('✓ Test 1 Passed: Guest JWT token generation & payload verification.');

// 2. Test Guest Route Restrictions Logic
const allowedGuestPaths = [
    '/api/users/me',
    '/api/tools/lookup-validity',
    '/api/users/guest-login'
];

function isPathAllowedForGuest(url) {
    const cleanPath = url.split('?')[0];
    return allowedGuestPaths.some(p => cleanPath === p || cleanPath.startsWith('/api/tools/lookup-validity'));
}

assert.strictEqual(isPathAllowedForGuest('/api/tools/lookup-validity?code=T-0001'), true, 'Tool validity lookup must be allowed');
assert.strictEqual(isPathAllowedForGuest('/api/users/me'), true, 'User profile must be allowed');
assert.strictEqual(isPathAllowedForGuest('/api/projects'), false, 'Projects API must be forbidden');
assert.strictEqual(isPathAllowedForGuest('/api/stores/123/tools'), false, 'Stores tools API must be forbidden');
assert.strictEqual(isPathAllowedForGuest('/api/challans/history'), false, 'Challans API must be forbidden');
assert.strictEqual(isPathAllowedForGuest('/api/users'), false, 'Users API must be forbidden');
assert.strictEqual(isPathAllowedForGuest('/api/reports'), false, 'Reports API must be forbidden');
console.log('✓ Test 2 Passed: Guest API endpoint access restriction rules verified.');

import { computeToolValidityAndStatus } from '../src/controllers/tool.controller.js';

// 3. Test Server-side Expiry & Validity Calculation Logic
const futureTool = computeToolValidityAndStatus({ nextInspectionDueDate: '2028-10-01' });
assert.strictEqual(futureTool.validityStatus, 'VALID', 'Future date tool must be VALID');
assert.strictEqual(futureTool.isValid, true);
assert.strictEqual(futureTool.expiryDateFormatted, '2028-10-01');

const expiredTool = computeToolValidityAndStatus({ nextInspectionDueDate: '2022-01-01' });
assert.strictEqual(expiredTool.validityStatus, 'EXPIRED', 'Past date tool must be EXPIRED');
assert.strictEqual(expiredTool.isValid, false);
assert.strictEqual(expiredTool.expiryDateFormatted, '2022-01-01');

// Test Date of Supply + 1 Year Validation (Third Party Inspection)
const tpiTool = computeToolValidityAndStatus({
    dateOfSupply: '2025-01-01',
    purchaserName: 'Third Party Inspection'
});
assert.strictEqual(tpiTool.expiryDateFormatted, '2026-01-01', '1 Year validation must calculate Date of Supply + 1 year');

// Test Date of Supply + 3 Years Validation (General Purchaser)
const generalTool = computeToolValidityAndStatus({
    dateOfSupply: '2025-01-01',
    purchaserName: 'L&T Internal'
});
assert.strictEqual(generalTool.expiryDateFormatted, '2028-01-01', '3 Years validation must calculate Date of Supply + 3 years');

// Test missing date of supply fallback to createdAt
const createdAtTool = computeToolValidityAndStatus({
    createdAt: new Date('2025-06-01'),
    purchaserName: 'Third Party Inspection'
});
assert.strictEqual(createdAtTool.expiryDateFormatted, '2026-06-01', 'Missing supply date must fallback to createdAt');

console.log('✓ Test 3 Passed: Server-side tool validity calculation logic verified.');
console.log('--- All Guest Feature Tests Passed Successfully! ---');

