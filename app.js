/**
 * File QR Scanner
 *
 * Supports:
 *  - PDF and image (PNG/JPEG/GIF/BMP/WebP) upload via click or drag-and-drop
 *  - Automatic QR code detection on load
 *    • Single QR code found → result shown immediately
 *    • No QR code found     → interactive area-selection mode
 *  - Manual area selection on the canvas to isolate and scan a region
 *  - PDF multi-page navigation with per-page and all-pages scanning
 *
 * Libraries (loaded via CDN in index.html):
 *  - PDF.js  3.11.174  – PDF rendering
 *  - jsQR   1.4.0     – QR code decoding
 */

/* ── PDF.js worker ──────────────────────────────────────────────────── */
if (typeof pdfjsLib !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
}

/* ── Application State ──────────────────────────────────────────────── */
const state = {
  fileType: null,      // "image" | "pdf"
  pdfDoc: null,
  currentPage: 1,
  totalPages: 1,
  imageElement: null,  // HTMLImageElement for re-draw
  /** @type {{ x: number, y: number, width: number, height: number } | null} */
  selection: null,
  isDragging: false,
  dragStart: { x: 0, y: 0 },
};

/* ── DOM References ─────────────────────────────────────────────────── */
const uploadSection      = document.getElementById("upload-section");
const viewerSection      = document.getElementById("viewer-section");
const resultsSection     = document.getElementById("results-section");
const dropZone           = document.getElementById("drop-zone");
const fileInput          = document.getElementById("file-input");
const mainCanvas         = document.getElementById("main-canvas");
const overlayCanvas      = document.getElementById("overlay-canvas");
const scanningOverlay    = document.getElementById("scanning-overlay");
const prevBtn            = document.getElementById("prev-page");
const nextBtn            = document.getElementById("next-page");
const pageInfo           = document.getElementById("page-info");
const scanAllBtn         = document.getElementById("scan-all-btn");
const clearSelectionBtn  = document.getElementById("clear-selection-btn");
const scanSelectionBtn   = document.getElementById("scan-selection-btn");
const resetBtn           = document.getElementById("reset-btn");
const resultsList        = document.getElementById("results-list");
const backBtn            = document.getElementById("back-btn");
const newFileBtn         = document.getElementById("new-file-btn");

const ctx        = mainCanvas.getContext("2d");
const overlayCtx = overlayCanvas.getContext("2d");

/* ── File Upload ────────────────────────────────────────────────────── */
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) processFile(file);
});

dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") fileInput.click();
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});

/* ── Process Uploaded File ──────────────────────────────────────────── */
async function processFile(file) {
  const isPdf   = file.type === "application/pdf";
  const isImage = file.type.startsWith("image/");

  if (!isPdf && !isImage) {
    alert("Unsupported file type. Please upload a PDF or an image (PNG, JPG, GIF, BMP, WebP).");
    return;
  }

  resetState();
  showViewer();

  if (isPdf) {
    state.fileType = "pdf";
    await loadPdf(file);
  } else {
    state.fileType = "image";
    await loadImage(file);
  }
}

/* ── Image Loading ──────────────────────────────────────────────────── */
async function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        state.imageElement = img;
        state.totalPages  = 1;
        state.currentPage = 1;
        renderImageToCanvas(img);
        updatePageControls();
        autoScanCanvas().then(resolve);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderImageToCanvas(img) {
  const maxW = Math.min(window.innerWidth - 80, 860);
  const maxH = 600;
  let w = img.naturalWidth;
  let h = img.naturalHeight;

  if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
  if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }

  resizeCanvases(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
}

/* ── PDF Loading ────────────────────────────────────────────────────── */
async function loadPdf(file) {
  const buffer   = await file.arrayBuffer();
  state.pdfDoc   = await pdfjsLib.getDocument({ data: buffer }).promise;
  state.totalPages  = state.pdfDoc.numPages;
  state.currentPage = 1;

  await renderPdfPage(state.currentPage);
  updatePageControls();

  // Auto-scan all pages and return immediately if exactly one QR found
  await autoScanAllPdfPages();
}

async function renderPdfPage(pageNum) {
  const page     = await state.pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.5 });

  resizeCanvases(viewport.width, viewport.height);
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
}

/* ── Canvas Helpers ─────────────────────────────────────────────────── */
function resizeCanvases(w, h) {
  mainCanvas.width    = w;
  mainCanvas.height   = h;
  overlayCanvas.width  = w;
  overlayCanvas.height = h;
}

