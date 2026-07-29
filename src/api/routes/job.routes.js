import express from 'express';
import jobController from '../controllers/job.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/async.utils.js';

const router = express.Router();

router.get(
  '/:id',
  requireAuth,
  asyncHandler(jobController.handleGetJob.bind(jobController))
);

export default router;
