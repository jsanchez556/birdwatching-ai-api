import { randomUUID } from 'crypto';

const AI_TRACE_HEADER = 'X-AI-Trace-Id';

function createAiTraceMiddleware({ idFactory = randomUUID } = {}) {
  return (req, res, next) => {
    const aiTraceId = idFactory();

    req.aiTraceId = aiTraceId;
    res.setHeader(AI_TRACE_HEADER, aiTraceId);
    next();
  };
}

const assignAiTrace = createAiTraceMiddleware();

export {
  AI_TRACE_HEADER,
  assignAiTrace,
  createAiTraceMiddleware,
};
