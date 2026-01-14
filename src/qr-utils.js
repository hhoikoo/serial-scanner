/**
 * QR Code Payload Utilities
 * Handles encoding and decoding of QR code payloads with checksums
 */

// CRC32 lookup table
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

/**
 * Calculate CRC32 checksum of a string
 * @param {string} str - Input string
 * @returns {string} - 8 character hex checksum
 */
export function calculateCRC32(str) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < str.length; i++) {
    const byte = str.charCodeAt(i) & 0xFF;
    crc = CRC32_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  crc = (crc ^ 0xFFFFFFFF) >>> 0;
  return crc.toString(16).padStart(8, '0');
}

/**
 * Create QR payload object with checksum
 * @param {string} serialNumber - The serial number
 * @returns {string} - JSON string for QR code
 */
export function encodeQRPayload(serialNumber) {
  const payload = {
    s: serialNumber,
    src: "lablup-inventory"
  };
  // Calculate checksum of s + src concatenated
  payload.cs = calculateCRC32(payload.s + payload.src);
  return JSON.stringify(payload);
}

/**
 * Parse and validate QR payload
 * @param {string} rawData - Raw QR code content
 * @returns {{ valid: boolean, serialNumber: string | null, error?: string }}
 */
export function decodeQRPayload(rawData) {
  // 1. Try JSON.parse
  let payload;
  try {
    payload = JSON.parse(rawData);
  } catch (e) {
    return { valid: false, serialNumber: null, error: "Not JSON" };
  }

  // 2. Check required fields exist
  if (!payload.s || !payload.src || !payload.cs) {
    return { valid: false, serialNumber: null, error: "Missing required fields" };
  }

  // 3. Check 'src' field equals "lablup-inventory"
  if (payload.src !== "lablup-inventory") {
    return { valid: false, serialNumber: null, error: "Unknown source" };
  }

  // 4. Verify checksum matches
  const expectedChecksum = calculateCRC32(payload.s + payload.src);
  if (payload.cs !== expectedChecksum) {
    return { valid: false, serialNumber: null, error: "Checksum mismatch" };
  }

  // 5. Return success
  return { valid: true, serialNumber: payload.s };
}
