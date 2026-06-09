import express from 'express';
import authRoutes from './auth.routes.js';
import birdIdentificationRoutes from './birdIdentification.routes.js';
import cartRoutes from './cart.routes.js';
import chatRoutes from './chat.routes.js';
import healthRoutes from './health.routes.js';
import homepageRoutes from './homepage.routes.js';
import mediaRoutes from './media.routes.js';
import voiceChatRoutes from './voiceChat.routes.js';

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use(birdIdentificationRoutes);
router.use('/cart', cartRoutes);
router.use('/chat', chatRoutes);
router.use('/voice-chat', voiceChatRoutes);
router.use(homepageRoutes);
router.use(mediaRoutes);

export default router;
