import assert from 'assert';

console.log('--- Testing Bulk Import Automatic Validation Period Generation ---');

function resolveAutoValidity(purchaserName, existingValidity) {
    const rawVal = (existingValidity !== undefined && existingValidity !== null) ? String(existingValidity).trim() : '';
    if (rawVal && rawVal !== '' && rawVal !== 'N/A' && rawVal !== '-') {
        return rawVal;
    }

    const purchaserStr = (purchaserName || '').trim().toLowerCase();
    if (purchaserStr === 'third party inspection' || purchaserStr.includes('third party inspection')) {
        return '1 Year';
    }
    return '3 Years';
}

// Case 1: Purchaser Name = "Third Party Inspection" -> Validation = "1 Year"
const val1 = resolveAutoValidity('Third Party Inspection', '');
assert.strictEqual(val1, '1 Year', 'Third Party Inspection should set Validation to 1 Year');

const val1Case = resolveAutoValidity('third party inspection', null);
assert.strictEqual(val1Case, '1 Year', 'Case insensitive match for third party inspection should set 1 Year');

// Case 2: Purchaser Name = Any other name -> Validation = "3 Years"
const val2 = resolveAutoValidity('LARSEN TOUBRO', '');
assert.strictEqual(val2, '3 Years', 'Other purchaser names should set Validation to 3 Years');

const val3 = resolveAutoValidity('Siemens Supplier', undefined);
assert.strictEqual(val3, '3 Years', 'Other purchaser names should set Validation to 3 Years');

const val4 = resolveAutoValidity('', 'N/A');
assert.strictEqual(val4, '3 Years', 'Unspecified purchaser should default Validation to 3 Years');

// Case 3: Manually supplied validation value in Excel -> Preserve manual value
const val5 = resolveAutoValidity('Third Party Inspection', '5 Years');
assert.strictEqual(val5, '5 Years', 'Manually supplied validation period must be preserved');

console.log('✓ Test 1: Third Party Inspection -> 1 Year auto-generated.');
console.log('✓ Test 2: Other Purchaser Names -> 3 Years auto-generated.');
console.log('✓ Test 3: Manually supplied Validation values preserved.');
console.log('--- All Bulk Upload Validation Tests Passed Successfully! ---');
