import express from 'express';
import transportController from '../controllers/transport.controller.js';
import { optionalAuth, requireAuth } from '../middleware/auth.middleware.js';
import validate from '../middleware/validate.middleware.js';
import { asyncHandler } from '../../utils/async.utils.js';
import { validateRouteQuote, validateTransportBooking, validateVehicleQuery } from '../validators/transport.validator.js';

const router = express.Router();

router.post('/routes/quote', optionalAuth, validate(validateRouteQuote), asyncHandler(transportController.quoteRoute.bind(transportController)));
router.get('/vehicles', optionalAuth, validate(validateVehicleQuery), asyncHandler(transportController.listVehicles.bind(transportController)));
router.get('/checkout-context', requireAuth, asyncHandler(transportController.checkoutContext.bind(transportController)));
router.post('/bookings', optionalAuth, validate(validateTransportBooking), asyncHandler(transportController.createBooking.bind(transportController)));

export default router;