/* ── Page Navigation ────────────────────────────────────────────────── */
function updatePageControls() {
  if (state.fileType === "pdf") {
    pageInfo.textContent  = `Page ${state.currentPage} of ${state.totalPages}`;
    prevBtn.disabled      = state.currentPage <= 1;
    nextBtn.disabled      = state.currentPage >= state.totalPages;
    scanAllBtn.classList.remove("hidden");
  } else {
    pageInfo.textContent = "";
    prevBtn.disabled     = true;
    nextBtn.disabled     = true;
    scanAllBtn.classList.add("hidden");
  }
}

prevBtn.addEventListener("click", async () => {
  if (state.currentPage > 1) {
    state.currentPage--;
    clearSelectionState();
    await renderPdfPage(state.currentPage);
    updatePageControls();
  }
});

nextBtn.addEventListener("click", async () => {
  if (state.currentPage < state.totalPages) {
    state.currentPage++;
    clearSelectionState();
    await renderPdfPage(state.currentPage);
    updatePageControls();
  }
});

/* ── Auto-Scan ──────────────────────────────────────────────────────── */
/**
 * Scan the current canvas content. If exactly one QR code is found
 * and no area is selected, show the result immediately.
 */
async function autoScanCanvas() {
  setScanningVisible(true);
  await tick(); // let the browser paint

  const imageData = ctx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
  const result    = jsQR(imageData.data, imageData.width, imageData.height);

  setScanningVisible(false);

  if (result) {
    showResults([{ label: "QR Code", data: result.data }]);
  }
  // Otherwise remain in viewer for manual selection
}

/**
 * Scan all PDF pages. Return immediately if exactly one QR code is found
 * across all pages; otherwise show all found codes.
 */
async function autoScanAllPdfPages() {
  setScanningVisible(true);
  await tick();

  const found = [];

  for (let i = 1; i <= state.totalPages; i++) {
    await renderPdfPage(i);
    state.currentPage = i;
    updatePageControls();

    const imageData = ctx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
    const result    = jsQR(imageData.data, imageData.width, imageData.height);

    if (result) {
      found.push({ label: `Page ${i}`, data: result.data });
    }
  }

  setScanningVisible(false);

  if (found.length === 1) {
    // Single QR code across all pages → return immediately
    showResults(found);
  } else if (found.length > 1) {
    showResults(found);
  }
  // If none found, leave viewer open for manual selection
}

/* ── Scan-All Button ────────────────────────────────────────────────── */
scanAllBtn.addEventListener("click", async () => {
  clearSelectionState();
  if (state.fileType === "pdf") {
    await autoScanAllPdfPages();
  }
});

/* ── Area Selection ─────────────────────────────────────────────────── */
function getCanvasPoint(e) {
  const rect   = overlayCanvas.getBoundingClientRect();
  const scaleX = overlayCanvas.width  / rect.width;
  const scaleY = overlayCanvas.height / rect.height;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top)  * scaleY,
  };
}

overlayCanvas.addEventListener("mousedown",  onDragStart);
overlayCanvas.addEventListener("mousemove",  onDragMove);
overlayCanvas.addEventListener("mouseup",    onDragEnd);
overlayCanvas.addEventListener("mouseleave", onDragEnd);
overlayCanvas.addEventListener("touchstart", onDragStart, { passive: true });
overlayCanvas.addEventListener("touchmove",  onDragMove,  { passive: true });
overlayCanvas.addEventListener("touchend",   onDragEnd);

function onDragStart(e) {
  const pt = getCanvasPoint(e);
  state.isDragging  = true;
  state.dragStart   = pt;
  state.selection   = null;
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  scanSelectionBtn.disabled = true;
}

function onDragMove(e) {
  if (!state.isDragging) return;
  const pt = getCanvasPoint(e);
  const x  = Math.min(state.dragStart.x, pt.x);
  const y  = Math.min(state.dragStart.y, pt.y);
  const w  = Math.abs(pt.x - state.dragStart.x);
  const h  = Math.abs(pt.y - state.dragStart.y);

  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  // Dim the non-selected area
  overlayCtx.fillStyle = "rgba(0,0,0,0.45)";
  overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  overlayCtx.clearRect(x, y, w, h);

  // Selection border
  overlayCtx.strokeStyle = "#0078d4";
  overlayCtx.lineWidth   = 2;
  overlayCtx.strokeRect(x, y, w, h);

  // Corner handles
  const hs = 8;
  overlayCtx.fillStyle = "#0078d4";
  [[x, y], [x + w - hs, y], [x, y + h - hs], [x + w - hs, y + h - hs]].forEach(([cx, cy]) => {
    overlayCtx.fillRect(cx, cy, hs, hs);
  });

  state.selection = { x, y, width: w, height: h };
}

