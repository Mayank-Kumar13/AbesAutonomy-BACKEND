/**
 * Lightweight retrieval over a PDF's text — no embeddings, no extra API calls, no extra deps.
 *
 * Why not just send the whole PDF? Free-tier APIs have small tokens-per-minute budgets
 * (Groq's free tier is roughly 6–12k TPM). Sending only the few passages relevant to the
 * question keeps each request around 2–3k tokens, which is what lets many students share
 * a free quota — and it keeps answers grounded in the right pages.
 */

const STOPWORDS = new Set(
  (
    'a an the and or but if then else of in on at to for from by with about as is are was were be been being ' +
    'it its this that these those i you he she we they them his her our your their me my what which who whom ' +
    'when where why how can could should would will shall may might do does did done have has had not no yes ' +
    'so than too very just into out up down over under again also any all some such only own same both each ' +
    'few more most other pdf document page pages explain tell give please define describe write show'
  ).split(' ')
);

const stem = (w) => {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
};

export const tokenize = (text) => {
  const raw = String(text || '')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu);
  if (!raw) return [];
  const out = [];
  for (const w of raw) {
    if (STOPWORDS.has(w)) continue;
    // keep numbers of any length ("unit 3"), drop 1-letter words
    if (w.length < 2 && !/\d/.test(w)) continue;
    out.push(stem(w));
  }
  return out;
};

// ─── Chunking ────────────────────────────────────────

/**
 * Split per-page text into ~`size`-char chunks on sentence boundaries, each tagged with its page.
 * @param {string[]} pages  pages[i] is the text of page i+1
 * @returns {{page:number, text:string}[]}
 */
export const chunkPages = (pages, { size = 1000, hardMax = 1400 } = {}) => {
  const chunks = [];
  pages.forEach((raw, i) => {
    const page = i + 1;
    const text = String(raw || '')
      .replace(/\r/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '\u0000') // keep paragraph breaks
      .replace(/\n/g, ' ')
      .replace(/\u0000/g, '\n')
      .trim();
    if (text.length < 15) return;

    const sentences = text.split(/(?<=[.!?:])\s+|\n/).filter(Boolean);
    let buf = '';
    const flush = () => {
      const t = buf.trim();
      if (t.length >= 15) chunks.push({ page, text: t });
      buf = '';
    };
    for (let s of sentences) {
      while (s.length > hardMax) {
        // a giant "sentence" (tables, formula dumps) — hard split
        if (buf) flush();
        chunks.push({ page, text: s.slice(0, hardMax).trim() });
        s = s.slice(hardMax);
      }
      if (buf && buf.length + s.length + 1 > size) flush();
      buf += (buf ? ' ' : '') + s;
    }
    flush();
  });
  return chunks;
};

// ─── BM25 index ──────────────────────────────────────

export const buildIndex = (chunks) => {
  const tfs = [];
  const lens = [];
  const df = new Map();
  let totalChars = 0;

  chunks.forEach((c) => {
    totalChars += c.text.length;
    const tokens = tokenize(c.text);
    lens.push(tokens.length || 1);
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    tfs.push(tf);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  });

  const avgLen = lens.reduce((a, b) => a + b, 0) / (lens.length || 1);
  return { chunks, tfs, lens, df, avgLen, totalChars };
};

const K1 = 1.5;
const B = 0.75;

/** @returns {{idx:number, score:number}[]} sorted best-first, zero scores removed */
export const search = (index, query, topK = 8) => {
  const terms = [...new Set(tokenize(query))];
  const N = index.chunks.length;
  if (!terms.length || !N) return [];

  const scored = [];
  for (let i = 0; i < N; i++) {
    const tf = index.tfs[i];
    let score = 0;
    for (const term of terms) {
      const f = tf.get(term);
      if (!f) continue;
      const n = index.df.get(term) || 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += (idf * (f * (K1 + 1))) / (f + K1 * (1 - B + (B * index.lens[i]) / index.avgLen));
    }
    if (score > 0) scored.push({ idx: i, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
};

// ─── Context selection ───────────────────────────────

const SUMMARY_INTENT =
  /\b(summar(?:y|ize|ise)|overview|outline|key (?:points|takeaways|topics)|main (?:points|ideas|topics)|important topics|tl;?dr|gist|what(?:'s| is) (?:this|the) (?:pdf|document|chapter|unit|note|notes) (?:about|on)|what does this (?:pdf|document) (?:cover|contain)|table of contents|syllabus covered)\b/i;

export const isSummaryIntent = (text) => SUMMARY_INTENT.test(String(text || ''));

const pickSampled = (chunks, maxChars) => {
  // First two chunks (title / intro) + evenly spaced chunks through the rest.
  const picked = new Set([0, 1].filter((i) => i < chunks.length));
  let used = [...picked].reduce((a, i) => a + chunks[i].text.length, 0);
  const avg = chunks.reduce((a, c) => a + c.text.length, 0) / (chunks.length || 1);
  const slots = Math.max(1, Math.floor((maxChars - used) / (avg || 1)));
  const rest = chunks.length - picked.size;
  const step = rest / slots;
  for (let s = 0; s < slots && used < maxChars; s++) {
    const i = Math.min(chunks.length - 1, 2 + Math.floor(s * step));
    if (!picked.has(i) && used + chunks[i].text.length <= maxChars) {
      picked.add(i);
      used += chunks[i].text.length;
    }
  }
  return [...picked];
};

/**
 * Decide which passages go to the model.
 *
 * @returns {{
 *   mode: 'full'|'retrieved'|'sampled'|'none',
 *   selected: {page:number,text:string}[],
 *   pages: number[],
 *   hasMatch: boolean
 * }}
 */
export const selectContext = (index, { question, history = [], maxChars = 7000, topK = 8 }) => {
  const { chunks, totalChars } = index;

  if (totalChars <= maxChars) {
    return { mode: 'full', selected: chunks, pages: uniquePages(chunks), hasMatch: true };
  }

  if (isSummaryIntent(question)) {
    const picked = pickSampled(chunks, maxChars).sort((a, b) => a - b);
    const selected = picked.map((i) => chunks[i]);
    return { mode: 'sampled', selected, pages: uniquePages(selected), hasMatch: true };
  }

  // Short follow-ups ("explain more", "why?") carry little signal — borrow the previous question.
  let query = question;
  if (tokenize(question).length < 3) {
    const prevUser = [...history].reverse().find((m) => m.role === 'user');
    if (prevUser) query = `${prevUser.content} ${question}`;
  }

  const hits = search(index, query, topK);
  if (!hits.length) return { mode: 'none', selected: [], pages: [], hasMatch: false };

  const chosen = [];
  let used = 0;
  for (const h of hits) {
    const len = chunks[h.idx].text.length;
    if (used + len > maxChars && chosen.length) continue;
    chosen.push(h.idx);
    used += len;
  }
  chosen.sort((a, b) => a - b); // document order reads better than score order
  const selected = chosen.map((i) => chunks[i]);
  return { mode: 'retrieved', selected, pages: uniquePages(selected), hasMatch: true };
};

const uniquePages = (chunks) => [...new Set(chunks.map((c) => c.page))].sort((a, b) => a - b);

export const formatExcerpts = (selected) =>
  selected.map((c) => `[Page ${c.page}]\n${c.text}`).join('\n\n');
