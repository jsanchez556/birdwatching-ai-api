import express from 'express';
import checkReadiness from '../../services/dependencyHealth.service.js';

const router = express.Router();

function sendLiveness(req, res) {
  return res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      role: 'api',
      uptime: process.uptime(),
    },
    meta: {},
  });
}

router.get('/', sendLiveness);
router.get('/live', sendLiveness);

router.get('/ready', async (req, res) => {
  const result = await checkReadiness();
  return res.status(result.status === 'ok' ? 200 : 503).json({
    success: result.status === 'ok',
    data: {
      status: result.status,
      role: 'api',
      checks: result.checks,
    },
    meta: {},
  });
});

export default router;
