import test from 'node:test';
import assert from 'node:assert/strict';
import ToolIdGenerator from '../src/utils/tool-id.js';

test('ToolIdGenerator - generateDescriptionCode', async (t) => {
    assert.equal(ToolIdGenerator.generateDescriptionCode('HYDRAULIC JACK'), 'HJ');
    assert.equal(ToolIdGenerator.generateDescriptionCode('SINGLE SHEAVE'), 'SS');
    assert.equal(ToolIdGenerator.generateDescriptionCode('DOUBLE OPEN PULLEY'), 'DOP');
    assert.equal(ToolIdGenerator.generateDescriptionCode('HYDRAULIC 0 JACK'), 'HJ');
    // Description-Based Tool Code rules: hyphen in word group extracts text before hyphen for that group
    assert.equal(ToolIdGenerator.generateDescriptionCode('D Shackle-4.5T'), 'DS');
    assert.equal(ToolIdGenerator.generateDescriptionCode('Dinesh Kummar-Test Tool'), 'DKT');
    assert.equal(ToolIdGenerator.generateDescriptionCode('Comealong-Clamp Earthwire'), 'CE');
    assert.equal(ToolIdGenerator.generateDescriptionCode('Dinesh-Kummar'), 'D');
    assert.equal(ToolIdGenerator.generateDescriptionCode('Single Open Pully'), 'SOP');
    assert.equal(ToolIdGenerator.generateDescriptionCode(''), '');
});

test('ToolIdGenerator - generateMetalCode', async (t) => {
    assert.equal(ToolIdGenerator.generateMetalCode('STEEL'), 'S');
    assert.equal(ToolIdGenerator.generateMetalCode('STAINLESS STEEL'), 'SS');
    assert.equal(ToolIdGenerator.generateMetalCode('STAINLESS STEEL-GRADE A'), 'SSA');
    assert.equal(ToolIdGenerator.generateMetalCode('ALUMINUM'), 'A');
    assert.equal(ToolIdGenerator.generateMetalCode(''), '');
});

test('ToolIdGenerator - generateVariantCode', async (t) => {
    assert.equal(ToolIdGenerator.generateVariantCode('SINGLE OPEN PULLY'), 'SOP');
    assert.equal(ToolIdGenerator.generateVariantCode('DOUBLE OPEN PULLEY'), 'DOP');
    assert.equal(ToolIdGenerator.generateVariantCode('SINGLE'), 'S');
    // Tool Variant rules: preserve leading zeros and digits with spaces, ignore after hyphen per group
    assert.equal(ToolIdGenerator.generateVariantCode('0 4 Half'), '04H');
    assert.equal(ToolIdGenerator.generateVariantCode('0 4 Half-Spec'), '04H');
    assert.equal(ToolIdGenerator.generateVariantCode('4 B C'), '4BC');
    assert.equal(ToolIdGenerator.generateVariantCode('0 9 Half'), '09H');
    assert.equal(ToolIdGenerator.generateVariantCode('0 6 M'), '06M');
    assert.equal(ToolIdGenerator.generateVariantCode(''), '');
});

test('ToolIdGenerator - generateCapacityCode & generateSafeWorkingLoadCode', async (t) => {
    // Normal numeric values with leading zeros normalized
    assert.equal(ToolIdGenerator.generateCapacityCode('005'), '5');
    assert.equal(ToolIdGenerator.generateCapacityCode('05'), '5');
    assert.equal(ToolIdGenerator.generateCapacityCode('5'), '5');

    // Spaces intentionally separating individual digits preserved
    assert.equal(ToolIdGenerator.generateCapacityCode('0 0 5'), '005');
    assert.equal(ToolIdGenerator.generateCapacityCode('0 5 0'), '050');
    assert.equal(ToolIdGenerator.generateCapacityCode('1 0 0'), '100');

    // Values with unit suffixes
    assert.equal(ToolIdGenerator.generateCapacityCode('50 T'), '50T');
    assert.equal(ToolIdGenerator.generateCapacityCode('50T'), '50T');
    assert.equal(ToolIdGenerator.generateCapacityCode('100 T'), '100T');
    assert.equal(ToolIdGenerator.generateCapacityCode('0 0 5 T'), '005T');
    assert.equal(ToolIdGenerator.generateCapacityCode('005 T'), '5T');

    // Safe Working Load alias & consistency
    assert.equal(ToolIdGenerator.generateSafeWorkingLoadCode('005'), '5');
    assert.equal(ToolIdGenerator.generateSafeWorkingLoadCode('0 0 5'), '005');
    assert.equal(ToolIdGenerator.generateSafeWorkingLoadCode('0 5 0'), '050');
    assert.equal(ToolIdGenerator.generateSafeWorkingLoadCode('1 0 0'), '100');

    assert.equal(ToolIdGenerator.generateCapacityCode(''), '');
});

