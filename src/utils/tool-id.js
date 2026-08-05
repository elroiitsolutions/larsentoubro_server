import mongoose from 'mongoose';
import { Counter } from '../models/counter.model.js';
import { Tool } from '../models/tool.model.js';

class ToolIdGenerator {
    static generateVariantCode(variantStr) {
        if (!variantStr) return '000';
        let str = variantStr.trim().toUpperCase();
        
        const hasNumbers = /\d/.test(str);
        const hasLetters = /[A-Z]/.test(str);
        
        // 1. Numeric only (e.g. "0 1 7" -> "017")
        if (hasNumbers && !hasLetters) {
            let numeric = str.replace(/\D/g, ''); // all digits
            return numeric.padStart(3, '0').substring(numeric.padStart(3, '0').length - 3);
        }
        
        // 2. Numbers and words (e.g. "0 9 HALF" -> "09H", "4 B C" -> "4BC")
        if (hasNumbers && hasLetters) {
            let nums = str.replace(/\D/g, ''); // get all digits
            let words = str.match(/[A-Z]+/g) || []; // get all alphabetic words
            let letters = words.map(w => w[0]).join(''); // first letter of each word
            
            let result = nums + letters;
            
            if (result.length > 3) {
                // If it exceeds 3 characters, truncate to 3. 
                // Alternatively, if there are many digits, we might want to keep the last digits, but 
                // standard truncation is safest based on examples.
                result = result.substring(0, 3);
            } else if (result.length < 3) {
                // If it's short (e.g. "1 H" -> "1H"), pad the numeric part with leading zeros to make it 3
                let neededPadding = 3 - result.length;
                result = '0'.repeat(neededPadding) + result;
            }
            return result;
        }
        
        // 3. Words only (e.g. "DOUBLE OPEN PULLY" -> "DOP")
        if (!hasNumbers && hasLetters) {
            let words = str.split(/[\s_-]+/).filter(w => w.length > 0);
            let result = '';
            for (let i = 0; i < Math.min(3, words.length); i++) {
                result += words[i][0];
            }
            return result.padEnd(3, 'X');
        }
        
        return '000';
    }

    static generateToolIdPrefix(tool) {
        // 1. Tool Name Code (2-letter)
        const words = (tool.description || '').trim().split(/\s+/);
        let toolNameCode = 'XX';
        if (words.length > 1 && words[0].length > 0 && words[1].length > 0) {
            toolNameCode = (words[0][0] + words[1][0]).toUpperCase();
        } else if (words.length === 1 && words[0].length >= 2) {
            toolNameCode = words[0].substring(0, 2).toUpperCase();
        } else if (words.length === 1 && words[0].length === 1) {
            toolNameCode = (words[0][0] + 'X').toUpperCase();
        }

        // 2. Metal Type (1-letter)
        const metalType = (tool.metalType || 'X').substring(0, 1).toUpperCase();

        // 3. Tool Variant (3-char)
        const toolVariantCode = this.generateVariantCode(tool.toolVariant);

        // 4. Capacity (3-digit zero-padded)
        const capMatch = (tool.capacity || '').match(/\d+/);
        const capNum = capMatch ? capMatch[0] : '0';
        const capacityCode = String(parseInt(capNum, 10)).padStart(3, '0');

        // 5. Month & Year (MMYY)
        let monthYear = '0000';
        if (tool.dateOfSupply) {
            if (tool.dateOfSupply.includes('/')) {
                const dateParts = tool.dateOfSupply.split('/'); // DD/MM/YYYY
                if (dateParts.length === 3) {
                    const yy = dateParts[2].substring(2, 4);
                    const mm = dateParts[1].padStart(2, '0');
                    monthYear = mm + yy;
                }
            } else if (tool.dateOfSupply.includes('-')) {
                const dateParts = tool.dateOfSupply.split('-'); // YYYY-MM-DD
                if (dateParts.length === 3) {
                    const yy = dateParts[0].substring(2, 4);
                    const mm = dateParts[1].padStart(2, '0');
                    monthYear = mm + yy;
                }
            }
        }

        // 6. Purchaser Code (2-letter from initials of first two words)
        const purchaserWords = (tool.purchaserName || '').trim().split(/\s+/);
        let purchaserCode = 'XX';
        if (purchaserWords.length > 1 && purchaserWords[0].length > 0 && purchaserWords[1].length > 0) {
            purchaserCode = (purchaserWords[0][0] + purchaserWords[1][0]).toUpperCase();
        } else if (purchaserWords.length === 1 && purchaserWords[0].length >= 2) {
            purchaserCode = purchaserWords[0].substring(0, 2).toUpperCase();
        } else if (purchaserWords.length === 1 && purchaserWords[0].length === 1) {
            purchaserCode = (purchaserWords[0][0] + 'X').toUpperCase();
        }

        // Assemble prefix without spaces
        return `${toolNameCode}${metalType}${toolVariantCode}${capacityCode}${monthYear}${purchaserCode}`;
    }

    static async allocateSerials(count = 1) {
        // Initialize counter if it doesn't exist
        const exists = await Counter.findById('tool_serial');
        if (!exists) {
            // Find highest serial from existing tools
            // Note: Since toolId structure is PREFIX + SERIAL, we can extract the trailing digits
            const tools = await Tool.find({}, { toolId: 1 }).lean();
            let maxSerial = 0;
            for (const t of tools) {
                if (t.toolId) {
                    const match = t.toolId.match(/\d+$/);
                    if (match) {
                        const serialNum = parseInt(match[0], 10);
                        if (!isNaN(serialNum) && serialNum > maxSerial) {
                            maxSerial = serialNum;
                        }
                    }
                }
            }
            await Counter.findByIdAndUpdate(
                'tool_serial', 
                { $setOnInsert: { seq: maxSerial } }, 
                { upsert: true }
            );
        }

        // Atomically increment and get the new state
        const counter = await Counter.findByIdAndUpdate(
            'tool_serial',
            { $inc: { seq: count } },
            { new: true, upsert: true }
        );

        // Calculate starting serial
        const startSerial = counter.seq - count + 1;
        return startSerial;
    }
}

export default ToolIdGenerator;
