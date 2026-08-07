import express from 'express';
import myToursController from '../controllers/myTours.controller.js';
import { requireAuth, requireTourManager } from '../middleware/auth.middleware.js';
import validate from '../middleware/validate.middleware.js';
import { validateMyTour } from '../validators/adminMaintenance.validator.js';
import { asyncHandler } from '../../utils/async.utils.js';

const router = express.Router();

router.use(requireAuth, requireTourManager);
router.get('/references', asyncHandler(myToursController.references.bind(myToursController)));
router.get('/', asyncHandler(myToursController.list.bind(myToursController)));
router.post('/', validate(validateMyTour('create')), asyncHandler(myToursController.create.bind(myToursController)));
router.get('/:id', validate(validateMyTour('read')), asyncHandler(myToursController.getById.bind(myToursController)));
router.patch('/:id', validate(validateMyTour('update')), asyncHandler(myToursController.update.bind(myToursController)));

export default router;
