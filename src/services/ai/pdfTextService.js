/**
 * Gets a searchable index for a Note's PDF.
 *
 * Pipeline:
 * In-memory LRU
 *     ↓
 * MongoDB NoteText cache
 *     ↓
 * Download PDF
 *     ↓
 * Normal text extraction using unpdf
 *     ↓
 * OCR fallback for scanned PDFs
 *     ↓
 * Chunking and retrieval index
 */

import crypto from 'crypto';

import {
  extractText,
  getDocumentProxy,
} from 'unpdf';

import NoteText from '../../models/NoteText.js';

import {
  downloadBuffer,
  isSupabaseConfigured,
  mapImageKitUrlToSupabasePath,
} from '../supabaseStorageService.js';

import {
  chunkPages,
  buildIndex,
} from './retrieval.js';

import {
  ocrPdfPages,
} from './pdfOcrService.js';

// Bump version to rebuild previously cached PDF indexes.
const EXTRACTOR_VERSION = 'v2-ocr';

const MAX_PAGES = 600;

const MAX_CHARS = 3_000_000;

const MIN_TEXT_CHARS = 200;

const LRU_SIZE = 25;


// ─── Custom PDF Error ────────────────────────────────

export class PdfTextError extends Error {
  constructor(code, message) {
    super(message);

    this.name = 'PdfTextError';

    this.code = code;
  }
}


// ─── PDF Signature ───────────────────────────────────

const signatureOf = (note) =>
  crypto
    .createHash('sha1')
    .update(
      `${EXTRACTOR_VERSION}|${note.pdfUrl || ''}|${note.supabasePath || ''}`
    )
    .digest('hex');


// ─── Download PDF ────────────────────────────────────

const maxBytes = () =>
  (Number(process.env.AI_MAX_PDF_MB) || 30) *
  1024 *
  1024;


