import mongoose from 'mongoose';
import env from '../config/env.js';
import Note from '../models/Note.js';
import AIUsageLog from '../models/AIUsageLog.js';
import { evaluateNoteAccess } from '../middleware/accessControl.js';
import { isMainSuperAdmin } from '../utils/superAdmin.js';
import { llm } from '../services/ai/aiClient.js';
import { AllProvidersFailedError } from '../services/ai/llmRouter.js';
import { getNoteIndex, PdfTextError } from '../services/ai/pdfTextService.js';
import { selectContext, formatExcerpts } from '../services/ai/retrieval.js';
import { buildSystemPrompt, NOT_IN_PDF_REPLY } from '../services/ai/pdfChatPrompt.js';

const MAX_QUESTION_CHARS = 1000;
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_CHARS = 700;
const DAY_MS = 24 * 60 * 60 * 1000;

const fail = (res, status, code, message, extra = {}) =>
  res.status(status).json({ success: false, code, message, ...extra });

// ─── Per-user short-window throttle (in memory, per instance) ──────────────
const recent = new Map(); // userId → timestamps (ms)
const throttled = (userId, limit) => {
  const now = Date.now();
  const list = (recent.get(userId) || []).filter((t) => now - t < 60_000);
  if (list.length >= limit) {
    recent.set(userId, list);
    return Math.ceil((60_000 - (now - list[0])) / 1000);
  }
  list.push(now);
  recent.set(userId, list);
  if (recent.size > 5000) {
    for (const [k, v] of recent) if (!v.some((t) => now - t < 60_000)) recent.delete(k);
  }
  return 0;
};

// ─── Input cleaning ────────────────────────────────

const cleanHistory = (raw) => {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const m of raw.slice(-MAX_HISTORY_MESSAGES)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') continue;
    const content = m.content.trim().slice(0, MAX_HISTORY_CHARS);
    if (!content) continue;
    // merge consecutive same-role turns (some APIs reject them)
    if (out.length && out[out.length - 1].role === m.role) {
      out[out.length - 1].content += `\n${content}`;
    } else {
      out.push({ role: m.role, content });
    }
  }
  while (out.length && out[0].role !== 'user') out.shift(); // must start with the student
  return out;
};

/** Loads the note and checks the user may read it. Sends the error response itself. */
const loadReadableNote = async (req, res, noteId) => {
  if (!noteId || !mongoose.isValidObjectId(noteId)) {
    fail(res, 400, 'BAD_REQUEST', 'A valid noteId is required.');
    return null;
  }
  const note = await Note.findById(noteId);
  if (!note || (!note.isPublished && req.user.role !== 'admin')) {
    fail(res, 404, 'NOT_FOUND', 'Document not found.');
    return null;
  }
  const access = await evaluateNoteAccess(req.user, note);
  if (!access.allowed) {
    fail(res, 403, access.code || 'ACCESS_DENIED', access.message || 'You do not have access to this document.');
    return null;
  }
  return note;
};

const sendPdfError = (res, err) => {
  if (!(err instanceof PdfTextError)) return false;
  const map = {
    PDF_TOO_LARGE: [413, 'This PDF is too large for AI chat.'],
    NOT_A_PDF: [422, 'AI chat only works with PDF documents.'],
    PDF_UNAVAILABLE: [502, 'Could not load this PDF right now. Please try again shortly.'],
    PARSE_FAILED: [422, 'Could not read the text of this PDF.'],
  };
  const [status, message] = map[err.code] || [500, 'Could not process this PDF.'];
  fail(res, status, err.code, message);
  return true;
};

const noTextPayload = (res) =>
  fail(
    res,
    422,
    'NO_TEXT_LAYER',
    'This PDF is a scan or handwritten notes with no readable text, so the AI assistant cannot answer questions about it.'
  );

