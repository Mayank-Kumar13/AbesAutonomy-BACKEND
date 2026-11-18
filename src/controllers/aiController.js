import AIUsageLog from '../models/AIUsageLog.js';
import ApiResponse from '../utils/ApiResponse.js';

/**
 * POST /api/ai/assistant/chat
 * AI Study Assistant endpoint (Premium Only).
 */
export const chatAssistant = async (req, res, next) => {
  try {
    const { message, subject, context } = req.body;
    if (!message || message.trim() === '') {
      return ApiResponse.badRequest(res, 'Message is required.');
    }

    // Log the AI usage attempt
    const usageLog = await AIUsageLog.create({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: req.user.name,
      feature: 'ai_study_assistant',
      promptSnippet: message.slice(0, 200),
      status: 'success',
      tokensUsed: Math.ceil(message.length / 4) + 150,
      ip: req.ip || '',
    });

    // Academic study assistant structured response
    const reply = `Hello ${req.user.name || 'Student'}! I'm your ABES Autonomy AI Academic Assistant for ${subject || 'Engineering'}. 

Regarding your question: "${message}"

Here is a focused academic breakdown:
1. **Core Concept**: Understanding this principle is fundamental for your semester exam syllabus.
2. **Key Formulas / Points**: Review the high-yield formulas and standard definitions from your Unit notes.
3. **Exam Strategy**: Questions on this topic frequently appear in Section B and C of Previous Year Questions (PYQs). Be sure to check the free PYQ tab for pattern practice!

Let me know if you would like a step-by-step numerical breakdown or quick revision flashcard!`;

    return ApiResponse.success(res, {
      reply,
      feature: 'ai_study_assistant',
      logId: usageLog._id,
      tokensUsed: usageLog.tokensUsed,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/ai/summarize
 * AI Quick Summary of study topics (Premium Only).
 */
export const summarizeStudyMaterial = async (req, res, next) => {
  try {
    const { topic, subject } = req.body;
    if (!topic) {
      return ApiResponse.badRequest(res, 'Topic is required.');
    }

    await AIUsageLog.create({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: req.user.name,
      feature: 'ai_summarizer',
      promptSnippet: topic.slice(0, 200),
      status: 'success',
      tokensUsed: 250,
      ip: req.ip || '',
    });

    const summary = `**High-Yield Summary: ${topic} (${subject || 'General'})**

- **Definition**: Core engineering concept essential for semester end-term exams.
- **Crucial Points to Remember**:
  • Point 1: Direct application in theoretical derivations and practical lab viva.
  • Point 2: Pay attention to unit consistency and dimensional analysis.
  • Point 3: Frequently asked in 7-mark AKTU/Autonomous exam questions.
- **Recommended Revision**: Combine this summary with the official unit notes and practice the corresponding PYQ problems.`;

    return ApiResponse.success(res, { summary, topic, subject });
  } catch (error) {
    next(error);
  }
};
