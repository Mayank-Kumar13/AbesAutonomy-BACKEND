/**
 * OCR for scanned / handwritten PDFs.
 *
 * Pipeline per page:
 *   1. Render the page to an image (PDF.js + @napi-rs/canvas).
 *   2. Read it with a Gemini vision model (handles handwriting well).
 *   3. If Gemini is not configured or fails for that page, fall back to Tesseract
 *      (printed text only; poor on handwriting).
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LANG_PATH = path.resolve(__dirname, '../../..'); // backend/ (holds eng.traineddata)

const MAX_OCR_PAGES = Math.max(1, Number(process.env.AI_OCR_MAX_PAGES) || 30);
const OCR_SCALE = Math.min(2.5, Math.max(1, Number(process.env.AI_OCR_SCALE) || 1.5));
const VISION_TIMEOUT_MS = Number(process.env.AI_OCR_VISION_TIMEOUT_MS) || 60_000;

const splitList = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

const GEMINI_KEYS = () => splitList(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY);
const GEMINI_VISION_MODELS = () =>
  splitList(
    process.env.GEMINI_OCR_MODEL ||
      process.env.GEMINI_MODELS ||
      'gemini-2.5-flash,gemini-2.5-flash-lite'
  );

const PROMPT =
  'Transcribe ALL text on this page of student notes exactly as written, including handwriting, ' +
  'numbers, formulas and units. Keep line breaks. Write formulas in plain text (e.g. 4 x 8 x 60 / 1000 = 1.92 kWh). ' +
  'Do not add commentary, headings or explanations. If a word is unreadable write [illegible]. ' +
  'If the page has no text, reply with nothing.';

/** Reads one page image with Gemini. Throws on failure so the caller can fall back. */
const visionOcr = async (jpegBuffer) => {
  const keys = GEMINI_KEYS();
  const models = GEMINI_VISION_MODELS();
  if (!keys.length) throw new Error('Gemini not configured');

  let lastErr;
  for (const model of models) {
    for (const key of keys) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [
                    { text: PROMPT },
                    { inline_data: { mime_type: 'image/jpeg', data: jpegBuffer.toString('base64') } },
                  ],
                },
              ],
              generationConfig: { temperature: 0, maxOutputTokens: 4096 },
            }),
          }
        );
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Gemini ${model} HTTP ${res.status}: ${body.slice(0, 200)}`);
        }
        const data = await res.json();
        const text = (data?.candidates?.[0]?.content?.parts || [])
          .map((p) => p?.text || '')
          .join('')
          .trim();
        return text;
      } catch (err) {
        lastErr = err;
        console.warn('[PDF OCR] vision attempt failed:', err?.message || err);
      } finally {
        clearTimeout(timer);
      }
    }
  }
  throw lastErr || new Error('Vision OCR failed');
};

export const ocrPdfPages = async (buffer, requestedPageCount) => {
  let pdf;
  let worker; // Tesseract worker, created lazily only if needed

  const getTesseract = async () => {
    if (!worker) {
      worker = await createWorker(process.env.AI_OCR_LANG || 'eng', 1, {
        langPath: LANG_PATH,
        gzip: false,
        cacheMethod: 'none',
        errorHandler: (err) => console.error('[Tesseract worker error]', err?.message || err),
      });
    }
    return worker;
  };

  try {
    pdf = await getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
    }).promise;

    const pagesToProcess = Math.min(pdf.numPages, MAX_OCR_PAGES);
    const pages = [];
    let visionPages = 0;

    for (let pageNumber = 1; pageNumber <= pagesToProcess; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: OCR_SCALE });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

      let text = '';
      try {
        text = await visionOcr(canvas.toBuffer('image/jpeg', 85));
        visionPages += 1;
      } catch (err) {
        console.warn(`[PDF OCR] page ${pageNumber}: using Tesseract fallback (${err?.message || err})`);
        const w = await getTesseract();
        const result = await w.recognize(canvas.toBuffer('image/png'));
        text = String(result?.data?.text || '').trim();
      }

      pages.push(text);
      page.cleanup();
    }

    console.log(`[PDF OCR] done: ${pagesToProcess} pages, ${visionPages} read by vision model`);

    return {
      pages,
      pageCount: requestedPageCount || pdf.numPages,
      truncated: pdf.numPages > pagesToProcess,
      ocrPages: pagesToProcess,
    };
  } finally {
    if (worker) await worker.terminate().catch(() => {});
    if (pdf) await pdf.destroy().catch(() => {});
  }
};