const readLimited = async (res) => {
  const declared =
    Number(res.headers.get('content-length')) || 0;

  if (declared > maxBytes()) {
    throw new PdfTextError(
      'PDF_TOO_LARGE',
      'PDF is too large for AI chat.'
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());

  if (buf.length > maxBytes()) {
    throw new PdfTextError(
      'PDF_TOO_LARGE',
      'PDF is too large for AI chat.'
    );
  }

  return buf;
};


const fetchPdfBuffer = async (note) => {

  // 1. Try ImageKit first

  if (
    note.pdfUrl &&
    /^https?:\/\//i.test(note.pdfUrl)
  ) {
    try {
      const res = await fetch(note.pdfUrl);

      if (res.ok) {
        return await readLimited(res);
      }

    } catch (err) {
      if (err instanceof PdfTextError) {
        throw err;
      }
    }
  }


  // 2. Supabase fallback

  if (isSupabaseConfigured()) {

    const sbPath =
      note.supabasePath ||
      mapImageKitUrlToSupabasePath(note.pdfUrl);

    if (sbPath) {
      try {
        const { buffer } = await downloadBuffer(sbPath);

        if (buffer.length > maxBytes()) {
          throw new PdfTextError(
            'PDF_TOO_LARGE',
            'PDF is too large for AI chat.'
          );
        }

        return buffer;

      } catch (err) {
        if (err instanceof PdfTextError) {
          throw err;
        }
      }
    }
  }

  throw new PdfTextError(
    'PDF_UNAVAILABLE',
    'Could not load the PDF from storage.'
  );
};


// ─── Normal PDF Text Extraction ──────────────────────

const extractPages = async (buffer) => {

  if (
    buffer.subarray(0, 5).toString('latin1') !== '%PDF-'
  ) {
    throw new PdfTextError(
      'NOT_A_PDF',
      'This resource is not a PDF.'
    );
  }

  let pdf;

  try {

    pdf = await getDocumentProxy(
      new Uint8Array(buffer)
    );

    const {
      totalPages,
      text,
    } = await extractText(pdf, {
      mergePages: false,
    });

    const pages = Array.isArray(text)
      ? text
      : [String(text || '')];

    return {
      pageCount: totalPages,
      pages: pages.slice(0, MAX_PAGES),
      truncated: totalPages > MAX_PAGES,
    };

  } catch (err) {

    if (err instanceof PdfTextError) {
      throw err;
    }

    throw new PdfTextError(
      'PARSE_FAILED',
      `Could not read the PDF text: ${
        err?.message || 'unknown error'
      }`
    );

  } finally {

    try {
      await pdf?.destroy();
    } catch {
      // Ignore cleanup errors
    }
  }
};


// ─── OCR + Storage ───────────────────────────────────

const extractAndStore = async (note, signature) => {

  const buffer = await fetchPdfBuffer(note);

  let {
    pageCount,
    pages,
    truncated,
  } = await extractPages(buffer);


  let totalText = pages.reduce(
    (n, p) => n + (p?.length || 0),
    0
  );


  // If normal extraction returns insufficient text,
  // use OCR to read scanned/image-based pages.

  if (totalText < MIN_TEXT_CHARS) {

    try {

      console.log(
        `[PDF OCR] Starting OCR for note ${note._id}`
      );

      const ocr = await ocrPdfPages(
        buffer,
        pageCount
      );

      pages = ocr.pages;

      pageCount = ocr.pageCount;

      truncated = truncated || ocr.truncated;

      totalText = pages.reduce(
        (n, p) => n + (p?.length || 0),
        0
      );

      console.log(
        `[PDF OCR] Completed OCR for note ${note._id}`
      );

    } catch (err) {

      console.error(
        '[PDF OCR] Failed:',
        err?.message || err
      );

      throw new PdfTextError(
        'PARSE_FAILED',
        `Could not OCR this scanned PDF: ${err?.message || 'unknown error'}`
      );
    }
  }


  // ─── Chunking ──────────────────────────────────────

  let chunks = [];

  let status = 'no_text';

  let wasTruncated = truncated;


  if (totalText >= MIN_TEXT_CHARS) {

    chunks = chunkPages(pages);

    status = 'ready';


    // Enforce MongoDB storage limit

    let running = 0;

    const kept = [];

    for (const c of chunks) {

      running += c.text.length;

      if (running > MAX_CHARS) {

        wasTruncated = true;

        break;
      }

      kept.push(c);
    }

    chunks = kept;
  }


  // ─── Save in MongoDB ───────────────────────────────

  const totalChars = chunks.reduce(
    (n, c) => n + c.text.length,
    0
  );


  await NoteText.findOneAndUpdate(

    {
      noteId: note._id,
    },

    {
      noteId: note._id,

      signature,

      status,

      pageCount,

      totalChars,

      truncated: wasTruncated,

      chunks: chunks.map((c) => ({
        p: c.page,
        t: c.text,
      })),
    },

    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );


  return {
    status,
    pageCount,
    truncated: wasTruncated,
    chunks,
  };
};


// ─── Cache Layers ────────────────────────────────────

const lru = new Map();

const inflight = new Map();


const lruGet = (key, signature) => {

  const hit = lru.get(key);

  if (!hit || hit.signature !== signature) {
    return null;
  }

  lru.delete(key);

  lru.set(key, hit);

  return hit.value;
};


const lruSet = (key, signature, value) => {

  lru.set(key, {
    signature,
    value,
  });

  while (lru.size > LRU_SIZE) {
    lru.delete(
      lru.keys().next().value
    );
  }
};


// ─── Build Retrieval Result ──────────────────────────

const toResult = ({
  status,
  pageCount,
  truncated,
  chunks,
}) => ({

  status,

  pageCount,

  truncated,

  index:
    status === 'ready'
      ? buildIndex(chunks)
      : null,
});


// ─── Main Function ───────────────────────────────────

/**
 * Returns a searchable index for a PDF note.
 *
 * @returns {Promise<{
 *   status: 'ready' | 'no_text',
 *   pageCount: number,
 *   truncated: boolean,
 *   index: object | null
 * }>}
 *
 * @throws {PdfTextError}
 */

export const getNoteIndex = async (note) => {

  const key = String(note._id);

  const signature = signatureOf(note);


  // Check in-memory cache

  const cached = lruGet(
    key,
    signature
  );

  if (cached) {
    return cached;
  }


  // Prevent duplicate simultaneous extraction

  if (inflight.has(`${key}:${signature}`)) {
    return inflight.get(`${key}:${signature}`);
  }


  const job = (async () => {

    // Check MongoDB cache

    const row = await NoteText
      .findOne({
        noteId: note._id,
      })
      .lean();


    let raw;


    if (
      row &&
      row.signature === signature
    ) {

      raw = {

        status: row.status,

        pageCount: row.pageCount,

        truncated: row.truncated,

        chunks: (row.chunks || []).map((c) => ({
          page: c.p,
          text: c.t,
        })),
      };

    } else {

      // Extract text or run OCR

      raw = await extractAndStore(
        note,
        signature
      );
    }


    const result = toResult(raw);

    lruSet(
      key,
      signature,
      result
    );

    return result;

  })();


  inflight.set(
    `${key}:${signature}`,
    job
  );


  try {

    return await job;

  } finally {

    inflight.delete(
      `${key}:${signature}`
    );
  }
};


// ─── Cache Invalidation ──────────────────────────────

/**
 * Drop cached text when a PDF is replaced or deleted.
 */

export const invalidateNoteText = async (noteId) => {

  lru.delete(
    String(noteId)
  );

  await NoteText
    .deleteOne({
      noteId,
    })
    .catch(() => {});
};


// Exposed for tests

export const __internals = {
  extractPages,
  signatureOf,
  lru,
};
