export function sendSuccess(res, data = {}, meta = {}, status = 200) {
  return res.status(status).json({
    success: true,
    data,
    meta,
  });
}

export function sendError(res, error, status = 500, meta = {}) {
  const response = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  };
  if (Object.keys(meta).length > 0) {
    response.data = null;
    response.meta = meta;
  }
  return res.status(status).json(response);
}
