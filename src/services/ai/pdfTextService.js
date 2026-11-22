/**
 * Gets a searchable index for a Note's PDF.
 *
 *   in-memory LRU  →  MongoDB (NoteText)  →  download + extract  (only on first use)
 *
 * The download uses the same strategy as the PDF viewer endpoint: ImageKit first, Supabase
 * Storage as the fallback.
 */

import crypto from 'crypto';
import { extractText, getDocumentProxy } from 'unpdf';
import NoteText from '../../models/NoteText.js';
import { downloadBuffer, isSupabaseConfigured, mapImageKitUrlToSupabasePath } from '../supabaseStorageService.js';
import { chunkPages, buildIndex } from './retrieval.js';

// Bump when chunking/extraction changes so cached rows are rebuilt.
const EXTRACTOR_VERSION = 'v1';

const MAX_PAGES = 600;
const MAX_CHARS = 3_000_000; // keeps the cached document far below Mongo's 16 MB limit
const MIN_TEXT_CHARS = 200; // below this the PDF is treated as scanned / image-only
const LRU_SIZE = 25;

export class PdfTextError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PdfTextError';
    this.code = code; // PDF_UNAVAILABLE | PDF_TOO_LARGE | NOT_A_PDF | PARSE_FAILED
  }
}

const signatureOf = (note) =>
  crypto
    .createHash('sha1')
    .update(`${EXTRACTOR_VERSION}|${note.pdfUrl || ''}|${note.supabasePath || ''}`)
    .digest('hex');

// ─── Download ────────────────────────────────────────

const maxBytes = () => (Number(process.env.AI_MAX_PDF_MB) || 30) * 1024 * 1024;

const readLimited = async (res) => {
  const declared = Number(res.headers.get('content-length')) || 0;
  if (declared > maxBytes()) throw new PdfTextError('PDF_TOO_LARGE', 'PDF is too large for AI chat.');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes()) throw new PdfTextError('PDF_TOO_LARGE', 'PDF is too large for AI chat.');
  return buf;
};

const fetchPdfBuffer = async (note) => {
  // 1. Primary (ImageKit)
  if (note.pdfUrl && /^https?:\/\//i.test(note.pdfUrl)) {
    try {
      const res = await fetch(note.pdfUrl);
      if (res.ok) return await readLimited(res);
    } catch (err) {
      if (err instanceof PdfTextError) throw err;
      // fall through to Supabase
    }
  }
  // 2. Fallback (Supabase Storage)
  if (isSupabaseConfigured()) {
    const sbPath = note.supabasePath || mapImageKitUrlToSupabasePath(note.pdfUrl);
    if (sbPath) {
      try {
        const { buffer } = await downloadBuffer(sbPath);
        if (buffer.length > maxBytes()) throw new PdfTextError('PDF_TOO_LARGE', 'PDF is too large for AI chat.');
        return buffer;
      } catch (err) {
        if (err instanceof PdfTextError) throw err;
      }
    }
  }
  throw new PdfTextError('PDF_UNAVAILABLE', 'Could not load the PDF from storage.');
};

// ─── Extraction ──────────────────────────────────────

const extractPages = async (buffer) => {
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new PdfTextError('NOT_A_PDF', 'This resource is not a PDF.');
  }
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [String(text || '')];
    return { pageCount: totalPages, pages: pages.slice(0, MAX_PAGES), truncated: totalPages > MAX_PAGES };
  } catch (err) {
    if (err instanceof PdfTextError) throw err;
    throw new PdfTextError('PARSE_FAILED', `Could not read the PDF text: ${err?.message || 'unknown error'}`);
  } finally {
    try {
      await pdf?.destroy();
    } catch {
      /* ignore */
    }
  }
};

const extractAndStore = async (note, signature) => {
  const buffer = await fetchPdfBuffer(note);
  const { pageCount, pages, truncated } = await extractPages(buffer);

  const totalText = pages.reduce((n, p) => n + (p?.length || 0), 0);
  let chunks = [];
  let status = 'no_text';
  let wasTruncated = truncated;

  if (totalText >= MIN_TEXT_CHARS) {
    chunks = chunkPages(pages);
    status = 'ready';
    // Enforce the char budget (only matters for enormous PDFs)
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

  const totalChars = chunks.reduce((n, c) => n + c.text.length, 0);
  await NoteText.findOneAndUpdate(
    { noteId: note._id },
    {
      noteId: note._id,
      signature,
      status,
      pageCount,
      totalChars,
      truncated: wasTruncated,
      chunks: chunks.map((c) => ({ p: c.page, t: c.text })),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { status, pageCount, truncated: wasTruncated, chunks };
};

// ─── Cache layers ────────────────────────────────────

const lru = new Map(); // noteId → { signature, value }
const inflight = new Map(); // noteId → Promise

const lruGet = (key, signature) => {
  const hit = lru.get(key);
  if (!hit || hit.signature !== signature) return null;
  lru.delete(key);
  lru.set(key, hit); // refresh recency
  return hit.value;
};
const lruSet = (key, signature, value) => {
  lru.set(key, { signature, value });
  while (lru.size > LRU_SIZE) lru.delete(lru.keys().next().value);
};

const toResult = ({ status, pageCount, truncated, chunks }) => ({
  status,
  pageCount,
  truncated,
  index: status === 'ready' ? buildIndex(chunks) : null,
});

/**
 * @returns {Promise<{status:'ready'|'no_text', pageCount:number, truncated:boolean, index:object|null}>}
 * @throws {PdfTextError}
 */
export const getNoteIndex = async (note) => {
  const key = String(note._id);
  const signature = signatureOf(note);

  const cached = lruGet(key, signature);
  if (cached) return cached;

  if (inflight.has(`${key}:${signature}`)) return inflight.get(`${key}:${signature}`);

  const job = (async () => {
    const row = await NoteText.findOne({ noteId: note._id }).lean();
    let raw;
    if (row && row.signature === signature) {
      raw = {
        status: row.status,
        pageCount: row.pageCount,
        truncated: row.truncated,
        chunks: (row.chunks || []).map((c) => ({ page: c.p, text: c.t })),
      };
    } else {
      raw = await extractAndStore(note, signature);
    }
    const result = toResult(raw);
    lruSet(key, signature, result);
    return result;
  })();

  inflight.set(`${key}:${signature}`, job);
  try {
    return await job;
  } finally {
    inflight.delete(`${key}:${signature}`);
  }
};

/** Drop cached text for a note (call after the PDF is replaced or the note deleted). */
export const invalidateNoteText = async (noteId) => {
  lru.delete(String(noteId));
  await NoteText.deleteOne({ noteId }).catch(() => {});
};

// Exposed for tests
export const __internals = { extractPages, signatureOf, lru };
