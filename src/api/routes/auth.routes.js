import express from 'express';
import authController from '../controllers/auth.controller.js';
import validate from '../middleware/validate.middleware.js';
import { asyncHandler } from '../../utils/async.utils.js';
import {
  validateLoginBody,
  validateLogoutBody,
  validateRefreshBody,
  validateSignupBody,
} from '../validators/auth.validators.js';

const router = express.Router();

router.post('/signup', validate(validateSignupBody), asyncHandler(authController.signup.bind(authController)));
router.post('/login', validate(validateLoginBody), asyncHandler(authController.login.bind(authController)));
router.post('/refresh', validate(validateRefreshBody), asyncHandler(authController.refresh.bind(authController)));
router.post('/logout', validate(validateLogoutBody), asyncHandler(authController.logout.bind(authController)));

export default router;
