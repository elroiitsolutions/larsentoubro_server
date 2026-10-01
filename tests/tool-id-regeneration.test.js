import test from 'node:test';
import assert from 'node:assert/strict';
import ToolIdGenerator from '../src/utils/tool-id.js';
import { syncToolIdReferences } from '../src/services/tool.service.js';

test('ToolIdGenerator - Purchaser Name Edit automatically updates Tool ID and QR Link', async (t) => {
    const originalTool = {
        description: 'D Shackle-4.5T',
        metalType: 'STEEL',
        toolVariant: 'SINGLE OPEN PULLY',
        capacity: '0 0 5',
        dateOfSupply: '31/08/2025',
        purchaserName: 'UNO Engineering'
    };

    const serialNum = 1;
    const initialToolId = ToolIdGenerator.generateToolId(originalTool, serialNum);
    assert.equal(initialToolId, 'DSSSOP0050825UE0001');

    const updatedTool = {
        ...originalTool,
        purchaserName: 'UNO Tiger'
    };

    const regeneratedToolId = ToolIdGenerator.generateToolId(updatedTool, serialNum);
    assert.equal(regeneratedToolId, 'DSSSOP0050825UT0001');
    assert.notEqual(initialToolId, regeneratedToolId);

    const regeneratedQrLink = ToolIdGenerator.generateQrLink(regeneratedToolId);
    assert.equal(regeneratedQrLink, 'https://lntqr.com/vt/DSSSOP0050825UT0001');
});

test('ToolIdGenerator - All Contributing Field Edits Trigger Correct Tool ID Regeneration', async (t) => {
    const baseTool = {
        description: 'HYDRAULIC JACK',
        metalType: 'STEEL',
        toolVariant: 'SINGLE',
        capacity: '10 T',
        dateOfSupply: '15/05/2024',
        purchaserName: 'LARSEN TOUBRO'
    };

    const serialNum = 42;
    const initialToolId = ToolIdGenerator.generateToolId(baseTool, serialNum);
    assert.equal(initialToolId, 'HJSS10T0524LT0042');

    // 1. Description Edit: HYDRAULIC JACK -> DOUBLE OPEN PULLEY
    const descEdited = { ...baseTool, description: 'DOUBLE OPEN PULLEY' };
    assert.equal(ToolIdGenerator.generateToolId(descEdited, serialNum), 'DOPSS10T0524LT0042');

    // 2. Metal Type Edit: STEEL -> ALUMINUM
    const metalEdited = { ...baseTool, metalType: 'ALUMINUM' };
    assert.equal(ToolIdGenerator.generateToolId(metalEdited, serialNum), 'HJAS10T0524LT0042');

    // 3. Variant Edit: SINGLE -> DOUBLE OPEN PULLEY
    const variantEdited = { ...baseTool, toolVariant: 'DOUBLE OPEN PULLEY' };
    assert.equal(ToolIdGenerator.generateToolId(variantEdited, serialNum), 'HJSDOP10T0524LT0042');

    // 4. Capacity / SWL Edit: 10 T -> 50 T
    const capEdited = { ...baseTool, capacity: '50 T' };
    assert.equal(ToolIdGenerator.generateToolId(capEdited, serialNum), 'HJSS50T0524LT0042');

    // 5. Date of Supply Edit: 15/05/2024 -> 10/12/2026
    const dateEdited = { ...baseTool, dateOfSupply: '10/12/2026' };
    assert.equal(ToolIdGenerator.generateToolId(dateEdited, serialNum), 'HJSS10T1226LT0042');
});

test('syncToolIdReferences - Graceful handling when no database connection present in unit scope', async (t) => {
    // Verifies that function safely handles invocation without crashing
    const dummyObjectId = '60d5ecf9f1b2c81234567890';
    await syncToolIdReferences(dummyObjectId, 'DSSSOP0050825UE0001', 'DSSSOP0050825UT0001');
    assert.ok(true);
});