function onDragEnd() {
  if (!state.isDragging) return;
  state.isDragging = false;
  if (state.selection && state.selection.width > 5 && state.selection.height > 5) {
    scanSelectionBtn.disabled = false;
  }
}

/* ── Scan Selection Button ──────────────────────────────────────────── */
scanSelectionBtn.addEventListener("click", async () => {
  if (!state.selection) return;
  const { x, y, width, height } = state.selection;
  if (width < 5 || height < 5) return;

  setScanningVisible(true);
  await tick();

  const imageData = ctx.getImageData(
    Math.round(x), Math.round(y),
    Math.round(width), Math.round(height)
  );
  const result = jsQR(imageData.data, imageData.width, imageData.height);

  setScanningVisible(false);

  if (result) {
    showResults([{ label: "QR Code", data: result.data }]);
  } else {
    showResults([]);
  }
});

/* ── Clear Selection ────────────────────────────────────────────────── */
clearSelectionBtn.addEventListener("click", () => clearSelectionState());

function clearSelectionState() {
  state.selection   = null;
  state.isDragging  = false;
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  scanSelectionBtn.disabled = true;
}

/* ── Results ────────────────────────────────────────────────────────── */
function showResults(results) {
  viewerSection.classList.add("hidden");
  resultsSection.classList.remove("hidden");
  resultsList.innerHTML = "";

  if (results.length === 0) {
    resultsList.innerHTML =
      '<div class="no-results">&#x274C; No QR code found in the selected area.</div>';
    return;
  }

  results.forEach(({ label, data }) => {
    const isUrl = /^https?:\/\//i.test(data);

    const item = document.createElement("div");
    item.className = "result-item";

    const badge = document.createElement("span");
    badge.className = "result-badge";
    badge.textContent = label;

    const dataEl = document.createElement("div");
    dataEl.className = "result-data";
    if (isUrl) {
      const a = document.createElement("a");
      a.href   = data;
      a.target = "_blank";
      a.rel    = "noopener noreferrer";
      a.textContent = data;
      dataEl.appendChild(a);
    } else {
      dataEl.textContent = data;
    }

    const copyBtn = document.createElement("button");
    copyBtn.className   = "copy-btn";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(data).then(() => {
        copyBtn.textContent = "Copied!";
        copyBtn.classList.add("copied");
        setTimeout(() => {
          copyBtn.textContent = "Copy";
          copyBtn.classList.remove("copied");
        }, 1500);
      }).catch(() => {
        // Fallback for browsers without the Clipboard API (deprecated execCommand)
        try {
          const ta = document.createElement("textarea");
          ta.value = data;
          ta.style.position = "fixed";
          ta.style.opacity  = "0";
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          const ok = document.execCommand("copy");
          document.body.removeChild(ta);
          if (!ok) throw new Error("execCommand returned false");
        } catch (_) {
          alert("Copy not supported in this browser. Please copy manually:\n\n" + data);
          return;
        }
        copyBtn.textContent = "Copied!";
        copyBtn.classList.add("copied");
        setTimeout(() => {
          copyBtn.textContent = "Copy";
          copyBtn.classList.remove("copied");
        }, 1500);
      });
    });

    item.appendChild(badge);
    item.appendChild(dataEl);
    item.appendChild(copyBtn);
    resultsList.appendChild(item);
  });
}

/* ── Navigation Buttons ─────────────────────────────────────────────── */
backBtn.addEventListener("click", () => {
  resultsSection.classList.add("hidden");
  viewerSection.classList.remove("hidden");
});

newFileBtn.addEventListener("click", resetApp);
resetBtn.addEventListener("click", resetApp);

/* ── Reset ──────────────────────────────────────────────────────────── */
function resetState() {
  state.fileType    = null;
  state.pdfDoc      = null;
  state.currentPage = 1;
  state.totalPages  = 1;
  state.imageElement = null;
  state.selection   = null;
  state.isDragging  = false;
}

function resetApp() {
  resetState();
  ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  scanSelectionBtn.disabled = true;

  resultsSection.classList.add("hidden");
  viewerSection.classList.add("hidden");
  uploadSection.classList.remove("hidden");

  fileInput.value = "";
}

/* ── UI Helpers ─────────────────────────────────────────────────────── */
function showViewer() {
  uploadSection.classList.add("hidden");
  resultsSection.classList.add("hidden");
  viewerSection.classList.remove("hidden");
}

function setScanningVisible(visible) {
  if (visible) {
    scanningOverlay.classList.remove("hidden");
  } else {
    scanningOverlay.classList.add("hidden");
  }
}

/** Yield to the browser's rendering pipeline */
function tick() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}
