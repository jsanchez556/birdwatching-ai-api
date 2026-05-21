import express from 'express';
import authRoutes from './auth.routes.js';
import chatRoutes from './chat.routes.js';
import healthRoutes from './health.routes.js';
import mediaRoutes from './media.routes.js';

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/chat', chatRoutes);
router.use(mediaRoutes);

export default router;
