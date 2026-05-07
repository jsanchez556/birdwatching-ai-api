import express from 'express';
import { sendSuccess } from '../utils/apiResponse.js';

const router = express.Router();

router.get('/', (req, res) => {
  return sendSuccess(res, {
    status: 'ok',
    uptime: process.uptime(),
  });
});

export default router;
