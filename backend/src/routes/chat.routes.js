import { Router } from 'express';
import {
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
} from '../controllers/chat.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';

const router = Router();

router.use(protect);

router.post('/', validateBody({ message: { max: 8000 } }), chat);
router.post('/quick', validateBody({ message: { required: true, max: 8000 } }), quickChat);
router.post('/messages', validateBody({ content: { required: true, max: 8000 } }), sendMessage);
router.post('/gemini', geminiAdapter);

router.post('/sessions', validateBody({ title: { max: 80 } }), createConversation);
router.get('/sessions', listSessions);
router.get('/sessions/:id', getSession);
router.get('/sessions/:id/messages', listMessages);
router.post(
  '/sessions/:id/messages',
  validateBody({ content: { required: true, max: 8000 } }),
  sendMessageToSession
);
router.delete('/sessions/:id', deleteSession);

export default router;