// ─── GET /api/ai/pdf-chat/:noteId/status ───────────
// Called when the chat panel opens: warms the text cache and tells the UI if chat is possible.
export const getPdfChatStatus = async (req, res, next) => {
  try {
    if (!llm.isConfigured()) {
      return fail(res, 503, 'AI_NOT_CONFIGURED', 'The AI assistant is not available yet.');
    }
    const note = await loadReadableNote(req, res, req.params.noteId);
    if (!note) return;

    let doc;
    try {
      doc = await getNoteIndex(note);
    } catch (err) {
      if (sendPdfError(res, err)) return;
      throw err;
    }
    if (doc.status === 'no_text') return noTextPayload(res);

    return res.json({
      success: true,
      data: { ready: true, pageCount: doc.pageCount, truncated: doc.truncated },
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/ai/pdf-chat ─────────────────────────
export const chatWithPdf = async (req, res, next) => {
  const startedAt = Date.now();
  let note = null;
  try {
    const { noteId, message } = req.body || {};
    const question = typeof message === 'string' ? message.trim() : '';
    if (!question) return fail(res, 400, 'BAD_REQUEST', 'Please type a question.');
    if (question.length > MAX_QUESTION_CHARS) {
      return fail(res, 400, 'BAD_REQUEST', `Questions are limited to ${MAX_QUESTION_CHARS} characters.`);
    }
    if (!llm.isConfigured()) {
      return fail(res, 503, 'AI_NOT_CONFIGURED', 'The AI assistant is not available yet.');
    }

    note = await loadReadableNote(req, res, noteId);
    if (!note) return;

    // ── Usage limits (protect the shared free quota) ──
    const exempt = isMainSuperAdmin(req.user);
    let remainingToday = null;
    if (!exempt) {
      const wait = throttled(String(req.user._id), env.AI_PER_MINUTE_LIMIT);
      if (wait) {
        res.setHeader('Retry-After', wait);
        return fail(res, 429, 'AI_RATE_LIMIT', `You're asking too fast. Please wait ${wait}s and try again.`, {
          retryAfter: wait,
        });
      }
      const used = await AIUsageLog.countDocuments({
        userId: req.user._id,
        feature: 'pdf_chat',
        status: 'success',
        createdAt: { $gte: new Date(Date.now() - DAY_MS) },
      });
      if (used >= env.AI_DAILY_LIMIT_PER_USER) {
        return fail(
          res,
          429,
          'AI_DAILY_LIMIT',
          `You've reached today's limit of ${env.AI_DAILY_LIMIT_PER_USER} AI questions. It resets within 24 hours.`
        );
      }
      remainingToday = Math.max(0, env.AI_DAILY_LIMIT_PER_USER - used - 1);
    }

    // ── Get the PDF text ──
    let doc;
    try {
      doc = await getNoteIndex(note);
    } catch (err) {
      if (sendPdfError(res, err)) return;
      throw err;
    }
    if (doc.status === 'no_text') return noTextPayload(res);

    // ── Pick the relevant passages ──
    const history = cleanHistory(req.body?.history);
    const ctx = selectContext(doc.index, {
      question,
      history,
      maxChars: env.AI_CONTEXT_CHARS,
    });

    // Nothing in the PDF matches the question at all → answer without spending an API call.
    if (!ctx.hasMatch) {
      await logUsage(req, note, { status: 'blocked', provider: '', model: '', tokens: 0, question });
      return res.json({
        success: true,
        data: { reply: NOT_IN_PDF_REPLY, pages: [], noteId: String(note._id), remainingToday, offTopic: true },
      });
    }

    // ── Ask the model ──
    const system = buildSystemPrompt({
      title: note.title,
      subject: note.subject,
      excerpts: formatExcerpts(ctx.selected),
      mode: ctx.mode,
    });

    const result = await llm.generate({
      system,
      messages: [...history, { role: 'user', content: question }],
      maxTokens: 1500,
      temperature: 0.2,
    });

    await logUsage(req, note, {
      status: 'success',
      provider: result.provider,
      model: result.model,
      tokens: result.tokens || Math.ceil((system.length + question.length + result.text.length) / 4),
      question,
    });

    return res.json({
      success: true,
      data: {
        reply: result.text,
        pages: ctx.mode === 'full' ? [] : ctx.pages.slice(0, 6),
        noteId: String(note._id),
        remainingToday,
        provider: result.provider,
        model: result.model,
        ms: Date.now() - startedAt,
      },
    });
  } catch (error) {
    if (error instanceof AllProvidersFailedError) {
      if (note) await logUsage(req, note, { status: 'failed', provider: '', model: '', tokens: 0, question: req.body?.message || '' });
      if (error.notConfigured) {
        return fail(res, 503, 'AI_NOT_CONFIGURED', 'The AI assistant is not available yet.');
      }
      const retryAfter = Math.min(Math.max(Math.ceil(error.retryAfterMs / 1000), 15), 120);
      res.setHeader('Retry-After', retryAfter);
      return fail(res, 503, 'AI_BUSY', 'The AI assistant is busy right now. Please try again in a minute.', {
        retryAfter,
      });
    }
    next(error);
  }
};

const logUsage = async (req, note, { status, provider, model, tokens, question }) => {
  try {
    await AIUsageLog.create({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: req.user.name,
      feature: 'pdf_chat',
      promptSnippet: String(question).slice(0, 200),
      status,
      tokensUsed: tokens,
      provider,
      model,
      noteId: note._id,
      ip: req.ip || '',
    });
  } catch (err) {
    console.error('[AI] Failed to write usage log:', err.message);
  }
};
