import express from 'express';
import chatRoutes from './chat.routes.js';
import healthRoutes from './health.routes.js';
import recommendationRoutes from './recommendation.routes.js';

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/chat', chatRoutes);
router.use('/recommend', recommendationRoutes);

export default router;
