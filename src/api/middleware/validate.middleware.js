import HttpError from '../../utils/httpError.js';

export default function validate(validator) {
  return function validateRequest(req, res, next) {
    const result = validator(req);

    if (result.errors.length > 0) {
      return next(new HttpError(400, result.message, {
        code: 'VALIDATION_ERROR',
        details: result.errors,
      }));
    }

    req.body = {
      ...req.body,
      ...result.value,
    };

    return next();
  };
}
