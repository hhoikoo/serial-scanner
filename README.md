# QR Box Finder

A web application for locating boxes by serial number using QR codes.

## Features

### Scanner Mode
- Live camera feed with QR code detection
- Search for specific serial numbers
- Visual highlighting when matching QR codes are found
- Haptic feedback on mobile devices

### Generator Mode
- Create printable A4 PDFs with QR codes
- 4x5 grid layout (20 QR codes per page)
- Serial number labels below each QR code

## Quick Start

### Development

```bash
npm install
npm run dev
```

Open http://localhost:3000

### Production (Docker)

```bash
docker-compose up --build
```

Open http://localhost:8080

### Static Hosting

Build and deploy anywhere (GitHub Pages, Netlify, Vercel, etc.):

```bash
npm run build
# Deploy the 'dist' folder
```

## QR Code Format

```json
{
  "s": "SERIAL123",
  "src": "lablup-inventory",
  "cs": "a1b2c3d4"
}
```

## Tech Stack

Vite, Alpine.js, html5-qrcode, jsPDF, qrcode
