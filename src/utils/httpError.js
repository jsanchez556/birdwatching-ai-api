export default class HttpError extends Error {
  constructor(status, message, options = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = options.code || 'REQUEST_ERROR';
    this.details = options.details;
    this.meta = options.meta;
    this.expose = options.expose === true;
  }
}
