# file-qr-scanner

A browser-based QR code scanner that works directly with uploaded PDF or image files — no camera required.

## Features

- **File upload** — drag-and-drop or click to upload a PDF or image (PNG, JPG, GIF, BMP, WebP)
- **Automatic detection** — the file is scanned immediately on upload
  - If **exactly one** QR code is found, the result is shown straight away
  - If nothing is found, the interactive viewer opens for manual selection
- **Area selection** — click and drag on the image/page to isolate a specific region and scan just that area
- **PDF multi-page support** — navigate between pages, scan individual pages, or scan all pages at once
- **Copy to clipboard** — copy any QR code value with one click; URLs are rendered as clickable links

## Usage

1. Open `index.html` in a modern browser (Chrome, Firefox, Edge, Safari).
2. Upload a PDF or image file.
3. The app scans automatically:
   - Single QR code → result shown immediately.
   - No QR code detected → click and drag on the image to select the area containing the QR code, then click **Scan Selection**.
4. For PDFs, use the **← / →** buttons to navigate pages, or click **Scan All Pages** to check every page at once.

## Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| [PDF.js](https://mozilla.github.io/pdf.js/) | 3.11.174 | Render PDF pages to canvas |
| [jsQR](https://github.com/cozmo/jsQR) | 1.4.0 | Decode QR codes from image data |

Both libraries are bundled in the `vendor/` directory — no build step or internet connection required.