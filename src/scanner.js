/**
 * Scanner Module
 * Handles QR code scanning with camera using BarcodeDetector API (with polyfill for Safari)
 */

import { BarcodeDetector as BarcodeDetectorPolyfill } from 'barcode-detector';
import { decodeQRPayload } from './qr-utils.js';

// Use native BarcodeDetector if available, otherwise use polyfill
const BarcodeDetector = window.BarcodeDetector || BarcodeDetectorPolyfill;

// Scanner state
let isScanning = false;
let targetSerials = new Set();
let foundSerials = new Set();

// Video and canvas elements
let videoElement = null;
let canvasElement = null;
let canvasCtx = null;
let barcodeDetector = null;
let scanIntervalId = null;

// Currently visible QR codes (with timestamps for expiry)
let visibleQRs = new Map(); // serial -> { bounds, lastSeen, isTarget }
const QR_VISIBILITY_TIMEOUT = 500; // ms before QR is considered "gone"

// Border state with debouncing
let currentBorderState = 'idle';
let lastFoundTime = 0;
const BORDER_DEBOUNCE_MS = 300;

// Animation frame for overlay
let animationFrameId = null;

// Callbacks
let onFoundCallback = null;
let onBorderStateChange = null;

/**
 * Start scanning with the back camera
 * @param {string} containerId - ID of the container element
 * @returns {Promise<void>}
 */
export async function startScanner(containerId) {
  if (isScanning) {
    return;
  }

  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error('Container element not found');
  }

  // Create video element
  videoElement = document.createElement('video');
  videoElement.setAttribute('playsinline', '');
  videoElement.setAttribute('autoplay', '');
  videoElement.style.cssText = 'width:100%;height:auto;display:block;';
  container.innerHTML = '';
  container.appendChild(videoElement);

  // Create overlay canvas
  canvasElement = document.createElement('canvas');
  canvasElement.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
  container.style.position = 'relative';
  container.appendChild(canvasElement);
  canvasCtx = canvasElement.getContext('2d');

  // Initialize barcode detector
  barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });

  // Request camera with high resolution
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });

    videoElement.srcObject = stream;
    await videoElement.play();

    isScanning = true;

    // Start scanning loop
    scanIntervalId = setInterval(scanFrame, 100); // 10 fps

    // Start overlay drawing loop
    animationFrameId = requestAnimationFrame(drawOverlays);

    // Update border state
    if (targetSerials.size > 0 && onBorderStateChange) {
      currentBorderState = 'searching';
      onBorderStateChange('searching');
    }
  } catch (err) {
    console.error('Failed to start camera:', err);
    throw err;
  }
}

/**
 * Scan a single frame for QR codes
 */
async function scanFrame() {
  if (!isScanning || !videoElement || !barcodeDetector) return;

  try {
    const barcodes = await barcodeDetector.detect(videoElement);

    for (const barcode of barcodes) {
      processBarcode(barcode);
    }
  } catch (err) {
    // Ignore detection errors (e.g., video not ready)
  }
}

/**
 * Process a detected barcode
 */
function processBarcode(barcode) {
  const parsed = decodeQRPayload(barcode.rawValue);

  if (!parsed.valid) {
    return; // Ignore non-lablup QR codes
  }

  const isTarget = targetSerials.has(parsed.serialNumber);
  const now = Date.now();

  // Extract bounds from cornerPoints
  let bounds = null;
  if (barcode.cornerPoints && barcode.cornerPoints.length === 4) {
    const xs = barcode.cornerPoints.map(p => p.x);
    const ys = barcode.cornerPoints.map(p => p.y);
    bounds = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      cornerPoints: barcode.cornerPoints
    };
  } else if (barcode.boundingBox) {
    bounds = {
      x: barcode.boundingBox.x,
      y: barcode.boundingBox.y,
      width: barcode.boundingBox.width,
      height: barcode.boundingBox.height
    };
  }

  // Update visible QRs map
  visibleQRs.set(parsed.serialNumber, {
    bounds,
    lastSeen: now,
    isTarget
  });

  // Track found serials (persistent)
  if (isTarget && !foundSerials.has(parsed.serialNumber)) {
    foundSerials.add(parsed.serialNumber);
    triggerFoundFeedback();

    if (onFoundCallback) {
      onFoundCallback(parsed.serialNumber, Array.from(foundSerials));
    }
  }
}

/**
 * Draw bounding boxes on visible QR codes
 */
