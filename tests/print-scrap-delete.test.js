import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import ToolIdGenerator from '../src/utils/tool-id.js';

test('Printed vs Unprinted Tool Deletion & Resequencing Rules', async (t) => {
    // 1. Verify Date & Serial code format consistency
    const dateCode = ToolIdGenerator.generateDateCode('23-05-2026');
    assert.equal(dateCode, '0526');

    // 2. Mock tools list simulating active project inventory: 001, 002, 003, 004, 005
    const projectTools = [
        { _id: '1', toolId: 'TL001', serialNumber: 1, isPrinted: false, isDeleted: false, isScrapped: false },
        { _id: '2', toolId: 'TL002', serialNumber: 2, isPrinted: false, isDeleted: false, isScrapped: false },
        { _id: '3', toolId: 'TL003', serialNumber: 3, isPrinted: false, isDeleted: false, isScrapped: false },
        { _id: '4', toolId: 'TL004', serialNumber: 4, isPrinted: true,  isDeleted: false, isScrapped: false }, // PRINTED
        { _id: '5', toolId: 'TL005', serialNumber: 5, isPrinted: false, isDeleted: false, isScrapped: false }
    ];

    // Case A: Delete Printed Tool (TL004)
    const printedTool = projectTools.find(t => t.toolId === 'TL004');
    printedTool.isDeleted = true;
    printedTool.isScrapped = true;
    printedTool.status = 'Scrapped';

    // Active tools rule for printed delete: NO re-sequencing allowed
    const activeToolsAfterPrintedDelete = projectTools.filter(t => !t.isDeleted && !t.isScrapped);
    assert.equal(activeToolsAfterPrintedDelete.length, 4);
    assert.equal(activeToolsAfterPrintedDelete.map(t => t.toolId).join(','), 'TL001,TL002,TL003,TL005');
    assert.equal(activeToolsAfterPrintedDelete.find(t => t._id === '5').serialNumber, 5, '005 keeps original serial number');

    // Case B: Delete Unprinted Tool (TL002)
    const unprintedTool = projectTools.find(t => t.toolId === 'TL002');
    unprintedTool.isDeleted = true;
    unprintedTool.isScrapped = false;
    unprintedTool.status = 'Deleted';

    // Active tools rule for unprinted delete: re-sequence remaining unprinted tools
    const remainingActive = projectTools.filter(t => !t.isDeleted && !t.isScrapped);
    let seq = 1;
    for (const tool of remainingActive) {
        if (tool.isPrinted) {
            // Keep printed serial
            if (tool.serialNumber >= seq) seq = tool.serialNumber + 1;
        } else {
            tool.serialNumber = seq;
            tool.toolId = `TL00${seq}`;
            seq++;
        }
    }

    assert.equal(remainingActive.find(t => t._id === '1').toolId, 'TL001');
    assert.equal(remainingActive.find(t => t._id === '3').toolId, 'TL002'); // Resequenced from 003 to 002
    assert.equal(remainingActive.find(t => t._id === '5').toolId, 'TL003'); // Resequenced
});
