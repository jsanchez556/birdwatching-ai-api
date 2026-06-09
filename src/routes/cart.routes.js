import express from 'express';
import cartController from '../controllers/cart.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import validate from '../middleware/validate.middleware.js';
import { asyncHandler } from '../utils/async.utils.js';
import {
  validateAddCartItemBody,
  validateCreateCartReservationsBody,
  validateUpdateCartItemBody,
} from '../validators/cart.validator.js';

const router = express.Router();

router.use(requireAuth);
router.get('/', asyncHandler(cartController.handleGetCart.bind(cartController)));
router.post('/items', validate(validateAddCartItemBody), asyncHandler(cartController.handleAddItem.bind(cartController)));
router.patch('/items/:itemId', validate(validateUpdateCartItemBody), asyncHandler(cartController.handleUpdateItem.bind(cartController)));
router.delete('/items/:itemId', asyncHandler(cartController.handleRemoveItem.bind(cartController)));
router.get('/reservations', asyncHandler(cartController.handleGetReservations.bind(cartController)));
router.post('/reservations', validate(validateCreateCartReservationsBody), asyncHandler(cartController.handleCreateReservations.bind(cartController)));

export default router;
