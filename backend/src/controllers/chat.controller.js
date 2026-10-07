import mongoose from 'mongoose';
import ChatSession from '../models/ChatSession.js';
import * as chatService from '../services/chat.service.js';
import { generateContent, generateText } from '../services/gemini.service.js';
import { ApiError, sendSuccess, asyncHandler } from '../utils/response.js';

async function sessionPayload(session, { includeMessages = true } = {}) {
  const payload = {
    _id: session._id,
    title: session.title,
    messageCount: session.messageCount,
    lastMessageAt: session.lastMessageAt,
    createdAt: session.createdAt,
  };
  if (includeMessages) payload.messages = await chatService.getMessages(session._id);
  return payload;
}

/**
 * POST /api/chat
 * Convenience endpoint: { messages: [{role, content}] | message, conversationId? }
 *
 * When `conversationId` is supplied the history is loaded from the database,
 * and both the user message and the AI reply are persisted.
 */
export const chat = asyncHandler(async (req, res) => {
  const { messages, message, conversationId } = req.body || {};

  const lastUserMessage = Array.isArray(messages) && messages.length
    ? messages[messages.length - 1]?.content
    : message;

  let session = null;
  let history;

  if (conversationId) {
    session = await chatService.getOwnedSession(req.user._id, conversationId);
    if (String(lastUserMessage || '').trim()) {
      await chatService.appendUserMessage(req.user._id, lastUserMessage, session._id);
    }
    history = await chatService.getMessages(session._id);
    if (history.length === 0) history = [{ role: 'user', content: lastUserMessage }];
  } else {
    history = Array.isArray(messages) && messages.length
      ? messages
      : [{ role: 'user', content: message }];
  }

  const replyText = await chatService.reply(history, { userId: req.user._id });

  if (session) {
    await chatService.appendAssistantMessage(session, replyText);
  }

  return sendSuccess(res, {
    reply: replyText,
    conversationId: session ? session._id : undefined,
  });
});

/**
 * POST /api/chat/quick
 * One shot shortcut used by the chat page: { message, history? }
 */
export const quickChat = asyncHandler(async (req, res) => {
  const { message, history } = req.body || {};
  const replyText = await chatService.quickReply(message, history, { userId: req.user._id });
  return sendSuccess(res, { reply: replyText });
});

/**
 * POST /api/chat/messages
 * Persisted conversation turn: { content, conversationId? }
 * Uses the most recent conversation when none is given.
 */
export const sendMessage = asyncHandler(async (req, res) => {
  const session = await chatService.appendUserMessage(
    req.user._id,
    req.body?.content,
    req.body?.conversationId || null
  );

  const stored = await chatService.getMessages(session._id);
  const replyText = await chatService.reply(stored, { userId: req.user._id });
  await chatService.appendAssistantMessage(session, replyText);

  return sendSuccess(res, {
    reply: replyText,
    conversationId: session._id,
    session: await sessionPayload(session),
  });
});

/**
 * POST /api/chat/sessions
 * Create an empty conversation: { title? }
 */
export const createConversation = asyncHandler(async (req, res) => {
  const session = await chatService.createSession(req.user._id, req.body?.title);
  return sendSuccess(res, { session: await sessionPayload(session) }, 'Conversation created.', 201);
});

/**
 * GET /api/chat/sessions
 */
export const listSessions = asyncHandler(async (req, res) => {
  const sessions = await ChatSession.find({ userId: req.user._id })
    .sort('-lastMessageAt')
    .limit(30)
    .select('title messageCount lastMessageAt createdAt')
    .lean();

  return sendSuccess(res, { sessions });
});

/**
 * GET /api/chat/sessions/:id
 */
export const getSession = asyncHandler(async (req, res) => {
  const session = await chatService.getOwnedSession(req.user._id, req.params.id);
  return sendSuccess(res, { session: await sessionPayload(session) });
});

/**
 * GET /api/chat/sessions/:id/messages
 */
export const listMessages = asyncHandler(async (req, res) => {
  const session = await chatService.getOwnedSession(req.user._id, req.params.id);
  const messages = await chatService.getMessages(session._id);
  return sendSuccess(res, { messages });
});

/**
 * POST /api/chat/sessions/:id/messages
 * { content } → stores the user message, asks the model, stores the reply.
 */
export const sendMessageToSession = asyncHandler(async (req, res) => {
  const session = await chatService.appendUserMessage(
    req.user._id,
    req.body?.content,
    req.params.id
  );

  const stored = await chatService.getMessages(session._id);
  const replyText = await chatService.reply(stored, { userId: req.user._id });
  await chatService.appendAssistantMessage(session, replyText);

  return sendSuccess(
    res,
    {
      reply: replyText,
      message: {
        role: 'assistant',
        content: replyText,
        at: new Date(),
      },
      session: await sessionPayload(session),
    },
    'Message sent.'
  );
});

/**
 * DELETE /api/chat/sessions/:id
 */
export const deleteSession = asyncHandler(async (req, res) => {
  const session = await chatService.getOwnedSession(req.user._id, req.params.id);
  const { default: ChatMessage } = await import('../models/ChatMessage.js');
  await ChatMessage.deleteMany({ sessionId: session._id });
  await session.deleteOne();
  return sendSuccess(res, null, 'Conversation deleted.');
});

/**
 * POST /api/chat/gemini
 * Adapter used by the browser Gemini service: { contents, systemPrompt } → { text }
 */
export const geminiAdapter = asyncHandler(async (req, res) => {
  const { contents, systemPrompt } = req.body || {};

  if (!Array.isArray(contents) || contents.length === 0) {
    throw ApiError.badRequest('contents must be a non-empty array.');
  }

  const text = await generateContent({
    contents,
    ...(systemPrompt ? { systemInstruction: { parts: [{ text: String(systemPrompt) }] } } : {}),
    temperature: 0.7,
    maxOutputTokens: 2048,
  });

  return sendSuccess(res, { text });
});

/**
 * POST /api/gemini/text
 * Plain text helper: { prompt, systemInstruction? } → { text }
 */
export const geminiText = asyncHandler(async (req, res) => {
  const { prompt, systemInstruction } = req.body || {};
  if (!prompt || !String(prompt).trim()) throw ApiError.badRequest('prompt is required.');

  const text = await generateText(String(prompt), {
    systemInstruction: systemInstruction ? String(systemInstruction) : undefined,
  });

  return sendSuccess(res, { text });
});

export default {
  chat,
  quickChat,
  sendMessage,
  createConversation,
  listSessions,
  getSession,
  listMessages,
  sendMessageToSession,
  deleteSession,
  geminiAdapter,
  geminiText,
};
