import express from 'express';
import authController from '../controllers/auth.controller.js';
import validate from '../middleware/validate.middleware.js';
import profileImageUpload from '../middleware/profileImageUpload.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/async.utils.js';
import {
  validateLoginBody,
  validateLogoutBody,
  validateProfileBody,
  validateRefreshBody,
  validateSignupBody,
} from '../validators/auth.validators.js';

const router = express.Router();

router.post('/signup', validate(validateSignupBody), asyncHandler(authController.signup.bind(authController)));
router.post('/login', validate(validateLoginBody), asyncHandler(authController.login.bind(authController)));
router.post('/refresh', validate(validateRefreshBody), asyncHandler(authController.refresh.bind(authController)));
router.post('/logout', validate(validateLogoutBody), asyncHandler(authController.logout.bind(authController)));
router.patch('/profile', requireAuth, validate(validateProfileBody), asyncHandler(authController.updateProfile.bind(authController)));
router.post('/profile-image', requireAuth, profileImageUpload, asyncHandler(authController.updateProfileImage.bind(authController)));

export default router;
