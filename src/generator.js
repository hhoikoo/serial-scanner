/**
 * PDF Generator Module
 * Generates A4 PDFs with QR codes for box labels
 */

import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { encodeQRPayload } from './qr-utils.js';

// A4 dimensions and layout constants (in mm)
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const QR_SIZE_MM = 40;           // ~4cm QR code
const LABEL_HEIGHT_MM = 8;       // Space for serial number text below QR
const CELL_HEIGHT_MM = QR_SIZE_MM + LABEL_HEIGHT_MM + 5; // QR + label + padding
const CELL_WIDTH_MM = QR_SIZE_MM + 10;  // QR + horizontal padding
const MARGIN_MM = 10;

// Calculate grid
const COLS = Math.floor((A4_WIDTH_MM - 2 * MARGIN_MM) / CELL_WIDTH_MM);   // = 4 columns
const ROWS = Math.floor((A4_HEIGHT_MM - 2 * MARGIN_MM) / CELL_HEIGHT_MM); // = 5 rows
const PER_PAGE = COLS * ROWS; // = 20 QR codes per page

/**
 * Generate QR code as data URL
 * @param {string} serialNumber
 * @returns {Promise<string>} - PNG data URL
 */
async function generateQRDataURL(serialNumber) {
  const payload = encodeQRPayload(serialNumber);

  const dataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 200  // pixels, will be scaled in PDF
  });

  return dataUrl;
}

/**
 * Parse serial numbers from input string
 * @param {string} input - Newline or comma separated serial numbers
 * @returns {string[]} - Array of trimmed, non-empty serial numbers
 */
export function parseSerialNumbers(input) {
  return input
    .split(/[\n,]/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Generate PDF with QR codes
 * @param {string} input - Newline or comma separated serial numbers
 * @param {function} onProgress - Progress callback (current, total)
 * @returns {Promise<Blob>} - PDF blob for download
 */
export async function generatePDF(input, onProgress = null) {
  const serials = parseSerialNumbers(input);

  if (serials.length === 0) {
    throw new Error('No serial numbers provided');
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  for (let i = 0; i < serials.length; i++) {
    const serial = serials[i];
    const pageIndex = Math.floor(i / PER_PAGE);
    const positionOnPage = i % PER_PAGE;

    // Add new page if needed (except for first)
    if (positionOnPage === 0 && pageIndex > 0) {
      pdf.addPage();
    }

    const col = positionOnPage % COLS;
    const row = Math.floor(positionOnPage / COLS);

    const x = MARGIN_MM + col * CELL_WIDTH_MM + (CELL_WIDTH_MM - QR_SIZE_MM) / 2;
    const y = MARGIN_MM + row * CELL_HEIGHT_MM;

    // Generate and add QR code
    const qrDataUrl = await generateQRDataURL(serial);
    pdf.addImage(qrDataUrl, 'PNG', x, y, QR_SIZE_MM, QR_SIZE_MM);

    // Add serial number text below QR
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    const textWidth = pdf.getTextWidth(serial);
    const textX = x + (QR_SIZE_MM - textWidth) / 2; // Center text
    const textY = y + QR_SIZE_MM + 5;
    pdf.text(serial, textX, textY);

    // Add light border/cut line around cell
    pdf.setDrawColor(200, 200, 200); // Light gray
    pdf.setLineWidth(0.2);
    pdf.rect(
      MARGIN_MM + col * CELL_WIDTH_MM,
      MARGIN_MM + row * CELL_HEIGHT_MM,
      CELL_WIDTH_MM,
      CELL_HEIGHT_MM
    );

    // Report progress
    if (onProgress) {
      onProgress(i + 1, serials.length);
    }
  }

  return pdf.output('blob');
}

/**
 * Trigger PDF download in browser
 * @param {string} input - Newline or comma separated serial numbers
 * @param {function} onProgress - Progress callback
 */
export async function downloadPDF(input, onProgress = null) {
  const blob = await generatePDF(input, onProgress);
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `qr-codes-${Date.now()}.pdf`;
  a.click();

  URL.revokeObjectURL(url);
}

// Export constants for UI display
export { PER_PAGE, COLS, ROWS };
