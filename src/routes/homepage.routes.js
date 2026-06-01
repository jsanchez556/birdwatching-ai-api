import express from 'express';
import homepageController from '../controllers/homepage.controller.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

router.get('/homepage/hero', asyncHandler(homepageController.handleGetHero.bind(homepageController)));
router.get('/tours', asyncHandler(homepageController.handleGetTours.bind(homepageController)));
router.get('/birds/highlights', asyncHandler(homepageController.handleGetBirdHighlights.bind(homepageController)));
router.get('/addons/transportation', asyncHandler(homepageController.handleGetTransportation.bind(homepageController)));

export default router;
