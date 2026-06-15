import jobStatusService from '../../services/jobStatus.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

class JobController {
  async handleGetJob(req, res) {
    const result = await jobStatusService.getJobStatus({
      jobId: req.params.id,
      userId: req.user?.id,
    });

    return sendSuccess(res, result);
  }
}

export default new JobController();
