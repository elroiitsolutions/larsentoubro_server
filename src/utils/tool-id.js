import mongoose from 'mongoose';
import { Counter } from '../models/counter.model.js';
import { Tool } from '../models/tool.model.js';

/**
 * Helper to extract initials from words in a string, ignoring standalone '0' tokens.
 */
function getWordInitials(str) {
    if (!str || typeof str !== 'string') return '';
    const trimmed = str.trim().toUpperCase();
    if (!trimmed) return '';

    // Split by whitespace and common separators
    const tokens = trimmed.split(/[\s,_\-\/]+/).filter(Boolean);
    // Ignore standalone '0' tokens
    const validTokens = tokens.filter(t => t !== '0');

    return validTokens.map(t => t[0]).join('');
}

class ToolIdGenerator {
    /**
     * Section 2: Description Code
     * Generate code by taking first character of each word. Ignore standalone '0'.
     */
    static generateDescriptionCode(description) {
        return getWordInitials(description);
    }

    /**
     * Section 3: Metal Code
     * Generate code using word-initial logic. Ignore standalone '0'.
     */
    static generateMetalCode(metalType) {
        return getWordInitials(metalType);
    }

    /**
     * Section 4: Tool Variant Code
     * Generate code using word-initial logic.
     */
    static generateVariantCode(toolVariant) {
        return getWordInitials(toolVariant);
    }

    /**
     * Section 5: Capacity Code
     * Handles capacity formatting.
     * Distinguishes between numeric values with leading zeros (e.g. "005" -> "5")
     * and space-separated digits (e.g. "0 0 5" -> "005").
     */
    static generateCapacityCode(capacity) {
        if (capacity === null || capacity === undefined) return '';
        const str = String(capacity).trim();
        if (!str) return '';

        // Extract optional unit suffix (e.g. 'T', 'Tonnes', 'K', 'Kg', 'M', etc.)
        let unit = '';
        const unitMatch = str.match(/([a-zA-Z]+)\s*$/);
        if (unitMatch) {
            const rawUnit = unitMatch[1].toUpperCase();
            if (rawUnit.startsWith('T')) unit = 'T';
            else if (rawUnit.startsWith('K')) unit = 'K';
            else if (rawUnit.startsWith('M')) unit = 'M';
            else unit = rawUnit[0];
        }

        // Isolate the numeric portion (remove non-digits except spaces)
        const numPartRaw = str.replace(/[a-zA-Z]/g, '').trim();

        // Check if there are spaces between digits (e.g. "0 0 5", "0 5 0", "1 0 0")
        const hasSpacedDigits = /\d\s+\d/.test(numPartRaw);

        if (hasSpacedDigits) {
            // Preserve all digits by removing spaces between them (e.g. "0 0 5" -> "005")
            const cleanedDigits = numPartRaw.replace(/\s+/g, '');
            return `${cleanedDigits}${unit}`;
        } else {
            // Standard numeric format (e.g. "005", "05", "5", "50", "100")
            // Parse as integer to strip unwanted leading zeros ("005" -> "5", "05" -> "5")
            const cleanedDigits = numPartRaw.replace(/\s+/g, '');
            if (!cleanedDigits) return unit;
            const parsedNum = parseInt(cleanedDigits, 10);
            const valStr = isNaN(parsedNum) ? cleanedDigits : String(parsedNum);
            return `${valStr}${unit}`;
        }
    }

    /**
     * Section 6: Date Code
     * Converts date of supply into MMYY string.
     * Supports Date objects, DD/MM/YYYY, YYYY-MM-DD, and Excel serial numbers.
     */
    static generateDateCode(dateOfSupply) {
        if (!dateOfSupply) return '';

        try {
            if (dateOfSupply instanceof Date) {
                if (isNaN(dateOfSupply.getTime())) return '';
                const mm = String(dateOfSupply.getMonth() + 1).padStart(2, '0');
                const yy = String(dateOfSupply.getFullYear()).slice(-2);
                return mm + yy;
            }

            const str = String(dateOfSupply).trim();
            if (!str) return '';

            // Handle Excel serial dates
            if (!isNaN(Number(str)) && Number(str) > 30000 && !str.includes('/') && !str.includes('-')) {
                const excelEpoch = new Date(1899, 11, 30);
                const dateObj = new Date(excelEpoch.getTime() + Number(str) * 86400000);
                if (!isNaN(dateObj.getTime())) {
                    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const yy = String(dateObj.getFullYear()).slice(-2);
                    return mm + yy;
                }
            }

            if (str.includes('/')) {
                const parts = str.split('/');
                if (parts.length === 3) {
                    if (parts[0].length === 4) {
                        // YYYY/MM/DD
                        const mm = parts[1].padStart(2, '0');
                        const yy = parts[0].slice(-2);
                        return mm + yy;
                    } else {
                        // DD/MM/YYYY
                        const mm = parts[1].padStart(2, '0');
                        const yy = parts[2].slice(-2);
                        return mm + yy;
                    }
                }
            } else if (str.includes('-')) {
                const parts = str.split('T')[0].split('-');
                if (parts.length === 3) {
                    if (parts[0].length === 4) {
                        // YYYY-MM-DD
                        const mm = parts[1].padStart(2, '0');
                        const yy = parts[0].slice(-2);
                        return mm + yy;
                    } else {
                        // DD-MM-YYYY
                        const mm = parts[1].padStart(2, '0');
                        const yy = parts[2].slice(-2);
                        return mm + yy;
                    }
                }
            }

            const parsed = new Date(str);
            if (!isNaN(parsed.getTime())) {
                const mm = String(parsed.getMonth() + 1).padStart(2, '0');
                const yy = String(parsed.getFullYear()).slice(-2);
                return mm + yy;
            }
        } catch (e) {
            return '';
        }

        return '';
    }

