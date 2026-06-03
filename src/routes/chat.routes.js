import express from 'express';
import chatController from '../controllers/chat.controller.js';
import { optionalAuth, requireAuth } from '../middleware/auth.middleware.js';
import { aiRateLimit, visitorAiRateLimit } from '../middleware/rateLimit.middleware.js';
import validate from '../middleware/validate.middleware.js';
import asyncHandler from '../utils/asyncHandler.js';
import { validateChatBody } from '../validators/chat.validator.js';

const router = express.Router();
const roleAwareAiRateLimit = (req, res, next) => (
  req.user ? aiRateLimit(req, res, next) : visitorAiRateLimit(req, res, next)
);

router.post(
  '/',
  optionalAuth,
  roleAwareAiRateLimit,
  validate(validateChatBody),
  chatController.handleStreamChat.bind(chatController)
);
router.get('/latest', requireAuth, asyncHandler(chatController.handleGetLatestConversation.bind(chatController)));
router.get('/:conversationId', requireAuth, asyncHandler(chatController.handleGetConversation.bind(chatController)));

export default router;
