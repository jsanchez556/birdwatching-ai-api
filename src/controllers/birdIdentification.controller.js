import birdIdentificationService from '../services/birdIdentification.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

class BirdIdentificationController {
  async handleIdentifyBird(req, res) {
    const debug = req.query?.debug === 'true' && req.user?.role === 'admin';
    const result = await birdIdentificationService.identifyFromInput({
      imageUrl: req.body.imageUrl,
      imageUpload: req.imageUpload,
      userId: req.user?.id,
      metadata: {
        clientIP: req.ip || req.connection.remoteAddress,
        parentTraceId: req.headers['x-ai-trace-id'],
        debug,
      },
    });

    const {
      promptVersions,
      model,
      providerRequestId,
      ragTrace,
      debug: debugPayload,
      ...identification
    } = result;

    return sendSuccess(res, identification, {
      promptVersions,
      model,
      ragTrace,
      ...(debug && debugPayload ? { debug: debugPayload } : {}),
    });
  }
}

export default new BirdIdentificationController();
