import PDFDocument from 'pdfkit';
import { LNT_LOGO_BASE64 } from '../assets/logoBase64.js';

/**
 * [SHARED] Challan PDF Generation Service
 * Generates official Larsen & Toubro PDF layout for Delivery, Return, and Scrap Delivery Challans.
 * Consumed by both Web Application and Mobile App for direct PDF downloads.
 */

/**
 * Format date to DD-MM-YYYY (e.g. 08-10-2026) matching web template
 */
const formatDate = (dateInput) => {
    if (!dateInput) return new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
    try {
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return String(dateInput);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
    } catch {
        return String(dateInput);
    }
};

/**
 * Format DC Number with 2-digit year and minimum 3-digit padding (e.g. DC-26-006, RC-26-001)
 */
const formatDCNumber = (numStr) => {
    if (!numStr) return 'DC-26-001';
    const str = String(numStr);
    return str.replace(/(SDC|DC|RC|STC|TC)-(\d{2,4})-(\d+)/i, (_, prefix, yr, num) => {
        const shortYr = String(yr).slice(-2);
        return `${prefix.toUpperCase()}-${shortYr}-${String(num).padStart(3, '0')}`;
    });
};

/**
 * Stream official Larsen & Toubro Challan PDF matching web template and reference layout
 */
export const streamChallanPdf = (challan, outputStream) => {
    return new Promise((resolve, reject) => {
        try {
            const isReturn = challan.challanType === 'Return' || challan.type === 'Return';
            const isScrapChallan = Boolean(
                challan.isScrapDC || 
                challan.challanType === 'Scrap' || 
                (challan.challanNumber && String(challan.challanNumber).startsWith('SDC-')) ||
                challan.vendor?.profileType === 'ScrapDealer' || 
                (challan.vendor?.vendorCode && String(challan.vendor.vendorCode).startsWith('SCR-')) ||
                (challan.remarks && typeof challan.remarks === 'string' && challan.remarks.toLowerCase().includes('scrap')) ||
                (challan.notes && typeof challan.notes === 'string' && challan.notes.toLowerCase().includes('scrap'))
            );

            const docTitle = isScrapChallan
                ? 'SCRAP DELIVERY CHALLAN'
                : isReturn
                ? 'RETURN CHALLAN'
                : 'DELIVERY CHALLAN';

            const dcNoLabel = isScrapChallan ? 'SDC NO.' : (isReturn ? 'RC NO.' : 'DC NO.');
            const docCode = isReturn ? 'ECC-O&M/STR/907' : (challan.docReferenceCode || 'ECC-D&M/STR/906');
            const challanNo = formatDCNumber(challan.challanNumber || challan._id);

            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 22, bottom: 25, left: 36, right: 36 },
                bufferPages: true
            });

            doc.on('error', reject);
            outputStream.on('finish', resolve);
            outputStream.error?.(reject);

            doc.pipe(outputStream);

            const startX = 36;
            const contentWidth = 523;

            // Prepare Logo
            let logoBuffer = null;
            try {
                if (LNT_LOGO_BASE64) {
                    const base64Data = LNT_LOGO_BASE64.replace(/^data:image\/\w+;base64,/, '');
                    logoBuffer = Buffer.from(base64Data, 'base64');
                }
            } catch (e) {
                // Ignore logo load failure
            }

            const drawPageHeader = () => {
                // Logo on left
                if (logoBuffer) {
                    try {
                        doc.image(logoBuffer, startX, 16, { width: 44, height: 44 });
                    } catch (e) {
                        // Fallback badge if image decode fails
                        doc.rect(startX, 20, 44, 30).fillAndStroke('#0E4C92', '#000000');
                        doc.fillColor('#FFFFFF').fontSize(11).font('Helvetica-Bold').text('L&T', startX + 11, 30);
                    }
                }

                // Company Title centered
                doc.fillColor('#000000').fontSize(14).font('Helvetica-Bold')
                    .text('Larsen & Toubro Limited, Construction', startX, 30, { width: contentWidth, align: 'center' });
            };

            // Draw header on Page 1
            drawPageHeader();

            // Main Top Box (Y = 64)
            const boxY = 64;
            const boxTopHeight = 48; // Upper split
            const barHeight = 25;    // 7-column bar
            const totalBoxHeight = boxTopHeight + barHeight; // 73

            // Outer Frame
            doc.rect(startX, boxY, contentWidth, totalBoxHeight).strokeColor('#000000').lineWidth(0.8).stroke();

            // Vertical divider between Left Title and Right Consignee Box
            const leftBoxWidth = 280;
            const rightBoxX = startX + leftBoxWidth; // 316
            const rightBoxWidth = contentWidth - leftBoxWidth; // 243

            doc.moveTo(rightBoxX, boxY).lineTo(rightBoxX, boxY + boxTopHeight).stroke();

            // Left Box: Title Area
            doc.fillColor('#000000').fontSize(11.5).font('Helvetica-Bold')
                .text(docTitle, startX, boxY + 7, { width: leftBoxWidth, align: 'center' });

            // Horizontal divider below Title (Y = boxY + 22)
            const metaDividerY = boxY + 22;
            doc.moveTo(startX, metaDividerY).lineTo(rightBoxX, metaDividerY).stroke();

            const hasIndent = Boolean(
                challan.indentNo && 
                String(challan.indentNo).trim() !== '' && 
                challan.indentNo !== '-'
            );
            const indentVal = hasIndent ? String(challan.indentNo).trim() : '-';
            const challanDateStr = formatDate(challan.challanDate || challan.createdAt);

            // Always show 3 Sub-columns in Left Box (DC NO, INDENT NO, DATE)
            const colW3 = leftBoxWidth / 3; // 93.33
            doc.moveTo(startX + colW3, metaDividerY).lineTo(startX + colW3, boxY + boxTopHeight).stroke();
            doc.moveTo(startX + colW3 * 2, metaDividerY).lineTo(startX + colW3 * 2, boxY + boxTopHeight).stroke();

            doc.fillColor('#000000').fontSize(6.5).font('Helvetica-Bold').text(dcNoLabel, startX + 6, metaDividerY + 4);
            doc.fontSize(8.5).font('Helvetica-Bold').text(challanNo, startX + 6, metaDividerY + 13);

            doc.fontSize(6.5).font('Helvetica-Bold').text('INDENT NO.', startX + colW3 + 6, metaDividerY + 4);
            doc.fontSize(8).font('Helvetica').text(indentVal, startX + colW3 + 6, metaDividerY + 13);

            doc.fontSize(6.5).font('Helvetica-Bold').text('DATE', startX + colW3 * 2 + 6, metaDividerY + 4);
            doc.fontSize(8).font('Helvetica').text(challanDateStr, startX + colW3 * 2 + 6, metaDividerY + 13);

            // Right Box: Consignee / Subcontractor
            const vendor = challan.vendor || {};
            const vendorName = challan.subcontractorName || vendor.name || 'Authorized Subcontractor';
            const vendorAddr = vendor.address || 'Site Work Location';
            const siteCodeStr = challan.siteCode !== undefined && challan.siteCode !== null && String(challan.siteCode).trim() !== '' && challan.siteCode !== '-' 
                ? String(challan.siteCode) 
                : '-';
            const vendorCodeStr = vendor.vendorCode || challan.vendorCode || '-';
            const locationStr = challan.locationChainage ? `Loc: ${challan.locationChainage}` : '';

            doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold')
                .text(isReturn ? 'SUBCONTRACTOR NAME' : 'CONSIGNEE / SUBCONTRACTOR', rightBoxX + 6, boxY + 4);

            doc.fontSize(8.5).font('Helvetica-Bold')
                .text(vendorName, rightBoxX + 6, boxY + 13, { width: rightBoxWidth - 12, height: 11, ellipsis: true });

            doc.fontSize(7).font('Helvetica')
                .text(`Addr: ${vendorAddr}`, rightBoxX + 6, boxY + 24, { width: rightBoxWidth - 12, height: 10, ellipsis: true });

            let rightYSub = boxY + 34;
            if (locationStr) {
                doc.text(locationStr, rightBoxX + 6, rightYSub, { width: rightBoxWidth - 12, height: 9, ellipsis: true });
                rightYSub += 9;
            } else if (!isScrapChallan) {
                doc.text(`Site Code: ${siteCodeStr}`, rightBoxX + 6, rightYSub, { width: rightBoxWidth - 12, height: 9, ellipsis: true });
            }

            // Horizontal Line across entire box for 7-Column Bar
            const barY = boxY + boxTopHeight;
            doc.moveTo(startX, barY).lineTo(startX + contentWidth, barY).stroke();

            // 7 Columns
            const barCols = [
                { label: 'TRN CD', val: String(challan.trnCode || (isReturn ? 'RET' : 'M 25')), width: 44 },
                { label: 'SENDING / ACCT CENTRE CODE', val: String(challan.sendingCentreCode || '-'), width: 95 },
                { label: 'M.R.N. NO.', val: String(challan.mrNo || challan.mrnNo || '-'), width: 58 },
                { label: 'M.R.N. DATE', val: String(challan.mrDate || '-'), width: 58 },
                { label: 'STOCK TYPE', val: String(challan.stockType || '-'), width: 68 },
                { label: isReturn ? 'SITE CODE NO.' : 'VENDOR CODE\nEMAIL ADDRESS', val: String(isReturn ? siteCodeStr : vendorCodeStr), width: 110 },
                { label: 'E-WAY BILL NO.', val: String(challan.ewayBillNo || '-'), width: 90 }
            ];

            let currBarX = startX;
            barCols.forEach((col, i) => {
                if (i > 0) {
                    doc.moveTo(currBarX, barY).lineTo(currBarX, barY + barHeight).stroke();
                }
                doc.fillColor('#000000').fontSize(5.5).font('Helvetica-Bold')
                    .text(col.label, currBarX + 1, barY + 3, { width: col.width - 2, align: 'center', lineGap: 0.5 });
                doc.fontSize(7.5).font('Helvetica')
                    .text(col.val, currBarX + 1, barY + 15, { width: col.width - 2, align: 'center', ellipsis: true });
                currBarX += col.width;
            });

            // Red Returnable Banner
            const bannerY = barY + barHeight + 4;
            doc.fillColor('#B40000').fontSize(8).font('Helvetica-Bold')
                .text(isReturn ? 'THE FOLLOWING IS THE RETURN STATUS OF MATERIALS ISSUED UNDER THE REFERENCED DELIVERY CHALLAN.' : 'NOT FOR SALE – MATERIAL ISSUED ON RETURNABLE BASIS',
                    startX, bannerY, { width: contentWidth, align: 'center' });

            if (!isReturn) {
                doc.fillColor('#3C3C3C').fontSize(6.5).font('Helvetica-Oblique')
                    .text('We have despatched the following goods. Kindly return the duplicate copy duly signed acknowledging receipt of goods',
                        startX, bannerY + 10, { width: contentWidth, align: 'center' });
            }

            // Items Table
            const tableY = isReturn ? bannerY + 12 : bannerY + 19;
            const colWidths = {
                sl: 32,
                code: 95,
                desc: 226,
                qty: 55,
                unit: 45,
                rate: 70
            };

            const drawTableHeader = (y) => {
                doc.rect(startX, y, contentWidth, 16).fillAndStroke('#F0F0F0', '#000000');
                doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');

                let x = startX;
                doc.text('SL. NO.', x, y + 4.5, { width: colWidths.sl, align: 'center' });
                x += colWidths.sl;
                doc.moveTo(x, y).lineTo(x, y + 16).stroke();

                doc.text('MATERIAL CODE', x, y + 4.5, { width: colWidths.code, align: 'center' });
                x += colWidths.code;
                doc.moveTo(x, y).lineTo(x, y + 16).stroke();

                doc.text('DESCRIPTION & QR', x, y + 4.5, { width: colWidths.desc, align: 'center' });
                x += colWidths.desc;
                doc.moveTo(x, y).lineTo(x, y + 16).stroke();

                doc.text('QUANTITY', x, y + 4.5, { width: colWidths.qty, align: 'center' });
                x += colWidths.qty;
                doc.moveTo(x, y).lineTo(x, y + 16).stroke();

                doc.text('UNIT', x, y + 4.5, { width: colWidths.unit, align: 'center' });
                x += colWidths.unit;
                doc.moveTo(x, y).lineTo(x, y + 16).stroke();

                doc.text('RATE RS.', x, y + 4.5, { width: colWidths.rate, align: 'center' });
            };

            let currentTableY = tableY;
            drawTableHeader(currentTableY);
            currentTableY += 16;

            const items = Array.isArray(challan.items) && challan.items.length > 0 ? challan.items : [];
            let totalQty = 0;
            const rowHeight = 22;
            const maxY = 660;

            items.forEach((item, idx) => {
                const qtyNum = Number(item.quantity || 1);
                totalQty += qtyNum;

                if (currentTableY + rowHeight > maxY) {
                    doc.addPage();
                    drawPageHeader();
                    currentTableY = 64;
                    drawTableHeader(currentTableY);
                    currentTableY += 16;
                }

                // Row outline
                doc.rect(startX, currentTableY, contentWidth, rowHeight).strokeColor('#000000').lineWidth(0.5).stroke();

                let x = startX;
                doc.fillColor('#000000');

                // Sl No
                doc.fontSize(7.5).font('Helvetica-Bold').text(String(idx + 1), x, currentTableY + 7, { width: colWidths.sl, align: 'center' });
                x += colWidths.sl;
                doc.moveTo(x, currentTableY).lineTo(x, currentTableY + rowHeight).stroke();

                // Material Code
                const matCode = item.materialCode || item.toolCode || `MAT-${String(item.toolId || '').slice(-5)}`;
                doc.fontSize(7.5).font('Helvetica-Bold').text(matCode, x + 2, currentTableY + 7, { width: colWidths.code - 4, align: 'center', ellipsis: true });
                x += colWidths.code;
                doc.moveTo(x, currentTableY).lineTo(x, currentTableY + rowHeight).stroke();

                // Description & QR
                const desc = item.description || 'Tool Item';
                const toolQrId = item.toolId || item.tool || '';
                doc.fontSize(7.5).font('Helvetica-Bold').text(desc, x + 4, currentTableY + 3.5, { width: colWidths.desc - 8, height: 9, ellipsis: true });
                if (toolQrId) {
                    doc.fontSize(6.5).font('Helvetica').fillColor('#1E3A8A').text(`ID: ${toolQrId}`, x + 4, currentTableY + 12.5, { width: colWidths.desc - 8, ellipsis: true });
                    doc.fillColor('#000000');
                }
                x += colWidths.desc;
                doc.moveTo(x, currentTableY).lineTo(x, currentTableY + rowHeight).stroke();

                // Qty
                doc.fontSize(7.5).font('Helvetica').text(String(qtyNum), x, currentTableY + 7, { width: colWidths.qty, align: 'center' });
                x += colWidths.qty;
                doc.moveTo(x, currentTableY).lineTo(x, currentTableY + rowHeight).stroke();

                // Unit
                doc.fontSize(7.5).font('Helvetica').text(item.unit || 'NOS', x, currentTableY + 7, { width: colWidths.unit, align: 'center' });
                x += colWidths.unit;
                doc.moveTo(x, currentTableY).lineTo(x, currentTableY + rowHeight).stroke();

                // Rate
                const rateStr = item.rate ? `Rs. ${item.rate}` : '-';
                doc.fontSize(7.5).font('Helvetica').text(rateStr, x, currentTableY + 7, { width: colWidths.rate, align: 'center' });

                currentTableY += rowHeight;
            });

            if (items.length === 0) {
                doc.rect(startX, currentTableY, contentWidth, 20).strokeColor('#000000').stroke();
                doc.fillColor('#555555').fontSize(7.5).font('Helvetica')
                    .text('No line items recorded for this challan.', startX, currentTableY + 6, { width: contentWidth, align: 'center' });
                currentTableY += 20;
            }

            // Check if room for complete footer
            if (currentTableY > 630) {
                doc.addPage();
                drawPageHeader();
                currentTableY = 64;
            }

            // FOOTER BLOCKS (Exact match with reference image)
            // 1. Gate Pass & Total (height 18)
            const gatePassY = currentTableY;
            doc.rect(startX, gatePassY, contentWidth, 18).strokeColor('#000000').lineWidth(0.8).stroke();
            const gatePassDividerX = startX + 395;
            doc.moveTo(gatePassDividerX, gatePassY).lineTo(gatePassDividerX, gatePassY + 18).stroke();

            const gatePassText = `GATE PASS NO. (${challan.gatePassNo || '-'}) APPROVED BY (${challan.gatePassApprovedBy || '-'})`;
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold')
                .text(gatePassText, startX + 6, gatePassY + 5.5);

            doc.fontSize(7.5).font('Helvetica-Bold')
                .text('TOTAL', gatePassDividerX + 10, gatePassY + 5.5);
            doc.fontSize(8.5).font('Helvetica-Bold')
                .text(String(totalQty), startX + contentWidth - 40, gatePassY + 5.5, { width: 30, align: 'right' });

            // 2. Tax Details (height 22, 2 equal cols 261.5)
            const taxY = gatePassY + 18;
            const halfColW = contentWidth / 2; // 261.5
            doc.rect(startX, taxY, contentWidth, 22).stroke();
            doc.moveTo(startX + halfColW, taxY).lineTo(startX + halfColW, taxY + 22).stroke();

            doc.fontSize(7).font('Helvetica-Bold').text('CONSIGNOR SALES / GST TAX NO. & DATE', startX + 6, taxY + 3.5);
            doc.fontSize(7.5).font('Helvetica').text(String(challan.consignorTaxNo || '-'), startX + 6, taxY + 12);

            doc.fontSize(7).font('Helvetica-Bold').text('CONSIGNEE / SUBCONTRACTOR GST NO. & DATE', startX + halfColW + 6, taxY + 3.5);
            doc.fontSize(7.5).font('Helvetica').text(String(vendor.gstNumber || '-'), startX + halfColW + 6, taxY + 12);

            // 3. Transit Details (height 22, 3 cols: 195, 195, 133)
            const transitY = taxY + 22;
            doc.rect(startX, transitY, contentWidth, 22).stroke();
            doc.moveTo(startX + 195, transitY).lineTo(startX + 195, transitY + 22).stroke();
            doc.moveTo(startX + 390, transitY).lineTo(startX + 390, transitY + 22).stroke();

            doc.fontSize(7).font('Helvetica-Bold').text('VEHICLE / DESPATCH THROUGH', startX + 6, transitY + 3.5);
            doc.fontSize(7.5).font('Helvetica').text(String(challan.vehicleNo || '-'), startX + 6, transitY + 12);

            doc.fontSize(7).font('Helvetica-Bold').text('LR / RR NO. & DATE', startX + 195 + 6, transitY + 3.5);
            doc.fontSize(7.5).font('Helvetica').text(String(challan.lrNo || '-'), startX + 195 + 6, transitY + 12);

            doc.fontSize(7).font('Helvetica-Bold').text('FREIGHT RS. TO PAY / PAID', startX + 390 + 6, transitY + 3.5);
            doc.fontSize(7.5).font('Helvetica').text(String(challan.freightStatus || 'PAID'), startX + 390 + 6, transitY + 12);

            // 4. Receipt & Signatures (height 58, 2 cols 261.5)
            const sigBoxY = transitY + 22;
            doc.rect(startX, sigBoxY, contentWidth, 58).stroke();
            doc.moveTo(startX + halfColW, sigBoxY).lineTo(startX + halfColW, sigBoxY + 58).stroke();

            // Left: Receipt Details
            doc.fontSize(7.5).font('Helvetica-Bold').text('RECEIPT DETAILS', startX + 6, sigBoxY + 4);
            doc.fontSize(6).font('Helvetica-Oblique').fillColor('#333333')
                .text('We have despatched the following goods. Kindly return the duplicate copy duly signed acknowledging receipt of goods.',
                    startX + 6, sigBoxY + 13, { width: halfColW - 12 });

            const receiverInfo = challan.receiverName
                ? `Receiver: ${challan.receiverName} (${challan.receiverMobile || '-'})`
                : 'MRN NO. | DATE | SIGNATURE OF RECEIVER';
            doc.fontSize(7.5).font('Helvetica').fillColor('#000000')
                .text(receiverInfo, startX + 6, sigBoxY + 44);

            // Right: For L&T
            doc.fontSize(7.5).font('Helvetica-Bold').text('FOR LARSEN & TOUBRO LIMITED CONSTRUCTION DIVISION', startX + halfColW + 6, sigBoxY + 4);
            doc.fontSize(7.5).font('Helvetica-Bold').text('AUTHORIZED SIGNATORY', startX + halfColW, sigBoxY + 46, { width: halfColW, align: 'center' });

            // 5. Remarks (height 22)
            const remarksY = sigBoxY + 58;
            doc.rect(startX, remarksY, contentWidth, 22).stroke();
            doc.fontSize(7.5).font('Helvetica-Bold').text('REMARKS', startX + 6, remarksY + 3.5);
            const remarksText = challan.remarks || challan.notes || 'No remarks provided.';
            doc.fontSize(7.5).font('Helvetica').text(remarksText, startX + 6, remarksY + 12, { width: contentWidth - 12, ellipsis: true });

            // Bottom registered office & code (Y = remarksY + 26)
            const botY = remarksY + 26;
            doc.fontSize(7.5).font('Helvetica-Bold').text(docCode, startX, botY);
            doc.fontSize(7.5).font('Helvetica').text('Registered Office : L & T House, Ballard Estate, Bombay - 400 038.', startX, botY, { width: contentWidth, align: 'center' });

            // Copy Distribution (Y = botY + 11)
            const copyY = botY + 11;
            doc.fontSize(7).font('Helvetica-Bold').text('COPY DISTRIBUTION:', startX, copyY);

            // 4 Checkboxes
            const cbWidth = 6;
            const cbHeight = 6;
            const cbY = copyY - 0.5;

            // 1. CONSIGNEE
            doc.rect(startX + 95, cbY, cbWidth, cbHeight).stroke();
            doc.fontSize(6.5).font('Helvetica-Bold').text('CONSIGNEE', startX + 104, copyY);

            // 2. CONSIGNEE – CONSIGNOR
            doc.rect(startX + 168, cbY, cbWidth, cbHeight).stroke();
            doc.fontSize(6.5).font('Helvetica-Bold').text('CONSIGNEE – CONSIGNOR', startX + 177, copyY);

            // 3. GATE PASS (SECURITY - ACCOUNTS)
            doc.rect(startX + 295, cbY, cbWidth, cbHeight).stroke();
            doc.fontSize(6.5).font('Helvetica-Bold').text('GATE PASS (SECURITY - ACCOUNTS)', startX + 304, copyY);

            // 4. CONSIGNOR'S FILE
            doc.rect(startX + 448, cbY, cbWidth, cbHeight).stroke();
            doc.fontSize(6.5).font('Helvetica-Bold').text("CONSIGNOR'S FILE", startX + 457, copyY);

            // Page Numbering
            const pages = doc.bufferedPageRange();
            for (let p = 1; p < pages.count; p++) {
                doc.switchToPage(p);
                doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#666666')
                    .text(`DC No.: ${challanNo} | Date: ${challanDateStr} | Page ${p + 1} of ${pages.count}`, startX, 15);
                doc.moveTo(startX, 24).lineTo(startX + contentWidth, 24).strokeColor('#CCCCCC').lineWidth(0.5).stroke();
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
};