    /**
     * Section 7: Purchaser Code
     * Generate initials using word-initial logic.
     */
    static generatePurchaserCode(purchaserName) {
        return getWordInitials(purchaserName);
    }

    /**
     * Section 8: Serial Number Formatting
     * Minimum display width of 4 digits. Does not truncate values >= 10000.
     */
    static formatSerial(serialNum) {
        if (serialNum === null || serialNum === undefined) return '0000';
        const str = String(serialNum).trim();
        if (str.length < 4) {
            return str.padStart(4, '0');
        }
        return str;
    }

    /**
     * Helper to derive the project scope key for serial counter (scoped per Project).
     */
    static getProjectScopeKey(toolData = {}) {
        let projId = toolData.project || toolData.projectId || toolData.currentSite;
        if (projId && typeof projId === 'object') {
            projId = projId._id || projId.id || projId;
        }
        const cleanStr = String(projId || '').trim();
        return cleanStr ? `project_${cleanStr}` : 'GLOBAL';
    }

    // Alias for backward compatibility
    static getToolCodeKey(toolData = {}) {
        return this.getProjectScopeKey(toolData);
    }

    /**
     * Section 8 & 9: Concurrency-safe atomic serial counter allocation per Project scope.
     * Self-healing: Always syncs counter against maximum existing serial in database.
     */
    static async allocateSerials(count = 1, projectScopeKey = 'GLOBAL') {
        if (count <= 0) return 0;
        const cleanKey = String(projectScopeKey).trim().replace(/[^A-Z0-9_-]/gi, '_') || 'GLOBAL';
        const counterId = `tool_serial_${cleanKey}`;

        const rawProjId = cleanKey.replace(/^project_/, '');
        let query = {};
        if (rawProjId !== 'GLOBAL') {
            const isObjId = mongoose.Types.ObjectId.isValid(rawProjId);
            query = {
                $or: [
                    { project: rawProjId },
                    ...(isObjId ? [{ project: new mongoose.Types.ObjectId(rawProjId) }] : [])
                ]
            };
        }

        const tools = await Tool.find(query, { serialNumber: 1, toolId: 1 }).lean();
        let maxSerial = 0;
        for (const t of tools) {
            if (t.serialNumber && !isNaN(t.serialNumber) && t.serialNumber > maxSerial) {
                maxSerial = t.serialNumber;
            } else if (t.toolId) {
                const match = t.toolId.match(/\d+$/);
                if (match) {
                    const serialNum = parseInt(match[0], 10);
                    if (!isNaN(serialNum) && serialNum > maxSerial) {
                        maxSerial = serialNum;
                    }
                }
            }
        }

        const counter = await Counter.findById(counterId);
        // Self-healing: If counter doesn't exist, or if counter seq is higher than actual DB tools (e.g. from a failed import)
        if (!counter || counter.seq > maxSerial) {
            await Counter.findByIdAndUpdate(
                counterId,
                { seq: maxSerial },
                { upsert: true }
            );
        }

        const updatedCounter = await Counter.findByIdAndUpdate(
            counterId,
            { $inc: { seq: count } },
            { new: true, upsert: true }
        );

        return updatedCounter.seq - count + 1;
    }

    static async allocateSerial(projectScopeKey = 'GLOBAL') {
        return await this.allocateSerials(1, projectScopeKey);
    }

    /**
     * Section 13: Prefix Generation
     */
    static generatePrefix(toolData = {}) {
        const descCode = this.generateDescriptionCode(toolData.description);
        const metalCode = this.generateMetalCode(toolData.metalType);
        const variantCode = this.generateVariantCode(toolData.toolVariant);
        const capCode = this.generateCapacityCode(toolData.capacity);
        const dateCode = this.generateDateCode(toolData.dateOfSupply);
        const purchaserCode = this.generatePurchaserCode(toolData.purchaserName);

        return `${descCode}${metalCode}${variantCode}${capCode}${dateCode}${purchaserCode}`;
    }

    // Alias for backward compatibility
    static generateToolIdPrefix(toolData = {}) {
        return this.generatePrefix(toolData);
    }

    /**
     * Section 13 & 14: Main ToolID generation function
     */
    static generateToolId(toolData = {}, serialNum) {
        const descCode = this.generateDescriptionCode(toolData.description);
        const metalCode = this.generateMetalCode(toolData.metalType);
        const variantCode = this.generateVariantCode(toolData.toolVariant);
        const capCode = this.generateCapacityCode(toolData.capacity);
        const dateCode = this.generateDateCode(toolData.dateOfSupply);
        const purchaserCode = this.generatePurchaserCode(toolData.purchaserName);
        const serialStr = this.formatSerial(serialNum);

        const prefix = `${descCode}${metalCode}${variantCode}${capCode}${dateCode}${purchaserCode}`;
        const toolId = `${prefix}${serialStr}`;

        if (process.env.NODE_ENV !== 'production' && !toolData.isBulk) {
            console.log(`[ToolIdGenerator] Generated ToolID: ${toolId} for ${toolData.description || 'Tool'}`);
        }

        return toolId;
    }

    /**
     * Section 12: QR Link Generation
     */
    static generateQrLink(toolId) {
        if (!toolId) return '';
        return `https://lntqr.com/vt/${toolId}`;
    }
}

export default ToolIdGenerator;