test('ToolIdGenerator - generateDateCode', async (t) => {
    assert.equal(ToolIdGenerator.generateDateCode('31/08/2025'), '0825');
    assert.equal(ToolIdGenerator.generateDateCode('15/05/2024'), '0524');
    assert.equal(ToolIdGenerator.generateDateCode('10/12/2026'), '1226');
    assert.equal(ToolIdGenerator.generateDateCode('2025-08-31'), '0825');
    assert.equal(ToolIdGenerator.generateDateCode('46165'), '0526');
    assert.equal(ToolIdGenerator.generateDateCode('1/1/46165'), '0526');
    assert.equal(ToolIdGenerator.generateDateCode('invalid-date'), '');
    assert.equal(ToolIdGenerator.generateDateCode(''), '');
});

test('ToolIdGenerator - generatePurchaserCode', async (t) => {
    assert.equal(ToolIdGenerator.generatePurchaserCode('UNO ENGINEERING'), 'UE');
    assert.equal(ToolIdGenerator.generatePurchaserCode('LARSEN TOUBRO'), 'LT');
    assert.equal(ToolIdGenerator.generatePurchaserCode('ADMIN'), 'A');
    // Purchaser hyphen rules
    assert.equal(ToolIdGenerator.generatePurchaserCode('Nike Energy-Manufacturing'), 'NE');
    assert.equal(ToolIdGenerator.generatePurchaserCode('Dinesh Kummar-Test Tool'), 'DKT');
    assert.equal(ToolIdGenerator.generatePurchaserCode('Dinesh-Kummar'), 'D');
    assert.equal(ToolIdGenerator.generatePurchaserCode(''), '');
});

test('ToolIdGenerator - formatSerial', async (t) => {
    assert.equal(ToolIdGenerator.formatSerial(1), '0001');
    assert.equal(ToolIdGenerator.formatSerial(25), '0025');
    assert.equal(ToolIdGenerator.formatSerial(999), '0999');
    assert.equal(ToolIdGenerator.formatSerial(1000), '1000');
    assert.equal(ToolIdGenerator.formatSerial(10000), '10000');
});

test('ToolIdGenerator - getProjectScopeKey', async (t) => {
    assert.equal(ToolIdGenerator.getProjectScopeKey({ project: 'proj_123' }), 'project_proj_123');
    assert.equal(ToolIdGenerator.getProjectScopeKey({ project: { _id: 'proj_456' } }), 'project_proj_456');
    assert.equal(ToolIdGenerator.getProjectScopeKey({ currentSite: 'store_789' }), 'project_store_789');
    assert.equal(ToolIdGenerator.getProjectScopeKey({}), 'GLOBAL');
});

test('ToolIdGenerator - Full ToolID & QR Link Assembly', async (t) => {
    const toolData = {
        description: 'D Shackle-4.5T',
        metalType: 'STEEL',
        toolVariant: 'SINGLE OPEN PULLY',
        capacity: '0 0 5',
        dateOfSupply: '31/08/2025',
        purchaserName: 'UNO ENGINEERING'
    };

    const toolId = ToolIdGenerator.generateToolId(toolData, 1);
    assert.equal(toolId, 'DSSSOP0050825UE0001');

    const qrLink = ToolIdGenerator.generateQrLink(toolId);
    assert.equal(qrLink, 'https://lntqr.com/vt/DSSSOP0050825UE0001');
});

test('ToolIdGenerator - Full ToolID Assembly with safeWorkingLoad fallback', async (t) => {
    const toolData = {
        description: 'Dinesh Kummar-Test Tool',
        metalType: 'STEEL',
        safeWorkingLoad: '0 5 0',
        dateOfSupply: '31/08/2025',
        purchaserName: 'LARSEN TOUBRO'
    };

    const toolId = ToolIdGenerator.generateToolId(toolData, 2);
    assert.equal(toolId, 'DKTS0500825LT0002');
});

test('ToolIdGenerator - Full ToolID Assembly for 0 4 Half Tool Variant', async (t) => {
    const toolData = {
        description: 'D Shackle-4.5T',
        metalType: 'Steel',
        toolVariant: '0 4 Half',
        capacity: '0 0 4',
        safeWorkingLoad: '0 0 3',
        dateOfSupply: '31/08/2025',
        purchaserName: 'UNO Engineering'
    };

    const toolId = ToolIdGenerator.generateToolId(toolData, 133);
    assert.equal(toolId, 'DSS04H0040825UE0133');
});
