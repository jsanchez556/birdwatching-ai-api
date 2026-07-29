import birdIdentificationJobService from '../../services/birdIdentificationJob.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

class BirdIdentificationController {
  async handleIdentifyBird(req, res) {
    const debug = req.query?.debug === 'true' && req.user?.role === 'admin';
    const result = await birdIdentificationJobService.enqueueIdentification({
      imageUrl: req.body.imageUrl,
      imageUpload: req.imageUpload,
      userId: req.user?.id,
      metadata: {
        clientIP: req.ip || req.connection.remoteAddress,
        parentTraceId: req.headers['x-ai-trace-id'],
        aiTraceId: req.aiTraceId,
        usageEventId: req.usageQuota?.usageEventId,
        debug,
      },
    });

    return sendSuccess(res, result, {
      aiTraceId: req.aiTraceId,
    }, 202);
  }
}

export default new BirdIdentificationController();
