import express from 'express';
import chatController from '../controllers/chat.controller.js';
import { optionalAuth, requireAuth } from '../middleware/auth.middleware.js';
import { aiRateLimit, visitorAiRateLimit } from '../middleware/rateLimit.middleware.js';
import validate from '../middleware/validate.middleware.js';
import { asyncHandler } from '../../utils/async.utils.js';
import { validateChatBody } from '../validators/chat.validator.js';
import { validateChatQuota } from '../validators/usage.validator.js';
import { assignAiTrace } from '../middleware/aiTrace.middleware.js';

const router = express.Router();
const roleAwareAiRateLimit = (req, res, next) => (
  req.user ? aiRateLimit(req, res, next) : visitorAiRateLimit(req, res, next)
);

router.post(
  '/',
  optionalAuth,
  roleAwareAiRateLimit,
  validate(validateChatBody),
  validateChatQuota,
  assignAiTrace,
  chatController.handleStreamChat.bind(chatController)
);
router.get('/latest', requireAuth, asyncHandler(chatController.handleGetLatestConversation.bind(chatController)));
router.get('/:conversationId', requireAuth, asyncHandler(chatController.handleGetConversation.bind(chatController)));

export default router;
