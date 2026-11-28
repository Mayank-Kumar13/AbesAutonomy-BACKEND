/**
 * OCR fallback for scanned/image-only PDFs.
 * Renders PDF pages to PNG using PDF.js,
 * then extracts text using Tesseract.js.
 */

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import path from 'path';
import { fileURLToPath } from 'url';

// eng.traineddata lives in backend/ (committed to git) so OCR never depends on a CDN download.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LANG_PATH = path.resolve(__dirname, '../../..');

const MAX_OCR_PAGES = Math.max(
  1,
  Number(process.env.AI_OCR_MAX_PAGES) || 30
);

const OCR_SCALE = Math.min(
  2.5,
  Math.max(1, Number(process.env.AI_OCR_SCALE) || 1.5)
);

export const ocrPdfPages = async (buffer, requestedPageCount) => {
  let pdf;
  let worker;

  try {
    // Load the PDF
    pdf = await getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
    }).promise;

    // Limit pages to control processing time
    const pagesToProcess = Math.min(
      pdf.numPages,
      MAX_OCR_PAGES
    );

    // Initialize OCR worker
    worker = await createWorker(
      process.env.AI_OCR_LANG || 'eng',
      1,
      {
        langPath: LANG_PATH,   // load the local file instead of downloading
        gzip: false,           // local file is raw .traineddata, not .gz
        cacheMethod: 'none',
        errorHandler: (err) =>
          console.error('[Tesseract worker error]', err?.message || err),
      }
    );

    const pages = [];

    // Process each page
    for (
      let pageNumber = 1;
      pageNumber <= pagesToProcess;
      pageNumber += 1
    ) {
      const page = await pdf.getPage(pageNumber);

      const viewport = page.getViewport({
        scale: OCR_SCALE,
      });

      // Create image canvas
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height)
      );

      const context = canvas.getContext('2d');

      // Render PDF page into image
      await page.render({
        canvasContext: context,
        viewport,
      }).promise;

      // Convert page to PNG
      const png = canvas.toBuffer('image/png');

      // Extract text using OCR
      const result = await worker.recognize(png);
      console.log(`[PDF OCR] page ${pageNumber} confidence: ${result.data.confidence}`);

      pages.push(
        String(result?.data?.text || '').trim()
      );

      page.cleanup();
    }

    return {
      pages,
      pageCount: requestedPageCount || pdf.numPages,
      truncated: pdf.numPages > pagesToProcess,
      ocrPages: pagesToProcess,
    };

  } finally {
    // Release resources
    if (worker) {
      await worker.terminate().catch(() => {});
    }

    if (pdf) {
      await pdf.destroy().catch(() => {});
    }
  }
};
