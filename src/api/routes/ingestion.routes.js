import express from 'express';
import ingestionController from '../controllers/ingestion.controller.js';
import documentUpload from '../middleware/documentUpload.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/async.utils.js';

const router = express.Router();

router.post(
  '/',
  requireAuth,
  documentUpload,
  asyncHandler(ingestionController.handleCreateIngestion.bind(ingestionController))
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(ingestionController.handleGetIngestion.bind(ingestionController))
);

export default router;
