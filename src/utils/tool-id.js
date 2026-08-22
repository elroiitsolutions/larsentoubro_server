import mongoose from 'mongoose';
import { Counter } from '../models/counter.model.js';
import { Tool } from '../models/tool.model.js';

/**
 * Helper to extract initials from words in a string.
 * Rule:
 * 1. Split string by whitespace into space-separated groups.
 * 2. For each group: if it contains a hyphen ('-'), take only the text before the first hyphen.
 * 3. Extract the first character of each valid group.
 *
 * @param {string} str
 * @param {boolean} ignoreZero - If true, standalone '0' tokens are ignored (default: true).
 * @returns {string}
 */
function getWordInitials(str, ignoreZero = true) {
    if (!str || typeof str !== 'string') return '';
    const trimmed = str.trim().toUpperCase();
    if (!trimmed) return '';

    // Split string into space-separated words/groups
    const spaceTokens = trimmed.split(/\s+/).filter(Boolean);

    // For each group, take only text before the first '-'
    const processedTokens = spaceTokens.map(token => {
        const beforeHyphen = token.split('-')[0];
        return beforeHyphen.split(/[,_\/]+/).filter(Boolean);
    }).flat();

    // Filter standalone '0' tokens if ignoreZero is true
    const validTokens = ignoreZero ? processedTokens.filter(t => t !== '0') : processedTokens;

    return validTokens.map(t => t[0]).join('');
}

class ToolIdGenerator {
    /**
     * Section 2: Description Code
     * Take initials only from words before the first "-". Ignore "-" and everything after it.
     */
    static generateDescriptionCode(description) {
        return getWordInitials(description);
    }

    /**
     * Section 3: Metal Code
     * Take initials only from words before the first "-". Ignore "-" and everything after it.
     */
    static generateMetalCode(metalType) {
        return getWordInitials(metalType);
    }

    /**
     * Section 4: Tool Variant Code
     * Take initials only from words before the first "-", preserving all digits including '0'.
     */
    static generateVariantCode(toolVariant) {
        return getWordInitials(toolVariant, false);
    }

    /**
     * Section 5: Capacity & Safe Working Load Code
     * Handles capacity / safe working load formatting.
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

        // Isolate the numeric portion
        const numPartRaw = str.replace(/[a-zA-Z]/g, '').trim();

        // Check if there are spaces between digits (e.g. "0 0 5", "0 5 0", "1 0 0")
        const hasSpacedDigits = /\d\s+\d/.test(numPartRaw);

        if (hasSpacedDigits) {
            // Preserve all digits by removing spaces between them (e.g. "0 0 5" -> "005")
            const cleanedDigits = numPartRaw.replace(/\s+/g, '');
            return `${cleanedDigits}${unit}`;
        } else {
            // Standard numeric format (e.g. "005", "05", "5", "50", "100")
            // Remove unnecessary leading zeros without removing meaningful zeros
            const cleanedDigits = numPartRaw.replace(/\s+/g, '');
            if (!cleanedDigits) return unit;
            const normalized = cleanedDigits.replace(/^0+(?=\d)/, '');
            return `${normalized}${unit}`;
        }
    }

    static generateSafeWorkingLoadCode(swl) {
        return this.generateCapacityCode(swl);
    }

    /**
    /**
     * Section 6: Date Code
     * Converts date of supply into MMYY string.
     * Supports Date objects, DD/MM/YYYY, YYYY-MM-DD, and Excel serial numbers (including 1/1/46165 format).
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

            let str = String(dateOfSupply).trim();
            if (!str) return '';

            // Handle Excel serial dates (raw number like "46165")
            if (!isNaN(Number(str)) && Number(str) > 30000 && Number(str) < 100000 && !str.includes('/') && !str.includes('-')) {
                const excelEpoch = new Date(Date.UTC(1899, 11, 30));
                const dateObj = new Date(excelEpoch.getTime() + Number(str) * 86400000);
                if (!isNaN(dateObj.getTime())) {
                    const mm = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
                    const yy = String(dateObj.getUTCFullYear()).slice(-2);
                    return mm + yy;
                }
            }

            // Handle invalid parsed strings like "1/1/46165" where year part is Excel serial number
            if (str.includes('/')) {
                const parts = str.split('/');
                if (parts.length === 3) {
                    const yearNum = Number(parts[2]);
                    if (!isNaN(yearNum) && yearNum > 30000 && yearNum < 100000) {
                        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
                        const dateObj = new Date(excelEpoch.getTime() + yearNum * 86400000);
                        if (!isNaN(dateObj.getTime())) {
                            const mm = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
                            const yy = String(dateObj.getUTCFullYear()).slice(-2);
                            return mm + yy;
                        }
                    }

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
            if (!isNaN(parsed.getTime()) && parsed.getFullYear() < 3000) {
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
        const capVal = (toolData.capacity !== undefined && toolData.capacity !== null && String(toolData.capacity).trim() !== '')
            ? toolData.capacity
            : toolData.safeWorkingLoad;
        const capCode = this.generateCapacityCode(capVal);
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
        const capVal = (toolData.capacity !== undefined && toolData.capacity !== null && String(toolData.capacity).trim() !== '')
            ? toolData.capacity
            : toolData.safeWorkingLoad;
        const capCode = this.generateCapacityCode(capVal);
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

