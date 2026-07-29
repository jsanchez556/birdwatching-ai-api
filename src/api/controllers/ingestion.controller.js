import documentIngestionService from '../../services/documentIngestion.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

class IngestionController {
  async handleCreateIngestion(req, res) {
    const result = await documentIngestionService.enqueueIngestion({
      body: req.body,
      documentUpload: req.documentUpload,
      userId: req.user?.id,
    });

    return sendSuccess(res, result, {}, 202);
  }

  async handleGetIngestion(req, res) {
    const result = await documentIngestionService.getIngestionStatus({
      jobId: req.params.id,
      userId: req.user?.id,
    });

    return sendSuccess(res, result);
  }
}

export default new IngestionController();
