import express from 'express';
import chatController from '../controllers/chat.controller.js';
import validate from '../middleware/validate.middleware.js';
import asyncHandler from '../utils/asyncHandler.js';
import { validateChatBody } from '../validators/chat.validator.js';

const router = express.Router();

router.post('/', validate(validateChatBody), chatController.handleStreamChat.bind(chatController));
router.get('/:conversationId', asyncHandler(chatController.handleGetConversation.bind(chatController)));

export default router;
