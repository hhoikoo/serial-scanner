/**
 * UI State Management with Alpine.js
 */

import Alpine from 'alpinejs';
import {
  startScanner,
  stopScanner,
  setTargetSerials,
  getScannerState,
  resetFoundSerials,
  setOnFoundCallback,
  setOnBorderStateChange,
  checkCameraAvailable
} from './scanner.js';
import { downloadPDF, parseSerialNumbers } from './generator.js';

// Initialize Alpine.js data store
export function initApp() {
  Alpine.data('app', () => ({
    // Current mode
    mode: 'scanner',

    // Scanner state
    scannerActive: false,
    searchInput: '',
    borderState: 'idle',
    foundSerials: [],
    targetCount: 0,
    scannerError: null,
    cameraAvailable: true,

    // Generator state
    generatorInput: '',
    generating: false,
    generatorProgress: 0,
    generatorTotal: 0,
    generatorError: null,

    // Computed: count of serials in generator input
    get generatorSerialCount() {
      return parseSerialNumbers(this.generatorInput).length;
    },

    // Initialize
    async init() {
      // Check camera availability
      this.cameraAvailable = await checkCameraAvailable();

      // Set up scanner callbacks
      setOnFoundCallback((serial, allFound) => {
        this.foundSerials = allFound;
      });

      setOnBorderStateChange((state) => {
        this.borderState = state;
      });
    },

    // Start the scanner
    async startScanner() {
      if (this.scannerActive) return;

      this.scannerError = null;
      try {
        await startScanner('qr-reader');
        this.scannerActive = true;

        // Apply current search targets
        if (this.searchInput.trim()) {
          this.updateSearchTargets();
        }
      } catch (err) {
        console.error('Scanner error:', err);
        this.scannerError = this.getCameraErrorMessage(err);
      }
    },

    // Stop the scanner
    async stopScanner() {
      if (!this.scannerActive) return;

      await stopScanner();
      this.scannerActive = false;
      this.borderState = 'idle';
    },

    // Update search targets from input
    updateSearchTargets() {
      this.targetCount = setTargetSerials(this.searchInput);
      this.foundSerials = [];
    },

    // Reset found serials
    resetSearch() {
      resetFoundSerials();
      this.foundSerials = [];
    },

    // Generate PDF
    async generatePDF() {
      if (this.generating) return;

      const count = this.generatorSerialCount;
      if (count === 0) {
        this.generatorError = 'Please enter at least one serial number';
        return;
      }

      this.generating = true;
      this.generatorError = null;
      this.generatorProgress = 0;
      this.generatorTotal = count;

      try {
        await downloadPDF(this.generatorInput, (current, total) => {
          this.generatorProgress = current;
          this.generatorTotal = total;
        });
      } catch (err) {
        console.error('PDF generation error:', err);
        this.generatorError = err.message;
      } finally {
        this.generating = false;
        this.generatorProgress = 0;
      }
    },

    // Get user-friendly camera error message
    getCameraErrorMessage(err) {
      const message = err.message || err.toString();

      if (message.includes('NotAllowedError') || message.includes('Permission')) {
        return 'Camera permission denied. Please allow camera access in your browser settings.';
      }
      if (message.includes('NotFoundError') || message.includes('not found')) {
        return 'No camera found on this device.';
      }
      if (message.includes('NotReadableError') || message.includes('in use')) {
        return 'Camera is in use by another application.';
      }
      if (message.includes('OverconstrainedError')) {
        return 'Camera does not meet the required constraints.';
      }

      return `Camera error: ${message}`;
    },

    // Switch mode and clean up
    async switchMode(newMode) {
      if (newMode === this.mode) return;

      // Stop scanner when leaving scanner mode
      if (this.mode === 'scanner' && this.scannerActive) {
        await this.stopScanner();
      }

      this.mode = newMode;
    }
  }));

  // Start Alpine
  Alpine.start();
}