function drawOverlays() {
  if (!canvasCtx || !canvasElement || !videoElement) {
    if (isScanning) {
      animationFrameId = requestAnimationFrame(drawOverlays);
    }
    return;
  }

  // Match canvas size to video display size
  const rect = videoElement.getBoundingClientRect();
  canvasElement.width = rect.width;
  canvasElement.height = rect.height;

  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  const now = Date.now();
  let hasVisibleTarget = false;

  // Calculate scale from video resolution to display size
  const scaleX = rect.width / videoElement.videoWidth;
  const scaleY = rect.height / videoElement.videoHeight;

  for (const [serial, data] of visibleQRs.entries()) {
    // Check if QR has expired
    if (now - data.lastSeen > QR_VISIBILITY_TIMEOUT) {
      visibleQRs.delete(serial);
      continue;
    }

    if (data.isTarget) {
      hasVisibleTarget = true;
      lastFoundTime = now;
    }

    // Draw bounding box
    if (data.bounds) {
      const color = data.isTarget ? '#00FF00' : '#FFFF00';

      // If we have corner points, draw a polygon
      if (data.bounds.cornerPoints) {
        canvasCtx.beginPath();
        const points = data.bounds.cornerPoints;
        canvasCtx.moveTo(points[0].x * scaleX, points[0].y * scaleY);
        for (let i = 1; i < points.length; i++) {
          canvasCtx.lineTo(points[i].x * scaleX, points[i].y * scaleY);
        }
        canvasCtx.closePath();
        canvasCtx.strokeStyle = color;
        canvasCtx.lineWidth = 3;
        canvasCtx.stroke();
      } else {
        // Fall back to rectangle
        const scaledX = data.bounds.x * scaleX;
        const scaledY = data.bounds.y * scaleY;
        const scaledW = data.bounds.width * scaleX;
        const scaledH = data.bounds.height * scaleY;

        canvasCtx.strokeStyle = color;
        canvasCtx.lineWidth = 3;
        canvasCtx.strokeRect(scaledX, scaledY, scaledW, scaledH);
      }

      // Draw label
      const labelX = (data.bounds.cornerPoints ? data.bounds.cornerPoints[0].x : data.bounds.x) * scaleX;
      const labelY = (data.bounds.cornerPoints ? data.bounds.cornerPoints[0].y : data.bounds.y) * scaleY;

      canvasCtx.fillStyle = data.isTarget ? 'rgba(0, 255, 0, 0.85)' : 'rgba(255, 255, 0, 0.85)';
      const text = serial.length > 20 ? serial.substring(0, 17) + '...' : serial;
      canvasCtx.font = 'bold 14px sans-serif';
      const textWidth = canvasCtx.measureText(text).width;
      const labelHeight = 22;
      const labelYPos = labelY > labelHeight + 5 ? labelY - labelHeight - 2 : labelY + data.bounds.height * scaleY + 2;

      canvasCtx.fillRect(labelX, labelYPos, textWidth + 10, labelHeight);
      canvasCtx.fillStyle = '#000';
      canvasCtx.textBaseline = 'middle';
      canvasCtx.fillText(text, labelX + 5, labelYPos + labelHeight / 2);
    }
  }

  // Update border state with debouncing
  if (targetSerials.size > 0 && onBorderStateChange) {
    let newState;
    if (hasVisibleTarget) {
      newState = 'found';
    } else if (now - lastFoundTime < BORDER_DEBOUNCE_MS) {
      newState = 'found';
    } else {
      newState = 'searching';
    }

    if (newState !== currentBorderState) {
      currentBorderState = newState;
      onBorderStateChange(newState);
    }
  }

  // Continue animation loop
  if (isScanning) {
    animationFrameId = requestAnimationFrame(drawOverlays);
  }
}

/**
 * Stop scanning
 */
export async function stopScanner() {
  if (!isScanning) {
    return;
  }

  isScanning = false;

  // Stop scan interval
  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
  }

  // Stop animation loop
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  // Stop video stream
  if (videoElement && videoElement.srcObject) {
    const tracks = videoElement.srcObject.getTracks();
    tracks.forEach(track => track.stop());
    videoElement.srcObject = null;
  }

  visibleQRs.clear();

  currentBorderState = 'idle';
  if (onBorderStateChange) {
    onBorderStateChange('idle');
  }
}

/**
 * Trigger haptic feedback
 */
function triggerFoundFeedback() {
  if (navigator.vibrate) {
    navigator.vibrate(200);
  }
}

/**
 * Set target serial numbers to search for
 * @param {string} input - Newline or comma separated serial numbers
 */
export function setTargetSerials(input) {
  const serials = input
    .split(/[\n,]/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  targetSerials = new Set(serials);
  foundSerials.clear();
  visibleQRs.clear();
  lastFoundTime = 0;

  if (isScanning && onBorderStateChange) {
    currentBorderState = serials.length > 0 ? 'searching' : 'idle';
    onBorderStateChange(currentBorderState);
  }

  return serials.length;
}

/**
 * Get current scanner state
 */
export function getScannerState() {
  return {
    isScanning,
    targetCount: targetSerials.size,
    foundCount: foundSerials.size,
    foundSerials: Array.from(foundSerials),
    targetSerials: Array.from(targetSerials)
  };
}

/**
 * Clear found serials and reset to searching state
 */
export function resetFoundSerials() {
  foundSerials.clear();
  visibleQRs.clear();
  lastFoundTime = 0;
  if (isScanning && targetSerials.size > 0 && onBorderStateChange) {
    currentBorderState = 'searching';
    onBorderStateChange('searching');
  }
}

/**
 * Set callback for when a target serial is found
 */
export function setOnFoundCallback(callback) {
  onFoundCallback = callback;
}

/**
 * Set callback for border state changes
 */
export function setOnBorderStateChange(callback) {
  onBorderStateChange = callback;
}

/**
 * Check if camera is available
 */
export async function checkCameraAvailable() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some(device => device.kind === 'videoinput');
  } catch (err) {
    return false;
  }
}

/**
 * Check if scanning is currently active
 */
export function isScannerActive() {
  return isScanning;
}

// No longer need initScanner - keeping for API compatibility
export async function initScanner() {}
